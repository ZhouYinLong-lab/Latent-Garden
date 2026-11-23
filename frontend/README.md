# Latent Garden Frontend

这是一个零构建依赖的独立语义地图前端。它只消费一个符合 `garden.json` 契约的 JSON 文件，因此可以单独部署、嵌入博客，或作为其他内容集合的展示层。

在线实例：[latent-garden.zylatent.com](https://latent-garden.zylatent.com/)

## 地图如何阅读

- 一个圆点代表一篇文章、一个项目或一条文档记录；
- 点与点越接近，代表 embedding 在语义空间中越相似；
- 细线连接二维地图中最近的内容，悬停节点时会突出它的局部关系；
- 右侧索引使用节点的 `categories` 和 `tags`：分类负责主结构，标签负责交叉筛选；
- 淡色/深色网格只是阅读辅助，不是统计图，坐标轴方向没有固定含义；
- 悬停或键盘聚焦节点时，会按需加载本地 WebP 文章封面；没有封面时使用主题色抽象封面；
- 点击节点会先打开详情卡片，并突出当前节点附近的 5 篇内容；原文链接位于详情卡片内。

zylatent.com 的默认展示直接使用文章 frontmatter 中的五个分类：做东西、解问题、读作品、看人间、过日子。分类和标签随节点进入 `garden.json`，不再额外维护一套关键词主题。

地图使用严格的 SVG clipping region：网格、节点光晕和标签都被限制在地图矩形内，缩放或拖拽时不会越过边界。

节点标签会根据左右可用空间自动选择方向，并按空间截短；悬停卡片会根据节点位置自动避让，不会越过地图边界。算法参数继续由 `garden.json` 暴露，供外部页面或 API 使用。

## 交互

- 输入关键词：匹配标题、摘要、分类和标签；
- 左侧投影控制：切换 2D 投影 / 3D 视角、颜色依据、分类、标签、内容类型和显示层；
- 颜色依据可以切换为分类、标签、内容类型或年份；
- 3D 视角是对现有二维投影的稳定深度预览；如果节点提供 `z` 字段，会优先使用该深度，否则使用节点 id 生成可复现的深度。它不是重新计算三维 UMAP；
- 点击分类或标签：组合筛选节点；多个标签按“任一匹配”处理，分类与标签之间按“同时满足”处理；
- 滚轮：以指针位置为中心缩放；
- 拖拽：仅在放大后移动地图视野，并限制在初始地图边界内；
- 重置视图：清空搜索、分类、标签筛选并恢复初始视野；
- 悬停/聚焦节点：查看日期、摘要、标签和封面预览；
- 点击节点：显示标题、摘要、标签和 4 篇附近文章，同时记录本次探索路径；从详情卡片打开原文。
- 右侧 metadata index：查看分类、常用标签、provider、降维方法和数据集维度。

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
  "categories": ["做东西"],
  "tags": ["topic"],
  "cover": "./assets/covers/example.webp",
  "url": "https://example.com/document",
  "content_type": "article",
  "x": 0.12,
  "y": -0.34,
  "cluster_id": 0
}
```

语义簇由顶层 `clusters` 提供；它只用于地图区域和近邻关系，不承担编辑分类：

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
| `theme` | `?theme=obsidian` | 使用 Obsidian 风格深色工作区 |

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

前端默认使用中性的低饱和语义地图界面。案例可以通过 `garden.metadata.presentation` 提供标题、简介、来源和受支持的 theme id；寒柳别苑的庭院背景和品牌文案来自 `examples/zylatent/config.json`，不是通用前端的固定产品文案。地图网格与连线是辅助阅读层，不应抢过节点；分类和标签索引承担解释颜色和筛选的职责；独立标签层确保悬停标题不会被其他节点遮挡。

桌面端以单个视口为排版边界，不需要上下滚动；移动端会压缩标题和主题索引，在同一个视口内保留主要交互。

## 部署

- 静态托管：发布整个 `frontend/` 目录；
- GitHub Pages：仓库的 `.github/workflows/pages.yml` 会自动发布；
- API：使用 `?data=/api/garden` 从同源 API 读取数据；
- iframe：使用 `embed=1` 隐藏独立页面的品牌头部和页脚。

完整部署说明见 [`../docs/deployment.md`](../docs/deployment.md)。
