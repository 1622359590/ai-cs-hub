/**
 * AI 客服服务 — 调用 LLM API 回答用户问题
 */
const https = require('https');
const { getDb } = require('../database/schema');
const { retrieve: ragRetrieve, rebuildIndex } = require('./rag');

/**
 * 从 settings 获取 AI 配置
 */
function getAIConfig() {
  const db = getDb();
  const rows = db.prepare("SELECT key, value FROM settings WHERE key IN ('ai_provider','ai_api_key','ai_model','ai_system_prompt','ai_base_url')").all();
  const config = {};
  for (const row of rows) config[row.key] = row.value;
  return config;
}

/**
 * RAG 检索：根据用户问题检索相关知识（支持图片）
 */
async function getKnowledgeContext(query) {
  if (!query) return '';
  try {
    const results = await ragRetrieve(query, 5);
    if (results.length === 0) return '';
    let context = '以下是与用户问题最相关的知识库内容，请基于这些信息回答：\n\n';
    for (const item of results) {
      context += `【${item.category || '未分类'}】${item.title}\n${item.content}\n`;
      // 附带相关图片
      if (item.images && item.images.length > 0) {
        context += `相关图片：${item.images.join(', ')}\n`;
      }
      context += '\n';
    }
    return context;
  } catch (e) {
    console.warn('RAG 检索失败:', e.message);
    return '';
  }
}

/**
 * 调用 OpenAI 兼容 API
 */
function callOpenAICompat(baseUrl, apiKey, model, messages) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(baseUrl);
    const body = JSON.stringify({
      model,
      messages,
      temperature: 0.7,
      max_tokens: 2000,
    });
    const options = {
      hostname: parsed.hostname,
      port: parsed.port || 443,
      path: parsed.pathname.replace(/\/$/, '') + '/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Content-Length': Buffer.byteLength(body),
      },
    };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.error) return reject(new Error(json.error.message || JSON.stringify(json.error)));
          const content = json.choices?.[0]?.message?.content || '';
          resolve(content);
        } catch (e) {
          reject(new Error('AI 响应解析失败: ' + data.slice(0, 200)));
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/**
 * 获取 provider 的 baseUrl
 */
function getProviderBaseUrl(provider) {
  const urls = {
    deepseek: 'https://api.deepseek.com',
    openai: 'https://api.openai.com/v1',
    qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  };
  return urls[provider] || '';
}

/**
 * AI 对话主函数
 * @param {Array} history - 对话历史 [{role, content}]
 * @param {string} userMessage - 用户新消息
 * @param {string} imageUrl - 用户上传的图片 URL（可选）
 * @returns {string} AI 回复
 */
async function chat(history, userMessage, imageUrl = '') {
  const config = getAIConfig();

  if (!config.ai_provider || !config.ai_api_key) {
    throw new Error('AI 客服未配置，请在后台设置中配置 AI 服务商和 API Key');
  }

  const baseUrl = config.ai_base_url || getProviderBaseUrl(config.ai_provider);
  if (!baseUrl) throw new Error('未知的 AI 服务商: ' + config.ai_provider);

  const model = config.ai_model || 'deepseek-chat';

  // 构建 system prompt
  let systemPrompt = config.ai_system_prompt || '你是 imai.work 的智能客服助手，专门解答关于养号、获客、短视频运营的问题。请用中文回答，语气友好专业。如果不确定答案，请诚实说明并建议用户联系人工客服。';

  // RAG 检索相关知识
  const knowledge = await getKnowledgeContext(userMessage);
  if (knowledge) {
    systemPrompt += '\n\n' + knowledge;
  }

  // 告诉 LLM 可以输出图片
  systemPrompt += '\n\n【回复规则】如果知识库中有相关图片，请在回答中用 markdown 图片语法展示：![描述](图片URL)。图片能让用户更直观地理解。';

  // 构建消息列表
  const messages = [{ role: 'system', content: systemPrompt }];

  // 加入对话历史（最近 10 轮）
  const recentHistory = history.slice(-20);
  for (const msg of recentHistory) {
    messages.push({ role: msg.role, content: msg.content });
  }

  // 加入用户新消息（支持图片）
  if (imageUrl) {
    messages.push({
      role: 'user',
      content: [
        { type: 'text', text: userMessage || '请分析这张图片' },
        { type: 'image_url', image_url: { url: imageUrl } },
      ],
    });
  } else {
    messages.push({ role: 'user', content: userMessage });
  }

  const reply = await callOpenAICompat(baseUrl, config.ai_api_key, model, messages);
  return reply;
}

module.exports = { chat, getAIConfig };
