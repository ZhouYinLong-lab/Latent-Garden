# Latent Garden Frontend

这是一个零构建依赖的独立语义地图前端。它只消费一个符合 `garden.json` 契约的 JSON 文件，因此可以单独部署、嵌入博客，或作为其他内容集合的展示层。

在线实例：[latent-garden.zylatent.com](https://latent-garden.zylatent.com/)

## 地图如何阅读

- 一个圆点代表一篇文章、一个项目或一条文档记录；
- 点与点越接近，代表 embedding 在语义空间中越相似；
- 细线连接二维地图中最近的内容，悬停节点时会突出它的局部关系；
- 主题栏中的颜色对应 pipeline 生成的聚类结果；
- 雷达式同心网格只是阅读辅助，不是统计雷达图，坐标轴方向没有固定含义；
- 点击节点可以查看标题、摘要和标签，并跳转到内容原始 URL。

zylatent.com 的默认展示在聚类结果之上增加了一层示例级编辑策展，右侧固定为五个更适合博客阅读的主题：智能与计算、工具与开源、互动实验、诗歌与文学、影像与见闻。这一步由 `scripts/curate_zylatent_topics.py` 完成，不进入通用 core，也不会把 Latent Garden 与博客源码耦合。

地图使用严格的 SVG clipping region：网格、节点光晕和标签都被限制在地图矩形内，缩放或拖拽时不会越过边界。

节点标签会根据左右可用空间自动选择方向，并按空间截短；完整标题仍保留在 SVG 的原生提示中。右侧“如何衡量？”面板会读取 `garden.json` 中的 provider、向量维度和 UMAP 参数，并解释位置、连线与主题颜色的含义。

## 交互

- 输入关键词：匹配标题、摘要和标签；
- 点击主题：只突出该主题的节点，并显示节点标签；
- 滚轮：以指针位置为中心缩放；
- 拖拽：仅在放大后移动地图视野，并限制在初始地图边界内；
- 重置视图：清空搜索和主题筛选并恢复初始视野；
- 点击节点：使用原生链接在新标签页直接打开原文；没有 URL 时才显示本地详情卡片。

## 本地运行

`frontend/` 不需要 npm 或构建步骤：

```bash
python -m http.server 8000 --directory frontend
```

访问 <http://localhost:8000/>。默认加载同目录的 `garden.json`。

## 数据源

通过 `data` 参数加载其他允许 CORS 的地图数据：

```text
http://localhost:8000/?data=https://example.com/garden.json
```

`garden.json` 的节点至少需要以下字段：

```json
{
  "id": "unique-id",
  "title": "A document",
  "description": "Short summary",
  "tags": ["topic"],
  "url": "https://example.com/document",
  "content_type": "article",
  "x": 0.12,
  "y": -0.34,
  "cluster_id": 0
}
```

主题簇由顶层 `clusters` 提供：

```json
{
  "id": 0,
  "label": "Python",
  "node_ids": ["unique-id"],
  "color": "#a8bd72"
}
```

前端会对外部数据的颜色和坐标做安全归一化：颜色只接受 `#RRGGBB`，点位限制在地图边界内。

## URL 参数

| 参数 | 示例 | 作用 |
| --- | --- | --- |
| `data` | `?data=/api/garden` | 替换默认 `./garden.json` |
| `embed` | `?embed=1` | 隐藏页面标题和页脚，适合 iframe |
| `cluster` | `?cluster=0` | 初始选中一个主题簇 |

iframe 示例：

```html
<iframe
  src="https://latent-garden.zylatent.com/?embed=1"
  title="Latent Garden semantic map"
  style="width:100%;height:720px;border:0"
  loading="lazy">
</iframe>
```

## 设计原则

前端采用温暖纸张、寒柳绿、低饱和簇色和细边界，重点是让内容节点保持清晰。页面背景使用生成式视觉方向稿的压缩版本 `assets/courtyard-map-background.webp`，以低透明度保留竹影和庭院氛围。地图网格与连线是辅助阅读层，不应抢过节点；主题栏承担解释颜色和筛选的职责；悬停节点会提升到 SVG 顶层，确保标题不被其他节点遮挡。

桌面端以单个视口为排版边界，不需要上下滚动；移动端会压缩标题和主题索引，在同一个视口内保留主要交互。

## 部署

- 静态托管：发布整个 `frontend/` 目录；
- GitHub Pages：仓库的 `.github/workflows/pages.yml` 会自动发布；
- API：使用 `?data=/api/garden` 从同源 API 读取数据；
- iframe：使用 `embed=1` 隐藏独立页面的品牌头部和页脚。

完整部署说明见 [`../docs/deployment.md`](../docs/deployment.md)。
