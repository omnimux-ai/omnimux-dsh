# google-vids-omni · text_to_video · live 证据

- Issue: #3167（本机 vids2api 服务接入中枢）
- 日期: 2026-10-06
- 操作: `google-vids-omni` / `text_to_video`
- 结论: **真机最小生成通过（live）** —— 经中枢自身媒体入口提交，产出可播放 MP4。

## 1. 方法与边界

调用的是中枢自己的入口，而不是裸调本机服务：

```js
executeOmnimuxMedia('video', {
  model: 'google-vids-omni',
  operation: 'text_to_video',
  prompt: '一只橘猫在阳光下的木地板上慢慢走过，镜头轻微跟随',
  duration: 4,
  dest: '<tmp>/google-vids-omni-text_to_video.mp4',
  requireListed: false,   // 本票验证期间该操作仍为 draft；上架后此参数不再需要
})
```

- 本机服务: `vids2api`（独立仓 `Github/vids2api`，`uvicorn vids_main:app`），地址经 `OMNIMUX_VIDS2API_BASE_URL` 显式注入，**源码内不硬编码回环地址**（产品基线 R3）。
- 账号池: 服务自选可用账号（本次为 `ego-account-3`；账号 1 带配额耗尽、账号 2 带会话失效污点）。
- `requireListed: false` 只用于本次验证：`op.listed` 由 `research.status` + `implementation.status` 派生，验证前该操作仍是 draft。

## 2. 结果

| 项 | 实测值 |
|---|---|
| 返回 | `mode: "live"`，`model: "google-vids-omni"`，`taskId: 7a336f975b1e4ad69d2e425f` |
| 成片 | `mov,mp4,m4a` · 1280×720 · h264 24fps + aac 音轨 |
| 字节数 | 2 419 225（非空校验通过） |
| sha256 | `f1bc597b81cd6786…`（完整值见 `google-vids-omni-text_to_video.json`） |
| 时长 | **4.010 s**（请求 4 s）→ 证明 `duration` → `seconds` 映射真实落到上游，未回退默认 10 s |
| 端到端耗时 | 37.6 s（含提交、轮询、下载） |

原始机器可读记录: [`google-vids-omni-text_to_video.json`](./google-vids-omni-text_to_video.json)。

## 3. 覆盖的验收标准

- AC-02 消费端可显式调用（经中枢统一入口进入本机通道，未走云端网关）✔
- AC-03 真机最小生成成功（`mode: live`，产物存在、字节 > 0、可被 ffprobe 识别）✔
- AC-06 轮询有界（本次 37.6 s 内终态；截止由 `deadlineMs` 控制）✔

## 4. 未覆盖 / 已知限制

- **服务未启动时的响亮失败（AC-04）**由单元测试覆盖（注入不可达 fetcher），未在本次真机记录中重复制造该故障。
- 上游 `seconds` 的 protojson 补丁是「按值命中」启发式；本次 4 s（非模板默认值）命中，但 5/6/8 s 等值未逐一实测。
- 账号池存在会话硬化风险（服务侧 `VIDS.md` 已记录）：配额耗尽或密集探测后，导出 cookie 的重放可能被整体拒绝。
- 未做图生视频、整片导出（本票 non-goals）。
