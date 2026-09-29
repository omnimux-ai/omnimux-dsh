# 规格：修复 media/execute.js 缺少 getModelChannelGroups 导入问题 (Issue #2820)

## 一、目标 (Objective)
在 `plugins/omnimux/src/media/execute.js` 中补齐 `getModelChannelGroups` 的显式模块导入，彻底消除在画布中调用官方媒体模型（Image 2.5 / Hailuo H3）生成时抛出的 `ReferenceError: getModelChannelGroups is not defined` 运行时异常。

## 二、命令 (Commands)
- 测试验证命令：
  `node --test plugins/omnimux/src/media/multi-channel-runtime.test.js`

## 三、项目结构与修改范围 (Project Structure & Scope)
- 源码修改：`plugins/omnimux/src/media/execute.js`
- 关联契约：`plugins/omnimux/src/catalog/serving/channel-groups.js`（导出 `getModelChannelGroups`）

## 四、技术方案与代码变更 (Technical Design)
在 `plugins/omnimux/src/media/execute.js` 第 18 行：
```javascript
import { resolveRequestChannelIntent, parseModelAndGroup, isOfficialChannelId, getModelChannelGroups } from '../catalog/serving/channel-groups.js'
```
显式导入 `getModelChannelGroups` 函数，确保第 265 行 `isOfficialMediaModel` 计算逻辑在运行时安全执行。

## 五、验收标准 (Success Criteria)
1. `plugins/omnimux/src/media/execute.js` 语法与引用完整无缺失。
2. 单元测试 `multi-channel-runtime.test.js` 全部绿灯。
3. 真实画布调用媒体生成时，不再出现 `getModelChannelGroups is not defined` 错误。

## 六、边界约束 (Boundaries)
- Always：在独立工作树中修改源码，并保证单元测试全量通过后提交 PR。
- Never：严禁在未导入函数的情况下在生产主干部署；严禁使用首页默认空状态冒充业务功能验收。
