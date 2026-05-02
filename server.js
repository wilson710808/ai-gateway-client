/**
 * AI Chat Client — 基於 AI Gateway 的簡易聊天客戶端
 *
 * 特點：
 * 1. 純靜態前端 + 輕量 Express 伺服器
 * 2. user_id 自動從客戶端公網 IP 生成，無需登入
 * 3. 透過公網 IP 封裝消息至 AI Gateway API
 * 4. 多輪對話上下文記憶（原生 messages 陣列）
 * 5. 回覆完整性確認機制
 */

require('dotenv').config();
const express = require('express');
const path = require('path');

// 跳過自簽 SSL 證書驗證（本地開發環境）
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const app = express();
app.use(express.json({ limit: '10mb' }));

const PORT = parseInt(process.env.PORT || '3006');
const GATEWAY_URL = process.env.GATEWAY_URL || 'https://127.0.0.1/ws/05-ai-gateway';
const APP_ID = process.env.APP_ID || 'ai-chat-client';

// ---- 代理 API：轉發至 AI Gateway ----
app.post('/api/chat', async (req, res) => {
  const { message, user_id, history } = req.body;
  if (!message || !message.trim()) {
    return res.status(400).json({ success: false, error: '請輸入訊息' });
  }

  // 構建標準 messages 陣列（多輪對話）
  const messages = [];
  
  // 加入歷史對話
  if (history && Array.isArray(history) && history.length > 0) {
    for (const h of history.slice(-20)) { // 最多帶 20 輪歷史
      messages.push({
        role: h.role === 'user' ? 'user' : 'assistant',
        content: h.content
      });
    }
  }
  
  // 加入當前用戶訊息
  messages.push({ role: 'user', content: message });

  try {
    const gatewayRes = await fetch(`${GATEWAY_URL}/api/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        app_id: APP_ID,
        user_id: user_id || 'anonymous',
        query_data: message, // 保留給 raw data 記錄
        messages: messages,   // 直接傳 messages 陣列給 AI
        options: { temperature: 0.7, max_tokens: 2000 }
      }),
    });

    const data = await gatewayRes.json();

    if (data.success) {
      // 回覆完整性確認
      const replyLen = (data.response || '').length;
      const seemsComplete = !data.response ||
        (!data.response.endsWith('...') && !data.response.endsWith('…')) ||
        replyLen < 1950;

      res.json({
        success: true,
        response: data.response,
        session_id: data.session_id,
        duration_ms: data.duration_ms,
        context_used: data.context_used,
        reply_meta: {
          length: replyLen,
          likely_complete: seemsComplete,
          model_used: data.model || 'unknown',
          history_turns: (history || []).length
        }
      });
    } else {
      res.status(502).json({
        success: false,
        error: data.error || 'AI Gateway 回覆失敗'
      });
    }
  } catch (err) {
    res.status(500).json({
      success: false,
      error: `無法連接 AI Gateway: ${err.message}`
    });
  }
});

// 健康檢查
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'ai-chat-client',
    gateway_url: GATEWAY_URL,
    app_id: APP_ID,
    timestamp: new Date().toISOString()
  });
});

// 靜態前端
app.use(express.static(path.join(__dirname, 'public')));

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🤖 AI Chat Client 已啟動: http://0.0.0.0:${PORT}`);
  console.log(`🔗 Gateway: ${GATEWAY_URL}`);
  console.log(`📱 App ID: ${APP_ID}`);
});
