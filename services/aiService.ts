
import { GoogleGenAI } from "@google/genai";

// Initialize Gemini
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

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

export const generateTikTokContent = async (videoFile: File, productName?: string, platform: 'tiktok' | 'shopee' | 'reels' = 'tiktok'): Promise<{ caption: string, hook: string, subtitles: string[] }> => {
  try {
    if (!videoFile) throw new Error("Không tìm thấy file video.");

    if (videoFile.size > 9.5 * 1024 * 1024) {
        throw new Error("File video quá lớn (>9.5MB). API Google hạn chế dung lượng gửi trực tiếp. Vui lòng nén video hoặc chọn video ngắn hơn (< 45s).");
    }

    const videoBase64 = await fileToGenerativePart(videoFile);
    const mimeType = videoFile.type || 'video/mp4';

    let platformInstruction = "";
    if (platform === 'shopee') {
        platformInstruction = "Đặc biệt cho Shopee Video: BẮT BUỘC phải có 3 hashtag này ở cuối caption: #LuotVuiMuaLien #ShopeeCreator #ShopeeVideo. Thêm 2 hashtag khác phù hợp với sản phẩm.";
    } else if (platform === 'reels') {
        platformInstruction = "Tối ưu cho Facebook/Instagram Reels.";
    } else {
        platformInstruction = "Tối ưu cho TikTok.";
    }

    const promptText = `Bạn là chuyên gia sáng tạo nội dung trên mạng xã hội (${platform}). Hãy phân tích video này và trả về kết quả dưới dạng JSON.

    ${productName ? `Sản phẩm/Chủ đề: "${productName}"` : ""}
    ${platformInstruction}

    YÊU CẦU ĐẦU RA (JSON FORMAT):
    {
      "caption": "Viết 1 caption viral, ngắn gọn, hấp dẫn, kèm 5 hashtag phù hợp (Lưu ý yêu cầu hashtag của từng nền tảng).",
      "hook": "Viết 1 câu Hook cực ngắn (dưới 6 từ) để chèn lên video, gây tò mò hoặc kích thích người xem dừng lại. Ví dụ: 'Sự thật về...', 'Đừng bỏ lỡ...', 'Cảnh báo...'",
      "subtitles": [
        "Viết 3 đến 5 dòng subtitle ngắn gọn tóm tắt nội dung chính hoặc lời thoại quan trọng trong video.",
        "Dòng 2...",
        "Dòng 3...",
        "Dòng 4 (nếu có)...",
        "Dòng 5 (nếu có)..."
      ]
    }

    LƯU Ý QUAN TRỌNG:
    - Caption phải tự nhiên, bắt trend, không quá quảng cáo.
    - Hook phải cực kỳ ngắn gọn, in đậm, gây sốc hoặc tò mò.
    - Subtitle phải khớp với nội dung video, mỗi dòng ngắn gọn dễ đọc.
    - Trả về CHỈ LÀ JSON thuần túy, không có markdown formatting (như \`\`\`json).
    `;

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
                    responseMimeType: "application/json"
                }
            });
            
            const text = response.text || "{}";
            try {
                const json = JSON.parse(text);
                return {
                    caption: json.caption || "Không thể tạo caption.",
                    hook: json.hook || "Xem Ngay",
                    subtitles: Array.isArray(json.subtitles) ? json.subtitles : []
                };
            } catch (e) {
                console.error("JSON Parse Error", e);
                return {
                    caption: text,
                    hook: "Xem Ngay",
                    subtitles: []
                };
            }

        } catch (error: any) {
            lastError = error;
            const msg = error.message || "";
            if (msg.includes("429") || msg.includes("503")) {
                console.warn(`Model ${model} bị quá tải (Rate Limit). Đang thử model dự phòng...`);
                continue; 
            }
            break;
        }
    }

    throw lastError;

  } catch (error: any) {
    console.error("AI Generation Error:", error);
    let errorMessage = error.message || "Lỗi không xác định";
    if (errorMessage.includes("400")) errorMessage = "Lỗi 400: Video quá lớn hoặc định dạng không được hỗ trợ. Hãy thử video < 9MB.";
    if (errorMessage.includes("403")) errorMessage = "Lỗi 403: API Key sai hoặc bị giới hạn quyền truy cập.";
    if (errorMessage.includes("429")) errorMessage = "Lỗi 429: Hệ thống đang quá tải. Vui lòng chờ 30s rồi thử lại.";
    if (errorMessage.includes("500")) errorMessage = "Lỗi 500: Server Google AI đang bảo trì.";
    
    throw new Error(errorMessage);
  }
};
