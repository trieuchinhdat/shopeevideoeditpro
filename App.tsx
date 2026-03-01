
import React, { useState, useEffect, useRef } from 'react';
import { Header } from './components/Header';
import { FileUpload } from './components/FileUpload';
import { processVideoWithThumbnail } from './services/videoProcessor';
import { generateTikTokContent } from './services/aiService';
import { VideoItem, ImageState, ProcessingStatus, ProcessOptions } from './types';
import { Play, Download, Loader2, Sparkles, AlertCircle, CheckCircle2, Link as LinkIcon, FileVideo, Search, Info, Trash2, Plus, XCircle, Copy, Wand2, Eye, RefreshCw, Sliders, Volume2, Maximize, FlipHorizontal, Zap, Palette, Scissors, Type, LayoutTemplate, ZoomIn, Aperture, Hash } from 'lucide-react';
import { Toaster, toast } from 'sonner';

const App: React.FC = () => {
  // State for list of videos
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);

  const [image, setImage] = useState<ImageState>({ file: null, url: null });
  
  // Input states
  const [isProcessingBatch, setIsProcessingBatch] = useState(false);
  const [platform, setPlatform] = useState<'tiktok' | 'shopee' | 'reels'>('shopee'); // Default Shopee as requested
  const [includeSubtitles, setIncludeSubtitles] = useState(false); // Default false as requested

  // --- ADVANCED CONFIG STATE ---
  const [config, setConfig] = useState<ProcessOptions>({
    maintainAspectRatio: true,
    // Anti-detection Defaults
    zoomLevel: 0.10, 
    flipHorizontal: false,
    speed: 1.1, 
    volume: 0, // Default 0 (Muted) as requested
    colorFilter: 'bright',
    enableMotionBlur: false,
    // Visual Effects
    filmGrainScore: 0.10, // Default subtle noise
    enableVignette: false,
    enableAutoReorder: true, // Default true as requested
    // Pro Features
    trimStart: 0,
    trimEnd: 0, // 0 = auto end
    textOverlay: {
      enabled: false, // Default DISABLED as requested
      text: '',       // Default EMPTY as requested
      position: 75, // Default 75% (Bottom-ish)
      fontSize: 52, // Default 52 as requested
      backgroundColor: 'transparent',
      textColor: '#FFFF00'
    }
  } as ProcessOptions);

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

  // Load duration when video loaded or selected to help trim slider
  useEffect(() => {
    const vid = videos.find(v => v.id === selectedVideoId);
    if (!vid) return;

    if (vid.file && !vid.duration) {
      const videoEl = document.createElement('video');
      videoEl.src = URL.createObjectURL(vid.file);
      videoEl.onloadedmetadata = () => {
         const duration = videoEl.duration;
         setVideos(prev => prev.map(v => v.id === vid.id ? { ...v, duration } : v));
         // Update config trimEnd to match the new video duration
         setConfig(c => ({...c, trimEnd: duration, trimStart: 0 }));
      };
    } else if (vid.duration) {
        // If we switch to a video that already has duration, update the config display
        setConfig(c => ({...c, trimEnd: vid.duration!, trimStart: 0 }));
    }
  }, [selectedVideoId]); // Only trigger when selected video changes

  // --- LOGIC: Fetch Video & Title ---
  // Removed Shopee Link Logic
  
  const triggerAutoCaption = async (id: string, file: File, productName?: string) => {
    setVideos(prev => prev.map(v => v.id === id ? { ...v, isGeneratingCaption: true, generatedCaption: '', generatedHook: '', generatedSubtitles: [] } : v));
    try {
        const { caption, hook, subtitles } = await generateTikTokContent(file, productName, platform, includeSubtitles);
        
        setVideos(prev => prev.map(v => v.id === id ? { 
            ...v, 
            isGeneratingCaption: false, 
            generatedCaption: caption,
            generatedHook: hook,
            generatedSubtitles: subtitles
        } : v));

        // Auto-populate Text Overlay with Hook ONLY if hook is valid
        if (hook && hook.trim().length > 0) {
            const upperHook = hook.toUpperCase();
            setConfig(prev => ({
                ...prev,
                textOverlay: {
                    ...prev.textOverlay,
                    text: upperHook,
                    enabled: true,
                    position: 75 // Updated to 75% as per user preference
                }
            }));
            toast.success("Đã tạo Caption & Hook viral!", { description: "Hook đã được điền vào phần Chèn Chữ." });
        } else {
             // If no hook generated, keep existing text (e.g. "MUA NGAY")
             toast.success("Đã tạo Caption!", { description: "Không tìm thấy Hook phù hợp, giữ nguyên văn bản hiện tại." });
        }

    } catch (error: any) {
        toast.error("Lỗi tạo caption", { description: error.message });
        setVideos(prev => prev.map(v => v.id === id ? { ...v, isGeneratingCaption: false } : v));
    }
  };

  // Load saved cover image from LocalStorage on mount
  useEffect(() => {
    const savedImage = localStorage.getItem('savedCoverImage');
    if (savedImage) {
      // Convert Base64 to File
      fetch(savedImage)
        .then(res => res.blob())
        .then(blob => {
          const file = new File([blob], "saved-cover.png", { type: blob.type });
          setImage({ file, url: savedImage });
          toast.success("Đã khôi phục ảnh bìa đã lưu");
        })
        .catch(e => {
            console.error("Failed to load saved image", e);
            localStorage.removeItem('savedCoverImage');
        });
    }
  }, []);

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
    // Single video workflow: Replace existing list
    setVideos(newItems);
    if (newItems.length > 0) {
      setSelectedVideoId(newItems[0].id);
    }
  };

  const handleImageSelect = (files: File[]) => {
    if (files.length > 0) {
      const file = files[0];
      const url = URL.createObjectURL(file);
      setImage({ file, url });

      // Save to LocalStorage
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        try {
          localStorage.setItem('savedCoverImage', base64String);
          toast.success("Đã lưu ảnh bìa vào bộ nhớ trình duyệt");
        } catch (e) {
          console.error("Storage quota exceeded", e);
          toast.warning("Ảnh quá lớn để lưu tự động", {
            description: "Ảnh vẫn dùng được cho phiên này, nhưng sẽ mất khi tải lại trang."
          });
        }
      };
      reader.readAsDataURL(file);
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



  const processSingleVideo = async (item: VideoItem) => {
      if (!item.file) return;
      
      setVideos(prev => prev.map(v => v.id === item.id ? { ...v, status: 'processing', progress: 0 } : v));
      
      try {
        const { blob, extension } = await processVideoWithThumbnail(
          item.file,
          image.file, 
          config, 
          (p) => {
             setVideos(prev => prev.map(v => v.id === item.id ? { ...v, progress: p } : v));
          }
        );
        const url = URL.createObjectURL(blob);
        setVideos(prev => prev.map(v => v.id === item.id ? { 
            ...v, 
            status: 'completed', 
            resultUrl: url, 
            extension, 
            progress: 100 
        } : v));
      } catch (e) {
        console.error(e);
        setVideos(prev => prev.map(v => v.id === item.id ? { ...v, status: 'error' } : v));
      }
  };

  const processAllVideos = async () => {
    // Removed check for image.file to allow processing without cover
    // if (!image.file) return; 
    setIsProcessingBatch(true);

    // Process ALL videos, resetting status if needed
    // User requested: "mỗi lần bấm xuất video thì chạy lại các cấu hình"
    const itemsToProcess = videos.filter(v => v.file);

    for (const item of itemsToProcess) {
      setVideos(prev => prev.map(v => v.id === item.id ? { ...v, status: 'processing', progress: 0 } : v));
      setSelectedVideoId(item.id);

      try {
        const { blob, extension } = await processVideoWithThumbnail(
          item.file!,
          image.file, // Can be null now
          config, 
          (p) => {
             setVideos(prev => prev.map(v => v.id === item.id ? { ...v, progress: p } : v));
          }
        );
        const url = URL.createObjectURL(blob);
        setVideos(prev => prev.map(v => v.id === item.id ? { 
            ...v, 
            status: 'completed', 
            resultUrl: url, 
            extension, 
            progress: 100 
        } : v));

        // SHOW NOTIFICATION (Sonner)
        toast.success(`Đã xong: ${item.name}`, {
           description: 'Video đã được xử lý và sẵn sàng tải xuống.',
           duration: 3000
        });

      } catch (e) {
        console.error(e);
        setVideos(prev => prev.map(v => v.id === item.id ? { ...v, status: 'error', errorMsg: 'Lỗi: Hãy dùng Chrome/Edge bản mới' } : v));
        toast.error('Lỗi xử lý video', { description: 'Vui lòng kiểm tra lại file hoặc thử trình duyệt Chrome mới nhất.' });
      }
    }

    setIsProcessingBatch(false);
  };

  const handleRegenerateCaption = (id: string, file: File | null, productName?: string) => {
      if(file) triggerAutoCaption(id, file, productName);
  }

  const selectedVideo = videos.find(v => v.id === selectedVideoId);

  // Generate random string for filename
  const getRandomFilename = () => {
     return Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 10);
  };

  return (
    <div className="min-h-screen bg-orange-50/50 pb-12 flex flex-col">
      <Header />
      <Toaster position="top-right" richColors />

      <main className="max-w-7xl mx-auto px-4 py-6 w-full flex-1">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-full">
          
          {/* LEFT COLUMN: Controls & Input */}
          <div className="lg:col-span-5 space-y-6 flex flex-col">
            
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-5">
              <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <span className="flex items-center justify-center w-7 h-7 rounded-full bg-[#ee4d2d] text-white text-sm font-bold shadow-md shadow-orange-200">1</span>
                Nguồn Video & Ảnh Bìa
              </h2>

              <div className="space-y-4">
                <FileUpload
                  accept="video/*"
                  label="Chọn Video"
                  sublabel="Tải lên video từ máy tính"
                  multiple={false}
                  onFileSelect={handleVideoFilesSelect}
                  onClear={() => {}} 
                  iconType="video"
                />
                
                <div className="border-t pt-4">
                  <FileUpload
                      accept="image/*"
                      label="Chọn Ảnh Bìa"
                      sublabel="Luôn hiển thị (Khung/Watermark)"
                      file={image.file}
                      onFileSelect={handleImageSelect}
                      onClear={() => {
                        setImage({ file: null, url: null });
                        localStorage.removeItem('savedCoverImage');
                      }}
                      iconType="image"
                    />
                </div>
              </div>
            </div>

            {/* AI Caption (Moved here) */}
            {selectedVideo && (selectedVideo.status === 'idle' || selectedVideo.status === 'completed' || selectedVideo.status === 'processing') && (
              <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-2xl shadow-sm border border-indigo-100 p-5">
                <div className="flex items-center justify-between mb-3">
                    <h2 className="text-lg font-bold text-indigo-900 flex items-center gap-2">
                       <Wand2 size={20} className="text-indigo-600" /> AI Caption
                    </h2>
                    {selectedVideo.generatedCaption && (
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
                   
                   {/* Platform Selector */}
                   <div className="flex bg-white p-1 rounded-xl border border-indigo-100">
                        {(['shopee', 'tiktok', 'reels'] as const).map((p) => (
                            <button
                                key={p}
                                onClick={() => setPlatform(p)}
                                className={`flex-1 py-1.5 text-xs font-bold rounded-lg capitalize transition ${
                                    platform === p 
                                    ? 'bg-indigo-600 text-white shadow-sm' 
                                    : 'text-gray-500 hover:bg-gray-50'
                                }`}
                            >
                                {p}
                            </button>
                        ))}
                   </div>

                   {/* Subtitle Toggle */}
                   <button
                        onClick={() => setIncludeSubtitles(!includeSubtitles)}
                        className={`w-full py-2 rounded-xl border flex items-center justify-center gap-2 transition text-xs font-medium ${
                            includeSubtitles
                            ? 'bg-indigo-50 border-indigo-300 text-indigo-700' 
                            : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
                        }`}
                   >
                        <Type size={14} />
                        {includeSubtitles ? 'Đang bật: Tạo Subtitle Gợi Ý' : 'Bật tạo Subtitle Gợi Ý (Tốn thời gian hơn)'}
                   </button>

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
                       <div className="relative mt-2 animate-in fade-in duration-500 space-y-4">
                         
                         {/* Hook Input */}
                         <div>
                             <label className="text-xs font-bold text-indigo-800 mb-1 block">Hook Viral (Lora Font):</label>
                             <div className="relative">
                                 <input 
                                    type="text"
                                    value={config.textOverlay.text}
                                    onChange={(e) => updateTextOverlay({ text: e.target.value.toUpperCase() })}
                                    className="w-full text-sm p-3 rounded-xl border border-indigo-200 bg-white font-lora font-bold uppercase pr-10 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                                    placeholder="HOOK VIRAL..."
                                 />
                                 <button 
                                    onClick={() => navigator.clipboard.writeText(config.textOverlay.text || '')}
                                    className="absolute top-2 right-2 p-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-lg transition"
                                    title="Sao chép Hook"
                                 >
                                    <Copy size={14} />
                                 </button>
                             </div>
                             <p className="text-[10px] text-gray-400 italic mt-1">Tự động in hoa & chèn vào vị trí bottom.</p>
                         </div>

                         <div>
                             <label className="text-xs font-bold text-indigo-800 mb-1 block">Caption Viral:</label>
                             <div className="relative">
                                <textarea 
                                    readOnly
                                    className="w-full text-sm p-3 rounded-xl border border-indigo-200 bg-white min-h-[120px] focus:outline-none"
                                    value={selectedVideo.generatedCaption}
                                />
                                <button 
                                    onClick={() => navigator.clipboard.writeText(selectedVideo.generatedCaption || '')}
                                    className="absolute top-2 right-2 p-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-lg transition"
                                    title="Sao chép Caption"
                                >
                                    <Copy size={14} />
                                </button>
                             </div>
                         </div>

                         {selectedVideo.generatedSubtitles && selectedVideo.generatedSubtitles.length > 0 && includeSubtitles && (
                             <div>
                                 <label className="text-xs font-bold text-indigo-800 mb-1 block">Subtitles Gợi Ý:</label>
                                 <div className="space-y-2">
                                     {selectedVideo.generatedSubtitles.map((sub, idx) => (
                                         <div key={idx} className="flex items-center gap-2 bg-white border border-indigo-200 rounded-xl p-2">
                                             <span className="text-indigo-400 font-mono text-xs select-none w-6 text-center">{idx + 1}</span>
                                             <p className="flex-1 text-sm text-gray-700">{sub}</p>
                                             <button 
                                                onClick={() => navigator.clipboard.writeText(sub)}
                                                className="p-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-lg transition"
                                                title="Sao chép"
                                             >
                                                <Copy size={14} />
                                             </button>
                                         </div>
                                     ))}
                                 </div>
                             </div>
                         )}
                       </div>
                     ) : (
                        <div className="text-center p-4">
                            <button 
                                onClick={() => selectedVideo.file && triggerAutoCaption(selectedVideo.id, selectedVideo.file, selectedVideo.productTitle)}
                                className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-lg shadow-indigo-200 transition flex items-center justify-center gap-2"
                            >
                                <Sparkles size={18} /> Viết Caption & Hook Viral
                            </button>
                            <p className="text-xs text-indigo-400 mt-2">AI sẽ phân tích video để viết nội dung.</p>
                        </div>
                     )}
                </div>
              </div>
            )}

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

                     {/* Auto Reorder Toggle */}
                     <button
                        onClick={() => setConfig({...config, enableAutoReorder: !config.enableAutoReorder})} 
                        className={`w-full py-2 rounded border flex items-center justify-center gap-2 transition text-xs font-medium ${
                           config.enableAutoReorder
                           ? 'bg-purple-50 border-purple-300 text-purple-700' 
                           : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-100'
                        }`}
                     >
                        <Scissors size={14} />
                        {config.enableAutoReorder ? 'Đang bật: Tự động đảo đoạn (Anti-Reup)' : 'Bật Tự động đảo đoạn (Anti-Reup)'}
                     </button>
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
                            <span>Zoom (Kéo trái để thu nhỏ)</span>
                            <span>{Math.round(config.zoomLevel * 100)}%</span>
                            </div>
                            <input 
                            type="range" min="-0.5" max="0.5" step="0.05"
                            value={config.zoomLevel}
                            onChange={(e) => setConfig({...config, zoomLevel: parseFloat(e.target.value)})}
                            className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#ee4d2d]"
                            />
                            <div className="flex justify-between text-[9px] text-gray-400 mt-1">
                                <span>-50% (Nhỏ)</span>
                                <span>0%</span>
                                <span>+50% (To)</span>
                            </div>
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

                 {/* 5. Hook Position Config */}
                 <div className="bg-orange-50 p-3 rounded-lg space-y-2 border border-orange-100">
                     <div className="flex justify-between items-center">
                        <h3 className="text-sm font-bold text-gray-700 flex items-center gap-1"><Type size={14}/> Cấu hình Hook Viral</h3>
                        <button 
                            onClick={() => updateTextOverlay({ enabled: !config.textOverlay.enabled })}
                            className={`text-[10px] font-bold px-2 py-1 rounded border transition ${
                                config.textOverlay.enabled 
                                ? 'bg-green-100 text-green-700 border-green-200' 
                                : 'bg-gray-100 text-gray-500 border-gray-200'
                            }`}
                        >
                            {config.textOverlay.enabled ? 'ĐANG BẬT' : 'ĐANG TẮT'}
                        </button>
                     </div>
                     
                     {config.textOverlay.enabled && (
                         <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-300">
                             {/* Position Slider */}
                             <div>
                                 <div className="flex justify-between text-xs text-gray-600 mb-1">
                                     <span>Vị trí (Từ trên xuống)</span>
                                     <span className="font-bold">{config.textOverlay.position}%</span>
                                 </div>
                                 <input 
                                    type="range" min="0" max="100" step="5"
                                    value={config.textOverlay.position}
                                    onChange={(e) => updateTextOverlay({ position: parseInt(e.target.value) })}
                                    className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#ee4d2d]"
                                 />
                             </div>

                             {/* Font Size & Color */}
                             <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label className="text-[10px] text-gray-500 block mb-1">Cỡ chữ (px)</label>
                                    <input 
                                        type="number" 
                                        value={config.textOverlay.fontSize}
                                        onChange={(e) => updateTextOverlay({ fontSize: parseInt(e.target.value) })}
                                        className="w-full text-xs p-1.5 rounded border border-gray-200"
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] text-gray-500 block mb-1">Màu chữ</label>
                                    <div className="flex items-center gap-2">
                                        <input 
                                            type="color" 
                                            value={config.textOverlay.textColor}
                                            onChange={(e) => updateTextOverlay({ textColor: e.target.value })}
                                            className="w-8 h-8 p-0 rounded border-0 cursor-pointer"
                                        />
                                        <span className="text-[10px] text-gray-400 uppercase">{config.textOverlay.textColor}</span>
                                    </div>
                                </div>
                             </div>
                         </div>
                     )}
                 </div>

              </div>
            </div>

             {/* Action Button (Desktop Only) */}
             <div className="hidden lg:block bg-white rounded-2xl shadow-sm border border-gray-100 p-5 sticky bottom-4 z-10">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm text-gray-500 font-medium">Danh sách: {videos.length} video</span>
                  {videos.length > 0 && (
                    <button onClick={() => setVideos([])} className="text-xs text-red-500 hover:underline">Xóa tất cả</button>
                  )}
                </div>
                <button
                  onClick={processAllVideos}
                  disabled={videos.length === 0 || isProcessingBatch}
                  className={`w-full py-3.5 rounded-xl font-bold text-white flex items-center justify-center gap-2 shadow-lg transition-all
                    ${videos.length === 0 
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



          {/* RIGHT COLUMN: Preview Player */}
          <div className="lg:col-span-7 flex flex-col h-auto gap-6" id="preview-section">
            
            {/* Player */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex flex-col sticky top-6">
              <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                 <Play size={20} className="text-[#ee4d2d]" /> Xem trước
              </h2>

              <div className="flex-1 bg-black/5 rounded-2xl border-2 border-dashed border-gray-200 overflow-hidden relative flex items-center justify-center min-h-[300px]">
                {selectedVideo ? (
                   selectedVideo.resultUrl ? (
                      <video src={selectedVideo.resultUrl} controls className="h-full w-full object-contain bg-black" />
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
                     // Change: Randomize filename completely
                     download={`${getRandomFilename()}.${selectedVideo.extension || 'mp4'}`}
                     className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-green-600 hover:bg-green-700 text-white rounded-xl font-bold transition shadow-lg shadow-green-100"
                   >
                     <Download size={20} /> Tải Video Này {selectedVideo.extension ? `(${selectedVideo.extension.toUpperCase()})` : ''}
                   </a>
                   {selectedVideo.extension === 'webm' && (
                       <p className="text-[10px] text-red-500 mt-2 text-center">
                           Lưu ý: Trình duyệt của bạn chỉ hỗ trợ xuất file WebM.
                       </p>
                   )}
                 </div>
              )}
            </div>
            
          </div>

        </div>
      </main>
      {/* MOBILE FLOATING ACTION BAR */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-3 z-50 lg:hidden grid grid-cols-3 gap-2 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]">
          <button
            onClick={processAllVideos}
            disabled={videos.length === 0 || isProcessingBatch}
            className={`flex flex-col items-center justify-center py-2 rounded-lg font-bold text-white transition-all text-[10px]
              ${videos.length === 0 
                ? 'bg-gray-300 cursor-not-allowed' 
                : isProcessingBatch
                  ? 'bg-orange-400 cursor-wait'
                  : 'bg-[#ee4d2d] hover:bg-[#d73211]'
              }`}
          >
            {isProcessingBatch ? (
              <Loader2 className="animate-spin mb-1" size={18} />
            ) : (
              <Sparkles size={18} className="mb-1" />
            )}
            <span>Xuất Video</span>
          </button>

          <button
            onClick={() => document.getElementById('preview-section')?.scrollIntoView({ behavior: 'smooth' })}
            className="flex flex-col items-center justify-center py-2 rounded-lg font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-all text-[10px]"
          >
            <Eye size={18} className="mb-1" />
            <span>Xem Video</span>
          </button>

          {selectedVideo && selectedVideo.status === 'completed' && selectedVideo.resultUrl ? (
             <a
               href={selectedVideo.resultUrl}
               download={`${getRandomFilename()}.${selectedVideo.extension || 'mp4'}`}
               className="flex flex-col items-center justify-center py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-bold transition text-[10px]"
             >
               <Download size={18} className="mb-1" />
               <span>Tải Video</span>
             </a>
          ) : (
            <button disabled className="flex flex-col items-center justify-center py-2 bg-gray-100 text-gray-300 rounded-lg font-bold text-[10px]">
               <Download size={18} className="mb-1" />
               <span>Tải Video</span>
            </button>
          )}
      </div>

    </div>
  );
};

export default App;
