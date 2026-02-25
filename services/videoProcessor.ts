
import { ProcessOptions } from '../types';
import { Muxer, ArrayBufferTarget } from 'mp4-muxer';

// WebCodecs Type Declarations
declare class VideoEncoder {
  constructor(init: { output: (chunk: any, meta: any) => void, error: (e: any) => void });
  state: string;
  configure(config: any): void;
  encode(frame: VideoFrame, options?: any): void;
  flush(): Promise<void>;
  close(): void;
}

declare class AudioEncoder {
  constructor(init: { output: (chunk: any, meta: any) => void, error: (e: any) => void });
  state: string;
  configure(config: any): void;
  encode(data: AudioData): void;
  flush(): Promise<void>;
  close(): void;
}

declare class VideoFrame {
  constructor(source: CanvasImageSource, init?: { timestamp: number });
  close(): void;
  timestamp: number;
}

declare class AudioData {
  constructor(init: any);
  copyTo(destination: any, options: { planeIndex: number }): void;
  close(): void;
  timestamp: number;
  duration: number;
  numberOfFrames: number;
  numberOfChannels: number;
  sampleRate: number;
  format: any;
  allocationSize(options: any): number;
}

export const processVideoWithThumbnail = async (
  videoFile: File,
  imageFile: File | null,
  options: ProcessOptions,
  onProgress: (progress: number) => void
): Promise<{ blob: Blob; extension: string }> => {
  return new Promise(async (resolve, reject) => {
    let videoElement: HTMLVideoElement | null = null;
    let audioCtx: AudioContext | null = null;
    let videoEncoder: VideoEncoder | null = null;
    let audioEncoder: AudioEncoder | null = null;
    let muxer: any = null;
    let cancelled = false;
    
    // Variables for cleanup need to be in this scope
    let videoUrl: string | null = null;
    let imageUrl: string | null = null;
    let audioReader: any = null;

    try {
      // 1. Check Browser Support
      if (typeof VideoEncoder === 'undefined' || typeof AudioEncoder === 'undefined') {
        throw new Error("Trình duyệt của bạn không hỗ trợ WebCodecs. Vui lòng dùng Chrome, Edge hoặc Safari bản mới nhất.");
      }

      // 2. Load Assets
      videoUrl = URL.createObjectURL(videoFile);
      if (imageFile) {
          imageUrl = URL.createObjectURL(imageFile);
      }

      videoElement = document.createElement('video');
      videoElement.src = videoUrl;
      videoElement.crossOrigin = 'anonymous';
      videoElement.muted = false; // Important: Must not be muted to capture audio
      videoElement.volume = 1.0;  
      videoElement.preload = 'auto';
      // Important hack: Attach to DOM (hidden) to ensure consistent audio scheduling in some browsers
      videoElement.style.display = 'none';
      document.body.appendChild(videoElement);

      let imageElement: HTMLImageElement | null = null;
      if (imageUrl) {
          imageElement = new Image();
          imageElement.src = imageUrl;
          imageElement.crossOrigin = 'anonymous';
      }

      const promises: Promise<any>[] = [
        new Promise((r, j) => { videoElement!.onloadedmetadata = r; videoElement!.onerror = j; })
      ];
      
      if (imageElement) {
          promises.push(new Promise((r, j) => { imageElement!.onload = r; imageElement!.onerror = j; }));
      }

      await Promise.all(promises);

      // 3. Trimming & Segmentation Logic
      const originalDuration = videoElement.duration;
      const startTimeOffset = options.trimStart || 0;

      // Handle default trimming logic and Safety Buffer
      let requestedEnd = (options.trimEnd > 0 && options.trimEnd <= originalDuration) 
                           ? options.trimEnd 
                           : originalDuration;
      
      // Subtract a small safety buffer (0.15s) from the end to prevent encoding lag at EOF
      if (requestedEnd > originalDuration - 0.2) {
          requestedEnd = Math.max(0, originalDuration - 0.2);
      }

      const endTimeLimit = requestedEnd;
      
      if (startTimeOffset >= endTimeLimit) {
         if (originalDuration < 0.5) throw new Error("Video quá ngắn để xử lý.");
         throw new Error(`Thời gian lỗi: Bắt đầu (${startTimeOffset}s) >= Kết thúc (${endTimeLimit.toFixed(2)}s). Vui lòng kiểm tra lại.`);
      }
      
      const totalDuration = endTimeLimit - startTimeOffset;

      // Define Segments
      let segments: { start: number; end: number }[] = [];
      if (options.enableAutoReorder) {
          // Split into ~3s chunks
          const chunkDuration = 3.0;
          let current = startTimeOffset;
          while (current < endTimeLimit) {
              const end = Math.min(current + chunkDuration, endTimeLimit);
              segments.push({ start: current, end });
              current = end;
          }
          
          // Simple Shuffle: Swap adjacent pairs (0-1, 2-3, etc.)
          // This breaks the hash but keeps some flow
          for (let i = 0; i < segments.length - 1; i += 2) {
              const temp = segments[i];
              segments[i] = segments[i+1];
              segments[i+1] = temp;
          }
      } else {
          segments = [{ start: startTimeOffset, end: endTimeLimit }];
      }

      // 4. Set Dimensions - FIXED 9:16 RESOLUTION (1080x1920)
      // This is the standard for Shopee Video / TikTok
      const width = 1080;
      const height = 1920;
      
      const fps = 30; 

      // 5. Init Muxer (MP4 Container)
      muxer = new Muxer({
        target: new ArrayBufferTarget(),
        video: {
          codec: 'avc', // H.264
          width: width,
          height: height
        },
        audio: {
          codec: 'aac',
          numberOfChannels: 2,
          sampleRate: 44100 
        },
        fastStart: 'in-memory',
        firstTimestampBehavior: 'offset' 
      });

      // 6. Init Video Encoder
      videoEncoder = new VideoEncoder({
        output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
        error: (e) => console.error("VideoEncoder Error", e)
      });

      videoEncoder.configure({
        codec: 'avc1.4d002a', // H.264 Main Profile Level 4.2
        width: width,
        height: height,
        // High quality bitrate for 1080p: ~10Mbps
        bitrate: 10_000_000, 
        framerate: fps
      });

      // 7. Init Audio Encoder
      audioEncoder = new AudioEncoder({
        output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
        error: (e) => console.error("AudioEncoder Error", e)
      });
      
      audioEncoder.configure({
        codec: 'mp4a.40.2', // AAC LC
        numberOfChannels: 2,
        sampleRate: 44100,
        bitrate: 128000
      });

      // 8. Prepare Canvas & Context
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true })!;

      // --- EFFECTS SETUP ---
      let noisePattern: CanvasPattern | null = null;
      if (options.filmGrainScore > 0) {
          const nCanvas = document.createElement('canvas');
          nCanvas.width = 256; nCanvas.height = 256;
          const nCtx = nCanvas.getContext('2d')!;
          const idata = nCtx.createImageData(256, 256);
          const buf = new Uint32Array(idata.data.buffer);
          for (let i = 0; i < buf.length; i++) {
             if (Math.random() < 0.5) {
                const a = Math.floor(Math.random() * 255 * options.filmGrainScore * 0.5);
                const g = Math.floor(Math.random() * 50);
                buf[i] = (a << 24) | (g << 16) | (g << 8) | g;
             }
          }
          nCtx.putImageData(idata, 0, 0);
          noisePattern = ctx.createPattern(nCanvas, 'repeat');
      }

      let vignetteGradient: CanvasGradient | null = null;
      if (options.enableVignette) {
          const r = Math.max(width, height) * 0.8;
          vignetteGradient = ctx.createRadialGradient(width/2, height/2, r * 0.4, width/2, height/2, r);
          vignetteGradient.addColorStop(0, 'rgba(0,0,0,0)');
          vignetteGradient.addColorStop(1, 'rgba(0,0,0,0.6)');
      }

      // 9. Prepare Audio Processing Pipeline
      audioCtx = new AudioContext({ sampleRate: 44100 });
      if (audioCtx.state === 'suspended') {
          await audioCtx.resume();
      }

      const source = audioCtx.createMediaElementSource(videoElement);
      const gainNode = audioCtx.createGain();
      gainNode.gain.value = options.volume; // Apply volume
      const destination = audioCtx.createMediaStreamDestination();
      source.connect(gainNode);
      gainNode.connect(destination);

      const audioTrack = destination.stream.getAudioTracks()[0];
      // @ts-ignore
      const trackProcessor = new MediaStreamTrackProcessor({ track: audioTrack });
      audioReader = trackProcessor.readable.getReader();

      // --- PROCESSING LOOP ---
      videoElement.playbackRate = options.speed || 1.0;
      
      // Global time tracking for the output video
      let outputTimestamp = 0; 
      let segmentIndex = 0;
      
      // Helper to process segments sequentially
      const processSegments = async () => {
          for (const segment of segments) {
              if (cancelled) break;
              
              // 1. Seek to segment start
              videoElement!.currentTime = segment.start;
              // Wait for seek to complete (simple delay usually enough for local blobs, but event is safer)
              await new Promise(r => {
                  const onSeeked = () => {
                      videoElement!.removeEventListener('seeked', onSeeked);
                      r(null);
                  };
                  videoElement!.addEventListener('seeked', onSeeked);
                  // Force seek event if already there? No, setting currentTime triggers it.
              });
              
              // 2. Play
              await videoElement!.play();
              
              // 3. Process Loop for this segment
              let segmentFinished = false;
              
              // We need a promise that resolves when this segment is done
              await new Promise<void>((resolveSegment) => {
                  
                  const segmentDuration = segment.end - segment.start;
                  // Track audio for this segment
                  const segmentAudioLoop = async () => {
                      while (!segmentFinished && !cancelled) {
                          const { value, done } = await audioReader.read();
                          if (done || cancelled) break;
                          
                          if (value) {
                              // Check if we are past segment end
                              if (videoElement!.currentTime >= segment.end) {
                                  value.close();
                                  break;
                              }
                              
                              // Rewrite Timestamp
                              // Original timestamp is relative to video start (e.g. 5s)
                              // We need it relative to outputTimestamp
                              // But AudioData timestamp is in microseconds
                              
                              // Calculate relative time in segment
                              const relativeTime = value.timestamp - (segment.start * 1_000_000);
                              
                              // New timestamp
                              const newTimestamp = outputTimestamp + relativeTime;
                              
                              // Copy Audio Data to new buffer
                              const size = value.allocationSize({planeIndex: 0});
                              const buffer = new Uint8Array(size);
                              value.copyTo(buffer, { planeIndex: 0 });
                              
                              // Create new AudioData with new timestamp
                              const newAudioData = new AudioData({
                                  format: value.format,
                                  sampleRate: value.sampleRate,
                                  numberOfFrames: value.numberOfFrames,
                                  numberOfChannels: value.numberOfChannels,
                                  timestamp: newTimestamp,
                                  data: buffer
                              });
                              
                              audioEncoder!.encode(newAudioData);
                              value.close();
                              newAudioData.close();
                          }
                      }
                  };
                  segmentAudioLoop().catch(console.error);

                  const drawFrame = () => {
                      if (cancelled || segmentFinished) return;
                      
                      const currentTime = videoElement!.currentTime;
                      
                      if (currentTime >= segment.end || videoElement!.ended) {
                          segmentFinished = true;
                          // Update output timestamp for next segment
                          // We use the actual duration processed
                          outputTimestamp += (segment.end - segment.start) * 1_000_000;
                          resolveSegment();
                          return;
                      }

                      // Background (Black bars)
                      ctx.fillStyle = '#000000';
                      ctx.fillRect(0, 0, width, height);

                      // Apply Filter to Context
                      let filterString = '';
                      switch (options.colorFilter) {
                          case 'bright': filterString += 'brightness(1.1) saturate(1.15) '; break;
                          case 'warm':   filterString += 'sepia(0.15) contrast(1.05) saturate(1.1) '; break;
                          case 'cool':   filterString += 'hue-rotate(10deg) contrast(0.95) saturate(0.9) '; break;
                          case 'contrast': filterString += 'contrast(1.3) saturate(1.2) '; break;
                          case 'vintage': filterString += 'sepia(0.4) contrast(1.1) brightness(0.9) '; break;
                      }
                      ctx.filter = filterString || 'none';

                      // Draw Video Frame (CENTERED & SCALED)
                      ctx.save();
                      if (options.flipHorizontal) {
                          ctx.translate(width, 0); ctx.scale(-1, 1);
                      }
                      
                      const videoAspect = videoElement!.videoWidth / videoElement!.videoHeight;
                      let drawWidth = width;
                      let drawHeight = width / videoAspect;
                      
                      const scaleMultiplier = 1 + options.zoomLevel;
                      drawWidth *= scaleMultiplier;
                      drawHeight *= scaleMultiplier;

                      const dx = (width - drawWidth) / 2;
                      const dy = (height - drawHeight) / 2;

                      ctx.drawImage(videoElement!, dx, dy, drawWidth, drawHeight);
                      ctx.restore();

                      // Draw Effects
                      if (options.enableMotionBlur) { ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(0, 0, width, height); }
                      if (options.filmGrainScore > 0 && noisePattern) {
                          ctx.save(); ctx.globalCompositeOperation = 'overlay'; ctx.fillStyle = noisePattern;
                          ctx.translate(Math.random()*100, Math.random()*100); 
                          ctx.fillRect(-100, -100, width+100, height+100); ctx.restore();
                      }
                      if (options.enableVignette && vignetteGradient) {
                          ctx.fillStyle = vignetteGradient; ctx.fillRect(0, 0, width, height);
                      }

                      // Draw Thumbnail Image (COVER/FRAME)
                      if (imageElement) {
                          ctx.filter = 'none';
                          ctx.drawImage(imageElement, 0, 0, width, height);
                      }

                      // Draw Text Overlay
                      if (options.textOverlay.enabled && options.textOverlay.text) {
                          const { text, position, backgroundColor, textColor, fontSize: customFontSize } = options.textOverlay;
                          
                          // Use custom font size if available, otherwise default to 48 (or calculated)
                          const fontSize = customFontSize || 48;
                          
                          ctx.font = `bold ${fontSize}px "Lora", serif`;
                          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                          
                          let tx = width/2, ty = height/2;
                          
                          // Adjust positions based on percentage (0-100)
                          // position is now a number
                          const pct = position as unknown as number;
                          ty = height * (pct / 100);
                          
                          // Draw Background Pill/Rect - "bỏ màu nền"
                          if (backgroundColor && backgroundColor !== 'transparent') {
                             const tm = ctx.measureText(text);
                             const paddingX = fontSize * 1.5;
                             const paddingY = fontSize * 1.0;
                             const bw = tm.width + paddingX; 
                             const bh = fontSize + paddingY;
                             
                             ctx.fillStyle = backgroundColor; 
                             ctx.beginPath();
                             ctx.roundRect(tx - bw/2, ty - bh/2, bw, bh, bh/2);
                             ctx.fill();
                          }
                          
                          // Draw Text
                          ctx.fillStyle = textColor; 
                          // Add stroke for visibility without background
                          ctx.lineWidth = fontSize * 0.1;
                          ctx.strokeStyle = 'black';
                          ctx.strokeText(text, tx, ty);
                          ctx.fillText(text, tx, ty);
                      }

                      // Encode Frame
                      // Calculate timestamp relative to output
                      const relativeTime = currentTime - segment.start;
                      const timestamp = outputTimestamp + (relativeTime * 1_000_000);
                      
                      const frame = new VideoFrame(canvas, { timestamp });
                      
                      const needsKeyFrame = (timestamp % 2000000) < 100000; // Keyframe every ~2s
                      videoEncoder!.encode(frame, { keyFrame: needsKeyFrame });
                      frame.close();

                      // Update Progress
                      // Approximate progress based on segment index
                      const progressPerSegment = 100 / segments.length;
                      const currentSegmentProgress = (relativeTime / (segment.end - segment.start)) * progressPerSegment;
                      const totalProgress = (segmentIndex * progressPerSegment) + currentSegmentProgress;
                      onProgress(Math.min(totalProgress, 99));

                      if (!cancelled && !segmentFinished) {
                         if ('requestVideoFrameCallback' in videoElement!) {
                             videoElement!.requestVideoFrameCallback(drawFrame);
                         } else {
                             requestAnimationFrame(drawFrame);
                         }
                      }
                  };
                  
                  if ('requestVideoFrameCallback' in videoElement!) {
                      videoElement!.requestVideoFrameCallback(drawFrame);
                  } else {
                      requestAnimationFrame(drawFrame);
                  }
              });
              
              videoElement!.pause();
              segmentIndex++;
          }
          
          finishProcessing();
      };

      processSegments();

      const finishProcessing = async () => {
          if (cancelled) return;
          cancelled = true;
          
          videoElement?.pause();
          
          await videoEncoder?.flush();
          await audioEncoder?.flush();
          await muxer.finalize();

          const { buffer } = muxer.target; 
          const blob = new Blob([buffer], { type: 'video/mp4' });
          
          cleanup();
          resolve({ blob, extension: 'mp4' });
      };

    } catch (e: any) {
      console.error(e);
      cleanup();
      reject(new Error("Lỗi xử lý video: " + e.message));
    }

    function cleanup() {
      cancelled = true;
      if (videoUrl) URL.revokeObjectURL(videoUrl);
      if (imageUrl) URL.revokeObjectURL(imageUrl);
      if (videoElement) { 
          videoElement.pause(); 
          videoElement.src = ""; 
          videoElement.remove(); 
      }
      if (audioReader) audioReader.cancel();
      if (audioCtx && audioCtx.state !== 'closed') audioCtx.close();
      if (videoEncoder && videoEncoder.state !== 'closed') videoEncoder.close();
      if (audioEncoder && audioEncoder.state !== 'closed') audioEncoder.close();
    }
  });
};
