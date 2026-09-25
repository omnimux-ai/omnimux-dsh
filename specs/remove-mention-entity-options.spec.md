# 《输入框 @ 菜单冗余角色/产品入口移除与加号资产链路保障规格说明书（Spec Plan）》

> **任务编号**：Issue #2660  
> **负责人**：齐活林（主理人） / 许清楚（产品经理） / 裴像素（前端开发）  
> **状态**：APPROVED / 唯一真源（Single Source of Truth）  
> **关联文件**：`specs/remove-mention-entity-options.spec.md`

---

## 一、背景与目标（Objective）

### 1.1 业务背景与用户反馈
用户明确指示：
> “把@ 菜单中新增的 角色/产品库 两个固定的选项入口和相关业务逻辑移除。因为我发现它和+号的添加资产库 产品库 灵感库 有冲突 相当于有两个入口 保留+号的全套业务逻辑。完成后合并物化更新收尾”

### 1.2 目标定位
1. **彻底移除 `@` 菜单中的「角色」与「产品」固定入口**：
   - 彻底删除 `entityCategoryCandidates`、`ENTITY_CATEGORY_CHARACTER_VALUE`、`ENTITY_CATEGORY_PRODUCT_VALUE` 及相关逻辑；
   - 移除 `@` 菜单一级选项中的角色/产品匹配、右侧伪元素展开箭头与左侧图标伪元素；
   - 移除二级子菜单的生命周期（`mountEntitySubmenu`、`unmountEntitySubmenu`、`scheduleCloseEntitySubmenu` 等）及对应悬停/点击交互事件；
   - 删除临时二级子菜单组件 `EntityMentionSubmenu.tsx`。
2. **保持 `@` 素材引用的单一职责**：
   - `@` 菜单仅展示当前卡槽中实际已添加的普通素材（图片、视频、音频、文档、表格、资产、商品等）；
   - 卡槽中没有素材时，`@` 菜单不展示空的素材分类。
3. **严格保障输入框底部加号（`+`）菜单的全套业务逻辑完好**：
   - `+` 菜单中的「从资产库选择」、「从商品库选择」、「从灵感库选择」及其对接到右侧素材工作台（Asset Hub / Third Column）的全链路逻辑 100% 保持稳定完好；
   - 点击加号后展开右栏对应 Tab、选择素材后写入 `AttachmentStore` 并追加提示词的流程不受任何影响。

---

## 二、命令与测试策略（Commands & Testing Strategy）

### 2.1 验证命令
- **单元测试**：
  ```bash
  node --test plugins/omnimux/src/client/attachments/material-mention.test.js
  node --test plugins/omnimux/src/client/attachments/store.test.ts
  node --test plugins/omnimux/src/client/attachments/entityMention.e2e.test.ts
  ```
- **加号全链路测试**：
  ```bash
  node --test plugins/omnimux/src/client/composer-add/*.test.js
  ```
- **全量门禁检查**：
  ```bash
  npm run test:attachments
  ```

---

## 三、代码改动清单（Project Structure）

1. `plugins/omnimux/src/client/attachments/materialMentionSource.ts`：
   - 移除 `entityCategoryCandidates`、`isEntityCategoryRef`、`ENTITY_CATEGORY_*`；
   - `candidates` 仅返回 `materialCandidates`；
   - `lexicon` 移除 `'角色', '产品'`；
   - `onPick` 移除分类入口拦截。
2. `plugins/omnimux/src/client/composer-compact.js`：
   - 移除 `entityCategoryCandidates` 引用；
   - 移除 `ENTITY_LABEL_CHARACTER` / `ENTITY_LABEL_PRODUCT`；
   - 移除二级菜单生命周期函数与事件监听；
   - 移除 `[data-omnimux-entity-category]` CSS 与 DOM 属性；
   - 恢复无分类项偏移的素材索引映射。
3. `plugins/omnimux/src/client/attachments/styles.css`：
   - 移除 `[data-omnimux-entity-category]` 伪元素样式规则。
4. `plugins/omnimux/src/client/attachments/EntityMentionSubmenu.tsx`：
   - 安全删除文件。
5. `plugins/omnimux/src/client/attachments/entityMention.e2e.test.ts`：
   - 更新测试用例：断言 `@` 菜单仅含已加入素材，不含角色/产品入口，不挂载二级菜单，且 `+` 菜单全链路完好。

---

## 四、验收标准（Success Criteria）

- [x] **AC-1**：键入 `@` 呼出菜单时，候选项列表中绝不包含「角色」与「产品」固定入口。
- [x] **AC-2**：键入 `@` 呼出菜单时，绝不挂载、渲染或弹出任何二级子菜单浮层。
- [x] **AC-3**：当输入框卡槽中已加入素材时，键入 `@` 能正常展示并引用素材。
- [x] **AC-4**：输入框底部 `+` 菜单点击「从资产库选择」、「从商品库选择」、「从灵感库选择」正常联动右栏工作台，全套业务逻辑 100% 完好。
- [x] **AC-5**：全量单元测试与 E2E 契约测试 100% 通过，无回归缺陷。
