
import React, { useState, useEffect, useRef } from 'react';
import { Header } from './components/Header';
import { FileUpload } from './components/FileUpload';
import { processVideoWithThumbnail } from './services/videoProcessor';
import { generateShopeeCaption } from './services/aiService';
import { VideoItem, ImageState, ProcessingStatus, ProcessOptions } from './types';
import { Play, Download, Loader2, Sparkles, AlertCircle, CheckCircle2, Link as LinkIcon, FileVideo, Search, Info, Trash2, Plus, XCircle, Copy, Wand2, Eye, RefreshCw, Sliders, Volume2, Maximize, FlipHorizontal, Zap, Palette, Scissors, Type, LayoutTemplate, ZoomIn, Aperture, Hash } from 'lucide-react';

const App: React.FC = () => {
  // State for list of videos
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);

  const [image, setImage] = useState<ImageState>({ file: null, url: null });
  
  // Input states
  const [videoLinkInput, setVideoLinkInput] = useState('');
  const [isAddingLinks, setIsAddingLinks] = useState(false);
  const [isProcessingBatch, setIsProcessingBatch] = useState(false);

  // --- ADVANCED CONFIG STATE ---
  const [config, setConfig] = useState<ProcessOptions>({
    maintainAspectRatio: true,
    // Anti-detection Defaults
    zoomLevel: 0.12, 
    flipHorizontal: false,
    speed: 1.05, 
    volume: 1.0, 
    colorFilter: 'bright',
    enableMotionBlur: false,
    // Visual Effects
    filmGrainScore: 0.15, // Default subtle noise
    enableVignette: false,
    // Pro Features
    trimStart: 0,
    trimEnd: 0, // 0 = auto end
    textOverlay: {
      enabled: false,
      text: 'MUA NGAY 👇',
      position: 'bottom',
      backgroundColor: '#ffffffcc',
      textColor: '#ee4d2d'
    }
  });

  // Helper to update text overlay config specifically
  const updateTextOverlay = (updates: Partial<typeof config.textOverlay>) => {
    setConfig(prev => ({
      ...prev,
      textOverlay: { ...prev.textOverlay, ...updates }
    }));
  };

  // Select the first video automatically when added if none selected
  useEffect(() => {
    if (videos.length > 0 && !selectedVideoId) {
      setSelectedVideoId(videos[0].id);
    }
  }, [videos, selectedVideoId]);

  // Load duration when video loaded to help trim slider
  useEffect(() => {
    const vid = videos.find(v => v.id === selectedVideoId);
    if (vid?.file && !vid.duration) {
      const videoEl = document.createElement('video');
      videoEl.src = URL.createObjectURL(vid.file);
      videoEl.onloadedmetadata = () => {
         setVideos(prev => prev.map(v => v.id === vid.id ? { ...v, duration: videoEl.duration } : v));
         if (config.trimEnd === 0) setConfig(c => ({...c, trimEnd: videoEl.duration }));
      };
    }
  }, [selectedVideoId, videos]);

  // --- LOGIC: Fetch Video & Title ---
  const extractVideoUrlFromHtml = (html: string): string | null => {
    try {
        let cleanHtml = html.replace(/\\/g, ''); 
        try {
            cleanHtml = decodeURIComponent(cleanHtml);
        } catch (e) { }

        const shopeeVideoRegex = /(https?:\/\/[a-z0-9.-]*cv\.shopee\.vn\/[^"'\s<>]+\.mp4)/gi;
        let match = shopeeVideoRegex.exec(cleanHtml);
        if (match && match[1]) return match[1];

        const genericMp4Regex = /(https?:\/\/[^"'\s<>]+\.mp4)/gi;
        const matches = cleanHtml.match(genericMp4Regex);
        if (matches && matches.length > 0) {
            const shopeeMatch = matches.find(m => m.includes('cv.shopee') || m.includes('shopee'));
            return shopeeMatch || matches[0];
        }
    } catch (e) {
        console.error("Error parsing HTML for video", e);
    }
    return null;
  };

  const extractProductTitleFromHtml = (html: string): string | null => {
    const ogTitleMatch = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i);
    if (ogTitleMatch && ogTitleMatch[1]) return ogTitleMatch[1];
    
    const titleTagMatch = html.match(/<title>([^<]+)<\/title>/i);
    if (titleTagMatch && titleTagMatch[1]) return titleTagMatch[1].replace(' | Shopee Việt Nam', '');

    return null;
  };

  const triggerAutoCaption = async (id: string, file: File, productName?: string) => {
    setVideos(prev => prev.map(v => v.id === id ? { ...v, isGeneratingCaption: true, generatedCaption: '' } : v));
    const caption = await generateShopeeCaption(file, productName);
    setVideos(prev => prev.map(v => v.id === id ? { ...v, isGeneratingCaption: false, generatedCaption: caption } : v));
  };

  const fetchSingleShopeeVideo = async (url: string, videoId: string) => {
    const proxies = [
      { url: (u: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`, type: 'scrape' },
      { url: (u: string) => `https://corsproxy.io/?${encodeURIComponent(u)}`, type: 'scrape' },
      { url: (u: string) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`, type: 'scrape' },
    ];

    let foundVideoBlob: Blob | null = null;
    let finalVideoUrl: string | null = null;
    let extractedTitle: string | null = null;

    try {
      setVideos(prev => prev.map(v => v.id === videoId ? { ...v, status: 'fetching' } : v));

      for (const proxy of proxies) {
        try {
          const response = await fetch(proxy.url(url));
          if (!response.ok) continue;

          const contentType = response.headers.get('content-type') || '';
          if (contentType.includes('video') || contentType.includes('octet-stream')) {
             foundVideoBlob = await response.blob();
             break; 
          }

          const htmlText = await response.text();
          if (!extractedTitle) extractedTitle = extractProductTitleFromHtml(htmlText);
          const extractedUrl = extractVideoUrlFromHtml(htmlText);
          if (extractedUrl) {
            finalVideoUrl = extractedUrl;
            break; 
          }
        } catch (e) { continue; }
      }

      if (!finalVideoUrl && !foundVideoBlob) throw new Error('Không tìm thấy video.');

      if (finalVideoUrl && !foundVideoBlob) {
        let downloadSuccess = false;
        for (const proxy of proxies) {
            try {
                const vidRes = await fetch(proxy.url(finalVideoUrl));
                if (vidRes.ok) {
                    foundVideoBlob = await vidRes.blob();
                    downloadSuccess = true;
                    break;
                }
            } catch (e) { console.warn('Video download proxy failed', e); }
        }
        if (!downloadSuccess) throw new Error('Lỗi tải video (CORS).');
      }

      if (!foundVideoBlob || foundVideoBlob.size < 1000) throw new Error('File lỗi/quá nhỏ.');

      const file = new File([foundVideoBlob], "shopee-video.mp4", { type: 'video/mp4' });
      
      setVideos(prev => prev.map(v => v.id === videoId ? { 
        ...v, 
        file, 
        originalUrl: URL.createObjectURL(file), 
        status: 'idle',
        progress: 0,
        name: extractedTitle || v.name, 
        productTitle: extractedTitle || undefined
      } : v));

      triggerAutoCaption(videoId, file, extractedTitle || undefined);

    } catch (err: any) {
      setVideos(prev => prev.map(v => v.id === videoId ? { 
        ...v, 
        status: 'error', 
        errorMsg: err.message || 'Lỗi tải video' 
      } : v));
    }
  };

  const handleAddLinks = async () => {
    if (!videoLinkInput.trim()) return;
    setIsAddingLinks(true);
    
    const urls = videoLinkInput.split(/[\n\s]+/).filter(u => u.trim().length > 0);
    
    const newItems: VideoItem[] = urls.map(url => ({
      id: Math.random().toString(36).substr(2, 9),
      file: null,
      originalUrl: url,
      sourceType: 'url',
      status: 'queued', 
      progress: 0,
      resultUrl: null,
      name: `Link: ...${url.slice(-15)}`
    }));

    setVideos(prev => [...prev, ...newItems]);
    setVideoLinkInput('');

    for (const item of newItems) {
      await fetchSingleShopeeVideo(item.originalUrl!, item.id);
    }
    
    setIsAddingLinks(false);
  };

  const handleVideoFilesSelect = (files: File[]) => {
    const newItems: VideoItem[] = files.map(file => ({
      id: Math.random().toString(36).substr(2, 9),
      file: file,
      originalUrl: URL.createObjectURL(file),
      sourceType: 'file',
      status: 'idle',
      progress: 0,
      resultUrl: null,
      name: file.name,
      productTitle: file.name.split('.')[0]
    }));
    setVideos(prev => [...prev, ...newItems]);

    newItems.forEach(item => {
        if(item.file) triggerAutoCaption(item.id, item.file, item.productTitle);
    });
  };

  const handleImageSelect = (files: File[]) => {
    if (files.length > 0) {
      const file = files[0];
      setImage({ file, url: URL.createObjectURL(file) });
    }
  };

  const removeVideo = (id: string) => {
    setVideos(prev => {
      const newVideos = prev.filter(v => v.id !== id);
      if (selectedVideoId === id) {
        setSelectedVideoId(newVideos.length > 0 ? newVideos[0].id : null);
      }
      return newVideos;
    });
  };

  const processAllVideos = async () => {
    if (!image.file) return;
    setIsProcessingBatch(true);

    const itemsToProcess = videos.filter(v => v.status === 'idle' && v.file);

    for (const item of itemsToProcess) {
      setVideos(prev => prev.map(v => v.id === item.id ? { ...v, status: 'processing', progress: 0 } : v));
      setSelectedVideoId(item.id);

      try {
        const blob = await processVideoWithThumbnail(
          item.file!,
          image.file!,
          config, 
          (p) => {
             setVideos(prev => prev.map(v => v.id === item.id ? { ...v, progress: p } : v));
          }
        );
        const url = URL.createObjectURL(blob);
        setVideos(prev => prev.map(v => v.id === item.id ? { ...v, status: 'completed', resultUrl: url, progress: 100 } : v));
      } catch (e) {
        console.error(e);
        setVideos(prev => prev.map(v => v.id === item.id ? { ...v, status: 'error', errorMsg: 'Lỗi xử lý video' } : v));
      }
    }

    setIsProcessingBatch(false);
  };

  const handleRegenerateCaption = (id: string, file: File | null, productName?: string) => {
      if(file) triggerAutoCaption(id, file, productName);
  }

  const selectedVideo = videos.find(v => v.id === selectedVideoId);

  return (
    <div className="min-h-screen bg-orange-50/50 pb-12 flex flex-col">
      <Header />

      <main className="max-w-7xl mx-auto px-4 py-6 w-full flex-1">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-full">
          
          {/* LEFT COLUMN: Controls & Input */}
          <div className="lg:col-span-4 space-y-6 flex flex-col">
            
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-5">
              <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <span className="flex items-center justify-center w-7 h-7 rounded-full bg-[#ee4d2d] text-white text-sm font-bold shadow-md shadow-orange-200">1</span>
                Nguồn Video & Ảnh Bìa
              </h2>

              <div className="space-y-4">
                <FileUpload
                  accept="video/*"
                  label="Chọn Video"
                  sublabel="Hoặc dán link bên dưới"
                  multiple={true}
                  onFileSelect={handleVideoFilesSelect}
                  onClear={() => {}} 
                  iconType="video"
                />
                
                <div className="flex gap-2">
                   <input 
                      type="text"
                      placeholder="Dán link Shopee..."
                      className="flex-1 p-2 border rounded-lg text-sm"
                      value={videoLinkInput}
                      onChange={(e) => setVideoLinkInput(e.target.value)}
                   />
                   <button onClick={handleAddLinks} disabled={isAddingLinks || !videoLinkInput.trim()} className="bg-gray-800 text-white p-2 rounded-lg">
                      {isAddingLinks ? <Loader2 className="animate-spin" size={18}/> : <Plus size={18}/>}
                   </button>
                </div>

                <div className="border-t pt-4">
                  <FileUpload
                      accept="image/*"
                      label="Chọn Ảnh Bìa"
                      sublabel="Luôn hiển thị (Khung/Watermark)"
                      file={image.file}
                      onFileSelect={handleImageSelect}
                      onClear={() => setImage({ file: null, url: null })}
                      iconType="image"
                    />
                </div>
              </div>
            </div>

            {/* --- ADVANCED CONFIG PANEL --- */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
              <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                <span className="flex items-center justify-center w-7 h-7 rounded-full bg-[#ee4d2d] text-white text-sm font-bold shadow-md shadow-orange-200">2</span>
                Cấu hình Edit Video Pro
              </h2>
              
              <div className="space-y-6">
                 
                 {/* 1. Trimming & Speed */}
                 <div className="space-y-3">
                    <div className="flex justify-between text-sm font-medium text-gray-700">
                       <span className="flex items-center gap-1"><Scissors size={14}/> Cắt & Tốc độ</span>
                       <span className="text-[#ee4d2d]">{config.speed}x</span>
                    </div>
                    
                    {/* Speed Buttons */}
                    <div className="flex gap-2 mb-2">
                        {[1.0, 1.05, 1.1, 1.3].map(speed => (
                           <button 
                             key={speed}
                             onClick={() => setConfig({...config, speed})}
                             className={`flex-1 py-1 text-xs rounded border font-medium transition ${
                                config.speed === speed 
                                ? 'bg-[#ee4d2d] text-white border-[#ee4d2d]' 
                                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                             }`}
                           >
                             {speed}x
                           </button>
                        ))}
                    </div>

                    {/* Trimming Inputs */}
                    <div className="flex gap-2 items-center text-xs">
                        <div className="flex-1">
                           <label className="text-gray-500 block mb-1">Bắt đầu (s)</label>
                           <input type="number" min="0" className="w-full border p-1 rounded" 
                                  value={config.trimStart} onChange={(e) => setConfig({...config, trimStart: parseFloat(e.target.value)})} />
                        </div>
                        <span className="pt-4">-</span>
                        <div className="flex-1">
                           <label className="text-gray-500 block mb-1">Kết thúc (s)</label>
                           <input type="number" min="0" className="w-full border p-1 rounded" 
                                  value={config.trimEnd} onChange={(e) => setConfig({...config, trimEnd: parseFloat(e.target.value)})} />
                        </div>
                    </div>
                 </div>

                 {/* 2. Visual Effects & Anti-Reup (NEW SECTION) */}
                 <div className="bg-gray-50 p-3 rounded-lg space-y-4">
                     <h3 className="text-sm font-bold text-gray-700 flex items-center gap-1"><Aperture size={14}/> Hiệu ứng Visual & Anti-Reup</h3>
                     
                     {/* Film Grain Slider */}
                     <div>
                        <div className="flex justify-between text-xs text-gray-600 mb-1">
                            <span className="flex items-center gap-1"><Hash size={10}/> Nhiễu hạt (Film Grain)</span>
                            <span className="font-bold">{Math.round(config.filmGrainScore * 100)}%</span>
                        </div>
                        <input 
                           type="range" min="0" max="0.6" step="0.05"
                           value={config.filmGrainScore}
                           onChange={(e) => setConfig({...config, filmGrainScore: parseFloat(e.target.value)})}
                           className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                        />
                        <p className="text-[9px] text-gray-400 mt-0.5">Tăng nhiễu giúp đổi mã hash video, tránh quét trùng lặp.</p>
                     </div>

                     {/* Vignette Toggle */}
                     <button
                        onClick={() => setConfig({...config, enableVignette: !config.enableVignette})} 
                        className={`w-full py-2 rounded border flex items-center justify-center gap-2 transition text-xs font-medium ${
                           config.enableVignette
                           ? 'bg-indigo-50 border-indigo-300 text-indigo-700' 
                           : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-100'
                        }`}
                     >
                        <Eye size={14} />
                        {config.enableVignette ? 'Đang bật: Làm tối góc (Vignette)' : 'Bật hiệu ứng Làm tối góc (Vignette)'}
                     </button>
                 </div>

                 {/* 3. Text Overlay */}
                 <div className="bg-gray-50 p-3 rounded-lg space-y-3">
                     <h3 className="text-sm font-bold text-gray-700 flex items-center gap-1"><Type size={14}/> Chèn Chữ Kêu Gọi</h3>
                     <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-600">Bật nội dung</span>
                        <div 
                          onClick={() => updateTextOverlay({ enabled: !config.textOverlay.enabled })}
                          className={`w-10 h-5 rounded-full relative cursor-pointer transition ${config.textOverlay.enabled ? 'bg-green-500' : 'bg-gray-300'}`}
                        >
                           <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${config.textOverlay.enabled ? 'left-6' : 'left-1'}`} />
                        </div>
                     </div>
                     {config.textOverlay.enabled && (
                        <div className="space-y-2 animate-in slide-in-from-top-2">
                           <input 
                              type="text" 
                              value={config.textOverlay.text}
                              onChange={(e) => updateTextOverlay({ text: e.target.value })}
                              className="w-full text-sm p-2 border rounded"
                              placeholder="Nội dung (VD: Mua Ngay)"
                           />
                           <div className="flex gap-2">
                              {['top', 'center', 'bottom'].map((pos) => (
                                 <button key={pos} onClick={() => updateTextOverlay({ position: pos as any })}
                                    className={`flex-1 text-[10px] py-1 border rounded capitalize ${config.textOverlay.position === pos ? 'bg-gray-800 text-white' : 'bg-white'}`}>
                                    {pos}
                                 </button>
                              ))}
                           </div>
                        </div>
                     )}
                 </div>

                 {/* 4. Filters & Toggles */}
                 <div>
                    <div className="flex justify-between text-sm mb-2 font-medium text-gray-700">
                       <span className="flex items-center gap-1"><Palette size={14}/> Bộ lọc màu</span>
                       <span className="text-xs uppercase text-gray-400">{config.colorFilter}</span>
                    </div>
                    <div className="grid grid-cols-6 gap-2 mb-4">
                       {['none', 'bright', 'warm', 'cool', 'contrast', 'vintage'].map((f) => (
                           <button
                             key={f}
                             onClick={() => setConfig({...config, colorFilter: f as any})}
                             title={f}
                             className={`h-6 rounded border-2 transition ${
                                config.colorFilter === f ? 'border-[#ee4d2d] ring-1 ring-orange-200' : 'border-transparent bg-gray-200 hover:bg-gray-300'
                             }`}
                             style={{
                                background: f === 'none' ? '#e5e7eb' :
                                            f === 'bright' ? '#fffbeb' :
                                            f === 'warm' ? '#fff7ed' :
                                            f === 'cool' ? '#eff6ff' :
                                            f === 'vintage' ? '#d6d3d1' : '#111'
                             }}
                           />
                       ))}
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                        <div className="col-span-3 mb-2">
                            <div className="flex justify-between text-xs mb-1">
                            <span>Zoom / Xóa Logo</span>
                            <span>{Math.round(config.zoomLevel * 100)}%</span>
                            </div>
                            <input 
                            type="range" min="0" max="0.4" step="0.01"
                            value={config.zoomLevel}
                            onChange={(e) => setConfig({...config, zoomLevel: parseFloat(e.target.value)})}
                            className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#ee4d2d]"
                            />
                        </div>

                        <button 
                            onClick={() => setConfig({...config, flipHorizontal: !config.flipHorizontal})}
                            className={`p-2 rounded border flex flex-col items-center justify-center gap-1 transition ${
                            config.flipHorizontal 
                            ? 'bg-orange-50 border-[#ee4d2d] text-[#ee4d2d]' 
                            : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
                            }`}
                        >
                            <FlipHorizontal size={16} />
                            <span className="text-[10px] font-bold">Lật</span>
                        </button>

                        <button 
                            onClick={() => setConfig({...config, volume: config.volume === 0 ? 1 : 0})}
                            className={`p-2 rounded border flex flex-col items-center justify-center gap-1 transition ${
                            config.volume === 0
                            ? 'bg-gray-100 border-gray-300 text-gray-400' 
                            : 'bg-white border-green-200 text-green-600 hover:bg-green-50'
                            }`}
                        >
                            <Volume2 size={16} />
                            <span className="text-[10px] font-bold">{config.volume > 0 ? 'Bật' : 'Tắt'}</span>
                        </button>
                        
                        <button
                            onClick={() => setConfig({...config, enableMotionBlur: !config.enableMotionBlur})} 
                            className={`p-2 rounded border flex flex-col items-center justify-center gap-1 transition ${
                            config.enableMotionBlur
                            ? 'bg-blue-50 border-blue-300 text-blue-600' 
                            : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
                            }`}
                        >
                            <Zap size={16} />
                            <span className="text-[10px] font-bold">Blur</span>
                        </button>
                    </div>
                 </div>

              </div>
            </div>

             {/* Action Button */}
             <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 sticky bottom-4 z-10">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm text-gray-500 font-medium">Danh sách: {videos.length} video</span>
                  {videos.length > 0 && (
                    <button onClick={() => setVideos([])} className="text-xs text-red-500 hover:underline">Xóa tất cả</button>
                  )}
                </div>
                <button
                  onClick={processAllVideos}
                  disabled={videos.length === 0 || !image.file || isProcessingBatch || isAddingLinks}
                  className={`w-full py-3.5 rounded-xl font-bold text-white flex items-center justify-center gap-2 shadow-lg transition-all
                    ${videos.length === 0 || !image.file 
                      ? 'bg-gray-300 cursor-not-allowed shadow-none' 
                      : isProcessingBatch
                        ? 'bg-orange-400 cursor-wait'
                        : 'bg-[#ee4d2d] hover:bg-[#d73211] hover:shadow-orange-200'
                    }`}
                >
                  {isProcessingBatch ? (
                    <> <Loader2 className="animate-spin" /> Đang Render...</>
                  ) : (
                    <> <Sparkles /> Xuất Video Ngay</>
                  )}
                </button>
              </div>

          </div>

          {/* MIDDLE COLUMN: Video Queue List */}
          <div className="lg:col-span-3 flex flex-col h-[600px] lg:h-auto">
             <div className="bg-white rounded-2xl shadow-sm border border-gray-100 flex flex-col h-full overflow-hidden">
                <div className="p-4 border-b border-gray-100 bg-gray-50">
                   <h3 className="font-bold text-gray-800 flex items-center gap-2"><FileVideo size={18}/> Danh sách chờ</h3>
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-2">
                   {videos.length === 0 ? (
                     <div className="h-full flex flex-col items-center justify-center text-gray-400 p-4 text-center">
                        <FileVideo size={32} className="mb-2 opacity-50"/>
                        <p className="text-sm">Chưa có video nào.</p>
                     </div>
                   ) : (
                     videos.map((video) => (
                       <div 
                          key={video.id} 
                          onClick={() => setSelectedVideoId(video.id)}
                          className={`p-3 rounded-xl border cursor-pointer transition-all relative group ${
                            selectedVideoId === video.id 
                            ? 'bg-orange-50 border-[#ee4d2d] ring-1 ring-[#ee4d2d]/20' 
                            : 'bg-white border-gray-200 hover:border-orange-200'
                          }`}
                       >
                          <div className="flex justify-between items-start mb-1">
                             <div className="flex-1 min-w-0 pr-2">
                                <p className="text-xs font-bold text-gray-800 truncate" title={video.name}>{video.name}</p>
                                <div className="text-[10px] text-gray-500 mt-0.5 flex items-center gap-1">
                                   {video.sourceType === 'url' ? <LinkIcon size={10}/> : <FileVideo size={10}/>}
                                   {video.duration ? `${Math.floor(video.duration)}s` : ''}
                                </div>
                             </div>
                             <button 
                               onClick={(e) => { e.stopPropagation(); removeVideo(video.id); }}
                               className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                             >
                               <Trash2 size={14} />
                             </button>
                          </div>

                          {/* Status Bar */}
                          <div className="mt-2">
                             <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                                <div 
                                  className={`h-full transition-all duration-300 ${
                                    video.status === 'error' ? 'bg-red-500' :
                                    video.status === 'completed' ? 'bg-green-500' :
                                    'bg-[#ee4d2d]'
                                  }`}
                                  style={{ width: video.status === 'fetching' || video.status === 'queued' ? '0%' : `${video.progress}%` }} 
                                />
                             </div>
                          </div>
                       </div>
                     ))
                   )}
                </div>
             </div>
          </div>

          {/* RIGHT COLUMN: Preview Player & AI Caption */}
          <div className="lg:col-span-5 flex flex-col h-[600px] lg:h-auto gap-6">
            
            {/* Player */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex flex-col">
              <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                 <Play size={20} className="text-[#ee4d2d]" /> Xem trước
              </h2>

              <div className="flex-1 bg-black/5 rounded-2xl border-2 border-dashed border-gray-200 overflow-hidden relative flex items-center justify-center min-h-[300px]">
                {selectedVideo ? (
                   selectedVideo.resultUrl ? (
                      <video src={selectedVideo.resultUrl} controls className="h-full w-full object-contain bg-black" autoPlay />
                   ) : selectedVideo.file ? (
                      <div className="relative w-full h-full flex flex-col">
                         <div className="flex-1 flex items-center justify-center bg-black">
                            <video src={selectedVideo.originalUrl!} controls className="max-h-full max-w-full" />
                         </div>
                         <div className="absolute top-2 left-2 bg-black/50 text-white text-xs px-2 py-1 rounded">Video gốc</div>
                      </div>
                   ) : (
                      <div className="text-center p-4">
                        <Loader2 className="animate-spin text-orange-500 mx-auto" size={32}/>
                        <p className="text-sm text-gray-500 mt-2">Đang tải...</p>
                      </div>
                   )
                ) : (
                  <div className="text-center p-8 opacity-40">
                     <div className="w-20 h-20 bg-gray-200 rounded-full flex items-center justify-center mb-4 mx-auto">
                       <Play className="text-gray-400 ml-1" size={32} />
                     </div>
                     <p className="text-gray-500">Chọn video từ danh sách để xem</p>
                  </div>
                )}
              </div>

              {selectedVideo && selectedVideo.status === 'completed' && selectedVideo.resultUrl && (
                 <div className="mt-4 pt-4 border-t border-gray-100">
                   <a
                     href={selectedVideo.resultUrl}
                     download={`shopee-studio-${selectedVideo.id}.mp4`}
                     className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-green-600 hover:bg-green-700 text-white rounded-xl font-bold transition shadow-lg shadow-green-100"
                   >
                     <Download size={20} /> Tải Video Này
                   </a>
                 </div>
              )}
            </div>

            {/* AI Caption Section - AUTOMATED */}
            {selectedVideo && (selectedVideo.status === 'idle' || selectedVideo.status === 'completed' || selectedVideo.status === 'processing') && (
              <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-2xl shadow-sm border border-indigo-100 p-5">
                <div className="flex items-center justify-between mb-3">
                    <h2 className="text-lg font-bold text-indigo-900 flex items-center gap-2">
                       <Wand2 size={20} className="text-indigo-600" /> AI Caption
                    </h2>
                    {!selectedVideo.isGeneratingCaption && (
                        <button 
                            onClick={() => handleRegenerateCaption(selectedVideo.id, selectedVideo.file, selectedVideo.productTitle)}
                            className="p-1.5 text-indigo-400 hover:text-indigo-600 hover:bg-indigo-100 rounded-full transition"
                            title="Tạo lại"
                        >
                            <RefreshCw size={16} />
                        </button>
                    )}
                </div>
                
                <div className="space-y-3">
                   <div className="relative">
                     <input 
                       type="text" 
                       value={selectedVideo.productTitle || ''}
                       onChange={(e) => {
                          const val = e.target.value;
                          setVideos(prev => prev.map(v => v.id === selectedVideo.id ? { ...v, productTitle: val } : v));
                       }}
                       placeholder="Nhập tên sản phẩm..."
                       className="w-full text-sm p-3 rounded-xl border border-indigo-200 focus:ring-2 focus:ring-indigo-300 outline-none pr-10"
                     />
                   </div>

                   {selectedVideo.isGeneratingCaption ? (
                        <div className="w-full text-sm p-8 rounded-xl border border-dashed border-indigo-200 bg-white/50 flex flex-col items-center justify-center text-indigo-500 min-h-[120px]">
                           <Loader2 className="animate-spin mb-2" size={24} />
                           <span>AI đang viết...</span>
                        </div>
                   ) : selectedVideo.generatedCaption ? (
                     <div className="relative mt-2 animate-in fade-in duration-500">
                       <textarea 
                          readOnly
                          className="w-full text-sm p-3 rounded-xl border border-indigo-200 bg-white min-h-[200px] focus:outline-none"
                          value={selectedVideo.generatedCaption}
                       />
                       <button 
                          onClick={() => navigator.clipboard.writeText(selectedVideo.generatedCaption || '')}
                          className="absolute bottom-3 right-3 p-2 bg-indigo-100 hover:bg-indigo-200 text-indigo-700 rounded-lg transition"
                          title="Sao chép"
                       >
                          <Copy size={16} />
                       </button>
                     </div>
                   ) : (
                     <div className="text-center py-6 bg-white/50 rounded-xl border border-dashed border-indigo-200 text-indigo-400 text-sm">
                        Đang đợi video...
                     </div>
                   )}
                </div>
              </div>
            )}
            
          </div>

        </div>
      </main>
    </div>
  );
};

export default App;
