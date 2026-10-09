# media-stack-mcp

自己的搜索下载站：**Prowlarr 搜种子 + aria2 下载**，外面套一层 MCP server 和一层网页界面。
让 Codex / Claude 这类 AI 用一句话把文件找回来，也可以直接在浏览器里点。

Self-hosted search & download stack: Prowlarr for indexing, aria2 for transfers, exposed
both as an MCP server (for AI agents) and as a small web UI. Zero npm dependencies —
plain Node ESM and the built-in `fetch`.

## 它长什么样

```
AI 客户端 (Codex / Claude / Cursor) ─┐
                                     ├─→ media-stack ─→ Prowlarr ─→ 索引器
浏览器 (http://localhost:8787) ──────┘        │
                                              └─→ aria2 ─→ 下载目录
```

对 AI 说"帮我找 XXX 并下载"，它会调用 `search` 拿到带做种的候选列表，再用 `download` 把选中的那条丢给 aria2。搜索结果按编号引用，不需要把磁力链接复制来复制去。

## 功能

- **搜索**：走 Prowlarr，一次查询它下面所有索引器，按做种数排序，慢源自动超时跳过
- **下载**：magnet、`.torrent` 直链、普通 HTTP 链接都能扔给 aria2；支持暂停 / 继续 / 移除 / 清理
- **下载器可换**：内置 aria2（Docker 场景），也可以直接接管你在用的 Motrix（本机场景）
- **网页界面**：搜索框、结果列表、带进度条的下载面板，每 2.5 秒自动刷新，无构建步骤
- **MCP**：6 个工具，纯 stdio JSON-RPC，零依赖
- **一键配置**：`scripts/bootstrap.mjs` 自动读取 Prowlarr 的 API Key 并批量导入公网索引器

## 快速开始

### 方式一：Docker Compose（推荐）

```bash
git clone <你的仓库地址> media-stack && cd media-stack
docker compose up -d
```

起来之后：

1. 打开 http://localhost:9696 完成 Prowlarr 初始化；
2. 导入索引器（容器会自己从挂载的 Prowlarr 配置里读到 API Key）：

```bash
docker compose exec app node scripts/bootstrap.mjs --test
```

3. 打开 http://localhost:8787 搜索下载。文件落在 `./downloads`。

### 方式二：macOS 原生（复用 Motrix 当下载器）

```bash
bash scripts/install-macos.sh          # 装 aria2 + 下载并签名 Prowlarr
cp config.example.json config.json     # 填 API Key
node scripts/bootstrap.mjs --test      # 导入索引器
node src/web/server.mjs                # 网页界面 http://127.0.0.1:8787
```

如果你想用已经在用的 Motrix 而不是新起 aria2，只要把 `config.json` 里的
`aria2.rpc_url` 指向 Motrix 的 RPC 即可（Motrix 默认 `http://127.0.0.1:16800/jsonrpc`，
密钥通常是空的），下载会实时出现在 Motrix 界面上。

> macOS 注意：Prowlarr 官方 app 没有代码签名，Homebrew 的 cask 因此在 2026-09 被禁用。
> `install-macos.sh` 会下载官方 release 包并做一次本地 ad-hoc 签名，否则 macOS 不允许它启动。

### 接进 AI 客户端

```bash
# Codex
codex mcp add media-stack -- node /absolute/path/to/media-stack/src/mcp.mjs

# Claude Code
claude mcp add media-stack -- node /absolute/path/to/media-stack/src/mcp.mjs
```

通用 MCP 客户端（Claude Desktop、Cursor、Windsurf…）配置成 stdio server，命令同上。Docker 里跑的话用：

```bash
docker run -i --rm --network container:media-stack-prowlarr \
  -e PROWLARR_URL=http://127.0.0.1:9696 -e PROWLARR_CONFIG_XML=/prowlarr-config/config.xml \
  -v prowlarr-config:/prowlarr-config:ro media-stack-mcp:latest mcp
```

## MCP 工具

| 工具 | 作用 |
|---|---|
| `search` | 查询所有索引器，返回带编号、做种数、大小的候选列表 |
| `download` | 用 `pick=<编号>` 或 `url=` 把任务交给 aria2，返回 gid |
| `downloads` | 查看进度、速度、剩余时间 |
| `download_control` | 暂停 / 继续 / 移除 / 清理 |
| `indexers` | 列出索引器；`test=true` 时逐个测连通性 |
| `stack_status` | Prowlarr 和 aria2 的健康检查 |

## 配置

优先级：**环境变量 > `config.json` > 内置默认值**。所以 Docker 里几乎不用挂配置文件。

| 环境变量 | 默认值 | 说明 |
|---|---|---|
| `PROWLARR_URL` | `http://127.0.0.1:9696` | Prowlarr 地址 |
| `PROWLARR_API_KEY` | 空 | 不填时会尝试从 `PROWLARR_CONFIG_XML` 里读 |
| `PROWLARR_CONFIG_XML` | 空 | Prowlarr 的 `config.xml` 路径 |
| `ARIA2_RPC_URL` | `http://127.0.0.1:6800/jsonrpc` | aria2 RPC 地址（Motrix 是 16800） |
| `ARIA2_SECRET` | 空 | RPC 密钥 |
| `ARIA2_MANAGED` | `1`（容器内） | 为 1 时容器自己拉起 aria2c |
| `DOWNLOAD_DIR` | 空 | 默认下载目录 |
| `PORT` / `HOST` | `8787` / `127.0.0.1` | 网页界面监听地址（容器内 HOST=0.0.0.0） |

## HTTP API

网页界面就是这几个接口的消费者，也可以直接调：

| 方法 | 路径 | 说明 |
|---|---|---|
| `GET` | `/api/status` | 两个后端组件是否健康 |
| `GET` | `/api/search?q=&limit=&indexers=` | 搜索 |
| `POST` | `/api/download` | `{"pick":1}` 或 `{"url":"magnet:..."}` |
| `GET` | `/api/downloads?status=&limit=` | 任务列表 |
| `POST` | `/api/control` | `{"action":"pause","gid":"..."}` |
| `GET` | `/api/indexers?test=1` | 索引器列表 / 连通性 |

## 目录结构

```
src/
  lib/config.mjs    环境变量 + config.json 合并
  lib/prowlarr.mjs  Prowlarr API 封装、磁力链接归一化
  lib/aria2.mjs     aria2 JSON-RPC 客户端
  lib/ops.mjs       MCP 与 Web 共用的业务逻辑（含搜索结果编号缓存）
  mcp.mjs           stdio MCP server
  web/server.mjs    HTTP API + 静态前端
  web/public/       前端（原生 HTML/CSS/JS，无构建）
docker/entrypoint.sh  容器入口：生成 aria2 配置 → 启动 aria2 → 启动 web
scripts/bootstrap.mjs 索引器批量导入
scripts/install-macos.sh  macOS 原生安装
scripts/call.mjs      命令行调用 MCP 工具，便于调试
tests/                node:test 单元测试
```

## 开发

```bash
node --test                                  # 单元测试（9 个，不需要网络）
node scripts/call.mjs search '{"query":"sintel"}' download '{"pick":1}' downloads '{}'
node src/web/server.mjs                      # 只跑网页界面
docker build -t media-stack-mcp .            # 构建镜像
```

## 常见问题

**搜索很慢或者没结果。** 慢源要等超时，聚合搜索普遍 10–90 秒。某些索引器在特定网络下不可达，
可以用 `node scripts/bootstrap.mjs --test` 看哪些是通的，或在 Prowlarr 里停用不可达的源。

**下载一直卡在 0%。** 检查 aria2 是否有做种来源：`stack_status` 会显示 aria2 是否在线，
`downloads` 里能看到 seeds/peers。纯 magnet 链接需要 DHT 能连通。

**容器里下完的文件在哪。** `docker-compose.yml` 把 `./downloads` 挂到了容器的 `/downloads`。

**用 exFAT / 网络盘做项目目录。** 这类文件系统不保存可执行位，脚本要用 `bash script.sh` 调用，
Dockerfile 里也已经显式 `chmod +x`。

## 免责声明

这个项目只是一个索引查询和下载的前端外壳，本身不托管任何内容。索引器返回什么、你要下载什么，
取决于你自己的判断和你所在地区的法律。请自行确认使用权。

## License

MIT
