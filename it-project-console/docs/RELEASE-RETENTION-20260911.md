# 发布包清理与保留策略验收（2026-09-11）

用户授权清理历史部署包，并保留上一成功版。此次没有重新部署业务、切换代理或删除 Docker 镜像、数据卷、备份与运维脚本。

## 保留版本

- current：`20260911-b1c8e1a`。
- previous：`20260911-c1a4cb9`。
- pending：不存在。两版服务器目录已补 `.deployed` 标记，供后续发布识别成功历史版本。
- 服务器和本机均保留上述两版的完整发布包；服务器同时保留对应 incoming 压缩包。

## 清理清单与空间

服务器删除以下5版的 releases 目录及对应 incoming 压缩包：

```text
20260909-bd92912-uat
20260909-f9ec611-uat
20260910-go-live-v2
20260910-250b4bd
20260911-ee53742
```

本机删除上述5版，并删除另外5个历史构建目录：

```text
20260909-153525-cb91d601
20260909-154828-cb91d601
20260909-release-tools-v1
20260909-release-tools-v1-failed-metadata
20260910-go-live-v1
```

| 位置 | 清理前 | 清理后 | 释放 |
|---|---:|---:|---:|
| 本机 output/releases（文件字节合计） | 9,795,757,302 bytes | 1,972,236,010 bytes | 7.286 GiB |
| 服务器 releases + incoming（du -sk） | 6,677,632 KiB | 1,915,228 KiB | 4.542 GiB |

服务器 `incoming/upgrade-config-20260910.sh` 是运维脚本，不作为历史部署包删除。

## 当场验证

- 删除前先执行 `prune-releases.sh plan`，输出2个 KEEP、5个 REMOVE；应用相同清单输出5个 REMOVED。脚本持发布锁，删除前验证所有候选路径。
- 本机使用原生 PowerShell `Remove-LocalRelease`，逐个核对绝对目标位于 output/releases 的直接子目录，并拒绝祖先和子项重解析点。
- 本机两版压缩包 SHA256 与各自 `.sha256` 相符。
- 服务器两版 `sha256sum --check --strict SHA256SUMS` 均通过，incoming 压缩包与 `.archive-sha256` 均相符。
- 保留包的 SHA256SUMS 文件摘要清理前后相同：current `e344ae71a64670d5ecad42e4ffc279f2b09fd7ecba17e97ec3f2ae2eacaa2c6a`；previous `4105c3ffccf8e36352dd1901143747c68bac245f7746db59a065b0a75b0a68c2`。
- 内部18080和正式HTTPS代理 `/health/ready` 均返回 `{"data":{"status":"ready"}}`。
- `pnpm test:release`：9/9通过，含隔离清理、pending重试、并发锁、上传意图、PIN、路径/链接保护、本机删除与发布失败交互、真实Nginx/附件代理。
- `pnpm check`：前后端类型检查通过，前端168、后端66个单元测试通过，前后端构建通过。
- `pnpm --filter @it-project-console/api test:integration`：99/99通过，独立 schema 和 Bucket 已回收。
- 独立 code-reviewer：Stage 1 PASS、Stage 2 PASS；PowerShell入口解析通过。

## 后续执行

从下一次正常的 `pnpm release -Action Deploy` 起，成功后自动清理过期成功包，再同步删除本机同名目录。current、previous、pending、PIN与上传意图受保护。未发布/失败包与断线遗留本机包仍需核对后人工清理，避免删除下一次待发布版本。

此策略只减少发布产物，不能替代数据库备份。每日完整备份保留14个成功批次及 PIN 批次，部署前SQL备份不受影响；跨迁移回退继续由原部署门禁判断。
