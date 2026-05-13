# AI 工单系统

一站式 AI 知识教程 + 智能客服 + 工单管理平台

> **"未来将是无人工"**

---

## 关于本系统

<details>
<summary>🇬🇧 Click for English</summary>

This system was born from a very real pain point - **after-sales support overload**.

In daily operations, repetitive questions drain support teams: "How do I use this?" "Where do I configure that?" "Why is it broken?" Behind every question is a confused user, and behind every answer is a support agent's precious time.

So I built this system. The core idea: **AI-first support with human escalation.** Users first chat with the AI assistant powered by RAG knowledge retrieval. If AI can't solve it, one click converts the conversation into a structured ticket with full context - no more vague "help me check this" requests.

> **Less support anxiety, more product time.**

</details>

这套系统源于一个很现实的痛点--**售后压力**。

在公司日常运营中,大量重复的咨询问题占据了售后团队大部分精力:"这个怎么用?""那里怎么配置?""为什么出错了?" 每一个问题背后都是一个真实用户的困惑,也是一次售后人员的时间消耗。

所以我做了这个系统。核心思路:**AI 优先,人工兜底。** 用户遇到问题先问 AI 助手,AI 从知识库中检索答案;如果 AI 解决不了,一键转人工,对话记录自动带入工单,工程师直接看到完整上下文。

> 做这个系统的本心就一句话:**少一点售后焦虑,多一点产品时间。**

---

## 📋 更新日志

### 2026-05-06

#### 🧠 AI 自学习系统
- 用户对 AI 回复点 👍 时,自动保存问答对到知识库
- 智能去重:相似问题自动追加回答,不重复创建条目
- 每天凌晨自动清理:合并相似内容、淘汰超限条目(上限 200 条)
- 后台知识库新增「自动学习」分类,带 🧠 标记,可查看/编辑/删除

#### 📚 RAG 知识库增强
- 索引源扩展:从仅索引 `ai_knowledge` 扩展到同时索引**教程**和**FAQ**
- 教程/FAQ 增删改时自动重建 RAG 索引
- 服务启动时自动重建索引
- 支持 BM25 + 向量混合检索

#### 🎓 教程中心改版
- 分类从平台导向改为产品导向
- 新增产品教程和FAQ
- 教程底部CTA从「提交工单」改为「咨询小助手」

#### 🖼️ 素材库
- 后台新增素材库管理(原图片管理)
- 支持批量上传、搜索、分页、图片预览
- 批量选择:复制链接、删除
- Word 文档导入时自动提取图片并保存
- 知识库内容支持 Markdown 图片渲染

#### ☁️ 存储设置
- 后台设置新增「存储设置」分区
- 支持切换:本地存储 / 阿里云 OSS / 七牛云 / 腾讯云 COS
- 可配置 Bucket、Region、Endpoint、AccessKey、自定义域名

#### 💬 AI 对话优化
- 对话自动关闭:超过 30 分钟无新消息自动标记为已关闭
- 用户端新增「新对话」按钮,手动开启全新对话
- AI 回复支持 Markdown 渲染(图片、链接、加粗、列表、表格)
- 商业信息(价格、地址、账户)从知识库隐藏,AI 统一引导联系客服
- 快捷问题更新为产品相关问题

#### 🎨 前端优化
- 教程详情页骨架屏颜色从深黑改为浅灰,消除闪烁
- 首页分类图标和配色更新

---

## 🏗️ 系统架构

### 整体流程

```
用户提问
  │
  ▼
┌─────────────────────────────────────────┐
│           imai小助手 (AI 客服)            │
│                                         │
│  用户问题 ──→ RAG 检索 ──→ LLM 生成回答   │
│               │                         │
│          BM25 + 向量混合                  │
│          同义词扩展                       │
│          Top-5 相关知识                   │
└────────────┬────────────────────────────┘
             │
        AI 能解决?
        ┌────┴────┐
        │ 是      │ 否
        ▼         ▼
    显示回答    转人工弹窗
    用户评分    (智能标题 + 对话预览)
        │         │
        ▼         ▼
    👍/👎     创建工单
              (含完整对话记录)
                 │
                 ▼
            后台工单管理
            (状态/回复/处理人)
                 │
                 ▼
            通知推送
            (飞书/企业微信)
```

### 为什么这样设计?

**1. AI 优先,减少人工负担**

传统的工单系统是"用户提交 → 人工处理",但 80% 的问题都是重复的。我们的设计是"先问 AI → 不行再人工",让 AI 消化掉大部分重复咨询,售后团队只处理真正需要人工的问题。

**2. RAG 检索,不是简单问答**

直接把所有知识塞给 AI(全量加载)在知识少的时候可以,但知识多了会超 token 限制,而且检索精度低。我们用 RAG(Retrieval-Augmented Generation):

- **BM25 文本检索**:基于关键词匹配,适合精确查询(如"系统怎么收费")
- **向量检索**:基于语义相似度,适合模糊查询(如"多少钱"匹配"价格")
- **混合排序**:两种结果加权合并,兼顾精确和语义
- **同义词扩展**:内置同义词表(收费↔价格↔多少钱↔费用),提高召回率

好处:知识库从 50 条扩展到 500 条、5000 条都能精准检索,不会因为知识太多而降低回答质量。

**3. 转人工带上下文**

用户转人工时,不是丢一个空白工单,而是:
- 自动从对话中提取标题(第一个用户问题)
- 完整对话记录写入工单描述
- 工程师打开就能看到前因后果,不用再问一遍

**4. 答案评分闭环**

用户对 AI 回答打 👍/👎,数据存入数据库。后续可以:
- 分析哪些问题 AI 回答不好,补充知识库
- 统计 AI 解决率,衡量效果
- 为未来 fine-tune 模型提供数据

---

## ✨ 功能详解

### 🤖 AI 智能客服(imai小助手)

**实现逻辑:**

```
用户输入问题
    │
    ▼
创建/复用对话会话 (ai_conversations)
    │
    ▼
保存用户消息 (ai_messages, role='user')
    │
    ▼
RAG 检索相关知识
    ├── BM25 分词检索 (bigram/trigram + 同义词)
    ├── 向量检索 (sqlite-vec, 特征哈希 128 维)
    └── 加权合并 → Top 5
    │
    ▼
构建 Prompt
    ├── System Prompt (AI 人设 + 回答规则)
    ├── 知识库上下文 (检索到的 5 条知识)
    └── 对话历史 (最近 10 轮)
    │
    ▼
调用 LLM API (DeepSeek / OpenAI / 通义千问)
    │
    ▼
打字机效果逐字显示回复
    │
    ▼
保存 AI 回复 (ai_messages, role='assistant')
    │
    ▼
用户评分 (👍/👎 → ai_messages.rating)
```

**为什么用打字机效果?**

- 模拟真人对话感,减少"机器人"的感觉
- 用户有等待预期,不会觉得卡顿
- 逐字显示的过程中用户已经开始阅读,体感更快

**支持的功能:**
- 💬 文字对话 + 打字机效果
- 📷 图片上传(拖拽 + 点击),AI 可识别图片内容
- 🖼️ Markdown 渲染(图片、链接、表格、代码块)
- 👍👎 答案评分(👍 自动沉淀为知识库学习内容)
- 📜 历史对话侧边栏
- 🔄 转人工(确认弹窗 + 智能标题 + 对话预览)
- 🆕 新对话(手动开启全新对话)
- ⏰ 自动关闭(30 分钟无新消息自动结束)
- ⚡ 快捷问题引导
- 🧠 AI 自学习(好评问答自动沉淀 + 智能去重 + 定时清理)

---

### 📚 RAG 知识库

**多源索引:** 同时索引 `ai_knowledge`、`tutorials`(已发布教程)、`faqs`(激活FAQ),教程/FAQ 增删改时自动重建索引。

**实现逻辑:**

```
知识入库
    │
    ├── 1. 文本存储 (ai_knowledge / tutorials / faqs)
    ├── 2. BM25 索引 (内存中构建倒排索引)
    └── 3. 向量化 (sqlite-vec 特征哈希)
    │
    ▼
用户提问时检索
    │
    ├── BM25 检索
    │   ├── 中文 bigram/trigram 分词
    │   ├── 同义词扩展 (收费→价格→多少钱)
    │   └── BM25 算法评分
    │
    ├── 向量检索
    │   ├── 文本 → 特征哈希 → 128 维向量
    │   ├── sqlite-vec 余弦相似度
    │   └── 返回最相似的 Top-K
    │
    └── 混合排序
        ├── BM25 权重 0.6 (关键词精确匹配)
        ├── 向量权重 0.4 (语义相似度)
        └── 取 Top 5 塞入 Prompt
```

**为什么用 BM25 + 向量混合?**

| 方法 | 优点 | 缺点 |
|------|------|------|
| 纯 BM25 | 精确关键词匹配,速度快 | 无法理解同义词("多少钱"搜不到"价格") |
| 纯向量 | 理解语义相似度 | 对精确查询不够准确,需要 embedding 模型 |
| **混合** | **兼顾精确和语义** | 稍复杂,但效果最好 |

**同义词扩展的价值:**

用户说"系统怎么收费",知识库里写的是"AI手机优惠方式"。纯 BM25 匹配不上,但通过同义词扩展("收费"→"价格"→"多少钱"),加上 bigram 分词,就能命中。

**知识来源:**
- 手动添加(后台管理页)
- 文档导入(支持 .docx 批量导入)
- 预置知识(一键导入基础内容)

---

### 🎫 工单系统

**实现逻辑:**

```
用户提交工单
    │
    ├── 本地存储 (tickets 表)
    ├── 飞书同步 (多维表格 API)
    └── 通知推送 (Webhook)
         ├── 飞书机器人 (卡片消息)
         └── 企业微信机器人 (Markdown)
    │
    ▼
后台管理
    ├── 状态筛选 (待处理/处理中/已解决)
    ├── 处理人追踪 (processed_by → admins 表)
    ├── 管理员回复 (reply 字段)
    └── 导出 CSV (UTF-8 BOM, Excel 兼容)
    │
    ▼
用户查看
    ├── 看板模式 (统计卡片 + 工单列表)
    ├── 工单详情 (标题/描述/附件/回复/处理人)
    └── 状态实时更新
```

**为什么用工单看板而不是直接表单?**

传统的工单页面是"先填表单,提交后看不到记录"。我们的设计是"先看已有工单,再决定是否提交新工单":
- 用户能看到自己的工单进度,减少重复提交
- 已解决的问题用户能直接看到回复,不用再问
- 统计卡片让用户一目了然

**通知推送的价值:**

工单提交后自动推送到飞书/企业微信群,售后人员不用一直盯着后台,有新工单手机立刻收到通知。

---

### ⚙️ 后台设置

**分区导航设计:**

```
网站信息 → 存储设置 → 短信平台 → 微信登录 → 飞书集成 → 工单通知 → AI 客服 → 素材生成
```

每个分区独立卡片,左侧导航快速切换,底部有上一步/下一步按钮。

**为什么这样分?**

- 每个功能模块独立,不会一个超长表单
- 新增配置项不影响其他分区
- 导航清晰,管理员不用滚动找配置

---

## 技术栈

| 层 | 技术 | 选型理由 |
|----|------|---------|
| 前端 | Next.js 16 + React 19 + TypeScript + Tailwind CSS v4 | SSR + 组件化 + 类型安全 + 原子化 CSS |
| 后端 | Node.js + Express | 轻量、生态丰富、前后端同语言 |
| 数据库 | SQLite (better-sqlite3) | 零配置、单文件、性能足够(万级数据) |
| AI | DeepSeek API | 低成本(约 0.5 元/百万 token)、中文效果好 |
| 检索 | BM25 + sqlite-vec | 零外部依赖、纯 Node.js 实现 |
| 认证 | 双 JWT | 前台/后台完全隔离,互不影响 |
| 编辑器 | WangEditor | 全中文、开箱即用、支持图片上传 |
| 通知 | 飞书/企业微信 Webhook | 零成本、配置简单、即时推送 |

---

## 快速启动

### 环境要求

- **Node.js >= 20**（推荐 20 LTS 或 22 LTS）
- npm >= 10
- Docker / Docker Compose（可选）

### 方式一：本地启动

```bash
# 1. 启动后端
cd backend
npm install
node server.js
# 后端运行在 http://localhost:37888

# 2. 新终端，启动前端
cd frontend
npm install
npm run dev
# 前端运行在 http://localhost:3000
```

### 方式二：Docker 启动

```bash
docker compose up --build
# 前端: http://localhost:3000
# 后端: http://localhost:37888
```

### 3. 配置 AI 客服

1. 访问 `http://localhost:3000/admin-login`（admin / admin123）
2. 进入 设置 → AI 客服
3. 选择服务商（DeepSeek），填入 API Key
4. 进入 AI 知识库，点击“导入预置知识”
5. 访问 `http://localhost:3000` 测试

### 常见问题

**better-sqlite3 安装失败？**
确认 Node.js >= 20，并安装编译工具（Python、make、g++）。Mac 用户需安装 Xcode Command Line Tools。

**前端请求不到后端？**
检查 `frontend/.env.local` 中 `NEXT_PUBLIC_API_URL` 是否正确。

**Docker 部署后前端无法访问接口？**
如果部署在服务器，不能用 localhost，需配置实际域名或 IP。

---

## 页面路由

### 前台

| 路由 | 说明 |
|------|------|
| `/` | 首页 |
| `/tutorials` | 教程中心 |
| `/faq` | FAQ |
| `/support` | 🤖 imai小助手 |
| `/ticket` | 我的工单 |
| `/ticket/:id` | 工单详情 |
| `/login` | 登录 |
| `/register` | 注册 |

### 后台 - `/admin-login`

| 路由 | 说明 |
|------|------|
| `/admin` | 仪表盘 |
| `/admin/tutorials` | 教程管理 |
| `/admin/faq` | FAQ 管理 |
| `/admin/users` | 用户管理 |
| `/admin/admins` | 管理员管理 |
| `/admin/levels` | 客户分类 |
| `/admin/tickets` | 工单管理 |
| `/admin/ai` | AI 知识库 |
| `/admin/ai/conversations` | AI 对话记录 |
| `/admin/settings` | 系统设置 |

---

## API 概览

<details>
<summary>展开查看完整 API 列表</summary>

### 公开接口

| 端点 | 说明 |
|------|------|
| `GET /api/tutorials` | 教程列表(支持 ?category=&search=) |
| `GET /api/tutorials/:id` | 教程详情(含 VIP 检查) |
| `GET /api/faqs` | FAQ 列表 |
| `GET /api/categories` | 分类列表 |

### 用户接口(需 token)

| 端点 | 说明 |
|------|------|
| `POST /api/auth/register` | 注册 |
| `POST /api/auth/login` | 登录 |
| `GET /api/auth/me` | 用户信息 |
| `POST /api/tickets` | 提交工单 |
| `GET /api/user/tickets` | 我的工单 |
| `GET /api/tickets/:id` | 工单详情 |
| `POST /api/ai/conversations` | 创建 AI 对话 |
| `POST /api/ai/chat` | 发送消息 & 获取 AI 回复 |
| `GET /api/ai/conversations` | 对话历史 |
| `GET /api/ai/conversations/:id/messages` | 对话消息 |
| `POST /api/ai/messages/:id/rate` | 答案评分(1=👍, -1=👎) |
| `POST /api/ai/conversations/:id/transfer` | 转人工 |

### 管理接口(需 admin token)

| 端点 | 说明 |
|------|------|
| `POST /api/admin/auth/login` | 管理员登录 |
| `GET /api/admin/stats` | 统计数据 |
| `GET/POST/PUT/DELETE /api/admin/tutorials` | 教程 CRUD |
| `GET/POST/PUT/DELETE /api/admin/faqs` | FAQ CRUD |
| `GET/POST /api/admin/users` | 用户管理 |
| `GET /api/admin/tickets` | 工单列表(支持 ?status=) |
| `PUT /api/admin/tickets/:id` | 更新工单(状态+回复+处理人) |
| `GET/POST/PUT/DELETE /api/admin/ai/knowledge` | 知识库 CRUD |
| `GET /api/admin/ai/conversations` | AI 对话记录 |
| `POST /api/admin/ai/rebuild-index` | 重建 RAG 索引 |
| `GET/PUT /api/admin/settings` | 系统设置 |
| `POST /api/upload/file` | 文件上传 |

</details>

---

## 数据库设计

<details>
<summary>展开查看表结构</summary>

### users(前台用户)

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER | 主键 |
| phone | TEXT | 手机号(唯一) |
| password | TEXT | bcrypt 加密密码 |
| nickname | TEXT | 昵称 |
| vip | INTEGER | VIP 状态 (0/1) |
| vip_expires_at | TEXT | VIP 到期时间 |
| customer_level_id | INTEGER | 客户分类 FK |

### admins(后台管理员)

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER | 主键 |
| username | TEXT | 用户名(唯一) |
| password | TEXT | bcrypt 加密密码 |
| nickname | TEXT | 昵称 |
| role | TEXT | 角色 (admin/superadmin) |

### tickets(工单)

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER | 主键 |
| title | TEXT | 工单标题 |
| description | TEXT | 详细描述 |
| name | TEXT | 联系人 |
| contact | TEXT | 联系方式 |
| type | TEXT | 类型 (bug/feature/consult/other) |
| group_name | TEXT | 售后群名 |
| attachments | TEXT | 附件 JSON |
| status | TEXT | 状态 (pending/processing/resolved) |
| reply | TEXT | 管理员回复 |
| processed_by | INTEGER | 处理人 FK → admins |
| user_id | INTEGER | 提交人 FK → users |

### ai_conversations(AI 对话)

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER | 主键 |
| user_id | INTEGER | 用户 FK(可为空,游客) |
| guest_name | TEXT | 游客名称 |
| status | TEXT | 状态 (active/transferred/closed) |

### ai_messages(AI 消息)

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER | 主键 |
| conversation_id | INTEGER | 对话 FK |
| role | TEXT | 角色 (user/assistant/system) |
| content | TEXT | 消息内容 |
| image_url | TEXT | 图片 URL |
| rating | INTEGER | 评分 (1=👍, 0=无, -1=👎) |

### ai_knowledge(知识库)

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER | 主键 |
| title | TEXT | 知识标题 |
| content | TEXT | 知识内容 |
| category | TEXT | 分类 |
| tags | TEXT | 标签 JSON |
| status | TEXT | 状态 (active/hidden) |

</details>

---

## 项目结构

```
imai-website/
├── backend/
│   ├── server.js              # Express 主入口(所有路由定义)
│   ├── database/
│   │   └── schema.js          # 建表 + 迁移 + seed 数据
│   ├── middleware/
│   │   └── auth.js            # 双 JWT 验证(前台/后台独立)
│   ├── services/
│   │   ├── ai.js              # AI 对话(LLM 调用 + RAG 检索)
│   │   ├── rag.js             # RAG 引擎(BM25 + 向量 + 同义词 + 自学习)
│   │   ├── doc-parser.js      # 文档解析(Excel/Word/CSV/TXT,含图片提取)
│   │   ├── feishu.js          # 飞书多维表格同步
│   │   ├── notify.js          # 工单通知(飞书/企微 Webhook)
│   │   └── queue.js           # AI 消息队列
│   ├── .env.example           # 环境变量模板
│   └── uploads/               # 上传文件(gitignore)
├── frontend/
│   ├── app/
│   │   ├── support/           # 🤖 imai小助手
│   │   ├── ticket/            # 工单看板 + 详情
│   │   ├── admin/
│   │   │   ├── tickets/       # 后台工单管理
│   │   │   ├── ai/            # 知识库 + 对话记录
│   │   │   └── settings/      # 分区设置页
│   │   └── ...
│   ├── components/
│   └── lib/
│       └── api.ts             # API 封装(前台+后台+AI)
└── docker-compose.yml
```

---

## Docker 部署

```bash
docker-compose up -d --build
```

数据持久化:
- 数据库:Docker volume `backend-data`
- 上传文件:Docker volume `backend-uploads`

---

## 数据安全

- 数据库、环境变量、上传文件等敏感数据均已加入 `.gitignore`
- `.env.example` 仅提供配置模板,不含真实密钥
- 前台/后台使用独立 JWT 密钥,登录状态完全隔离

---

## License

MIT
