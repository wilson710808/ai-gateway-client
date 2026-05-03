# AI Gateway Client v2.0

多平台 AI 客戶端 SDK，支持 Node.js / 瀏覽器 / React Native / 移動應用。

## 核心功能

| 功能 | 說明 |
|------|------|
| 🌐 **多平台 SDK** | Node.js / 瀏覽器 / React Native / 移動應用 |
| 🔄 **流式響應** | 支持 SSE 流式輸出，實時顯示 AI 回覆 |
| 🔁 **自動重試** | 請求失敗自動重試，可配置次數和延遲 |
| ⚡ **Rate Limiting** | 內置請求頻率限制，防止 API 過載 |
| 📊 **完整日誌** | 請求日誌、統計信息、健康檢查 |
| 📝 **批量處理** | 支持批量發送多條消息 |
| 🛡️ **錯誤處理** | 完善的錯誤碼和異常處理 |

---

## 快速開始

### 1. 安裝

```bash
npm install ai-gateway-client
```

### 2. 服務器啟動

```bash
# 克隆倉庫
git clone https://github.com/wilson710808/ai-gateway-client.git
cd ai-gateway-client

# 安裝依賴
npm install

# 配置環境變量
cp .env.example .env
# 編輯 .env 填入 Gateway 地址

# 啟動服務器
npm start
```

### 3. 客戶端接入

#### Node.js

```javascript
const { AIGatewayClient } = require('ai-gateway-client');

const client = new AIGatewayClient({
  baseUrl: 'http://localhost:3006',
  appId: 'my-app'
});

async function main() {
  // 單次聊天
  const result = await client.chat('你好！');
  console.log(result.response);
  
  // 多輪對話
  const history = [];
  const r1 = await client.chat('我叫小明', { history });
  history.push({ role: 'user', content: '我叫小明' });
  history.push({ role: 'assistant', content: r1.response });
  
  const r2 = await client.chat('我叫什麼？', { history });
  console.log(r2.response);
}

main();
```

#### 瀏覽器

```html
<script src="client.js"></script>
<script>
  const client = new AIGatewayClient({
    baseUrl: 'https://your-server.com',
    appId: 'my-app'
  });
  
  async function send() {
    const result = await client.chat('Hello!');
    console.log(result.response);
  }
</script>
```

#### React

```jsx
import { useAIGateway } from 'ai-gateway-client';

function ChatApp() {
  const { loading, error, history, sendMessage } = useAIGateway({
    baseUrl: 'http://localhost:3006'
  });
  
  const handleSend = async (message) => {
    await sendMessage(message);
  };
  
  return (
    <div>
      {history.map((msg, i) => (
        <div key={i} className={msg.role}>
          {msg.content}
        </div>
      ))}
      <button onClick={() => handleSend('Hello!')}>發送</button>
    </div>
  );
}
```

#### React Native

```javascript
import { AIGatewayClient } from 'ai-gateway-client';

const client = new AIGatewayClient({
  baseUrl: 'https://your-server.com',
  appId: 'my-app'
});

// 在組件中使用
const response = await client.chat('Hello from React Native!');
console.log(response.response);
```

---

## API 參考

### AIGatewayClient

```javascript
const client = new AIGatewayClient(options);
```

**選項：**

| 參數 | 類型 | 默認值 | 說明 |
|------|------|--------|------|
| `baseUrl` | string | http://localhost:3006 | 服務器地址 |
| `appId` | string | default-app | 應用 ID |
| `userId` | string | null | 用戶 ID |
| `timeout` | number | 60000 | 超時時間（ms） |
| `enableStream` | boolean | false | 啟用流式響應 |

### chat(message, options)

發送聊天請求。

```javascript
const result = await client.chat('你好', {
  userId: 'user_123',
  history: [{ role: 'user', content: '之前說的' }],
  temperature: 0.7,
  maxTokens: 2000
});
```

**回覆格式：**

```javascript
{
  success: true,
  response: 'AI 回覆內容',
  session_id: 'sess_xxx',
  duration_ms: 1234,
  context_used: true,
  model_used: 'meta/llama-3.1-8b-instruct',
  reply_meta: {
    length: 85,
    likely_complete: true,
    history_turns: 2,
    request_duration_ms: 1234
  }
}
```

### streamChat(message, options)

流式聊天（Async Generator）。

```javascript
for await (const chunk of client.streamChat('你好')) {
  console.log(chunk.content);
}
```

### batchChat(messages, options)

批量聊天。

```javascript
const results = await client.batchChat([
  '問題1',
  { content: '問題2', options: { temperature: 0.9 } },
  '問題3'
]);
```

### healthCheck()

健康檢查。

```javascript
const health = await client.healthCheck();
console.log(health.status); // 'ok'
console.log(health.gateway); // Gateway 狀態
```

### getStats()

獲取統計信息。

```javascript
const stats = await client.getStats();
console.log(stats.stats.rate_limits.active);
```

---

## 服務器 API

### POST /api/chat

聊天請求。

```bash
curl -X POST http://localhost:3006/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "你好",
    "user_id": "user_123",
    "history": [],
    "stream": false
  }'
```

### POST /api/batch-chat

批量聊天。

```bash
curl -X POST http://localhost:3006/api/batch-chat \
  -H "Content-Type: application/json" \
  -d '{
    "messages": ["問題1", "問題2"],
    "user_id": "user_123"
  }'
```

### GET /api/health

健康檢查。

```bash
curl http://localhost:3006/api/health
```

### GET /api/stats

統計信息。

```bash
curl http://localhost:3006/api/stats
```

### GET /api/logs

請求日誌。

```bash
curl http://localhost:3006/api/logs?limit=100
```

---

## 環境配置

| 變量 | 默認值 | 說明 |
|------|--------|------|
| `PORT` | 3006 | 服務端口 |
| `GATEWAY_URL` | https://www.herelai.fun | AI Gateway 地址 |
| `GATEWAY_API_PATH` | /api/query | API 路徑 |
| `APP_ID` | ai-chat-client | 應用 ID |
| `ENABLE_STREAM` | true | 啟用流式響應 |
| `MAX_RETRIES` | 3 | 最大重試次數 |
| `RETRY_DELAY` | 1000 | 重試延遲（ms） |
| `RATE_LIMIT_WINDOW` | 60000 | Rate Limit 窗口（ms） |
| `RATE_LIMIT_MAX` | 60 | 每窗口最大請求數 |

---

## 架構圖

```
┌─────────────────────────────────────────────────────────────┐
│                      客戶端應用                              │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐       │
│  │ Node.js │  │ 瀏覽器  │  │React    │  │  移動   │       │
│  │         │  │         │  │Native   │  │  應用   │       │
│  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘       │
│       │            │            │            │             │
│       └────────────┴────────────┴────────────┘             │
│                         │                                 │
│                    AIGatewayClient SDK                     │
└─────────────────────────┬───────────────────────────────┘
                          │ HTTP / HTTPS
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                   AI Gateway Client Server                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │ Rate     │  │ Retry    │  │ Stream   │  │ Health   │   │
│  │ Limiting │  │ Mechanism│  │ Handler  │  │ Check    │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
└─────────────────────────┬───────────────────────────────┘
                          │ HTTP / HTTPS
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                      AI Gateway                             │
│                   (ai-gateway repo)                         │
└─────────────────────────────────────────────────────────────┘
```

---

## 移動應用接入示例

### iOS (Swift)

```swift
class AIGatewayService {
    private let baseUrl: String
    private let appId: String
    
    func chat(message: String, completion: @escaping (Result<String, Error>) -> Void) {
        var request = URLRequest(url: URL(string: "\(baseUrl)/api/chat")!)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        let body: [String: Any] = [
            "message": message,
            "app_id": appId
        ]
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)
        
        URLSession.shared.dataTask(with: request) { data, _, error in
            if let error = error {
                completion(.failure(error))
                return
            }
            if let data = data,
               let result = try? JSONDecoder().decode(ChatResponse.self, from: data) {
                completion(.success(result.response))
            }
        }.resume()
    }
}
```

### Android (Kotlin)

```kotlin
suspend fun chat(message: String): String {
    val json = JSONObject().apply {
        put("message", message)
        put("app_id", appId)
    }
    
    val body = json.toString().toRequestBody("application/json".toMediaType())
    val request = Request.Builder()
        .url("$baseUrl/api/chat")
        .post(body)
        .build()
    
    return withContext(Dispatchers.IO) {
        val response = OkHttpClient().newCall(request).execute()
        val body = response.body?.string()
        val json = JSONObject(body!!)
        json.getString("response")
    }
}
```

---

## 許可證

MIT License
