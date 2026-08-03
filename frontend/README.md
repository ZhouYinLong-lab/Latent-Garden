# Latent Garden Frontend

这是一个零构建依赖的独立语义地图前端。它只消费一个符合 `garden.json` 契约的 JSON 文件，因此可以单独部署、嵌入博客，或作为其他内容集合的展示层。

在线实例：[latent-garden.zylatent.com](https://latent-garden.zylatent.com/)

## 地图如何阅读

- 一个圆点代表一篇文章、一个项目或一条文档记录；
- 点与点越接近，代表 embedding 在语义空间中越相似；
- 细线连接二维地图中最近的内容，悬停节点时会突出它的局部关系；
- 主题栏中的颜色对应 `garden.json` 的分组；它可以来自默认聚类，也可以来自明确标记的案例策展层；
- 雷达式同心网格只是阅读辅助，不是统计雷达图，坐标轴方向没有固定含义；
- 点击节点可以查看标题、摘要和标签，并跳转到内容原始 URL。

zylatent.com 的默认展示在语义坐标之上增加了一层示例级编辑策展，右侧固定为五个更适合博客阅读的主题：智能与计算、工具与开源、互动实验、诗歌与文学、影像与见闻。规则位于 `examples/zylatent/config.json`，由通用的 `scripts/apply_case_profile.py` 读取，不进入 core，也不会把 Latent Garden 与博客源码耦合。

地图使用严格的 SVG clipping region：网格、节点光晕和标签都被限制在地图矩形内，缩放或拖拽时不会越过边界。

节点标签会根据左右可用空间自动选择方向，并按空间截短；完整标题仍保留在 SVG 的原生提示中。算法参数继续由 `garden.json` 暴露，供外部页面或 API 使用。

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

前端默认使用中性的低饱和语义地图界面。案例可以通过 `garden.metadata.presentation` 提供标题、简介、来源、主题名称和受支持的 theme id；寒柳别苑的庭院背景和品牌文案来自 `examples/zylatent/config.json`，不是通用前端的固定产品文案。地图网格与连线是辅助阅读层，不应抢过节点；主题栏承担解释颜色和筛选的职责；独立标签层确保悬停标题不会被其他节点遮挡。

桌面端以单个视口为排版边界，不需要上下滚动；移动端会压缩标题和主题索引，在同一个视口内保留主要交互。

## 部署

- 静态托管：发布整个 `frontend/` 目录；
- GitHub Pages：仓库的 `.github/workflows/pages.yml` 会自动发布；
- API：使用 `?data=/api/garden` 从同源 API 读取数据；
- iframe：使用 `embed=1` 隐藏独立页面的品牌头部和页脚。

完整部署说明见 [`../docs/deployment.md`](../docs/deployment.md)。
