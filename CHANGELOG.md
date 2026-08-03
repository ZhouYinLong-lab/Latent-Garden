# Changelog

本文件记录面向使用者的主要变化。格式参考 [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)，版本遵循语义化版本号。

## [Unreleased]

### Added

- 为交互地图和 README 预览增加最近邻连线；
- 为 zylatent.com 示例增加五类编辑策展主题和自动刷新后处理；
- 增加寒柳别苑背景视觉与站点图标。

### Changed

- 桌面和移动布局压缩到单个视口，不再需要上下滚动；
- 悬停节点会提升到 SVG 顶层，点击节点会直接打开安全的原文 URL；
- 主题筛选不再同时显示所有节点标签，降低视觉拥挤。

### Planned

- 增加更多本地和托管 embedding provider；
- 增加前端 Playwright 回归测试；
- 根据实际部署反馈完善 API 限流和观测能力。

## [0.1.0] - 2026-08-03

### Added

- 独立的内容模型、adapter、embedding、缓存、UMAP、聚类和输出 pipeline；
- Markdown、MDX、JSON、RSS、Atom 与公开网站输入；
- 离线 hash provider、OpenAI provider 及可扩展 provider 接口；
- 零构建依赖的交互式语义地图；
- 可选 FastAPI 服务、Docker 配置和定期刷新 workflow；
- zylatent.com（寒柳别苑）真实博客案例，当前包含 41 个节点和 5 个主题分组；
- 基础测试、CI、贡献指南、行为准则和安全政策。

[Unreleased]: https://github.com/ZhouYinLong-lab/Latent-Garden/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/ZhouYinLong-lab/Latent-Garden/releases/tag/v0.1.0
