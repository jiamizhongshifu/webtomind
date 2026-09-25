# AI Mind Mapper Server

后端 API 服务，集成 Claude Agent 和 Gemini 作为 AI 提供商。

## 快速开始

### 1. 安装依赖

```bash
cd /path/to/zongjie
pnpm install
```

`server/` 是根目录 pnpm workspace 的一个子包。请不要在本目录运行 `npm install` 或提交 `package-lock.json`。

### 2. 配置环境变量

```bash
cp server/.env.example server/.env
```

编辑 `server/.env` 文件：

```env
ANTHROPIC_API_KEY=your-anthropic-api-key
GOOGLE_API_KEY=your-google-api-key
PORT=3000
ALLOWED_ORIGINS=http://localhost:5173
```

### 3. 启动开发服务器

```bash
pnpm --dir server dev
```

服务将在 http://localhost:3000 启动。

## API 接口

### 健康检查

```
GET /health
```

### 流式聊天

```
POST /api/agent/chat
Content-Type: application/json

{
  "prompt": "你好",
  "provider": "claude",  // 可选: "claude" | "gemini" | "auto"
  "context": {
    "references": "参考内容",
    "pageInfo": {
      "url": "https://example.com",
      "title": "示例页面"
    }
  },
  "sessionId": "session_xxx"  // 可选，用于多轮对话
}
```

响应格式（SSE）：

```
event: status
data: {"status": "analyzing", "message": "正在分析请求..."}

event: text
data: {"content": "你好！"}

event: tool_call
data: {"id": "xxx", "name": "web_search", "input": {"query": "..."}}

event: tool_result
data: {"id": "xxx", "name": "web_search", "result": {...}, "success": true}

event: done
data: {}
```

### 同步聊天

```
POST /api/agent/chat/sync
Content-Type: application/json

{
  "prompt": "你好",
  "provider": "claude"
}
```

响应：

```json
{
  "success": true,
  "data": {
    "content": "你好！有什么可以帮助你的吗？",
    "toolCalls": [],
    "toolResults": []
  }
}
```

### 获取可用提供商

```
GET /api/agent/providers
```

响应：

```json
{
  "providers": [
    { "name": "Claude Agent", "type": "claude", "available": true },
    { "name": "Gemini Agent", "type": "gemini", "available": true }
  ]
}
```

### 获取笔记

```
GET /api/agent/notes
GET /api/agent/notes/:id
```

## 内置工具

| 工具名称 | 描述 |
|---------|------|
| `web_search` | 网络搜索 |
| `extract_url` | 提取 URL 内容 |
| `save_note` | 保存笔记 |

## Docker 部署

### 构建镜像

```bash
docker build -t mindmapper-api -f server/Dockerfile server
```

### 使用 docker-compose

```bash
# 配置环境变量
cp server/.env.example server/.env
nano server/.env

# 启动服务
docker compose -f server/docker-compose.yml up -d

# 查看日志
docker compose -f server/docker-compose.yml logs -f
```

### 生产部署

```bash
# 构建生产镜像
docker build -t mindmapper-api:prod -f server/Dockerfile server

# 运行
docker run -d \
  --name mindmapper-api \
  -p 3000:3000 \
  -e ANTHROPIC_API_KEY=xxx \
  -e GOOGLE_API_KEY=xxx \
  -e ALLOWED_ORIGINS=https://your-domain.com \
  mindmapper-api:prod
```

## 项目结构

```
server/
├── src/
│   ├── index.ts              # 服务入口
│   ├── routes/
│   │   └── agent.ts          # Agent API 路由
│   ├── services/
│   │   ├── claude-agent.ts   # Claude Agent 服务
│   │   ├── gemini-agent.ts   # Gemini Agent 服务
│   │   └── provider-factory.ts
│   ├── tools/
│   │   ├── index.ts          # 工具导出
│   │   ├── web-search.ts     # 网络搜索
│   │   ├── url-extract.ts    # URL 提取
│   │   └── save-note.ts      # 保存笔记
│   └── types/
│       └── api.ts            # 类型定义
├── package.json
├── tsconfig.json
├── Dockerfile
├── docker-compose.yml
└── .env.example
```

## 开发

### 类型检查

```bash
pnpm --dir server typecheck
```

### 构建

```bash
pnpm --dir server build
```

### 生产启动

```bash
pnpm --dir server start
```
