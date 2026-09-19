# OmniMux 移动真机矩阵与设备智能体中枢 系统架构设计 (Architecture)

| 文档版本 | 编写人 | 评审状态 | 关联 Worktree |
| :--- | :--- | :--- | :--- |
| **v1.0.0** | 交付团队架构组 | 待评审 | `omnimux-dsh-wt-mobile-farm-prd` |

---

## 一、 整体拓扑：三层解耦模型

```
┌─────────────────────────────────────────────────────────────┐
│                 1. 业务交互面 (OmniMux 插件)                 │
│  - 对话流交互 (自然语言意图分诊)                                │
│  - Agent 一级工具层 (device_list, device_publish_flow)       │
│  - DSH 侧边栏多机实时投屏面板 (MJPEG Stream)                   │
└──────────────────────────────┬──────────────────────────────┘
                               │ HTTP / WebSocket Seam
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                  2. 中枢控制面 (OmniMux 网关)                 │
│  - 统一发布通道契约 (Publishing Seam)                         │
│  - 任务防重发锁与状态机 (Job State Machine)                  │
│  - 账号与矩阵设备路由调度器 (Device Router)                    │
│  - 多苹果证书池 (Multi-Cert Pool) 管理与配额分发               │
└──────────────────────────────┬──────────────────────────────┘
                               │ 双向长连接 (Heartbeat / Job Dispatch)
                               ▼
┌─────────────────────────────────────────────────────────────┐
│             3. 硬件执行面 (Device Runner / FARM Node)        │
│  - WDA 多机进程守护池 (wda-service: 8100, 8101...)           │
│  - 本地原生 Vision OCR 编译加速 (swiftc 毫秒级引擎)           │
│  - AXe 无障碍元素树提取器                                     │
│  - TypeSafe Jev 毫秒级决策闭环回路                             │
│  - 设备分批轮换排班执行器 (Time-sharing Executor)             │
└──────────────────────────────┬──────────────────────────────┘
                               │ USB 数据线 (libimobiledevice / usbmuxd)
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                 物理真机集群 (iPhone Array)                  │
│   [iPhone 1]        [iPhone 2]        [iPhone 3]  ...       │
└─────────────────────────────────────────────────────────────┘
```

---

## 二、 核心解耦设计：授权配额 vs 并发控制量

### 2.1 物理约束与模型分离
* **授权配额 (License Quota)**：单付费苹果开发者账号绑定 100 台 iPhone UDID，证书有效期 1 年；系统支持接入 $N$ 个开发者账号（$N \times 100$ 台总配额）；
* **并发控制量 (Concurrent Session Limit)**：单台 Mac mini 保持 10~15 台稳定在线通信与视频流传输。

### 2.2 轮换排班调度算法 (Time-Sharing Scheduling)
1. **任务批次分流**：
   网关将队列中的发布任务按设备标签切分为若干批次（Batch 1, Batch 2, Batch 3...）；
2. **状态切入与唤醒**：
   - 处于执行批次的设备：唤醒屏幕、执行自动解锁、挂载 WDA 交互通道；
   - 处于空闲/轮休批次的设备：由 Runner 释放推流资源与高频心跳，进入轻量待机状态；
3. **硬件资源复用**：
   通过分批调度，原本需要 10 台 Mac mini 才能带起的 100 台手机，只需 **2~3 台 Mac mini** 即可在无人值守的 24 小时排班周期内全部完成分发！

---

## 三、 “快慢双脑”微操控制决策回路

```
【慢思考大脑: DeepSeek-V3 / Claude 3.5】
  │ 一次性制定宏观规划 (一次任务仅调 1 次):
  │ "目标：在 1 号机 TikTok 上发布视频 clips/cat.mp4，文案：Cute cat daily #cat"
  │
  ▼
【快思考循环: TypeSafe Jev 引擎 (每秒 5~10 轮)】
  │
  ├─ 1. 抓取当前屏幕状态 (State Synthesis)
  │    - 提取 AXe 控件名: ["Home", "Discover", "Create(+)", "Inbox", "Profile"]
  │    - 提取 Vision OCR 文本: ["Post", "Upload", "Next", "Sounds"]
  │
  ├─ 2. 构造类型安全选择集 (Choices)
  │    choices = {
  │      "tap_create": "点击屏幕下方的加号创建按钮",
  │      "dismiss_ad": "如果存在弹窗则点击右上角X关闭",
  │      "scroll_feed": "向下滑动推荐流",
  │      "wait_render": "等待页面加载"
  │    }
  │
  ├─ 3. TypeSafe Jev 模型推理 (100~200ms)
  │    返回：{ decision: "tap_create", confidence: 0.985 }
  │
  ├─ 4. 置信度硬门禁校验 (Confidence Gate)
  │    IF confidence >= 0.85:
  │        下发 WDA 直连点击指令 -> 进入下一状态
  │    ELSE:
  │        置为待定，启动 Vision 二次核验，杜绝盲点
  │
  └─ 5. 循环推进，直至识别到“发布成功”，退出微操循环
```

---

## 四、 硬件池化守护与高可用自愈 (WDA Supervisor)

* **剔除 Appium**：Runner 直连 WDA 原生 REST 接口，消除冗余代理层；
* **双向健康心跳**：每 3 秒探活 `/status`，连续 2 次无响应在 5 秒内自动重启拉起 WDA；
* **锁屏自动解锁**：支持配置设备 Passcode，任务启动前自动下发数字点阵点击，完成自动化唤醒。
