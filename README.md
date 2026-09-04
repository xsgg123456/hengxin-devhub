# Hengxin Dev Harness

一套面向 Codex 的产品研发 Harness：从需求访谈、设计规范、开发计划，到编码、审查、修复和发布，用 `AGENTS.md`、Skills、自定义 Agents 与 Hooks 串成可验证闭环。

## 一次性初始化

环境要求：Git、Python 3.11 或更高版本、当前版 Codex。

在本目录执行：

```powershell
python -X utf8 scripts/bootstrap_harness.py
```

脚本会验证 Harness 文件、Skill 与 Agent 配置，初始化根 Git 仓库，拒绝任何产品子目录中的嵌套 `.git`，配置 `.githooks`，创建被 Git 忽略的本地进化状态，并运行自动化测试。

随后在 Codex 中输入 `/hooks`，审阅并信任本仓库 Hooks。Hooks 内容改变后应重新审阅。始终把本目录设为 Codex 项目主目录。

## 新项目目录规则

```text
harness-root/                 唯一 Git 根、Codex 项目主目录
├── AGENTS.md
├── Product-Spec.md
├── Design-Brief.md           可选
├── DEV-PLAN.md
├── your-product/             产品代码，不允许在这里 git init
├── .agents/
├── .codex/
├── .githooks/
└── tests/
```

产品代码可以放在命名子目录，但 Harness 与产品必须共用根 Git。不要从产品子目录另开独立 Codex 项目，否则根级 Skills、Hooks 和自定义 Agents 会脱离加载范围。

## 开始研发

初始化通过后，直接在 Codex 中描述产品想法。Harness 会按以下产物推进：

```text
产品想法 → Product-Spec.md → Design-Brief.md（可选）→ DEV-PLAN.md
        → 产品代码 → code-reviewer → 修复闭环 → 构建或发布
```

设计稿制作依赖 Pencil 或 Figma 等设计工具连接；没有连接时可跳过，按 Design Brief 或既有 UI 先例开发。

## 提交前检查

`.codex/project-checks.json` 保存当前技术栈的快速确定性检查。`dev-builder` 在搭建产品骨架时必须按 `DEV-PLAN.md` 更新它。命令使用 argv 数组，不经过 shell：

```json
{
  "preCommitChecks": [
    {
      "name": "单元测试",
      "cwd": "your-product",
      "argv": ["npm", "test"],
      "timeoutSeconds": 300
    }
  ]
}
```

Python 项目可用 `{python}` 代表当前运行 Harness 的 Python 解释器。Windows 会通过 `PATH/PATHEXT` 把 `npm` 等命令安全解析到 `.cmd` 或 `.exe`，仍不启用 shell。

代码审查通过后执行：

```powershell
python -X utf8 .codex/hooks/harness_runtime.py mark-reviewed
```

它记录当前 Git 变更指纹。此后任何源码、依赖或配置变化都会使旧 review 失效；`commit-msg` Hook 会在 Git 真正落提交前再次校验指纹并执行项目检查，不能靠命令包装绕过。Stop Hook 最多自动续跑一次，不会无限占住线程。

## 安全边界

- Hooks 不会自动 push、创建远程仓库、部署或发布；这些外部写入必须由用户明确要求。
- Harness 不会按固定端口强杀进程。遇到端口冲突时先核对 PID、命令行和工作目录。
- 纠正信号写入本地 `.codex/evolution/runtime/signals.jsonl` 前会去除常见密钥；`runtime/` 整目录被 Git 忽略。
- `commit-msg` 要求提交标题包含汉字；允许 `feat:`、`fix:` 等 Conventional Commits 前缀。

## 自检

```powershell
python -X utf8 -m unittest discover -s tests -v
codex doctor --summary --ascii --no-color
```

`codex doctor` 的操作系统、网络或终端告警不一定是 Harness 缺陷，但正式研发前应读清每条告警。
