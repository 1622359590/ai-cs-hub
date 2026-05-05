/**
 * 文档解析服务 — 支持 Excel、Word、CSV、TXT 导入为知识条目
 */
const XLSX = require('xlsx');
const mammoth = require('mammoth');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * 解析 Excel 文件 → 知识条目数组
 * 支持 .xlsx / .xls
 * 格式要求：第一行为表头，至少有"标题"和"内容"列
 * 也支持简单的两列格式（第一列标题，第二列内容）
 */
function parseExcel(filePath) {
  const workbook = XLSX.readFile(filePath);
  const items = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

    if (rows.length < 2) continue;

    const header = rows[0].map(h => String(h).trim().toLowerCase());

    // 尝试识别列
    const titleIdx = header.findIndex(h => h.includes('标题') || h.includes('title') || h === '问题' || h === 'question');
    const contentIdx = header.findIndex(h => h.includes('内容') || h.includes('content') || h === '答案' || h === 'answer');
    const categoryIdx = header.findIndex(h => h.includes('分类') || h.includes('category') || h.includes('类别'));

    // 如果没找到标准表头，用前两列
    const tIdx = titleIdx >= 0 ? titleIdx : 0;
    const cIdx = contentIdx >= 0 ? contentIdx : 1;
    const catIdx = categoryIdx >= 0 ? categoryIdx : -1;

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const title = String(row[tIdx] || '').trim();
      const content = String(row[cIdx] || '').trim();

      if (!title && !content) continue;

      items.push({
        title: title || `第${i}条`,
        content: content,
        category: catIdx >= 0 ? String(row[catIdx] || '').trim() : '',
      });
    }
  }

  return items;
}

/**
 * 解析 Word 文件 → 知识条目数组
 * 支持 .docx，自动提取图片并保存
 * @param {string} filePath - 文件路径
 * @param {string} uploadsDir - 图片保存目录
 * @param {string} baseUrl - 图片访问基础URL
 */
async function parseWord(filePath, uploadsDir, baseUrl) {
  const buffer = fs.readFileSync(filePath);
  const imageMap = {}; // base64Src → 本地URL

  // 提取图片
  const imageResult = await mammoth.convertToHtml({
    buffer,
    convertImage: mammoth.images.imgElement(async (image) => {
      try {
        const imgBuffer = await image.read();
        const ext = image.contentType?.split('/')[1] || 'png';
        const hash = crypto.createHash('md5').update(imgBuffer).digest('hex').slice(0, 12);
        const filename = `doc_${hash}.${ext}`;
        const savePath = path.join(uploadsDir, filename);

        // 保存图片文件
        if (!fs.existsSync(savePath)) {
          fs.writeFileSync(savePath, imgBuffer);
        }

        const imageUrl = `${baseUrl}/${filename}`;
        return { src: imageUrl };
      } catch (e) {
        console.warn('图片提取失败:', e.message);
        return { src: '' };
      }
    }),
  });

  const html = imageResult.value;

  // 按 h1/h2 标签分段（保留HTML格式，含图片）
  const sections = splitByHeadings(html);

  if (sections.length > 1) {
    return sections.filter(s => s.title.trim()).map(s => ({
      title: s.title.trim(),
      content: htmlToMarkdown(s.content).trim(),
      category: '',
    }));
  }

  // 没有标题结构，整篇作为一条
  const markdown = htmlToMarkdown(html).trim();
  if (!markdown) return [];

  const lines = markdown.split('\n').filter(l => l.trim());
  const title = lines[0]?.replace(/^[#*\s]+/, '').slice(0, 100) || '导入文档';
  const content = lines.length > 1 ? lines.slice(1).join('\n').trim() : markdown;

  return [{ title, content, category: '' }];
}

/**
 * 解析 CSV 文件 → 知识条目数组
 */
function parseCSV(filePath) {
  const content = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
  const lines = content.split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];

  const header = lines[0].split(',').map(h => h.trim().replace(/"/g, '').toLowerCase());
  const titleIdx = header.findIndex(h => h.includes('标题') || h.includes('title') || h === '问题');
  const contentIdx = header.findIndex(h => h.includes('内容') || h.includes('content') || h === '答案');
  const categoryIdx = header.findIndex(h => h.includes('分类') || h.includes('category'));

  const tIdx = titleIdx >= 0 ? titleIdx : 0;
  const cIdx = contentIdx >= 0 ? contentIdx : 1;
  const catIdx = categoryIdx >= 0 ? categoryIdx : -1;

  const items = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]);
    const title = (cols[tIdx] || '').trim();
    const content = (cols[cIdx] || '').trim();
    if (!title && !content) continue;
    items.push({
      title: title || `第${i}条`,
      content,
      category: catIdx >= 0 ? (cols[catIdx] || '').trim() : '',
    });
  }
  return items;
}

/**
 * 解析 TXT 文件 → 知识条目数组
 * 按空行分段，每段第一行作为标题
 */
function parseTXT(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const blocks = content.split(/\n\s*\n/).filter(b => b.trim());
  if (blocks.length === 0) return [];

  return blocks.map((block, i) => {
    const lines = block.split('\n').filter(l => l.trim());
    const title = lines[0]?.trim().slice(0, 100) || `第${i + 1}条`;
    const body = lines.length > 1 ? lines.slice(1).join('\n').trim() : '';
    return { title, content: body || title, category: '' };
  });
}

// === 工具函数 ===

function splitByHeadings(html) {
  const parts = html.split(/<h[12][^>]*>(.*?)<\/h[12]>/gi);
  const sections = [];
  for (let i = 1; i < parts.length; i += 2) {
    sections.push({
      title: parts[i].replace(/<[^>]+>/g, ''),
      content: parts[i + 1] || '',
    });
  }
  return sections;
}

function htmlToPlainText(html) {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * HTML → Markdown（保留图片、链接等格式）
 */
function htmlToMarkdown(html) {
  return html
    // 图片
    .replace(/<img[^>]*src=["']([^"']*)["'][^>]*alt=["']([^"']*)["'][^>]*\/?>/gi, '![$2]($1)')
    .replace(/<img[^>]*src=["']([^"']*)["'][^>]*\/?>/gi, '![]($1)')
    // 标题
    .replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n')
    .replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n')
    .replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n')
    .replace(/<h4[^>]*>(.*?)<\/h4>/gi, '#### $1\n')
    // 加粗、斜体
    .replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**')
    .replace(/<b[^>]*>(.*?)<\/b>/gi, '**$1**')
    .replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*')
    .replace(/<i[^>]*>(.*?)<\/i>/gi, '*$1*')
    // 链接
    .replace(/<a[^>]*href=["']([^"']*)["'][^>]*>(.*?)<\/a>/gi, '[$2]($1)')
    // 列表
    .replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n')
    .replace(/<\/ul>/gi, '\n')
    .replace(/<\/ol>/gi, '\n')
    // 段落和换行
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<p[^>]*>/gi, '')
    // 表格（简化处理）
    .replace(/<th[^>]*>(.*?)<\/th>/gi, '| $1 ')
    .replace(/<td[^>]*>(.*?)<\/td>/gi, '| $1 ')
    .replace(/<\/tr>/gi, '|\n')
    .replace(/<table[^>]*>/gi, '\n')
    .replace(/<\/table>/gi, '\n')
    // 清除剩余标签
    .replace(/<[^>]+>/g, '')
    // HTML实体
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#x201C;|&#x201D;/g, '"')
    .replace(/&#x2018;|&#x2019;/g, "'")
    // 清理多余空行
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

/**
 * 根据文件扩展名自动选择解析器
 * @param {string} filePath - 文件路径
 * @param {string} uploadsDir - 图片保存目录（仅Word需要）
 * @param {string} baseUrl - 图片访问基础URL（仅Word需要）
 */
async function parseDocument(filePath, uploadsDir, baseUrl) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.xlsx':
    case '.xls':
      return parseExcel(filePath);
    case '.docx':
      return await parseWord(filePath, uploadsDir, baseUrl);
    case '.csv':
      return parseCSV(filePath);
    case '.txt':
    case '.md':
      return parseTXT(filePath);
    default:
      throw new Error(`不支持的文件格式: ${ext}。支持 .xlsx .docx .csv .txt .md`);
  }
}

module.exports = { parseDocument, parseExcel, parseWord, parseCSV, parseTXT };
