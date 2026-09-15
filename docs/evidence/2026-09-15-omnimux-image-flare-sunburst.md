---
title: "OmniMux live image evidence — GPT Image 2.5 Flare / Sunburst — 2026-09-15"
id: "evidence-omnimux-image-flare-sunburst"
type: "evidence"
status: "accepted"
authority: "L3"
date: "2026-09-15"
authors: ["x", "agent-catalog"]
subsystem: "omnimux/catalog"
related:
  - "plugins/omnimux/src/catalog/specs/image-models.yaml"
  - "docs/evidence/2026-09-10-omnimux-image-2-5.md"
---

# OmniMux live image evidence — GPT Image 2.5 Flare / Sunburst — 2026-09-15

用户 2026-09-15 指令要求逐个验证 `gpt-image-2.5`、`gpt-image-2.5-flare`、`gpt-image-2.5-sunburst` 并接入创作画布。本文件记录该次验证中与这两个新模型有关的真实调用事实。

请求方式：`POST https://api.omnimux.ai/v1/images/generations`，Bearer 令牌经 `omnimux tokens exec` 注入（密钥未落盘、未打印）。请求体 `{ model, prompt: "red apple", size: "1024x1024", n: 1 }`，分组以 `X-Omnimux-Group` 头下发。

## 1. 分组与模型名绑定（决定性事实）

| 请求 | HTTP | 响应 |
| --- | --- | --- |
| `model=gpt-image-2.5-flare`，无分组头 | 503 | `model_not_found`：分组 auto 下模型 gpt-image-2.5-flare 无可用渠道（distributor） |
| `model=gpt-image-2.5-sunburst`，无分组头 | 503 | 同上，分组 auto 下无可用渠道 |
| `model=gpt-image-2.5` + `X-Omnimux-Group: gpt-image-2.5-flare-std` | 503 | `model_not_found`：分组 gpt-image-2.5-flare-std 下模型 gpt-image-2.5 无可用渠道 |
| `model=gpt-image-2.5` + `X-Omnimux-Group: gpt-image-2.5-sunburst-std` | 503 | 同上 |

结论：专属分组只服务与其同名的模型。两个 profile 必须各自作为独立模型登记，不能表达成同一模型的档位；且必须携带各自的专属分组。

## 2. 专属分组下的真实出图

| 模型 | 分组 | HTTP | 输出 |
| --- | --- | --- | --- |
| `gpt-image-2.5-flare` | `gpt-image-2.5-flare-std` | 200 | 同步 `data[0].b64_json`（PNG 数据） |
| `gpt-image-2.5-flare` | `gpt-image-2.5-flare-pro` | 200 | 同上 |
| `gpt-image-2.5-sunburst` | `gpt-image-2.5-sunburst-std` | 200 | 同上 |
| `gpt-image-2.5-sunburst` | `gpt-image-2.5-sunburst-pro` | 200 | 同上 |
| `gpt-image-2.5-flare` | `gpt-image-2.5-flare-std`，`size: 1792x1024` | 200 | 同上，确认非方形尺寸可用 |

4 个可用分组全部返回图像数据，无任务轮询、无 `/content` 代理环节 —— 这两个模型走同步 `b64_json` 路径，不经过 `gpt-image-2.5` 那条会 502/504 的内容端点。

## 3. 网关公开元数据（`omnimux pricing`，2026-09-15 取）

| 模型 | 描述 | model_price (USD/次) | enable_groups |
| --- | --- | --- | --- |
| `gpt-image-2.5-flare` | the speed-oriented profile of the latest GPT image model — faster generations for rapid iteration | 0.014706 | `gpt-image-2.5-flare-pro`, `gpt-image-2.5-flare-std` |
| `gpt-image-2.5-sunburst` | the quality-oriented profile of the latest GPT image model — finer detail for finished assets | 0.014706 | `gpt-image-2.5-sunburst-pro`, `gpt-image-2.5-sunburst-std` |
| `gpt-image-2.5`（既有） | GPT Image 2.5 image service billed per request | 0.013072 | `default`, `gpt-image-2.5-economy`, `gpt-image-2.5-pro` |

两者同价，均为 `gpt-image-2.5` 的 1.125 倍；本地线路的 `discountRate` 按此比值登记。

## 4. 本次未验证

- 垫图参考（`multi_reference`）：未对这两个模型发起参考图请求，故不登记该操作。
- `-pro` 分组的档位倍率：网关只给出模型级 `model_price`，未取得分组级倍率，故本次只登记标准档线路。
- 分辨率 / 画质参数的逐项边界：仅验证 `1792x1024` 可用；参数选项集按同族 `gpt-image-2.5` 继承，未逐项实测。
- `gpt-image-2.5` 自身的取图故障：本次实测其 `/v1/images/{task}/content` 恒 502/504（Cloudflare 错误页），任务状态却为 SUCCESS。属网关侧问题，不在本文件范围内。
