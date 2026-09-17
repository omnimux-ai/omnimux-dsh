import React, { useEffect, useRef, useState } from 'react';
import { Badge, Button, DropdownSelect, IconButton, InputField, ModalDialog } from 'dsh-ui-kit';
import { ModalCloseButton } from '../ModalCloseButton.jsx';

export const ASSET_TYPE_KEYS = ['character', 'scene', 'style', 'prop', 'knowledge', 'custom'];

/**
 * 纯矢量文件图标
 */
function FileIcon({ size = 20 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
    </svg>
  );
}

/**
 * 纯矢量文件夹图标
 */
function FolderIcon({ size = 14 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );
}

/**
 * 从路径中提取基本文件名（去除扩展名）
 */
function extractBaseName(filePath) {
  if (typeof filePath !== 'string') return '';
  const clean = filePath.replace(/\/+$/, '');
  const parts = clean.split(/[/\\]/);
  const fileName = parts[parts.length - 1] || '';
  return fileName.replace(/\.[^.]+$/, '').trim();
}

/**
 * 添加资产弹窗组件（对齐产品标准规范：名称+分类+描述+文件拾取/拖拽+标签+一键入库）
 * @param {{
 *   open: boolean,
 *   presetType?: string,
 *   autoPick?: boolean,
 *   t: (key: string, vars?: object) => string,
 *   onClose: () => void,
 *   onPick?: (kind: 'file' | 'directory') => Promise<string[]>,
 *   onSubmit?: (payload: { name: string, type: string, description: string, tags: string[], files: { real_path: string }[] }) => Promise<object>,
 *   onSuccess?: (createdAsset: object) => void,
 * }} props
 */
export function AssetAddModal({
  open,
  presetType = 'character',
  autoPick = false,
  t,
  onClose,
  onPick,
  onSubmit,
  onSuccess,
}) {
  const nameRef = useRef(null);
  const [name, setName] = useState('');
  const [type, setType] = useState(
    ASSET_TYPE_KEYS.includes(presetType) ? presetType : 'character',
  );
  const [description, setDescription] = useState('');
  const [tagsOpen, setTagsOpen] = useState(false);
  const [tagDraft, setTagDraft] = useState('');
  const [tags, setTags] = useState([]);
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const autoPickedRef = useRef(false);

  useEffect(() => {
    if (open) {
      setType(ASSET_TYPE_KEYS.includes(presetType) ? presetType : 'character');
      setName('');
      setDescription('');
      setTags([]);
      setFiles([]);
      setError('');
      setBusy(false);
      autoPickedRef.current = false;
      nameRef.current?.focus();
    }
  }, [open, presetType]);

  const addPaths = (paths) => {
    const next = Array.isArray(paths)
      ? paths.filter((path) => typeof path === 'string' && path !== '')
      : [];
    if (next.length === 0) return;
    setFiles((current) => {
      const seen = new Set(current.map((file) => file.real_path));
      const extra = [];
      for (const path of next) {
        if (seen.has(path)) continue;
        seen.add(path);
        extra.push({ real_path: path });
      }
      return extra.length === 0 ? current : [...current, ...extra];
    });
    // 智能预填资产名：若用户尚未手动输入资产名称，则自动采用首个文件的主文件名
    setName((currentName) => {
      if (currentName.trim()) return currentName;
      return extractBaseName(next[0]) || currentName;
    });
  };

  const handlePickKind = async (kind = 'file') => {
    if (busy) return;
    try {
      let paths = [];
      if (typeof onPick === 'function') {
        paths = await onPick(kind);
      } else {
        const response = await fetch('/omnimux/assets/pick', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ kind }),
        });
        const data = await response.json();
        paths = Array.isArray(data.paths) ? data.paths : (data.path ? [data.path] : []);
      }
      addPaths(paths);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  };

  // 连携唤起：弹窗打开且带有 autoPick 时自动拉起系统选文件
  useEffect(() => {
    if (open && autoPick && !autoPickedRef.current) {
      autoPickedRef.current = true;
      // 轻微延迟以确保弹窗挂载后立即拉起系统选择器
      const timer = setTimeout(() => {
        void handlePickKind('file');
      }, 50);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [open, autoPick]);

  const addTag = () => {
    const next = tagDraft.trim();
    if (!next) return;
    if (tags.some((tag) => tag.toLowerCase() === next.toLowerCase())) {
      setTagDraft('');
      return;
    }
    setTags([...tags, next]);
    setTagDraft('');
  };

  const handleSubmit = async () => {
    const finalName = name.trim();
    if (!finalName || busy) return;
    setBusy(true);
    setError('');
    try {
      const payload = {
        name: finalName,
        type,
        description: description.trim(),
        tags,
        files,
      };
      let createdAsset = null;
      if (typeof onSubmit === 'function') {
        createdAsset = await onSubmit(payload);
      } else {
        const response = await fetch('/omnimux/assets/library', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.message || data.error || `HTTP ${response.status}`);
        }
        createdAsset = data.asset || data;
      }
      onSuccess?.(createdAsset);
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  const typeOptions = ASSET_TYPE_KEYS.map((key) => ({
    value: key,
    label: t ? t(`composerAdd.cat.${key}`) : key,
  }));

  const canSubmit = name.trim() !== '' && !busy;

  return (
    <ModalDialog
      open={open}
      onClose={onClose}
      title={t ? t('composerAdd.addAssetModalTitle') : '添加资产'}
      closeLabel={t ? t('composerAdd.cancel') : '取消'}
      size="lg"
      footer={
        <Button
          variant="primary"
          disabled={!canSubmit}
          loading={busy}
          onClick={() => {
            void handleSubmit();
          }}
        >
          {t ? t('composerAdd.submitAdd') : '添加资产'}
        </Button>
      }
    >
      <div className="omx-asset-add-form">
        <ModalCloseButton onClose={onClose} placement="external" ariaLabel={t ? t('composerAdd.cancel') : '取消'} />

        <div className="omx-asset-add-name-row">
          <span className="omx-asset-add-at" aria-hidden="true">@</span>
          <InputField
            ref={nameRef}
            className="omx-asset-add-name-field"
            value={name}
            placeholder={t ? t('composerAdd.namePlaceholder') : '资产名称'}
            disabled={busy}
            onChange={(event) => {
              setName(event.target.value);
            }}
          />
        </div>

        <div className="omx-asset-add-type-row">
          <DropdownSelect
            value={type}
            options={typeOptions}
            aria-label={t ? t('composerAdd.categories') : '资产分类'}
            disabled={busy}
            onChange={setType}
          />
          <span className="omx-asset-add-type-sep" aria-hidden="true">|</span>
          <InputField
            className="omx-asset-add-desc-field"
            value={description}
            placeholder={t ? t('composerAdd.descPlaceholder') : '输入资产特征描述，便于 Agent 精准检索与复用…'}
            disabled={busy}
            onChange={(event) => {
              setDescription(event.target.value);
            }}
          />
        </div>

        <div
          className="omx-asset-add-drop"
          onDragOver={(event) => {
            event.preventDefault();
          }}
          onDrop={(event) => {
            event.preventDefault();
            const dropped = Array.from(event.dataTransfer?.files ?? []);
            addPaths(dropped.map((file) => (typeof file.path === 'string' ? file.path : '')).filter(Boolean));
          }}
        >
          <FileIcon size={22} />
          <span>{t ? t('composerAdd.dropHint') : '拖拽文件或文件夹至此，或点击浏览'}</span>
          <div className="omx-asset-add-drop-actions">
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => {
                void handlePickKind('file');
              }}
            >
              {t ? t('composerAdd.pickFiles') : '选择文件'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => {
                void handlePickKind('directory');
              }}
            >
              {t ? t('composerAdd.pickFolders') : '选择文件夹'}
            </Button>
          </div>
        </div>

        {files.length > 0 ? (
          <ul className="omx-asset-add-filelist">
            {files.map((file) => {
              const isFolder = typeof file.real_path === 'string' && /\/$/.test(file.real_path);
              return (
                <li key={file.real_path}>
                  {isFolder ? <FolderIcon size={14} /> : <FileIcon size={14} />}
                  <span className="omx-asset-add-filelist-name">{file.real_path}</span>
                  {isFolder ? (
                    <Badge size="sm" shape="capsule" variant="neutral">
                      {t ? t('composerAdd.folderBadge') : '文件夹'}
                    </Badge>
                  ) : null}
                  <IconButton
                    variant="ghost"
                    size="xs"
                    aria-label={t ? t('composerAdd.removeFile') : '移除'}
                    onClick={() => {
                      setFiles((current) => current.filter((row) => row.real_path !== file.real_path));
                    }}
                  >
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </IconButton>
                </li>
              );
            })}
          </ul>
        ) : null}

        <div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setTagsOpen(!tagsOpen);
            }}
          >
            {tagsOpen ? '▾' : '▸'} {t ? t('composerAdd.addTagsOptional') : '添加标签 (可选)'}
          </Button>
          {tagsOpen ? (
            <div className="omx-asset-add-tags-wrap">
              {tags.length > 0 ? (
                <div className="omx-asset-add-tags">
                  {tags.map((tag) => (
                    <Badge key={tag} size="sm" shape="capsule" variant="neutral" className="omx-asset-add-tag">
                      {tag}
                      <IconButton
                        variant="ghost"
                        size="xs"
                        aria-label={t ? t('composerAdd.removeTag') : '删除标签'}
                        onClick={() => {
                          setTags(tags.filter((item) => item !== tag));
                        }}
                      >
                        <svg
                          width="10"
                          height="10"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <line x1="18" y1="6" x2="6" y2="18" />
                          <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </IconButton>
                    </Badge>
                  ))}
                </div>
              ) : null}
              <InputField
                value={tagDraft}
                placeholder={t ? t('composerAdd.tagPlaceholder') : '输入标签后按回车添加'}
                disabled={busy}
                onChange={(event) => {
                  setTagDraft(event.target.value);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    addTag();
                  }
                }}
              />
            </div>
          ) : null}
        </div>

        {error ? <p className="omx-asset-add-error">{error}</p> : null}
      </div>
    </ModalDialog>
  );
}
