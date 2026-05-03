/**
 * AI Gateway Client v2.2 — 基於 AI Gateway 的聊天客戶端
 *
 * 特點：
 * 1. 純靜態前端 + 輕量 Express 伺服器
 * 2. user_id 自動從客戶端公網 IP 生成，無需登入
 * 3. 透過 Nginx 反代路徑與 AI Gateway 交互
 * 4. 多輪對話上下文記憶（原生 messages 陣列）
 * 5. 回覆完整性確認機制
 * 6. 自動重試 + IP 速率限制
 *
 * v2.2 安全+效能修復：
 * - 輸入校驗（message 長度、user_id 格式）
 * - CORS 白名單制
 * - Admin API 認證
 * - 安全標頭
 * - JSON body 降為 1mb
 * - fetchWithRetry 超時對齊 Gateway 30s
 * - rateLimitMap 定時清理
 * - batch-chat 併發限制
 * - SIGINT/SIGTERM 優雅關閉
 */
require('dotenv').config();
const express = require('express');
const path = require('path');
const https = require('https');
const crypto = require('crypto');

// ============================================
// 配置
// ============================================
const PORT = parseInt(process.env.PORT || '3006');
const GATEWAY_URL = process.env.GATEWAY_URL || 'https://www.herelai.fun/ws/05-ai-gateway';
const GATEWAY_API_PATH = process.env.GATEWAY_API_PATH || '/api/query';
const APP_ID = process.env.APP_ID || 'ai-chat-client';
const MAX_RETRIES = parseInt(process.env.MAX_RETRIES || '2');
const RETRY_DELAY = parseInt(process.env.RETRY_DELAY || '1000');
const RATE_LIMIT_WINDOW = parseInt(process.env.RATE_LIMIT_WINDOW || '60000');
const RATE_LIMIT_MAX = parseInt(process.env.RATE_LIMIT_MAX || '30');
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || crypto.randomBytes(32).toString('hex');
const CORS_ORIGINS = process.env.CORS_ORIGINS || '';
const MAX_BATCH_SIZE = parseInt(process.env.MAX_BATCH_SIZE || '5');
const MAX_MESSAGE_LENGTH = parseInt(process.env.MAX_MESSAGE_LENGTH || '10000');

// ============================================
// 輸入校驗
// ============================================
function validateUserId(userId) {
  if (!userId || typeof userId !== 'string') return false;
  if (userId.length > 128) return false;
  return /^[a-zA-Z0-9._-]+$/.test(userId);
}

function validateMessage(message) {
  if (!message || typeof message !== 'string') return '請輸入訊息';
  if (!message.trim()) return '訊息不得為空白';
  if (message.length > MAX_MESSAGE_LENGTH) return `訊息長度不得超過 ${MAX_MESSAGE_LENGTH} 字元`;
  return null;
}

// ============================================
// Rate Limiting（定時清理）
// ============================================
const rateLimitMap = new Map();

function checkRateLimit(userId) {
  const now = Date.now();
  const key = userId || 'anonymous';
  const record = rateLimitMap.get(key);

  if (!record || now > record.resetTime) {
    rateLimitMap.set(key, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return true;
  }

  if (record.count >= RATE_LIMIT_MAX) {
    return false;
  }

  record.count++;
  return true;
}

// 每 5 分鐘清理過期 rate limit 條目
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of rateLimitMap) {
    if (now > record.resetTime) rateLimitMap.delete(key);
  }
}, 5 * 60 * 1000);

// ============================================
// 請求日誌（帶上限）
// ============================================
const requestLog = [];
const MAX_LOG_SIZE = 500;

function logRequest(req) {
  const entry = {
    timestamp: new Date().toISOString(),
    method: req.method,
    path: req.path,
    userId: req.body?.user_id || 'anonymous',
    messageLength: (req.body?.message || '').length
  };
  requestLog.unshift(entry);
  if (requestLog.length > MAX_LOG_SIZE) requestLog.length = MAX_LOG_SIZE;
}

// ============================================
// 重試機制（超時對齊 Gateway 30s）
// ============================================
async function fetchWithRetry(url, options, retries = MAX_RETRIES) {
  for (let i = 0; i < retries; i++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 35000); // Gateway 30s + 緩衝
      const response = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timeout);

      if (!response.ok && response.status >= 500) {
        throw new Error(`HTTP ${response.status}`);
      }
      return response;
    } catch (error) {
      if (i === retries - 1) throw error;
      console.log(`[Retry] 請求失敗，${RETRY_DELAY * (i + 1)}ms 後重試 (${i + 1}/${retries})`);
      await new Promise(r => setTimeout(r, RETRY_DELAY * (i + 1)));
    }
  }
}

// ============================================
// Admin 認證中間件
// ============================================
function adminAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: '需要 Admin Token' });
  }
  const token = authHeader.substring(7);
  if (token !== ADMIN_TOKEN) {
    return res.status(403).json({ error: 'Admin Token 無效' });
  }
  next();
}

// ============================================
// Express 應用
// ============================================
const app = express();

// CORS 白名單
const corsOptions = {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (CORS_ORIGINS === '*') return callback(null, true);
    if (!CORS_ORIGINS) return callback(null, false);
    const allowed = CORS_ORIGINS.split(',').map(s => s.trim());
    if (allowed.includes(origin)) return callback(null, true);
    callback(new Error('CORS not allowed'));
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};
app.use(require('cors')(corsOptions));

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// 安全標頭
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.removeHeader('X-Powered-By');
  next();
});

// ============================================
// API 路由
// ============================================

// 聊天 API
app.post('/api/chat', async (req, res) => {
  logRequest(req);
  const { message, user_id, history } = req.body;

  // 輸入校驗
  const msgErr = validateMessage(message);
  if (msgErr) {
    return res.status(400).json({ success: false, error: msgErr, code: 'INVALID_MESSAGE' });
  }

  if (user_id && !validateUserId(user_id)) {
    return res.status(400).json({ success: false, error: 'user_id 格式無效', code: 'INVALID_USER_ID' });
  }

  // Rate Limiting
  if (!checkRateLimit(user_id)) {
    return res.status(429).json({ success: false, error: '請求太頻繁，請稍後再試', code: 'RATE_LIMITED' });
  }

  // 構建 messages 陣列（多輪對話）
  const messages = [];
  if (history && Array.isArray(history)) {
    for (const h of history.slice(-20)) {
      messages.push({
        role: h.role === 'user' ? 'user' : 'assistant',
        content: String(h.content).substring(0, 5000) // 防止超長歷史
      });
    }
  }
  messages.push({ role: 'user', content: message });

  const requestData = {
    app_id: APP_ID,
    user_id: user_id || 'anonymous',
    query_data: message,
    messages,
  };

  try {
    const fetchOptions = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestData),
    };

    if (GATEWAY_URL.startsWith('https://')) {
      fetchOptions.agent = new https.Agent({ rejectUnauthorized: true });
    }

    const startTime = Date.now();
    const response = await fetchWithRetry(`${GATEWAY_URL}${GATEWAY_API_PATH}`, fetchOptions);
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
    console.error('[Chat] 請求錯誤:', err.message);
    res.status(500).json({
      success: false,
      error: `無法連接 AI Gateway: ${err.message}`,
      code: 'CONNECTION_ERROR'
    });
  }
});

// 批量聊天 API（併發限制）
app.post('/api/batch-chat', async (req, res) => {
  logRequest(req);
  const { messages, user_id } = req.body;

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ success: false, error: 'messages 必須是 non-empty array' });
  }

  if (messages.length > MAX_BATCH_SIZE) {
    return res.status(400).json({
      success: false,
      error: `批量請求不得超過 ${MAX_BATCH_SIZE} 條`,
      code: 'BATCH_TOO_LARGE'
    });
  }

  if (!checkRateLimit(user_id)) {
    return res.status(429).json({ success: false, error: '請求太頻繁', code: 'RATE_LIMITED' });
  }

  const results = [];
  for (const msg of messages) {
    const content = typeof msg === 'string' ? msg : msg.content;
    if (!content) continue;

    const msgErr = validateMessage(content);
    if (msgErr) {
      results.push({ index: msg.index || results.length, success: false, response: null, error: msgErr });
      continue;
    }

    try {
      const requestData = {
        app_id: APP_ID,
        user_id: user_id || 'anonymous',
        query_data: content,
        messages: [{ role: 'user', content }]
      };

      const fetchOptions = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData)
      };

      if (GATEWAY_URL.startsWith('https://')) {
        fetchOptions.agent = new https.Agent({ rejectUnauthorized: true });
      }

      const response = await fetchWithRetry(`${GATEWAY_URL}${GATEWAY_API_PATH}`, fetchOptions);
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

  res.json({ success: true, results });
});

// 健康檢查（含 Gateway 連接狀態）
app.get('/api/health', async (req, res) => {
  const status = {
    status: 'ok',
    service: 'ai-gateway-client',
    version: '2.2.0',
    gateway_url: GATEWAY_URL,
    app_id: APP_ID,
    rate_limit: { window_ms: RATE_LIMIT_WINDOW, max_requests: RATE_LIMIT_MAX },
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(`${GATEWAY_URL}/api/health`, { signal: controller.signal });
    clearTimeout(timeout);

    if (response.ok) {
      status.gateway = { status: 'ok', ...(await response.json()) };
    } else {
      status.gateway = { status: 'error', code: response.status };
    }
  } catch (err) {
    status.gateway = { status: 'unreachable', error: err.message };
  }

  res.json(status);
});

// 管理 API（需認證）
app.get('/api/logs', adminAuth, (req, res) => {
  const limit = parseInt(req.query.limit) || 100;
  res.json({ success: true, logs: requestLog.slice(0, limit), total: requestLog.length });
});

app.get('/api/stats', adminAuth, (req, res) => {
  const now = Date.now();
  const activeLimits = Array.from(rateLimitMap.entries())
    .filter(([_, v]) => v.resetTime > now)
    .map(([key, v]) => ({ userId: key, count: v.count, resetIn: v.resetTime - now }));

  res.json({
    success: true,
    stats: {
      rate_limits: { active: activeLimits.length, total: rateLimitMap.size },
      requests_logged: requestLog.length,
      uptime_seconds: Math.floor(process.uptime()),
      memory: process.memoryUsage()
    }
  });
});

// 靜態前端
app.use(express.static(path.join(__dirname, 'public')));

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ============================================
// 啟動 + 優雅關閉
// ============================================
const server = app.listen(PORT, '127.0.0.1', () => {
  console.log(`🤖 AI Gateway Client v2.2 已啟動: http://127.0.0.1:${PORT}`);
  console.log(`🔗 Gateway: ${GATEWAY_URL}`);
  console.log(`📱 App ID: ${APP_ID}`);
  console.log(`⚡ Rate Limit: ${RATE_LIMIT_MAX}/分鐘`);
  console.log(`🔐 Admin Token: ${ADMIN_TOKEN.substring(0, 8)}...`);
  console.log(`🛡️ CORS: ${CORS_ORIGINS || '(同源限制)'}`);
});

function gracefulShutdown(signal) {
  console.log(`\n[Server] 收到 ${signal}，正在關閉...`);
  server.close(() => {
    console.log('[Server] 服務已關閉');
    process.exit(0);
  });
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

module.exports = app;
