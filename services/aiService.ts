
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

    // STRICT SIZE CHECK for Inline Data
    // Gemini API inline data limit is ~20MB payload. 
    // We set limit to 9.5MB to be safe and avoid 400 Bad Request errors.
    if (videoFile.size > 9.5 * 1024 * 1024) {
        return "File video quá lớn (>9.5MB). API Google hạn chế dung lượng gửi trực tiếp. Vui lòng nén video hoặc chọn video ngắn hơn (< 45s).";
    }

    // Convert video to base64 for inline transfer
    const videoBase64 = await fileToGenerativePart(videoFile);
    const mimeType = videoFile.type || 'video/mp4';

    // Enhanced Prompt with Safety Rules
    const promptText = `Bạn là Content Creator triệu view trên Shopee Video. Hãy viết **DUY NHẤT 01 CAPTION** bán hàng ngắn gọn cho video này.

    ${productName ? `Sản phẩm: "${productName}"` : ""}

    🛡️ **QUY TẮC AN TOÀN (LÁCH LUẬT SHOPEE - QUAN TRỌNG):**
    1. **Lách từ khóa nhạy cảm:** Hãy lách các từ khóa nhạy cảm hoặc từ cấm bằng cách dùng từ đồng nghĩa, chèn icon hoặc viết cách điệu.
       - Ví dụ: Dùng "S.Đ.T" thay vì SĐT, "Phở bò" thay vì Facebook, "Zép Lào" thay vì Zalo.
    2. **Tránh khẳng định tuyệt đối:** 
       - TUYỆT ĐỐI KHÔNG dùng: "Cam kết 100%", "Tốt nhất", "Trị dứt điểm", "Khỏi hẳn", "Số 1".
       - Hãy thay bằng: "Hỗ trợ", "Cải thiện", "Top đầu", "Giúp".

    🚨 **YÊU CẦU BẮT BUỘC:**
    1. **Độ dài TỐI ĐA:** Tổng cộng **PHẢI DƯỚI 140 KÝ TỰ** (bao gồm cả khoảng trắng và hashtag). Đây là yêu cầu quan trọng nhất.
    2. **Số lượng Hashtag:** Sử dụng CHÍNH XÁC 5 hashtag ở cuối.
    3. **Hashtag bắt buộc:** Phải bao gồm #ShopeeCreator #LuotVuiMuaLien #ShopeeVideo
    4. **Hashtag bổ sung:** Thêm 2 hashtag liên quan nhất đến sản phẩm.

    Cấu trúc gợi ý:
    [Hook giật tít cực ngắn (đã lách text)] + [Lợi ích chính] + [CTA ngắn]
    [5 Hashtag]

    ⚠️ **Lưu ý:**
    - KHÔNG viết "Caption:" hay "Nội dung:". Chỉ trả về text để copy.
    - Viết tắt nếu cần để đảm bảo ngắn gọn.
    `;

    // FALLBACK STRATEGY
    // 1. Try 'gemini-3-pro-preview' (Best Quality)
    // 2. If Rate Limit (429) or Service Unavailable (503), fallback to 'gemini-flash-latest' (High Quota, Fast)
    const modelsToTry = ['gemini-3-pro-preview', 'gemini-flash-latest'];
    let lastError: any = null;

    for (const model of modelsToTry) {
        try {
            const response = await ai.models.generateContent({
                model: model,
                contents: {
                    parts: [
                        { inlineData: { mimeType: mimeType, data: videoBase64 } },
                        { text: promptText }
                    ]
                },
                config: {
                    temperature: 0.7,
                }
            });
            return response.text || "Không thể phân tích video lúc này (Phản hồi trống).";
        } catch (error: any) {
            lastError = error;
            const msg = error.message || "";
            // Only fallback if it's a capacity issue (429, 503)
            if (msg.includes("429") || msg.includes("503")) {
                console.warn(`Model ${model} bị quá tải (Rate Limit). Đang thử model dự phòng...`);
                continue; // Try next model
            }
            // If it's a 400 (Bad Request) or 403 (Permission), stop immediately as changing model won't help content errors.
            break;
        }
    }

    throw lastError;

  } catch (error: any) {
    console.error("AI Generation Error:", error);
    
    // Provide more specific error messages to the user
    let errorMessage = error.message || "Lỗi không xác định";
    
    if (errorMessage.includes("400")) return "Lỗi 400: Video quá lớn hoặc định dạng không được hỗ trợ. Hãy thử video < 9MB.";
    if (errorMessage.includes("403")) return "Lỗi 403: API Key sai hoặc bị giới hạn quyền truy cập.";
    if (errorMessage.includes("429")) return "Lỗi 429: Hệ thống đang quá tải. Vui lòng chờ 30s rồi thử lại.";
    if (errorMessage.includes("500")) return "Lỗi 500: Server Google AI đang bảo trì.";
    
    return `Lỗi kết nối AI: ${errorMessage}`;
  }
};
