# QA 实测证据 · Issue #2973（会话栏产物媒体预览）

## 环境
- ego-browser 真实浏览器 + 产品 harness（`extension/tests/harness` vite build，`frame.html?theme=dark&width=420&delay=60`）
- 假桥 `fakeApi.ts` 应答 `session.attachment` 与 `omnimux.producedMedia`（path 源字节经 data URL 回传）

## 验证记录（DOM snapshot + 截图）
| 项 | 证据 |
|---|---|
| display_file 图片（attachment 源）→ 画廊大卡 + 「查看大图」按钮 + JPG 徽标 | produced-image-card.png；DOM `button "查看大图"` |
| display_file 视频（path 源）→ `<video controls>`，原生播放/静音/全屏/进度条齐全，MP4 徽标 | produced-video-card.png；DOM `video "clip.mp4"` + `button "播放"` |
| 音频 → `.audio-strip` 原生 audio controls（不进灯箱） | produced-mixed-cards.png 下半；DOM `container "voice.mp4"` + `音频时间进度条` |
| PDF → `.file-card`（FileIcon + `report.pdf` + `13 KB` + `PDF` 徽标），不进灯箱 | produced-mixed-cards.png |
| 同回合多产物（图+视频+音频+文件）→ stage 双项计数 `1 / 2`（图/视频进 rail，音频条与文件卡并列其下） | produced-mixed-cards.png；DOM `text "1 / 2"` + tab `查看 clip.mp4` |
| 失败态沿用既有 `媒体加载失败`+`重试`（flaky 用例未回归） | DOM `text "媒体加载失败"` |

## 结论
四条产线（attachment/path/audio/file）在真实浏览器按设计呈现；typecheck 无新增错误；`produced-media`/`gallery`/`events`/`attachments` 与桥侧 node:test 共 105 用例全绿。PM_SIGN_OFF: PASS。
