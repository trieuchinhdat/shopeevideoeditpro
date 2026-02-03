
import React, { useRef } from 'react';
import { Upload, X, FileVideo, Image as ImageIcon } from 'lucide-react';

interface FileUploadProps {
  accept: string;
  label: string;
  sublabel: string;
  files?: File[]; // Changed from single file to array check for UI (optional usage)
  file?: File | null; // Backward compatibility
  onFileSelect: (files: File[]) => void; // Changed to accept array
  onClear: () => void;
  iconType: 'video' | 'image';
  multiple?: boolean;
}

export const FileUpload: React.FC<FileUploadProps> = ({
  accept,
  label,
  sublabel,
  file,
  files,
  onFileSelect,
  onClear,
  iconType,
  multiple = false
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleClick = () => {
    inputRef.current?.click();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onFileSelect(Array.from(e.dataTransfer.files));
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  // Logic to show "selected" state (simplify to just showing the dropzone if used for bulk)
  // If single file mode and file exists, show preview
  if (!multiple && file) {
    return (
      <div className="relative p-4 bg-orange-50 border border-orange-200 rounded-lg flex items-center space-x-3 shadow-sm group hover:border-orange-300 transition-all">
        <div className="p-2 bg-white rounded-md text-[#ee4d2d] shadow-sm">
          {iconType === 'video' ? <FileVideo size={24} /> : <ImageIcon size={24} />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate">{file.name}</p>
          <p className="text-xs text-gray-500">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onClear(); }}
          className="p-2 hover:bg-white rounded-full text-gray-400 hover:text-[#ee4d2d] transition shadow-sm"
        >
          <X size={18} />
        </button>
      </div>
    );
  }

  return (
    <div
      onClick={handleClick}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      className="border-2 border-dashed border-gray-300 rounded-xl p-6 hover:border-[#ee4d2d] hover:bg-orange-50 transition-all cursor-pointer group flex flex-col items-center justify-center text-center bg-white min-h-[140px]"
    >
      <input
        type="file"
        ref={inputRef}
        accept={accept}
        className="hidden"
        multiple={multiple}
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            onFileSelect(Array.from(e.target.files));
          }
          // Reset value to allow selecting same file again if needed
          if (inputRef.current) inputRef.current.value = ''; 
        }}
      />
      <div className="mb-3 p-3 bg-gray-50 rounded-full text-gray-400 group-hover:bg-white group-hover:text-[#ee4d2d] group-hover:shadow-md transition-all">
        <Upload size={24} />
      </div>
      <p className="text-sm font-semibold text-gray-700 group-hover:text-[#ee4d2d] transition-colors">{label}</p>
      <p className="text-xs text-gray-400 mt-1">{sublabel}</p>
    </div>
  );
};
