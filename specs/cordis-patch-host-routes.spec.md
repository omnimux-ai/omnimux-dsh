# 规格：补齐 omnimux-apps Host 插件生命周期与 cordis.patch.yml 彻底根除 HTTP 405

## 1. 任务背景与核心问题
- **关联 Issue**: #2371
- **根因判定**:
  1. `plugins/omnimux-apps/package.json` 未声明 `"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }`；
  2. `plugins/omnimux-apps` 目录下缺失 `cordis.patch.yml` 文件；
  3. 导致 DSH Desktop 在启动并解析 `profiles/omnimux` 时，未将 `omnimux-apps` 登记为后端 Host 插件（未执行其 `apply(ctx)`）；
  4. 进而导致 `webServer.register` 路由从未在底座真正生效，任何对 `/omnimux-apps/api/apps/...` 的 POST 请求均被底座当作只读静态资源处理，抛出 `HTTP 405 Method Not Allowed`。

## 2. 改造范围与技术方案
1. **补齐 Cordis Patch 配置**:
   - 在 `plugins/omnimux-apps/cordis.patch.yml` 声明：
     ```yaml
     - insert:
         - id: omnimux-apps
           name: omnimux-apps
     ```
   - 在 `plugins/omnimux-apps/package.json` 的 `files` 中加入 `cordis.patch.yml`；
   - 在 `plugins/omnimux-apps/package.json` 中配置：
     ```json
     "dsh": {
       "bundle": {
         "patch": "./cordis.patch.yml"
       }
     }
     ```
2. **验证与物化**:
   - 验证 `scripts/verify-package-files.mjs` 门禁；
   - 编译并物化至 `~/.omnimux-dev`，使得 `profiles/omnimux/cordis.patch.yml` 与 `cordis.yml` 包含 `omnimux-apps`。
3. **测试保障**:
   - 新增针对 `cordis.patch.yml` 声明与加载的自动化测试用例，全绿通过。

## 3. 验收标准
- **AC-1**: `plugins/omnimux-apps/cordis.patch.yml` 存在且格式正确；
- **AC-2**: `plugins/omnimux-apps/package.json` 中包含合规的 `dsh.bundle.patch` 与 `files` 字段；
- **AC-3**: `scripts/verify-package-files.mjs` 扫描 100% 绿灯；
- **AC-4**: `pnpm sync` 物化后，`~/.omnimux-dev` 正式接入 `omnimux-apps`。
