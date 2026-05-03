/**
 * AI Gateway Client SDK — TypeScript 類型定義
 */

declare class AIGatewayClient {
  constructor(options?: AIGatewayClientOptions);
  
  /**
   * 獲取用戶公網 IP
   */
  getPublicIP(): Promise<string | null>;
  
  /**
   * 生成用戶 ID
   */
  generateUserId(): Promise<string>;
  
  /**
   * 發送聊天請求
   */
  chat(message: string, options?: ChatOptions): Promise<ChatResponse>;
  
  /**
   * 流式聊天（Generator）
   */
  streamChat(message: string, options?: ChatOptions): AsyncGenerator<StreamChunk>;
  
  /**
   * 批量聊天
   */
  batchChat(messages: BatchMessage[], options?: BatchOptions): Promise<BatchResponse>;
  
  /**
   * 健康檢查
   */
  healthCheck(): Promise<HealthStatus>;
  
  /**
   * 獲取統計
   */
  getStats(): Promise<StatsResponse>;
}

interface AIGatewayClientOptions {
  /** 服務器地址 */
  baseUrl?: string;
  /** 應用 ID */
  appId?: string;
  /** 用戶 ID（可選） */
  userId?: string;
  /** 請求超時（ms） */
  timeout?: number;
  /** 啟用流式響應 */
  enableStream?: boolean;
  /** 流式響應回調 */
  onStreamChunk?: (chunk: StreamChunk) => void;
}

interface ChatOptions {
  /** 自定義用戶 ID */
  userId?: string;
  /** 對話歷史 */
  history?: Message[];
  /** 啟用流式 */
  stream?: boolean;
  /** 溫度參數 */
  temperature?: number;
  /** 最大 token 數 */
  maxTokens?: number;
  /** AI 額外選項 */
  aiOptions?: Record<string, any>;
}

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface ChatResponse {
  success: boolean;
  response?: string;
  session_id?: string;
  duration_ms?: number;
  context_used?: boolean;
  model_used?: string;
  reply_meta?: {
    length: number;
    likely_complete: boolean;
    model_used: string;
    history_turns: number;
    request_duration_ms: number;
  };
  error?: string;
  code?: string;
}

interface StreamChunk {
  content?: string;
  done?: boolean;
  error?: string;
}

interface BatchMessage {
  content: string;
  options?: {
    temperature?: number;
    maxTokens?: number;
  };
}

interface BatchOptions {
  userId?: string;
}

interface BatchResponse {
  success: boolean;
  results: Array<{
    index: number;
    success: boolean;
    response: string | null;
    error: string | null;
  }>;
}

interface HealthStatus {
  status: 'ok' | 'error';
  service: string;
  version: string;
  gateway_url: string;
  app_id: string;
  stream_enabled: boolean;
  rate_limit: {
    window_ms: number;
    max_requests: number;
  };
  timestamp: string;
  uptime: number;
  gateway?: {
    status: string;
    [key: string]: any;
  };
}

interface StatsResponse {
  success: boolean;
  stats: {
    rate_limits: {
      active: number;
      total: number;
    };
    requests_logged: number;
    uptime_seconds: number;
    memory: {
      rss: number;
      heapTotal: number;
      heapUsed: number;
      external: number;
    };
  };
}

/**
 * React Hook
 */
declare function useAIGateway(options?: AIGatewayClientOptions): {
  loading: boolean;
  error: string | null;
  history: Message[];
  sendMessage: (message: string) => Promise<ChatResponse>;
  clearHistory: () => void;
  client: AIGatewayClient;
};

export {
  AIGatewayClient,
  AIGatewayClientOptions,
  ChatOptions,
  ChatResponse,
  Message,
  StreamChunk,
  BatchMessage,
  BatchOptions,
  BatchResponse,
  HealthStatus,
  StatsResponse,
  useAIGateway
};

export default AIGatewayClient;
