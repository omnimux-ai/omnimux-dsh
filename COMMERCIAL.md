# 商业授权

OmniMux 插件采用 **AGPL-3.0 + 商业授权** 的双重许可方式，与 [new-api](https://github.com/QuantumNous/new-api) 相同。

## 产品与收费边界

当前产品聚焦[角色生成与视频复刻](docs/contracts/product-positioning.md)。源码许可、官网生成费用和企业定制服务是三件不同的事：可以免费使用源码，不代表调用模型、生成视频或购买套餐免费。官网收费以实际定价与结算为准。

自托管不等于所有请求都在本地完成。媒体生成可能把素材发送到所选服务；提交前请核对素材的使用授权与数据处理约定。不承诺固定降本比例、采购原价、矩阵获客或防封号。

## 先看你是否需要商业授权

在 AGPL-3.0 下，你已经可以免费使用、修改、自行部署这些插件，**包括商业用途**。只要满足两条：

1. 对外分发（含修改后通过网络提供服务）时，向你的用户提供对应的完整源码，并随附 LICENSE 与 NOTICE；
2. 在界面中保留 [NOTICE](NOTICE) 要求的 `Powered by OmniMux` 署名和链接。

做得到这两条，就不需要商业授权。

## 什么情况需要

| 情况 | 说明 |
| :--- | :--- |
| 不想公开你的修改 | 你修改了插件，对外提供服务或分发，但不希望公开修改后的源码 |
| 移除 OmniMux 品牌 | 你想去掉 OmniMux 署名，以自有品牌发布（白标 / OEM） |
| 公司政策不接受 AGPL | 你所在组织不允许使用 AGPL 许可的软件 |

技术支持、私有化部署协助和定制开发可以另行洽谈，与是否需要授权无关。

## 授权范围

OmniMux 只能授权 **OmniMux 自行编写的代码**。下列内容不在 OmniMux 商业授权范围内，仍按各自许可使用：

- 从上游 fork 或引入的代码，例如 `omnimux-market`（SkillHub）、`omnimux-clip` 中的 OpenReel、`omnimux-viewer`、`omnimux-browser`、`omnimux-workflow` 中的导演台组件，均为 MIT；
- 第三方依赖与资源，见各插件目录内的 LICENSE 与第三方声明，汇总见 [ACKNOWLEDGEMENTS.md](ACKNOWLEDGEMENTS.md)；
- 插件市场分发的第三方技能内容；
- 仓库根 `skills/clipforge-video/`、`skills/script-judges/`（派生自第三方 AGPL-3.0 项目，不随插件包分发）。

## 历史版本

2026-10-28 之前发布的版本，按其发布时声明的许可证授权（Sustainable Source 1.0 或 MIT）。

## 联系方式

- 商务合作与授权：`hello@omnimux.ai`
- 官网：[https://omnimux.ai](https://omnimux.ai)
