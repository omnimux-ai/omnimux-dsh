import React, { useState } from 'react'

function SvgIcon({ d, size = 16, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {d}
    </svg>
  )
}

const Folder = ({ size = 16, className = '' }) => (
  <SvgIcon size={size} className={className} d={<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />} />
)

const FolderPlus = ({ size = 16, className = '' }) => (
  <SvgIcon
    size={size}
    className={className}
    d={
      <>
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        <line x1="12" y1="11" x2="12" y2="17" />
        <line x1="9" y1="14" x2="15" y2="14" />
      </>
    }
  />
)

const Upload = ({ size = 16, className = '' }) => (
  <SvgIcon
    size={size}
    className={className}
    d={
      <>
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="17 8 12 3 7 8" />
        <line x1="12" y1="3" x2="12" y2="15" />
      </>
    }
  />
)

const Film = ({ size = 16, className = '' }) => (
  <SvgIcon
    size={size}
    className={className}
    d={
      <>
        <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18" />
        <line x1="7" y1="2" x2="7" y2="22" />
        <line x1="17" y1="2" x2="17" y2="22" />
        <line x1="2" y1="12" x2="22" y2="12" />
        <line x1="2" y1="7" x2="7" y2="7" />
        <line x1="2" y1="17" x2="7" y2="17" />
        <line x1="17" y1="17" x2="22" y2="17" />
        <line x1="17" y1="7" x2="22" y2="7" />
      </>
    }
  />
)

const ImageIcon = ({ size = 16, className = '' }) => (
  <SvgIcon
    size={size}
    className={className}
    d={
      <>
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <polyline points="21 15 16 10 5 21" />
      </>
    }
  />
)

const Music = ({ size = 16, className = '' }) => (
  <SvgIcon
    size={size}
    className={className}
    d={
      <>
        <path d="M9 18V5l12-2v13" />
        <circle cx="6" cy="18" r="3" />
        <circle cx="18" cy="16" r="3" />
      </>
    }
  />
)

const FileText = ({ size = 16, className = '' }) => (
  <SvgIcon
    size={size}
    className={className}
    d={
      <>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <polyline points="10 9 9 9 8 9" />
      </>
    }
  />
)

const RefreshCw = ({ size = 16, className = '' }) => (
  <SvgIcon
    size={size}
    className={className}
    d={
      <>
        <polyline points="23 4 23 10 17 10" />
        <polyline points="1 20 1 14 7 14" />
        <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
      </>
    }
  />
)

const MoreVertical = ({ size = 16, className = '' }) => (
  <SvgIcon
    size={size}
    className={className}
    d={
      <>
        <circle cx="12" cy="12" r="1" />
        <circle cx="12" cy="5" r="1" />
        <circle cx="12" cy="19" r="1" />
      </>
    }
  />
)

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
