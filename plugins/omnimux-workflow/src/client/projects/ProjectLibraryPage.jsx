/**
 * 项目库列表与工程中心页（workbench tab on dsh-better-sidebar）。
 *
 * 架构层级：
 * 1. 顶层：项目文件夹列表（Project Folder Cards），展示每个项目文件夹及内嵌创作页数；
 * 2. 二级：项目详情工程中心（带面包屑导航）：
 *    - 创作页 Tab (N)：展示该工作区下的全部创作页卡片，支持直接打开画布、新建创作页、重命名与删除；
 *    - 项目资产 Tab (M)：工作区文件管理器，展示全部物理素材文件，支持新建文件夹与批量上传。
 */
import React, { useCallback, useEffect, useState } from 'react'
import {
  IconPlusOutline16,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { Button, ConfirmModal, Divider, FilterBar, ModalDialog, PageHeader, SearchField, Tabs } from 'dsh-ui-kit'
import { Info } from 'lucide-react'
import {
  listProjects,
  getProject,
  renameProject,
  deleteProject,
  bindProjectSession,
  createProjectPage,
  updateProjectPage,
  deleteProjectPage,
  fetchProjectFiles,
  mkdirProjectFile,
  uploadProjectFiles,
} from '../api.js'
import {
  getWorkspaceAssets,
  mkdirWorkspaceAsset,
  ingestWorkspaceAssets,
  pickLocalFiles,
} from '../../canvas/bridge/apiClient.ts'
import { injectWorkflowStyles } from '../styles.js'
import { NewLocalProjectDialog } from './NewLocalProjectDialog.jsx'
import { createProjectSession, dismissProductStage, runNewProject } from './newProject.js'
import { activateProjectCanvas, closeAppTab, openAppTab } from './projectCanvas.js'
import { ProjectFolderCard } from './ProjectFolderCard.jsx'
import { ProjectPagesTab } from './ProjectPagesTab.jsx'
import { ProjectAssetsTab } from './ProjectAssetsTab.jsx'
import { AIAppCard } from './AIAppCard.jsx'
import {
  APP_REMOVE_ERROR_KEYS,
  appEntryMatchesQuery,
  defaultAppStorage,
  listPublishedApps,
  removePublishedApp,
  resolveAppEditTarget,
  resolveOwningProject,
} from './appLibrary.js'

export const WORKFLOW_LIBRARY_TAB_ID = 'omnimux-workflow:library'

function PromptModal({ open, title, placeholder, defaultValue = '', confirmLabel = '确定', cancelLabel = '取消', onClose, onConfirm }) {
  const [value, setValue] = useState(defaultValue)
  useEffect(() => {
    if (open) setValue(defaultValue)
  }, [open, defaultValue])

  if (!open) return null

  const handleSubmit = (e) => {
    e?.preventDefault?.()
    if (!value.trim()) return
    onConfirm(value.trim())
  }

  return (
    <ModalDialog
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      closeLabel={cancelLabel}
      footer={(
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', width: '100%' }}>
          <Button variant="ghost" onClick={onClose}>{cancelLabel}</Button>
          <Button variant="primary" onClick={handleSubmit} disabled={!value.trim()}>{confirmLabel}</Button>
        </div>
      )}
    >
      <form onSubmit={handleSubmit} style={{ margin: '8px 0' }}>
        <input
          autoFocus
          className="omnimux-prompt-input"
          style={{
            width: '100%',
            height: '32px',
            boxSizing: 'border-box',
            padding: '0 10px',
            borderRadius: '8px',
            border: '1px solid var(--dsw-alias-border-l2)',
            background: 'var(--dsw-alias-bg-layer-1)',
            color: 'var(--dsw-alias-label-primary)',
            fontSize: '13px',
            outline: 'none',
          }}
          placeholder={placeholder}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault()
              onClose()
            }
          }}
        />
      </form>
    </ModalDialog>
  )
}

function errText(result, t) {
  const code = String(result?.body?.error ?? '')
  if (code === 'no-workspace') return t('projects.noWorkspace') || '工作区不可用'
  return String(result?.body?.message || result?.body?.error || result?.status || t('projects.genericError') || '请求失败')
}

export function ProjectLibraryPage(props) {
  const { t, stage, store, visible = true, sessions, workspaces, layout, betterSidebar } = props
  useEffect(() => { injectWorkflowStyles() }, [])

  useEffect(() => {
    const api = typeof window !== 'undefined' ? window.__omnimuxWorkbench : undefined
    if (!api || typeof api.attachStore !== 'function' || !store) return undefined
    api.attachStore(store)
    return () => { api.detachStore?.(store) }
  }, [store])

  const [projects, setProjects] = useState([])
  const [selectedProject, setSelectedProject] = useState(null)
  const [projectDetail, setProjectDetail] = useState(null)
  const [detailTab, setDetailTab] = useState('pages') // pages | assets
  const [assetsDoc, setAssetsDoc] = useState(null)
  const [query, setQuery] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [pendingDelete, setPendingDelete] = useState(null)
  const [pendingDeletePage, setPendingDeletePage] = useState(null)
  const [pendingAppDelete, setPendingAppDelete] = useState(null)
  const [promptModal, setPromptModal] = useState(null)
  const [libraryTab, setLibraryTab] = useState('local')
  // 「AI应用」分类的独立数据源：localStorage['omnimux_apps_manifests']
  // （发布向导写的唯一真实落点），与顶层项目列表互不影响。
  const [apps, setApps] = useState([])
  const [appsError, setAppsError] = useState('')

  // 1. 重新加载顶层项目列表
  const reload = useCallback(async () => {
    try {
      const res = await listProjects()
      if (res.ok && Array.isArray(res.body?.projects)) {
        setProjects(res.body.projects)
        setError('')
      } else if (!res.ok) {
        setError(errText(res, t))
      }
    } catch (e) {
      setError(String(e?.message || e || t('projects.genericError') || '请求失败'))
    }
  }, [t])

  useEffect(() => {
    if (visible) void reload()
  }, [visible, reload])

  // 1b. 「AI应用」分类的独立列表：数据源是发布向导写入的 manifest 映射。
  // 存储根本不可用（隐私模式 / 被策略禁用）与清单损坏是两种不同的失败，
  // 各自给真实错误；空映射才是真空态——三者不混。
  const reloadApps = useCallback(() => {
    if (!defaultAppStorage()) {
      setApps([])
      setAppsError(t('projects.appStorageUnavailable') || '本地存储不可用，无法读取应用清单。')
      return
    }
    try {
      setApps(listPublishedApps())
      setAppsError('')
    } catch {
      setApps([])
      setAppsError(t('projects.appStorageUnreadable') || '应用清单读取失败，请刷新后重试。')
    }
  }, [t])

  useEffect(() => {
    if (!visible || libraryTab !== 'apps') return undefined
    reloadApps()
    if (typeof window === 'undefined') return undefined
    // 发布向导发布成功后派发（PublishWizardModal），列表就地刷新。
    const onAppTabsChanged = () => { reloadApps() }
    window.addEventListener('omnimux-app-tabs-changed', onAppTabsChanged)
    return () => window.removeEventListener('omnimux-app-tabs-changed', onAppTabsChanged)
  }, [visible, libraryTab, reloadApps])

  const handleLibraryTabChange = useCallback((nextId) => {
    setLibraryTab(nextId)
    setError('')
    setAppsError('')
  }, [])

  // 2. 当进入某个项目时，加载该项目的完整 pages 与资产列表
  const loadProjectDetail = useCallback(async (project) => {
    if (!project?.id) return
    setBusy(true)
    try {
      const res = await getProject(project.id)
      if (res.ok && res.body?.project) {
        setProjectDetail(res.body.project)
        setProjects((current) => current.map((item) => item.id === project.id ? { ...item, cover: res.body.project.cover, pages: res.body.project.pages } : item))
      } else {
        setProjectDetail(project)
      }

      // 优先从真实物理工作区目录读取文件列表
      const filesRes = await fetchProjectFiles(project.id)
      if (filesRes.ok && Array.isArray(filesRes.body?.items)) {
        setAssetsDoc({
          folders: filesRes.body.items.filter((i) => i.isFolder),
          items: filesRes.body.items.filter((i) => !i.isFolder),
        })
      } else {
        // 加载项目资产 (回退)
        const assetsWorkspaceId = project.canvasWorkspaceIds?.[0] || project.id
        const assetsRes = await getWorkspaceAssets(assetsWorkspaceId)
        if (assetsRes.ok && assetsRes.body?.assets) {
          setAssetsDoc(assetsRes.body.assets)
        }
      }
    } catch {
      setProjectDetail(project)
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(() => {
    if (!visible) return
    if (selectedProject) {
      void loadProjectDetail(selectedProject)
    } else {
      setProjectDetail(null)
      setAssetsDoc(null)
    }
  }, [selectedProject, loadProjectDetail, visible])

  // 3. 点击进入某个项目文件夹
  const handleSelectFolder = (project) => {
    setSelectedProject(project)
    setDetailTab('pages')
  }

  // 4. 打开某个具体的创作页并呼出画布
  const handleOpenPage = async (page) => {
    if (!selectedProject) return
    dismissProductStage()

    // 将选中的创作页设置为当前活跃页
    if (page.canvasWorkspaceId && typeof localStorage !== 'undefined') {
      localStorage.setItem('omnimux:latest-active-canvas', page.canvasWorkspaceId)
    }
    void updateProjectPage(selectedProject.id, page.id, { active: true }).catch(() => {})

    let sessionId = selectedProject.sessionId
    if (!sessionId && sessions && typeof sessions.create === 'function') {
      try {
        const created = await createProjectSession(sessions, workspaces, selectedProject.path || selectedProject.title)
        sessionId = created?.id
        if (sessionId) {
          void bindProjectSession(selectedProject.id, sessionId)
        }
      } catch (e) {
        console.error('[omnimux-workflow] failed to create project session', e)
      }
    }
    if (sessionId && sessions && typeof sessions.open === 'function') {
      try { sessions.open(sessionId) } catch {}
    }

    await activateProjectCanvas(selectedProject.id, {
      layout,
      betterSidebar,
      title: page.title || selectedProject.title,
      sessionId,
      canvasWorkspaceId: page.canvasWorkspaceId,
    })
  }

  // 4b. 点击 AI 应用卡片 → 右侧栏应用标签页。宿主在原生 surface 下通过 meta.appId 传递应用身份。
  const handleOpenApp = (app) => {
    const opened = openAppTab(
      app?.manifest || { appId: app?.appId },
      { appId: app?.appId, title: app?.name },
    )
    if (!opened) setAppsError(t('projects.genericError') || '打开应用失败，请重试。')
    else setAppsError('')
  }

  // 4c. 卡片「编辑」→ 打开该应用所属项目的创作画布，并聚焦发布时的工作流组。
  //     缺项目/缺组归属时不伪造「已定位」，仍打开画布并给出可理解的提示。
  const handleEditApp = async (app) => {
    const target = resolveAppEditTarget(app)
    const project = resolveOwningProject(projects, app)
    const canvasWorkspaceId = target.workspaceId
      || project?.canvasWorkspaceIds?.[0]
      || ''
    dismissProductStage()

    // 画布 tab 是 single:true：光 openTab 只会聚焦已挂载的旧实例，
    // 必须把目标工作区写进既有 live 通道，画布才会切到该应用所属项目。
    if (canvasWorkspaceId && typeof localStorage !== 'undefined') {
      localStorage.setItem('omnimux:latest-active-canvas', canvasWorkspaceId)
    }
    if (canvasWorkspaceId && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('omnimux:active-canvas-changed', {
        detail: { workspaceId: canvasWorkspaceId },
      }))
    }

    let sessionId = project?.sessionId
    if (!sessionId && project && sessions && typeof sessions.create === 'function') {
      try {
        const created = await createProjectSession(sessions, workspaces, project.path || project.title)
        sessionId = created?.id
        if (sessionId) void bindProjectSession(project.id, sessionId)
      } catch (e) {
        console.error('[omnimux-workflow] failed to create project session', e)
      }
    }
    if (sessionId && sessions && typeof sessions.open === 'function') {
      try { sessions.open(sessionId) } catch {}
    }

    if (!project) {
      setAppsError(t('projects.appEditNoProject') || '找不到该应用所属项目，已为你打开创作画布。')
    } else if (!target.groupId) {
      setAppsError(t('projects.appEditOpened') || '已打开所属项目画布，未能定位到工作流组。')
    } else {
      setAppsError('')
    }

    const opened = await activateProjectCanvas(
      { layout, betterSidebar, t },
      { sessionId, focusGroupId: target.groupId },
    )
    if (!opened) {
      setAppsError(t('projects.appEditFailed') || '打开项目画布失败，请重试。')
    }
  }

  // 4d. 卡片「删除」：先二次确认，再移除记录并关掉对应应用标签页。
  //     存储写失败 / 记录不存在一律保留卡片并报错，不伪造成功。
  const confirmDeleteApp = () => {
    if (!pendingAppDelete) return
    const target = pendingAppDelete
    setPendingAppDelete(null)
    const result = removePublishedApp(target.appId)
    if (!result.ok) {
      setAppsError(t(APP_REMOVE_ERROR_KEYS[result.reason] || 'projects.appDeleteFailed')
        || '删除应用失败，请重试。')
      return
    }
    closeAppTab(target.appId)
    reloadApps()
  }

  // 5. 在项目内新建创作页
  const handleCreatePageInProject = async () => {
    if (!selectedProject) return
    const currentPages = projectDetail?.pages ?? []
    const newTitle = `创作页 ${currentPages.length + 1}`
    setBusy(true)
    try {
      const res = await createProjectPage(selectedProject.id, newTitle)
      if (res.ok) {
        void loadProjectDetail(selectedProject)
        void reload()
      } else {
        setError(errText(res, t))
      }
    } finally {
      setBusy(false)
    }
  }

  // 6. 重命名创作页（对标规范：深色模态对话框）
  const handleRenamePage = (page) => {
    if (!selectedProject) return
    setPromptModal({
      title: t('projects.renamePrompt') || '重命名创作页',
      placeholder: t('projects.namePlaceholder') || '请输入新名称',
      defaultValue: page.title || '',
      confirmLabel: t('projects.save') || '保存',
      onConfirm: async (next) => {
        if (!next.trim() || next.trim() === page.title) return
        setBusy(true)
        try {
          const res = await updateProjectPage(selectedProject.id, page.id, { title: next.trim() })
          if (res.ok) void loadProjectDetail(selectedProject)
          else setError(errText(res, t))
        } finally {
          setBusy(false)
        }
      },
    })
  }

  // 7. 删除创作页（对标规范：ConfirmModal 危险操作确认弹窗）
  const handleDeletePage = (page) => {
    if (!selectedProject) return
    setPendingDeletePage(page)
  }

  const confirmDeletePage = async () => {
    if (!selectedProject || !pendingDeletePage) return
    const pageId = pendingDeletePage.id
    setPendingDeletePage(null)
    setBusy(true)
    try {
      const res = await deleteProjectPage(selectedProject.id, pageId)
      if (res.ok) void loadProjectDetail(selectedProject)
      else setError(errText(res, t))
    } finally {
      setBusy(false)
    }
  }

  // 8. 资产管理：新建文件夹 (对标规范：深色模态对话框)
  const handleCreateFolder = () => {
    if (!selectedProject) return
    setPromptModal({
      title: '新建文件夹',
      placeholder: '请输入文件夹名称',
      defaultValue: '新建文件夹',
      confirmLabel: '创建',
      onConfirm: async (name) => {
        if (!name.trim()) return
        setBusy(true)
        try {
          const res = await mkdirProjectFile(selectedProject.id, name.trim())
          if (res.ok) {
            void loadProjectDetail(selectedProject)
          } else {
            const wsId = selectedProject.canvasWorkspaceIds?.[0] || selectedProject.id
            await mkdirWorkspaceAsset(wsId, { name: name.trim() })
            void loadProjectDetail(selectedProject)
          }
        } finally {
          setBusy(false)
        }
      },
    })
  }

  // 9. 资产管理：上传文件 (物理工作区目录)
  const handleUploadFile = async () => {
    if (!selectedProject) return
    try {
      const pickRes = await pickLocalFiles()
      if (pickRes.ok && Array.isArray(pickRes.body?.paths) && pickRes.body.paths.length > 0) {
        setBusy(true)
        const uploadRes = await uploadProjectFiles(selectedProject.id, pickRes.body.paths)
        if (uploadRes.ok) {
          void loadProjectDetail(selectedProject)
        } else {
          const wsId = selectedProject.canvasWorkspaceIds?.[0] || selectedProject.id
          await ingestWorkspaceAssets(wsId, {
            files: pickRes.body.paths.map((p) => ({ source_path: p })),
          })
          void loadProjectDetail(selectedProject)
        }
      }
    } finally {
      setBusy(false)
    }
  }

  // 新建项目提交
  const handleDialogSubmit = async ({ title, projectRoot }) => {
    setBusy(true)
    setError('')
    try {
      const created = await runNewProject({
        sessions,
        workspaces,
        layout,
        betterSidebar,
        stage,
        t,
      }, { title, projectRoot })
      if (!created?.ok) {
        setError(created?.error || t('projects.genericError') || '创建失败')
        return
      }
      setDialogOpen(false)
      void reload()
    } finally {
      setBusy(false)
    }
  }

  const handleRenameProject = (project) => {
    setPromptModal({
      title: t('projects.renamePrompt') || '重命名项目',
      placeholder: t('projects.namePlaceholder') || '请输入项目名称',
      defaultValue: project.title || '',
      confirmLabel: t('projects.save') || '保存',
      onConfirm: async (next) => {
        if (!next.trim() || next.trim() === project.title) return
        setBusy(true)
        try {
          const res = await renameProject(project.id, next.trim())
          if (res.ok) void reload()
          else setError(errText(res, t))
        } finally {
          setBusy(false)
        }
      },
    })
  }

  const confirmDeleteProject = async () => {
    if (!pendingDelete) return
    const id = pendingDelete.id
    setPendingDelete(null)
    setBusy(true)
    try {
      const res = await deleteProject(id)
      if (res.ok) {
        if (selectedProject?.id === id) setSelectedProject(null)
        void reload()
      } else {
        setError(errText(res, t))
      }
    } finally {
      setBusy(false)
    }
  }

  const handleClose = () => {
    const api = typeof window !== 'undefined' ? window.__omnimuxWorkbench : undefined
    if (api && typeof api.closeTab === 'function') {
      api.closeTab(WORKFLOW_LIBRARY_TAB_ID)
    } else {
      stage?.set?.(false)
    }
  }

  const filtered = projects.filter((p) => {
    if (!query.trim()) return true
    const q = query.trim().toLowerCase()
    return (p.title || '').toLowerCase().includes(q)
  })

  // 「AI应用」分类同样吃同一搜索框（按应用名/描述过滤），本地项目分支行为不变。
  const filteredApps = apps.filter((app) => appEntryMatchesQuery(app, query))

  const rawPages = projectDetail?.pages ?? selectedProject?.pages ?? []
  const currentProjectPages = Array.isArray(rawPages) && rawPages.length > 0
    ? rawPages
    : [{
        id: 'page-default',
        title: selectedProject?.title || '创作页 1',
        canvasWorkspaceId: selectedProject?.canvasWorkspaceIds?.[0] || selectedProject?.id,
        createdAt: selectedProject?.createdAt || new Date().toISOString(),
      }]
  const currentAssetsCount = (assetsDoc?.folders?.length ?? 0) + (assetsDoc?.items?.length ?? 0)

  return (
    <div
      role="region"
      aria-label={t('projects.title') || '项目'}
      aria-hidden={visible ? undefined : 'true'}
      className="omnimux-workflow-library-page"
      data-visible={visible ? 'true' : 'false'}
    >
      {/* 视图分支 A：项目详情页 (图 2 & 图 3 模式) */}
      {selectedProject ? (
        <>
          {/* 面包屑导航栏 (对齐设计参考：项目库 › {title}，无冗余刷新按钮) */}
          <div className="omnimux-project-breadcrumb-bar">
            <div className="omnimux-project-breadcrumbs">
              <span
                className="omnimux-project-crumb-link"
                onClick={() => setSelectedProject(null)}
                title="返回项目库"
              >
                项目库
              </span>
              <span className="omnimux-project-crumb-sep">›</span>
              <span className="omnimux-project-crumb-current">{selectedProject.title}</span>
            </div>
          </div>

          {/* 创作页 / 项目资产 选项卡栏 (左侧 Tabs：创作页 + 矢量信息图标 / 项目资产 + 矢量信息图标，右侧规范 Button「+ 新建创作页」) */}
          <div className="omnimux-project-detail-tabs-bar">
            <Tabs
              variant="underline"
              items={[
                {
                  id: 'pages',
                  label: (
                    <span className="omnimux-tab-label-wrap">
                      创作页
                      <Info size={13} className="omnimux-tab-info-icon" aria-label="查看并管理项目的所有创作页" />
                    </span>
                  ),
                },
                {
                  id: 'assets',
                  label: (
                    <span className="omnimux-tab-label-wrap">
                      项目资产
                      <Info size={13} className="omnimux-tab-info-icon" aria-label="查看并管理项目的所有资产文件" />
                    </span>
                  ),
                },
              ]}
              activeId={detailTab}
              onChange={setDetailTab}
            />
            {detailTab === 'pages' && (
              <Button
                variant="primary"
                className="omnimux-create-page-btn"
                leadingIcon={<IconPlusOutline16 />}
                disabled={busy}
                onClick={handleCreatePageInProject}
                title="新建创作页"
              >
                + 新建创作页
              </Button>
            )}
          </div>

          {error ? <div className="omnimux-workflow-library-error">{error}</div> : null}

          {/* 详情子视图 1：创作页网格 (对应图 2) */}
          {detailTab === 'pages' && (
            <ProjectPagesTab
              pages={currentProjectPages}
              activePageId={projectDetail?.activePageId}
              onOpenPage={handleOpenPage}
              onCreatePage={handleCreatePageInProject}
              onRenamePage={handleRenamePage}
              onDeletePage={handleDeletePage}
              loading={busy}
              t={t}
            />
          )}

          {/* 详情子视图 2：项目资产文件浏览器 (对应图 3) */}
          {detailTab === 'assets' && (
            <ProjectAssetsTab
              assetsDoc={assetsDoc}
              onCreateFolder={handleCreateFolder}
              onUploadFile={handleUploadFile}
              onRefresh={() => void loadProjectDetail(selectedProject)}
              loading={busy}
              t={t}
            />
          )}
        </>
      ) : (
        /* 视图分支 B：顶层项目文件夹列表 (图 1 模式) */
        <>
          <PageHeader
            title={t('workflow.pageTitle') || '项目'}
            subtitle="管理项目工程、查看创作页面与项目资产"
          />

          <div className="omnimux-workflow-library-action-row">
            <Button
              variant="primary"
              leadingIcon={<IconPlusOutline16 />}
              onClick={() => { setDialogOpen(true) }}
            >
              {t('workflow.action.new') || '新建项目'}
            </Button>
          </div>

          <Divider />

          <FilterBar
            className="omnimux-workflow-library-filter"
            filters={
              <Tabs
                variant="underline"
                items={[
                  { id: 'local', label: t('projects.localTab') || '本地项目' },
                  {
                    id: 'featured',
                    label: t('workflow.tab.featured') || '共创项目（即将上线）',
                    disabled: true,
                  },
                  { id: 'apps', label: t('workflow.tab.aiApps') || 'AI应用' },
                ]}
                activeId={libraryTab}
                onChange={handleLibraryTabChange}
              />
            }
            search={(
              <SearchField
                value={query}
                placeholder={t('projects.searchPlaceholder') || '搜索项目名称'}
                onValueChange={setQuery}
                onClear={() => { setQuery('') }}
              />
            )}
          />

          {error ? <div className="omnimux-workflow-library-error">{error}</div> : null}
          {appsError ? <div className="omnimux-workflow-library-error">{appsError}</div> : null}

          <div className="omnimux-workflow-library-body">
            {libraryTab === 'apps' ? (
              /* 视图分支 C：已发布 AI 应用卡片网格（数据源 = 发布向导写的 manifest 映射） */
              filteredApps.length === 0 ? (
                <div className="omnimux-workflow-library-empty">
                  <div className="omnimux-workflow-library-empty-title">{t('projects.appsEmptyTitle') || '还没有 AI 应用'}</div>
                  <div className="omnimux-workflow-library-empty-sub">{t('projects.appsEmptySubtitle') || '在创作画布中把工作流打组后点「发布应用」，发布的应用会出现在这里。'}</div>
                </div>
              ) : (
                <div className="omnimux-workflow-grid">
                  {filteredApps.map((app) => (
                    <AIAppCard
                      key={app.appId}
                      app={app}
                      t={t}
                      onOpen={handleOpenApp}
                      onEdit={(target) => { void handleEditApp(target) }}
                      onDelete={setPendingAppDelete}
                    />
                  ))}
                </div>
              )
            ) : filtered.length === 0 ? (
              <div className="omnimux-workflow-library-empty">
                <div className="omnimux-workflow-library-empty-title">{t('projects.emptyTitle') || '暂无项目'}</div>
                <div className="omnimux-workflow-library-empty-sub">{t('projects.emptySubtitle') || '点击下方按钮创建第一个项目工程'}</div>
                <Button
                  variant="primary"
                  leadingIcon={<IconPlusOutline16 />}
                  onClick={() => { setDialogOpen(true) }}
                >
                  {t('projects.newButton') || '新建项目'}
                </Button>
              </div>
            ) : (
              <div className="omnimux-workflow-grid">
                {filtered.map((project) => (
                  <ProjectFolderCard
                    key={project.id}
                    project={project}
                    onOpen={handleSelectFolder}
                    onRename={handleRenameProject}
                    onDelete={setPendingDelete}
                    t={t}
                  />
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {dialogOpen ? (
        <NewLocalProjectDialog
          t={t}
          busy={busy}
          error={error}
          initialPath=""
          initialTitle=""
          onCancel={() => { if (!busy) setDialogOpen(false) }}
          onSubmit={(payload) => { void handleDialogSubmit(payload) }}
        />
      ) : null}

      {pendingDelete ? (
        <ConfirmModal
          open
          onClose={() => { setPendingDelete(null) }}
          title={t('projects.delete') || '删除项目'}
          message={(t('projects.deleteConfirm') || '确定要删除项目「{title}」吗？').replace('{title}', pendingDelete.title)}
          confirmLabel={t('projects.delete') || '删除'}
          cancelLabel={t('projects.dialog.cancel') || '取消'}
          confirmVariant="danger"
          onConfirm={() => { void confirmDeleteProject() }}
        />
      ) : null}

      {pendingAppDelete ? (
        <ConfirmModal
          open
          onClose={() => { setPendingAppDelete(null) }}
          title={t('projects.appDelete') || '删除应用'}
          message={(t('projects.appDeleteConfirm') || '将删除应用「{title}」，其侧栏标签页会一并关闭。').replace('{title}', pendingAppDelete.name)}
          confirmLabel={t('projects.appDelete') || '删除'}
          cancelLabel={t('projects.dialog.cancel') || '取消'}
          confirmVariant="danger"
          onConfirm={confirmDeleteApp}
        />
      ) : null}

      {pendingDeletePage ? (
        <ConfirmModal
          open
          onClose={() => { setPendingDeletePage(null) }}
          title={t('projects.deletePageTitle') || '删除创作页'}
          message={(t('projects.deletePageConfirm') || '确定要删除创作页「{title}」吗？').replace('{title}', pendingDeletePage.title)}
          confirmLabel={t('projects.delete') || '删除'}
          cancelLabel={t('projects.dialog.cancel') || '取消'}
          confirmVariant="danger"
          onConfirm={() => { void confirmDeletePage() }}
        />
      ) : null}

      {promptModal ? (
        <PromptModal
          open
          title={promptModal.title}
          placeholder={promptModal.placeholder}
          defaultValue={promptModal.defaultValue}
          confirmLabel={promptModal.confirmLabel}
          cancelLabel={t('projects.dialog.cancel') || '取消'}
          onClose={() => setPromptModal(null)}
          onConfirm={(val) => {
            const fn = promptModal.onConfirm
            setPromptModal(null)
            void fn(val)
          }}
        />
      ) : null}
    </div>
  )
}
