# spec: worktree pnpm install 被 omnimux-browser prepare 的 dsh-llm rc.2/rc.3 品牌冲突打断

Issue: #2905

## 背景与根因
- `omnimux-browser` 的 13 个 `@deepseek-ai/dsh-*` peer 声明 `^0.1.5-rc.2`；0.x 预发布号的 `^` 允许同 minor 更新预发布。
- 上游发布 `0.1.5-rc.3` 后，PR #2781 生成的锁文件把 `dsh-agent@rc.2` 的 peer 上下文混解：`dsh-session`/`dsh-system-prompt`/`dsh-typert-protocol`/`dsh-util-values` → rc.3，`dsh-llm`/`dsh-invariants` → rc.2。
- `browser-context.ts` 混用两族品牌类型（`MessageId`/`UserMessage` 为 `unique symbol` 名义类型）→ TS2345，`prepare` 钩子使 `pnpm install` 在干净环境必然失败。
- `omnimux-intercept` 的 `dsh-base ^0.1.5-rc.2` 已解析到 rc.3，是锁文件内 rc.3 族入口。

## 修复内容
1. `omnimux-browser` 全部 `^0.1.5-rc.2` peer 提为 `^0.1.5-rc.3`；`omnimux-intercept` 同步提升。
2. 重新生成 `pnpm-lock.yaml`（`pnpm install --lockfile-only`），0.1.5 族收敛到 rc.3 单版本。
3. `plugins/omnimux-viewer` devDeps 残留的 `dsh-attachment`/`dsh-client-ui-slots` `0.1.5-rc.2` 精确钉位提升到 `0.1.5-rc.3`（其 peer 范围本就不覆盖 0.1.5 线，属历史遗留钉位）。
4. `pnpm-workspace.yaml` 的 `allowBuilds` 四个非法占位值（`set this to true or false`，PR #2781 遗留，导致 `ERR_PNPM_IGNORED_BUILDS` 退出码 1）替换为裁决结果：`dsh-subprocess-local`/koffi → true（spawn-helper 可执行位恢复 / FFI 原生预编译下载），`@google/genai`（preinstall 为 no-op）/protobufjs（postinstall 仅版本告警）→ false。
5. 新增确定性门禁 `scripts/verify-dsh-lockfile-uniform.mjs` + `scripts/verify-dsh-lockfile-uniform.test.mjs`：锁文件 `packages:`/`snapshots:` 中同一 `@deepseek-ai/dsh-*` 包出现多个 `0.1.5-rc.*` 版本即失败；挂入 `verify:dsh-lockfile` 脚本、`verify:gates` 聚合、`test:gates` 单测清单与 CI quality-gate regression 步骤。

## 验收标准
- 在工作树内 `corepack pnpm install`（含全部 prepare 钩子与 allowBuilds 裁决）退出码 0，omnimux-browser `tsc -b` 无 TS2345，无 `ERR_PNPM_IGNORED_BUILDS`。
- `pnpm-lock.yaml` 中 `dsh-*@0.1.5` 族只剩 rc.3（dsh-scope 0.1.0-rc.8 等非 0.1.5 族不受影响）。
- 新门禁在混版本锁文件上报红、在收敛锁文件上报绿（单测覆盖）。
- 不触碰其他插件；不升 0.1.7（属 harness-pin/RC 升级流程，另单处理）。
