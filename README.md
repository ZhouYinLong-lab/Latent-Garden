# Latent Garden

Latent Garden（个人语义花园）是一个独立的通用语义地图生成工具：读取 Markdown、MDX、JSON 或未来接入的知识源，提取统一内容字段，生成 embedding，经过 UMAP 降维与主题聚类，输出可以被任意前端消费的 garden.json。

zylatent.com 是这个项目的展示示例，也是仓库名字的来源。它只是示例内容的第一个使用者；Latent Garden 不依赖博客源码，未来可以被博客通过 JSON、静态页面、iframe 或 API 接入。

## 目录

- core/：ContentItem、GardenNode、Garden 等稳定数据模型
- pipeline/：内容处理、hash 缓存、embedding、UMAP、聚类与 CLI
- providers/：可替换 EmbeddingProvider；内置离线 hash provider 与显式调用的 OpenAI provider
- adapters/：Markdown、MDX、JSON 读取适配器
- frontend/：零构建依赖的独立交互式语义地图
- examples/：来自 zylatent.com 的脱钩示例内容与生成输出
- tests/：适配器、缓存与输出契约测试

## 快速开始

要求 Python 3.10+。使用内置的 hash provider 不需要 API key：

    python -m pipeline.cli --input examples/content --output examples/garden.json
    Copy-Item examples/garden.json frontend/garden.json

然后用任意静态服务器打开 frontend/。例如：

    python -m http.server 8000 --directory frontend

浏览器访问 http://localhost:8000，点击节点可以跳转到示例文章 URL。也可以通过 ?data=https://example.com/garden.json 指向任意允许 CORS 的远程输出。

生产环境可安装可选分析依赖，让 reducer 使用真正的 UMAP：

    pip install -e ".[analysis]"

使用 OpenAI embedding：

    $env:OPENAI_API_KEY = "your-key"
    python -m pipeline.cli --input examples/content --output examples/garden.json --provider openai

## 输入格式

Markdown/MDX 支持 YAML 风格 frontmatter：

    ---
    title: A note
    description: Short summary
    tags: [design, note]
    date: 2026-01-01
    url: https://example.com/note
    type: article
    ---

JSON 可以是单个对象、对象数组，或 { "items": [...] }。常用字段为 id、title、description、body/content/text、tags、date、url、type。

## garden.json 契约

每个 node 至少包含：

    {
      "id": "thinking-in-gardens",
      "title": "Thinking in gardens",
      "description": "...",
      "tags": ["writing", "knowledge"],
      "date": "2026-01-18",
      "url": "https://zylatent.com/notes/thinking-in-gardens",
      "content_type": "article",
      "x": 0.12,
      "y": -0.34,
      "cluster_id": 0
    }

这使得博客无需知道 embedding、UMAP 或聚类实现，只需展示输出。

## 远程仓库

远程仓库已绑定为 [ZhouYinLong-lab/Latent-Garden](https://github.com/ZhouYinLong-lab/Latent-Garden)。如果你从一个全新 clone 开始，常规推送方式是：

    git init
    git add .
    git commit -m "Initialize Latent Garden"
    git branch -M main
    git remote add origin https://github.com/ZhouYinLong-lab/Latent-Garden.git
    git push -u origin main

## License

MIT
