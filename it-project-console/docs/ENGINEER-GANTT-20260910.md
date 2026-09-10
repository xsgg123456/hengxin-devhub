# 工程师页面与甘特图布局验收

用户确认真实生产DOM快照预览后，在原组件实施。未部署生产环境。

- `web/src/views/project-overview/index.vue`：仅工程师 `mine` 范围隐藏两个图表；筛选、指标、原项目卡片、详情及更新入口保留。其他角色和全部项目范围保留图表。
- `web/src/components/project/monthly-gantt.vue`：左列230px、表头42px；日期区域填满剩余宽度，单日最小36px。高度为 `max(400px, 100dvh - 370px)`，内部双向滚动、sticky表头及左列。计划条、进度条、原交付标记与今日线按实际月份天数同比例定位。局部滚动条覆盖原全局隐藏横向滚动条的样式。

本轮验证：

| 检查 | 结果 |
| --- | --- |
| `pnpm test`（web） | 26文件、148项通过 |
| 原有浏览器全套 | 34项通过 |
| `pnpm exec playwright test e2e/engineer-gantt-layout.spec.ts --workers=2` | 新增6项通过，14.4s |
| `pnpm build`（web） | vue-tsc与Vite成功，3363模块，21.82s，exit 0 |
| 独立两阶段复核 | Stage 1、Stage 2均通过，未发现HIGH/MEDIUM问题 |

新增浏览器测试覆盖角色/范围切换、宽屏铺满、窄屏不溢出、双向实际滚动及表头/左列不动，以及2027-02、2028-02、2026-09、2026-10四种月份的实际条带/标记像素几何。测试使用独立浏览器原型数据，未写入生产。

首轮新增测试因Element Plus原生radio被可见标签覆盖、原有项目数量不足以产生纵向溢出而失败；修正为点击可见标签、准备足够多合法项目后通过。独立审查要求补测28/29天及完整标记几何，已补充并通过。

实现截图：`output/playwright/engineer-projects-implemented.png`、`gantt-implemented.png`（本地测试数据）。确认基线为 `output/playwright/exact-preview/projects-preview.png`、`gantt-preview.png`（真实页面快照）。

工作区仍有先前独立改动，本轮不将整份工作区标为已审查，不合并提交历史改动。
