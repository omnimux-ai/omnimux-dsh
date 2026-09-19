# OmniMux Device - 移动真机矩阵与设备智能体中枢 系统架构设计

## 一、 整体架构拓扑：三层解耦模型

系统分为 **业务交互面（OmniMux 插件）**、**中枢控制面（OmniMux 网关）** 与 **硬件执行面（Device Runner）**：

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
└──────────────────────────────┬──────────────────────────────┘
                               │ 双向长连接 (Heartbeat / Job Dispatch)
                               ▼
┌─────────────────────────────────────────────────────────────┐
│             3. 硬件执行面 (Device Runner / FARM Node)        │
│  - WDA 多机进程守护池 (wda-service: 8100, 8101...)           │
│  - 本地原生 Vision OCR 编译加速 (swiftc 毫秒级引擎)           │
│  - AXe 无障碍元素树提取器                                     │
│  - TypeSafe Jev 毫秒级决策闭环回路                             │
└──────────────────────────────┬──────────────────────────────┘
                               │ USB 数据线 (libimobiledevice / usbmuxd)
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                 物理真机集群 (iPhone Array)                  │
│   [iPhone 1]        [iPhone 2]        [iPhone 3]  ...       │
└─────────────────────────────────────────────────────────────┘
```

---

## 二、 “快慢双脑”智能体决策控制回路

这是解决手机控制“反应迟钝、容易点错”的核心算法架构：

```
【慢思考大脑: DeepSeek-V3 / Claude 3.5】
  │
  │ 一次性制定宏观规划:
  │ "目标：在 1 号机 TikTok 上发布视频 clips/cat.mp4，文案：Cute cat daily #cat"
  │
  ▼
【状态注入与快思考循环: TypeSafe Jev 引擎 (每秒 5~10 轮)】
  │
  ├─ 1. 抓取当前屏幕状态 (State Synthesis)
  │    - 聚合当前可见控件: ["Home", "Discover", "Create(+)", "Inbox", "Profile"]
  │    - 提取 OCR 词表: ["Post", "Upload", "Next", "Sounds"]
  │    - 目标子任务: "进入发布流程"
  │
  ├─ 2. 构造类型安全候选动作集 (Choice Mapping)
  │    choices = {
  │      "tap_create": "点击屏幕下方的加号创建按钮",
  │      "dismiss_ad": "如果存在弹窗则点击右上角X关闭",
  │      "scroll_feed": "向下滑动推荐流",
  │      "wait_render": "等待界面网络加载"
  │    }
  │
  ├─ 3. TypeSafe Jev 模型推理 (约 100~200ms)
  │    返回：{ decision: "tap_create", confidence: 0.985 }
  │
  ├─ 4. 置信度门禁校验 (Confidence Gate)
  │    IF confidence >= 0.85:
  │        下发 WDA 原生点击指令 -> 进入下一微操状态
  │    ELSE:
  │        置为待定，重试截图或调用 Vision 校验，杜绝盲点
  │
  └─ 5. 循环推进，直至识别到“发布成功”终态，退出循环并向顶层汇报
```

---

## 三、 硬件中控与 WDA 多机池化管理

借鉴并升级自 `prod-FARM-IOS-Core` 的工程实践：

### 3.1 端口与会话拓扑
* 每一台物理 iPhone 分配一对独立端口：
  - WDA REST 端口：`8100 + index`
  - MJPEG 推流端口：`9100 + index`
* 采用轻量 Node.js 直连 WDA 原生 REST 接口，**彻底剔除 Appium 中间层**，单次动作下发延迟从 1500ms 降至 200ms。

### 3.2 守护与自愈机制（Watchdog）
* **心跳探测**：每 3 秒向 WDA `/status` 发起探活；
* **闪退重启**：若连续 2 次探活失败，后台通过 `xcodebuild` / `devicectl` 自动重新唤起 WebDriverAgentRunner，并在 5 秒内恢复连接；
* **物理防锁屏**：通过 WDA 的 HID 发送轻微活跃信号，或配置自动解锁 Passcode，确保无人值守下的 100% 任务穿透率。

---

## 四、 接口契约规范 (Seams & Tool Schema)

### 4.1 跨插件共享服务通道（`ctx.provide('device')`）
```ts
export interface DeviceService {
  listDevices(): Promise<Array<{
    udid: string;
    name: string;
    model: string;
    osVersion: string;
    state: 'idle' | 'busy' | 'offline';
    boundAccount?: { platform: string; username: string };
  }>>;
  getDevice(udid: string): Promise<DeviceInfo | null>;
  executeStep(udid: string, action: DeviceAction): Promise<ActionResult>;
  runAutonomousFlow(udid: string, flowSpec: FlowSpec): Promise<FlowResult>;
}
```

### 4.2 智能体决策工具入参规范
通过 `omnimux_jev_decision` 提供的标准输入契约：
```json
{
  "state": "Device iPhone-13: Front app com.zhiliaoapp.musically, Current Page: EditScreen, Elements: [Back, Sounds, Text, Stickers, Effects, Next], OCR: ['Your story', 'Post to Story', 'Next']",
  "choices": {
    "click_next": "点击右下角红色 Next 按钮",
    "add_sound": "点击顶部 Sounds 挑选背景音乐",
    "edit_caption": "点击编辑输入文案",
    "wait": "等待视频预处理完成"
  },
  "instructions": "当前阶段需要推进到发布配置页，请选择最优操作"
}
```

---

## 五、 安全、风控与防封策略

1. **一机一号一网络**：
   - 每台 iPhone 绑定固定社媒账号，设备走专用的家庭宽带代理，严禁单机频繁切号；
2. **拟人化行为抖动**：
   - 杜绝完全固定的坐标与间隔时间；每次点击加入 **±5~15 像素** 的随机偏置，划动模拟真实人类的贝塞尔加速度曲线；
3. **不可逆动作双重校验**：
   - 对于“删除、付款、修改账号绑定”等高危操作，即便 TypeSafe 置信度极高，也必须在 DSH 对话框中弹出确认卡片，经由人工授权确认后方可落地。
