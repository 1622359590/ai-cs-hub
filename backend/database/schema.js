const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, '..', 'data.db');

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('busy_timeout = 5000');
    db.pragma('foreign_keys = ON');
  }
  return db;
}

function initSchema() {
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      nickname TEXT DEFAULT '',
      avatar TEXT DEFAULT '',
      vip INTEGER DEFAULT 0,
      vip_expires_at TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      nickname TEXT DEFAULT '',
      role TEXT DEFAULT 'admin' CHECK(role IN ('admin','editor')),
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS tutorials (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      summary TEXT DEFAULT '',
      cover TEXT DEFAULT '',
      tags TEXT DEFAULT '[]',
      views INTEGER DEFAULT 0,
      status TEXT DEFAULT 'draft' CHECK(status IN ('draft','published')),
      vip_only INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS faqs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question TEXT NOT NULL,
      answer TEXT NOT NULL,
      category TEXT DEFAULT '通用',
      sort_order INTEGER DEFAULT 0,
      pinned INTEGER DEFAULT 0,
      status TEXT DEFAULT 'active' CHECK(status IN ('active','hidden')),
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      name TEXT DEFAULT '',
      contact TEXT DEFAULT '',
      type TEXT DEFAULT 'consult',
      group_name TEXT DEFAULT '',
      attachments TEXT DEFAULT '[]',
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending','processing','resolved')),
      reply TEXT DEFAULT '',
      user_id INTEGER,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      icon TEXT DEFAULT '',
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS knowledge_base (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      content TEXT DEFAULT '',
      tags TEXT DEFAULT '[]',
      category TEXT DEFAULT '',
      status TEXT DEFAULT 'active' CHECK(status IN ('active','hidden')),
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT DEFAULT '',
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS customer_levels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      description TEXT DEFAULT '',
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );
  `);

  // 迁移：兼容旧数据库添加 vip_only 字段
  try {
    db.exec("ALTER TABLE tutorials ADD COLUMN vip_only INTEGER DEFAULT 0");
  } catch(e) {
    // 字段已存在则忽略
  }

  // 迁移：给 users 表添加 customer_level_id 字段
  try {
    db.exec("ALTER TABLE users ADD COLUMN customer_level_id INTEGER DEFAULT 0 REFERENCES customer_levels(id)");
  } catch(e) {
    // 字段已存在则忽略
  }

  // 迁移：工单增加优先级字段
  try {
    db.exec("ALTER TABLE tickets ADD COLUMN priority TEXT DEFAULT 'normal'");
  } catch(e) {}

  // 迁移：工单增加 processed_by 字段（处理人）
  try {
    db.exec("ALTER TABLE tickets ADD COLUMN processed_by INTEGER");
  } catch(e) {}

  // 迁移：给 users 表添加 customer_level_id 字段
  try {
    db.exec("ALTER TABLE users ADD COLUMN customer_level_id INTEGER DEFAULT 0");
  } catch(e) {
    // 字段已存在则忽略
  }

  // 给 users 表添加 customer_level_id 字段索引
  try {
    db.exec("CREATE INDEX IF NOT EXISTS idx_users_customer_level ON users(customer_level_id)");
  } catch(e) {
    // 索引已存在则忽略
  }

  // 性能索引：高频查询字段
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
    CREATE INDEX IF NOT EXISTS idx_tickets_user_id ON tickets(user_id);
    CREATE INDEX IF NOT EXISTS idx_ai_messages_conversation ON ai_messages(conversation_id);
    CREATE INDEX IF NOT EXISTS idx_ai_conversations_user ON ai_conversations(user_id);
    CREATE INDEX IF NOT EXISTS idx_tutorials_status ON tutorials(status);
    CREATE INDEX IF NOT EXISTS idx_tutorials_category ON tutorials(category);
    CREATE INDEX IF NOT EXISTS idx_knowledge_status ON knowledge_base(status);
    CREATE INDEX IF NOT EXISTS idx_ai_knowledge_status ON ai_knowledge(status);
    CREATE INDEX IF NOT EXISTS idx_faqs_status ON faqs(status);
  `);

  // 迁移：给 tickets 表添加 reply 字段（管理员回复）
  try {
    db.exec("ALTER TABLE tickets ADD COLUMN reply TEXT DEFAULT ''");
  } catch(e) {
    // 字段已存在则忽略
  }

  // AI 客服对话表
  db.exec(`
    CREATE TABLE IF NOT EXISTS ai_conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      guest_name TEXT DEFAULT '',
      status TEXT DEFAULT 'active' CHECK(status IN ('active','transferred','closed')),
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS ai_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('user','assistant','system')),
      content TEXT NOT NULL DEFAULT '',
      image_url TEXT DEFAULT '',
      rating INTEGER DEFAULT 0 CHECK(rating IN (-1, 0, 1)),
      created_at TEXT DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (conversation_id) REFERENCES ai_conversations(id)
    )
  `);

  // AI 知识库表（为 RAG 预留）
  db.exec(`
    CREATE TABLE IF NOT EXISTS ai_knowledge (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      category TEXT DEFAULT '',
      tags TEXT DEFAULT '[]',
      status TEXT DEFAULT 'active' CHECK(status IN ('active','hidden')),
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    )
  `);

  // 客户身份分类种子数据（独立初始化，不受 seedData 跳过影响）
  const levelCount = db.prepare('SELECT COUNT(*) as count FROM customer_levels').get();
  if (levelCount.count === 0) {
    const insertLevel = db.prepare('INSERT INTO customer_levels (name, description, sort_order) VALUES (?, ?, ?)');
    const levels = [
      { name: '创业版', description: '初创阶段客户', sort_order: 1 },
      { name: '旗舰版', description: '企业旗舰客户', sort_order: 2 },
      { name: '白银代理', description: '白银级别代理商', sort_order: 3 },
      { name: '黄金代理', description: '黄金级别代理商', sort_order: 4 },
      { name: '钻石代理', description: '钻石级别代理商', sort_order: 5 },
      { name: '战略大客户', description: '战略合作大客户', sort_order: 6 },
    ];
    for (const l of levels) {
      insertLevel.run(l.name, l.description, l.sort_order);
    }
    console.log(`🌱 客户分类种子数据: ${levels.length} 个`);
  }

  console.log('✅ 数据库表结构创建完成');
  return db;
}

function seedData() {
  const db = getDb();

  // 检查管理员表是否有数据
  const adminCount = db.prepare('SELECT COUNT(*) as count FROM admins').get();
  if (adminCount.count > 0) {
    console.log('ℹ️ 数据库已有管理员数据，跳过 seed');
    // 不再检查 users 表，避免重复跳 seed
    return;
  }

  console.log('🌱 开始写入 seed 数据...');

  // ===== 管理员账号（独立表）=====
  const hashedPassword = bcrypt.hashSync('admin123', 10);
  db.prepare(`INSERT INTO admins (username, password, nickname, role) VALUES (?, ?, ?, ?)`).run(
    'admin', hashedPassword, '管理员', 'admin'
  );

  // ===== 前端用户（示例）=====
  const userHash = bcrypt.hashSync('user123', 10);
  db.prepare(`INSERT INTO users (phone, password, nickname) VALUES (?, ?, ?)`).run(
    '13800000000', userHash, '测试用户'
  );

  // ===== 教程数据（8篇） =====
  const insertTutorial = db.prepare(`
    INSERT INTO tutorials (title, category, content, summary, cover, tags, views, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const tutorials = [
    {
      title: '抖音养号完整攻略',
      category: '抖音',
      summary: '从零开始学习抖音账号养成，掌握平台推荐机制，快速提升账号权重',
      tags: JSON.stringify(['抖音', '养号', '新手入门', '账号权重']),
      content: `# 抖音养号完整攻略

## 为什么要养号？

抖音的推荐算法基于**账号权重体系**。一个新注册的账号如果没有经过"养号"阶段就直接发布营销内容，很容易被系统判定为营销号，从而被限流甚至封号。养号的核心目的在于向平台证明：**你是一个真实、有价值的用户**，而不是一个垃圾内容生产者。

## 养号第一阶段：账号初始化（第1-3天）

### 1. 完善个人信息
- 上传清晰的头像（建议使用真人照片）
- 填写昵称，不要带广告性质的关键词
- 完善个人简介，保持简洁自然
- 绑定手机号

### 2. 基础行为模拟
- 每天刷抖音 1-2 小时
- 完播率高于 70%：每刷到视频尽量看完
- 给感兴趣的视频点赞、评论、收藏
- 关注 10-20 个同领域的优质账号

### 3. 避免的雷区
- ❌ 不要频繁切换账号
- ❌ 不要使用模拟器或多开工具
- ❌ 不要同一设备登录多个账号
- ❌ 前三天绝对不要发任何作品

## 养号第二阶段：兴趣标签培养（第4-7天）

### 精准定位
- 刷视频时多与**目标领域**的内容互动
- 搜索你行业相关的关键词，点击进入话题
- 观看同领域头部账号的直播
- 在评论区留下有价值的留言

### 标签权重
抖音会给每个用户打上兴趣标签，你希望在哪个领域做内容，就要让系统认为你"喜欢"该领域的内容。每天花至少 30 分钟浏览目标领域的内容，保持互动。

## 养号第三阶段：内容发布期（第8天起）

### 第一条视频
- 用手机原生相机拍摄，不要用剪辑软件导出
- 保证 15-30 秒，节奏紧凑
- 避免任何水印和二维码
- 添加热门话题标签（不超过 5 个）

### 发布节奏
- 前两周每天 1 条，不建议多发
- 固定时间发布（建议 12:00-13:00 或 19:00-21:00）
- 发布后 1 小时内积极回复评论

## 养号成功的关键指标

| 指标 | 合格线 | 优秀线 |
|------|--------|--------|
| 完播率 | 30% | 60%+ |
| 点赞率 | 3% | 5%+ |
| 评论率 | 0.5% | 2%+ |
| 转发率 | 0.3% | 1%+ |

## 常见问题

**Q: 养号期间需要开抖音会员吗？**
A: 不需要。但可以用少量抖加测试内容方向。

**Q: 养号失败怎么办？**
A: 如果连续一周播放量卡在 200 以下，建议重新注册新号。

**Q: 可以同时在多个手机上养号吗？**
A: 可以，但每个手机务必使用独立的 4G/5G 网络，不要共用 WiFi。
`,
      cover: '',
      views: 1256,
      status: 'published'
    },
    {
      title: '抖音流量池机制详解',
      category: '抖音',
      summary: '深入理解抖音推荐算法的层级递进机制，掌握获取更多流量的核心逻辑',
      tags: JSON.stringify(['抖音', '流量池', '推荐算法', '运营策略']),
      content: `# 抖音流量池机制详解

## 什么是流量池？

抖音的推荐算法采用**分级流量池机制**，即一个视频发布后会依次进入不同的流量层级，每个层级有对应的流量上限。只有在该层级表现足够好，才能进入下一个更大的流量池。

## 八大流量层级

### 第1层：初始流量池（200-500 播放量）
- 系统会给每个新视频 200-500 次曝光
- 主要推送给：你的粉丝 + 少量潜在感兴趣用户
- 考核指标：**完播率 > 30%**，点赞率 > 3%

### 第2层：千人流量池（1000-5000）
- 初始数据达标后自动进入
- 系统扩大推荐范围，测试更广泛的受众
- 考核指标：完播率 > 40%，点赞率 > 4%，评论互动增加

### 第3层：万人流量池（1万-10万）
- 热门视频的门槛
- 系统开始根据完播曲线判断内容质量
- 除了基础指标，**转发率**成为关键

### 第4层：十万流量池（10万-50万）
- 视频会被标记为"潜力爆款"
- 人工审核介入，检查内容合规性
- 评论区活跃度成为重要参考

### 第5-8层：百万级及以上
- 进入这个层级后，流量呈指数级增长
- 需要持续的互动数据和社交传播
- 最终可达千万级曝光

## 影响流量池跃迁的关键因素

### 1. 完播率（最重要）
- 视频的前 3 秒决定了用户是否划走
- 建议在开头设置悬念或抛出问题
- 保持节奏，避免冗长的铺垫

### 2. 互动率
- 点赞、评论、收藏、转发都是正向信号
- 可以在视频结尾设置互动引导
- 评论区积极回应能提升活跃度

### 3. 作品质量
- 清晰度：建议 1080P 以上
- 内容原创性：搬运内容会被直接降权
- 主题垂直度：内容越垂直，推荐越精准

### 4. 发布时间
推荐发布时间段：
- 工作日：12:00-13:00（午休）、19:00-22:00（晚间）
- 周末：10:00-13:00、16:00-22:00

## 如何突破 500 播放量卡点？

超过 90% 的新号会卡在 200-500 播放量。突破的关键：

1. **优化前 3 秒**：用吸引人的画面或问题抓眼球
2. **控制时长**：新手建议 15-30 秒，尽量做到完播
3. **蹭热点**：结合热门话题或 BGM 制作内容
4. **提升画质**：保证光线充足，画面清晰稳定
5. **使用热门 BGM**：热度高的音乐本身就能带来额外流量

## 常见误区

- ❌ **刷量**：系统能识别虚假数据，只会适得其反
- ❌ **频繁删除作品**：影响账号活跃度评估
- ❌ **内容过于杂乱**：账号标签不清晰，系统难以推荐
- ❌ **忽略评论区**：不回复评论会降低互动权重

> 记住：好的内容本身就是最好的运营策略。流量池机制的目的，就是让优质内容获得更多曝光。
`,
      cover: '',
      views: 2341,
      status: 'published'
    },
    {
      title: '快手养号全攻略',
      category: '快手',
      summary: '快手老铁文化的核心是什么？如何精准养号抓住快手平台的红利',
      tags: JSON.stringify(['快手', '养号', '老铁文化', '社区运营']),
      content: `# 快手养号全攻略

## 快手与抖音的区别

快手和抖音虽然都是短视频平台，但底层逻辑截然不同：

- **抖音**是**中心化分发**，算法主导一切
- **快手**是**去中心化社区**，更重视社交关系和私域流量
- 快手的核心理念是"**普惠**"，每个用户都有被看到的权利
- 快手的流量分配更偏向关注页，而抖音更偏向推荐页

了解这些差异，才能制定正确的养号策略。

## 快手养号第一阶段：建立社区身份（第1-5天）

### 1. 账号基础设置
- 头像使用真实感强的照片（不一定要真人，但不要用网图）
- 昵称要有记忆点，接地气
- 个人简介说清楚"我是谁、做什么的"
- 填写地区信息（快手的同城流量很重要）

### 2. 融入社区生态
快手是**强社区属性**的平台，养号需要"交朋友"：
- 每天刷推荐页和同城页
- 看到喜欢的视频，在评论区留下走心的评论
- 用"老铁""兄弟"等快手语境的语言
- 关注 30-50 个同领域的创作者

## 快手养号第二阶段：建立社交关系（第6-12天）

### 关键动作

1. **私信互动**：给同领域创作者发私信交流（每天 5-10 条）
2. **直播互动**：进入同领域直播间，送礼、打招呼、互动
3. **作品转发**：把喜欢的作品转发到微信或朋友圈
4. **抱团取暖**：加入同行互关群，但不要过度使用

### 账号安全设置
- 开通快手小店（即使不卖货）
- 完成实名认证
- 绑定手机号 + 微信

## 快手养号第三阶段：内容测试期（第13天起）

### 第一条快手的制作要点

快手用户更偏爱**真实、接地气**的内容：
- ✅ 原相机拍摄，不要过度剪辑
- ✅ 口播类内容开门见山
- ✅ 展现真实工作或生活场景
- ❌ 不要用过度滤镜和特效
- ❌ 不要搬运抖音风格的内容

### 话题标签策略
- 带上同城标签（#城市名）
- 带上行业标签（#运营干货 #电商）
- 1-3 个标签足够，别堆砌

## 快手的核心推荐机制

快手有**三重推荐通道**：

1. **关注流**：你的粉丝在关注页看到的流量（权重最高）
2. **同城流**：同城用户的流量（新号最大的突破口）
3. **推荐流**：系统算法推荐（需要数据积累）

对于新手，**同城流量**是最容易突破的方向。

## 快手养号的独特技巧

### 利用"说说"功能
快手"说说"类似于朋友圈，发布文字 + 图片可以获得额外的曝光，而且没有视频那么高的制作门槛。

### 参与挑战赛
快手官方经常推出各种挑战赛，参与可以获得流量扶持。选择与你的领域相关的挑战赛参与。

### 建立私域
快手鼓励创作者建立粉丝群。养号期间可以尝试创建自己的粉丝群，把互动较好的粉丝拉到群里。

## 避坑指南

- ⚠️ 不要在快手直接发广告，会被举报限流
- ⚠️ 不要用机器刷评论和点赞，快手对虚假互动的识别率很高
- ⚠️ 不要在简介中留微信号，会被系统屏蔽
- ⚠️ 慎用连麦功能，容易被恶意举报

## 总结

快手的养号核心不是"刷数据"，而是**建立真实的社交关系**。在快手上，一个有 1000 个铁粉的账号，价值可能超过一个有 10 万泛粉的抖音号。
`,
      cover: '',
      views: 1823,
      status: 'published'
    },
    {
      title: '快手直播带货新手必看',
      category: '快手',
      summary: '从选品到话术，从暖场到逼单，一份完整的新手快手直播带货实战指南',
      tags: JSON.stringify(['快手', '直播带货', '电商', '新手教程']),
      content: `# 快手直播带货新手必看

## 快手直播的独特生态

快手直播基于**信任经济**。用户下单不是因为便宜，而是因为**信任主播**。快手"老铁文化"的核心就是：

> "刷礼物是因为喜欢你，买东西是因为信任你。"

这个逻辑决定了你在快手做直播带货的方式，和抖音完全不同。

## 第一步：直播前的准备

### 1. 硬件准备
- **手机**：至少 2 部（一部直播、一部看评论+后台）
- **补光灯**：环形灯是最低配置
- **麦克风**：领夹麦（几十块的效果已足够）
- **网络**：保证上行带宽 > 5Mbps，建议用 4G 作为备用

### 2. 选品策略

| 阶段 | 选品原则 | 客单价 |
|------|---------|--------|
| 新手期 | 刚需、低价、易展示 | 9.9-49 |
| 成长期 | 有利润空间、可复购 | 49-199 |
| 成熟期 | 品牌货、高利润品 | 199+ |

新手建议从**日用百货、零食特产**入手，这些品类：展示性强、决策成本低、退货率低。

### 3. 直播间人设
快手的直播人设越真实越好：
- **村里卖货的**：朴实、真诚
- **工厂老板**：源头、性价比
- **宝妈创业**：有共鸣、接地气

## 第二步：直播中的关键动作

### 暖场（前 5 分钟）
- 欢迎老铁，自我介绍
- 今天的主题 + 福利预告
- 引导点赞到一定数量才开讲

### 上品节奏（每 10-15 分钟一个品）
1. **痛点描述**：这个产品解决了什么问题
2. **产品展示**：实际操作演示，真实使用
3. **价格锚定**：原价XXX，今天直播间只要XXX
4. **限时限量**：仅剩N单，倒计时3分钟
5. **逼单促单**：倒数54321，上链接

### 互动维护
- 每 2-3 分钟念一次评论区
- 设置"刷屏暗号"，比如评论区扣"1"
- 抽奖活跃气氛

## 第三步：直播后的运营

### 数据复盘
需要重点关注的数据：
- **最高在线人数**：你的直播天花板
- **平均停留时长**：内容吸引力的体现
- **商品点击率**：话术和展示效果
- **成交转化率**：低于 1% 需要优化

### 粉丝维护
- 直播结束发一个感谢视频
- 在粉丝群互动
- 承诺的福利一定要兑现

## 新手常犯的错误

1. ❌ **念稿子**：快手用户要的是"唠嗑"，不是"演讲"
2. ❌ **虚假宣传**：夸大功效会被举报，轻则限流重则封号
3. ❌ **情绪平淡**：直播需要一定的表演张力
4. ❌ **不回应评论**：用户觉得你没关注他们
5. ❌ **产品太多**：一场直播 3-5 个品足够

## 实用话术模板

### 开场话术
> "欢迎新进来的老铁们！今天咱们不整虚的，直接上福利。点亮灯牌的朋友，今天下单再送XX。想不想看今天的第一个品？公屏打'想看'！"

### 逼单话术
> "最后还剩5单了，拍完就没了，这是厂家给我的最后一批货。错过今天，后面恢复原价199，今天直播间只要39.9。来，54321，上车！"

## 总结

快手直播带货没有捷径。真诚 + 勤奋 + 不断优化，是唯一的路。第一场直播卖 0 单很正常，关键是坚持和改进。
`,
      cover: '',
      views: 1567,
      status: 'published'
    },
    {
      title: '小红书账号定位三步法',
      category: '小红书',
      summary: '找到你的人设定位、内容方向和变现路径，打造有吸引力的小红书账号',
      tags: JSON.stringify(['小红书', '账号定位', '人设', '内容策略']),
      content: `# 小红书账号定位三步法

## 为什么定位如此重要？

小红书的推荐机制中，"标签匹配"是核心。一个定位清晰的账号，能让系统快速识别你的内容属性，推荐给精准人群。数据表明：

> **定位精准的账号，涨粉速度是定位模糊账号的 3-5 倍。**

## 第一步：找到你的"人设三角"

一个好的人设由三个维度组成：

### 1. 身份标签
- 你是谁？（宝妈/学生/职场人/自由职业）
- 你有什么独特经历或资源？

### 2. 能力标签
- 你擅长什么？（穿搭/做饭/理财/编程）
- 你能给粉丝什么价值？

### 3. 性格标签
- 你是什么风格？（温柔/毒舌/幽默/干货型）
- 你希望粉丝怎么评价你？

**实战练习**：拿一张纸，分别写出以上三个维度的 3-5 个关键词，然后圈出交集。那就是你的核心定位。

## 第二步：找到你的内容赛道

### 小红书热门赛道分析

| 赛道 | 变现能力 | 竞争程度 | 适合人群 |
|------|---------|---------|---------|
| 穿搭美妆 | ⭐⭐⭐⭐⭐ | 极激烈 | 有时尚感的人 |
| 家居生活 | ⭐⭐⭐⭐ | 中等 | 有审美品位的人 |
| 母婴育儿 | ⭐⭐⭐⭐⭐ | 较高 | 宝妈群体 |
| 职场成长 | ⭐⭐⭐⭐ | 中等 | 有职场经验 |
| 学习干货 | ⭐⭐⭐ | 中等 | 爱学习爱分享 |
| 旅游探店 | ⭐⭐⭐ | 较高 | 爱出门的人 |
| 情感心理 | ⭐⭐⭐⭐ | 中等 | 有共情力的人 |

### 赛道选择原则
1. **有积累**：你在这个领域有经验或资源
2. **有热情**：你能持续产出内容而不会厌倦
3. **有变现**：这个赛道有明确的商业价值

## 第三步：确定内容形式

### 小红书主流内容形式

**1. 图文笔记（推荐新手）**
- 制作门槛低，不需要出镜
- 适合教程类、清单类内容
- 封面图决定了点击率 80%

**2. Vlog 视频**
- 真人出镜，信任感更强
- 适合生活方式、探店类
- 需要一定的剪辑能力

**3. 口播类**
- 纯干货输出，效率高
- 适合知识分享、观点类
- 对文案能力要求高

### 内容规划模板

以"职场成长"赛道为例：
- 周一：职场干货（图文清单）
- 周三：工作日常（Vlog）
- 周五：行业观点（口播视频）
- 周日：好物推荐（图文）

## 定位后的执行清单

完成定位后，需要做以下工作：

- [ ] 修改头像、昵称、简介，体现你的定位
- [ ] 批量准备 10 篇符合定位的笔记
- [ ] 确定封面风格（统一色调/字体）
- [ ] 制定每周更新计划
- [ ] 关注同赛道 20 个头部账号

## 定位常见的坑

### 坑1：定位太宽
❌ "分享美好生活" → 太宽泛
✅ "分享 30 岁职场妈妈的极简生活" → 精准

### 坑2：定位太窄
❌ "分享只使用 iPhone 拍照的技巧" → 受众太小
✅ "分享手机摄影技巧" → 适中

### 坑3：与人设冲突
❌ 自称"老司机"但内容很小白
✅ 人设和内容保持一致性

## 小结

定位不是一劳永逸的。在你发布 30-50 篇笔记后，根据数据反馈可以微调。但**初始方向一定要清晰**，这样才能让算法的数据积累更有效。

记住：**一个小而美的精准账号，胜过一个大而泛的普通账号。**
`,
      cover: '',
      views: 2109,
      status: 'published'
    },
    {
      title: '小红书封面设计教程',
      category: '小红书',
      summary: '掌握小红书爆款封面的设计逻辑，让点击率提升 200%',
      tags: JSON.stringify(['小红书', '封面设计', '点击率', '视觉']),
      content: `# 小红书封面设计教程

## 封面 = 80% 的点击率

小红书的推荐页面中，用户看到的是 **封面图 + 标题**。一个优质的封面能：

- 提升 200-300% 的点击率
- 增加笔记的初始推荐权重
- 建立统一的视觉品牌认知

## 三大封面类型

### 1. 文字大图型
**适用场景**：干货类、清单类、教程类

设计要点：
- 文字清晰、字体粗、字号大
- 核心关键词放在中间
- 底色用高饱和度或对比色
- 文字不超过 15 个字

### 2. 人物出镜型
**适用场景**：穿搭、美妆、生活分享类

设计要点：
- 人物占据画面 50% 以上
- 表情自然、有情绪（笑/惊讶/专注）
- 背景简洁不杂乱
- 可以在人物旁边加少量关键词

### 3. 产品展示型
**适用场景**：好物推荐、评测类

设计要点：
- 产品居中或放在黄金分割点
- 背景用纯色或极简场景
- 适当留白
- 加入"使用场景"元素

## 上手实操：用 Canva 做封面

### 第一步：设置尺寸
- 小红书封面推荐尺寸：**1080 × 1440px**（3:4 比例）
- 这是信息流中展示效果最好的比例

### 第二步：选择模板
1. 打开 Canva 搜索"小红书封面"
2. 找到与你风格匹配的模板
3. 修改颜色为主色调

### 第三步：设计要素

**配色原则**
- 全账号保持 2-3 种主色调
- 使用小红书热门色（莫兰迪色系、马卡龙色系）
- 文字色和背景色保证高对比度

**字体选择**
- 推荐：思源黑体、得意黑、站酷快乐体
- 正文字体使用无衬线字体
- 避免使用花体字（识别度低）

**布局技巧**
- 文字集中在中心或上半部分
- 底部留出空间避免被遮挡
- 四周留出 10% 的安全边距

## 爆款封面案例分析

### 案例1：清单体封面
文字：| 2024 必看的 10 本理财书 |
设计：纯色底色 + 大号粗体文字
点击率：12.3%（同类平均 4.5%）

### 案例2：对比型封面
文字：| 减肥前 vs 减肥后 |
设计：左右对比 + 人物出镜
点击率：15.8%

### 案例3：数字诱惑型
文字：| 3 步搞定 xxx |
设计：数字放大突出
点击率：9.2%

## 手机修图工具推荐

| 工具 | 用途 | 价格 |
|------|------|------|
| Canva | 综合封面设计 | 免费够用 |
| 醒图 | 人像精修 | 免费 |
| Lightroom | 调色 | 免费版够用 |
| 黄油相机 | 加字排版 | 免费 |
| 美图秀秀 | 快速出图 | 免费 |

## 常见错误

1. ❌ **画面太花哨**：超过 4 种颜色会让画面杂乱
2. ❌ **文字太小**：手机端看不清楚
3. ❌ **主次不分**：不知道重点在哪里
4. ❌ **风格不统一**：每次封面风格都不一样，缺乏品牌感
5. ❌ **过度修图**：失真会让用户觉得不真实

## 封面检查清单

发布前，对照检查：
- [ ] 在锁屏状态下能否看清封面重点？
- [ ] 封面和标题是否内容一致？
- [ ] 颜色搭配是否和谐？
- [ ] 是否保持了账号的统一风格？
- [ ] 是否有足够的吸引力让人想点击？

## 总结

一个好的封面 = 清晰的视觉焦点 + 明确的内容承诺 + 统一的风格调性。花 30 分钟做一个好封面，回报率远高于花 3 小时写一篇普通笔记。
`,
      cover: '',
      views: 1892,
      status: 'published'
    },
    {
      title: '微信个人号养号防封攻略',
      category: '微信',
      summary: '微信个人号运营防封全指南，合规养号避免账号被封禁',
      tags: JSON.stringify(['微信', '养号', '防封', '账号安全']),
      content: `# 微信个人号养号防封攻略

## 微信封号规则解析

微信的封号机制在不断升级，2024 年最新的规则重点打击以下行为：

1. **营销骚扰**：大量添加好友、频繁群发消息
2. **违规外链**：分享涉黄、赌博、欺诈类链接
3. **非官方客户端**：使用微信多开、红包插件等
4. **频繁操作**：短时间大量转账、加群、加人
5. **被举报**：短时间收到大量用户举报

了解规则是防封的第一步。

## 新号养成的"婴儿期"（第1-15天）

### 第1-3天：静默期
- 不要加任何人
- 不要发朋友圈
- 只进行基本的日常使用（看公众号、刷朋友圈）
- 绑定手机号 + 银行卡 + 实名认证

### 第4-7天：开始活跃
- 每天发 1 条朋友圈（纯生活内容，不要广告）
- 关注 5-10 个公众号
- 和 3-5 个存量的好友聊聊天
- 使用微信支付消费几次（哪怕是买瓶水）

### 第8-15天：轻度社交
- 每天可以加 5-10 个好友
- 加入 2-3 个群聊（活跃发言但不发广告）
- 发朋友圈内容可以逐步增加价值导向
- 使用微信的"看一看"功能

## 养号成功后的正常运营

### 添加好友安全策略
- **每天加人上限**：新号不超过 20 人/day，半年以上老号不超过 50 人/day
- **别人加你**：通过率控制在 80% 以下（全通过会被判定为营销号）
- **分批添加**：不要连续密集添加，间隔至少 30 分钟

### 朋友圈发布策略
| 类型 | 比例 | 说明 |
|------|------|------|
| 生活日常 | 40% | 展现真实生活，增加信任感 |
| 价值干货 | 30% | 专业知识分享，提供价值 |
| 互动话题 | 20% | 提问、投票等增加互动 |
| 产品推广 | 10% | 软性植入，不要硬广 |

### 群聊运营技巧
- 周一到周五建议在群里活跃
- 每次发言间隔大于 30 秒
- 不要连续发大段文字（折叠，像刷屏）
- 多用表情包和红包活跃氛围

## 高危行为红榜

以下行为**极其容易触发封号**：

- ❌ 使用第三方多开软件
- ❌ 在群内频繁发广告
- ❌ 使用抢红包插件
- ❌ 大量转账或者收款超过当天限额
- ❌ 短时间异地登录（会被判定为盗号）
- ❌ 使用微信裂变工具（活码等）
- ❌ 被 5 个以上不同用户投诉

## 账号异常处理方案

### 临时限制
**症状**：提示"操作过于频繁"
**处理**：
1. 停止操作 24 小时
2. 在常用设备上正常使用
3. 不要尝试破解限制

### 功能限制
**症状**：无法加人、无法发朋友圈
**处理**：
1. 解除绑定后重新绑定手机
2. 在微信安全中心申诉
3. 正常使用 3-7 天自动恢复

### 封号
**症状**：提示"账号已被封禁"
**处理**：
1. 立即申诉（说明账户被盗用）
2. 提供身份证明
3. 承诺遵守使用规范
4. 一般首次封号 24 小时可解封

## 企业微信 vs 个人微信

对于需要做营销的场景，建议**优先使用企业微信**：

| 对比项 | 个人微信 | 企业微信 |
|--------|---------|---------|
| 好友上限 | 约 10000 | 无上限 |
| 群发限制 | 严格 | 较宽松 |
| 封号风险 | 高 | 低 |
| 营销功能 | 受限 | 官方支持 |
| 客户管理 | 无 | 有 CRM |

## 防封硬件建议

- 每个微信使用独立设备
- 不要在一台手机上登录超过 2 个微信
- 使用正规渠道的手机和 SIM 卡
- 避免用安卓虚拟机运行微信
- 不要在越狱/ROOT 设备上使用微信

## 总结

微信养号的核心是"**像一个正常人一样使用微信**"。微信的安全策略就是识别那些"不像真人"的异常行为。保持自然、缓慢增长，比任何技术手段都有效。
`,
      cover: '',
      views: 3214,
      status: 'published'
    },
    {
      title: '微信朋友圈发圈技巧',
      category: '微信',
      summary: '让你的朋友圈更有吸引力，提升互动率和转化效果',
      tags: JSON.stringify(['微信', '朋友圈', '营销', '内容创作']),
      content: `# 微信朋友圈发圈技巧

## 为什么朋友圈如此重要？

在微信生态中，朋友圈是**触达率最高的场景**：

- 公众号打开率：3-5%
- 私聊打开率：60-80%
- **朋友圈曝光率：80%+**

你的朋友圈就是你的"个人电视台"。每条朋友圈就相当于一次广告位——当然，你得让广告好看。

## 朋友圈内容五步法

### 第一步：封面优化
朋友圈封面是第一印象，建议：
- 使用高清大图，不要模糊
- 封面图文展示你的核心价值
- 文字简洁，让人一眼看懂你是干嘛的
- 定期更换封面（每月1次）

### 第二步：文字撰写

**黄金结构：抓眼开头 + 价值内容 + 互动结尾**

**好例**：
> "做小红书半年涨粉5万，我总结出3个秘诀（真的不想分享…）👇
> 1. 封面设计XX法
> 2. 标题写作XX式
> 3. 发布时间XX原则
> 你觉得哪个最重要？评论区告诉我"

**坏例**：
> "今天和大家分享做小红书的心得，我觉得最重要的是坚持。"

### 第三步：配图技巧
朋友圈配图遵循"三三制"：
- 1-2 张图：适合互动类、投票类内容
- 3-4 张图：适合过程展示、对比
- 6 张图：适合清单、集合类内容
- 9 张图：视觉冲击力最强
配图要清晰、有质感，避免模糊截图。

### 第四步：发布时间
朋友圈黄金时段：
- 早上 7:00-8:00（通勤时间）
- 中午 12:00-13:00（午休）
- 下午 18:00-19:00（下班）
- 晚上 21:00-22:00（睡前）

### 第五步：评论区运营
自己的朋友圈也要会"运营"：
- 发完后在评论区补充信息
- 回复所有正经评论（非纯表情）
- 用评论引导互动方向
- 好的评论可以置顶展示

## 朋友圈排版技巧

### 文字排版
- 每段不超过 4 行
- 段与段之间空一行
- 重点用 **\*\*加粗\*\*** 或 🔥 表情标注
- 重要信息放开头

### 排版工具推荐
- 利用 iPhone 自带的"换行"键
- 微信自带编辑器可以调整文字样式
- 可以用备忘录写好再复制粘贴

## 朋友圈的"六不要"

1. ❌ **不要连续发广告**：会被好友屏蔽
2. ❌ **不要刷屏**：一天 3-5 条为上限
3. ❌ **不要只发链接**：至少写一段引导文字
4. ❌ **不要负能量**：没人喜欢看抱怨
5. ❌ **不要过度修图**：失真会降低信任感
6. ❌ **不要忽略节假日**：节日内容互动率高

## 朋友圈互动提升技巧

### 点赞的艺术
- 给同行的朋友圈点赞
- 给客户的朋友圈点赞
- 点赞优质内容，建立社交关系

### 评论的艺术
- 走心的评论比点赞更有价值
- 评论区是展示专业度的好地方
- 用提问引发更多讨论

### 引导互动
- 朋友圈末尾加一句"你怎么看？"
- 发投票类内容（二选一）
- 设置"猜谜"类互动
- 评论区回复引发再互动

## 总结

朋友圈不是广告位，是你的人设窗口。先提供价值，再谈转化。当你的朋友圈对别人有用的时候，成交只是顺带的事。
`,
      cover: '',
      views: 2890,
      status: 'published'
    },
  ];

  for (const t of tutorials) {
    insertTutorial.run(t.title, t.category, t.content, t.summary, t.cover, t.tags, t.views, t.status);
  }

  // ===== FAQ 数据（6条）=====
  const insertFaq = db.prepare(`
    INSERT INTO faqs (question, answer, category, sort_order, pinned, status)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const faqs = [
    { question: '养号需要多长时间？', answer: '一般来说，完整的养号周期需要 7-15 天。第一阶段（1-3 天）模拟真实用户行为，第二阶段（4-7 天）培养兴趣标签，第三阶段（8 天后）开始发布内容。具体时间因平台和个人情况而异。', category: '账号', sort_order: 1, pinned: 1 },
    { question: '一个手机可以养多个账号吗？', answer: '不建议。大多数平台会检测设备信息，同一设备登录多个账号容易被判定为营销号。建议每个账号使用独立的设备和网络环境。', category: '账号', sort_order: 2, pinned: 0 },
    { question: '教程内容可以转载到其他平台吗？', answer: '可以，但建议做适当的改编和二次创作。直接复制粘贴不利于 SEO，也容易被平台判定为重复内容。', category: '教程', sort_order: 3, pinned: 0 },
    { question: '账号被限流了怎么办？', answer: '首先确认限流原因（是否违规、内容质量等），然后停止发布 3-7 天，期间正常互动养号，逐步恢复发布频率。严重限流可能需要重新注册账号。', category: '账号', sort_order: 4, pinned: 0 },
    { question: '如何判断账号是否被限流？', answer: '主要看以下几个指标：播放量长期低于 200、没有推荐流量、搜索不到你的账号、发布内容不推送。如果出现以上情况，基本可以判定被限流了。', category: '账号', sort_order: 5, pinned: 0 },
    { question: '教程内容多久更新一次？', answer: '我们会根据各平台规则变化定期更新教程内容。关注我们的更新通知，第一时间获取最新运营技巧。', category: '教程', sort_order: 6, pinned: 0 },
  ];

  for (const f of faqs) {
    insertFaq.run(f.question, f.answer, f.category, f.sort_order, f.pinned, 'active');
  }

  // 客户分类种子数据已迁移到 initSchema 中初始化

  // ===== 分类数据 =====
  const insertCat = db.prepare(`INSERT INTO categories (name, icon, sort_order) VALUES (?, ?, ?)`);
  const categories = [
    { name: '抖音', icon: 'music', sort_order: 1 },
    { name: '快手', icon: 'video', sort_order: 2 },
    { name: '小红书', icon: 'book', sort_order: 3 },
    { name: '微信', icon: 'message-circle', sort_order: 4 },
    { name: '其他', icon: 'help-circle', sort_order: 5 },
  ];

  for (const c of categories) {
    insertCat.run(c.name, c.icon, c.sort_order);
  }

  console.log('✅ Seed 数据写入完成');
  console.log(`  - 管理员: admin / admin123`);
  console.log(`  - 用户: 13800000000 / user123`);
  console.log(`  - 教程: ${tutorials.length} 篇`);
  console.log(`  - FAQ: ${faqs.length} 条`);
  console.log(`  - 分类: ${categories.length} 个`);
}

module.exports = { getDb, initSchema, seedData };
