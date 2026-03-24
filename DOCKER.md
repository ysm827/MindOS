# MindOS 服务器部署（Docker，Web + MCP 对公网）

本文说明如何用 Docker **长期运行** MindOS，并**对外暴露 Web 端口与 MCP HTTP 端口**。仓库根目录已包含 **`Dockerfile`**、**`docker-compose.yml`**、**`.dockerignore`**；以下为说明与补充，请按环境调整。

---

## 1. 安全前提（必读）

将 **Web UI** 与 **MCP HTTP** 直接暴露到公网，等价于对外提供「可读写你知识库」的能力（视配置与鉴权而定）。部署前请至少做到：

| 项 | 建议 |
|----|------|
| **TLS** | 公网入口使用 **HTTPS**（Caddy / Nginx / Traefik 等反向代理 + 证书），不要长期裸 HTTP 对公网。 |
| **Web 登录** | 在 `~/.mindos/config.json` 中设置强 **`webPassword`**（或通过 onboard / 设置流程写入）。 |
| **API / MCP** | 设置强随机 **`authToken`**；MCP 客户端使用 `Authorization: Bearer <authToken>`。 |
| **网络** | 优先 **仅内网或 VPN** 访问 MCP；若必须公网，建议再加 IP 允许列表、WAF、或仅 SSH 隧道。 |
| **备份** | 知识库目录与 `config.json` 做定期备份；卷不要只存在容器可写层。 |

**不要将** `config.json`、`.env` 含 API Key **提交到 Git**。

---

## 2. 架构与端口

| 服务 | 容器内默认端口 | 说明 |
|------|----------------|------|
| **Web**（Next.js） | `3456` | 由 `MINDOS_WEB_PORT` / `config.port` 控制；Next 生产模式默认可监听 `0.0.0.0`。 |
| **MCP**（HTTP） | `8781` | 由 `MINDOS_MCP_PORT` / `config.mcpPort` 控制；默认绑定 **`0.0.0.0`**，适合容器内对外映射。 |

同一容器内，MCP 通过 **`http://127.0.0.1:<WebPort>`** 访问 Web（`MINDOS_URL`），**无需**把该回环地址改成公网域名。

公网用户访问：

- **浏览器**：`https://你的域名`（反代到 Web 端口）。
- **MCP 客户端**（远程）：`https://你的域名:8781/mcp` 或单独子域反代到 MCP 端口（路径以实际 `MCP_ENDPOINT` 为准，默认 `/mcp`）。

---

## 3. 推荐约定

1. **版本策略（二选一）**：
   - **追最新**：构建参数使用 `MINDOS_VERSION=latest`（见下文 Dockerfile），并定期 **`docker compose build --no-cache`** 后 **`up -d`**，或仅在宿主机执行 **`npm install -g @latest` + 重启容器**（见 §7），使全局包与 npm 上最新版一致。
   - **可复现 / 生产稳妥**：构建时钉死版本号（如 `0.5.57`），升级时改号再重建；避免未经测试的自动大版本。
2. **持久化**（两个逻辑路径）：
   - **状态与配置**：命名卷挂载容器内 **`/root/.mindos`**（`config.json`、日志、pid 等）。
   - **知识库**：`docker-compose.yml` 默认把**宿主** **`~/MindOS/mind`** 绑定到容器 **`/data/mind`**；`config.json` 里的 **`mindRoot`** 应填**容器内路径** **`/data/mind`**（与你在宿主上的 `~/MindOS/mind` 是同一套文件）。可用环境变量 **`MINDOS_KB_HOST`** 改成其他宿主目录。
3. **Node 版本**：根目录 `package.json` 要求 Node `>=18`；当前应用依赖的 Next.js 可能对 Node 有更高要求，建议使用 **Node 20 LTS 或 22 LTS** 基础镜像。
4. **资源**：首次启动或版本升级可能触发 **`next build`**，CPU/内存与磁盘会有一波峰值，请给足内存（建议 **≥2 GiB** 可用）。

---

## 4. Dockerfile

仓库根目录 **`Dockerfile`**：从 **npm** 安装 `@geminilight/mindos`（不拷贝本仓库源码）。构建时间可能较长，属正常现象。

构建：

```bash
# 与发布线一致的最新版（推荐定期执行以拉取新 dist-tag）
docker build -t mindos:latest --build-arg MINDOS_VERSION=latest .

# 或钉死版本
docker build -t mindos:0.5.57 --build-arg MINDOS_VERSION=0.5.57 .
```

若曾构建过旧层，升级后想强制重新执行 `npm install` 这一层，请加 **`--no-cache`**。

---

## 5. docker-compose（映射 Web + MCP）

仓库根目录 **`docker-compose.yml`** 已包含服务定义、双卷与健康检查。可按需修改：

- **`build.args.MINDOS_VERSION`**：`latest` 或钉版本（如 `0.5.57`）。
- **`ports`**：生产建议改为 `127.0.0.1:3456:3456` 与 `127.0.0.1:8781:8781`，由宿主机反代对外。

**首次运行**：若卷上还没有 `config.json`，在项目根目录执行（与 `up` 共用同一卷名）：

```bash
docker compose run mindos mindos onboard
```

若出现 **`unknown flag: --rm`**：说明当前没有可用的 **`docker compose`**（V2 插件），顶层 `docker` 误解析了参数。请先安装插件（Debian/Ubuntu：`sudo apt install docker-compose-plugin`；RHEL/Fedora 等无 `apt` 的系统：`sudo dnf install docker-compose-plugin` 或 `sudo yum install docker-compose-plugin`），再执行 `docker compose version` 确认。也可改用独立命令：**`docker-compose run --rm mindos mindos onboard`**（包名常为 `docker-compose`）。不用 `--rm` 时，退出后若留下一次性容器，可 **`docker compose rm -f`** 清理。

将 **`mindRoot`** 设为 **`/data/mind`**（对应宿主上的 **`~/MindOS/mind`**，除非你改了 `MINDOS_KB_HOST`）。完成后：

```bash
docker compose up -d
```

若不用 compose、只用裸 `docker run`，需自行 `-v ~/MindOS/mind:/data/mind`（或你的路径）并保证 onboard 里 **`mindRoot` 为 `/data/mind`**。

---

## 6. 反向代理（推荐）

不要依赖裸端口对公网；在前面加一层 **HTTPS 反代**：

- **Web**：`proxy_pass http://127.0.0.1:3456`，按需开启 WebSocket（若后续有实时能力）。
- **MCP**：将另一虚拟主机或路径反代到 `http://127.0.0.1:8781`，注意 MCP 使用 **Streamable HTTP**，需 **较长超时** 与合适 **请求体大小限制**。

客户端侧 MCP URL 使用 **https://…**，并在 Agent 配置里保留 **`Authorization: Bearer <authToken>`**（与 `mindos token` / `config.json` 中一致）。

---

## 7. 在 Docker 里更新到最新版

容器内数据在 **volume** 里，升级的是 **镜像里的全局 `mindos` 包**（以及首次启动时的 `next build` 产物，位于镜像层或容器可写层，视你是否把 `node_modules` 放进卷而定；默认 MindOS 装在全局 npm，**不**必单独挂卷）。

### 7.1 推荐：重建镜像（干净、等价于「装最新包」）

在宿主机、与 `Dockerfile` 同目录执行：

```bash
docker compose build --no-cache
docker compose up -d
```

`MINDOS_VERSION=latest` 时，`--no-cache` 会跳过旧缓存，确保重新执行 `npm install -g @geminilight/mindos@latest`。

### 7.2 不换 Dockerfile：仅在运行中的容器里升级全局包

适合「镜像标签不变，但想立刻拉到 npm 最新」：

```bash
docker compose exec mindos npm install -g @geminilight/mindos@latest
docker compose restart mindos
```

重启后 `CMD` 会再次执行 `mindos start`，新版本会按需 **重新 build** Next，首启可能较慢。

### 7.3 不建议：在容器里对「正在作为 PID 1 跑 `mindos start`」执行 `mindos update`

CLI 的 **`mindos update`** 在检测到服务在跑时会 **stop** 再 **detach 重启**。在 Docker 里主进程通常是 **`mindos start`**，stop 可能结束 **PID 1**，容器会直接退出，行为不如 **§7.1 / §7.2** 清晰。若已在容器外停了服务，可在 **一次性** `docker run --rm … mindos update` 里使用，但一般仍不如 **`npm install -g @latest` + 重建/重启** 简单。

### 7.4 自动化「追最新」

- **定时任务**：cron 每周执行 §7.1 或 §7.2（注意维护窗口与备份）。
- **CI**：推送或定时 pipeline 构建 `latest` 镜像并部署。
- **Watchtower** 等工具：仅在你**把镜像推到 registry** 且每次发版打新 digest 时才有意义；本地 `build` 的 `latest` 需自己重建才会变。

### 7.5 回滚

- 钉版本的镜像保留旧 tag（如 `mindos:0.5.56`），`docker compose` 改 `image:` 后 `up -d` 即可。
- 卷内 **`config.json` 与知识库** 一般无需回滚；若新版本写过不兼容配置，从备份恢复 `config.json`。

---

## 8. 故障排查

| 现象 | 方向 |
|------|------|
| 端口映射后浏览器仍无法访问 | 查云厂商安全组/防火墙；容器内 `curl -sSf http://127.0.0.1:3456/api/health`。 |
| MCP 连上但工具失败 | 确认 `AUTH_TOKEN` 与 Web 侧一致；确认反代未剥离 `Authorization`。 |
| 启动极慢或 OOM | 加大内存；查看 `mindos logs` 或卷内 `mindos.log`。 |

---

## 9. 与本地开发的关系

本地开发可用 **`MINDOS_WEB_PORT` / `MINDOS_MCP_PORT`** 覆盖配置文件端口，避免改服务器用的 `config.json`。服务器与笔记本**可共用同一知识库**（例如通过 Git sync），但**不要**让两台机同时写同一工作副本而不做合并策略，以免冲突。

本文档为运维参考，不替代官方发版说明；发版与版本语义见 `wiki/` 与 `AGENTS.md` 中的 npm / Desktop 约定。
