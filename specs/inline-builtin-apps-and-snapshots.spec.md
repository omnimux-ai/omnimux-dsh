# 规格：内联预设应用与快照清单彻底解决生产运行时找不到应用 404

## 1. 任务背景与问题排查
- **关联 Issue**: #2381
- **根因判定**:
  在生产/桌面客户端运行时，代码经打包后位于 `.../omnimux-apps/dist/index.js`。
  原代码中的 `loadBuiltinApps()` 与 `resolvePresetSnapshot()` 采用了硬编码相对路径：
  `path.resolve(currentDir, '../../catalog/builtin-apps.json')`
  在 `dist/` 目录下，向上两级直接跳出到外层 `node_modules` 导致文件不存在；
  同时 Electron 桌面环境下 `process.cwd()` 不是工程根目录，基于 `process.cwd()` 的路径同样全部失效；
  这导致 `loadBuiltinApps()` 返回空数组，最终返回 `404: 应用 app-creatify-app-demo 未找到`。

## 2. 改造方案
1. **静态打包内联 (Zero-IO Invariant)**:
   - 直接通过 ES import 将 `catalog/builtin-apps.json` 和 7 款官方预设工作流快照引入；
   - 在构建 `dist/index.js` 时，由打包器直接将其编译为 JavaScript 内存数据对象；
   - 彻底消除对运行期外部物理文件系统相对路径的脆弱依赖。
2. **多层级动态回退兼容**:
   - 保留动态读取逻辑，并补齐 `path.resolve(currentDir, '../catalog/builtin-apps.json')`（单级回退，对齐 `dist/` 结构）；
3. **测试验证**:
   - 验证生产环境无文件上下文下直接导入 `dist/index.js`，`service` 与 `routes` 均能 100% 命中内置应用与工作流快照；
   - 确保全量测试绿灯。

## 3. 验收标准 (Acceptance Criteria)
- **AC-1**: 内置应用清单与工作流快照静态内联，在孤立的运行环境下无需外部文件即可解析 `app-creatify-app-demo`；
- **AC-2**: `POST /omnimux-apps/api/apps/app-creatify-app-demo/executions` 成功返回 200 与 `executionId`，不再返回 404；
- **AC-3**: 单元与集成测试 100% 绿灯。
