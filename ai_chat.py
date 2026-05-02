"""
AI Gateway Python Client — 透過 TCP/IP 與 AI Gateway 交互的完整範例

使用方式:
  1. 單輪對話:  python ai_chat.py "你好"
  2. 互動聊天:  python ai_chat.py --interactive
  3. 多輪對話:  python ai_chat.py --interactive --history 5

依賴:
  pip install requests

環境變量 (可選):
  GATEWAY_URL  — AI Gateway 地址 (默認 https://43.135.184.31/ws/05-ai-gateway)
  APP_ID       — 應用 ID (默認 python-client)
"""

import os
import sys
import json
import requests

# ============================================================
# 配置
# ============================================================
GATEWAY_URL = os.environ.get(
    "GATEWAY_URL",
    "http://www.herelai.fun/ws/05-ai-gateway"
)
APP_ID = os.environ.get("APP_ID", "python-client")
USER_ID = os.environ.get("USER_ID", None)  # 不設則自動從公網 IP 取得


# ============================================================
# 核心類
# ============================================================
class AIGatewayClient:
    """AI Gateway 客戶端 — 支持單輪/多輪對話"""

    def __init__(self, gateway_url=GATEWAY_URL, app_id=APP_ID, user_id=None):
        self.gateway_url = gateway_url.rstrip("/")
        self.app_id = app_id
        self.user_id = user_id or self._detect_user_id()
        self.history = []  # 對話歷史 [{role, content}, ...]

    def _detect_user_id(self):
        """透過公網 IP 自動生成 user_id"""
        try:
            resp = requests.get("https://api.ipify.org?format=json", timeout=5)
            ip = resp.json()["ip"]
            uid = f"ip_{ip.replace('.', '_')}"
            print(f"🔑 自動識別: {uid} (IP: {ip})")
            return uid
        except Exception:
            uid = f"python_local_{os.getpid()}"
            print(f"🔑 本地模式: {uid}")
            return uid

    def query(self, message, use_history=True, max_history=20):
        """
        發送訊息至 AI Gateway

        參數:
          message     — 用戶輸入
          use_history — 是否帶歷史上下文（多輪記憶）
          max_history — 最大歷史輪數

        回傳:
          dict — {success, response, session_id, duration_ms, ...}
        """
        # 構建 messages 陣列
        messages = []
        if use_history and self.history:
            messages.extend(self.history[-max_history:])
        messages.append({"role": "user", "content": message})

        # 發送請求
        payload = {
            "app_id": self.app_id,
            "user_id": self.user_id,
            "query_data": message,
            "messages": messages,
            "options": {"temperature": 0.7, "max_tokens": 2000}
        }

        try:
            resp = requests.post(
                f"{self.gateway_url}/api/query",
                json=payload,
                timeout=60,
                verify=False  # 自簽證書環境，正式環境請改為 True
            )
            data = resp.json()
        except requests.exceptions.JSONDecodeError:
            return {"success": False, "error": f"HTTP {resp.status_code}: {resp.text[:200]}"}
        except requests.exceptions.ConnectionError as e:
            return {"success": False, "error": f"連線失敗: {e}"}
        except requests.exceptions.Timeout:
            return {"success": False, "error": "請求逾時（60秒）"}

        # 更新歷史
        if data.get("success"):
            ai_response = data.get("response", "")
            self.history.append({"role": "user", "content": message})
            self.history.append({"role": "assistant", "content": ai_response})

        return data

    def health(self):
        """檢查 AI Gateway 健康狀態"""
        try:
            resp = requests.get(
                f"{self.gateway_url}/api/health",
                timeout=5,
                verify=False
            )
            return resp.json()
        except Exception as e:
            return {"status": "error", "error": str(e)}

    def clear_history(self):
        """清空對話歷史"""
        self.history = []
        print("🗑️  對話歷史已清空")

    def show_history(self):
        """顯示對話歷史"""
        if not self.history:
            print("📭 尚無對話歷史")
            return
        print(f"\n📖 對話歷史 ({len(self.history)} 則):")
        print("─" * 50)
        for msg in self.history:
            role = "👤 你" if msg["role"] == "user" else "🤖 AI"
            content = msg["content"][:100] + ("..." if len(msg["content"]) > 100 else "")
            print(f"  {role}: {content}")
        print("─" * 50)


# ============================================================
# 格式化輸出
# ============================================================
def print_response(data):
    """格式化打印 AI 回覆"""
    if not data.get("success"):
        print(f"\n❌ 錯誤: {data.get('error', '未知錯誤')}")
        return

    response = data.get("response", "")
    duration = data.get("duration_ms", 0)

    print(f"\n🤖 AI:")
    print(f"{'─' * 50}")
    print(response)
    print(f"{'─' * 50}")
    print(f"⏱  {duration/1000:.1f}s", end="")
    if data.get("context_used"):
        print(" · 📖 有上下文", end="")
    meta = data.get("reply_meta", {})
    if meta.get("likely_complete"):
        print(" · ✅ 完整", end="")
    elif meta.get("likely_complete") is False:
        print(" · ⚠️ 可能截斷", end="")
    print()


# ============================================================
# 互動模式
# ============================================================
def interactive_mode(client, max_history=20):
    """互動式聊天模式"""
    print("=" * 55)
    print("🤖 AI Chat — 互動模式")
    print("=" * 55)
    print(f"🔗 Gateway: {client.gateway_url}")
    print(f"📱 App ID:  {client.app_id}")
    print(f"👤 User ID: {client.user_id}")
    print(f"📖 歷史輪數: 最多 {max_history} 輪")
    print()
    print("指令:")
    print("  /clear  — 清空對話歷史")
    print("  /history — 查看對話歷史")
    print("  /health — 檢查 Gateway 狀態")
    print("  /quit   — 退出")
    print()

    # 先檢查連線
    health = client.health()
    if health.get("status") == "ok":
        keys = health.get("keyPool", {})
        print(f"✅ Gateway 在線 — 可用 Keys: {keys.get('available', '?')}/{keys.get('totalKeys', '?')}")
    else:
        print(f"❌ Gateway 離線: {health.get('error', '未知')}")
        return

    while True:
        try:
            message = input("\n👤 你: ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\n👋 再見！")
            break

        if not message:
            continue
        if message == "/quit":
            print("👋 再見！")
            break
        if message == "/clear":
            client.clear_history()
            continue
        if message == "/history":
            client.show_history()
            continue
        if message == "/health":
            health = client.health()
            print(f"🏥 {json.dumps(health, indent=2, ensure_ascii=False)}")
            continue

        data = client.query(message, use_history=True, max_history=max_history)
        print_response(data)


# ============================================================
# 命令行入口
# ============================================================
if __name__ == "__main__":
    import argparse
    import urllib3
    urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

    parser = argparse.ArgumentParser(description="AI Gateway Python Client")
    parser.add_argument("message", nargs="?", help="單次訊息（不帶則進入互動模式）")
    parser.add_argument("--interactive", "-i", action="store_true", help="互動聊天模式")
    parser.add_argument("--gateway", "-g", default=GATEWAY_URL, help="AI Gateway URL")
    parser.add_argument("--app-id", "-a", default=APP_ID, help="應用 ID")
    parser.add_argument("--user-id", "-u", default=None, help="自訂 User ID")
    parser.add_argument("--history", type=int, default=20, help="最大歷史輪數")
    parser.add_argument("--no-history", action="store_true", help="不使用歷史上下文（單輪模式）")

    args = parser.parse_args()

    client = AIGatewayClient(
        gateway_url=args.gateway,
        app_id=args.app_id,
        user_id=args.user_id
    )

    if args.interactive or not args.message:
        interactive_mode(client, max_history=args.history)
    else:
        # 單次查詢
        data = client.query(
            args.message,
            use_history=not args.no_history,
            max_history=args.history
        )
        print_response(data)
