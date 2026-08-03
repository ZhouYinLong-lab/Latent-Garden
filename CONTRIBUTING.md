# Contributing to Latent Garden

感谢你愿意参与 Latent Garden。欢迎贡献新的内容适配器、EmbeddingProvider、降维/聚类实现、前端交互、测试和文档。

## 开始之前

请先搜索现有的 [Issues](https://github.com/ZhouYinLong-lab/Latent-Garden/issues) 和 Pull Requests，避免重复工作。较大的功能建议先开 issue 讨论边界和输出契约。

## 本地开发

项目要求 Python 3.10+。推荐使用虚拟环境：

```bash
python -m venv .venv
source .venv/bin/activate       # Windows PowerShell: .\.venv\Scripts\Activate.ps1
pip install -e ".[analysis,test]"
```

前端不需要构建工具，可以直接运行：

```bash
python -m http.server 8000 --directory frontend
```

## 提交前检查

请在提交 Pull Request 前运行：

```bash
python -m unittest discover -v
python -m compileall -q api core pipeline providers adapters tests
node --check frontend/app.js
git diff --check
```

如果修改了生成流程，请同时检查 `examples/zylatent-garden.json` 和 `frontend/garden.json` 的输出契约。不要提交 API key、`.env` 或本地 `.latent-garden/` 缓存。

## 代码约定

- 保持 adapter、provider、reducer 和 clusterer 之间的边界；新增数据源优先实现 adapter。
- 新增 provider 时实现 `name`、`dimensions`、`cache_key` 和 `embed()`，并确保缓存 key 能区分模型和向量维度。
- 面向前端的字段变更需要同步更新测试和文档。
- 生产输出不得包含文章正文、密钥或不必要的个人信息。
- 优先使用标准库和已有依赖；新增依赖请说明必要性，并放入合适的 optional extra。

## 分支、提交与 Pull Request

1. 从 `main` 创建短生命周期分支，例如 `feature/rss-adapter` 或 `fix/cache-key`。
2. 每个 Pull Request 聚焦一个主题，并为行为变化补充测试。
3. 使用清晰的祈使句提交信息，例如 `Add RSS adapter`、`Fix cache key dimensions`。
4. Pull Request 描述中说明问题、方案、验证命令，以及是否更新了示例输出。
5. 等待 CI 通过并处理 review 意见；生成数据变更应说明来源和生成参数。

## 内容与数据来源

`examples/zylatent-garden.json` 是来自 zylatent.com 公开页面的示例快照。提交其他真实数据前，请确认拥有使用和再分发相关内容的权限，并优先提交脱敏的最小样例。

## 行为准则

参与项目即表示你同意遵守 [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)。
