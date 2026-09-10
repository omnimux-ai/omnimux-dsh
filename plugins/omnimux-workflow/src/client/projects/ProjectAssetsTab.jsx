import React, { useState } from 'react'
import {
  Folder,
  FolderPlus,
  Upload,
  Film,
  Image as ImageIcon,
  Music,
  FileText,
  RefreshCw,
  MoreVertical,
} from 'lucide-react'

function formatBytes(bytes) {
  if (!bytes || typeof bytes !== 'number') return '-'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function FileTypeIcon({ type, isFolder }) {
  if (isFolder) return <Folder size={16} className="omnimux-file-icon-folder" />
  if (type === 'video') return <Film size={16} className="omnimux-file-icon-media" />
  if (type === 'image') return <ImageIcon size={16} className="omnimux-file-icon-media" />
  if (type === 'audio') return <Music size={16} className="omnimux-file-icon-media" />
  return <FileText size={16} className="omnimux-file-icon-media" />
}

export function ProjectAssetsTab({
  assetsDoc,
  onCreateFolder,
  onUploadFile,
  onRefresh,
  loading = false,
  t,
}) {
  const [query, setQuery] = useState('')
  const [currentFolderId, setCurrentFolderId] = useState(null)

  const folders = assetsDoc?.folders ?? []
  const items = assetsDoc?.items ?? []

  // 当前层级的文件夹与文件
  const visibleFolders = folders.filter((f) => (f.parentId ?? null) === currentFolderId)
  const visibleItems = items.filter((item) => (item.folderId ?? null) === currentFolderId)

  // 搜索过滤
  const filteredFolders = visibleFolders.filter((f) =>
    !query.trim() || f.name.toLowerCase().includes(query.trim().toLowerCase()),
  )
  const filteredItems = visibleItems.filter((item) =>
    !query.trim() || item.name.toLowerCase().includes(query.trim().toLowerCase()),
  )

  const currentFolder = folders.find((f) => f.id === currentFolderId)

  return (
    <div className="omnimux-assets-tab">
      {/* 顶部两张大操作卡片 (对应截图 3 顶部) */}
      <div className="omnimux-assets-action-row">
        {/* 卡片 1：新建文件夹 */}
        <div
          className="omnimux-assets-action-card"
          onClick={onCreateFolder}
          title="在当前目录下新建文件夹"
        >
          <div className="omnimux-assets-card-icon-box">
            <FolderPlus size={20} />
          </div>
          <div className="omnimux-assets-card-text">
            <span className="omnimux-assets-card-title">新建文件夹</span>
            <span className="omnimux-assets-card-subtitle">在当前目录下新建</span>
          </div>
        </div>

        {/* 卡片 2：上传文件 */}
        <div
          className="omnimux-assets-action-card"
          onClick={onUploadFile}
          title="上传文件到工作区目录 (支持批量上传)"
        >
          <div className="omnimux-assets-card-icon-box">
            <Upload size={20} />
          </div>
          <div className="omnimux-assets-card-text">
            <span className="omnimux-assets-card-title">上传文件</span>
            <span className="omnimux-assets-card-subtitle">支持批量上传</span>
          </div>
        </div>
      </div>

      {/* 资产浏览器与文件表格 */}
      <div className="omnimux-assets-browser">
        <div className="omnimux-assets-filter-line">
          {/* 路径与当前目录 */}
          <div className="omnimux-project-breadcrumbs">
            <span
              className={currentFolderId ? 'omnimux-project-crumb-link' : 'omnimux-project-crumb-current'}
              onClick={() => setCurrentFolderId(null)}
            >
              全部文件
            </span>
            {currentFolder && (
              <>
                <span className="omnimux-project-crumb-sep">/</span>
                <span className="omnimux-project-crumb-current">{currentFolder.name}</span>
              </>
            )}
          </div>

          {/* 搜索框与刷新 */}
          <div className="omnimux-assets-search-cluster">
            <div className="omnimux-workflow-search-wrap">
              <input
                type="text"
                className="omnimux-workflow-search-input"
                placeholder="搜索文件名"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            {onRefresh && (
              <button /* exempt-ui01: 资产刷新按钮 */
                type="button"
                className="omnimux-header-action-btn"
                title="刷新资产列表"
                onClick={onRefresh}
                disabled={loading}
              >
                <RefreshCw size={14} className={loading ? 'omnimux-spin' : ''} />
              </button>
            )}
          </div>
        </div>

        {/* 文件表格 (对应截图 3) */}
        <table className="omnimux-assets-table">
          <thead>
            <tr>
              <th className="omnimux-col-name">名称</th>
              <th className="omnimux-col-size">大小</th>
              <th className="omnimux-col-time">更新时间</th>
              <th className="omnimux-col-action"></th>
            </tr>
          </thead>
          <tbody>
            {/* 文件夹列表 */}
            {filteredFolders.map((f) => (
              <tr key={f.id} onClick={() => setCurrentFolderId(f.id)}>
                <td>
                  <div className="omnimux-file-name-cell">
                    <FileTypeIcon isFolder />
                    <span className="omnimux-file-folder-name">{f.name}</span>
                  </div>
                </td>
                <td>-</td>
                <td>-</td>
                <td>
                  <MoreVertical size={14} className="omnimux-file-more-btn" />
                </td>
              </tr>
            ))}

            {/* 文件列表 */}
            {filteredItems.map((item) => {
              const dateStr = item.updatedAt
                ? new Date(item.updatedAt).toLocaleDateString().replace(/\//g, '.')
                : '2026.8.28'

              return (
                <tr key={item.id}>
                  <td>
                    <div className="omnimux-file-name-cell">
                      <FileTypeIcon type={item.type} />
                      <span>{item.name}</span>
                    </div>
                  </td>
                  <td>{formatBytes(item.size)}</td>
                  <td>{dateStr}</td>
                  <td>
                    <MoreVertical size={14} className="omnimux-file-more-btn" />
                  </td>
                </tr>
              )
            })}

            {filteredFolders.length === 0 && filteredItems.length === 0 && (
              <tr>
                <td colSpan={4} className="omnimux-assets-empty-cell">
                  暂无文件。点击上方「新建文件夹」或「上传文件」开始添加资产。
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
