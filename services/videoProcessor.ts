
import { ProcessOptions } from '../types';

export const processVideoWithThumbnail = async (
  videoFile: File,
  imageFile: File,
  options: ProcessOptions,
  onProgress: (progress: number) => void
): Promise<{ blob: Blob; extension: string }> => {
  return new Promise(async (resolve, reject) => {
    try {
      // 1. Load Assets
      const videoUrl = URL.createObjectURL(videoFile);
      const imageUrl = URL.createObjectURL(imageFile);

      const videoElement = document.createElement('video');
      videoElement.src = videoUrl;
      videoElement.crossOrigin = 'anonymous';
      
      // Basic Audio/Video settings
      videoElement.muted = false; 
      videoElement.volume = Math.min(Math.max(options.volume, 0), 1); 
      videoElement.playbackRate = options.speed || 1.0;
      videoElement.preload = 'auto';

      const imageElement = new Image();
      imageElement.src = imageUrl;
      imageElement.crossOrigin = 'anonymous';

      // Wait for metadata and image load
      await Promise.all([
        new Promise((r, j) => {
           videoElement.onloadedmetadata = r;
           videoElement.onerror = j;
        }),
        new Promise((r, j) => {
           imageElement.onload = r;
           imageElement.onerror = j;
        }),
      ]);

      const originalDuration = videoElement.duration;
      // Handle Trimming Logic
      const startTimeOffset = options.trimStart || 0;
      const endTimeLimit = (options.trimEnd > 0 && options.trimEnd < originalDuration) 
                           ? options.trimEnd 
                           : originalDuration;
      
      // Validate trim
      if (startTimeOffset >= endTimeLimit) {
        throw new Error("Thời gian bắt đầu cắt phải nhỏ hơn thời gian kết thúc.");
      }
      
      // Set initial time
      videoElement.currentTime = startTimeOffset;

      const width = videoElement.videoWidth;
      const height = videoElement.videoHeight;
      const fps = 30; // Standardize output FPS

      // 2. Setup Canvas
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d', { alpha: false }); // Optimize for no transparency

      if (!ctx) {
        throw new Error('Could not get 2D context');
      }

      // --- PRE-RENDER FILM GRAIN ---
      let noisePattern: CanvasPattern | null = null;
      if (options.filmGrainScore > 0) {
          const noiseCanvas = document.createElement('canvas');
          const noiseSize = 256; 
          noiseCanvas.width = noiseSize;
          noiseCanvas.height = noiseSize;
          const noiseCtx = noiseCanvas.getContext('2d');
          if (noiseCtx) {
              const idata = noiseCtx.createImageData(noiseSize, noiseSize);
              const buffer32 = new Uint32Array(idata.data.buffer);
              const len = buffer32.length;
              for (let i = 0; i < len; i++) {
                  if (Math.random() < 0.5) {
                      const alpha = Math.floor(Math.random() * 255 * options.filmGrainScore * 0.5);
                      const gray = Math.floor(Math.random() * 50); 
                      buffer32[i] = (alpha << 24) | (gray << 16) | (gray << 8) | gray;
                  }
              }
              noiseCtx.putImageData(idata, 0, 0);
              noisePattern = ctx.createPattern(noiseCanvas, 'repeat');
          }
      }

      // --- PRE-CALC VIGNETTE ---
      let vignetteGradient: CanvasGradient | null = null;
      if (options.enableVignette) {
          const radius = Math.max(width, height) * 0.8;
          vignetteGradient = ctx.createRadialGradient(width/2, height/2, radius * 0.4, width/2, height/2, radius);
          vignetteGradient.addColorStop(0, 'rgba(0,0,0,0)');
          vignetteGradient.addColorStop(1, 'rgba(0,0,0,0.6)');
      }

      // 3. Setup Audio
      const audioCtx = new AudioContext();
      const dest = audioCtx.createMediaStreamDestination();
      const sourceNode = audioCtx.createMediaElementSource(videoElement);
      const gainNode = audioCtx.createGain();
      gainNode.gain.value = options.volume; 
      sourceNode.connect(gainNode);
      gainNode.connect(dest);

      // 4. Setup Recorder
      const canvasStream = canvas.captureStream(fps);
      const combinedTracks = [
        ...canvasStream.getVideoTracks(),
        ...dest.stream.getAudioTracks(),
      ];
      const combinedStream = new MediaStream(combinedTracks);

      // PRIORITY: WEBM (Most stable for Browser Recording)
      // Shopee Video supports WebM upload directly.
      const mimeTypes = [
        'video/webm;codecs=h264,opus', // Chrome best quality
        'video/webm;codecs=vp9,opus',  // High compression
        'video/webm',                  // Standard
        'video/mp4'                    // Fallback (Safari)
      ];

      let selectedMimeType = ''; 
      for (const type of mimeTypes) {
        if (MediaRecorder.isTypeSupported(type)) {
          selectedMimeType = type;
          break;
        }
      }
      
      if (!selectedMimeType) selectedMimeType = 'video/webm';
      
      // Determine correct extension based on MIME
      const isMp4 = selectedMimeType.includes('mp4');
      const extension = isMp4 ? 'mp4' : 'webm';

      // High bitrate for quality
      const bitrate = (width * height > 921600) ? 8000000 : 4000000;

      const mediaRecorder = new MediaRecorder(combinedStream, {
        mimeType: selectedMimeType,
        videoBitsPerSecond: bitrate
      });

      const chunks: Blob[] = [];
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: selectedMimeType });
        URL.revokeObjectURL(videoUrl);
        URL.revokeObjectURL(imageUrl);
        audioCtx.close();
        
        // Return both blob and the correct extension
        resolve({ blob, extension });
      };

      mediaRecorder.start();

      // --- DRAWING LOGIC ---
      const applyFilters = () => {
         let filterString = '';
         switch (options.colorFilter) {
             case 'bright': filterString += 'brightness(1.1) saturate(1.15) '; break;
             case 'warm':   filterString += 'sepia(0.15) contrast(1.05) saturate(1.1) '; break;
             case 'cool':   filterString += 'hue-rotate(10deg) contrast(0.95) saturate(0.9) '; break;
             case 'contrast': filterString += 'contrast(1.3) saturate(1.2) '; break;
             case 'vintage': filterString += 'sepia(0.4) contrast(1.1) brightness(0.9) '; break;
             default: break;
         }
         ctx.filter = filterString.trim() || 'none';
      };

      const drawTextOverlay = () => {
         if (!options.textOverlay.enabled || !options.textOverlay.text) return;
         const { text, position, backgroundColor, textColor } = options.textOverlay;
         const fontSize = height * 0.05; 
         ctx.font = `bold ${fontSize}px "Inter", sans-serif`;
         ctx.textAlign = 'center';
         ctx.textBaseline = 'middle';
         const textMetrics = ctx.measureText(text);
         const boxWidth = textMetrics.width + (fontSize * 1.0);
         const boxHeight = fontSize * 1.8;
         let x = width / 2;
         let y = height / 2;
         if (position === 'top') y = height * 0.15;
         if (position === 'bottom') y = height * 0.85; 
         ctx.fillStyle = backgroundColor;
         ctx.fillRect(x - boxWidth/2, y - boxHeight/2, boxWidth, boxHeight);
         ctx.fillStyle = textColor;
         ctx.fillText(text, x, y);
      };

      const drawVideoFrame = () => {
          ctx.save();
          applyFilters();

          if (options.flipHorizontal) {
              ctx.translate(width, 0);
              ctx.scale(-1, 1);
          }

          const zoom = options.zoomLevel || 0;

          if (zoom > 0) {
              // POSITIVE ZOOM (Zoom In - Crop)
              const sx = width * zoom / 2;
              const sy = height * zoom / 2;
              const sWidth = width * (1 - zoom);
              const sHeight = height * (1 - zoom);
              ctx.drawImage(videoElement, sx, sy, sWidth, sHeight, 0, 0, width, height);
          } else {
              // NEGATIVE ZOOM (Zoom Out - Shrink)
              const scale = 1 + zoom; 
              const dWidth = width * scale;
              const dHeight = height * scale;
              const dx = (width - dWidth) / 2; // Center X
              const dy = (height - dHeight) / 2; // Center Y

              // Draw video smaller inside the canvas
              ctx.drawImage(videoElement, 0, 0, width, height, dx, dy, dWidth, dHeight);
          }

          ctx.restore();
      };

      let startTime: number | null = null;
      try { await videoElement.play(); } catch (e) { console.error("Auto-play failed", e); }

      const loop = async (timestamp: number) => {
        if (!startTime) startTime = timestamp;
        
        if (videoElement.currentTime >= endTimeLimit || videoElement.ended) {
          mediaRecorder.stop();
          onProgress(100);
          return;
        }

        if (options.enableMotionBlur) {
            ctx.fillStyle = 'rgba(0,0,0,0.3)'; 
            ctx.fillRect(0, 0, width, height);
        } else {
            ctx.fillStyle = '#000000'; // Black background for Negative Zoom
            ctx.fillRect(0, 0, width, height);
        }

        drawVideoFrame();

        if (options.filmGrainScore > 0 && noisePattern) {
            ctx.save();
            ctx.globalCompositeOperation = 'overlay';
            ctx.fillStyle = noisePattern;
            const shiftX = Math.floor(Math.random() * 100);
            const shiftY = Math.floor(Math.random() * 100);
            ctx.translate(shiftX, shiftY);
            ctx.fillRect(-shiftX, -shiftY, width + shiftX, height + shiftY);
            ctx.restore();
        }

        if (options.enableVignette && vignetteGradient) {
            ctx.save();
            ctx.fillStyle = vignetteGradient;
            ctx.fillRect(0, 0, width, height);
            ctx.restore();
        }

        ctx.save();
        ctx.filter = 'none';
        ctx.setTransform(1, 0, 0, 1, 0, 0); 
        const imgRatio = imageElement.width / imageElement.height;
        const renderW = width;
        const renderH = width / imgRatio;
        const renderY = (height - renderH) / 2;
        ctx.drawImage(imageElement, 0, renderY, renderW, renderH);
        ctx.restore();

        ctx.save();
        ctx.filter = 'none';
        ctx.setTransform(1, 0, 0, 1, 0, 0); 
        drawTextOverlay();
        ctx.restore();
        
        const currentPlayTime = (videoElement.currentTime - startTimeOffset);
        const totalPlayTime = (endTimeLimit - startTimeOffset);
        const videoProgress = (currentPlayTime / totalPlayTime) * 100;
        onProgress(Math.min(videoProgress, 99.9));

        requestAnimationFrame(loop);
      };

      requestAnimationFrame(loop);

    } catch (error) {
      reject(error);
    }
  });
};
