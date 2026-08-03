# Latent Garden

[![CI](https://github.com/ZhouYinLong-lab/Latent-Garden/actions/workflows/ci.yml/badge.svg)](https://github.com/ZhouYinLong-lab/Latent-Garden/actions/workflows/ci.yml)
[![Live site](https://img.shields.io/badge/live-semantic%20garden-718650)](https://latent-garden.zylatent.com/)
[![Python](https://img.shields.io/badge/Python-3.10%2B-3776AB?logo=python&logoColor=white)](https://www.python.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Latent Garden is a provider-agnostic semantic map generator for blogs, documents, projects, notes, repositories, and knowledge collections.

它把 Markdown、MDX、JSON、RSS/Atom 或公开网站内容归一化为统一数据模型，生成 embedding，经 UMAP 投影和聚类后输出可静态部署的 `garden.json`。前端、API 和内容源之间只通过这一数据契约连接。

> 一个把个人公开内容投影到语义空间的通用工具；寒柳别苑是它的第一个真实案例。

## 在线案例

- [完整花园](https://latent-garden.zylatent.com/)：寒柳别苑全部公开文章，强调个人表达与内容之间的意外邻近关系。
- [Engineering Garden](https://latent-garden.zylatent.com/?view=engineering)：仅保留 AI、计算、工具、开源和互动项目，更适合作品集入口。

[![zylatent.com semantic map](docs/assets/zylatent-garden-map.svg)](https://latent-garden.zylatent.com/)

## Core 与案例边界

Latent Garden Core 不依赖寒柳别苑源码，也不知道任何博客主题名称：

```text
Core
├── adapters/       Markdown、MDX、JSON、RSS/Atom、公开网站
├── providers/      可替换的 EmbeddingProvider
├── pipeline/       缓存、UMAP、聚类、输出契约
├── frontend/       读取任意 garden.json 的静态交互前端
└── api/            可选 FastAPI 服务

examples/zylatent/
├── config.json                 网站清洗、展示主题、策展规则和命名视图
├── garden.json                 完整花园快照
├── engineering-garden.json     技术向视图快照
└── README.md                   案例生成说明
```

案例 profile 可以提供标题清洗、描述补充、品牌文案、主题颜色和人工策展规则，但不会进入通用 `core/`、`pipeline/` 或 provider。

## 工作原理

```text
Content source → Adapter → ContentItem → EmbeddingProvider
                                      ↓
                              content-hash cache
                                      ↓
                         UMAP reducer → Clusterer
                                      ↓
                        optional case profile / views
                                      ↓
                              garden.json → Frontend/API
```

需要区分两类信息：

- **语义坐标**：标题、摘要、正文和标签生成高维向量，再由 UMAP 投影到二维。点越近通常表示内容关系越近，但二维距离不是绝对相似度分数，坐标方向和同心圆也没有固定量纲。
- **主题标签**：通用流程默认使用 K-Means；案例也可以在坐标生成后增加人工策展层。寒柳别苑的五个主题来自关键词辅助的编辑规则，不是模型自动发现的五个天然类别。

当前在线案例使用离线、确定性的 **Hash 64D provider**，便于零密钥部署和复现。接入 OpenAI 或其他真实 embedding provider 后，可以获得更可靠的语义关系。

## 特性

- 稳定的 `ContentItem`、`GardenNode`、`GardenCluster` 和 `Garden` 数据模型
- 可替换的 `EmbeddingProvider`，内置离线 hash provider 与 OpenAI provider
- 以内容 hash 和 provider cache key 为索引的 embedding 缓存
- UMAP 二维投影；缺少科学计算依赖时提供确定性回退
- K-Means 默认聚类，以及与核心解耦的可选案例 profile
- Markdown、MDX、JSON、RSS、Atom 和公开网站适配器
- 网站抓取清洗：HTML/组件文本过滤、标题规范化、重复标题去重、摘要质量门槛
- 零构建依赖前端：搜索、主题筛选、近邻连线、缩放、受限平移和原文跳转
- 完整花园与命名子视图，可为个人表达和作品集提供不同入口
- 可选 FastAPI、Docker、GitHub Pages 和定时刷新流程

## 快速开始

要求 Python 3.10+。

```bash
git clone https://github.com/ZhouYinLong-lab/Latent-Garden.git
cd Latent-Garden
python -m venv .venv
source .venv/bin/activate       # Windows PowerShell: .\.venv\Scripts\Activate.ps1
pip install -e ".[analysis]"
```

仓库中的通用示例混合了 `article`、`project`、`note`、`repository` 和 `poem`：

```bash
python -m pipeline.cli \
  --input examples/content \
  --output examples/garden.json \
  --cache .latent-garden/examples-embeddings.json
cp examples/garden.json frontend/garden.json
python -m http.server 8000 --directory frontend
```

打开 <http://localhost:8000/>。

### 使用 OpenAI embedding

```bash
export OPENAI_API_KEY="your-key"  # PowerShell: $env:OPENAI_API_KEY="your-key"
python -m pipeline.cli \
  --input examples/content \
  --output examples/garden.json \
  --provider openai
```

### 读取公开网站

```bash
python -m pipeline.cli \
  --website https://example.org \
  --output examples/site-garden.json
```

网站可以提供独立的 JSON profile，用于移除站点特有标题前缀、过滤组件文本和设置最短摘要：

```bash
python -m pipeline.cli \
  --website https://example.org \
  --website-config path/to/site-profile.json \
  --output examples/site-garden.json
```

## 输入与输出

Markdown/MDX 使用 frontmatter：

```markdown
---
title: A local-first search project
description: An inspectable retrieval pipeline for private notes.
tags: [AI, retrieval]
date: 2026-01-01
url: https://example.org/projects/local-search
type: project
---

正文会参与 embedding，但不会写入最终 garden.json。
```

JSON 可以是对象、对象数组或 `{ "items": [...] }`。支持字段包括 `id`、`title`、`description`、`body/content/text`、`tags`、`date`、`url`、`type/content_type`。

前端节点示例：

```json
{
  "id": "local-search",
  "title": "Local-first search",
  "description": "An inspectable retrieval pipeline.",
  "tags": ["AI", "retrieval"],
  "date": "2026-01-01",
  "url": "https://example.org/projects/local-search",
  "content_type": "project",
  "x": 0.12,
  "y": -0.34,
  "cluster_id": 0
}
```

## 寒柳别苑案例

案例 profile 位于 [`examples/zylatent/config.json`](examples/zylatent/config.json)。它负责：

- 移除“每日诗语”等地图展示前缀；
- 过滤评论、导航、页脚、源码链接等组件文本；
- 拒绝或补充空白、过短摘要；
- 将语义坐标上的内容整理为五个编辑主题；
- 输出完整花园与 Engineering Garden。

当前案例快照：

| 项目 | 结果 |
| --- | --- |
| 来源 | [zylatent.com](https://zylatent.com) 公开文章 |
| 完整视图 | 41 个节点、5 个编辑主题 |
| Engineering 视图 | 17 个节点、3 个编辑主题 |
| Embedding | Hash 64D（可替换） |
| 坐标 | UMAP 2D |
| 最终主题方式 | `curated-keywords` |
| 完整输出 | [`examples/zylatent/garden.json`](examples/zylatent/garden.json) |
| 技术输出 | [`examples/zylatent/engineering-garden.json`](examples/zylatent/engineering-garden.json) |

重新生成案例：

```bash
python -m pipeline.cli \
  --website https://zylatent.com \
  --website-config examples/zylatent/config.json \
  --output .latent-garden/zylatent-raw.json \
  --cache .latent-garden/zylatent-embeddings.json
python scripts/apply_case_profile.py \
  .latent-garden/zylatent-raw.json examples/zylatent/config.json \
  --view full --output examples/zylatent/garden.json
python scripts/apply_case_profile.py \
  .latent-garden/zylatent-raw.json examples/zylatent/config.json \
  --view engineering --output examples/zylatent/engineering-garden.json
```

## API 与部署

```bash
pip install -e ".[api]"
uvicorn api.server:app --host 0.0.0.0 --port 8000
```

API 提供 `/health`、`/garden.json`、`/api/garden`、`/api/refresh` 和 `/frontend/`。静态前端可以部署到任意静态主机，也可通过 iframe 或 `?data=` 参数读取其他 `garden.json`。

生产部署、Docker、Pages 和案例定时刷新见 [`docs/deployment.md`](docs/deployment.md)。

## 仓库结构

```text
latent-garden/
├── core/                  # 稳定数据契约
├── pipeline/              # embedding、缓存、降维、聚类与 CLI
├── providers/             # EmbeddingProvider 实现
├── adapters/              # 内容源适配与网站清洗
├── frontend/              # 通用静态交互前端
├── api/                   # 可选 FastAPI 服务
├── examples/
│   ├── content/           # 多 content_type 通用输入
│   └── zylatent/          # 首个真实案例配置与双视图输出
├── scripts/               # 通用案例 profile 与预览脚本
├── tests/                 # 单元、契约与 API 测试
├── docs/                  # 架构、部署和发布文档
└── .github/               # CI、Pages、案例刷新和社区模板
```

## 文档与贡献

- [`docs/architecture.md`](docs/architecture.md)：模块边界与扩展点
- [`docs/deployment.md`](docs/deployment.md)：静态、API、Docker、Pages 与刷新流程
- [`frontend/README.md`](frontend/README.md)：前端数据契约、交互和 iframe 参数
- [`CONTRIBUTING.md`](CONTRIBUTING.md)：开发与 Pull Request 流程
- [`SECURITY.md`](SECURITY.md)：漏洞报告
- [`CHANGELOG.md`](CHANGELOG.md)：变更记录

欢迎提交新的 adapter、EmbeddingProvider、case profile 和可视化改进。问题与建议请使用 [GitHub Issues](https://github.com/ZhouYinLong-lab/Latent-Garden/issues)。

## License

[MIT](LICENSE)
