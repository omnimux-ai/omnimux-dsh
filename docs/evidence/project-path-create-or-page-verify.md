# 隔离浏览器预演 · Issue #2519

日期：2026-09-22
工作树：`.worktrees/workflow-path-create-or-page`
规格：`specs/project-path-create-or-page.spec.md`

## 场景

换到已有项目的文件夹后点「创建项目」：第一次只问，不另开项目；第二次才加创作页。

## 步骤

1. 打开隔离预演页 `docs/evidence/project-path-create-or-page-preview.html`
2. 弹窗已填名称「视频代做」、源文件夹「视频代做」
3. 点「创建项目」
4. 再点一次「创建项目」

## 实测

| 项 | 结果 |
| --- | --- |
| 弹窗可见 | 宽 440、高 322 |
| 第一次确认 | 红字「当前工作区已有项目，要在该项目新建创作页吗？」 |
| 第二次确认 | 绿字「已在当前项目新建创作页。」 |
| 英文拒绝码 | 未出现 |

## 截图

- `docs/evidence/project-path-create-or-page-dialog.png` 初始弹窗
- `docs/evidence/project-path-create-or-page-ask.png` 第一次询问
- `docs/evidence/project-path-create-or-page-added.png` 第二次加页
