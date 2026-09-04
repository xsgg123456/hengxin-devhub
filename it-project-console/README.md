# IT 项目管理台

本目录承载产品代码，与仓库根目录的需求、设计、计划和 Harness 共用同一个 Git 根。

## 本地开发

```powershell
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

前端原型模式使用浏览器本地数据，提供四个固定演示账号、刷新持久化和一键重置。生产构建不会包含演示身份或 Mock 数据回退。

## 验证

```powershell
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
```
