# 💻 MacBook Setup

一键式 MacBook 初始化流程。Agent 可按章节顺序执行。

## 🙋 执行前澄清

- 是否已有代理工具？（影响软件下载、镜像源选择）
- 是否需要配置 GPU 环境？（Apple Silicon / CUDA 相关）

## 1️⃣ 系统基础

- 安装 Homebrew
- 安装常用 CLI 工具：`brew install git curl wget vim tmux htop tree unzip`

## 2️⃣ Shell 配置

- 安装 zsh + oh-my-zsh
- 配置插件：zsh-autosuggestions, zsh-syntax-highlighting
- 🎨 自定义命令行格式（彩色 PS1）

## 3️⃣ 代理配置

- 安装代理工具
- 配置终端代理：`export https_proxy=http://127.0.0.1:{port} http_proxy=http://127.0.0.1:{port}`
- 写入 `~/.zshrc`，按需开关

## 4️⃣ Python 环境 🐍

- 安装 Miniconda（最新版）
- 配置 pip 镜像源（无代理时使用清华/阿里）
- 创建默认 conda 环境，安装常用包：numpy, pandas, torch, jupyter

## 5️⃣ 开发工具 🛠️

- 安装 Docker Desktop
- 安装 Node.js (LTS)：`brew install node`
- 安装 VS Code：`brew install --cask visual-studio-code`
- 安装终端：`brew install --cask warp`

## 6️⃣ Git & SSH 🔑

- 配置 Git 全局信息：`git config --global user.name "GeminiLight" && git config --global user.email "wtfly2018@163.com"`
- 生成 SSH key，添加到 GitHub
- 配置 `~/.ssh/config`（参考 Files/🔑 SSH 配置.md）

## 7️⃣ 常用软件

参考 [Files/📦 Mac 常用软件.md](Files/📦 Mac 常用软件.md)

## 8️⃣ 目录结构 📁

- 创建标准目录：`mkdir -p ~/code ~/research ~/data`
- 克隆常用仓库

## ✅ 验证清单

- `brew --version`
- `python --version` / `conda info`
- `docker --version`
- `node --version`
- `git config --list`
- `ssh -T git@github.com`
