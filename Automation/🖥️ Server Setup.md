# 🖥️ Server Setup

一键式服务器初始化流程，适用于 Linux (Ubuntu/Debian) 开发服务器。Agent 可按章节顺序执行。

## 🙋 执行前澄清

- 服务器是否支持翻墙？（影响软件源、下载地址的选择）
- 是否需要配置 GPU 环境？（影响 CUDA / PyTorch 版本）
- 使用 zsh 还是 bash 作为默认 shell？
- 是否需要安装 Docker？（部分服务器无权限）

## 1️⃣ 系统基础

- 系统更新：`apt update && apt upgrade`
- 安装常用工具：git, curl, wget, vim, tmux, htop, tree, unzip
- 安装 zsh + oh-my-zsh，配置插件：zsh-autosuggestions, zsh-syntax-highlighting
- 🎨 自定义命令行格式（彩色 PS1）

## 2️⃣ Python 环境 🐍

- 安装 Miniconda（最新版）
- 配置 pip 镜像源（清华/阿里，无翻墙时使用）
- 创建默认 conda 环境，安装常用包：numpy, pandas, torch, jupyter

## 3️⃣ 开发工具 🛠️

- 安装 Docker + Docker Compose
- 安装 Node.js (LTS) + npm

## 4️⃣ Git & SSH 🔑

- 配置 Git 全局信息：`git config user.name "GeminiLight" && git config user.email "wtfly2018@163.com"`
- 生成 SSH key，添加到 GitHub
- 配置 ~/.ssh/config 管理多服务器

## 5️⃣ 目录结构 📁

- 创建标准目录：`mkdir -p ~/code ~/research ~/data`
- 克隆常用仓库

## ✅ 验证清单

- python --version / conda info
- docker --version / docker run hello-world
- claude --version
- git config --list
- ssh -T git@github.com
