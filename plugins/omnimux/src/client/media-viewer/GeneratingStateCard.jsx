import React from 'react';

/**
 * GeneratingStateCard
 * Replicates the canvas-node organic shimmer & dot matrix animation.
 *
 * @param {{ statusText?: string, className?: string }} props
 */
export function GeneratingStateCard({ statusText = 'AI 正在渲染中…', className = '' }) {
  return (
    <div className={`omx-generating-box ${className}`}>
      <div className="omx-dot-matrix" aria-hidden="true" />
      <div className="omx-shimmer-overlay" aria-hidden="true">
        <div className="omx-shimmer-canvas">
          <div className="omx-shimmer-field" />
          <div className="omx-shimmer-distortion" />
        </div>
      </div>
      <div
        style={{
          position: 'absolute',
          bottom: '14px',
          left: '14px',
          zIndex: 10,
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          background: 'var(--dsw-alias-bg-layer-2)',
          padding: '4px 10px',
          borderRadius: '9999px',
          fontSize: '12px',
          color: 'var(--dsw-alias-label-primary)',
          border: '1px solid var(--dsw-alias-border-l2)',
        }}
      >
        <span
          style={{
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            background: 'var(--dsw-alias-brand-primary)',
            boxShadow: '0 0 8px var(--dsw-alias-brand-primary)',
          }}
        />
        <span>{statusText}</span>
      </div>
    </div>
  );
}
