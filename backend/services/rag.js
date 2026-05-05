/**
 * RAG 检索服务 — 混合检索（BM25 + 向量）+ Re-ranking
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

// 向量索引（使用 sqlite-vec）
class VectorIndex {
  constructor() {
    this.dimension = 128; // 特征哈希维度
  }

  /**
   * 简单特征哈希：将文本转为固定维度向量
   * 用 SimHash 思想，对中文和英文都有效
   */
  textToVector(text) {
    const tokens = tokenize(text);
    const vector = new Float32Array(this.dimension);
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      // 简单哈希
      let hash = 0;
      for (let j = 0; j < token.length; j++) {
        hash = ((hash << 5) - hash + token.charCodeAt(j)) | 0;
      }
      const idx = Math.abs(hash) % this.dimension;
      // 使用 +/-1 投影（特征哈希）
      vector[idx] += (hash > 0 ? 1 : -1);
    }
    // L2 归一化
    let norm = 0;
    for (let i = 0; i < this.dimension; i++) norm += vector[i] * vector[i];
    norm = Math.sqrt(norm) || 1;
    for (let i = 0; i < this.dimension; i++) vector[i] /= norm;
    return vector;
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

  upsert(db, id, text) {
    const vector = this.textToVector(text);
    const intId = Math.floor(Number(id));
    if (isNaN(intId) || intId <= 0) return;
    // 先删除旧的
    try { db.prepare('DELETE FROM knowledge_vec WHERE id = ' + intId).run(); } catch {}
    // 插入新的（sqlite-vec 要求主键必须是字面量整数，不能用参数绑定）
    db.prepare('INSERT INTO knowledge_vec (id, embedding) VALUES (' + intId + ', ?)').run(Buffer.from(vector.buffer));
  }

  search(db, queryText, topK = 5) {
    ensureVec(db);
    const queryVector = this.textToVector(queryText);
    try {
      const results = db.prepare(`
        SELECT id, distance FROM knowledge_vec WHERE embedding MATCH ? ORDER BY distance LIMIT ?
      `).all(Buffer.from(queryVector.buffer), topK);
      return results.map(r => ({ id: r.id, score: 1 - r.distance })); // distance -> similarity
    } catch (e) {
      // 如果向量表还没建好，返回空
      return [];
    }
  }
}

// 全局实例
let bm25Index = null;
const vectorIndex = new VectorIndex();

/**
 * 重建索引
 * 同时索引 ai_knowledge、tutorials（已发布）、faqs（激活状态）
 */
function rebuildIndex() {
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
  const allItems = [...knowledgeItems, ...tutorialItems, ...faqItems];

  // 重建 BM25
  bm25Index = new BM25Index();
  bm25Index.build(allItems);

  // 重建向量
  try {
    vectorIndex.initTable(db);
    // 清空旧数据
    try { db.prepare('DELETE FROM knowledge_vec').run(); } catch {}
    let vecCount = 0;
    for (const item of allItems) {
      try {
        vectorIndex.upsert(db, item.id, item.title + ' ' + item.content);
        vecCount++;
      } catch (e) {
        // 单条失败不影响其他条目
      }
    }
    if (vecCount < allItems.length) {
      console.warn('向量索引: ' + (allItems.length - vecCount) + ' 条插入失败，已跳过');
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

  // 向量检索
  let vecResults = [];
  try {
    vecResults = vectorIndex.search(db, query, topK * 2);
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

  // 获取知识条目详情（根据 ID 范围区分数据源）
  if (sorted.length === 0) return [];

  const itemMap = {};

  // 按 ID 范围分组查询
  const knowledgeIds = sorted.filter(s => s.id < 100000).map(s => s.id);
  const tutorialIds = sorted.filter(s => s.id >= 100000 && s.id < 200000).map(s => s.id - 100000);
  const faqIds = sorted.filter(s => s.id >= 200000).map(s => s.id - 200000);

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
    .map(s => ({ ...itemMap[s.id], score: s.score }));
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
 * 查找与给定问题相似的已有自动学习条目
 * @param {string} question - 用户问题
 * @param {number} threshold - 相似度阈值（默认 0.35）
 * @returns {object|null} 相似条目或 null
 */
function findSimilarLearned(question, threshold = 0.35) {
  const db = getDb();
  const existing = db.prepare(
    "SELECT id, title, content FROM ai_knowledge WHERE category = '自动学习' AND status = 'active'"
  ).all();

  let bestMatch = null;
  let bestScore = 0;

  for (const item of existing) {
    const score = similarity(question, item.title);
    if (score > bestScore && score >= threshold) {
      bestScore = score;
      bestMatch = item;
    }
  }

  return bestMatch ? { ...bestMatch, score: bestScore } : null;
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
