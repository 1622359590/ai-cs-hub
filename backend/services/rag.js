/**
 * RAG 检索服务 — 混合检索（BM25 + 向量）+ Re-ranking
 * 向量检索使用真实 Embedding API（DeepSeek / OpenAI 兼容）
 */
const { getDb } = require('../database/schema');

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

// 命名空间前缀（用于 chunk ID，避免冲突）
const NS = { knowledge: 'k', tutorial: 't', faq: 'f' };

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

// 同义词映射（用于查询扩展）
const SYNONYMS = {
  '工单': ['工单', '工单', '问题', '反馈', '需求'],
  '教程': ['教程', '课程', '学习', '视频'],
  '客服': ['客服', '人工', '帮助', '支持'],
};

// 中文停用词
const STOP_WORDS = new Set([
  '的', '了', '是', '在', '我', '有', '和', '就', '不', '人', '都', '一',
  '一个', '上', '也', '很', '到', '说', '要', '去', '你', '会', '着', '没有',
  '看', '好', '自己', '这', '他', '么', '把', '那', '你', '它', '她', '哪',
  '如何', '怎么', '什么', '为什么', '可以', '能', '可以', '请', '求', '帮',
]);

/**
 * 分词（简单实现：中文逐字 + 英文按空格）
 */
function tokenize(text) {
  if (!text) return [];
  const tokens = [];
  // 匹配中文字符或英文单词
  const matches = text.match(/[\u4e00-\u9fff]|[a-zA-Z0-9]+/g) || [];
  for (const m of matches) {
    const lower = m.toLowerCase();
    if (!STOP_WORDS.has(lower) && lower.length > 0) {
      tokens.push(lower);
    }
  }
  return tokens;
}

/**
 * 查询扩展：添加同义词
 */
function expandQuery(query) {
  let expanded = query;
  for (const [key, synonyms] of Object.entries(SYNONYMS)) {
    if (query.includes(key)) {
      expanded += ' ' + synonyms.join(' ');
    }
  }
  return expanded;
}

// ===== BM25 索引 =====
class BM25Index {
  constructor() {
    this.docs = [];
    this.docCount = 0;
    this.avgDocLen = 0;
    this.docFreq = {}; // term -> 文档频率
    this.docLens = [];
    this.invertedIndex = {}; // term -> [{docIdx, tf}]
  }

  build(items) {
    this.docs = items;
    this.docCount = items.length;
    this.docFreq = {};
    this.invertedIndex = {};
    this.docLens = [];

    let totalLen = 0;
    for (let i = 0; i < items.length; i++) {
      const tokens = tokenize(items[i].title + ' ' + items[i].content);
      this.docLens.push(tokens.length);
      totalLen += tokens.length;

      // 统计词频
      const tf = {};
      for (const t of tokens) tf[t] = (tf[t] || 0) + 1;

      // 构建倒排索引
      for (const [term, freq] of Object.entries(tf)) {
        if (!this.invertedIndex[term]) this.invertedIndex[term] = [];
        this.invertedIndex[term].push({ docIdx: i, tf: freq });
        this.docFreq[term] = (this.docFreq[term] || 0) + 1;
      }
    }
    this.avgDocLen = totalLen / this.docCount || 1;
  }

  search(query, topK = 5) {
    const expandedQuery = expandQuery(query);
    const queryTokens = tokenize(expandedQuery);
    if (queryTokens.length === 0) return [];

    const scores = new Array(this.docCount).fill(0);

    for (const term of queryTokens) {
      const postings = this.invertedIndex[term] || [];
      const df = this.docFreq[term] || 0;
      if (df === 0) continue;

      // IDF 部分
      const idf = Math.log((this.docCount - df + 0.5) / (df + 0.5) + 1);

      for (const { docIdx, tf } of postings) {
        const docLen = this.docLens[docIdx];
        // BM25 公式
        const tfNorm = (tf * (BM25_K1 + 1)) / (tf + BM25_K1 * (1 - BM25_B + BM25_B * docLen / this.avgDocLen));
        scores[docIdx] += idf * tfNorm;
      }
    }

    // 排序取 Top-K
    const results = [];
    for (let i = 0; i < this.docCount; i++) {
      if (scores[i] > 0) {
        results.push({ id: this.docs[i].id, score: scores[i] });
      }
    }
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, topK);
  }
}

/**
 * 调用 Embedding API（异步，使用 fetch）
 * @param {string} text - 要嵌入的文本
 * @param {object} config - {provider, apiKey, baseUrl, model}
 * @returns {Promise<Float32Array|null>} 嵌入向量
 */
async function callEmbeddingAPI(text, config) {
  const url = config.baseUrl || getEmbeddingUrl(config.provider);
  if (!url || !config.apiKey) return null;

  const model = config.model || EMBEDDING_MODELS[config.provider] || 'deepseek-embedding';

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model,
        input: text.slice(0, 8000),
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!resp.ok) {
      console.warn('Embedding API HTTP 错误:', resp.status);
      return null;
    }

    const json = await resp.json();
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
 * 批量调用 Embedding API（异步）
 * @param {string[]} texts - 文本数组
 * @param {object} config - API 配置
 * @returns {Promise<Float32Array[]>} 嵌入向量数组（失败的用 null 占位）
 */
async function callEmbeddingBatch(texts, config) {
  const url = config.baseUrl || getEmbeddingUrl(config.provider);
  if (!url || !config.apiKey) return texts.map(() => null);

  const model = config.model || EMBEDDING_MODELS[config.provider] || 'deepseek-embedding';
  const results = new Array(texts.length).fill(null);

  // 分批处理
  for (let i = 0; i < texts.length; i += EMBEDDING_BATCH_SIZE) {
    const batch = texts.slice(i, i + EMBEDDING_BATCH_SIZE);

    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model,
          input: batch.map(t => t.slice(0, 8000)),
        }),
        signal: AbortSignal.timeout(60000),
      });

      if (!resp.ok) {
        console.warn('Embedding 批量 API HTTP 错误:', resp.status);
        continue;
      }

      const json = await resp.json();
      if (json.data) {
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
      await new Promise(r => setTimeout(r, 1000));
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

// ===== 向量索引（使用 sqlite-vec）=====
// 向量表用自增整数 ID，chunkMeta 映射 vectorId → {source, parentId, chunkIndex}
let vectorIdCounter = 0;
let chunkMeta = {}; // vectorId → {source, parentId, chunkIndex, chunkId}
let chunkIdToVectorId = {}; // chunkId → vectorId

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

  rebuildTable(db) {
    ensureVec(db);
    try {
      const info = db.prepare("SELECT sql FROM sqlite_master WHERE name = 'knowledge_vec'").get();
      if (info && !info.sql.includes(`float[${this.dimension}]`)) {
        console.log(`向量表维度变化，重建表 (${this.dimension}维)`);
        db.prepare('DROP TABLE IF EXISTS knowledge_vec').run();
      }
    } catch {}
    this.initTable(db);
  }

  upsert(db, vectorId, embedding) {
    if (!embedding) return false;
    try {
      db.prepare('DELETE FROM knowledge_vec WHERE id = ?').run(vectorId);
      db.prepare('INSERT INTO knowledge_vec (id, embedding) VALUES (?, ?)').run(
        vectorId,
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
      return results.map(r => ({ vectorId: r.id, score: 1 - r.distance }));
    } catch (e) {
      return [];
    }
  }
}

// 全局实例
let bm25Index = null;
const vectorIndex = new VectorIndex();

// ===== 文档拆分 (Chunking) =====
const CHUNK_MAX_CHARS = 400;
const CHUNK_OVERLAP = 50;

/**
 * 将长文本按段落拆分成小块
 */
function chunkText(text, maxChars = CHUNK_MAX_CHARS) {
  if (!text || text.length <= maxChars) return [text];

  const chunks = [];
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim());

  let current = '';
  for (const para of paragraphs) {
    if (current.length + para.length + 1 <= maxChars) {
      current = current ? current + '\n\n' + para : para;
    } else {
      if (current) chunks.push(current);
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
 * 使用字符串复合 ID: "{source}:{parentId}:{chunkIndex}" 避免命名空间冲突
 */
function chunkItem(item) {
  const fullText = item.content || '';
  const ns = NS[item.source] || 'k';

  if (fullText.length <= CHUNK_MAX_CHARS) {
    return [{
      chunkId: `${ns}:${item.id}:0`,
      source: item.source,
      parentId: item.id,
      chunkIndex: 0,
      title: item.title,
      content: item.title + ' ' + fullText,
      category: item.category,
    }];
  }

  const chunks = chunkText(fullText);
  return chunks.map((chunk, i) => ({
    chunkId: `${ns}:${item.id}:${i}`,
    source: item.source,
    parentId: item.id,
    chunkIndex: i,
    title: item.title + (chunks.length > 1 ? ` (第${i + 1}/${chunks.length}部分)` : ''),
    content: item.title + ' ' + chunk,
    category: item.category,
  }));
}

// 块内容缓存（chunkId → {title, content, category, source, parentId}）
let chunkContentCache = {};

/**
 * 重建索引（异步）
 * @param {boolean} forceVectors - 强制重建向量
 * @returns {Promise<number>} 索引条目数
 */
async function rebuildIndex(forceVectors = false) {
  const db = getDb();

  // 1. ai_knowledge 表
  const knowledgeItems = db.prepare(
    "SELECT id, title, content, category FROM ai_knowledge WHERE status = 'active'"
  ).all().map(item => ({ ...item, source: 'knowledge' }));

  // 2. tutorials 表（已发布教程）
  const tutorialItems = db.prepare(
    "SELECT id, title, content, category FROM tutorials WHERE status = 'published'"
  ).all().map(item => ({ ...item, source: 'tutorial' }));

  // 3. faqs 表（激活状态）
  const faqItems = db.prepare(
    "SELECT id, question as title, answer as content, category FROM faqs WHERE status = 'active'"
  ).all().map(item => ({ ...item, source: 'faq' }));

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
    chunkContentCache[item.chunkId] = {
      title: item.title,
      content: item.content,
      category: item.category,
      source: item.source,
      parentId: item.parentId,
    };
  }

  // 重建 BM25
  bm25Index = new BM25Index();
  bm25Index.build(allItems.map(item => ({ ...item, id: item.chunkId })));

  // 重建向量（使用真实 Embedding API）
  try {
    vectorIndex.rebuildTable(db);

    const currentVecCount = db.prepare('SELECT COUNT(*) as cnt FROM knowledge_vec').get().cnt;
    if (!forceVectors && currentVecCount >= allItems.length) {
      console.log(`向量索引已存在 (${currentVecCount} 条)，跳过重建`);
    } else {
      try { db.prepare('DELETE FROM knowledge_vec').run(); } catch {}

      // 重置映射
      vectorIdCounter = 0;
      chunkMeta = {};
      chunkIdToVectorId = {};

      const texts = allItems.map(item => item.title + ' ' + item.content);
      const embedConfig = getEmbeddingConfig();

      if (embedConfig.apiKey) {
        console.log(`正在调用 ${embedConfig.provider} Embedding API，共 ${texts.length} 条...`);
        const embeddings = await callEmbeddingBatch(texts, embedConfig);

        let successCount = 0;
        for (let i = 0; i < allItems.length; i++) {
          const vecId = ++vectorIdCounter;
          if (embeddings[i] && vectorIndex.upsert(db, vecId, embeddings[i])) {
            chunkMeta[vecId] = {
              source: allItems[i].source,
              parentId: allItems[i].parentId,
              chunkIndex: allItems[i].chunkIndex,
              chunkId: allItems[i].chunkId,
            };
            chunkIdToVectorId[allItems[i].chunkId] = vecId;
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
 * @returns {Promise<Array>} [{chunkId, title, content, score, source, parentId}]
 */
async function retrieve(query, topK = 5) {
  const db = getDb();

  if (!bm25Index) await rebuildIndex();

  // BM25 检索
  const bm25Results = bm25Index.search(query, topK * 2);

  // 向量检索
  let vecResults = [];
  try {
    const embedConfig = getEmbeddingConfig();
    if (embedConfig.apiKey) {
      const queryVector = await callEmbeddingAPI(query, embedConfig);
      if (queryVector) {
        const rawVecResults = vectorIndex.search(db, queryVector, topK * 2);
        // 将 vectorId 映射回 chunkId
        for (const r of rawVecResults) {
          const meta = chunkMeta[r.vectorId];
          if (meta) {
            vecResults.push({ id: meta.chunkId, score: r.score });
          }
        }
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

  const sorted = Object.entries(scoreMap)
    .map(([id, score]) => ({ chunkId: id, score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  if (sorted.length === 0) return [];

  // 获取详情
  const itemMap = {};
  const uncachedItems = [];

  for (const s of sorted) {
    if (chunkContentCache[s.chunkId]) {
      itemMap[s.chunkId] = chunkContentCache[s.chunkId];
    } else {
      uncachedItems.push(s);
    }
  }

  // 缓存未命中的，按来源查数据库
  const knowledgeParents = new Set();
  const tutorialParents = new Set();
  const faqParents = new Set();

  for (const s of uncachedItems) {
    const [source, parentId] = s.chunkId.split(':');
    const pid = Number(parentId);
    if (source === 'k') knowledgeParents.add(pid);
    else if (source === 't') tutorialParents.add(pid);
    else if (source === 'f') faqParents.add(pid);
  }

  if (knowledgeParents.size > 0) {
    const ids = [...knowledgeParents];
    const ph = ids.map(() => '?').join(',');
    const rows = db.prepare(`SELECT id, title, content, category FROM ai_knowledge WHERE id IN (${ph}) AND status = 'active'`).all(...ids);
    for (const r of rows) {
      itemMap[`k:${r.id}:0`] = { ...r, source: 'knowledge', parentId: r.id };
    }
  }
  if (tutorialParents.size > 0) {
    const ids = [...tutorialParents];
    const ph = ids.map(() => '?').join(',');
    const rows = db.prepare(`SELECT id, title, content, category FROM tutorials WHERE id IN (${ph}) AND status = 'published'`).all(...ids);
    for (const r of rows) {
      itemMap[`t:${r.id}:0`] = { ...r, source: 'tutorial', parentId: r.id };
    }
  }
  if (faqParents.size > 0) {
    const ids = [...faqParents];
    const ph = ids.map(() => '?').join(',');
    const rows = db.prepare(`SELECT id, question as title, answer as content, category FROM faqs WHERE id IN (${ph}) AND status = 'active'`).all(...ids);
    for (const r of rows) {
      itemMap[`f:${r.id}:0`] = { ...r, source: 'faq', parentId: r.id };
    }
  }

  return sorted
    .filter(s => itemMap[s.chunkId])
    .map(s => {
      const item = itemMap[s.chunkId];
      const images = [];
      const content = item.content || '';
      const mdImgs = content.match(/!\[.*?\]\((https?:\/\/[^)]+)\)/g) || [];
      for (const m of mdImgs) {
        const url = m.match(/\((https?:\/\/[^)]+)\)/);
        if (url) images.push(url[1]);
      }
      const htmlImgs = content.match(/<img[^>]+src=["'](https?:\/\/[^"']+)["'][^>]*>/gi) || [];
      for (const m of htmlImgs) {
        const url = m.match(/src=["'](https?:\/\/[^"']+)["']/i);
        if (url) images.push(url[1]);
      }
      return {
        title: item.title,
        content: item.content,
        category: item.category,
        source: item.source,
        parentId: item.parentId,
        score: s.score,
        images: [...new Set(images)],
      };
    });
}

/**
 * 计算两个文本的相似度
 */
function similarity(textA, textB) {
  const tokensA = new Set(tokenize(textA));
  const tokensB = new Set(tokenize(textB));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;
  let overlap = 0;
  for (const t of tokensA) {
    if (tokensB.has(t)) overlap++;
  }
  const union = new Set([...tokensA, ...tokensB]).size;
  return union > 0 ? overlap / union : 0;
}

/**
 * 查找与给定问题相似的已有自动学习条目
 */
async function findSimilarLearned(question, threshold = 2.0) {
  const db = getDb();

  if (!bm25Index) await rebuildIndex();

  const bm25Results = bm25Index.search(question, 10);

  for (const result of bm25Results) {
    if (result.score < threshold) break;

    // chunkId 格式: "k:{parentId}:{chunkIndex}"
    const parts = result.id.split(':');
    const parentId = Number(parts[1]);

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
 * 清理自动学习条目
 */
function cleanupLearned(maxCount = 200) {
  const db = getDb();
  const items = db.prepare(
    "SELECT id, title, content FROM ai_knowledge WHERE category = '自动学习' AND status = 'active' ORDER BY updated_at DESC"
  ).all();

  if (items.length === 0) return { merged: 0, removed: 0 };

  let merged = 0;
  const toDelete = new Set();

  for (let i = 0; i < items.length; i++) {
    if (toDelete.has(items[i].id)) continue;
    for (let j = i + 1; j < items.length; j++) {
      if (toDelete.has(items[j].id)) continue;
      const score = similarity(items[i].title, items[j].title);
      if (score >= 0.4) {
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

  if (toDelete.size > 0) {
    const placeholders = Array.from(toDelete).map(() => '?').join(',');
    db.prepare(`DELETE FROM ai_knowledge WHERE id IN (${placeholders})`).run(...toDelete);
  }

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
