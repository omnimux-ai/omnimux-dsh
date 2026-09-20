# 修复 pnpm-lock.yaml 缺失 plugins/omnimux-device 登记

## 背景
主干提交的 `pnpm-lock.yaml` 缺少 `plugins/omnimux-device` importer 登记（该插件经 PR #2428 进入 workspace 后锁文件未同步更新），导致任何全新环境执行 `pnpm install`（CI 默认 frozen-lockfile）直接失败：
`specifiers in the lockfile don't match specifiers in package.json: cordis@^3.18.1, dsh-ui-kit@file:../../../../personal/dsh-ui-kit`。

## 验收标准
- 锁文件补齐 `plugins/omnimux-device` importer 及其独有包条目，diff 纯新增、不扰动既有锁定版本。
- `dsh-ui-kit` file: 解析路径与既有 importers 一致（`file:../../personal/dsh-ui-kit`）。
- 在与主仓相对层级完全相同的全新目录中执行 `pnpm install --frozen-lockfile` 成功。

## 验证证据
- 临时副本 `/Users/x/Desktop/Project/dsh-plugin/product/.tmp-verify-lockfile`（已自清理）冻结安装 10.4s 成功，全部 prepare 脚本通过。
