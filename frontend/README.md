# Latent Garden Frontend

这是一个由 Vite 构建、以 `3d-force-graph` 和 Three.js 渲染的语义花园前端。它只消费 `garden.json`，可以独立部署，也可以通过 iframe 嵌入博客。

## 交互

- 默认使用真正的三维 UMAP 坐标；拖动旋转，滚轮缩放。
- 节点使用保持清晰的文章卡片，直接展示分类与标题；点击或键盘聚焦卡片可打开详情。
- 2D 模式复用同一个 WebGL 场景，将节点切换到独立的二维 UMAP 坐标并使用俯视相机。
- 节点位置固定，不运行会改变语义坐标的力导向布局。
- 分类负责默认颜色，分类、标签、内容类型和搜索条件可以组合筛选。
- 点击节点打开文章详情、封面、标签、原文链接和 embedding 近邻。
- 缺少 `x3/y3/z3` 的旧数据自动进入 2D；WebGL 不可用时自动显示文章列表。
- 初次加载会短暂缓慢环绕，首次交互后停止；系统要求减少动态效果时不会启动。

## 本地运行

在仓库根目录运行：

```bash
npm install
npm run dev
```

生产构建：

```bash
npm test
npm run build
npm run test:e2e
```

静态产物位于 `dist/`。运行时数据和图片位于 `frontend/public/`，构建时会原样复制到产物根目录。

## 数据契约

新版节点同时提供二维和三维投影：

```json
{
  "id": "unique-id",
  "title": "A document",
  "categories": ["做东西"],
  "tags": ["topic"],
  "x": 0.12,
  "y": -0.34,
  "x3": 0.18,
  "y3": -0.27,
  "z3": 0.41
}
```

顶层 `edges` 来自原始 embedding 的余弦相似度：

```json
{
  "source": "article-a",
  "target": "article-b",
  "similarity": 0.83
}
```

旧数据没有 `edges` 时，前端会根据二维投影生成兼容近邻；不会伪造三维深度。

## URL 参数

| 参数 | 示例 | 作用 |
| --- | --- | --- |
| `data` | `?data=/api/garden` | 加载其他允许 CORS 的数据文件 |
| `embed` | `?embed=1` | 使用紧凑 iframe 布局 |
| `theme` | `?theme=obsidian` | 保留主题兼容参数 |
| `view` | `?view=engineering` | 加载工程视图 |

```html
<iframe
  src="https://latent-garden.zylatent.com/?embed=1"
  title="Latent Garden semantic map"
  style="width:100%;height:720px;border:0"
  loading="lazy">
</iframe>
```
