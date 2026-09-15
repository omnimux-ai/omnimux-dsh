# Composer skill i18n & bilingual adaptive search — #1837

## 1. Objective（目标）
用户已批准：对话输入框斜杠技能检索支持多语言自适应。中文语言环境下，输入中文名称（如 `/角色`、`/一致性`）、拼音或英文原代号，均能智能匹配并优先呈现中文显示名；回车或点击选中后回填标准英文代号，保证底层模型与工具执行引擎 100% 兼容。在英文语言环境下，保留原生英文显示与检索规则。

### 精确验收标准
1. **中英文双向匹配覆盖度**：
   - 技能具备中文显示名（如「角色一致性形象包」）时，输入 `/角色`、`/形象`、`/一致性` 均能精确或模糊命中，分值显著高于无关项；
   - 输入拼音全拼 `/jiaose` 或首字母 `/js`，能命中该技能；
   - 输入英文原生代号 `/ip` 或 `/character`，仍能稳定命中且不丢失既有英文补全能力；
   - 切换为英文语言（`en`）时，候选列表主标题还原为原生英文标识符。
2. **菜单项展示结构**：
   - 中文语言下，候选菜单第一行（主标题）展示加粗中文显示名；第二行（描述）展示 `[英文代号] · 简要说明`；
   - 英文语言下，展示英文代号与英文描述。
3. **回填与执行契约**：
   - 选中候选后，输入框上屏填入 `/${candidate.rawName} `（如 `/ip-character-consistency-studio `），与官方原生 `dsh-tool-skill` 期望的 plain text 完全一致，避免破坏后端执行。
4. **架构非侵入性**：
   - 仅在 `plugins/omnimux` 客户端生态内通过服务包装实现，严禁修改官方核心库代码。

## 2. Commands（命令）
在本任务工作树根执行：
- `git diff --check`
- `node --test plugins/omnimux/src/client/composer-commands-i18n.test.js`
- `pnpm --filter omnimux test`
- `pnpm --filter omnimux build`

## 3. Project Structure（项目结构）
- `plugins/omnimux/src/client/composer-commands-i18n.js`：斜杠命令与技能国际化增强逻辑主文件。
- `plugins/omnimux/src/client/composer-commands-i18n.test.js`：对应的单元测试与回归测试。
- `plugins/omnimux/src/client/chrome.js`：客户端入口加载与安装装配点。

## 4. Code Style（代码风格）
保持仓库 ESM、单引号、无分号风格，遵循防御性编程，对 `undefined`、空对象及异常情况有完善的容错降级。
