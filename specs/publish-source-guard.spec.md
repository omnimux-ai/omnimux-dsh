# 发布来源守卫（publish source guard）

## 问题

`omnimux@0.1.4`、`omnimux-inspiration@0.1.1` 等包是在**脏工作树**里改完版本号直接发的：npm 记录了 `gitHead`，但该提交里 `package.json` 的 version 仍是旧值。结果是

- 任何提交都重建不出发出去的 tarball；
- 看源码的人无法判断线上跑的是哪一版；
- 逐字节比对确认代码主体一致，差异只在 `package.json` 一个文件——所以这不是代码不可复现，而是**发布产物不可复现**。

## 方案

`scripts/verify-publish-source.mjs` 回答一个问题：现在 `npm pack` 出来的字节，是否有某个提交能复现？

三条判据：

1. 包目录下没有未提交改动（暂存未提交也算），否则发出去的字节只存在于本机；
2. 该包 `package.json` 的 version 必须与 HEAD 中一致；
3. HEAD 里必须存在该 `package.json`。

命中任一即非零退出。它以 `prepublishOnly` 挂在所有可发布包的发布路径上，因此不依赖人的记忆。

## 验收

- `node --test scripts/verify-publish-source.test.mjs` 覆盖：干净通过、版本未提交被拒、未跟踪文件被拒、已暂存未提交被拒、读写版本号独立。
- 在真实仓上验证：干净树通过；临时改 `plugins/omnimux` 版本号后拒绝并同时报出「版本未提交」与「存在未提交改动」。
- CI 在 `Static L0 QA & Tests` 中运行该测试。

## 已知边界

- 只判断「是否存在可复现的提交」，不判断该提交是否打到 tag、也不校验 npm 上的 `latest` 指向——后者由发版人决定，且桌面端构建读锁文件，不受影响。
- 私有包（`private: true`）不挂此钩子。
- 已存在的 `prepublishOnly` 不覆盖，避免踩掉包自己的发布前步骤。
