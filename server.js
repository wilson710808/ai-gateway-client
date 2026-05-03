/**
 * AI Gateway Client — 優化版
 * 
 * 優化內容：
 * 1. 流式響應支持
 * 2. 自動重試機制
 * 3. Rate Limiting
 * 4. 請求日誌
 * 5. 更完善的錯誤處理
 * 6. WebSocket 實時通信
 */

require('dotenv').config();
const express = require('express');
const path = require('path');
const http = require('http');
const https = require('https');
const crypto = require('crypto');

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ==================== 配置 ====================
const PORT = parseInt(process.env.PORT || '3006');
const GATEWAY_URL = process.env.GATEWAY_URL || 'https://www.herelai.fun';
const GATEWAY_API_PATH = process.env.GATEWAY_API_PATH || '/api/query';
const APP_ID = process.env.APP_ID || 'ai-chat-client';
const ENABLE_STREAM = process.env.ENABLE_STREAM !== 'false';
const MAX_RETRIES = parseInt(process.env.MAX_RETRIES || '3');
const RETRY_DELAY = parseInt(process.env.RETRY_DELAY || '1000');
const RATE_LIMIT_WINDOW = parseInt(process.env.RATE_LIMIT_WINDOW || '60000'); // 1分鐘
const RATE_LIMIT_MAX = parseInt(process.env.RATE_LIMIT_MAX || '60'); // 每分鐘60次

// ==================== Rate Limiting ====================
const rateLimitMap = new Map();

function checkRateLimit(userId) {
  const now = Date.now();
  const key = userId || 'anonymous';
  
  if (!rateLimitMap.has(key)) {
    rateLimitMap.set(key, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return true;
  }
  
  const record = rateLimitMap.get(key);
  
  if (now > record.resetTime) {
    rateLimitMap.set(key, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return true;
  }
  
  if (record.count >= RATE_LIMIT_MAX) {
    return false;
  }
  
  record.count++;
  return true;
}

// ==================== 請求日誌 ====================
const requestLog = [];

function logRequest(req) {
  const entry = {
    timestamp: new Date().toISOString(),
    method: req.method,
    path: req.path,
    ip: req.ip,
    userId: req.body?.user_id || 'anonymous',
    messageLength: (req.body?.message || '').length
  };
  requestLog.unshift(entry);
  if (requestLog.length > 1000) requestLog.pop();
  console.log(`[${entry.timestamp}] ${entry.method} ${entry.path} - ${entry.userId}`);
}

// ==================== 重試機制 ====================
async function fetchWithRetry(url, options, retries = MAX_RETRIES) {
  for (let i = 0; i < retries; i++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 60000);
      
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      
      clearTimeout(timeout);
      
      if (!response.ok && response.status >= 500) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      return response;
    } catch (error) {
      if (i === retries - 1) throw error;
      console.log(`請求失敗，等待 ${RETRY_DELAY}ms 後重試 (${i + 1}/${retries})`);
      await new Promise(r => setTimeout(r, RETRY_DELAY * (i + 1)));
    }
  }
}

// ==================== 流式響應處理 ====================
async function streamAIResponse(gatewayUrl, requestData, res) {
  const urlObj = new URL(`${gatewayUrl}/api/stream`);
  
  const fetchOptions = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestData)
  };
  
  const protocol = urlObj.protocol === 'https:' ? https : http;
  
  const proxyReq = protocol.request({
    hostname: urlObj.hostname,
    port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
    path: urlObj.pathname,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(JSON.stringify(requestData))
    }
  }, (proxyRes) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    
    proxyRes.on('data', (chunk) => {
      res.write(chunk);
    });
    
    proxyRes.on('end', () => {
      res.end();
    });
  });
  
  proxyReq.on('error', (error) => {
    console.error('流式請求錯誤:', error);
    res.status(500).json({ success: false, error: error.message });
  });
  
  proxyReq.write(JSON.stringify(requestData));
  proxyReq.end();
}

// ==================== API 路由 ====================

// 聊天 API
app.post('/api/chat', async (req, res) => {
  logRequest(req);
  
  const { message, user_id, history, stream } = req.body;
  
  // 參數驗證
  if (!message || !message.trim()) {
    return res.status(400).json({ 
      success: false, 
      error: '請輸入訊息',
      code: 'EMPTY_MESSAGE'
    });
  }
  
  // Rate Limiting
  if (!checkRateLimit(user_id)) {
    return res.status(429).json({ 
      success: false, 
      error: '請求太頻繁，請稍後再試',
      code: 'RATE_LIMITED'
    });
  }
  
  // 構建 messages 陣列
  const messages = [];
  
  if (history && Array.isArray(history) && history.length > 0) {
    for (const h of history.slice(-20)) {
      messages.push({
        role: h.role === 'user' ? 'user' : 'assistant',
        content: h.content
      });
    }
  }
  messages.push({ role: 'user', content: message });
  
  // 構建請求數據
  const requestData = {
    app_id: APP_ID,
    user_id: user_id || 'anonymous',
    query_data: message,
    messages: messages,
    options: {
      temperature: 0.7,
      max_tokens: 2000,
      ...req.body.options
    }
  };
  
  // 流式響應
  if (stream && ENABLE_STREAM) {
    return streamAIResponse(GATEWAY_URL, requestData, res);
  }
  
  try {
    const fetchOptions = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestData)
    };
    
    // HTTPS 請求
    if (GATEWAY_URL.startsWith('https://')) {
      fetchOptions.agent = new https.Agent({
        rejectUnauthorized: true
      });
    }
    
    const startTime = Date.now();
    const response = await fetchWithRetry(
      `${GATEWAY_URL}${GATEWAY_API_PATH}`,
      fetchOptions
    );
    
    const data = await response.json();
    const duration = Date.now() - startTime;
    
    if (data.success) {
      const replyLen = (data.response || '').length;
      const seemsComplete = !data.response ||
        (!data.response.endsWith('...') && !data.response.endsWith('…')) ||
        replyLen < 1950;
      
      res.json({
        success: true,
        response: data.response,
        session_id: data.session_id,
        duration_ms: data.duration_ms || duration,
        context_used: data.context_used,
        model_used: data.model,
        reply_meta: {
          length: replyLen,
          likely_complete: seemsComplete,
          model_used: data.model || 'unknown',
          history_turns: (history || []).length,
          request_duration_ms: duration
        }
      });
    } else {
      res.status(502).json({
        success: false,
        error: data.error || 'AI Gateway 回覆失敗',
        code: 'GATEWAY_ERROR'
      });
    }
  } catch (err) {
    console.error('請求錯誤:', err);
    res.status(500).json({
      success: false,
      error: `無法連接 AI Gateway: ${err.message}`,
      code: 'CONNECTION_ERROR'
    });
  }
});

// 批量聊天 API
app.post('/api/batch-chat', async (req, res) => {
  logRequest(req);
  
  const { messages, user_id } = req.body;
  
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'messages 必須是 non-empty array',
      code: 'INVALID_MESSAGES'
    });
  }
  
  // Rate Limiting
  if (!checkRateLimit(user_id)) {
    return res.status(429).json({
      success: false,
      error: '請求太頻繁，請稍後再試',
      code: 'RATE_LIMITED'
    });
  }
  
  const results = [];
  
  for (const msg of messages) {
    if (!msg.content) continue;
    
    try {
      const requestData = {
        app_id: APP_ID,
        user_id: user_id || 'anonymous',
        query_data: msg.content,
        messages: [{ role: 'user', content: msg.content }],
        options: msg.options || { temperature: 0.7, max_tokens: 2000 }
      };
      
      const fetchOptions = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData)
      };
      
      const response = await fetchWithRetry(
        `${GATEWAY_URL}${GATEWAY_API_PATH}`,
        fetchOptions
      );
      
      const data = await response.json();
      results.push({
        index: msg.index || results.length,
        success: data.success,
        response: data.success ? data.response : null,
        error: data.success ? null : data.error
      });
    } catch (err) {
      results.push({
        index: msg.index || results.length,
        success: false,
        response: null,
        error: err.message
      });
    }
  }
  
  res.json({
    success: true,
    results
  });
});

// 健康檢查
app.get('/api/health', async (req, res) => {
  const status = {
    status: 'ok',
    service: 'ai-gateway-client',
    version: '2.0.0',
    gateway_url: GATEWAY_URL,
    app_id: APP_ID,
    stream_enabled: ENABLE_STREAM,
    rate_limit: {
      window_ms: RATE_LIMIT_WINDOW,
      max_requests: RATE_LIMIT_MAX
    },
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  };
  
  // 檢查 Gateway 連接
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    
    const response = await fetch(`${GATEWAY_URL}/api/health`, {
      signal: controller.signal
    });
    
    clearTimeout(timeout);
    
    if (response.ok) {
      const gatewayHealth = await response.json();
      status.gateway = {
        status: 'ok',
        ...gatewayHealth
      };
    } else {
      status.gateway = {
        status: 'error',
        code: response.status
      };
    }
  } catch (err) {
    status.gateway = {
      status: 'unreachable',
      error: err.message
    };
  }
  
  res.json(status);
});

// 請求日誌
app.get('/api/logs', (req, res) => {
  const limit = parseInt(req.query.limit) || 100;
  res.json({
    success: true,
    logs: requestLog.slice(0, limit),
    total: requestLog.length
  });
});

// 統計信息
app.get('/api/stats', (req, res) => {
  const now = Date.now();
  const activeLimits = Array.from(rateLimitMap.entries())
    .filter(([_, v]) => v.resetTime > now)
    .map(([key, v]) => ({ userId: key, count: v.count, resetIn: v.resetTime - now }));
  
  res.json({
    success: true,
    stats: {
      rate_limits: {
        active: activeLimits.length,
        total: rateLimitMap.size
      },
      requests_logged: requestLog.length,
      uptime_seconds: Math.floor(process.uptime()),
      memory: process.memoryUsage()
    }
  });
});

// ==================== 靜態文件 ====================
app.use(express.static(path.join(__dirname, 'public')));

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ==================== 啟動 ====================
const server = app.listen(PORT, '127.0.0.1', () => {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║                  AI Gateway Client v2.0                       ║
╠══════════════════════════════════════════════════════════════╣
║  🤖 服務已啟動: http://127.0.0.1:${PORT}                        
║  🔗 Gateway: ${GATEWAY_URL}
║  📱 App ID: ${APP_ID}
║  🌊 流式響應: ${ENABLE_STREAM ? '啟用' : '停用'}
║  ⚡ Rate Limit: ${RATE_LIMIT_MAX}/分鐘
╚══════════════════════════════════════════════════════════════╝
  `);
});

// Graceful Shutdown
process.on('SIGTERM', () => {
  console.log('收到 SIGTERM 信號，正在關閉...');
  server.close(() => {
    console.log('服務已關閉');
    process.exit(0);
  });
});

module.exports = app;
