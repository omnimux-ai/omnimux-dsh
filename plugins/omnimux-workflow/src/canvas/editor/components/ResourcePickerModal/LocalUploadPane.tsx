/**
 * 本地导入面板：系统选择器 + 带 path 的拖拽。不把 blob 写入节点。
 */

import React, { useCallback, useState } from 'react';
import { FileUp, Trash2, Upload } from 'lucide-react';
import { useT } from '../../../i18n';
import { toast } from '../../../ui';
import { pickLocalFiles } from '../../../bridge/apiClient.ts';
import {
  formatFileSize,
  type LocalFileDraft,
} from '../../utils/resourcePickerPolicy.ts';
import { draftFromRealPath, draftsFromPickedPaths, filterDraftsByTypes, nativePathOf } from '../../utils/localFileDraft.ts';
import { localFileMediaUrl } from '../../../../shared/localMedia.ts';
import PreviewThumb from './PreviewThumb.tsx';
import { useAsyncInstanceGuard } from '../../hooks/useAsyncInstanceGuard.ts';

export interface LocalUploadPaneProps {
  files: LocalFileDraft[];
  active: boolean;
  onAddFiles: (files: LocalFileDraft[]) => void;
  onRemove: (id: string) => void;
  /** 卡槽装填会话：仅接受这些素材类型，其余在入口处拦截。 */
  acceptedTypes?: string[];
}

const LocalUploadPane: React.FC<LocalUploadPaneProps> = ({ files, active, onAddFiles, onRemove, acceptedTypes }) => {
  const guard = useAsyncInstanceGuard(active);
  const t = useT();
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [measured, setMeasured] = useState<Record<string, { width: number; height: number }>>({});

  const ingestPaths = useCallback(
    (paths: string[]) => {
      if (!paths.length) return;
      const drafts = draftsFromPickedPaths(paths);
      const filtered = filterDraftsByTypes(drafts, acceptedTypes);
      if (filtered.length > 0) onAddFiles(filtered);
      if (filtered.length < paths.length) toast.warning(t('picker.unsupported'));
    },
    [acceptedTypes, onAddFiles, t],
  );

  const chooseNative = useCallback(async () => {
    if (!active) return;
    const ticket = guard.capture();
    if (!guard.isCurrent(ticket)) return;
    const result = await pickLocalFiles().catch(() => null);
    if (!guard.isCurrent(ticket)) return;
    if (!result || !result.ok) {
      if (result?.body.error === 'picker-unsupported') {
        toast.warning(t('picker.needPath'));
      } else {
        toast.error(t('picker.pickFailed'));
      }
      return;
    }
    const paths = result.body.paths ?? [];
    if (paths.length === 0) return;
    ingestPaths(paths);
  }, [active, guard, ingestPaths, t]);

  const ingestFiles = useCallback(
    (list: FileList | File[]) => {
      const incoming = Array.from(list);
      const drafted: LocalFileDraft[] = [];
      let missingPath = 0;
      let rejected = 0;
      for (const file of incoming) {
        const path = nativePathOf(file);
        if (!path) {
          missingPath += 1;
          continue;
        }
        const draft = draftFromRealPath(path, {
          name: file.name,
          mime: file.type,
          size: file.size,
        });
        if (draft) {
          drafted.push(draft);
        } else {
          rejected += 1;
        }
      }
      const accepted = filterDraftsByTypes(drafted, acceptedTypes);
      rejected += drafted.length - accepted.length;
      if (accepted.length > 0) onAddFiles(accepted);
      if (missingPath > 0) toast.warning(t('picker.needPath'));
      if (rejected > 0) toast.warning(t('picker.unsupported'));
    },
    [acceptedTypes, onAddFiles, t],
  );

  const handleClick = useCallback(() => {
    if (!active) return;
    // File.path was removed in modern Electron, so the hidden input always
    // falls back to the native picker anyway — go straight there instead of
    // making the user pick files in two consecutive dialogs.
    void chooseNative();
  }, [active, chooseNative]);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const list = e.target.files;
      if (list && list.length > 0) {
        const hasPath = Boolean(list[0] && nativePathOf(list[0]));
        if (hasPath) {
          ingestFiles(list);
        } else {
          void chooseNative();
        }
        e.target.value = '';
      }
    },
    [chooseNative, ingestFiles],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragging(false);
      if (e.dataTransfer.files?.length) ingestFiles(e.dataTransfer.files);
    },
    [ingestFiles],
  );

  return (
    <div className="wf-picker-pane">
      <input
        ref={fileInputRef}
        type="file"
        multiple
        style={{ display: 'none' }}
        onChange={handleInputChange}
        aria-hidden="true"
        tabIndex={-1}
      />
      <button
        type="button"
        className={`wf-picker-dropzone ${dragging ? 'wf-picker-dropzone--active' : ''}`}
        onClick={handleClick}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDragging(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDragging(false);
        }}
        onDrop={handleDrop}
      >
        <Upload size={22} className="wf-picker-dropzone__icon" />
        <span className="wf-picker-dropzone__title">{t('picker.dropTitle')}</span>
        <span className="wf-picker-dropzone__hint">{t('picker.dropHint')}</span>
        <span className="wf-picker-dropzone__cta">
          <FileUp size={14} />
          {t('picker.chooseFiles')}
        </span>
      </button>

      {files.length > 0 ? (
        <ul className="wf-picker-file-list">
          {files.map((file) => {
            const preview = file.previewUrl || localFileMediaUrl(file.realPath);
            return (
              <li key={file.id} className="wf-picker-file-item">
                <div className="wf-picker-file-item__thumb">
                  <PreviewThumb
                    layout="list"
                    materialType={file.materialType}
                    previewUrl={preview}
                    width={measured[file.id]?.width}
                    height={measured[file.id]?.height}
                    badge="none"
                    fallbackLabel={t(`node.type.${file.materialType}`)}
                    mimeOrName={file.mime || file.name}
                    onNaturalSize={(s) =>
                      setMeasured((prev) => ({ ...prev, [file.id]: s }))
                    }
                  />
                </div>
                <div className="wf-picker-row__body">
                  <span className="wf-picker-card__name">{file.name}</span>
                  <span className="wf-picker-row__sub">
                    {t(`node.type.${file.materialType}`)}
                    {file.size ? ` · ${formatFileSize(file.size)}` : ''}
                  </span>
                </div>
                <button
                  type="button"
                  className="wf-picker-file-remove"
                  onClick={() => onRemove(file.id)}
                  title={t('picker.removeFile')}
                >
                  <Trash2 size={14} />
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
};

export default LocalUploadPane;
