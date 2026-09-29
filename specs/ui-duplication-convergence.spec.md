# 规格：OmniMux 全仓 UI 多路径实现与代码双轨收敛治理

- **版本**：1.0.0
- **负责人**：交付总监 齐活林
- **工作树**：`.worktrees/refactor-ui-duplication-convergence`
- **关联 Issue/PR**：UI 双轨实现与两套代码审计治理

---

## 1. 目标（Objective）

治理前序审计确认的 7 处 UI 多路径实现与功能重复两套代码，消除全仓代码分叉、幽灵代码驻留、维护割裂与构建体积虚胖问题：
1. **ModelPicker**：保留宿主快捷栏原生版，物理删除 `omnimux-market` 下残留的 564 行幽灵代码、catalog 及对应 CSS；
2. **Apps Workspace**：推进 `omnimux-apps` 独立微内核，剥离宿主已停挂的旧前端视图；
3. **MasonryGrid**：资产库 `omnimux-assets` 迁移至公共统一流式网格 `UnifiedLibraryGrid`，删除私有实现；
4. **VideoBreakdown**：视频镜头与台词解析及联动内核标准对齐，共享数据清洗与播放同步契约；
5. **CreateProductMenu**：商品库原生组件扩展 `label` 参数，资产库物理删除 98% 复制副本改为复用；
6. **RecommendationEngine**：保留灵感库 `omnimux-inspiration` 单一真源，删除宿主 252 行重复算法代码；
7. **ConfirmRemoveDialog**：三处业务内联调用 `dsh-ui-kit` 原生 `ConfirmModal`，废弃无意义的薄包装。

---

## 2. 成功标准（Success Criteria）

1. **代码物理精简**：物理删除 10 个以上冗余源码与死测试文件，净消除 ~70 KB 重复/僵尸代码。
2. **测试 100% 绿灯**：
   - `corepack pnpm --filter omnimux test` 全绿；
   - `corepack pnpm --filter omnimux-market test` 全绿；
   - `corepack pnpm --filter omnimux-assets test` 全绿；
   - `corepack pnpm --filter omnimux-products test` 全绿；
   - `corepack pnpm --filter omnimux-apps test` 全绿；
   - `corepack pnpm --filter omnimux-video-preview test` 全绿。
3. **构建验证**：受影响插件 `pnpm run build` 成功无 warning，`omnimux-market` 客户端构建体积减少 ~29 KB。
4. **功能等价性与零回退**：
   - 快捷栏模型选择器弹出、切换、模型锁定交互保持 100% 正常；
   - 资产库与商品库新建产品悬停菜单交互与视觉 100% 对齐；
   - 资产库瀑布流加载平滑，支持响应式列宽计算。

---

## 3. 可执行命令（Commands）

```bash
# 1. 验证各插件测试
corepack pnpm --filter omnimux-market test
corepack pnpm --filter omnimux test
corepack pnpm --filter omnimux-assets test
corepack pnpm --filter omnimux-products test
corepack pnpm --filter omnimux-video-preview test

# 2. 验证构建
corepack pnpm --filter omnimux-market run build
corepack pnpm --filter omnimux run build
corepack pnpm --filter omnimux-assets run build
corepack pnpm --filter omnimux-products run build
```

---

## 4. 边界（Boundaries）

- **ALWAYS**：
  - 严格保持用户端可见交互行为与界面文案一致性（零自创口号或装饰图标）；
  - 遵循单一真源（SSOT）原则；
  - 提交前全量运行受影响插件的自动化测试。
- **ASK FIRST**：
  - 更改对外公共 API 或协议契约。
- **NEVER**：
  - 破坏现有会话模型锁定（Session Model Pin）状态机与持久化契约；
  - 删改正在被正式引用的有效业务代码。
