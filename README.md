# AI Gateway Client — 基於 AI Gateway 的簡易聊天客戶端

透過公網 IP 自動識別用戶，無需登入即可與 AI 進行多輪上下文對話。

## 功能特點

- 🔑 **公網 IP 識別** — 用戶 ID 自動從公網 IP 生成（`ip_43_135_xxx_xxx`），無需登入
- 📦 **消息封裝** — 透過公網 IP → 服務端代理 → AI Gateway，自動帶 `app_id` + `user_id`
- 🧠 **多輪上下文記憶** — 原生 `messages` 陣列格式，AI 準確理解對話上下文
- ✅ **回覆完整性確認** — 每條 AI 回覆標記「✅ 完整」或「⚠️ 可能截斷」
- 📊 **回覆元數據** — 顯示耗時、上下文狀態、字數、完整性

## 快速開始

```bash
npm install
cp .env.example .env   # 編輯 .env 填入 Gateway URL
npm start
```

## 環境變量

| 變量 | 默認值 | 說明 |
|------|--------|------|
| `PORT` | 3006 | 服務端口 |
| `GATEWAY_URL` | https://your-host/ws/05-ai-gateway | AI Gateway 地址 |
| `APP_ID` | ai-chat-client | 應用識別 ID |

---

## 📐 與 AI Gateway 的 TCP/IP 交互協議

AI Gateway Client 透過 **HTTP POST over TCP/IP** 與 [AI Gateway](https://github.com/wilson710808/ai-gateway) 進行交互。以下是完整的通信協議說明。

### 架構概覽

```
┌──────────────┐     HTTP POST      ┌──────────────┐     HTTP POST      ┌──────────────┐
│              │  ──────────────▶   │              │  ──────────────▶   │              │
│  用戶瀏覽器   │    /api/chat       │  AI Chat     │    /api/query      │  AI Gateway  │
│  (前端)      │  ◀──────────────   │  (Express)   │  ◀──────────────   │  (Express)   │
│              │     JSON 回覆      │  :3006       │     JSON 回覆      │  :3005       │
└──────────────┘                    └──────────────┘                    └──────────────┘
                                          │                                  │
                                          │    API Key 池化輪詢               │
                                          │    ◀──────────────────────────▶   │
                                          │                                  ▼
                                                                          ┌──────────────┐
                                                                          │  NVIDIA /    │
                                                                          │  OpenAI /    │
                                                                          │  Anthropic   │
                                                                          └──────────────┘
```

### 1️⃣ 客戶端 → AI Chat 服務 (前端 → 後端)

**端點**: `POST /api/chat`

```http
POST /ws/06-ai-chat/api/chat HTTP/1.1
Host: 43.135.184.31
Content-Type: application/json

{
  "message": "你好，我叫小明",
  "user_id": "ip_43_135_184_31",
  "history": [
    { "role": "user", "content": "之前的第一句話" },
    { "role": "ai", "content": "AI 之前的回覆" }
  ]
}
```

**欄位說明**：

| 欄位 | 類型 | 必填 | 說明 |
|------|------|------|------|
| `message` | string | ✅ | 用戶當前輸入的訊息 |
| `user_id` | string | ✅ | 由前端從公網 IP 自動生成（格式 `ip_{IP}`） |
| `history` | array | ⬜ | 最近的對話歷史（最多 20 輪），用於多輪上下文 |

**成功回覆**：

```json
{
  "success": true,
  "response": "你好小明！有什麼可以幫你的嗎？",
  "session_id": "sess_ai-chat-client_ip_43_135_184_31_1777686094584",
  "duration_ms": 771,
  "context_used": true,
  "reply_meta": {
    "length": 85,
    "likely_complete": true,
    "model_used": "meta/llama-3.1-8b-instruct",
    "history_turns": 2
  }
}
```

**失敗回覆**：

```json
{
  "success": false,
  "error": "無法連接 AI Gateway: Connection refused"
}
```

### 2️⃣ AI Chat 服務 → AI Gateway (後端 → 後端)

**端點**: `POST {GATEWAY_URL}/api/query`

AI Chat 服務作為代理，將前端請求轉換為 AI Gateway 的標準格式：

```http
POST /ws/05-ai-gateway/api/query HTTP/1.1
Host: 127.0.0.1
Content-Type: application/json

{
  "app_id": "ai-chat-client",
  "user_id": "ip_43_135_184_31",
  "query_data": "你好，我叫小明",
  "messages": [
    { "role": "user", "content": "之前的第一句話" },
    { "role": "assistant", "content": "AI 之前的回覆" },
    { "role": "user", "content": "你好，我叫小明" }
  ],
  "options": {
    "temperature": 0.7,
    "max_tokens": 2000
  }
}
```

**欄位說明**：

| 欄位 | 類型 | 必填 | 說明 |
|------|------|------|------|
| `app_id` | string | ✅ | 應用識別 ID（在 Gateway 中註冊） |
| `user_id` | string | ✅ | 用戶唯一標識（本客戶端使用公網 IP） |
| `query_data` | string | ⬜* | 用戶原始輸入（用於 raw data 記錄） |
| `messages` | array | ⬜* | 標準 OpenAI 格式的 messages 陣列（多輪對話時優先使用） |
| `options` | object | ⬜ | 可選參數（temperature、max_tokens） |

> \* `query_data` 和 `messages` 至少需要提供一個。若同時提供 `messages`，AI Gateway 會直接使用 `messages` 陣列作為對話上下文，實現原生多輪記憶。

**Gateway 回覆**：

```json
{
  "success": true,
  "session_id": "sess_ai-chat-client_ip_43_135_184_31_1777686094584",
  "response": "你好小明！有什麼可以幫你的嗎？",
  "local_path": "/data/ai-chat-client/ip_43_135_184_31",
  "duration_ms": 771,
  "context_used": false
}
```

### 3️⃣ AI Gateway → AI 提供商 (Gateway → 外部 API)

AI Gateway 從 API Key 池中輪詢取得可用 Key，然後向 AI 提供商發送請求：

```http
POST /v1/chat/completions HTTP/1.1
Host: integrate.api.nvidia.com
Content-Type: application/json
Authorization: Bearer nvapi-xxxx

{
  "model": "meta/llama-3.1-8b-instruct",
  "messages": [
    { "role": "system", "content": "以下是該用戶的過往互動彙整..." },
    { "role": "user", "content": "之前的第一句話" },
    { "role": "assistant", "content": "AI 之前的回覆" },
    { "role": "user", "content": "你好，我叫小明" }
  ],
  "temperature": 0.7,
  "max_tokens": 2000
}
```

### 4️⃣ 公網 IP 識別流程

前端透過第三方 API（ipify.org）取得用戶的公網 IP，自動生成 `user_id`：

```javascript
// 前端自動執行
const ipRes = await fetch('https://api.ipify.org?format=json');
const ipData = await ipRes.json();        // { ip: "43.135.184.31" }
const userId = `ip_${ipData.ip.replace(/\./g, '_')}`;
// → "ip_43_135_184_31"
```

**為什麼用公網 IP？**
- 無需登入系統，零門檻使用
- 同一公網 IP 的用戶共享上下文歷史
- AI Gateway 自動為每個 `app_id + user_id` 建立三層索引路徑

### 5️⃣ 多輪對話上下文機制

```
第一輪:
  history: []
  messages: [user: "我叫小明，25歲"]
  → AI: "你好小明！"

第二輪:
  history: [user: "我叫小明", ai: "你好小明！"]
  messages: [user: "我叫小明", assistant: "你好小明！", user: "我叫什麼？"]
  → AI: "你叫小明！"   ← ✅ 記住上下文

第三輪:
  history: [前兩輪完整對話]
  messages: [全部歷史 + 當前問題]
  → AI: "你叫小明，25歲"  ← ✅ 深度記憶
```

**關鍵設計**：
- 前端維護 `messages[]` 陣列（本地狀態）
- 每次請求帶最近 20 輪歷史
- AI Gateway 的 `callAI` 將 `messages` 直接傳入 AI API（原生多輪格式）
- 歷史彙整作為 `system` 訊息背景（長期記憶）

### 6️⃣ 完整 TCP/IP 交互時序圖

```
用戶                AI Chat (前端)      AI Chat (後端)       AI Gateway         AI 提供商
 │                      │                    │                    │                  │
 │  輸入訊息             │                    │                    │                  │
 │─────────────────────▶│                    │                    │                  │
 │                      │  GET ipify.org     │                    │                  │
 │                      │───────▶(ipify)     │                    │                  │
 │                      │◀──────(公網IP)     │                    │                  │
 │                      │                    │                    │                  │
 │                      │  POST /api/chat    │                    │                  │
 │                      │  {message,         │                    │                  │
 │                      │   user_id,         │                    │                  │
 │                      │   history}         │                    │                  │
 │                      │───────────────────▶│                    │                  │
 │                      │                    │  POST /api/query   │                  │
 │                      │                    │  {app_id,          │                  │
 │                      │                    │   user_id,         │                  │
 │                      │                    │   messages[]}      │                  │
 │                      │                    │───────────────────▶│                  │
 │                      │                    │                    │  取得 API Key     │
 │                      │                    │                    │  (池化輪詢)       │
 │                      │                    │                    │                  │
 │                      │                    │                    │  POST /v1/chat/  │
 │                      │                    │                    │  completions     │
 │                      │                    │                    │─────────────────▶│
 │                      │                    │                    │  AI 回覆          │
 │                      │                    │                    │◀─────────────────│
 │                      │                    │                    │                  │
 │                      │                    │  {success,         │                  │
 │                      │                    │   response,        │                  │
 │                      │                    │   duration_ms}     │                  │
 │                      │                    │◀───────────────────│                  │
 │                      │  {success,         │                    │                  │
 │                      │   response,        │                    │                  │
 │                      │   reply_meta}      │                    │                  │
 │                      │◀───────────────────│                    │                  │
 │  顯示 AI 回覆         │                    │                    │                  │
 │◀─────────────────────│                    │                    │                  │
```

### 7️⃣ 其他語言接入範例

#### JavaScript / React Native

```javascript
async function chatWithAI(message, userId, history = []) {
  const res = await fetch('https://43.135.184.31/ws/06-ai-chat/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, user_id: userId, history })
  });
  const result = await res.json();
  return result.success ? result : null;
}
```

#### Swift / iOS

```swift
func chat(message: String, userId: String, history: [[String: String]] = []) async -> [String: Any]? {
    var req = URLRequest(url: URL(string: "https://43.135.184.31/ws/06-ai-chat/api/chat")!)
    req.httpMethod = "POST"
    req.setValue("application/json", forHTTPHeaderField: "Content-Type")
    req.httpBody = try? JSONSerialization.data(withJSONObject: [
        "message": message, "user_id": userId, "history": history
    ])
    let (data, _) = try? await URLSession.shared.data(for: req)
    return try? JSONSerialization.jsonObject(with: data!) as? [String: Any]
}
```

#### Kotlin / Android

```kotlin
suspend fun chat(message: String, userId: String, history: List<Map<String, String>> = emptyList()): JSONObject? {
    val json = JSONObject().apply {
        put("message", message)
        put("user_id", userId)
        put("history", JSONArray(history.map { JSONObject(it) }))
    }
    val body = json.toString().toRequestBody("application/json".toMediaType())
    val req = Request.Builder()
        .url("https://43.135.184.31/ws/06-ai-chat/api/chat")
        .post(body).build()
    return OkHttpClient().newCall(req).execute().use { resp ->
        JSONObject(resp.body!!.string())
    }
}
```

---

## 授權

MIT
