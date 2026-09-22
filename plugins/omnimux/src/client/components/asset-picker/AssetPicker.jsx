import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button, ModalDialog } from 'dsh-ui-kit';
import { AssetPickerCard, ASSET_CARD_CSS } from './AssetPickerCard.jsx';
import { AssetPickerAddCard } from './AssetPickerAddCard.jsx';
import { AssetAddModal, ASSET_TYPE_KEYS } from './AssetAddModal.jsx';
import { ASSET_CATEGORIES, isAlreadyAdded, remainingQuota, toggleSelect } from './picker-model.js';
import {
  PICKER_DIALOG_VARIANT_CLASS,
  PICKER_LAYOUTS,
  ensurePickerDialogStyles,
  pickerDialogClassName,
  pickerDialogWidth,
} from '../picker-dialog/pickerDialogContract.js';
import {
  PickerHeaderTabs,
  PickerToolbar,
  PickerFilterPills,
  PickerSearchInput,
  PickerFooter,
} from '../picker-dialog/index.js';
import { ModalCloseButton } from '../ModalCloseButton.jsx';

const STYLE_ID = 'omx-composer-add-asset-picker';

const CSS = `
/* 顶部 Tab 单层顶栏：宽度 = 6 列高密度微卡 + 5 个列间距（由契约推导）。
   变量必须挂在弹窗自身的变体类上——挂到 .omx-asset-pick（子元素）上，父元素读不到，会退化为兜底列数。 */
.${PICKER_DIALOG_VARIANT_CLASS.assets} {
  --omnimux-pick-dialog-width: ${pickerDialogWidth(PICKER_LAYOUTS.assets)};
}
.omx-asset-pick {
  display: flex; flex-direction: column; width: 100%; height: 480px; min-height: 0;
  max-height: calc(80vh - 190px);
  box-sizing: border-box;
}
.omx-asset-pick__header {
  flex: none; display: flex; align-items: center; justify-content: flex-start;
  padding: 16px 24px 0;
}
.omx-asset-pick__tabs {
  display: flex; align-items: center; gap: 24px;
}
.omx-asset-pick__tab {
  appearance: none; background: transparent; border: none; cursor: pointer;
  font: inherit; font-size: 16px; font-weight: 500; color: var(--dsw-alias-label-tertiary);
  padding: 4px 0 10px; position: relative; transition: color 0.15s ease;
  white-space: nowrap;
}
.omx-asset-pick__tab:hover,
.omx-asset-pick__tab[data-active="true"] { color: var(--dsw-alias-label-primary); }
.omx-asset-pick__tab[data-active="true"] { font-weight: 600; }
.omx-asset-pick__tab[data-active="true"]::after {
  content: ''; position: absolute; left: 0; right: 0; bottom: 0; height: 2px;
  background: var(--dsw-alias-label-primary); border-radius: 2px;
}
.omx-asset-pick__toolbar {
  flex: none; display: flex; align-items: center; justify-content: space-between;
  padding: 14px 24px 12px; gap: 16px;
}
.omx-asset-pick__filter-pills {
  display: flex; align-items: center; gap: 8px; overflow-x: auto;
  scrollbar-width: none;
}
.omx-asset-pick__filter-pills::-webkit-scrollbar { display: none; }
.omx-asset-pick__pill {
  appearance: none; background: var(--dsw-alias-bg-layer-3);
  border: 1px solid var(--dsw-alias-border-l2); border-radius: 999px;
  padding: 4px 12px; font-size: 13px; line-height: 18px;
  color: var(--dsw-alias-label-secondary); cursor: pointer; white-space: nowrap;
  transition: all 0.15s ease;
}
.omx-asset-pick__pill:hover {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
}
.omx-asset-pick__pill[data-active="true"] {
  background: var(--dsw-alias-interactive-bg-active);
  border-color: transparent;
  color: var(--dsw-alias-label-primary);
  font-weight: 600;
}
.omx-asset-pick__search-wrap {
  position: relative; display: flex; align-items: center; width: 220px; flex-shrink: 0;
}
.omx-asset-pick__search-icon {
  position: absolute; left: 12px; color: var(--dsw-alias-label-tertiary);
  pointer-events: none; display: flex; align-items: center;
}
.omx-asset-pick__search-input {
  width: 100%; height: 32px; border-radius: 999px;
  border: 1px solid var(--dsw-alias-border-l2);
  background: transparent;
  padding: 0 30px 0 32px; font-size: 13px; color: var(--dsw-alias-label-primary);
  outline: none; transition: border-color 0.15s ease, box-shadow 0.15s ease;
  box-sizing: border-box;
}
.omx-asset-pick__search-input::placeholder { color: var(--dsw-alias-label-tertiary); }
.omx-asset-pick__search-input:focus {
  border-color: var(--dsw-alias-label-primary);
  box-shadow: 0 0 0 1px var(--dsw-alias-label-primary);
}
.omx-asset-pick__search-clear {
  position: absolute; right: 10px; appearance: none; border: none;
  background: transparent; color: var(--dsw-alias-label-tertiary);
  cursor: pointer; padding: 2px; border-radius: 4px; display: flex;
}
.omx-asset-pick__search-clear:hover { color: var(--dsw-alias-label-primary); }
.omx-asset-pick__scroll {
  flex: 1; overflow-y: auto; padding: 0 24px; min-height: 0;
}
.omx-asset-pick__grid {
  display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 16px;
}
.omx-asset-pick__empty {
  border: 1px dashed var(--dsw-alias-border-l4); border-radius: 12px; min-height: 200px;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px;
  color: var(--dsw-alias-label-tertiary); font-size: 13px; padding: 24px; text-align: center;
}
/* 页脚恒为「按钮右下对齐」：左侧提示是条件渲染的，用 space-between 时单子项会被推到行首 */
.omx-asset-pick__footer {
  display: flex; align-items: center; justify-content: flex-end; gap: 16px; width: 100%;
  box-sizing: border-box; padding: 2px 0;
}
.omx-asset-pick__meta {
  margin-right: auto; min-width: 0; font-size: 13px; color: var(--dsw-alias-label-secondary);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.omx-asset-pick__actions {
  display: flex; align-items: center; gap: 10px; flex-shrink: 0;
}
.omx-asset-pick__error {
  color: var(--dsw-alias-state-error-primary); font-size: 12px; margin: 0 24px 8px;
}
.omx-asset-add-form { display: flex; flex-direction: column; gap: 12px; }
.omx-asset-add-name-row { display: flex; align-items: center; gap: 8px; }
.omx-asset-add-at { color: var(--dsw-alias-label-tertiary); font-size: 18px; }
.omx-asset-add-name-field { flex: 1; min-width: 0; }
.omx-asset-add-type-row { display: flex; align-items: center; gap: 8px; }
.omx-asset-add-type-sep { color: var(--dsw-alias-border-l2); }
.omx-asset-add-desc-field { flex: 1; min-width: 0; }
.omx-asset-add-drop {
  width: 100%; min-height: 128px; border: 1px dashed var(--dsw-alias-border-l4);
  border-radius: 12px; background: transparent; color: var(--dsw-alias-label-tertiary);
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 10px; font-size: 13px; padding: 16px; box-sizing: border-box;
}
.omx-asset-add-drop-actions { display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; }
.omx-asset-add-filelist {
  margin: 10px 0 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 4px;
}
.omx-asset-add-filelist li {
  display: flex; gap: 8px; font-size: 12px; color: var(--dsw-alias-label-secondary); align-items: center;
}
.omx-asset-add-filelist-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.omx-asset-add-tags-wrap { margin-top: 8px; }
.omx-asset-add-tags { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
.omx-asset-add-tag {
  font-size: 12px; padding: 2px 8px; border-radius: 999px;
  background: var(--dsw-alias-bg-module-platform); display: inline-flex; align-items: center; gap: 4px;
}
.omx-asset-add-error { color: var(--dsw-alias-state-error-primary); font-size: 12px; margin-top: 4px; }
${ASSET_CARD_CSS}
`;

function ensureStyles(doc = (typeof document !== 'undefined' ? document : null)) {
  ensurePickerDialogStyles(doc);
  if (!doc || doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  doc.head?.appendChild(style);
}

function interpolate(template, vars) {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, key) => (vars[key] == null ? '' : String(vars[key])));
}

/** 内置 zh-CN 兜底文案（调用方通常注入宿主 t） */
const DEFAULT_STRINGS = {
  'composerAdd.fromLibrary': '从资产库选择',
  'composerAdd.cancel': '取消',
  'composerAdd.confirm': '确认添加',
  'composerAdd.categories': '资产分类',
  'composerAdd.cat.all': '全部',
  'composerAdd.cat.character': '角色',
  'composerAdd.cat.scene': '场景',
  'composerAdd.cat.style': '风格包',
  'composerAdd.cat.prop': '道具',
  'composerAdd.cat.knowledge': '知识包',
  'composerAdd.cat.custom': '自定义',
  'composerAdd.searchPlaceholder': '搜索资产名称、描述、标签…',
  'composerAdd.selectedMeta': '已选 {n} 项 · 还可添加 {m} 项',
  'composerAdd.selectedMetaUnbounded': '已选 {n} 项',
  'composerAdd.loading': '正在加载资产库…',
  'composerAdd.empty': '资产库还是空的。先去导入素材，再回到这里添加。',
  'composerAdd.emptySearch': '未找到匹配的资产。请尝试更换关键词或筛选条件。',
  'composerAdd.goLibrary': '去资产库导入',
  'composerAdd.libraryTitle': '资产库',
  'composerAdd.alreadyAdded': '已在会话中',
  'composerAdd.missing': '素材缺失',
  'composerAdd.addAsset': '添加资产',
  'composerAdd.addAssetDesc': '本地素材入库',
  'composerAdd.addAssetModalTitle': '添加资产',
  'composerAdd.submitAdd': '添加资产',
  'composerAdd.namePlaceholder': '资产名称',
  'composerAdd.descPlaceholder': '输入资产特征描述，便于 Agent 精准检索与复用…',
  'composerAdd.dropHint': '拖拽文件或文件夹至此，或点击浏览',
  'composerAdd.pickFiles': '选择文件',
  'composerAdd.pickFolders': '选择文件夹',
  'composerAdd.folderBadge': '文件夹',
  'composerAdd.removeFile': '移除',
  'composerAdd.addTagsOptional': '添加标签 (可选)',
  'composerAdd.removeTag': '删除标签',
  'composerAdd.tagPlaceholder': '输入标签后按回车添加',
};

function defaultT(key, vars) {
  return interpolate(DEFAULT_STRINGS[key] || key, vars);
}

async function defaultFetchAssets() {
  const response = await fetch('/omnimux/assets/library');
  let json = {};
  try {
    json = await response.json();
  } catch {
    json = {};
  }
  if (!response.ok) throw new Error(json.message || json.error || `HTTP ${response.status}`);
  return Array.isArray(json.assets) ? json.assets : [];
}

/**
 * 纯受控资产多选选择器（共享组件）：不负责确认后去向，不持 hub 内部依赖。
 * @param {{
 *   open: boolean,
 *   onClose: () => void,
 *   t?: (key: string, vars?: object) => string,
 *   title?: string,
 *   fetchAssets?: () => Promise<object[]>,
 *   categories?: string[],
 *   maxSelect?: number,
 *   occupied?: number,
 *   alreadyIds?: Set<string> | string[],
 *   onConfirm: (assets: object[]) => void | Promise<void>,
 *   closeOnConfirm?: boolean,
 *   emptyAction?: { label: string, onClick: () => void },
 *   onPick?: (kind: 'file' | 'directory') => Promise<string[]>,
 *   onCreateAsset?: (payload: object) => Promise<object>,
 * }} props
 */
export function AssetPicker({
  open,
  onClose,
  t,
  title,
  fetchAssets,
  categories,
  maxSelect,
  occupied = 0,
  alreadyIds,
  onConfirm,
  closeOnConfirm = true,
  emptyAction,
  onPick,
  onCreateAsset,
}) {
  const tt = typeof t === 'function' ? t : defaultT;
  const [category, setCategory] = useState('all');
  const [activeTag, setActiveTag] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [autoPick, setAutoPick] = useState(false);
  const requestRevision = useRef(0);
  const openRevision = useRef(0);
  const previousOpen = useRef(open);
  if (previousOpen.current !== open) {
    previousOpen.current = open;
    openRevision.current += 1;
  }

  useEffect(() => {
    ensureStyles();
  }, []);

  useEffect(() => {
    if (!open) {
      requestRevision.current += 1;
      setBusy(false);
      setAddModalOpen(false);
      setAutoPick(false);
      return undefined;
    }
    const revision = requestRevision.current + 1;
    requestRevision.current = revision;
    setCategory('all');
    setActiveTag('all');
    setSearchQuery('');
    setSelected(new Set());
    setError('');
    setAddModalOpen(false);
    setAutoPick(false);
    setLoading(true);
    Promise.resolve()
      .then(() => (fetchAssets || defaultFetchAssets)())
      .then((rows) => {
        if (requestRevision.current === revision) setAssets(Array.isArray(rows) ? rows : []);
      })
      .catch((caught) => {
        if (requestRevision.current === revision) {
          setError(caught instanceof Error ? caught.message : String(caught));
        }
      })
      .finally(() => {
        if (requestRevision.current === revision) setLoading(false);
      });
    return () => {
      if (requestRevision.current === revision) requestRevision.current += 1;
    };
  }, [open, fetchAssets]);

  const tabs = useMemo(
    () => ['all', ...(Array.isArray(categories) && categories.length > 0 ? categories : ASSET_CATEGORIES)],
    [categories],
  );

  const availableTags = useMemo(() => {
    const set = new Set();
    for (const a of assets) {
      if (Array.isArray(a?.tags)) {
        for (const tag of a.tags) {
          if (typeof tag === 'string' && tag.trim()) set.add(tag.trim());
        }
      }
    }
    return Array.from(set).slice(0, 8);
  }, [assets]);

  const filteredAssets = useMemo(() => {
    let list = assets;
    if (category !== 'all') {
      list = list.filter((row) => row && row.type === category);
    }
    if (activeTag && activeTag !== 'all') {
      list = list.filter((row) => Array.isArray(row?.tags) && row.tags.includes(activeTag));
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter((row) => {
        if (!row) return false;
        const name = (row.name || '').toLowerCase();
        const desc = (row.description || '').toLowerCase();
        const id = (row.id || '').toLowerCase();
        const tags = Array.isArray(row.tags) ? row.tags.join(' ').toLowerCase() : '';
        return name.includes(q) || desc.includes(q) || id.includes(q) || tags.includes(q);
      });
    }
    return list;
  }, [assets, category, activeTag, searchQuery]);

  const max = maxSelect === undefined || maxSelect === null ? Infinity : Number(maxSelect);
  const quota = remainingQuota({ occupied, selectedCount: selected.size, max });

  const confirm = async () => {
    if (busy) return;
    const selectedIds = new Set(selected);
    const picked = assets.filter((row) => selectedIds.has(row.id) && !isAlreadyAdded(alreadyIds || [], row.id));
    const currentQuota = remainingQuota({ occupied, selectedCount: 0, max });
    if (picked.length === 0 || currentQuota.remaining === 0) return;
    const accepted = picked.slice(0, currentQuota.remaining);
    if (accepted.length === 0) return;
    const ownerRevision = openRevision.current;
    setBusy(true);
    try {
      await onConfirm(accepted);
      if (closeOnConfirm && open && openRevision.current === ownerRevision) onClose();
    } catch (caught) {
      if (openRevision.current === ownerRevision) {
        setError(caught instanceof Error ? caught.message : String(caught));
      }
    } finally {
      if (openRevision.current === ownerRevision) setBusy(false);
    }
  };

  const handleOpenAddModal = () => {
    setAutoPick(true);
    setAddModalOpen(true);
  };

  const handleAssetCreated = (createdAsset) => {
    if (!createdAsset || !createdAsset.id) return;
    setAssets((prev) => [createdAsset, ...prev.filter((item) => item.id !== createdAsset.id)]);
    const currentQuota = remainingQuota({ occupied, selectedCount: selected.size, max });
    if (currentQuota.remaining > 0) {
      setSelected((prev) => new Set([...prev, createdAsset.id]));
    }
  };

  const metaKey = Number.isFinite(max) ? 'composerAdd.selectedMeta' : 'composerAdd.selectedMetaUnbounded';

  return (
    <ModalDialog
      open={open}
      onClose={onClose}
      title={title || tt('composerAdd.fromLibrary')}
      size="lg"
      className={pickerDialogClassName('assets')}
      closeLabel={tt('composerAdd.cancel')}
      footer={
        <PickerFooter
          className="omx-asset-pick__footer"
          metaClassName="omx-asset-pick__meta"
          actionsClassName="omx-asset-pick__actions"
          meta={interpolate(tt(metaKey), { n: selected.size, m: quota.remaining })}
          cancelLabel={tt('composerAdd.cancel')}
          confirmLabel={tt('composerAdd.confirm')}
          onCancel={onClose}
          onConfirm={() => {
            void confirm();
          }}
          confirmDisabled={busy || selected.size === 0}
          busy={busy}
        />
      }
    >
      <div className="omx-asset-pick">
        {/* 全局统一：弹窗外侧右上方圆形关闭按钮（ModalCloseButton external） */}
        <ModalCloseButton onClose={onClose} placement="external" ariaLabel={tt('composerAdd.cancel')} />

        {/* 单层顶栏：Tab 顶替传统标题栏 */}
        <PickerHeaderTabs
          tabs={tabs.map((id) => ({
            id,
            label: tt(id === 'all' ? 'composerAdd.cat.all' : `composerAdd.cat.${id}`),
          }))}
          activeTab={category}
          onTabChange={setCategory}
          ariaLabel={tt('composerAdd.categories')}
          className="omx-asset-pick__tabs"
          tabClassName="omx-asset-pick__tab"
          headerClassName="omx-asset-pick__header"
        />

        {/* 次级工具栏：左侧分类/标签胶囊，右侧紧凑搜索框 */}
        <PickerToolbar className="omx-asset-pick__toolbar">
          <PickerFilterPills
            pills={[
              { id: 'all', label: tt('composerAdd.cat.all') || '全部' },
              ...availableTags.map((tag) => ({ id: tag, label: tag })),
            ]}
            activePill={activeTag}
            onPillChange={setActiveTag}
            className="omx-asset-pick__filter-pills"
            pillClassName="omx-asset-pick__pill"
          />

          <PickerSearchInput
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder={tt('composerAdd.searchPlaceholder')}
            className="omx-asset-pick__search-wrap"
            inputClassName="omx-asset-pick__search-input"
            iconClassName="omx-asset-pick__search-icon"
            clearClassName="omx-asset-pick__search-clear"
          />
        </PickerToolbar>

        {error ? <div className="omx-asset-pick__error">{error}</div> : null}

        <div className="omx-asset-pick__scroll">
          {loading ? (
            <div className="omx-asset-pick__empty">{tt('composerAdd.loading')}</div>
          ) : !searchQuery.trim() ? (
            <div className="omx-asset-pick__grid">
              <AssetPickerAddCard
                label={tt('composerAdd.addAsset')}
                desc={tt('composerAdd.addAssetDesc')}
                onClick={handleOpenAddModal}
              />
              {filteredAssets.map((asset) => {
                const already = isAlreadyAdded(alreadyIds || [], asset.id);
                const isSelected = selected.has(asset.id);
                const disableNew =
                  !isSelected &&
                  !already &&
                  remainingQuota({ occupied, selectedCount: selected.size, max }).remaining === 0;
                return (
                  <AssetPickerCard
                    key={asset.id}
                    asset={asset}
                    selected={isSelected}
                    alreadyAdded={already}
                    disabled={disableNew}
                    typeLabel={tt(`composerAdd.cat.${asset.type || 'custom'}`)}
                    alreadyLabel={tt('composerAdd.alreadyAdded')}
                    missingLabel={tt('composerAdd.missing')}
                    onToggle={(row) => {
                      const next = toggleSelect({
                        selected,
                        id: row.id,
                        occupied,
                        alreadyIds,
                        max,
                      });
                      setSelected(next.selected);
                    }}
                  />
                );
              })}
            </div>
          ) : filteredAssets.length === 0 ? (
            <div className="omx-asset-pick__empty">
              <p>{tt('composerAdd.emptySearch')}</p>
            </div>
          ) : (
            <div className="omx-asset-pick__grid">
              {filteredAssets.map((asset) => {
                const already = isAlreadyAdded(alreadyIds || [], asset.id);
                const isSelected = selected.has(asset.id);
                const disableNew =
                  !isSelected &&
                  !already &&
                  remainingQuota({ occupied, selectedCount: selected.size, max }).remaining === 0;
                return (
                  <AssetPickerCard
                    key={asset.id}
                    asset={asset}
                    selected={isSelected}
                    alreadyAdded={already}
                    disabled={disableNew}
                    typeLabel={tt(`composerAdd.cat.${asset.type || 'custom'}`)}
                    alreadyLabel={tt('composerAdd.alreadyAdded')}
                    missingLabel={tt('composerAdd.missing')}
                    onToggle={(row) => {
                      const next = toggleSelect({
                        selected,
                        id: row.id,
                        occupied,
                        alreadyIds,
                        max,
                      });
                      setSelected(next.selected);
                    }}
                  />
                );
              })}
            </div>
          )}
        </div>
      </div>

      <AssetAddModal
        open={addModalOpen}
        presetType={category !== 'all' && ASSET_TYPE_KEYS.includes(category) ? category : 'character'}
        autoPick={autoPick}
        t={tt}
        onClose={() => {
          setAddModalOpen(false);
          setAutoPick(false);
        }}
        onPick={onPick}
        onSubmit={onCreateAsset}
        onSuccess={handleAssetCreated}
      />
    </ModalDialog>
  );
}
