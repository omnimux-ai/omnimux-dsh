import { cloneElement, createContext, forwardRef, useContext, useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type CSSProperties, type InputHTMLAttributes, type MouseEvent, type ReactElement, type ReactNode, type TextareaHTMLAttributes } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, LoaderCircle, X } from 'lucide-react';
import { directorPortal, directorServices } from './services';

/** Isolated React 19 controls follow host tokens. Host primitives contain React 18
 * elements and cannot be passed across this root; no AntD runtime or global CSS. */
type ConfirmOptions = { title: ReactNode; content?: ReactNode; okText?: string; cancelText?: string; onOk?: () => void | Promise<void>; onCancel?: () => void | Promise<void>; closable?: boolean; keyboard?: boolean; mask?: { closable?: boolean } };
type ControlContext = { confirm: (options: ConfirmOptions) => void; notify: (kind: 'success' | 'warning' | 'error' | 'info', message: string) => void };
const Context = createContext<ControlContext | null>(null);
export function ControlsProvider({ children }: { children: ReactNode }) {
  const [confirm, setConfirm] = useState<ConfirmOptions | null>(null);
  const [notice, setNotice] = useState<{kind: string; message: string} | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const confirmLock = useRef(false);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(null), 6000); return () => clearTimeout(timer); }, [notice]);
  const notify: ControlContext['notify'] = (kind, message) => { setNotice({kind,message}); directorServices().props.adapters.notify?.(kind,message); };
  return <Context.Provider value={{ confirm: setConfirm, notify }}>{children}{notice ? <div role={notice.kind === 'error' ? 'alert' : 'status'} className={`director-local-notice ${notice.kind === 'error' ? 'is-danger' : ''}`}>{notice.message}</div> : null}{confirm ? <Modal open title={confirm.title} onCancel={() => { if (confirmLock.current) return; void confirm.onCancel?.(); setConfirm(null); }} keyboard={confirm.keyboard} closable={confirm.closable} mask={confirm.mask} footer={<><Button disabled={confirmBusy} onClick={() => { void confirm.onCancel?.(); setConfirm(null); }}>{confirm.cancelText || '取消'}</Button><Button type="primary" loading={confirmBusy} onClick={async () => { if (confirmLock.current) return; confirmLock.current = true; setConfirmBusy(true); try { await confirm.onOk?.(); setConfirm(null); } catch (error) { notify('error', error instanceof Error ? error.message : '操作失败，请重试'); } finally { confirmLock.current = false; setConfirmBusy(false); } }}>{confirm.okText || '确认'}</Button></>}>{confirm.content}</Modal> : null}</Context.Provider>;
}
export const App = { useApp() {
  const context = useContext(Context);
  if (!context) throw new Error('导演台控件尚未初始化');
  const notify = (kind: 'success' | 'warning' | 'error' | 'info') => (message: string) => context.notify(kind, message);
  return { message: { success: notify('success'), warning: notify('warning'), error: notify('error'), info: notify('info') }, modal: { confirm: context.confirm } };
} };
export const Button = forwardRef<HTMLButtonElement, Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'> & { type?: 'primary' | 'default' | 'text'; block?: boolean; size?: string; loading?: boolean; danger?: boolean; icon?: ReactNode; ghost?: boolean; shape?: string }>(function Button({ type, block, size: _size, loading, danger, icon, ghost: _ghost, shape: _shape, className = '', disabled, children, ...rest }, ref) {
  return <button {...rest} ref={ref} type="button" className={`director-control director-button ${type === 'primary' ? 'is-primary' : ''} ${danger ? 'is-danger' : ''} ${block ? 'w-full' : ''} ${className}`} disabled={disabled || loading} aria-busy={loading || undefined}>{loading ? <LoaderCircle size={14} className="animate-spin" /> : icon}{children}</button>;
});
type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'size' | 'prefix'> & { size?: string; variant?: string; prefix?: ReactNode; suffix?: ReactNode };
const TextInput = forwardRef<HTMLInputElement, InputProps>(function TextInput({ size: _size, variant: _variant, prefix, suffix, className = '', ...rest }, ref) { return <span className={`director-input-wrap ${className}`}>{prefix}<input {...rest} ref={ref} className="director-control director-input" />{suffix}</span>; });
const TextArea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { autoSize?: boolean | { minRows?: number; maxRows?: number }; variant?: string }>(function TextArea({ autoSize, variant: _variant, className = '', ...rest }, ref) { return <textarea {...rest} rows={rest.rows ?? (typeof autoSize === 'object' ? autoSize.minRows : 3)} ref={ref} className={`director-control director-textarea ${className}`} />; });
export const Input = Object.assign(TextInput, { TextArea });
export function InputNumber({ value, onChange, size: _size, controls: _controls, precision, variant: _variant, addonAfter, addonBefore, suffix, className = '', ...rest }: Omit<InputHTMLAttributes<HTMLInputElement>, 'size' | 'value' | 'onChange'> & { size?: string; controls?: boolean; precision?: number; variant?: string; value?: number | null; onChange?: (value: number | null) => void; addonAfter?: ReactNode; addonBefore?: ReactNode; suffix?: ReactNode }) {
  const [draft, setDraft] = useState(String(value ?? ''));
  const focused = useRef(false);
  useEffect(() => { if (!focused.current) setDraft(String(value ?? '')); }, [value]);
  const finite = (text: string): number | null => text.trim() && Number.isFinite(Number(text)) ? Number(text) : null;
  const normalize = (number: number) => { const bounded = Math.max(rest.min === undefined ? -Infinity : Number(rest.min), Math.min(rest.max === undefined ? Infinity : Number(rest.max), number)); return precision === undefined ? bounded : Number(bounded.toFixed(precision)); };
  return <span className={`director-input-wrap ${className}`}>{addonBefore}<input {...rest} className="director-control director-input" type="text" inputMode="decimal" role="spinbutton" aria-valuenow={value ?? undefined} aria-valuemin={rest.min === undefined ? undefined : Number(rest.min)} aria-valuemax={rest.max === undefined ? undefined : Number(rest.max)} value={draft} onFocus={event => { focused.current = true; rest.onFocus?.(event); }} onChange={event => { const text = event.currentTarget.value; if (!/^-?(?:\d*\.?\d*)?$/.test(text)) return; setDraft(text); const number = finite(text); if (number !== null && (rest.min === undefined || number >= Number(rest.min)) && (rest.max === undefined || number <= Number(rest.max))) onChange?.(precision === undefined ? number : Number(number.toFixed(precision))); else if (!text) onChange?.(null); }} onBlur={event => { focused.current = false; const number = finite(draft); const next = number === null ? value ?? null : normalize(number); setDraft(String(next ?? '')); if (next !== null) onChange?.(next); rest.onBlur?.(event); }} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); if (event.key === 'ArrowUp' || event.key === 'ArrowDown') { event.preventDefault(); const next = normalize((finite(draft) ?? value ?? 0) + (event.key === 'ArrowUp' ? 1 : -1) * Number(rest.step || 1)); setDraft(String(next)); onChange?.(next); } rest.onKeyDown?.(event); }} />{addonAfter || suffix}</span>;
}
export function Switch({ checked, onChange, size: _size, className = '', ...rest }: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onChange'> & { checked: boolean; onChange: (checked: boolean) => void; size?: string }) { return <button {...rest} type="button" className={`director-switch ${className}`} role="switch" aria-checked={checked} onClick={() => onChange(!checked)}><span /></button>; }
export function Slider({ value, onChange, onChangeComplete, ariaLabelForHandle, className = '', ...rest }: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & { value: number; onChange?: (value: number) => void; onChangeComplete?: (value: number) => void; ariaLabelForHandle?: string }) {
  const [current, setCurrent] = useState(value);
  useEffect(() => setCurrent(value), [value]);
  return <input {...rest} type="range" className={`director-slider ${className}`} aria-label={rest['aria-label'] || ariaLabelForHandle} value={current} onChange={event => { setCurrent(event.currentTarget.valueAsNumber); onChange?.(event.currentTarget.valueAsNumber); }} onPointerUp={() => onChangeComplete?.(current)} onPointerCancel={() => onChangeComplete?.(current)} onKeyUp={() => onChangeComplete?.(current)} onBlur={() => onChangeComplete?.(current)} />;
}
export function ColorPicker({ value, onChange }: { value: string; onChange: (color: { toHexString(): string }, hex: string) => void }) { return <input type="color" aria-label="颜色" className="director-color" value={value} onChange={event => { const hex = event.currentTarget.value; onChange({ toHexString: () => hex }, hex); }} />; }
export type MenuInfo = { key: string; domEvent: MouseEvent<HTMLElement> };
export interface MenuItem { key?: string; type?: 'group' | 'divider'; label?: ReactNode; icon?: ReactNode; children?: MenuItem[]; disabled?: boolean; danger?: boolean; title?: string; onClick?: (info: MenuInfo) => void }
export type MenuProps = { items?: MenuItem[]; selectedKeys?: string[]; selectable?: boolean; style?: CSSProperties };
function MenuRows({ items, selectedKeys, close }: { items: MenuItem[]; selectedKeys?: string[]; close: () => void }) { return <>{items.map((item, index) => item.type === 'divider' ? <hr key={index} /> : item.children ? <div key={item.key || index}><div className="director-menu-heading">{item.label}</div><MenuRows items={item.children} selectedKeys={selectedKeys} close={close} /></div> : <button key={item.key || index} role="menuitem" type="button" disabled={item.disabled} title={item.title} className={`director-menu-item ${item.danger ? 'is-danger' : ''}`} aria-selected={selectedKeys?.includes(item.key || '')} onClick={event => { item.onClick?.({ key: item.key || '', domEvent: event }); close(); }}>{item.icon}{item.label}</button>)}</>; }
export function Dropdown({ children, menu, dropdownRender, open: controlled, onOpenChange, trigger = ['click'], placement = 'bottomLeft' }: { children: ReactElement; menu?: MenuProps; dropdownRender?: () => ReactNode; open?: boolean; onOpenChange?: (open: boolean) => void; trigger?: string[]; placement?: string }) {
  const [local, setLocal] = useState(false); const open = controlled ?? local;
  const [point, setPoint] = useState<{ x: number; y: number } | null>(null);
  const anchor = useRef<HTMLSpanElement>(null); const popup = useRef<HTMLDivElement>(null);
  const setOpen = (next: boolean) => { setLocal(next); onOpenChange?.(next); };
  useEffect(() => {
    if (!open) return;
    const pointer = (event: PointerEvent) => { if (!anchor.current?.contains(event.target as Node) && !popup.current?.contains(event.target as Node)) setOpen(false); };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.stopPropagation(); event.stopImmediatePropagation(); setOpen(false); anchor.current?.querySelector('button')?.focus(); }
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) || !popup.current?.contains(document.activeElement)) return;
      const rows = Array.from(popup.current.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')); const index = rows.indexOf(document.activeElement as HTMLButtonElement);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? rows.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length;
      event.preventDefault(); rows[next]?.focus();
    };
    document.addEventListener('pointerdown', pointer); document.addEventListener('keydown', key, true);
    popup.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
    return () => { document.removeEventListener('pointerdown', pointer); document.removeEventListener('keydown', key, true); };
  }, [open]);
  const position = point || (() => { const box = anchor.current?.getBoundingClientRect(); return { x: box?.left || 0, y: placement.startsWith('top') ? box?.top || 0 : box?.bottom || 0 }; })();
  return <span ref={anchor} className="director-dropdown-anchor" onClick={event => { if (event.target instanceof Element && event.target.closest('button:disabled')) return; if (trigger.includes('click')) { setPoint(null); setOpen(!open); } }} onContextMenu={event => { if (trigger.includes('contextMenu')) { event.preventDefault(); setPoint({ x: event.clientX, y: event.clientY }); setOpen(true); } }}>{children}{open ? createPortal(<div ref={popup} role="menu" className="director-menu" style={{ ...menu?.style, left: Math.min(position.x, window.innerWidth - 260), top: Math.min(position.y, window.innerHeight - 320), ...(placement.startsWith('top') && !point ? { transform: 'translateY(-100%)' } : {}) }}>{dropdownRender ? dropdownRender() : <MenuRows items={menu?.items || []} selectedKeys={menu?.selectedKeys} close={() => setOpen(false)} />}</div>, directorPortal()) : null}</span>;
}
export function Select<T extends string | number>({ value, options, onChange, placeholder, disabled, className = '', allowClear, ...rest }: { value?: T; options: Array<{ label: ReactNode; value: T; disabled?: boolean }>; onChange: (value: T) => void; placeholder?: string; disabled?: boolean; className?: string; allowClear?: boolean; size?: string; variant?: string; 'aria-label'?: string }) {
  return <Dropdown menu={{ items: [...(allowClear ? [{ key: 'clear', label: '清除', onClick: () => onChange('' as T) }] : []), ...options.map(option => ({ key: String(option.value), label: option.label, disabled: option.disabled, onClick: () => onChange(option.value) }))] }}><button type="button" className={`director-control director-select ${className}`} disabled={disabled} aria-haspopup="listbox" aria-label={rest['aria-label']}>{options.find(option => option.value === value)?.label || placeholder || '请选择'}<ChevronDown size={14} /></button></Dropdown>;
}
export function Tooltip({ children, title }: { children: ReactElement; title: string; placement?: string }) { const [open, setOpen] = useState(false); const id = useId(); return <span className="director-tooltip-anchor" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}>{cloneElement(children, { 'aria-describedby': open ? id : undefined } as Record<string, unknown>)}{open ? <span id={id} role="tooltip" className="director-tooltip">{title}</span> : null}</span>; }
export function Modal({ open, title, children, footer, onCancel, width = 680, closable = true, keyboard = true, mask, onOk, okText = '确认', cancelText = '取消', ..._rest }: { open: boolean; title?: ReactNode; children?: ReactNode; footer?: ReactNode; onCancel?: () => void; width?: number; closable?: boolean; keyboard?: boolean; mask?: { closable?: boolean }; onOk?: () => void | Promise<void>; okText?: string; cancelText?: string; destroyOnHidden?: boolean; styles?: unknown; confirmLoading?: boolean; okButtonProps?: { disabled?: boolean }; className?: string }) {
  const dialog = useRef<HTMLDivElement>(null); const titleId = useId();
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const key = (event: KeyboardEvent) => { if (keyboard && event.key === 'Escape') { if (directorPortal().querySelector('[role="menu"]')) return; event.stopPropagation(); event.stopImmediatePropagation(); onCancel?.(); } if (event.key === 'Tab') { const controls = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),[tabindex="0"]') || []); const first = controls[0]; const last = controls.at(-1); if (!dialog.current?.contains(document.activeElement) || document.activeElement === dialog.current) { event.preventDefault(); (event.shiftKey ? last : first)?.focus(); } else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); } } };
    document.addEventListener('keydown', key, true); dialog.current?.focus();
    return () => { document.removeEventListener('keydown', key, true); if (previous?.isConnected) previous.focus(); };
  }, [open, keyboard, onCancel]);
  if (!open) return null;
  return createPortal(<div className="director-modal-mask" onPointerDown={event => { if (event.target === event.currentTarget && mask?.closable !== false) onCancel?.(); }}><div ref={dialog} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} className="director-modal" style={{ width }}><header><h2 id={titleId}>{title}</h2>{closable ? <Button aria-label="关闭" onClick={onCancel}><X size={16} /></Button> : null}</header><div className="director-modal-content">{children}</div>{footer !== null ? <footer>{footer ?? <><Button onClick={onCancel}>{cancelText}</Button><Button type="primary" disabled={_rest.okButtonProps?.disabled} loading={_rest.confirmLoading} onClick={() => void onOk?.()}>{okText}</Button></>}</footer> : null}</div></div>, directorPortal());
}
export function Image({ src, alt, className = '', width: _width, preview: _preview }: { src: string; alt: string; className?: string; width?: string; preview?: { mask?: string } }) { const [open, setOpen] = useState(false); return <><button type="button" className="director-image-preview" aria-label={`查看${alt}`} onClick={() => setOpen(true)}><img src={src} alt={alt} className={className} /></button><Modal open={open} title={alt} footer={null} onCancel={() => setOpen(false)} width={960}><img src={src} alt={alt} style={{ width: '100%', maxHeight: '70vh', objectFit: 'contain' }} /></Modal></>; }
