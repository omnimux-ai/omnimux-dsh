# 规格说明：彻底移除对原生输入框边距与宽度的覆盖，完全保留 DSH 原生算法

## 1. 业务背景与问题根因
- **问题现象**：在会话栏中，由于插件历史样式中对 `[data-composer-card]` 强制赋予了 `width: 100%!important; max-width: 100%!important;` 以及对 `[data-composer-seat]` 和内容总栈的边距强制设定，导致官方底座的原生居中与边距算法失效。当右侧面板收起或进入全屏会话时，输入框被错误地无限横向拉满铺满全屏，破坏了宽屏视觉体验。
- **用户决策与诉求**：彻底排查并删除插件内对输入框宽度、最大宽度和边距算法的人工干涉代码，完全恢复并保留 DeepSeek Harness (DSH) 原生的输入框边距与自适应居中算法。
- **预期目标**：
  1. 全屏与普通状态下：输入框完全遵循原生宽度计算（`clamp(680px, 64%, 920px)`），在大屏下优雅居中，两侧留白自然展开，绝不无限拉大。
  2. 彻底清除冗余的人工边距注入规则，确保不会破坏原生任何阶段的布局表现。

## 2. 解决方案设计
在 `/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh-wt-restore-native-composer-spacing` 中：
1. **清理 `plugins/omnimux/src/client/composer-compact.js`**：
   - 移除无条件的 `[data-composer-card] { width: 100%!important; max-width: 100%!important; ... }`。
   - 移除无条件的 `[data-composer-seat] { padding-bottom: 12px!important; ... }`。
   - 移除无条件的 `[data-composer-seat] [class*="composerStack"] { width: calc(100% - 24px)!important; ... }`。
   - 移除强制覆盖的 `--dsh-chat-content-width: min(...)`，交回官方原生变量算法。
   - 移除针对非全屏模式所增加的强制满宽与 padding: 25px 覆盖规则。
   - 恢复迎宾头左右定位至官方默认的 24px。
2. **清理 `plugins/omnimux/src/client/session-guide/styles.js`**：
   - 恢复非全屏紧凑模式下的默认定义，不给输入框座席或卡片追加多余的强制 padding 与满宽样式。
3. **测试保障**：
   - 更新 `plugins/omnimux/src/client/composer-compact.test.js` 和端到端校验测试，确保断言与原生行为保持一致。
