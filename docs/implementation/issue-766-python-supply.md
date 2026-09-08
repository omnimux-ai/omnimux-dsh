# #766 私有 CPython 供应阶段

## 结论

**供应阶段 IS_PASS: YES（仅固定载荷取得、静态核验与本机窄 helper 隔离执行）；正式分发/完整接线 IS_PASS: NO。#766 未完成，不可据本文关闭。**

已供应 Astral python-build-standalone **CPython 3.13.15+20260807 install_only** 的 macOS arm64/x86_64 原包及解包树，未改上游二进制。两架构下载摘要一致；arm64 原生无 PATH Python 的供应测试 **5/5**。x86_64 实际执行成功但宿主 arm64，属于转译证据，不是 Intel 原生验收。正式签名、公证、最低 macOS 实机、最终包与业务接线仍未验收。

用户已明确批准插件私有 CPython 供应；本轮互斥源码写面仅插件 `runtime/**`、`scripts/` 新供应脚本/测试及本文。不改 `src/**`、package.json、dsh.manifest.json、README，不提交 Git、不发布、不操作真实 OPC/共享 Dev/Prod、不安装系统 Python、不修改全局 PATH、不借其他 App Python。

基线：任务树 HEAD `5485c25875cb9f71d7cb78a6aa69d07e07fffbab` 加已有并行工程未提交增量；不是远端审查。规格 python-compat 200 行、clarifications 113 行已全文读取。本机 macOS **26.5.2 (25F84)**，arm64，Node **v25.8.0**。

## 1. 官方版本、来源与摘要

已先通过 web_search 发现[固定官方 release](https://github.com/astral-sh/python-build-standalone/releases/tag/20260807)，再读取[官方 release API](https://api.github.com/repos/astral-sh/python-build-standalone/releases/tags/20260807)。release id `366742859`，published `2026-08-07T12:58:52Z`，builder commit `00c8a06113f11220667c3bcf5fab1672ff9e78ef`；说明为 CPython 3.13.14 → 3.13.15。未使用 latest、镜像或自动升级；不声称该发行永远为最新版本。

`runtime/python-supply.json` 固定完整 HTTPS 下载地址、版本、平台、CPU、原包/执行文件 SHA-256、尺寸、最低 macOS 与 flags。取得脚本以官方 API 固定摘要和官方 `SHA256SUMS` 双重核对；校验通过后才提取，未执行未核验载荷。

| 项目 | arm64 | x86_64（Node arch=x64） |
| --- | --- | --- |
| triple | aarch64-apple-darwin | x86_64-apple-darwin |
| 压缩原包字节 | 25,307,899 | 25,052,477 |
| 解包普通文件字节之和 | 65,477,772 | 65,910,502 |
| `du -sk` KiB | 67,676 | 68,088 |
| 文件/目录/链接总项 | 1,809 | 1,805 |
| Mach-O 数 | 10 | 10 |
| 最低 macOS（上游 metadata + 每个 Mach-O） | 11.0 | 10.15 |
| 原包 SHA-256 | `ebcf53fe921c356ad2eecfcea370cb744e7bd96fdef41a53e1e8f32a15c6dfeb` | `6704f2a981d7ea358d6a7ef4f2be2457d17a65ca096b466924f469eefc1c3d70` |
| python3.13 SHA-256 | `298d21ab43a8940a867fe356aca16bb216a2129f8df7f23a6a52e8bfa37446fa` | `29004fa50d925259627f7ad7f0a134f9dc7204bd09317e02226af8b188489ef2` |

两架构原包合计 **50,360,376 B**，解包普通文件合计 **131,388,274 B**；这不是最终 npm/桌面安装包大小。保留原包在 `runtime/archives/`。额外取证用 full 包在 `runtime/evidence/`：arm64 58,558,161 B、SHA `7e6d391f88b0d21cf8872761b37080a07f36d9be63187041a0aee4f5549282b0`；x64 57,699,566 B、SHA `bd1512eca94f3ea941537d42b4569f4e3bba5d349eab1f85c7616242385ec9aa`。full 包只用于提取 PYTHON.json/许可证与对比执行文件，未安装其中的 build 内容。

## 2. 许可证与供应异常

[固定上游分发说明](https://github.com/astral-sh/python-build-standalone/blob/00c8a06113f11220667c3bcf5fab1672ff9e78ef/docs/distributions.rst)明确 install_only 不携带 PYTHON.json 与 full 根目录 licenses。故不能只随 install_only 原包而丢本机依赖声明。已从两架构摘要合格的对应 pgo+lto full 包提取实际 metadata 与 14 个适用许可证；full/install_only 的 python3.13 执行字节分别一致。

- `runtime/licenses/license-index.json`：每架构 **56 个**随带/补充 notice 的路径、SHA、官方来源，以及 metadata 例外。
- `runtime/licenses/NOTICE.md`：供应归属、保留义务、源/二进制未修改声明与发布边界。
- CPython PSF/Python-2.0、CNRI/BeOpen/CWI 历史条款；bzip2、MIT(libffi/expat)、X11(ncurses)、BSD-2-Clause(mpdecimal)、Apache-2.0/OpenSSL、0BSD(liblzma)、SQLite public-domain、TCL、BSD-3-Clause(libuuid/libedit)、Zlib 的完整声明保留。
- pip 26.2.1 及其 vendored notices 保持原样；包含 certifi 的 MPL-2.0 源形式 CA 证书及声明。不是“全包只有 PSF 许可”，不运行 pip/ensurepip，不开放运行时装包。
- Darwin `readline` 使用系统 libedit，而非历史 GPL readline；未把旧 `python-licenses.rst` 作为当前许可清单。
- **显式上游差异**：PYTHON.json 声明 `licenses/LICENSE.zlib-ng.txt`，两 full 原包均不存在。实际 Darwin metadata 仅链接 `z/system=true`，两架构 Mach-O 均依赖系统 `/usr/lib/libz.1.dylib`，未供应 zlib-ng；取得脚本对这一确切条件记录例外，其他缺许可仍报错。未换发行/伪造文件。
- 官方 docs 用单数 `license_path` 描述扩展，但实际字段为 `license_paths`；脚本按真实字段修正。平台配置最初候选路径 404，后经固定提交 tree API 定位 `cpython-unix/targets.yml`，未换源。

许可工作是工程来源与 notice 核验，不是法律意见。最终发行需保留目录及 payload 自有条款，并复核嵌入组件的最终 notice 覆盖；未经最终包检查不宣称发布合规完成。

## 3. 动态库、权限与签名

`runtime/evidence/static-audit.json` 保存全部 20 个 Mach-O 的 SHA、CPU header、最低系统、LC_RPATH、依赖、codesign 与 spctl 输出；每架构 inventory 保存全树普通文件摘要、mode 和相对链接。

- 主执行文件内含静态解释器实现，加载系统 CoreFoundation、SystemConfiguration、libSystem、ncurses、panel、libedit、libz；不是依赖开发机 Python。
- `_tkinter` 的 Tcl/Tk 通过 `@loader_path/../..` 指向包内动态库，其他包内动态库均解析在对应 runtime 根；没有 Homebrew、开发机绝对库或其他 App 库依赖。系统 framework 集合详见静态报告。
- 全树无 group/world 可写普通文件/目录、无 setuid/setgid、无逃逸 symlink 或特殊文件。顶层解包目录为 0700。此证据不替代安装后祖先目录信任、ACL与载荷不可被未授权用户覆盖的准入检查；同 uid 攻击者仍能改其拥有的文件。
- arm64 10/10 Mach-O `codesign --verify --strict` 成功，但 **Signature=adhoc、TeamIdentifier=not set**；x64 10/10 未签名（verify status 1）。
- `spctl --assess --type execute -vv` 两架构 **status 3/rejected**，x64 `source=no usable signature`。未删除 quarantine、修改系统 Gatekeeper、重签或公证。
- 实际下载/解包树只有记录到的 `com.apple.provenance`，没有 `com.apple.quarantine`；因此实际启动证明的是本地无 quarantine 的已核验载荷，不是互联网安装 Gatekeeper 放行。未制造隔离标记后绕过系统警告。
- 若正式签名分发由 desktop fork 拥有，具体依赖为：签署各架构 10 个嵌套 Mach-O、保留相对装载路径、加入最终公证与带 quarantine 的干净收件环境验收，并更新签名后摘要。仅报告依赖，未动外仓/签名凭据。

## 4. 真实执行证据

测试命令（在本任务插件根，Node 用现有解释器）：

```sh
node scripts/python-supply.mjs acquire
node scripts/python-supply-metadata.mjs
node scripts/python-supply-notices.mjs
node scripts/python-supply-audit.mjs
node --test scripts/python-supply.test.mjs
```

最终供应测试 **5 passed / 0 failed / 0 skipped**，执行前后两树全量 inventory 一致。测试写入仅任务 runtime 临时夹具，完成后删除自有夹具。

1. 改摘要/尺寸拒绝，不提取不执行。
2. 子进程 PATH 指向空目录，按名 `python3` 返回 ENOENT；固定私有 executable 成功 probe（3.13.15、dir_fd/no-follow/fsid/flock）。
3. 注入 PYTHONHOME/PYTHONPATH/PYTHONUSERBASE/PYTHONSTARTUP，CWD 放置恶意 json.py/sitecustomize.py；`-I -S -B -u` 下未加载，sys.path 全部指向私有树、isolated/no_site/no_user_site 均为1。实际导入 ssl/sqlite3/bz2/lzma/ctypes/fcntl/hashlib/unicodedata 成功；OpenSSL **3.5.7**、SQLite **3.53.1**。
4. 固定现有 `src/storage-fs.py` 同步执行原子 JSON/read/hash；symlink 目标拒绝且原件未变。
5. 异步同一 executable 执行 probe、打开/读取有界 FD 流、跨进程 flock 竞争返回 storage-busy、unlock 后干净退出。

`runtime/evidence/arm64-execution.json` 保存真实绝对 executable、sys.path/flags/版本/依赖与测试时 helper SHA：`61f1ad65e3965433b76c40a209e63ab3ab176deae1e9c172f8f171e41509e8bc`。业务源码正由工程96修改，本报告只证明该记录时的 helper；接线后需重跑。

`runtime/evidence/x64-execution-attempt.json` 保存实际 x64 二进制直接启动结果：probe exit0、machine=x86_64、3.13.15；**宿主仍 arm64，是转译执行**，未模拟 process.arch、未安装 Rosetta、不作为客户前提。Intel 原生机以及 macOS 10.15/11.0 最低系统实际执行证据缺失。

## 5. 交给下一工程的接线参数

插件绝对根：

```text
/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/assets-storage-766/plugins/omnimux-assets
```

插件相对执行文件：

```text
runtime/cpython-3.13.15+20260807-darwin-arm64/python/bin/python3.13
runtime/cpython-3.13.15+20260807-darwin-x64/python/bin/python3.13
```

由插件安装位置解析绝对路径，不硬编码本机 worktree；限定 `darwin + process.arch`，匹配 manifest 的 executableSha256/安装信任检查后冻结一个执行身份。所有 async/sync/独立 store 使用同源固定参数：

```js
args = ['-I', '-S', '-B', '-u', absolutePluginHelperPath];
```

不要经 shell、不回退 PATH Python、不借其他 App、不首启下载、不在 helper 死亡后换解释器。生产 env 必须显式白名单构造（至少 locale；按 helper 必需保留受控 HOME/TMPDIR），不得原样继承 `PYTHON*` 或 `DYLD_*` 注入。`-I` 防 Python 环境/用户 site/CWD，**不防 dyld 注入**；`-S` 不运行 site，`-B` 不产生 pyc，`-u` 支持 JSON 行协议。测试只提供供应接口证据，没有改业务 resolver/Runtime/storageSync。

最终包白名单由主理人交还写面后统一修改：保留对应两架构 payload、`runtime/python-supply.json`、`runtime/licenses/**` 及既有 helper；排除 `runtime/archives/**`、`runtime/evidence/**`、测试夹具及取得脚本的客户运行用途。运行时不依赖任何供应脚本。未实测最终 package pack，因此不能称白名单完成。

## 6. 检查结果与边界异常

- 供应专用静态核验与真实隔离测试通过；新增脚本跨文件 import/manifest/flags/路径统一，未新增 npm 依赖。
- `git diff --check` exit0；新 report/脚本单独空白校验也应在集成时随最终 diff 复验。
- **`pnpm test:gates` exit1，未执行门禁测试本体**：pnpm 前置自动 install 遇 `omnimux-publish` 既有 `/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/personal/dsh-ui-kit` ENOENT。没有为了过门禁创建该路径或跨仓修复。完整日志 `runtime/evidence/gates-test-output.txt`。
- 此入口在失败前输出重新链接 worktree node_modules 下 acorn/esbuild/pngjs；是供应目录之外的非预期本树副作用，已报告并停止该入口。没有清理或反向覆盖正在被并行工程使用的依赖目录；请主理人接管时核对。未修改 tracked package/lock/源码作为修复。
- 全插件业务单测、L2/ego/Host/Electron 与真实旧库全功能兼容未在本分工执行，不能由供应测试替代；业务写面还在工程96。

## 7. 下一责任人与关闭条件

主理人收回工程96及本供应写面后，交单一工程：统一 resolver + async/sync/独立 store、最终包白名单/notice/安装信任检查，真实无 PATH Python 旧库 HTTP/工具/预览/CRUD/导入/上传/恢复回归，再独立 QA。Intel 原生/最低系统、带 quarantine 的最终签名安装链和 L2 证据仍必需。若涉及壳仓签名则以具体依赖另行处理，不能越仓。

供应阶段结果可供同源接线使用；**不是整个 T01、整个 #766 或正式可发布版本通过**。本轮未 commit、push、发布、部署、激活插件或触碰用户真实资产。
