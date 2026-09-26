import React, { useEffect, useRef, useState } from 'react';
import { PRESET_REFERENCE_ASSETS, REFERENCE_TABS } from './reference-constants.js';
import { readDuration } from './MediaSlotGroup.jsx';

/**
 * 图 3「选择参考面板」
 * 位于输入框正上方 8px 弹出，包含 4 个 Tab（上传资产、AI 生成、数字人、商品）与「只看我的」，
 * 首格固定「从本地上传」，点击卡片填入目标卡槽并关闭面板。
 */
export function ReferencePickerPopover({
  open = false,
  onClose,
  onSelectAsset,
  targetSlot,
  onError,
}) {
  const [activeTab, setActiveTab] = useState('upload');
  const [onlyMine, setOnlyMine] = useState(false);
  const fileInputRef = useRef(null);
  const panelRef = useRef(null);
  const pendingBlobUrlRef = useRef(null);
  const selectingRef = useRef(false);

  useEffect(() => {
    return () => {
      if (pendingBlobUrlRef.current) {
        URL.revokeObjectURL(pendingBlobUrlRef.current);
        pendingBlobUrlRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const handleKeyDown = (e) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      e.preventDefault();
      e.stopPropagation();
      onClose?.();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const currentList = PRESET_REFERENCE_ASSETS[activeTab] || [];
  const displayList = onlyMine ? currentList.filter((item) => item.isMine ?? true) : currentList;

  const handleLocalUpload = async (e) => {
    if (selectingRef.current) return;
    selectingRef.current = true;
    let blobUrl = null;
    let accepted = false;
    try {
      const files = e.target?.files;
      if (files && files[0]) {
        const file = files[0];
        blobUrl = URL.createObjectURL(file);
        pendingBlobUrlRef.current = blobUrl;
        const isVideo = file.type.startsWith('video/');
        const isAudio = file.type.startsWith('audio/');
        let duration;
        if (isVideo || isAudio) {
          duration = await readDuration(file);
        }

        const localId = `local_${Date.now()}`;
        const asset = {
          id: localId,
          name: file.name,
          title: file.name,
          url: blobUrl,
          file,
          type: isVideo ? 'video' : (isAudio ? 'audio' : 'image'),
          duration: Number.isFinite(duration) ? duration : undefined,
          isMine: true,
        };
        const result = onSelectAsset ? onSelectAsset(asset, targetSlot) : false;
        accepted = result instanceof Promise ? await result : result;
        if (accepted === true) {
          // 本地上传 Object URL 所有权完全移交给卡槽状态机托管，本地清除引用
          blobUrl = null;
          pendingBlobUrlRef.current = null;
          onClose?.();
        } else {
          // 明确拒绝或入槽失败时由本地释放
          if (blobUrl) {
            URL.revokeObjectURL(blobUrl);
            blobUrl = null;
          }
          pendingBlobUrlRef.current = null;
        }
      }
    } catch (err) {
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
        blobUrl = null;
      }
      pendingBlobUrlRef.current = null;
      onError?.('本地素材上传失败，请重试或选择其他文件');
      console.warn?.('[ReferencePickerPopover] handleLocalUpload failed:', err);
    } finally {
      selectingRef.current = false;
      if (accepted !== true && blobUrl) {
        URL.revokeObjectURL(blobUrl);
        blobUrl = null;
        pendingBlobUrlRef.current = null;
      }
      if (e?.target) {
        e.target.value = '';
      }
    }
  };

  const handlePresetSelect = async (asset) => {
    if (selectingRef.current) return;
    selectingRef.current = true;
    try {
      const result = onSelectAsset ? onSelectAsset(asset, targetSlot) : false;
      const accepted = result instanceof Promise ? await result : result;
      if (accepted === true) {
        onClose?.();
      }
    } catch (err) {
      onError?.('素材入槽失败，请重试');
      console.warn?.('[ReferencePickerPopover] preset asset selection failed:', err);
    } finally {
      selectingRef.current = false;
    }
  };

  return (
    <div className="omx-ref-picker-popover" ref={panelRef} role="dialog" aria-label="选择参考素材" tabIndex={-1}>
      {/* 顶栏：Tab 选项卡 + 右侧「只看我的」与关闭按钮 */}
      <div className="omx-ref-picker-header">
        <div className="omx-ref-picker-tabs" role="tablist">
          {REFERENCE_TABS.map((tab) => (
            <button // exempt-ui01: 浮层内的分类 Tab
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              className={`omx-ref-picker-tab${activeTab === tab.id ? ' is-active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="omx-ref-picker-actions">
          <div className="omx-ref-picker-filter-mine">
            <span
              id="omx-ref-picker-filter-mine-label"
              className="omx-ref-picker-filter-text"
            >
              只看我的
            </span>
            <button // exempt-ui01: 极简开关组件
              type="button"
              role="switch"
              aria-checked={onlyMine}
              aria-labelledby="omx-ref-picker-filter-mine-label"
              className={`omx-ref-picker-switch${onlyMine ? ' is-checked' : ''}`}
              onClick={() => setOnlyMine(!onlyMine)}
            >
              <span className="omx-ref-picker-switch-thumb" />
            </button>
          </div>

          <button // exempt-ui01: 浮层关闭按钮
            type="button"
            className="omx-ref-picker-close-btn"
            title="关闭面板 (Esc)"
            aria-label="关闭"
            onClick={onClose}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      {/* 内容网格：首格固定从本地上传，后跟资产卡片 */}
      <div className="omx-ref-picker-body">
        <div className="omx-ref-picker-grid">
          {/* 首格固定：从本地上传 */}
          <button // exempt-ui01: 上传素材触发卡片
            type="button"
            className="omx-ref-picker-upload-card"
            onClick={() => fileInputRef.current?.click()}
          >
            <div className="omx-ref-picker-upload-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            </div>
            <span className="omx-ref-picker-upload-text">从本地上传</span>
          </button>

          {/* 预置素材卡片列表 */}
          {displayList.map((asset) => (
            <div
              key={asset.id}
              className="omx-ref-picker-asset-card"
              role="button"
              tabIndex={0}
              onClick={() => handlePresetSelect(asset)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handlePresetSelect(asset);
                }
              }}
            >
              <div className="omx-ref-picker-asset-thumb">
                <img src={asset.url} alt={asset.title} />
              </div>
              <div className="omx-ref-picker-asset-title" title={asset.title}>
                {asset.title}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 隐藏的本地文件上传 input */}
      <input
        ref={fileInputRef}
        type="file"
        style={{ display: 'none' }}
        accept={targetSlot?.type === 'video' ? 'video/*' : targetSlot?.type === 'audio' ? 'audio/*' : 'image/*'}
        onChange={handleLocalUpload}
      />
    </div>
  );
}

export default ReferencePickerPopover;
