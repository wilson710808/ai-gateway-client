/**
 * AI Gateway Client SDK
 * 
 * 多平台客戶端 SDK，支持：
 * - Node.js
 * - 瀏覽器
 * - React Native
 * - 移動應用
 */

class AIGatewayClient {
  constructor(options = {}) {
    this.baseUrl = options.baseUrl || 'http://localhost:3006';
    this.appId = options.appId || 'default-app';
    this.userId = options.userId || null;
    this.timeout = options.timeout || 60000;
    this.enableStream = options.enableStream || false;
    this.onStreamChunk = options.onStreamChunk || null;
  }

  /**
   * 獲取用戶公網 IP
   */
  async getPublicIP() {
    try {
      const res = await fetch('https://api.ipify.org?format=json');
      const data = await res.json();
      return data.ip;
    } catch {
      // 備用方案
      try {
        const res = await fetch('https://api.myip.com');
        const data = await res.json();
        return data.ip;
      } catch {
        return null;
      }
    }
  }

  /**
   * 生成用戶 ID
   */
  async generateUserId() {
    if (this.userId) return this.userId;
    
    const ip = await this.getPublicIP();
    if (ip) {
      this.userId = `ip_${ip.replace(/\./g, '_')}`;
      return this.userId;
    }
    
    // 備用：使用設備指紋
    this.userId = `anon_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    return this.userId;
  }

  /**
   * 發送聊天請求
   */
  async chat(message, options = {}) {
    const userId = await this.generateUserId();
    
    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message,
        user_id: options.userId || userId,
        history: options.history || [],
        stream: options.stream || this.enableStream,
        options: {
          temperature: options.temperature || 0.7,
          max_tokens: options.maxTokens || 2000,
          ...options.aiOptions
        }
      })
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `HTTP ${response.status}`);
    }
    
    return response.json();
  }

  /**
   * 流式聊天
   */
  async *streamChat(message, options = {}) {
    const userId = await this.generateUserId();
    
    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message,
        user_id: options.userId || userId,
        history: options.history || [],
        stream: true
      })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    
    while (true) {
      const { done, value } = await reader.read();
      
      if (done) break;
      
      buffer += decoder.decode(value, { stream: true });
      
      // 處理 SSE 格式
      const lines = buffer.split('\n');
      buffer = lines.pop();
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') {
            return;
          }
          try {
            const parsed = JSON.parse(data);
            yield parsed;
          } catch {
            yield { content: data };
          }
        }
      }
    }
  }

  /**
   * 批量聊天
   */
  async batchChat(messages, options = {}) {
    const userId = await this.generateUserId();
    
    const response = await fetch(`${this.baseUrl}/api/batch-chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messages: messages.map((msg, i) => ({
          index: i,
          content: typeof msg === 'string' ? msg : msg.content,
          options: msg.options
        })),
        user_id: options.userId || userId
      })
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `HTTP ${response.status}`);
    }
    
    return response.json();
  }

  /**
   * 健康檢查
   */
  async healthCheck() {
    const response = await fetch(`${this.baseUrl}/api/health`);
    return response.json();
  }

  /**
   * 獲取統計
   */
  async getStats() {
    const response = await fetch(`${this.baseUrl}/api/stats`);
    return response.json();
  }
}

// ==================== 導出 ====================

// Node.js / CommonJS
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { AIGatewayClient };
}

// 瀏覽器 / ES Module
if (typeof window !== 'undefined') {
  window.AIGatewayClient = AIGatewayClient;
}

// React Hook
function useAIGateway(options = {}) {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState(null);
  const [history, setHistory] = React.useState([]);
  
  const client = React.useMemo(() => 
    new AIGatewayClient(options), 
    [options.baseUrl, options.appId]
  );
  
  const sendMessage = React.useCallback(async (message) => {
    setLoading(true);
    setError(null);
    
    try {
      const result = await client.chat(message, { history });
      
      if (result.success) {
        setHistory(prev => [
          ...prev,
          { role: 'user', content: message },
          { role: 'assistant', content: result.response }
        ]);
      } else {
        setError(result.error);
      }
      
      return result;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [client, history]);
  
  const clearHistory = React.useCallback(() => {
    setHistory([]);
  }, []);
  
  return {
    loading,
    error,
    history,
    sendMessage,
    clearHistory,
    client
  };
}

// 導出 React Hook（如果 React 可用）
if (typeof React !== 'undefined') {
  window.useAIGateway = useAIGateway;
}
