/**
 * AI Gateway Client 測試腳本
 */

const { AIGatewayClient } = require('./client');

async function runTests() {
  console.log('🧪 開始測試 AI Gateway Client SDK...\n');
  
  // 初始化客戶端
  const client = new AIGatewayClient({
    baseUrl: process.env.BASE_URL || 'http://localhost:3006',
    appId: 'test-app'
  });
  
  // 測試 1: 健康檢查
  console.log('1️⃣ 測試健康檢查...');
  try {
    const health = await client.healthCheck();
    console.log('   ✅ 健康狀態:', health.status);
    console.log('   📊 Gateway:', health.gateway?.status || '未知');
  } catch (err) {
    console.log('   ⚠️ 健康檢查失敗:', err.message);
  }
  
  // 測試 2: 單次聊天
  console.log('\n2️⃣ 測試單次聊天...');
  try {
    const result = await client.chat('你好，請自我介紹一下', {
      temperature: 0.7,
      maxTokens: 500
    });
    
    if (result.success) {
      console.log('   ✅ 請求成功');
      console.log('   📝 回覆長度:', result.reply_meta?.length, '字符');
      console.log('   ⏱️ 耗時:', result.reply_meta?.request_duration_ms, 'ms');
      console.log('   🤖 模型:', result.model_used);
      console.log('   💬 回覆:', result.response?.substring(0, 100) + '...');
    } else {
      console.log('   ❌ 請求失敗:', result.error);
    }
  } catch (err) {
    console.log('   ❌ 請求錯誤:', err.message);
  }
  
  // 測試 3: 多輪對話
  console.log('\n3️⃣ 測試多輪對話...');
  try {
    const history = [];
    
    // 第一輪
    const r1 = await client.chat('我叫小明，25歲，軟體工程師', { history });
    if (r1.success) {
      history.push({ role: 'user', content: '我叫小明，25歲，軟體工程師' });
      history.push({ role: 'assistant', content: r1.response });
      console.log('   ✅ 第一輪完成');
    }
    
    // 第二輪
    const r2 = await client.chat('我叫什麼名字？', { history });
    if (r2.success) {
      console.log('   ✅ 第二輪完成');
      console.log('   💬 回覆:', r2.response);
    }
  } catch (err) {
    console.log('   ❌ 多輪對話錯誤:', err.message);
  }
  
  // 測試 4: 批量聊天
  console.log('\n4️⃣ 測試批量聊天...');
  try {
    const results = await client.batchChat([
      '1+1等於多少？',
      '2+2等於多少？',
      '3+3等於多少？'
    ]);
    
    if (results.success) {
      console.log('   ✅ 批量請求成功');
      console.log('   📊 成功:', results.results.filter(r => r.success).length, '/', results.results.length);
      results.results.forEach((r, i) => {
        console.log(`   💬 [${i + 1}] ${r.success ? '✅' : '❌'} ${r.response?.substring(0, 50) || r.error}`);
      });
    }
  } catch (err) {
    console.log('   ❌ 批量聊天錯誤:', err.message);
  }
  
  // 測試 5: 獲取統計
  console.log('\n5️⃣ 測試統計信息...');
  try {
    const stats = await client.getStats();
    console.log('   ✅ 統計信息獲取成功');
    console.log('   📊 在線 Rate Limit:', stats.stats.rate_limits.active);
    console.log('   📝 已記錄請求:', stats.stats.requests_logged);
    console.log('   ⏱️ 運行時間:', Math.floor(stats.stats.uptime_seconds / 60), '分鐘');
  } catch (err) {
    console.log('   ❌ 統計獲取失敗:', err.message);
  }
  
  console.log('\n🎉 測試完成！');
}

runTests().catch(console.error);
