# 第三方组件：ComfyUI（托管后端）

本插件（`omnimux-workflow`）**不随包分发** ComfyUI 的代码或二进制。ComfyUI 页面节点用到的
托管后端由安装器在用户机器上**从上游仓库按固定版本拉取**，装到插件数据目录，与我们的源码
分离、可独立替换或删除。

| 项目 | 值 |
| --- | --- |
| 组件 | ComfyUI |
| 上游仓库 | https://github.com/comfyanonymous/ComfyUI |
| 固定版本 | tag `v0.42.5`，commit `483dae4326356b81de05d27aca3f433dd323cc25` |
| 许可证 | GNU General Public License v3.0（上游仓库 `LICENSE` 文件原文） |
| 源码获取 | `https://codeload.github.com/comfyanonymous/ComfyUI/tar.gz/483dae4326356b81de05d27aca3f433dd323cc25` |
| 我们是否修改 | 否。使用上游该 commit 的原始源码，一行未改 |
| 安装位置 | 插件数据目录下 `comfyui-backend/ComfyUI/`（独立目录、独立进程，可分离） |

## 为什么不需要随包附带 GPL 全文

我们不做 ComfyUI 的再分发：仓库里没有它的代码，安装包也不含它。用户机器上的那份是安装器
从上游固定 commit 下载的，源码与许可证原文都在同一处（上面的源码获取链接内即含 `LICENSE`）。
需要 GPL 全文时从该链接或上游仓库根目录的 `LICENSE` 获取。

## 用户数据与第三方运行时

- 固定版本的 Python 运行时来自 python-build-standalone（PSF 许可），PyTorch 来自 PyPI
  （BSD 风格许可），两者同样在安装时下载、不随包分发。
- 模型权重**不由本插件下载**：用户的模型文件放在安装根的 `userdata/` 下，升级或重装后端
  不会删除该目录。
