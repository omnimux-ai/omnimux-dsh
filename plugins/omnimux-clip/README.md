# omnimux-clip

OmniMux Clip / 视频剪辑。P1 主座是 `dsh-better-sidebar` Tab（`omnimux-clip:studio`），完整套用官方 OpenReel GUI + WebCodecs 管线（`src/client/openreel/`）。与画布只交换 JSON（Phase 3：`omnimux-clip-*` CustomEvent + Host HTTP `/omnimux-clip/api`）。左侧「新会话」下方入口现网不挂载（隐藏）；画布/Agent 仍可打开 Studio Tab。

Agent 面：`clip_get` / `clip_edit` / `clip_view` / `clip_snapshot` / `clip_diagnostics` / `clip_export`。判断层见插件内 `skills/clip-craft/SKILL.md`。失败抛 `ClipDomainError`，禁止 `{ ok: false }` 当成功值。

## 身份

| 项 | 值 |
|---|---|
| id | `omnimux-clip` |
| tier | `tier-1-app` |
| storage | `$DSH_HOME/omnimux/clip/{projects,exports,snapshots,tmp}/` |
| HTTP | `/omnimux-clip/api` |

## 本地验证

```sh
npm install
node scripts/build-client.mjs
node --test src/*.test.js
```

合入前在隔离 worktree 完成相关自动化/静态检查与独立评审，通过 required CI/MQ；没有合入前独立 App/Host 环境。合入后才从 `main` 经正式同步入口物化 Dev，在 45120 用 ego-browser 与共享 `verify:live` 验收；按需追加 Electron 证据，不默认强杀 App。详见[插件 QA](../../docs/contracts/plugin-qa.md)与[开发环境合同](../../docs/contracts/dev-pipeline.md)。
