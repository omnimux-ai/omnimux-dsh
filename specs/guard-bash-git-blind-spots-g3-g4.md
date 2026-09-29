# Spec · 收紧 bash 写动词与 git 子命令盲区（G3/G4）

## 用户操作旅程
1. Agent 在主 checkout 尝试用 `node -e` / `python3 -c` / `dd of=` / `ln -s` / `awk >` 写入 `plugins/` 等受保护路径。
2. PreToolUse `guard-worktree` 拦截该 bash 命令，返回 deny（结论文案，不含绕行配方）。
3. Agent 在主 checkout 尝试 `git apply` / `git am` / `git stash pop` / `git checkout -- <path>` / `git push --force` 等变异子命令。
4. 同上拦截；在已注册 worktree 内同等命令放行。
5. 合法只读/同步类 git（status/log/diff/fetch/pull/checkout 分支切换/stash 列表）在主 checkout 仍放行。

## 期望界面反馈
无 UI。拦截通过 PreToolUse `permissionDecision=deny` 与精简 reason 文案表达。

## 验收用例
- [ ] `node -e "...writeFileSync('plugins/...')"` 在主 checkout → deny
- [ ] `python3 -c "open('plugins/...','w')..."` → deny
- [ ] `dd ... of=plugins/...` / `ln -s ... plugins/...` / `awk ... > plugins/...` → deny
- [ ] `node -e "console.log(1)"` / `python3 -c "print(1)"` → allow
- [ ] `git apply` / `stash pop` / `checkout -- path` / `push --force` / `cherry-pick` / `rebase` 在主 checkout → deny
- [ ] 同上变异命令在 registered worktree → allow
- [ ] `git status` / `log` / `diff` / `fetch` / `stash list` / 分支 `checkout` → allow
- [ ] 既有 cp/mv/tee/sed -i/重定向回归仍 deny；`node scripts/guard-worktree.test.mjs` 全绿

## 成功标准
主 checkout 上通过解释器一句话写盘与危险 git 子命令无法再绕过写保护；合法同步与 worktree 内开发不被误伤。
