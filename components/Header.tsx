import React from 'react';
import { Music2 } from 'lucide-react';

export const Header: React.FC = () => {
  return (
    <header className="bg-white border-b border-gray-100 shadow-sm sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="bg-black p-2 rounded-lg text-white shadow-md flex items-center justify-center">
            <Music2 size={24} className="text-[#00f2ea] drop-shadow-[2px_2px_0_#ff0050]" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Tiktok Video Editor Pro</h1>
            <p className="text-xs text-gray-500 font-medium">Tối ưu video & Gắn bìa tự động</p>
          </div>
        </div>
        <div className="hidden md:block text-sm text-gray-500 bg-gray-50 px-3 py-1 rounded-full border border-gray-100">
          Xử lý tại trình duyệt • Không cần Server
        </div>
      </div>
    </header>
  );
};