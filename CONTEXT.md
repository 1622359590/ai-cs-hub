# CONTEXT.md — imai-website 领域词典

> 本文件定义项目中所有关键术语的含义。代码变量名、函数名、对话中的用语，均以此为准。

---

## 角色

### 用户（User）
- 指**前台用户**，通过手机号 + 密码注册登录
- 存储在 `users` 表
- 登录入口：`/login`
- 可以提交工单、浏览教程、使用 AI 客服
- 有 VIP 属性（`vip` 字段，0=普通，1=VIP）

### 管理员（Admin）
- 指**后台管理员**，通过用户名 + 密码登录
- 存储在 **独立的 `admins` 表**（和 users 不是同一张表！）
- 登录入口：`/admin-login`
- 角色分两种：`admin`（超级管理员）和 `editor`（编辑）
- 拥有独立的 JWT 密钥（`ADMIN_JWT_SECRET`）

⚠️ **易混淆点**：代码里的 `user_id` 在不同上下文含义不同：
- 工单里的 `user_id` → 关联 `users` 表（前台用户）
- AI 对话里的 `user_id` → 也关联 `users` 表
- 管理员没有 `user_id`，用的是 `admin_id`

---

## 核心业务实体

### 工单（Ticket）
- 用户提交的**问题/需求单**
- 存储在 `tickets` 表
- 字段：标题（title）、描述（description）、联系人（name）、联系方式（contact）、类型（type）、分组（group_name）、附件（attachments，JSON 数组存 URL）、状态（status）、管理员回复（reply）
- 状态流转：`pending`（待处理）→ `processing`（处理中）→ `resolved`（已解决）
- 工单类型（type 字段）：`consult`（咨询）等，可扩展
- 提交后会同步到飞书多维表格（通过 `feishuCreateRecord`）
- 提交后会触发通知（通过 `sendTicketNotification`）

⚠️ **不要叫"工单"为"ticket"以外的东西**：代码里统一用 `ticket`，变量名用 `ticket`，不用 `order`、`task`、`issue`。

### 教程（Tutorial）
- 管理员创建的**知识内容**，面向用户展示
- 存储在 `tutorials` 表
- 字段：标题、分类（category）、内容（content，富文本）、摘要（summary）、封面（cover）、标签（tags，JSON）、浏览量（views）、状态（status）、VIP 专属（vip_only）
- 状态：`draft`（草稿）→ `published`（已发布）
- 分类对应平台：抖音、快手、小红书、微信等
- 内容使用 WangEditor 富文本编辑器

### 分类（Category）
- 教程的**平台分类**
- 存储在 `categories` 表
- 预设分类：抖音、快手、小红书、微信、其他
- 有图标（icon）和排序（sort_order）

### FAQ（常见问题）
- 用户可见的**常见问题解答**
- 存储在 `faqs` 表
- 字段：问题、答案、分类、排序、是否置顶（pinned）、状态（active/hidden）
- 和 AI 知识库是**独立的**，不要混用

### 客户等级（Customer Level）
- 用户的**客户身份分类**
- 存储在 `customer_levels` 表
- 预设等级：创业版 → 旗舰版 → 白银代理 → 黄金代理 → 钻石代理 → 战略大客户
- 通过 `users.customer_level_id` 关联

### 系统设置（Settings）
- 键值对存储的全局配置
- 存储在 `settings` 表（key-value）
- AI 相关配置：ai_provider, ai_api_key, ai_model, ai_system_prompt, ai_base_url
- Embedding 配置：embedding_provider, embedding_api_key, embedding_model, embedding_base_url

---

## AI 客服系统

### AI 对话（AI Conversation）
- 用户和 AI 客服的**一次会话**
- 存储在 `ai_conversations` 表
- 状态：`active`（进行中）→ `transferred`（已转人工）→ `closed`（已关闭）
- 支持登录用户（`user_id`）和游客（`guest_name`）

### AI 消息（AI Message）
- 对话中的**单条消息**
- 存储在 `ai_messages` 表
- 角色（role）：`user`（用户说的）、`assistant`（AI 回的）、`system`（系统消息）
- 支持图片（`image_url`）
- 支持评价（rating）：-1=踩，0=未评价，1=赞

### AI 知识库（AI Knowledge）
- AI 客服用来回答问题的**知识文档**
- 存储在 `ai_knowledge` 表
- 和 FAQ 是**独立的系统**：FAQ 是人工维护的固定问答，AI 知识库是 RAG 检索用的语料
- 有独立的 status 字段（active/hidden）

### RAG 流程
- 使用 `rag.js` 服务实现
- 核心函数：`rebuildIndex`（重建索引）、`findSimilarLearned`（相似度检索）、`cleanupLearned`（清理）
- 知识来源：`ai_knowledge` 表 + 已学习的对话

---

## 技术栈

### 前端
- 框架：Next.js 16 + React 19 + TypeScript
- 样式：Tailwind CSS v4
- 编辑器：WangEditor（`@wangeditor/editor-for-react`）
- 端口：3000

### 后端
- 框架：Express.js
- 数据库：SQLite（better-sqlite3）
- 认证：JWT（用户和管理员使用**不同的密钥**）
- 端口：37888

### 外部服务
- 飞书多维表格：工单同步存储
- AI 模型：通过 `services/ai.js` 调用

---

## 常见陷阱（踩过的坑）

1. **multipart 解析**：boundary 在 body 第一行，不在 Content-Type header 里
2. **API 缓存**：GET 接口要加 `Cache-Control: no-store`，否则浏览器 304 会导致前端崩溃
3. **JWT 中文乱码**：atob 不支持 Unicode，需要 TextDecoder
4. **WangEditor SSR**：必须客户端动态加载，不能服务端渲染
5. **编辑页面字段丢失**：update API 的 SQL 字段和参数列表要和 create 保持一致

---

## 路由结构

```
/                    → 首页
/login               → 用户登录
/register            → 用户注册
/tutorials           → 教程列表
/tutorials/[id]      → 教程详情
/ticket              → 提交工单
/ticket/[id]         → 工单详情
/support             → 客服支持（AI 对话）
/faq                 → 常见问题
/admin-login         → 管理员登录
/admin               → 管理后台首页
/admin/tutorials     → 教程管理
/admin/tickets       → 工单管理
/admin/faq           → FAQ 管理
/admin/users         → 用户管理
/admin/admins        → 管理员管理
/admin/ai            → AI 客服配置
/admin/ai/conversations → AI 对话记录
/admin/levels        → 客户等级管理
/admin/settings      → 系统设置
/admin/vip           → VIP 管理
```
