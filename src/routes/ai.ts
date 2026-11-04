import express, { Request, Response } from 'express';
import { authenticate, requireRole } from '../middleware/auth';
import { addMessage, getConversation, getOrCreateConversation, listConversations } from '../utils/supportStore';

const router = express.Router();

const fallbackReply = (message: string): string => {
  const text = message.toLowerCase();
  if (text.includes('giao hàng') || text.includes('vận chuyển')) {
    return 'WoodHome hỗ trợ giao hàng toàn quốc. Đơn từ 5.000.000đ được miễn phí vận chuyển và lắp đặt theo khu vực.';
  }
  if (text.includes('bảo hành')) {
    return 'Sản phẩm được bảo hành theo thời hạn hiển thị ở trang chi tiết. Bạn có thể gửi mã đơn hàng để đội ngũ hỗ trợ kiểm tra cụ thể.';
  }
  if (text.includes('thanh toán') || text.includes('vietqr')) {
    return 'Bạn có thể thanh toán COD hoặc VietQR trong bước đặt hàng. Hệ thống sẽ hiển thị thông tin thanh toán sau khi tạo đơn.';
  }
  if (text.includes('tư vấn') || text.includes('chọn') || text.includes('phòng')) {
    return 'Mình có thể tư vấn theo không gian, kích thước và ngân sách. Bạn đang tìm nội thất cho phòng nào và diện tích khoảng bao nhiêu?';
  }
  return 'Mình là trợ lý WoodHome. Bạn có thể hỏi về sản phẩm, chất liệu, tồn kho, giao hàng, bảo hành hoặc thanh toán.';
};

const generateAiReply = async (message: string): Promise<string> => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return fallbackReply(message);

  try {
    const apiUrl = process.env.OPENAI_API_URL || 'https://api.openai.com/v1/chat/completions';
    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        temperature: 0.4,
        max_tokens: 350,
        messages: [
          { role: 'system', content: 'Bạn là trợ lý chăm sóc khách hàng WoodHome, trả lời bằng tiếng Việt, ngắn gọn, lịch sự. Không tự bịa giá, tồn kho hay chính sách ngoài thông tin khách cung cấp.' },
          { role: 'user', content: message }
        ]
      })
    });
    const result = await response.json() as any;
    if (!response.ok) throw new Error(result?.error?.message || 'AI provider error');
    const reply = result?.choices?.[0]?.message?.content?.trim();
    if (!reply) throw new Error('AI returned an empty response');
    return reply;
  } catch (error) {
    console.error('AI support error:', error);
    return fallbackReply(message);
  }
};

router.use(authenticate);

router.post('/chat', async (req: Request, res: Response): Promise<void> => {
  const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
  const imageUrl = typeof req.body?.image_url === 'string' ? req.body.image_url.trim() : undefined;
  if (!message && !imageUrl) {
    res.status(400).json({ success: false, message: 'Vui lòng nhập tin nhắn hoặc gửi hình ảnh.' });
    return;
  }
  if (message.length > 2000) {
    res.status(400).json({ success: false, message: 'Nội dung tin nhắn không được quá 2000 ký tự.' });
    return;
  }

  const user = (req as any).user;
  const conversation = getOrCreateConversation(user.id, user.full_name, req.body?.conversation_id);
  addMessage(conversation, 'customer', user.full_name, message, imageUrl);
  let reply = '';
  if (message) {
    reply = await generateAiReply(message);
  } else {
    reply = 'WoodHome đã nhận được hình ảnh từ bạn! Đội ngũ tư vấn sẽ kiểm tra mẫu sản phẩm này và phản hồi sớm cho bạn nhé.';
  }
  addMessage(conversation, 'ai', 'Trợ lý WoodHome', reply);
  res.json({ success: true, data: { reply, provider: process.env.OPENAI_API_KEY ? 'openai-compatible' : 'fallback', conversation_id: conversation.id, messages: conversation.messages } });
});

router.get('/conversations', requireRole(2), (_req: Request, res: Response): void => {
  res.json({ success: true, data: listConversations().map(({ messages, ...conversation }) => ({ ...conversation, last_message: messages[messages.length - 1] })) });
});

router.get('/conversations/:id', (req: Request, res: Response): void => {
  const conversation = getConversation(Number(req.params.id));
  if (!conversation) {
    res.status(404).json({ success: false, message: 'Cuộc hội thoại không tồn tại.' });
    return;
  }
  const user = (req as any).user;
  if (user.role_id !== 2 && conversation.customer_id !== user.id) {
    res.status(403).json({ success: false, message: 'Bạn không có quyền xem hội thoại này.' });
    return;
  }
  res.json({ success: true, data: conversation });
});

router.post('/conversations/:id/messages', requireRole(2), (req: Request, res: Response): void => {
  const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
  const imageUrl = typeof req.body?.image_url === 'string' ? req.body.image_url.trim() : undefined;
  const conversation = getConversation(Number(req.params.id));
  if (!conversation) {
    res.status(404).json({ success: false, message: 'Cuộc hội thoại không tồn tại.' });
    return;
  }
  if (!message && !imageUrl) {
    res.status(400).json({ success: false, message: 'Vui lòng nhập tin nhắn hoặc gửi hình ảnh.' });
    return;
  }
  if (message.length > 2000) {
    res.status(400).json({ success: false, message: 'Tin nhắn không được quá 2000 ký tự.' });
    return;
  }
  const user = (req as any).user;
  addMessage(conversation, 'staff', user.full_name, message, imageUrl);
  res.json({ success: true, data: conversation });
});

module.exports = router;