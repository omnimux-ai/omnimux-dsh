/**
 * PromptTokenEditor — 富文本 Token 编辑器 (Issue #714 / Issue #737).
 *
 * 核心特性：
 * 1. 受控 ContentEditable + React Atomic Span 胶囊容器；
 * 2. Token 胶囊：<span class="wf-prompt-token nodrag" contenteditable="false">，内含缩略图、Label 与 ✕ 按钮；
 * 3. 按键拦截：Backspace/Delete 原子删除 Token 避免字符碎裂，键入 @ 呼出 MentionPopover；
 * 4. 对外暴露 ref: { insertToken, focus, getMarkdown }，支持卡槽卡片点击一键注入；
 * 5. 100% 消费 DSH --dsw-* tokens，底色完全透明，融入卡片；右下角渲染 Copy 助手与字数统计元数据栏。
 */

import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Copy } from 'lucide-react';
import type {
  NodeSlotEngineState,
  PromptReferenceToken,
} from '../../../../shared/graph/slotContractTypes.ts';
import {
  parseMarkdownToTokenSegments,
  serializeSegmentsToMarkdown,
} from './promptTokenCompiler.ts';
import MentionPopover from './MentionPopover.tsx';

export interface PromptTokenEditorRef {
  insertToken: (token: PromptReferenceToken) => void;
  focus: () => void;
  getMarkdown: () => string;
}

export interface PromptTokenEditorProps {
  value?: string;
  placeholder?: string;
  rows?: number;
  isExpanded?: boolean;
  disabled?: boolean;
  className?: string;
  slotState?: NodeSlotEngineState;
  children?: React.ReactNode;
  maxLength?: number;
  /** 外部权威计数（如音频朗读正文 code point 闸门）；缺省时回退到可视长度。 */
  countOverride?: number;
  materialType?: string;
  onChange?: (value: string) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLDivElement>) => void;
}

/**
 * 将容器 DOM 节点树序列化为存储 Markdown 字符串。
 */
function domToMarkdown(container: HTMLElement): string {
  let result = '';

  for (let i = 0; i < container.childNodes.length; i++) {
    const node = container.childNodes[i];
    if (!node) continue;
    if (node.nodeType === Node.TEXT_NODE) {
      result += node.nodeValue ?? '';
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      if (el.classList.contains('wf-prompt-token')) {
        const raw = el.getAttribute('data-raw');
        if (raw) {
          result += raw;
        } else {
          const nid = el.getAttribute('data-node-id') ?? '';
          const sidx = el.getAttribute('data-slot-index') ?? '0';
          const lbl = el.getAttribute('data-label') ?? '';
          result += `@ref[${nid}:${sidx}:${lbl}]`;
        }
      } else if (el.tagName === 'BR') {
        result += '\n';
      } else {
        result += domToMarkdown(el);
      }
    }
  }

  return result;
}

/**
 * 创建原子化 Token Span 元素
 */
function createTokenSpan(
  token: PromptReferenceToken,
  raw: string,
  onDelete: (span: HTMLElement) => void,
): HTMLElement {
  const span = document.createElement('span');
  span.className = 'wf-prompt-token nodrag';
  span.setAttribute('contenteditable', 'false');
  span.setAttribute('data-raw', raw);
  span.setAttribute('data-node-id', token.nodeId);
  span.setAttribute('data-slot-index', String(token.slotIndex));
  span.setAttribute('data-label', token.label);

  // 缩略图
  if (token.mediaUrl && token.materialType === 'image') {
    const img = document.createElement('img');
    img.src = token.mediaUrl;
    img.alt = token.label;
    img.className = 'wf-prompt-token__thumb';
    span.appendChild(img);
  } else {
    const icon = document.createElement('span');
    icon.className = 'wf-prompt-token__icon';
    icon.textContent = token.materialType === 'video' ? '🎬' : token.materialType === 'audio' ? '🎵' : '🖼️';
    span.appendChild(icon);
  }

  // Label
  const labelSpan = document.createElement('span');
  labelSpan.className = 'wf-prompt-token__label';
  labelSpan.textContent = token.label;
  span.appendChild(labelSpan);

  // 槽位编号
  const slotTag = document.createElement('span');
  slotTag.className = 'wf-prompt-token__slot-tag';
  slotTag.textContent = `#${token.slotIndex + 1}`;
  span.appendChild(slotTag);

  // ✕ 删除小按钮
  const delBtn = document.createElement('button');
  delBtn.type = 'button';
  delBtn.className = 'wf-prompt-token__delete';
  delBtn.setAttribute('aria-label', '删除引用');
  delBtn.textContent = '×';
  delBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    onDelete(span);
  });
  span.appendChild(delBtn);

  return span;
}

export const PromptTokenEditor = forwardRef<PromptTokenEditorRef, PromptTokenEditorProps>(
  (
    {
      value = '',
      placeholder,
      rows,
      isExpanded = false,
      disabled = false,
      className = '',
      slotState,
      children,
      maxLength,
      countOverride,
      materialType,
      onChange,
      onKeyDown: externalOnKeyDown,
    },
    ref,
  ) => {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const editorRef = useRef<HTMLDivElement | null>(null);
    const lastRenderedMarkdownRef = useRef<string>('');

    const [mentionOpen, setMentionOpen] = useState(false);
    const [mentionPosition, setMentionPosition] = useState<{ x: number; y: number } | null>(null);

    // 最大字数：生图 7500，视频及其他默认 7000，或由外部传入
    const effectiveMaxLength = maxLength ?? (materialType === 'image' ? 7500 : 7000);

    // 计算纯可视文本字符数（剥离 @ref 语法壳，保留 label）
    const visualLength = useMemo(() => {
      if (!value) return 0;
      const clean = value.replace(/@ref\[[^\]]*:([^\]]+)\]/g, '$1');
      return clean.length;
    }, [value]);

    // 展示计数与超限态：外部闸门计数优先，保证与生成阻断口径一致
    const displayCount = countOverride ?? visualLength;
    const exceeded = displayCount > effectiveMaxLength;

    // 删除 Token 回调
    const handleTokenDelete = useCallback(
      (span: HTMLElement) => {
        if (!editorRef.current) return;
        span.remove();
        const md = domToMarkdown(editorRef.current);
        lastRenderedMarkdownRef.current = md;
        onChange?.(md);
      },
      [onChange],
    );

    // 同步 Markdown 串到 ContentEditable DOM
    const syncMarkdownToDom = useCallback(
      (md: string) => {
        if (!editorRef.current) return;
        editorRef.current.innerHTML = '';

        const segments = parseMarkdownToTokenSegments(md, slotState);
        for (const seg of segments) {
          if (seg.type === 'text') {
            const lines = seg.text.split('\n');
            lines.forEach((line, idx) => {
              if (idx > 0) {
                editorRef.current?.appendChild(document.createElement('br'));
              }
              if (line) {
                editorRef.current?.appendChild(document.createTextNode(line));
              }
            });
          } else {
            const tokenSpan = createTokenSpan(seg.token, seg.raw, handleTokenDelete);
            editorRef.current.appendChild(tokenSpan);
          }
        }
        lastRenderedMarkdownRef.current = md;
      },
      [handleTokenDelete, slotState],
    );

    // 监听外部 value 属性变化（如外部重置或初始加载）
    useEffect(() => {
      if (typeof window === 'undefined') return;
      if (value !== lastRenderedMarkdownRef.current) {
        syncMarkdownToDom(value);
      }
    }, [value, syncMarkdownToDom]);

    // 输入事件处理：更新 Markdown 并通知父级
    const handleInput = useCallback(() => {
      if (!editorRef.current) return;
      const md = domToMarkdown(editorRef.current);
      lastRenderedMarkdownRef.current = md;
      onChange?.(md);

      // 检测光标前是否键入了 @
      if (typeof window !== 'undefined' && window.getSelection) {
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
          const range = sel.getRangeAt(0);
          if (range.collapsed && range.startContainer.nodeType === Node.TEXT_NODE) {
            const textContent = range.startContainer.nodeValue ?? '';
            const offset = range.startOffset;
            if (offset > 0 && textContent[offset - 1] === '@') {
              const rect = range.getBoundingClientRect();
              const containerRect = containerRef.current?.getBoundingClientRect();
              setMentionPosition({
                x: rect.left - (containerRect?.left ?? 0),
                y: rect.bottom - (containerRect?.top ?? 0),
              });
              setMentionOpen(true);
              return;
            }
          }
        }
      }
      setMentionOpen(false);
    }, [onChange]);

    // 插入 Token 纯实现
    const insertTokenImpl = useCallback(
      (token: PromptReferenceToken) => {
        if (!editorRef.current) return;
        const raw = `@ref[${token.nodeId}:${token.slotIndex}:${token.label}]`;
        const tokenSpan = createTokenSpan(token, raw, handleTokenDelete);

        if (typeof window !== 'undefined' && window.getSelection) {
          const sel = window.getSelection();
          if (sel && sel.rangeCount > 0 && editorRef.current.contains(sel.anchorNode)) {
            const range = sel.getRangeAt(0);

            // 若正处于 @ 唤起状态，删除光标前面的 @ 字符
            if (range.collapsed && range.startContainer.nodeType === Node.TEXT_NODE) {
              const textNode = range.startContainer as Text;
              const offset = range.startOffset;
              if (offset > 0 && textNode.nodeValue && textNode.nodeValue[offset - 1] === '@') {
                textNode.deleteData(offset - 1, 1);
              }
            }

            range.deleteContents();
            range.insertNode(tokenSpan);

            // 将光标移至 Token 之后并追加一个空格方便后续键入
            const spaceNode = document.createTextNode(' ');
            if (tokenSpan.nextSibling) {
              tokenSpan.parentNode?.insertBefore(spaceNode, tokenSpan.nextSibling);
            } else {
              tokenSpan.parentNode?.appendChild(spaceNode);
            }

            range.setStartAfter(spaceNode);
            range.collapse(true);
            sel.removeAllRanges();
            sel.addRange(range);
          } else {
            editorRef.current.appendChild(tokenSpan);
            editorRef.current.appendChild(document.createTextNode(' '));
          }
        } else {
          editorRef.current.appendChild(tokenSpan);
        }

        const nextMd = domToMarkdown(editorRef.current);
        lastRenderedMarkdownRef.current = nextMd;
        onChange?.(nextMd);
        setMentionOpen(false);
      },
      [handleTokenDelete, onChange],
    );

    // 键盘事件处理（拦截 Backspace/Delete 防止字符破碎）
    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLDivElement>) => {
        externalOnKeyDown?.(e);
        if (e.defaultPrevented) return;

        if (e.key === 'Backspace') {
          if (typeof window !== 'undefined' && window.getSelection) {
            const sel = window.getSelection();
            if (sel && sel.rangeCount > 0) {
              const range = sel.getRangeAt(0);
              if (range.collapsed) {
                // 如果光标在文本节点的开头，且前一个兄弟节点是 Token 胶囊，整块删除它
                if (range.startContainer.nodeType === Node.TEXT_NODE && range.startOffset === 0) {
                  const prevSibling = range.startContainer.previousSibling;
                  if (prevSibling && (prevSibling as HTMLElement).classList?.contains('wf-prompt-token')) {
                    e.preventDefault();
                    prevSibling.remove();
                    handleInput();
                    return;
                  }
                }
              }
            }
          }
        }
      },
      [externalOnKeyDown, handleInput],
    );

    // 对外暴露 ref 操作
    useImperativeHandle(
      ref,
      () => ({
        insertToken: (token: PromptReferenceToken) => {
          insertTokenImpl(token);
        },
        focus: () => {
          editorRef.current?.focus();
        },
        getMarkdown: () => {
          return editorRef.current ? domToMarkdown(editorRef.current) : '';
        },
      }),
      [insertTokenImpl],
    );

    return (
      <div ref={containerRef} className="wf-prompt-editor-container">
        <div
          ref={editorRef}
          contentEditable={!disabled}
          suppressContentEditableWarning
          className={`wf-prompt-token-editor nowheel nodrag ${
            isExpanded ? 'wf-prompt-token-editor--expanded' : ''
          } ${className}`}
          data-placeholder={placeholder}
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          role="textbox"
          aria-multiline="true"
          aria-label={placeholder || 'Prompt 输入'}
        >
          {value || null}
        </div>
        {children}

        {/* 字数与模式统计栏（对齐图 2） */}
        <div className="wf-prompt-token-meta-bar" data-testid="wf-prompt-token-meta-bar">
          <button
            type="button"
            className="wf-prompt-token-meta-btn nodrag"
            title="提示词助手"
            aria-label="提示词助手"
          >
            <Copy size={12} />
          </button>
          <span className="wf-prompt-token-meta-type">T</span>
          <span className="wf-prompt-token-meta-divider">|</span>
          <span
            className={`wf-prompt-token-meta-count${
              exceeded ? ' wf-prompt-token-meta-count--exceeded' : ''
            }`}
            data-exceeded={exceeded ? 'true' : 'false'}
            role={exceeded ? 'alert' : undefined}
          >
            {displayCount}/{effectiveMaxLength}
          </span>
        </div>

        <MentionPopover
          open={mentionOpen}
          position={mentionPosition}
          slotState={slotState}
          onSelect={insertTokenImpl}
          onClose={() => setMentionOpen(false)}
        />
      </div>
    );
  },
);

PromptTokenEditor.displayName = 'PromptTokenEditor';

export default PromptTokenEditor;
