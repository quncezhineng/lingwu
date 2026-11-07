# Hindsight 记忆引擎自托管

LingWu 多 Agent 记忆系统使用 [Vectorize Hindsight](https://hindsight.vectorize.io/) 作为语义检索后端（`retain` / `recall` / `reflect`）。未部署 Hindsight 时，系统自动降级为本地关键词召回，功能不受影响；部署后可获得语义检索、事实抽取、观察合并、冲突检测等增强能力。

## 快速启动

```bash
# 1. 准备 LLM key（用于事实抽取 / 实体链接 / 答案生成）
export HINDSIGHT_LLM_API_KEY=sk-你的-deepseek-key   # 或写进项目 .env

# 2. 启动 Hindsight（单容器，含嵌入式 PostgreSQL + 本地 embedding/rerank 模型）
docker compose -f infra/hindsight.yaml up -d

# 3. 确认服务健康
curl http://localhost:8888/health
# Control Plane 管理界面：http://localhost:9999
```

然后在 LingWu 的 `.env` 里启用：

```bash
HINDSIGHT_BASE_URL=http://localhost:8888
# HINDSIGHT_API_KEY 自托管留空
```

重启 LingWu 后，记忆写入会自动双写 Hindsight，存量记忆由后台迁移任务分批迁入（`maintain()` 每 60s 推进一批，见 `docs/记忆系统技术架构.md` M4）。

## 默认配置（针对中国网络）

| 项 | 默认值 | 说明 |
| --- | --- | --- |
| LLM | DeepSeek `deepseek-flash` | 适合中国网络；可换 OpenAI/Groq |
| Embedding | 本地 `BAAI/bge-small-zh-v1.5` | 中文友好，无需外接 embedding 服务 |
| Reranker | 本地 `flashrank`（ONNX） | 无需外接 |
| HF 镜像 | `hf-mirror.com` | 规避 Hugging Face 模型下载被墙 |

## 常用环境变量（覆盖默认）

```bash
# LLM
HINDSIGHT_LLM_PROVIDER=deepseek     # 或 openai / groq
HINDSIGHT_LLM_API_KEY=sk-...
HINDSIGHT_LLM_MODEL=deepseek-flash
HINDSIGHT_LLM_BASE_URL=https://api.deepseek.com

# Embedding（默认本地；也可用 OpenAI 等外部服务）
HINDSIGHT_EMBEDDINGS_PROVIDER=local
HINDSIGHT_EMBEDDINGS_LOCAL_MODEL=BAAI/bge-small-zh-v1.5

# Reranker
HINDSIGHT_RERANKER_PROVIDER=flashrank
```

## 生产注意事项

1. **外部 PostgreSQL**：默认嵌入式 pg0 适合开发；生产建议改为外部 PostgreSQL 14+（需 `pgvector` 扩展），通过 `HINDSIGHT_API_DATABASE_URL` 指定。
2. **稳定 worker 身份**：compose 已固定 `HINDSIGHT_API_WORKER_ID=lingwu-hindsight`，重启后仍能认领未完成任务。
3. **数据持久化**：数据存 named volume `hindsight-data`；如改用 host 绑定目录，需 `chown -R 1000:1000`（容器以 UID 1000 运行）。
4. **内存**：全量镜像约 9 GB（含本地 ML 模型），首次拉取较慢；若已用外部 embedding/rerank，可换 `:latest-slim`（约 500 MB）。

## 排障

| 症状 | 处理 |
| --- | --- |
| `Permission denied` 启动失败 | host 绑定目录需 `chown -R 1000:1000` |
| 模型下载卡住 | 确认 `HF_ENDPOINT=https://hf-mirror.com` 已生效 |
| 首次启动慢 | 首次要下载 embedding 模型 + 全量镜像，耐心等待 |
| Intel Mac 用 pip 安装 | 用 `hindsight-api-slim` + ONNX，Python ≤3.13 |
