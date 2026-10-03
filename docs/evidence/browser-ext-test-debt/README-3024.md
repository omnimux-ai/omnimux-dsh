# #3024 CI 接入说明

`corepack pnpm --filter dsh-browser-extension test` 在 Node 24 下可复现运行。
前三票（#3021/#3022/#3023）未合入前该命令有 10 项失败（见
red-3024-ci-command-pre-merge.txt），全部属 #3022/#3023 范围；待两票落地、
本分支 rebase 后应为 0 失败。
