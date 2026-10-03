import React, { useRef, useState } from 'react';
import { orderAfterRemoval, rejectionOf } from './media-slot.js';

/**
 * 一套素材卡槽。图片、视频、音频共用这一个组件，只换图标和能接收的文件。
 *
 * 不满 3 个并排。满 3 个收成一摞，右下角标数量；鼠标移到叠卡上摊开。
 * 还能继续加时，虚线框始终留在叠卡右侧，中间留出空隙。
 * 删掉一个时，它右边的往左补，左边不动。
 * 锁定 64×64 1:1 尺寸；支持点击打开参考素材选择面板；支持已填入卡片角标渲染（标记 N）。
 */

const PILE_AT = 3;
const CARD = 40;
const STEP = 48;
const PILE_WIDTH = 50;
const GAP = 10;

const ICONS = {
  image: (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M16 5h6" />
      <path d="M19 2v6" />
      <path d="M21 11.5V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7.5" />
      <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
      <circle cx="9" cy="9" r="2" />
    </svg>
  ),
  video: (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M16 5h6" />
      <path d="M19 2v6" />
      <rect x="2.5" y="6.5" width="12" height="12" rx="2" />
      <polygon points="14.5 10.5 19.5 8 19.5 17 14.5 14.5" />
    </svg>
  ),
  audio: (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M16 5h6" />
      <path d="M19 2v6" />
      <path d="M4 10v4M8 7v10M12 4.5v15M16 8v8" />
    </svg>
  ),
};

function pileShift(index, count) {
  const depth = count - 1 - index;
  if (depth <= 0) return '2px';
  if (depth === 1) return '-2px';
  return '6px';
}

export function readDuration(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const media = document.createElement(file.type.startsWith('audio/') ? 'audio' : 'video');
    let done = false;
    const timer = window.setTimeout(() => finish(Number.NaN), 10000);
    const finish = (value) => {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      media.removeAttribute('src');
      media.load?.();
      URL.revokeObjectURL(url);
      resolve(value);
    };
    media.preload = 'metadata';
    media.onloadedmetadata = () => finish(media.duration);
    media.onerror = () => finish(Number.NaN);
    media.src = url;
  });
}

export function MediaSlotGroup({
  slot,
  items,
  onChange,
  onReject,
  disabled = false,
  onOpenReferencePicker,
  lockReason = '',
  framePair = null,
}) {
  const [open, setOpen] = useState(false);
  const inputRef = useRef(null);
  const count = items.length;
  const piled = count >= PILE_AT;
  const expanded = open || !piled;
  const room = slot.max == null ? Infinity : slot.max;
  const canAdd = count < room && !disabled;
  // 视频模式首帧/尾帧成对空卡槽：加号上置 + 槽名下置 + 微倾斜（样式见 styles.js 的 is-frame-*）。
  // 成对由父级按相邻槽判定后传入 framePair；单首帧/单尾帧方式不挂样式，与现状一致。
  let frameRole = '';
  if (framePair === 'first' && slot.role === 'first_frame') {
    frameRole = 'is-frame-first';
  } else if (framePair === 'last' && slot.role === 'last_frame') {
    frameRole = 'is-frame-last';
  }
  const isFrameSlot = frameRole !== '';
  const adderAt = piled && !expanded ? PILE_WIDTH + GAP : count * STEP;
  const fanWidth = canAdd ? adderAt + CARD : (expanded ? Math.max(count, 1) * STEP : PILE_WIDTH);

  const addFiles = async (files) => {
    const next = [...items];
    for (const file of files) {
      if (next.length >= room) {
        onReject?.(`最多添加 ${room} 个`);
        break;
      }
      const duration = slot.durationMax != null && (slot.type === 'video' || slot.type === 'audio')
        ? await readDuration(file)
        : null;
      if (slot.durationMax != null && !Number.isFinite(duration)) {
        onReject?.('这个文件读不出来');
        continue;
      }
      const reason = rejectionOf(file, slot, duration, { existing: next });
      if (reason) {
        onReject?.(reason);
        continue;
      }
      next.push({
        id: `${Date.now()}-${next.length}-${file.name}`,
        name: file.name,
        type: file.type,
        url: URL.createObjectURL(file),
        file,
        isLocalUpload: true,
        ...(Number.isFinite(duration) ? { durationSec: duration } : {}),
      });
    }
    if (next.length !== items.length) onChange(next);
  };

  const removeAt = (index) => {
    onChange(orderAfterRemoval(items, index));
  };

  const defaultTypeLabel = slot.type === 'video' ? '添加视频' : slot.type === 'audio' ? '添加音频' : '添加图片';
  const addLabel = slot.label || (items.length > 0 ? '添加参考' : defaultTypeLabel);

  return (
    <div
      className={`omx-slot-group${isFrameSlot ? ` is-frame ${frameRole}` : ''}${piled ? ' is-piled' : ''}${expanded ? ' is-open' : ''}`}
      style={{ '--slot-fan-width': `${fanWidth}px` }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <div className="omx-slot-fan">
        {items.map((item, index) => {
          const shown = expanded || index >= count - PILE_AT;
          const shift = expanded ? `${index * STEP}px` : pileShift(index, count);
          const badgeText = item.markBadge || item.badge || null;
          return (
            <div
              key={item.id}
              className={`omx-slot-card is-depth-${Math.min(count - 1 - index, 2)}${shown ? '' : ' is-hidden'}`}
              style={{ '--slot-shift': shift, '--slot-z': index + 1 }}
            >
              {/* 支持已填入卡片角标渲染（标记 N / 首帧 / 尾帧） */}
              {badgeText ? (
                <span className="omx-slot-badge-mark">{badgeText}</span>
              ) : null}

              {slot.type === 'audio' ? (
                <span className="omx-slot-audio">{ICONS.audio}</span>
              ) : slot.type === 'video' ? (
                <video src={item.url} muted />
              ) : (
                <img src={item.url} alt="" />
              )}
              <button // exempt-ui01: 卡槽内的移除是 18px 叠层按钮，套不进 32px 的通用按钮
                type="button"
                className="omx-slot-remove"
                aria-label="移除"
                onClick={(event) => {
                  event.stopPropagation();
                  removeAt(index);
                }}
              >
                <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
                  <path d="M2 2l6 6M8 2 2 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          );
        })}
        {canAdd ? (
          <button // exempt-ui01: 40×56px 按钮边框线卡槽，类名避免含 add 防宿主污染
            type="button"
            className={`omx-slot-btn${lockReason ? ' is-locked' : ''}`}
            style={{ '--slot-shift': `${adderAt}px` }}
            aria-label={addLabel}
            aria-disabled={lockReason ? 'true' : undefined}
            title={lockReason || addLabel}
            onClick={() => {
              if (lockReason) {
                onReject?.(lockReason);
                return;
              }
              if (onOpenReferencePicker) {
                onOpenReferencePicker(slot);
              } else {
                inputRef.current?.click();
              }
            }}
          >
            {isFrameSlot ? (
              <>
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                {slot.label ? <span className="omx-slot-btn-label" aria-hidden="true">{slot.label}</span> : null}
              </>
            ) : (
              ICONS[slot.type] || ICONS.image
            )}
          </button>
        ) : null}
      </div>
      {piled && !expanded ? <span className="omx-slot-count">{count}</span> : null}
      <input
        ref={inputRef}
        className="omx-slot-file"
        type="file"
        accept={slot.allowedMimes.length > 0 ? slot.allowedMimes.join(',') : `${slot.type}/*`}
        multiple={room - count > 1}
        onChange={(event) => {
          const picked = [...(event.target.files ?? [])];
          event.target.value = '';
          addFiles(picked);
        }}
      />
    </div>
  );
}

export default MediaSlotGroup;
