# Spec: 全场景统一引用（Unified Reference）与隐形场景上下文

## 1. 背景与目标
在 OmniMux 桌面端与插件矩阵中，商品库、资产库、创作画布、爆款灵感库等多个垂直业务场景均需要将本地实体与资源投递给当前会话中的 Agent 进行分析、脚本创作或爆款复刻。
当前各插件各自为政，重复实现会话栏露出、附件入桶与提示；更严重的是，之前采用硬编码向用户 Prompt 追加 `### 会话关联上下文` 并在前端强行擦除 DOM 的反模式，造成脏数据与界面泄露风险。

本规范确立：
1. **统一引用服务 (Unified Reference Hub)**：统一收敛会话分栏展开、附件导轨挂载、隐形上下文绑定、容量上限保护（8项）与视觉脉冲高亮。
2. **本地文件即实体指针**：向本地 Agent 传递规范的本地文件路径指针（POSIX 格式），Agent 按需调用原生 `read` 等工具自主读取。
3. **隐形场景上下文 (Shadow Context)**：提供会话级场景元数据暂存通道，模型在请求层隐形感知消费场景（如电商带货、视频复刻），用户聊天气泡与输入框 100% 保持纯净，废弃纯文本拼接。
4. **商品库（产品库）全功能闭环**：头部“对话中添加”与卡片原生支持一键挂载会话。

## 2. 接口与数据契约

### 2.1 UnifiedReference 数据协议
```typescript
export type ReferenceSource = 'product' | 'asset' | 'workflow' | 'inspiration' | 'browser' | 'file';
export type ReferenceKind = 'product' | 'asset' | 'table' | 'video' | 'image' | 'audio' | 'document' | 'canvas';

export interface UnifiedReference {
  id: string;
  source: ReferenceSource;
  title: string;
  kind: ReferenceKind;
  file: {
    relativePath: string;
    absolutePath?: string;
    previewUrl?: string;
    extension?: string;
    duration?: string;
  };
  context?: {
    scene: 'ecommerce_marketing' | 'video_replication' | 'storyboard_refine' | 'general';
    summary?: string;
    metadata?: Record<string, unknown>;
  };
}
```

### 2.2 deliverReference 调度器
```typescript
export interface DeliverReferenceOptions {
  sessionId?: string;
  revealMode?: 'split' | 'keep';
  prefillPrompt?: string;
  showToast?: boolean;
}

export interface DeliverReferenceReceipt {
  ok: boolean;
  reason?: 'duplicate' | 'quota-exceeded' | 'invalid-payload' | 'unavailable';
  referenceId?: string;
}
```

## 3. 验收标准与测试场景
1. **统一引用与挂载**：调用 `deliverReference` 能自动展开折叠的会话栏（切换至 split 模式），并将附件挂载至附件导轨，派发高亮事件；
2. **容量与幂等保护**：达到单会话 8 个附件上限时给出友好拒绝回执；重复添加同一指纹实体时具备幂等性；
3. **场景上下文隐形化**：隐形上下文注册至 `ShadowContextStore`，用户输入框内的 draft 保持原始纯净，用户发送的消息气泡不渲染任何结构化脏文本；
4. **商品库交互**：商品库头部“对话中添加”与商品卡片点击后正确唤起统一引用并投递。
