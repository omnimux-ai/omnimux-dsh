import React, { useRef, useState } from 'react';
import { orderAfterRemoval, rejectionOf } from './media-slot.js';

/**
 * 一套素材卡槽。图片、视频、音频共用这一个组件，只换图标和能接收的文件。
 *
 * 不满 3 个并排。满 3 个收成一摞，右下角标数量；鼠标移到叠卡上摊开。
 * 还能继续加时，虚线框始终留在叠卡右侧，中间留出空隙。
 * 删掉一个时，它右边的往左补，左边不动。
 */

const PILE_AT = 3;
const CARD = 64;
const STEP = 74;
const PILE_WIDTH = 78;
const GAP = 14;

const ICONS = {
  image: (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <rect x="4" y="5" width="16" height="14" rx="2" />
      <circle cx="9" cy="10" r="1.3" fill="currentColor" stroke="none" />
      <path d="M7 16.5 10.2 13l2.2 2.2 2-1.7L18 16.5" strokeLinejoin="round" />
    </svg>
  ),
  video: (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <rect x="3.5" y="6.5" width="12" height="11" rx="2" />
      <path d="M15.5 10.5 20 8.2v7.6l-4.5-2.3z" strokeLinejoin="round" />
    </svg>
  ),
  audio: (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
      <path d="M4 10v4M8 7v10M12 4.5v15M16 8v8M20 10.5v3" />
    </svg>
  ),
};

function pileShift(index, count) {
  const depth = count - 1 - index;
  if (depth <= 0) return '2px';
  if (depth === 1) return '-2px';
  return '6px';
}

function readDuration(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const media = document.createElement(file.type.startsWith('audio/') ? 'audio' : 'video');
    const finish = (value) => {
      URL.revokeObjectURL(url);
      resolve(value);
    };
    media.preload = 'metadata';
    media.onloadedmetadata = () => finish(media.duration);
    media.onerror = () => finish(Number.NaN);
    media.src = url;
  });
}

export function MediaSlotGroup({ slot, items, onChange, onReject, disabled = false }) {
  const [open, setOpen] = useState(false);
  const inputRef = useRef(null);
  const count = items.length;
  const piled = count >= PILE_AT;
  const expanded = open || !piled;
  const room = slot.max == null ? Infinity : slot.max;
  const canAdd = count < room && !disabled;
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
      const reason = rejectionOf(file, slot, duration);
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
      });
    }
    if (next.length !== items.length) onChange(next);
  };

  const removeAt = (index) => {
    const removed = items[index];
    if (removed?.url) URL.revokeObjectURL(removed.url);
    onChange(orderAfterRemoval(items, index));
  };

  return (
    <div
      className={`omx-slot-group${piled ? ' is-piled' : ''}${expanded ? ' is-open' : ''}`}
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
          return (
            <div
              key={item.id}
              className={`omx-slot-card is-depth-${Math.min(count - 1 - index, 2)}${shown ? '' : ' is-hidden'}`}
              style={{ '--slot-shift': shift, '--slot-z': index + 1 }}
            >
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
          <button // exempt-ui01: 竖屏虚线卡槽，高度随素材比例，不是 32px 工具按钮
            type="button"
            className="omx-slot-add"
            style={{ '--slot-shift': `${adderAt}px` }}
            aria-label={slot.label ? `添加${slot.label}` : '添加素材'}
            onClick={() => inputRef.current?.click()}
          >
            {ICONS[slot.type]}
            {slot.label ? <span>{slot.label}</span> : null}
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
