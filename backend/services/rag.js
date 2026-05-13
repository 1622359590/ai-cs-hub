/**
 * RAG 检索服务 — 混合检索（BM25 + 向量）+ Re-ranking
 * 向量检索使用真实 Embedding API（DeepSeek / OpenAI 兼容）
 */
const { getDb } = require('../database/schema');
const { execSync } = require('child_process');

let sqliteVecLoaded = false;
function ensureVec(db) {
  if (sqliteVecLoaded) return;
  try {
    const sqliteVec = require('sqlite-vec');
    sqliteVec.load(db);
    sqliteVecLoaded = true;
  } catch (e) {
    console.warn('sqlite-vec 加载失败:', e.message);
  }
}

// Embedding 配置
const EMBEDDING_DIMENSION = 512; // bge-small-zh-v1.5 输出维度
const EMBEDDING_BATCH_SIZE = 10; // DashScope 限制每批最多 10 条

// Embedding 模型映射
const EMBEDDING_MODELS = {
  deepseek: 'deepseek-embedding',
  openai: 'text-embedding-3-small',
  qwen: 'text-embedding-v3',
};

// Provider 对应的 Embedding API URL
function getEmbeddingUrl(provider) {
  const urls = {
    deepseek: 'https://api.deepseek.com/embeddings',
    openai: 'https://api.openai.com/v1/embeddings',
    qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1/embeddings',
  };
  return urls[provider] || '';
}

// BM25 参数
const BM25_K1 = 1.5;
const BM25_B = 0.75;

// 常用同义词扩展
const SYNONYMS = {
  '收费': ['价格', '多少钱', '费用', '售价', '报价'],
  '价格': ['收费', '多少钱', '费用', '售价'],
  '多少钱': ['价格', '收费', '费用'],
  '购买': ['买', '下单', '订购'],
  '登录': ['登陆', '登入', '进入后台'],
  '系统': ['平台', '后台', '软件'],
  '手机': ['设备', 'AI手机'],
  '更新': ['升级', '版本更新'],
  '问题': ['故障', 'bug', '报错', '出错'],
};

// 中文分词（bigram + 同义词扩展）
function tokenize(text) {
  if (!text) return [];
  const cleaned = text.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, ' ').toLowerCase();
  const tokens = [];
  // 英文单词
  const englishWords = cleaned.match(/[a-z0-9]+/g) || [];
  tokens.push(...englishWords);
  // 中文：bigram + trigram
  const chinese = cleaned.replace(/[^\u4e00-\u9fa5]/g, '');
  for (let i = 0; i < chinese.length - 1; i++) {
    tokens.push(chinese.slice(i, i + 2));
  }
  for (let i = 0; i < chinese.length - 2; i++) {
    tokens.push(chinese.slice(i, i + 3));
  }
  // 单字
  for (const char of chinese) {
    tokens.push(char);
  }
  // 同义词扩展
  const expanded = [];
  for (const token of tokens) {
    expanded.push(token);
    if (SYNONYMS[token]) {
      expanded.push(...SYNONYMS[token]);
    }
  }
  return expanded.filter(t => t.length > 0);
}

// BM25 索引
class BM25Index {
  constructor() {
    this.docs = []; // {id, tokens, length}
    this.df = {};   // document frequency
    this.totalDocs = 0;
    this.avgDocLen = 0;
  }

  build(items) {
    this.docs = [];
    this.df = {};
    this.totalDocs = items.length;
    let totalLen = 0;

    for (const item of items) {
      const tokens = tokenize(item.title + ' ' + item.content);
      this.docs.push({ id: item.id, tokens, length: tokens.length });
      totalLen += tokens.length;

      const uniqueTokens = new Set(tokens);
      for (const t of uniqueTokens) {
        this.df[t] = (this.df[t] || 0) + 1;
      }
    }
    this.avgDocLen = this.docs.reduce((sum, d) => sum + d.length, 0) / this.totalDocs;
  }

  search(query, topK = 5) {
    const queryTokens = tokenize(query);
    if (queryTokens.length === 0) return [];

    const scores = this.docs.map(doc => {
      let score = 0;
      const tf = {};
      for (const t of doc.tokens) tf[t] = (tf[t] || 0) + 1;

      for (const qt of queryTokens) {
        if (!tf[qt]) continue;
        const termFreq = tf[qt];
        const docFreq = this.df[qt] || 0;
        const idf = Math.log((this.totalDocs - docFreq + 0.5) / (docFreq + 0.5) + 1);
        const tfNorm = (termFreq * (BM25_K1 + 1)) / (termFreq + BM25_K1 * (1 - BM25_B + BM25_B * doc.length / this.avgDocLen));
        score += idf * tfNorm;
      }
      return { id: doc.id, score };
    });

    return scores.sort((a, b) => b.score - a.score).slice(0, topK);
  }
}

/**
 * 调用 Embedding API（同步，通过 curl）
 * @param {string} text - 要嵌入的文本
 * @param {object} config - {provider, apiKey, baseUrl, model}
 * @returns {Float32Array|null} 嵌入向量
 */
function callEmbeddingAPI(text, config) {
  const url = config.baseUrl || getEmbeddingUrl(config.provider);
  if (!url || !config.apiKey) return null;

  const model = config.model || EMBEDDING_MODELS[config.provider] || 'deepseek-embedding';
  const body = JSON.stringify({
    model,
    input: text.slice(0, 8000), // 截断超长文本
  });

  try {
    const result = execSync(`curl -s -X POST "${url}" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer ${config.apiKey}" \
      -d '${body.replace(/'/g, "'\''")}'`, {
      encoding: 'utf-8',
      timeout: 30000,
    });

    const json = JSON.parse(result);
    if (json.data && json.data[0] && json.data[0].embedding) {
      return new Float32Array(json.data[0].embedding);
    }
    if (json.error) {
      console.warn('Embedding API 错误:', json.error.message || json.error);
    }
    return null;
  } catch (e) {
    console.warn('Embedding API 调用失败:', e.message);
    return null;
  }
}

/**
 * 批量调用 Embedding API
 * @param {string[]} texts - 文本数组
 * @param {object} config - API 配置
 * @returns {Float32Array[]} 嵌入向量数组（失败的用 null 占位）
 */
function callEmbeddingBatch(texts, config) {
  const url = config.baseUrl || getEmbeddingUrl(config.provider);
  if (!url || !config.apiKey) return texts.map(() => null);

  const model = config.model || EMBEDDING_MODELS[config.provider] || 'deepseek-embedding';
  const results = new Array(texts.length).fill(null);

  // 分批处理
  for (let i = 0; i < texts.length; i += EMBEDDING_BATCH_SIZE) {
    const batch = texts.slice(i, i + EMBEDDING_BATCH_SIZE);
    const body = JSON.stringify({
      model,
      input: batch.map(t => t.slice(0, 8000)),
    });

    try {
      const result = execSync(`curl -s -X POST "${url}" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer ${config.apiKey}" \
        -d '${body.replace(/'/g, "'\''")}'`, {
        encoding: 'utf-8',
        timeout: 60000,
      });

      const json = JSON.parse(result);
      if (json.data) {
        // 按 index 排序并填充结果
        for (const item of json.data) {
          results[i + item.index] = new Float32Array(item.embedding);
        }
      }
      if (json.error) {
        console.warn('Embedding 批量 API 错误:', json.error.message || json.error);
      }
    } catch (e) {
      console.warn('Embedding 批量 API 调用失败:', e.message);
    }

    // 批次间隔，避免限流
    if (i + EMBEDDING_BATCH_SIZE < texts.length) {
      try { execSync('sleep 1'); } catch {}
    }
  }

  return results;
}

/**
 * 从 settings 读取 Embedding 配置
 * 支持独立的 embedding 配置，回退到通用 ai 配置
 */
function getEmbeddingConfig() {
  const db = getDb();
  const rows = db.prepare(
    "SELECT key, value FROM settings WHERE key IN ('embedding_provider','embedding_api_key','embedding_base_url','embedding_model','ai_provider','ai_api_key','ai_base_url')"
  ).all();
  const config = {};
  for (const row of rows) config[row.key] = row.value;
  return {
    provider: config.embedding_provider || config.ai_provider || 'deepseek',
    apiKey: config.embedding_api_key || config.ai_api_key || '',
    baseUrl: config.embedding_base_url || '',
    model: config.embedding_model || '',
  };
}

// 向量索引（使用真实 Embedding API）
class VectorIndex {
  constructor() {
    this.dimension = EMBEDDING_DIMENSION;
  }

  initTable(db) {
    ensureVec(db);
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_vec USING vec0(
        id INTEGER PRIMARY KEY,
        embedding float[${this.dimension}]
      );
    `);
  }

  /**
   * 重建向量表（维度变化时删除重建）
   */
  rebuildTable(db) {
    ensureVec(db);
    try {
      // 检查现有表的维度
      const info = db.prepare("SELECT sql FROM sqlite_master WHERE name = 'knowledge_vec'").get();
      if (info && !info.sql.includes(`float[${this.dimension}]`)) {
        console.log(`向量表维度变化，重建表 (${this.dimension}维)`);
        db.prepare('DROP TABLE IF EXISTS knowledge_vec').run();
      }
    } catch {}
    this.initTable(db);
  }

  upsert(db, id, text, embedding) {
    if (!embedding) return false;
    const intId = Math.floor(Number(id));
    if (isNaN(intId) || intId <= 0) return false;
    try {
      db.prepare('DELETE FROM knowledge_vec WHERE id = ' + intId).run();
      db.prepare('INSERT INTO knowledge_vec (id, embedding) VALUES (' + intId + ', ?)').run(
        Buffer.from(embedding.buffer)
      );
      return true;
    } catch (e) {
      return false;
    }
  }

  search(db, queryVector, topK = 5) {
    ensureVec(db);
    if (!queryVector) return [];
    try {
      const results = db.prepare(`
        SELECT id, distance FROM knowledge_vec WHERE embedding MATCH ? ORDER BY distance LIMIT ?
      `).all(Buffer.from(queryVector.buffer), topK);
      return results.map(r => ({ id: r.id, score: 1 - r.distance }));
    } catch (e) {
      return [];
    }
  }
}

// 全局实例
let bm25Index = null;
const vectorIndex = new VectorIndex();

// ===== 文档拆分 (Chunking) =====
const CHUNK_MAX_CHARS = 400; // 每块最大字符数
const CHUNK_OVERLAP = 50;    // 块之间重叠字符数

/**
 * 将长文本按段落拆分成小块
 * 优先按段落拆分，段落太长则按句子拆分
 * @param {string} text - 原始文本
 * @param {number} maxChars - 每块最大字符数
 * @returns {string[]} 拆分后的文本块
 */
function chunkText(text, maxChars = CHUNK_MAX_CHARS) {
  if (!text || text.length <= maxChars) return [text];

  const chunks = [];
  // 按段落拆分（双换行）
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim());

  let current = '';
  for (const para of paragraphs) {
    if (current.length + para.length + 1 <= maxChars) {
      current = current ? current + '\n\n' + para : para;
    } else {
      if (current) chunks.push(current);
      // 单个段落超长，按句子拆分
      if (para.length > maxChars) {
        const sentences = para.split(/(?<=[。！？.!?\n])/).filter(s => s.trim());
        let sentBuf = '';
        for (const sent of sentences) {
          if (sentBuf.length + sent.length <= maxChars) {
            sentBuf += sent;
          } else {
            if (sentBuf) chunks.push(sentBuf);
            sentBuf = sent;
          }
        }
        if (sentBuf) current = sentBuf;
        else current = '';
      } else {
        current = para;
      }
    }
  }
  if (current) chunks.push(current);

  // 添加重叠：每块末尾保留 overlap 字符到下一块开头
  if (CHUNK_OVERLAP > 0 && chunks.length > 1) {
    const overlapped = [chunks[0]];
    for (let i = 1; i < chunks.length; i++) {
      const prevTail = chunks[i - 1].slice(-CHUNK_OVERLAP);
      overlapped.push(prevTail + chunks[i]);
    }
    return overlapped;
  }

  return chunks;
}

/**
 * 将知识条目拆分成可索引的块
 * 短文档不拆分，长文档按段落拆分
 * @param {object} item - {id, title, content, category, source}
 * @returns {object[]} 拆分后的块数组 [{id, title, content, source}]
 */
function chunkItem(item) {
  const fullText = item.content || '';
  if (fullText.length <= CHUNK_MAX_CHARS) {
    // 短文档不拆分
    return [{
      id: item.id,
      title: item.title,
      content: item.title + ' ' + fullText,
      source: item.source,
      category: item.category,
    }];
  }

  const chunks = chunkText(fullText);
  return chunks.map((chunk, i) => ({
    // 用 id * 1000 + chunkIndex 作为块 ID
    id: item.id * 1000 + i,
    title: item.title + (chunks.length > 1 ? ` (第${i + 1}/${chunks.length}部分)` : ''),
    content: item.title + ' ' + chunk,
    source: item.source,
    category: item.category,
    parentId: item.id,
  }));
}

/**
 * 重建索引
 * 同时索引 ai_knowledge、tutorials（已发布）、faqs（激活状态）
 */
// 块内容缓存（chunkId -> {title, content, category}）
let chunkContentCache = {};

/**
 * 重建索引
 * @param {boolean} forceVectors - 强制重建向量（CRUD 操作后需要）
 */
function rebuildIndex(forceVectors = false) {
  const db = getDb();

  // 1. ai_knowledge 表
  const knowledgeItems = db.prepare(
    "SELECT id, title, content, category FROM ai_knowledge WHERE status = 'active'"
  ).all().map(item => ({
    ...item,
    source: 'knowledge',
  }));

  // 2. tutorials 表（已发布教程）
  const tutorialItems = db.prepare(
    "SELECT id, title, content, category FROM tutorials WHERE status = 'published'"
  ).all().map(item => ({
    ...item,
    // 教程 id 加偏移避免与 ai_knowledge 冲突
    id: 100000 + item.id,
    source: 'tutorial',
  }));

  // 3. faqs 表（激活状态）
  const faqItems = db.prepare(
    "SELECT id, question as title, answer as content, category FROM faqs WHERE status = 'active'"
  ).all().map(item => ({
    ...item,
    id: 200000 + item.id,
    source: 'faq',
  }));

  // 合并所有数据源
  const rawItems = [...knowledgeItems, ...tutorialItems, ...faqItems];

  // 拆分长文档
  const allItems = [];
  let chunkCount = 0;
  for (const item of rawItems) {
    const chunks = chunkItem(item);
    allItems.push(...chunks);
    if (chunks.length > 1) chunkCount++;
  }
  if (chunkCount > 0) {
    console.log(`文档拆分: ${chunkCount} 篇长文档被拆分成 ${allItems.length} 个块`);
  }

  // 更新块内容缓存
  chunkContentCache = {};
  for (const item of allItems) {
    chunkContentCache[item.id] = {
      title: item.title,
      content: item.content,
      category: item.category,
    };
  }

  // 重建 BM25
  bm25Index = new BM25Index();
  bm25Index.build(allItems);

  // 重建向量（使用真实 Embedding API）
  try {
    vectorIndex.rebuildTable(db);

    // 检查是否需要重建向量（避免每次启动都调 API）
    const currentVecCount = db.prepare('SELECT COUNT(*) as cnt FROM knowledge_vec').get().cnt;
    if (!forceVectors && currentVecCount >= allItems.length) {
      console.log(`向量索引已存在 (${currentVecCount} 条)，跳过重建`);
    } else {
      // 清空旧数据并重建
      try { db.prepare('DELETE FROM knowledge_vec').run(); } catch {}

      // 准备批量文本
      const texts = allItems.map(item => item.title + ' ' + item.content);
      const embedConfig = getEmbeddingConfig();

      if (embedConfig.apiKey) {
        console.log(`正在调用 ${embedConfig.provider} Embedding API，共 ${texts.length} 条...`);
        const embeddings = callEmbeddingBatch(texts, embedConfig);

        let successCount = 0;
        for (let i = 0; i < allItems.length; i++) {
          if (embeddings[i] && vectorIndex.upsert(db, allItems[i].id, allItems[i].title, embeddings[i])) {
            successCount++;
          }
        }
        console.log(`向量索引已建立: ${successCount}/${allItems.length} 条成功`);
      } else {
        console.warn('未配置 AI API Key，跳过向量索引构建（仅使用 BM25）');
      }
    }
  } catch (e) {
    console.warn('向量索引初始化失败（不影响 BM25 检索）:', e.message);
  }

  console.log(`RAG 索引已重建: ${allItems.length} 条 (知识库${knowledgeItems.length} + 教程${tutorialItems.length} + FAQ${faqItems.length})`);
  return allItems.length;
}

/**
 * 混合检索：BM25 + 向量，加权合并
 * @param {string} query - 用户问题
 * @param {number} topK - 返回条数
 * @returns {Array} [{id, title, content, score}]
 */
function retrieve(query, topK = 5) {
  const db = getDb();

  // 确保索引已建
  if (!bm25Index) rebuildIndex();

  // BM25 检索
  const bm25Results = bm25Index.search(query, topK * 2);

  // 向量检索（使用真实 Embedding API）
  let vecResults = [];
  try {
    const embedConfig = getEmbeddingConfig();
    if (embedConfig.apiKey) {
      const queryVector = callEmbeddingAPI(query, embedConfig);
      if (queryVector) {
        vecResults = vectorIndex.search(db, queryVector, topK * 2);
      }
    }
  } catch {}

  // 合并分数（加权：BM25 0.6 + 向量 0.4）
  const scoreMap = {};
  for (const r of bm25Results) {
    scoreMap[r.id] = (scoreMap[r.id] || 0) + r.score * 0.6;
  }
  for (const r of vecResults) {
    scoreMap[r.id] = (scoreMap[r.id] || 0) + r.score * 0.4;
  }

  // 排序取 Top-K
  const sorted = Object.entries(scoreMap)
    .map(([id, score]) => ({ id: Number(id), score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  // 获取知识条目详情
  if (sorted.length === 0) return [];

  const itemMap = {};

  // 先从块缓存中查找
  const uncachedIds = [];
  for (const s of sorted) {
    if (chunkContentCache[s.id]) {
      itemMap[s.id] = chunkContentCache[s.id];
    } else {
      uncachedIds.push(s);
    }
  }

  // 缓存未命中的，按 ID 范围查数据库
  const knowledgeIds = uncachedIds.filter(s => s.id < 100000).map(s => s.id);
  const tutorialIds = uncachedIds.filter(s => s.id >= 100000 && s.id < 200000).map(s => s.id - 100000);
  const faqIds = uncachedIds.filter(s => s.id >= 200000).map(s => s.id - 200000);

  if (knowledgeIds.length > 0) {
    const ph = knowledgeIds.map(() => '?').join(',');
    const rows = db.prepare(`SELECT id, title, content, category FROM ai_knowledge WHERE id IN (${ph}) AND status = 'active'`).all(...knowledgeIds);
    for (const r of rows) itemMap[r.id] = r;
  }
  if (tutorialIds.length > 0) {
    const ph = tutorialIds.map(() => '?').join(',');
    const rows = db.prepare(`SELECT id, title, content, category FROM tutorials WHERE id IN (${ph}) AND status = 'published'`).all(...tutorialIds);
    for (const r of rows) itemMap[100000 + r.id] = r;
  }
  if (faqIds.length > 0) {
    const ph = faqIds.map(() => '?').join(',');
    const rows = db.prepare(`SELECT id, question as title, answer as content, category FROM faqs WHERE id IN (${ph}) AND status = 'active'`).all(...faqIds);
    for (const r of rows) itemMap[200000 + r.id] = r;
  }

  return sorted
    .filter(s => itemMap[s.id])
    .map(s => {
      const item = itemMap[s.id];
      // 从内容中提取图片 URL
      const images = [];
      const content = item.content || '';
      // Markdown 图片: ![alt](url)
      const mdImgs = content.match(/!\[.*?\]\((https?:\/\/[^)]+)\)/g) || [];
      for (const m of mdImgs) {
        const url = m.match(/\((https?:\/\/[^)]+)\)/);
        if (url) images.push(url[1]);
      }
      // HTML img: <img src="url">
      const htmlImgs = content.match(/<img[^>]+src=["'](https?:\/\/[^"']+)["'][^>]*>/gi) || [];
      for (const m of htmlImgs) {
        const url = m.match(/src=["'](https?:\/\/[^"']+)["']/i);
        if (url) images.push(url[1]);
      }
      return { ...item, score: s.score, images: [...new Set(images)] };
    });
}

/**
 * 计算两个文本的相似度（基于 token 重叠率）
 * @returns {number} 0-1 之间的相似度
 */
function similarity(textA, textB) {
  const tokensA = new Set(tokenize(textA));
  const tokensB = new Set(tokenize(textB));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;
  let overlap = 0;
  for (const t of tokensA) {
    if (tokensB.has(t)) overlap++;
  }
  // Jaccard 相似度
  const union = new Set([...tokensA, ...tokensB]).size;
  return union > 0 ? overlap / union : 0;
}

/**
 * 查找与给定问题相似的已有自动学习条目（使用语义匹配，非 token 匹配）
 * @param {string} question - 用户问题
 * @param {number} threshold - 相似度阈值（默认 2.0，BM25 分数）
 * @returns {object|null} 相似条目或 null
 */
function findSimilarLearned(question, threshold = 2.0) {
  const db = getDb();

  // 确保索引已建
  if (!bm25Index) rebuildIndex();

  // 用 BM25 语义检索（已包含同义词扩展）
  const bm25Results = bm25Index.search(question, 10);

  // 过滤出自动学习的条目
  for (const result of bm25Results) {
    if (result.score < threshold) break;

    // 块 ID -> 原始 ID
    const parentId = result.id >= 100000000 ? Math.floor(result.id / 1000) : result.id;

    // 查数据库确认是自动学习条目
    const item = db.prepare(
      "SELECT id, title, content FROM ai_knowledge WHERE id = ? AND category = '自动学习' AND status = 'active'"
    ).get(parentId);

    if (item) {
      return { ...item, score: result.score };
    }
  }

  return null;
}

/**
 * 清理自动学习条目：合并相似内容，淘汰超限条目
 * @param {number} maxCount - 最大保留条数（默认 200）
 */
function cleanupLearned(maxCount = 200) {
  const db = getDb();
  const items = db.prepare(
    "SELECT id, title, content FROM ai_knowledge WHERE category = '自动学习' AND status = 'active' ORDER BY updated_at DESC"
  ).all();

  if (items.length === 0) return { merged: 0, removed: 0 };

  let merged = 0;
  const toDelete = new Set();

  // 第一步：合并相似条目
  for (let i = 0; i < items.length; i++) {
    if (toDelete.has(items[i].id)) continue;
    for (let j = i + 1; j < items.length; j++) {
      if (toDelete.has(items[j].id)) continue;
      const score = similarity(items[i].title, items[j].title);
      if (score >= 0.4) {
        // 把 j 的回答追加到 i，删除 j
        const existingContent = items[i].content;
        const newAnswer = items[j].content.replace(/^用户问题：.*?\n\n参考回答：/s, '');
        if (newAnswer && !existingContent.includes(newAnswer.slice(0, 50))) {
          db.prepare('UPDATE ai_knowledge SET content = content || ? WHERE id = ?')
            .run('\n\n补充回答：' + newAnswer, items[i].id);
        }
        toDelete.add(items[j].id);
        merged++;
      }
    }
  }

  // 批量删除被合并的条目
  if (toDelete.size > 0) {
    const placeholders = Array.from(toDelete).map(() => '?').join(',');
    db.prepare(`DELETE FROM ai_knowledge WHERE id IN (${placeholders})`).run(...toDelete);
  }

  // 第二步：超限淘汰（删除最旧的）
  let removed = 0;
  const remaining = db.prepare(
    "SELECT COUNT(*) as cnt FROM ai_knowledge WHERE category = '自动学习' AND status = 'active'"
  ).get().cnt;

  if (remaining > maxCount) {
    const excess = remaining - maxCount;
    const oldItems = db.prepare(
      "SELECT id FROM ai_knowledge WHERE category = '自动学习' AND status = 'active' ORDER BY updated_at ASC LIMIT ?"
    ).all(excess);
    if (oldItems.length > 0) {
      const placeholders = oldItems.map(() => '?').join(',');
      db.prepare(`DELETE FROM ai_knowledge WHERE id IN (${placeholders})`).run(...oldItems.map(i => i.id));
      removed = oldItems.length;
    }
  }

  return { merged, removed };
}

module.exports = { retrieve, rebuildIndex, tokenize, similarity, findSimilarLearned, cleanupLearned };
