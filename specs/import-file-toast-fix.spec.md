# 本地素材导入：去重错误提示与二次弹窗修复

## 目标（Objective）
用户反馈：在「素材」弹窗点「导入文件」，第一次没有任何反应，要再点一次才出「部分文件类型不受支持，已跳过」提示。要求：
- 第一次点击即可正确导入；
- 取消或失败时不出现重复的「不受支持」警告；
- 支持常见图片/视频/音频扩展名的文件能一次成功。

## 用户关键操作旅程
1. 用户打开素材弹窗（画布 / 本地两个 Tab）；
2. 点「导入文件」→ 系统文件选择器只弹一次；
3. 选支持的文件 → 立即出现在本地素材列表；
4. 选不支持的文件 → 只提示一次「不受支持」；
5. 取消选择 → 无警告、无重复弹窗。

## 验收标准
- `pnpm --filter omnimux-workflow test` 通过；
- `node --test plugins/omnimux-workflow/src/canvas/editor/components/ResourcePickerModal/ResourcePickerModal.test.mjs` 通过；
- 手动：点「导入文件」一次 → 选中 PNG/MP4 → 无二次弹窗、无「不受支持」；
- 手动：点「导入文件」→ 取消 → 无警告；
- 手动：选 `.xyz` → 只提示一次「不受支持」。

## 现状与根因
`LocalUploadPane.tsx`：
- `ingestPaths` 在 `filtered.length===0` 时连续两次 `toast.warning` → 同一条「不受支持」出现两次；
- `handleInputChange` 在 `File.path` 为空（新版 Electron 或浏览器模式）时静默触发 `chooseNative()` → 再弹一次 osascript；
- `chooseNative()` 取消后 `paths=[]` 又触发 unsupported → 「不受支持」。

修复：
- `ingestPaths` 早退 `!paths.length`；
- `handleInputChange` 无 `nativePathOf` 时不再静默重开 osascript，直接按「无法获取路径」提示 `picker.needPath`。

## 边界
- 不改系统选择器本身行为；
- 不引入新文件类型；
- 配套把 `asyncImports.runtime.test.mjs` 里「无 `File.path` 时调起 `chooseNative`」的用例改为「仅提示一次 `picker.needPath`，不再发起原生选择器」。
