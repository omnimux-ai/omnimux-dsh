# Issue #778 — T02 QA 三根因 BugFix

## 状态与边界

**IS_PASS: YES，仅本BugFix的三根因修复与下述66项验证范围。不是独立QA签收，不代表#778整体通过。** 固定 base/HEAD `580234923268673562cacb5cd01aebdb780339e1`，目标为任务树现有未提交增量。

仅修改 `scripts/managed-tarball-archive.py`、`scripts/materialize-graph.mjs`、`scripts/materialize-cache.mjs`、原工程测试必要新增断言与本报告。独立 QA 测试和报告只读；协调器、transaction/recovery、package/CI/backup 不修改。不运行 capture、真实 Dev/Prod/官方操作、workspace install、commit/push/merge 或委派。

已完整读取独立 QA 报告65行、followup规格243行、T02报告64行、T03报告108行、T01报告92行；API保持 Python actions及退出码、五字符串identity、GraphInspector同步capture、异步prepareCandidateDependencies与注入runner合同。

## 三根因修复

- ARC01：创建目录时记录dev/inode；重开目录核绑定，成员输出FD保存五字段identity。chmod后从根FD递归核对完整清单、每个目录和叶子身份/类型/模式，持有遍历祖先FD并no-follow，核查前后名称绑定和目录集合。子目录detach/空目录替换、同名叶子unlink替换、新增未知成员均拒绝；不为全部成员长期持有FD，FD数量按深度有界。
- ARC05：沿用标准tarfile解析器；在TarInfo的header入口严格拒绝空/截断header，首个零结束块后必须再读到完整512零字节结束块；仍逐块drain验证gzip CRC/EOF和非零尾部。没有新增tar parser或依赖。
- CACHE02/06：在prepareCandidateDependencies内、private env与任何runner调用之前，递归检查允许解析设置overrides/peerDependencyRules的嵌套对象/数组/值及protocol keys；拒file/link/git/URL与路径来源，保留semver范围、scoped peer规则和引用。candidateConfig返回形态不变，错误仍异步code5。现有证据仅为配置预检缺口，不代表payload外读或未知网络访问。

新增工程测试共6项：tar结束块0/511/512/1023/1024字节边界一项；目录/叶子/清单竞态三项；42组合来源拒绝（含$引用到file来源）一项；11种合法值预检和scoped/循环/缺失引用断言及真实公开is-number@7.0.0 semver override冻结安装/完整图比较一项。原44项及独立16项断言全部保留。

## 实际验证

修复前重现（2026-09-08 18:00 CST）：`node --test --test-reporter=tap scripts/managed-tarball-t02.qa.test.mjs`，16项/11过/5失败/0skip，3469.605ms，exit1。失败精确对应ARC01、ARC05、CACHE02-local/remote、CACHE06；真实override补证installCalls=1、lockExit=0，未批准字符串进入锁，替代版本未出现，live不变。日志 `.workbuddy/managed-778-t01/qa-fixes-before.log`。

首次修复后原独立QA重跑：16/16、0失败/0skip，2950.39425ms，exit0，日志 `.workbuddy/managed-778-t01/qa-fixes-after.log`；独立测试与报告未改。后续仍运行原44兼容与新增精确断言。测试使用 `.workbuddy/managed-778-t01/env.sh` 私有环境；不运行触发真实backup的完整transaction。

最终同源码状态（2026-09-08 18:10–18:11 CST）：

```sh
source .workbuddy/managed-778-t01/env.sh
node --test --test-reporter=tap scripts/managed-tarball.test.mjs scripts/materialize-cache.test.mjs scripts/managed-tarball-t02.qa.test.mjs
```

**66/66，0失败/0skip/0cancelled，32322.31175ms，exit0**：原44兼容＋新增6工程测试＋未改独立16。日志 `.workbuddy/managed-778-t01/qa-fixes-final-3.log`。四个Node源码/测试syntax、Python AST和`git diff --check`均exit0；独立QA CACHE06最终installCalls=0、lockExit=null、未批准来源和替代版本均未进入锁。测试仅受控公开is-number私有获取和任务fixture，不操作真实profile/共享store。

第二次合并测试先达到66/66（29880.354ms）；一致性复核补上$override引用到file来源的预检后，以上最终第三次66/66才是最终源状态证据，不拼旧轮结果。

## 新增精确回归发现

首次合并测试66项中65过/1失败（41415.39375ms，exit1）；原44和独立16均通过，唯一失败为新增合法semver真实安装：pnpm把direct override范围写为lock importer specifier，旧预检逐字比较manifest范围误拒。定向修正仅认可workspace与beforeLock中相同的直接override及锁specifier；完整manifest/lock/graph比较仍保留。没有改断言绕过失败。

## 全局一致性复核与文件身份

全局核对Python inspect/freeze/extract调用与退出码、GraphInspector接口及prepareCandidateDependencies注入runner、异步错误code5，未改T03消费合同。新增配置来源纯函数由cache预检调用；$引用递归解析manifest来源，不能借授权目标file路径绕过override来源拒绝。原图和lock最终比较仍是发布前必需步骤。

| scripts/ 文件 | SHA256 |
| --- | --- |
| managed-tarball-archive.py | `50f70b21523024be85c7d44c97228949c1d0bdadf3a71fcb873b17567531a5cf` |
| materialize-graph.mjs | `35b46fa7e25b39f819abc8c90de54afe5cffbcd440e34802d490cd8464156f86` |
| materialize-cache.mjs | `d434eb76c5274260479750d80079c859ef615448f9a825935c9d2c8d22707e33` |
| managed-tarball.test.mjs | `00218682b34f6d78b2c007a760a45c8b8ed73ff95187b618b59f4695119b324a` |
| materialize-cache.test.mjs | `7236a7d9bd7e9bd147dc8c66e5d2ecb2d689bc1a911cf37dc676a2f66713ea31` |

独立QA测试SHA仍为`f2a3be3a05952957d9aa7e66a32c42ea859d9cb22fe4d2d373e268b47fc97364`；T03协调器`05937f2f7948483ab7bda476659a14868fd1186bafee8838132d2dd66794d572`、transaction`a8b5be5e5985785083e1e64c891685e4399791a510456a510da0e23ff8a727d9`、recovery`ea0a9f87b22093d2fe9c1fd50ac27e9d5b67f602e51d90944459be1ba8c5a492`均与其交还报告一致。独立QA报告没有写入，SHA为`b46ebf5289a90f7bfde02fdf0ef23d0ed19783e456164183b8eb1e146a1f5f8a`。

## 交接与证据限制

只对本BugFix判定；#778整体、完整事务、backup登记、gates/Host/L2仍由主理人和最终集成owner负责。没有跑全transaction、全gates或Host，避免真实backup capture及越过指定范围；这些仍待最终集成，不标N/A/PASS。没有Linux实测；macOS arm64/Node25.8/Python3.14/pnpm11.7事实不能外推所有平台或任意同用户恶意写者。

未commit/push/merge、未重启App、未委派/成员直连，全部测试夹具在任务私有TMP并由原after清理。全部三个后台测试job已完成并收集；本包五源码/测试文件及报告写权现交还主理人，不自行进入下一阶段。
