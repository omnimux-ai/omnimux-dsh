# OmniMux 插槽契约治理与构建完整性加固规范 (Slot Governance & Packaging Integrity)

## 1. 规范背景与核心价值

在 DeepSeek Harness (DSH) 插件化体系与 Electron 桌面端架构中，OmniMux 作为核心能力中枢与垂直微应用宿主，必须确保：
1. **插槽竞态零冲突 (Deterministic Slot Shadowing)**：前端单占插槽（Single Occupant Slot）在多插件、多服务共存时具备绝对明确的胜出阶梯，杜绝无序覆盖或挂起。
2. **打包与运行时完整性 (Packaging & Asar Integrity)**：桌面端（Electron）注入自定义 Agent 预设后，Asar 文件头与 `Info.plist` 的 `ElectronAsarIntegrity` 哈希保持 100% 字节级一致，防止启动阶段被 Electron 完整性校验拦截。
3. **多维质量门禁卡点 (Multi-tier Quality Gates)**：从代码静态扫描（AST/Regex）、CI 门禁到端到端冷启 Smoke 探针，全链路自动化防御回归。

---

## 2. 插槽契约规范 (Slot Governance Contract)

### 2.1 插槽类型定义

DSH 插槽体系分为两类：
- **单占插槽 (Single Occupant Slot)**：同一时刻仅允许渲染单一视图组件（如会话空白页 Brand Mark、输入框附件栏）。宿主按 `priority` 升序仲裁，**数值越小优先级越高**，最小者胜出。
- **多占/列表插槽 (Multi Occupant Slot)**：允许多个插件同时追加视图（如 `settings.section`, `settings.plugins.tab`, `sidebar.footer.action` 等），按 `order` 升序排列。

### 2.2 单占插槽字典 (Single Occupant Slot Dictionary)

| 插槽名称 (Slot Name) | 职责说明 | 宿主默认 Priority | OmniMux 约定 Priority | 必须携带字段 |
|---|---|---|---|---|
| `conversation.hero.brand.mark` | 会话空白页中央品牌 Mark 区域 | `0` (`ui-brand-official`) | `-10` | `name`, `id`, `priority` |
| `conversation.input.attachments` | 输入框内部附件托盘栏 | 无 / `0` | `-10` | `name`, `id`, `priority`, `locale` |

### 2.3 Priority 阶梯标准

```text
Priority 数值阶梯：
  -20: 紧急/最高优先级覆盖 (Emergency Modal / System Lockdown)
  -10: OmniMux 核心中枢覆盖 (OmniMux Primary Override)  <--- 核心插槽标准
    0: 官方默认实现 / 兜底组件 (Host Official Default)
  +10: 低优先级扩展 (Low-priority Addon)
```

### 2.4 注册硬约束 (Hard Invariants)

1. **必须显式声明 Priority**：所有注册单占插槽的代码必须显式指定 `priority: -10`（或相应阶梯值），严禁省略。
2. **必须携带唯一 ID**：每个注册必须携带具名的 `id`（例如 `omnimux-hero-brand-mark`, `omnimux-attachment-tray`），便于冲突定位与销毁。
3. **禁止同 Priority 冲突**：同一插槽在全平台插件代码中不得存在多个相同 `priority` 的竞争注册。

---

## 3. Asar 完整性与 Plist 同步规范 (Asar & Plist Packaging Integrity)

### 3.1 macOS Electron Asar Integrity 机制

macOS 下的 Electron 应用在启用 Asar 完整性校验时，会在应用包的 `Contents/Info.plist` 中写入 `ElectronAsarIntegrity` 字典：

```xml
<key>ElectronAsarIntegrity</key>
<dict>
    <key>Resources/app.asar</key>
    <dict>
        <key>algorithm</key>
        <string>SHA256</string>
        <key>hash</key>
        <string>3b616...8c91a</string>
    </dict>
</dict>
```

### 3.2 Asar 改写与哈希同步原则

1. **定长改写 (Same-Length Header Patching)**：
   - 改写 `app.asar` Header 时，新 Header JSON 长度不得超过原 Header JSON 长度；
   - 不足部分必须使用空格（Space Padding）填充，确保 Asar 内后续所有文件的物理 Offset 绝对不变。
2. **哈希同步更新 (Integrity Hash Sync)**：
   - 改写 `app.asar` 后，必须立即计算修改后 Asar 文件的 SHA-256 哈希值；
   - 自动定位并同步更新 `Info.plist` 中的 `ElectronAsarIntegrity['Resources/app.asar'].hash`；
   - 优先使用 macOS 原生 `/usr/bin/plutil` 保障二进制/XML Plist 正确性，并在非 macOS 环境提供可靠 XML 降级。
3. **备份与验证**：
   - 首次改写前自动创建 `app.asar.bak-header` 备份；
   - 提供 `--verify-only` 与 `--dry-run` 模式供发布前巡检。

---

## 4. 门禁与自动化探针体系 (Quality Gates & Smoke Probes)

### 4.1 静态契约扫描 (`pnpm verify:slots`)
- 扫描 `plugins/*/src/client/**` 源码；
- 检测所有 `conversation.hero.brand.mark` 与 `conversation.input.attachments` 注册；
- 违规（缺少 priority / priority 错误 / 缺少 id）直接输出行号并阻断 CI（Exit 1）。

### 4.2 端到端冷启 Smoke 探针 (`pnpm verify:smoke`)
- 针对本地开发版（45120）或生产版（44120）发起 HTTP 探测（Agent 侧验收同源复用该探针能力，在自身隔离 worktree 的动态端口本地服务上执行；Dev 45120 真机验收归人工，不作为 Agent 交付卡点）；
- 校验响应状态码 200；
- 解析 DOM 骨架，断言无 `data-dsh-boot="hanging"` 挂起、无 `data-dsh-desktop-recovery` 恢复遮罩；
- CDP 控制台错误探针，确保 0 Fatal Console Errors。

### 4.3 Worktree 交付门禁 (`scripts/git-wt.sh finish`)
- 在 Git Worktree 完成收尾前强制串联 `verify:slots` 门禁，不通过严禁推送分支与创建 PR。
