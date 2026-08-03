# Release Guide

这份文档面向 Latent Garden 维护者。日常功能合并到 `main` 即可；只有需要给使用者标记稳定版本时才创建 release。

## 发布前

1. 确认工作区干净，并从最新的 `main` 开始。
2. 更新 `CHANGELOG.md`，把本次变化从 `Unreleased` 移到新版本。
3. 更新 `pyproject.toml` 中的 `version`。
4. 重新生成需要提交的示例地图，并确认没有正文、密钥或本地缓存进入 git。
5. 运行贡献指南中的全部检查：

   ```bash
   python -m unittest discover -v
   python -m compileall -q api core pipeline providers adapters tests
   node --check frontend/app.js
   git diff --check
   ```

## 创建版本

使用语义化版本号，例如 `v0.2.0`：

```bash
git tag -a v0.2.0 -m "Release v0.2.0"
git push origin v0.2.0
```

随后在 GitHub 创建对应 Release，粘贴 changelog 中的版本内容，并标记是否包含不兼容变更。

## 版本原则

- `MAJOR`：破坏公开 API、`garden.json` 契约或 provider 接口；
- `MINOR`：向后兼容的新适配器、provider、API 或前端能力；
- `PATCH`：向后兼容的修复、文档和依赖更新。

定时刷新 workflow 产生的博客数据更新不需要单独发布版本。
