
import { GoogleGenAI } from "@google/genai";

// Initialize Gemini
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// Helper to convert File to Base64
const fileToGenerativePart = async (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      // Remove data url prefix (e.g. "data:video/mp4;base64,")
      const base64Data = base64String.split(',')[1];
      resolve(base64Data);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

export const generateShopeeCaption = async (videoFile: File, productName?: string): Promise<string> => {
  try {
    if (!videoFile) throw new Error("Không tìm thấy file video.");

    // Convert video to base64 for inline transfer
    // Note: Inline data is suitable for short Shopee videos. 
    const videoBase64 = await fileToGenerativePart(videoFile);

    // Enhanced Prompt for High-Conversion Sales Copy - SINGLE OPTION
    const promptText = `Bạn là Content Creator triệu view trên Shopee Video. Hãy viết **DUY NHẤT 01 CAPTION** bán hàng xuất sắc nhất cho video này.

    ${productName ? `Sản phẩm: "${productName}"` : ""}

    Yêu cầu cấu trúc caption:
    1. **Hook:** Một câu giật tít, hài hước hoặc đánh vào nỗi đau/sung sướng của khách hàng (Dùng icon bắt mắt).
    2. **Thân bài:** 2-3 gạch đầu dòng ngắn gọn về lợi ích/điểm nổi bật nhất. Dùng ngôn ngữ tự nhiên, bắt trend Gen Z.
    3. **Kêu gọi (CTA):** Thúc giục mua ngay/bấm giỏ hàng.
    4. **HASHTAG (BẮT BUỘC):** 
       - Phải có chính xác: #LuotVuiMuaLien #ShopeeVideo #ShopeeCreator
       - Thêm 3-4 hashtag đúng ngách sản phẩm.

    ⚠️ **Lưu ý quan trọng:**
    - KHÔNG viết "Lựa chọn 1" hay "Caption:". Viết thẳng nội dung để người dùng chỉ cần Copy.
    - Giữ caption dưới 10 dòng để hiển thị đẹp trên điện thoại.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          { 
            inlineData: { 
              mimeType: videoFile.type || 'video/mp4', 
              data: videoBase64 
            } 
          },
          { text: promptText }
        ]
      },
      config: {
        temperature: 0.7, 
        maxOutputTokens: 800,
      }
    });

    return response.text || "Không thể phân tích video lúc này.";
  } catch (error: any) {
    console.error("AI Generation Error:", error);
    if (error?.status === 404 || (error.message && error.message.includes("404")) || (error.message && error.message.includes("not found"))) {
        return "Lỗi AI: Model không tìm thấy. Vui lòng kiểm tra lại cấu hình API hoặc Model.";
    }
    return "Lỗi khi AI xem video. Có thể video quá dài hoặc định dạng không hỗ trợ.";
  }
};
