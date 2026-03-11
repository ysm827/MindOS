# 实施路线图 (Implementation Roadmap)

## 当前版本状态 (v0.1.0)

**核心已完成：**
- Next.js 16 前端（双模式编辑、搜索、AI 对话、图谱、10 个渲染器插件）
- MCP Server（20+ 工具，stdio + HTTP 双传输，Bearer Token 认证）
- MindOS Skills（EN + ZH，28 条 evals）
- 中英双语模板
- CI/CD 自动同步 + Landing Page 部署

---

## P0 — 近期修复 & 优化

| 项 | 类别 | 状态 |
|---|------|------|
| 首页布局：Search Files 与 Ask AI 调换位置，突出 AI-native 特性 | UI | 待做 |
| 首页：Plugins 放在 Recently Modified 上方 | UI | 待做 |
| 首页：New Note 按钮重命名 + 修复 404 | Bug | 待做 |
| 移动端 Landing Page Topbar 显示问题 | Bug | 待做 |
| 历史对话的持久化与管理 | Feature | 待做 |
| 优化模板内容 | Content | 待做 |
| 优化 Skill 工作流指引 | Content | 持续 |

## P1 — 下一里程碑

| 项 | 说明 | 优先级 |
|---|------|--------|
| **ACP (Agent Communication Protocol)** | 连接外部 Agent（如 Claude Code、Cursor），让知识库成为多 Agent 协作中枢 | 高 |
| **深度 RAG 集成** | 基于知识库内容的检索增强生成，语义搜索 + 向量数据库 | 高 |
| **反向链接视图 (Backlinks View)** | 在文件页面直接展示所有引用当前文件的反向链接 | 中 |
| **Agent Inspector 增强** | 将 Agent 操作日志渲染为可筛选时间线，审查每次工具调用详情 | 中 |
| **前端密码验证** | 非 API Token 的前端登录保护 | 中 |

## P2 — 中期愿景

| 项 | 说明 |
|---|------|
| **评论/批注机制** | Agent 在文件旁添加批注，支持人机异步协作 |
| **心智时光机 (Mind State Time-lapse)** | 可视化知识演变过程，展示 SOP 如何在 Agent 反思与人类纠偏中成熟 |
| **分享模板 / .md** | 支持导出和导入社区模板 |
| **创造者故事** | Landing Page 加入创造者/用户故事 |

## P3 — 长期探索

| 项 | 说明 |
|---|------|
| **动态技能协议 (Dynamic Skill Manifest)** | 在 Markdown 中直接定义自动化脚本，笔记即工具 |
| **跨 Agent 协同网格 (Agent-to-Agent Mesh)** | 冲突解决协议，多厂商 Agent 围绕同一 MindOS 协作 |
| **主动式后台 Agent** | Agent 自动检测笔记内容，提示结构化建议或自动维护引用图谱 |
| **本地语义索引** | 轻量级本地向量数据库（DuckDB/LanceDB），模糊搜索进化为语义搜索 |

---
*Last Updated: 2026-03-11*
