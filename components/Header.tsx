import React from 'react';
import { ShoppingBag } from 'lucide-react';

export const Header: React.FC = () => {
  return (
    <header className="bg-white border-b border-orange-100 shadow-sm sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="bg-[#ee4d2d] p-2 rounded-lg text-white shadow-md">
            <ShoppingBag size={24} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-[#ee4d2d]">Shopee Video Studio</h1>
            <p className="text-xs text-gray-500 font-medium">Công cụ gắn ảnh bìa tự động</p>
          </div>
        </div>
        <div className="hidden md:block text-sm text-gray-500 bg-orange-50 px-3 py-1 rounded-full border border-orange-100">
          Xử lý tại trình duyệt • Không cần Server
        </div>
      </div>
    </header>
  );
};