# 移除画布模型渠道卡片数据条规格（Remove Channel Data Bar Spec）

## 1. 业务痛点与用户决策
用户在工作流画布中配置生成节点（素材节点）的模型时，展开三级渠道策略选择菜单，渠道卡片下方展示了一排圆点进度条及 24h 稳定率、预计等待时间等数据条。
用户明确指示并确认：
**「方案 1：移除这个数据条」**

### 1.1 现状分析
1. `ModelCascadeMenu.tsx` 中的 `ChannelRow` 组件中：
   渲染了第一行基本信息（标签、价格、折扣、特性徽标、计费模式），以及第二行数据指标展示：
   ```tsx
   <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 11, color: 'var(--dsw-alias-label-secondary)' }}>
     {typeof stability === 'number' ? (
       <>
         <StabilityDotBar rate={stability} />
         <span>24h 稳定率 {stability}%</span>
       </>
     ) : (
       <span>稳定性暂无数据</span>
     )}
     {typeof waitSec === 'number' && waitSec > 0 ? <span>约{Math.round(waitSec / 60)}min</span> : null}
   </div>
   ```
2. 该数据条在视觉上占用了额外的垂直空间，且圆点进度条产生视觉杂讯，与现代极简设计语言不符。
3. `StabilityDotBar` 组件仅用于此行，移除后不再有其他调用处，可一并清理。

## 2. 改造方案
1. **彻底移除渠道卡片中的数据条行**：
   - 移除 `ChannelRow` 下方展示稳定性点阵（`StabilityDotBar`）、24h 稳定率文字以及等待时间的 `<div>` 容器整行。
   - 保留首行的核心元数据（版本名称、价格换算、特性徽标、按量/包月计费模式标签）。
   - 卡片高度自动收缩紧凑，垂直间距协调。
2. **清理无用组件与引用**：
   - 移除 `StabilityDotBar` 组件定义。
   - 检查并清理关联的单测断言（`modelCascadeMenu.test.mjs` 中对 `StabilityDotBar` 和 `稳定性暂无数据` 的断言更新）。

## 3. 验收标准（Acceptance Criteria）
- **AC-1（数据条彻底移除）**：渠道选择列表中，每个渠道项仅展示版本名称、价格及特性徽标，不再出现圆点进度条、24h稳定率与预计耗时文字。
- **AC-2（卡片高度收缩紧凑）**：卡片布局紧凑，上下边距对齐规范，无残留空白或高度塌陷。
- **AC-3（功能完整性）**：渠道的单选/选中勾选状态、hover 交互、价格显示与策略切换功能完全正常。
- **AC-4（测试全绿）**：工作流插件相关测试及契约检查 100% 通过。
