# MindOS — 从 npm 安装并以前台方式运行（适合 Docker / compose）
# 文档：DOCKER.md
#
# 构建（追最新）：
#   docker build -t mindos:latest --build-arg MINDOS_VERSION=latest .
# 钉版本：
#   docker build -t mindos:0.5.57 --build-arg MINDOS_VERSION=0.5.57 .
# 强制重新拉包：
#   docker build --no-cache ...

FROM node:22-bookworm-slim

ARG MINDOS_VERSION=latest

LABEL org.opencontainers.image.title="MindOS"
LABEL org.opencontainers.image.source="https://github.com/GeminiLight/MindOS"
LABEL org.opencontainers.image.description="MindOS from npm (@geminilight/mindos)"

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates git \
  && rm -rf /var/lib/apt/lists/*

RUN npm install -g @geminilight/mindos@${MINDOS_VERSION}

RUN mkdir -p /data/mind

WORKDIR /root

EXPOSE 3456 8781

# 勿在容器内使用 mindos start --daemon（依赖宿主 systemd/launchd）
CMD ["mindos", "start"]
