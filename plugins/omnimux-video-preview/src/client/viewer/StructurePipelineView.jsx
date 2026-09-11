import React from 'react'
import { mapToCanonicalStage } from '../../breakdown-parser.js'

function findColonIndex(line) {
  const half = line.indexOf(': ')
  if (half !== -1) return half
  return line.indexOf('：')
}

function StructureDescriptionLine({ line, index }) {
  if (line.startsWith('### ')) {
    return (
      <div key={index} className="omnimux-video-breakdown-desc-heading">
        {line.replace(/^###\s*/, '')}
      </div>
    )
  }
  const colonIdx = findColonIndex(line)
  if (colonIdx !== -1 && colonIdx < 35) {
    const key = line.slice(0, colonIdx).trim()
    const val = line.slice(colonIdx + 1).trim()
    return (
      <div key={index} className="omnimux-video-breakdown-desc-row">
        <span className="omnimux-video-breakdown-desc-label">{key}：</span>
        <span className="omnimux-video-breakdown-desc-value">{val}</span>
      </div>
    )
  }
  return (
    <div key={index} className="omnimux-video-breakdown-desc-line">
      {line}
    </div>
  )
}

function StructureDescription({ desc }) {
  if (!desc || typeof desc !== 'string') return null
  const clean = desc.replace(/---\s*$/, '').trim()
  const lines = clean.split('\n').map((l) => l.trim()).filter(Boolean)
  const hasHeadings = lines.some((l) => l.startsWith('### '))
  const hasKeyValues = lines.some((l) => l.includes(': ') || l.includes('：'))

  if (!hasHeadings && !hasKeyValues) {
    return <div className="omnimux-video-breakdown-desc-line">{clean}</div>
  }

  return (
    <React.Fragment>
      {lines.map((line, idx) => (
        <StructureDescriptionLine key={idx} line={line} index={idx} />
      ))}
    </React.Fragment>
  )
}

function StructureCard({ item, index }) {
  const displayTitle = mapToCanonicalStage(item.stage || item.title, index)
  const quoteText = item.quote || ''

  return (
    <div className="omnimux-video-breakdown-structure-card">
      <div className="omnimux-video-breakdown-structure-title">{displayTitle}</div>
      {quoteText ? (
        <div className="omnimux-video-breakdown-structure-quote">
          <span className="omnimux-video-breakdown-quote-bar" />
          <span className="omnimux-video-breakdown-quote-text">{quoteText}</span>
        </div>
      ) : null}
      {item.description ? (
        <div className="omnimux-video-breakdown-structure-desc">
          <StructureDescription desc={item.description} />
        </div>
      ) : null}
    </div>
  )
}

function StructurePipelineBreadcrumbs({ pipeline }) {
  return (
    <div className="omnimux-video-breakdown-pipeline-row">
      {pipeline.map((stageName, pIdx) => (
        <React.Fragment key={pIdx}>
          <span className="omnimux-video-breakdown-pipeline-item">
            {mapToCanonicalStage(stageName, pIdx)}
          </span>
          {pIdx < pipeline.length - 1 ? (
            <span className="omnimux-video-breakdown-pipeline-arrow">→</span>
          ) : null}
        </React.Fragment>
      ))}
    </div>
  )
}

export function StructurePipelineView({ pipeline = [], structure = [], isZh = true }) {
  const hintText = isZh
    ? '识别结构片段并进行内容分析，帮助你审视节奏、卖点顺序与脚本编排。'
    : 'Identify structural segments and analyze content pacing, selling points, and script narrative.'

  return (
    <div className="omnimux-video-breakdown-structure-view">
      <div className="omnimux-video-breakdown-structure-hint">{hintText}</div>
      <StructurePipelineBreadcrumbs pipeline={pipeline} />
      <div className="omnimux-video-breakdown-structure-cards">
        {structure.map((item, sIdx) => (
          <StructureCard key={sIdx} item={item} index={sIdx} />
        ))}
      </div>
    </div>
  )
}
