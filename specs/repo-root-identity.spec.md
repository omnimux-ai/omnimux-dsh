# 仓库身份不接受伪造的嵌套 .git

## 背景

`scripts/guard-anti-cheat.mjs` 的 `repoRootOf(path)` 决定两件事：目标文件的仓库相对路径，以及去哪读任务 spec 的 `## 旧标准变更` 声明。原实现只是**向上找第一个含 `.git` 的目录**：

```js
if (existsSync(resolve(root, '.git'))) return root;
```

于是一个伪造的嵌套 `.git`（空目录或另建的真仓库）会把「仓库根」变成攻击者控制的目录，声明来源随之变成该目录下的 `specs/`——绕开「既有标准的削弱必须在本任务 spec 里逐条声明」。

**这不是已复现的绕过。** 我三次尝试都没走到声明判定：仓外目标被 `createSourceInspection` 的规范化检查直接拒（`Cannot inspect canonical test target or source`），仓内探针每次都撞上仓库自身的主目录写保护。即使可达，后果也只是「hook 放行、CI 拒绝」——合入闸门仍在 CI 侧（`verify-test-standard-declarations.mjs` 用真仓库根）。所以这是**纵深防御加固**，不是补一个已知被利用的洞。

## 用户操作旅程

1. 开发者在工作树里正常改测试 → 期望：仓库根解析到该工作树，声明通道照常工作。
2. 有人在工作树内造一个空的 `.git` 目录，再在它下面写一份「本任务 spec」 → 期望：这个目录**不被**当成仓库根，声明不生效，削弱被拒。
3. 有人在同样位置 `git init` 一个真仓库 → 期望：同样不被当成仓库根。
4. 主检出 / 工作树里的普通文件 → 期望：行为与改动前完全一致。

## 变更点

`scripts/guard-anti-cheat.mjs`：

- 新增 `gitIdentity(root)`：用 `git -C <root> rev-parse --show-toplevel` 与 `--git-common-dir` 取该根的 git 身份；不是仓库或取不到时返回 `null`。
- `repoRootOf` 对每个候选要求**两条同时成立**：git 自己报的 `show-toplevel` 解析后等于该候选，且它的公共目录与门禁自己的一致。
  - 只比公共目录不够：一个空的 `.git` 目录会让 git 直接向上找到真仓库，`--git-common-dir` 因此与门禁相同，伪造根会被误认。
  - 只比 `show-toplevel` 也不够：另建的真仓库 `show-toplevel` 就是它自己。
- 不匹配就继续向上找；取不到门禁自己的身份时一律不认（fail closed），由调用方回落到 `REPO_ROOT`。
- 导出 `repoRootOf` 供测试直接固定这个行为。

## 假设

- 假设 1：真实工作树与主检出的 `show-toplevel` 就是候选目录本身，且公共目录指向同一个 `.git`。依据：实测工作树内文件解析到工作树根、主检出内文件解析到主检出根；这是 git 的定义行为。
- 假设 2：`show-toplevel` 与 `realpathSync(root)` 可比。依据：两者都返回解析过符号链接的绝对路径（实测在 `/tmp` 这种符号链接路径上也一致）。
- 假设 3：加固不改变正常路径的行为。依据：正常候选两条都成立，`repoRootOf` 的返回值与改动前相同；「找不到根」的回落（`REPO_ROOT`）不变。
- 假设 4：git 不可用时 fail closed 是安全的。依据：`handle()` 在声明判定之前就会调用 `createSourceInspection`，git 不可用时它已经抛错并拒绝；此时 `repoRootOf` 返回 null 只会让声明搜索回落到 `REPO_ROOT`（更严，不会更松）。

## 证伪方式

- 若伪造的空 `.git` 目录仍被 `repoRootOf` 返回，加固未生效。
- 若嵌套的真仓库被当成仓库根，第二条检查未生效。
- 若正常文件（工作树内 / 主检出内）的解析结果与改动前不同，则加固溢出。
- 若伪造声明在 `handle()` 上仍能放行削弱，端到端未堵住。
- 若 `repoRootOf` 返回的根不再是「包含该路径的仓库/工作树根」，则它破坏了调用方（`repoRelativePath` 与声明搜索）的前提。

## 实测结果

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| 门禁自身测试 | `node --test scripts/guard-anti-cheat.test.mjs` | **38/38 通过**（35 → 38，新增 3 条） |
| 门禁套件 | `pnpm test:gates` | 473 / 461 通过；**12 条失败与改动前逐条同名**（既有环境/内容问题） |

逐条实测：

| 场景 | 改动前 | 改动后 |
| --- | --- | --- |
| 工作树内的普通文件 | 工作树根 | 工作树根（不变） |
| 伪造的空 `.git` 目录 | **被当成仓库根** | 跳过，解析到真工作树根 |
| 嵌套的真仓库（`git init`） | **被当成仓库根** | 跳过，解析到真工作树根 |
| 伪造根 `specs/` 里的声明 + 削弱既有断言 | **allow** | **deny** |

## 新产品基线

无影响：只改门禁脚本，不涉及产品默认值、模型、路径或本地状态。

## 文档影响

`docs/contracts/anti-agent-fake-completion-guard.md` §3.1 描述的是声明通道的**语义**（必须在本任务 spec 里逐条点名、按已提交范围复核）。本次加固的是「哪个目录算本任务仓库根」这个前提，语义没变，因此那句话不需要改。
