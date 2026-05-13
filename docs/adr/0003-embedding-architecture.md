# ADR-0003: Embedding 服务架构 — 本地开发 + 云 API 部署

## 状态
已接受

## 背景
RAG 检索需要 Embedding 模型将文本转为向量。需要决定如何部署 Embedding 服务。

## 决定
采用**双模式架构**：
- **开发环境**：本地 bge-small-zh-v1.5（Python Flask 服务，端口 37889）
- **服务器部署**：阿里云 DashScope text-embedding-v4（或其他云 API）

通过 settings 表的 `embedding_provider` 字段切换，代码无需改动。

## 原因
- 本地模型零费用，适合开发调试
- 云 API 零运维，适合生产环境
- bge-small-zh-v1.5 中文效果好，512 维，M2 MacBook 流畅运行
- text-embedding-v4 1024 维，阿里云自研，国内直连

## 后果
- 开发环境需要额外启动 Python Embedding 服务
- 切换服务商后需要重建向量索引（后台有「重建索引」按钮）
- 两种模型维度不同（512 vs 1024），切换时向量表会自动重建
