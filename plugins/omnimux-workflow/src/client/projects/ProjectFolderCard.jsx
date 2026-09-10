import React from 'react'
import { IconEditOutline16, IconTrashOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import { IconButton } from 'dsh-ui-kit'

/** 拟物文件夹卡片顶部声波纹理 SVG */
function WaveformTexture() {
  return (
    <svg viewBox="0 0 200 48" fill="none" className="omnimux-folder-waveform-svg" aria-hidden="true">
      <path
        d="M10 24L15 14L20 34L25 18L30 30L35 8L40 40L45 16L50 32L55 20L60 28L65 10L70 38L75 22L80 26L85 14L90 34L95 18L100 30L105 12L110 36L115 16L120 32L125 24L130 24L135 14L140 34L145 18L150 30L155 8L160 40L165 16L170 32L175 24L180 24L185 18L190 30"
        stroke="var(--dsw-alias-brand-primary, #8b5cf6)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function ProjectFolderCard({ project, onOpen, onRename, onDelete, t }) {
  const dateStr = project.updatedAt
    ? new Date(project.updatedAt).toLocaleDateString().replace(/\//g, '.')
    : ''

  return (
    <div
      className="omnimux-project-folder-card"
      onClick={() => onOpen(project)}
      title={`点击打开项目：${project.title}`}
    >
      {/* 上部：拟物文件夹内衬封套 */}
      <div className="omnimux-project-folder-cover">
        <div className="omnimux-folder-tab-shape">
          <WaveformTexture />
        </div>
      </div>

      {/* 下部：项目信息 */}
      <div className="omnimux-project-folder-info">
        <div className="omnimux-project-folder-title" title={project.title}>
          {project.title}
        </div>
        <div className="omnimux-project-folder-meta">
          <span>{dateStr || '2026.9.9'}</span>
          <div
            className="omnimux-workflow-card-actions omnimux-workflow-card-actions--visible"
            onClick={(e) => e.stopPropagation()}
          >
            <IconButton
              variant="ghost"
              size="xs"
              title={t('projects.rename') || '重命名'}
              aria-label={t('projects.rename') || '重命名'}
              onClick={() => onRename(project)}
            >
              <IconEditOutline16 size={14} />
            </IconButton>
            <IconButton
              variant="ghost"
              size="xs"
              title={t('projects.delete') || '删除'}
              aria-label={t('projects.delete') || '删除'}
              onClick={() => onDelete(project)}
            >
              <IconTrashOutline16 size={14} />
            </IconButton>
          </div>
        </div>
      </div>
    </div>
  )
}
