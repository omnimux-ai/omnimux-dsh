import { ButtonHTMLAttributes, HTMLAttributes, InputHTMLAttributes, MouseEvent, ReactNode, ReactPortal, TableHTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from "react";
import { TooltipSide } from "@deepseek-ai/dsh-client-ui-primitives";
//#region src/button/Button.d.ts
type ButtonVariant = "primary" | "secondary" | "ghost" | "outline" | "danger";
type ButtonSize = "default" | "sm" | "xs";
interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  type?: "button" | "submit" | "reset";
}
/**
 * 32 / 28 / 24 workbench button. Consumes `--dsw-alias-*` tokens so light and
 * dark both follow the host theme (including OmniMux full-shell tint).
 */
declare const Button: import("react").ForwardRefExoticComponent<ButtonProps & import("react").RefAttributes<HTMLButtonElement>>;
interface IconButtonProps extends Omit<ButtonProps, "leadingIcon" | "trailingIcon" | "children"> {
  /** Required accessible name. Also used as tooltip when `title` is omitted. */
  "aria-label": string;
  /** Tooltip copy. Falls back to `aria-label`. */
  title?: string;
  tooltipSide?: TooltipSide;
  children: ReactNode;
}
/** Square icon-only button with an official Tooltip and a required aria-label. */
declare const IconButton: import("react").ForwardRefExoticComponent<IconButtonProps & import("react").RefAttributes<HTMLButtonElement>>;
//#endregion
//#region src/button/CopyButton.d.ts
type CopyState = "idle" | "copied" | "error";
interface CopyButtonProps extends Omit<ButtonProps, "onClick" | "size" | "variant" | "onCopy" | "onError"> {
  /** Text content to copy, or an accessor function returning text / Promise<string>. */
  text: string | (() => string | Promise<string>);
  /** Reset timeout in ms, defaults to 2000. */
  timeout?: number;
  /** Idle button label, defaults to '复制'. Pass empty string or null to hide label. */
  label?: string;
  /** Success label, defaults to '已复制'. */
  copiedLabel?: string;
  /** Error label, defaults to '复制失败'. */
  errorLabel?: string;
  /** Button size tier, defaults to 'sm'. */
  size?: ButtonSize;
  /** Button visual variant, defaults to 'ghost'. */
  variant?: ButtonVariant;
  /** Callback fired after successfully copying to clipboard. */
  onCopy?: (text: string) => void;
  /** Callback fired if copying to clipboard fails. */
  onError?: (err: Error) => void;
  /** Whether to render state icons, defaults to true. */
  showIcon?: boolean;
  /** Optional click handler callback. */
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void;
}
/**
 * One-click copy button with 2s automatic reset state machine and clipboard fallback.
 */
declare const CopyButton: import("react").ForwardRefExoticComponent<CopyButtonProps & import("react").RefAttributes<HTMLButtonElement>>;
//#endregion
//#region src/badge/Badge.d.ts
type BadgeVariant = "default" | "neutral" | "brand" | "success" | "warning" | "error" | "info";
type BadgeShape = "capsule" | "dot" | "square";
type BadgeSize = "sm" | "md" | "lg";
interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  /** Visual semantic variant, defaults to 'default'. */
  variant?: BadgeVariant;
  /** Shape style, defaults to 'capsule'. */
  shape?: BadgeShape;
  /** Size tier, defaults to 'md'. */
  size?: BadgeSize;
  /** Whether to render as an isolated status dot without label/count. */
  dot?: boolean;
  /** Optional numerical badge count. Displays `${maxCount}+` if count exceeds maxCount. */
  count?: number;
  /** Maximum display count threshold, defaults to 99. */
  maxCount?: number;
  /** Optional leading icon node. */
  icon?: ReactNode;
  /** Custom class name. */
  className?: string;
  /** Child label content. */
  children?: ReactNode;
}
/**
 * Universal badge / status indicator conforming to official `--dsw-alias-*` tokens.
 */
declare const Badge: import("react").ForwardRefExoticComponent<BadgeProps & import("react").RefAttributes<HTMLSpanElement>>;
//#endregion
//#region src/tile/SelectableTile.d.ts
type TileSelectionMode = "checkbox" | "radio";
interface SelectableTileProps {
  /** Unique identifier for the tile. */
  id: string;
  /** Whether the tile is currently selected. */
  selected?: boolean;
  /** Main tile title. */
  title: ReactNode;
  /** Subtitle or explanatory text. */
  description?: ReactNode;
  /** Status badge slot. */
  badge?: ReactNode;
  /** Leading icon or avatar slot. */
  icon?: ReactNode;
  /** Extra slot for trailing actions or metadata. */
  extra?: ReactNode;
  /** Whether the tile is disabled. */
  disabled?: boolean;
  /** Whether the tile is in a loading state. */
  loading?: boolean;
  /** Selection mode: 'checkbox' or 'radio', defaults to 'checkbox'. */
  selectionType?: TileSelectionMode;
  /** Callback fired when selection state changes. */
  onChange?: (selected: boolean, id: string) => void;
  /** Custom class name. */
  className?: string;
}
/**
 * Multi-line block-level selectable tile solving the 32px Button constraint.
 * Supports keyboard navigation (Space / Enter) and official `--dsw-alias-*` tokens.
 */
declare const SelectableTile: import("react").ForwardRefExoticComponent<SelectableTileProps & import("react").RefAttributes<HTMLDivElement>>;
//#endregion
//#region src/table/Table.d.ts
type SortDirection = "asc" | "desc" | null;
interface TableProps extends TableHTMLAttributes<HTMLTableElement> {
  /** Whether the table header sticks to the top of its scroll container. */
  stickyHeader?: boolean;
  /** Whether cell borders are visible around every cell. */
  bordered?: boolean;
  /** Dense mode with reduced cell padding. */
  dense?: boolean;
}
declare const Table: import("react").ForwardRefExoticComponent<TableProps & import("react").RefAttributes<HTMLTableElement>>;
interface TableHeaderProps extends HTMLAttributes<HTMLTableSectionElement> {}
declare const TableHeader: import("react").ForwardRefExoticComponent<TableHeaderProps & import("react").RefAttributes<HTMLTableSectionElement>>;
interface TableBodyProps extends HTMLAttributes<HTMLTableSectionElement> {}
declare const TableBody: import("react").ForwardRefExoticComponent<TableBodyProps & import("react").RefAttributes<HTMLTableSectionElement>>;
interface TableRowProps extends HTMLAttributes<HTMLTableRowElement> {
  /** Whether this row is currently selected/highlighted. */
  selected?: boolean;
}
declare const TableRow: import("react").ForwardRefExoticComponent<TableRowProps & import("react").RefAttributes<HTMLTableRowElement>>;
interface TableCellProps extends TdHTMLAttributes<HTMLTableCellElement> {
  /** Text alignment inside cell. */
  align?: "left" | "center" | "right" | undefined;
}
declare const TableCell: import("react").ForwardRefExoticComponent<TableCellProps & import("react").RefAttributes<HTMLTableCellElement>>;
interface TableHeadProps extends ThHTMLAttributes<HTMLTableCellElement> {
  /** Text alignment inside header cell. */
  align?: "left" | "center" | "right" | undefined;
  /** Whether this column header is clickable for sorting. */
  sortable?: boolean | undefined;
  /** Current sort direction. */
  sortDirection?: SortDirection | undefined;
}
declare const TableHead: import("react").ForwardRefExoticComponent<TableHeadProps & import("react").RefAttributes<HTMLTableCellElement>>;
//#endregion
//#region src/table/DataTable.d.ts
interface HeaderContext<T> {
  column: ColumnDef<T>;
  sortDirection: SortDirection;
  toggleSort: () => void;
}
interface CellContext<T> {
  row: T;
  rowIndex: number;
  column: ColumnDef<T>;
  value: unknown;
}
interface ColumnDef<T> {
  /** Unique column key. */
  id: string;
  /** Header display node or render function. */
  header: ReactNode | ((ctx: HeaderContext<T>) => ReactNode);
  /** Key on row data object. */
  accessorKey?: keyof T;
  /** Custom data accessor function. */
  accessorFn?: (row: T) => unknown;
  /** Custom cell render function. */
  cell?: (ctx: CellContext<T>) => ReactNode;
  /** Whether the column supports sorting. */
  sortable?: boolean;
  /** Fixed width or percentage. */
  width?: number | string;
  /** Minimum width. */
  minWidth?: number;
  /** Content text alignment. */
  align?: "left" | "center" | "right";
}
interface DataTableProps<T> {
  /** Array of row data records. */
  data: T[];
  /** Column definitions. */
  columns: ColumnDef<T>[];
  /** Accessor or function to extract unique row key. */
  rowKey: keyof T | ((row: T) => string);
  /** Controlled array of selected row keys. */
  selectedRowKeys?: string[];
  /** Selection change callback. */
  onSelectionChange?: (selectedKeys: string[], selectedRows: T[]) => void;
  /** Row selection mode: 'none' | 'single' | 'multiple', defaults to 'none'. */
  selectionMode?: "none" | "single" | "multiple";
  /** Currently active sort key. */
  sortKey?: string | null;
  /** Currently active sort direction. */
  sortDirection?: SortDirection;
  /** Callback fired on sort state change. */
  onSortChange?: (sortKey: string | null, direction: SortDirection) => void;
  /** Whether data is loading. */
  loading?: boolean;
  /** Custom empty state content. Defaults to EmptyState. */
  emptyContent?: ReactNode;
  /** Sticky header styling. */
  stickyHeader?: boolean;
  /** Whether horizontal scroll indicators are enabled, defaults to true. */
  scrollX?: boolean;
  /** Custom root wrapper className. */
  className?: string;
  /** Row className string or generator function. */
  rowClassName?: string | ((row: T, index: number) => string);
  /** Row click callback. */
  onRowClick?: (row: T, index: number) => void;
}
/**
 * Generic declarative high-level data table with sorting, multi-selection,
 * horizontal scroll indicators, and EmptyState integration.
 */
declare function DataTable<T>({ data, columns, rowKey, selectedRowKeys, onSelectionChange, selectionMode, sortKey, sortDirection, onSortChange, loading, emptyContent, stickyHeader, scrollX, className, rowClassName, onRowClick }: DataTableProps<T>): JSX.Element;
//#endregion
//#region src/card/MediaCard.d.ts
type MediaAspectRatio = "16:9" | "4:3" | "1:1" | "9:16";
interface MediaCardProps {
  /** Card title text or node. */
  title: ReactNode;
  /** Image URL for media cover. */
  coverUrl?: string;
  /** Custom node for media cover (e.g. video player or SVG). */
  coverNode?: ReactNode;
  /** Display aspect ratio, defaults to '16:9'. */
  aspectRatio?: MediaAspectRatio;
  /** Secondary subtitle or description. */
  subtitle?: ReactNode;
  /** Top-right badge slot (typically a Badge component). */
  badge?: ReactNode;
  /** Bottom footer metadata node. */
  footer?: ReactNode;
  /** Quick action buttons revealed on hover. */
  actions?: ReactNode;
  /** Whether the card is selected. */
  selected?: boolean;
  /** Whether the card is disabled. */
  disabled?: boolean;
  /** Whether the card is in a loading state. */
  loading?: boolean;
  /** Click handler for the card. */
  onClick?: () => void;
  /** Custom class name. */
  className?: string;
}
/**
 * Media display card with aspect ratio constraints, top-right badge,
 * hover actions overlay, and footer metadata slot.
 */
declare const MediaCard: import("react").ForwardRefExoticComponent<MediaCardProps & import("react").RefAttributes<HTMLDivElement>>;
//#endregion
//#region src/card/CardGrid.d.ts
interface CardGridProps extends HTMLAttributes<HTMLDivElement> {
  /** Grid items. */
  children: ReactNode;
  /** Minimum width for each column item, defaults to '220px'. */
  minItemWidth?: number | string;
  /** Grid gap between cards, defaults to '16px'. */
  gap?: number | string;
  /** Maximum number of columns, optional. */
  maxColumns?: number;
  /** Custom class name. */
  className?: string;
}
/**
 * Responsive fluid card grid container for MediaCard and other card items.
 */
declare const CardGrid: import("react").ForwardRefExoticComponent<CardGridProps & import("react").RefAttributes<HTMLDivElement>>;
//#endregion
//#region src/internal/portal.d.ts
type PortalContainer = HTMLElement | (() => HTMLElement | null) | null | undefined;
/**
 * Resolves a portal container element safely, defaulting to `document.body` if available.
 */
declare function resolvePortalContainer(container?: PortalContainer): HTMLElement | null;
/**
 * Safely renders React children into a DOM portal with SSR protection.
 */
declare function createPortalSafe(children: ReactNode, container?: PortalContainer, key?: string | null): ReactPortal | null;
//#endregion
//#region src/drawer/Drawer.d.ts
type DrawerPlacement = "right" | "left" | "top" | "bottom";
interface DrawerProps {
  /** Whether the drawer is visible. */
  open: boolean;
  /** Close event callback. */
  onClose: () => void;
  /** Drawer header title. */
  title?: ReactNode;
  /** Subtitle or secondary description under title. */
  description?: ReactNode;
  /** Main drawer body content. */
  children: ReactNode;
  /** Bottom action footer slot. */
  footer?: ReactNode;
  /** Drawer slide-in placement, defaults to 'right'. */
  placement?: DrawerPlacement;
  /** Drawer width for 'left' | 'right' placements, defaults to 400. */
  width?: number | string;
  /** Drawer height for 'top' | 'bottom' placements, defaults to 320. */
  height?: number | string;
  /** Whether to show top-right close icon button, defaults to true. */
  closable?: boolean;
  /** Whether clicking the backdrop overlay triggers onClose, defaults to true. */
  closeOnOverlayClick?: boolean;
  /** Whether pressing the Escape key triggers onClose, defaults to true. */
  closeOnEsc?: boolean;
  /** Target portal mount container, defaults to document.body. */
  container?: PortalContainer;
  /** Custom class name for the drawer panel. */
  className?: string;
}
/**
 * Accessible slide-in drawer panel with multi-directional animation,
 * FocusTrap, Escape key handling, and scroll lock prevention.
 */
declare function Drawer({ open, onClose, title, description, children, footer, placement, width, height, closable, closeOnOverlayClick, closeOnEsc, container, className }: DrawerProps): JSX.Element | null;
//#endregion
//#region src/drawer/DrawerPortal.d.ts
interface DrawerPortalProps {
  children: ReactNode;
  container?: PortalContainer;
}
/**
 * Portal wrapper for Drawer with SSR safety and container resolution.
 */
declare function DrawerPortal({ children, container }: DrawerPortalProps): ReactPortal | null;
//#endregion
//#region src/search/SearchField.d.ts
interface SearchFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size" | "type" | "value" | "defaultValue" | "onChange"> {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  onClear?: () => void;
  debounceMs?: number;
  shortcut?: string;
  stretch?: boolean;
  clearLabel?: string;
}
interface SearchFieldHandle {
  focus: () => void;
  clear: () => void;
}
/**
 * Search field: leading search icon, optional shortcut kbd, and a clear control.
 * Uncontrolled `debounceMs` (default 200) batches `onValueChange`. Pass `0`
 * (or a controlled `value`) to emit immediately.
 */
declare const SearchField: import("react").ForwardRefExoticComponent<SearchFieldProps & import("react").RefAttributes<SearchFieldHandle>>;
//#endregion
//#region src/field/InputField.d.ts
interface InputFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size" | "prefix"> {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  prefix?: ReactNode;
  suffix?: ReactNode;
}
/**
 * Labeled single-line field with prefix / suffix slots, hint, and error text.
 * Height stays 32px to line up with Button and SearchField.
 */
declare const InputField: import("react").ForwardRefExoticComponent<InputFieldProps & import("react").RefAttributes<HTMLInputElement>>;
//#endregion
//#region src/field/DropdownSelect.d.ts
interface DropdownOption {
  value: string;
  label: ReactNode;
  disabled?: boolean;
  icon?: ReactNode;
  danger?: boolean;
}
interface DropdownSelectProps {
  value?: string;
  options: readonly DropdownOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
  id?: string;
  align?: "start" | "end";
}
/**
 * 32px select built on the official Menu. Never renders a native `<select>`.
 */
declare function DropdownSelect({ value, options, onChange, placeholder, disabled, className, "aria-label": ariaLabel, id, align }: DropdownSelectProps): import("react").JSX.Element;
//#endregion
//#region src/toolbar/Toolbar.d.ts
interface ToolbarProps extends HTMLAttributes<HTMLDivElement> {
  left?: ReactNode;
  right?: ReactNode;
  compact?: boolean;
}
/**
 * Single-row 44–48px toolbar. Left holds search + filters, right holds actions.
 * Children never wrap.
 */
declare function Toolbar({ left, right, compact, className, children, ...rest }: ToolbarProps): import("react").JSX.Element;
interface FilterBarProps extends ToolbarProps {
  search?: ReactNode;
  filters?: ReactNode;
  actions?: ReactNode;
  tools?: ReactNode;
}
/**
 * FilterBar supporting two layout modes:
 * 1. Standard 4-layer layout (New Spec): `filters` on the left, `search` + `tools` (sort/viewMode) on the right.
 * 2. Classic layout (Legacy): `search` + `filters` on the left, `actions` on the right.
 */
declare function FilterBar({ left, search, filters, actions, right, tools, className, compact, ...rest }: FilterBarProps): import("react").JSX.Element;
//#endregion
//#region src/divider/Divider.d.ts
interface DividerProps extends HTMLAttributes<HTMLDivElement> {
  orientation?: 'horizontal' | 'vertical';
}
/**
 * Standard 1px divider consuming var(--dsw-alias-border-l2).
 */
declare const Divider: import("react").ForwardRefExoticComponent<DividerProps & import("react").RefAttributes<HTMLDivElement>>;
//#endregion
//#region src/dialog/Dialog.d.ts
type DialogSize = "sm" | "md" | "lg";
interface ModalDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
  size?: DialogSize;
  closeLabel?: string;
  className?: string;
  contentClassName?: string;
}
/**
 * Official Modal with kit geometry: 16px radius, scrollable body, right-aligned
 * action footer. Header + close button stay with the primitive.
 */
declare function ModalDialog({ open, onClose, title, description, children, footer, size, closeLabel, className, contentClassName }: ModalDialogProps): import("react").JSX.Element;
interface ConfirmModalProps extends Omit<ModalDialogProps, "footer" | "children"> {
  message?: ReactNode;
  children?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmVariant?: ButtonVariant;
  confirmLoading?: boolean;
  onConfirm: () => void;
}
/** Two-button confirm dialog. Destructive flows should pass `confirmVariant="danger"`. */
declare function ConfirmModal({ message, children, confirmLabel, cancelLabel, confirmVariant, confirmLoading, onConfirm, onClose, size, ...rest }: ConfirmModalProps): import("react").JSX.Element;
//#endregion
//#region src/empty/EmptyState.d.ts
interface EmptyStateProps extends HTMLAttributes<HTMLDivElement> {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  secondaryAction?: ReactNode;
  compact?: boolean;
}
declare const EmptyState: import("react").ForwardRefExoticComponent<EmptyStateProps & import("react").RefAttributes<HTMLDivElement>>;
//#endregion
//#region src/stage/createStageStore.d.ts
interface StageBox {
  top: number;
  left: number;
  width: number;
  height: number;
}
interface StageHostSingleton {
  claim?: (id: string) => void;
  release?: (id: string) => void;
  readBox?: () => StageBox;
}
interface StageStore {
  getSnapshot: () => boolean;
  subscribe: (listener: () => void) => () => void;
  open: () => void;
  close: () => void;
  set: (next: boolean) => void;
  readBox: () => StageBox;
}
/**
 * Creates an idempotent StageStore for a first-level product page.
 * Manages mutual exclusion with other product stages via `dsh-product-stage` event.
 * @param stageId Unique product stage identifier (e.g. 'omnimux-assets')
 * @param getStage Function resolving the host singleton (defaults to window.__omnimuxStage)
 */
declare function createStageStore(stageId: string, getStage?: () => StageHostSingleton | undefined): StageStore;
//#endregion
//#region src/stage/StageContainer.d.ts
interface StageContainerProps extends HTMLAttributes<HTMLDivElement> {
  stageStore: StageStore;
  title?: string;
  children: ReactNode;
}
/**
 * Standard Stage Container for first-level product pages.
 * Handles --stage-* CSS variable synchronization, keepalive lazy-mounting,
 * and ResizeObserver layout tracking.
 */
declare const StageContainer: import("react").ForwardRefExoticComponent<StageContainerProps & import("react").RefAttributes<HTMLDivElement>>;
//#endregion
//#region src/tabs/Tabs.d.ts
interface PageHeaderTabItem {
  id: string;
  label: ReactNode;
  badge?: ReactNode | number;
  disabled?: boolean;
}
type TabsVariant = 'underline' | 'pill';
interface TabsProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onChange'> {
  items: PageHeaderTabItem[];
  activeId: string;
  onChange: (id: string) => void;
  size?: 'default' | 'sm';
  variant?: TabsVariant;
  className?: string;
}
declare const Tabs: import("react").ForwardRefExoticComponent<TabsProps & import("react").RefAttributes<HTMLDivElement>>;
//#endregion
//#region src/stage/PageHeader.d.ts
interface PageHeaderProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  title: ReactNode;
  subtitle?: ReactNode;
  badge?: ReactNode;
  tabs?: {
    items: PageHeaderTabItem[];
    activeId: string;
    onChange: (id: string) => void;
  };
  actions?: ReactNode;
  onRefresh?: () => void | Promise<void>;
  refreshing?: boolean;
  refreshTitle?: string;
  onClose?: () => void;
  closeTitle?: string;
  breadcrumb?: ReactNode;
}
/**
 * Standard Layer 1 Page Header for OmniMux first-level product stages.
 * Typography single source of truth: 20px / 600 / 28px.
 * Layout: heading (breadcrumb + title + subtitle) | tabs | controls (actions + refresh + close).
 */
declare const PageHeader: import("react").ForwardRefExoticComponent<PageHeaderProps & import("react").RefAttributes<HTMLElement>>;
//#endregion
//#region src/stage/StageHeader.d.ts
type StageHeaderProps = PageHeaderProps;
/**
 * StageHeader forwards to PageHeader for backward compatibility.
 * Standard Layer 1 Header for OmniMux first-level product stages.
 * Typography single source of truth: 20px / 600 / 28px.
 */
declare const StageHeader: import("react").ForwardRefExoticComponent<PageHeaderProps & import("react").RefAttributes<HTMLElement>>;
//#endregion
//#region src/stat/StatBar.d.ts
interface StatItem {
  key: string;
  label: ReactNode;
  value: ReactNode;
  trend?: {
    direction: 'up' | 'down' | 'neutral';
    value: string;
  };
  extra?: ReactNode;
}
interface StatBarProps extends HTMLAttributes<HTMLDivElement> {
  items: StatItem[];
  className?: string;
}
/**
 * Metric indicator bar for accounts, analytics, and overview panels.
 * Trends strictly consume official IconChevron* SVG icons and DSW semantic status tokens.
 */
declare const StatBar: import("react").ForwardRefExoticComponent<StatBarProps & import("react").RefAttributes<HTMLDivElement>>;
//#endregion
//#region src/action/ActionRow.d.ts
interface ActionRowProps extends HTMLAttributes<HTMLDivElement> {
  primaryAction?: ReactNode;
  secondaryActions?: ReactNode;
  rightActions?: ReactNode;
}
/**
 * Secondary action row container.
 * Single row (flex-wrap: nowrap) with primary & secondary actions on the left
 * and rightActions pushed to the right.
 */
declare const ActionRow: import("react").ForwardRefExoticComponent<ActionRowProps & import("react").RefAttributes<HTMLDivElement>>;
//#endregion
//#region src/gen-wave-card/GenWaveCard.d.ts
interface GenWaveCardProps extends HTMLAttributes<HTMLDivElement> {
  /** 顶部任务文案，外部供给；缺省时不渲染头行，点阵画布铺满整卡。 */
  statusText?: string;
  /** 0–100；传入后由外部接管进度显示并停用内置演示缓动。 */
  progress?: number;
  /** 是否启用内置 0→96% 演示缓动；默认 progress 未提供时为 true。 */
  autoProgress?: boolean;
  /** Custom class name. */
  className?: string;
}
/**
 * 点阵 Loading 卡片（1:1 移植自 chatgpt-gen-loading-card.html）。
 *
 * canvas 绘 28×29 点阵：尺寸场 |cos|^0.5 周期波（s = col + 0.8·row）
 * 叠加亮度场 sigmoid 单向锋面（s = col − 0.35·row，T 在 [-10,31] 往返），
 * 左上 r0c0 / 右上 r0c27 / 左下 r28c0 三角位缺位；右下角 58×35 椭圆
 * 进度胶囊与点阵同层绘制（DOM badge 保留为 ARIA/状态载体）。
 * 自适应容器尺寸：画布撑满卡片剩余高度（.card 为 flex 列，.field flex:1），
 * 点距取水平/垂直两个方向可容点距的较小值，点阵在画布内双向居中；
 * prefers-reduced-motion 定格参考帧。
 */
declare const GenWaveCard: import("react").ForwardRefExoticComponent<GenWaveCardProps & import("react").RefAttributes<HTMLDivElement>>;
//#endregion
//#region src/stage/createSidebarEntry.d.ts
interface SidebarCoordinatorApi {
  register: (row: {
    id: string;
    rank: number;
    styles?: string;
    styleId?: string;
    kind?: 'inline';
    create: () => HTMLElement;
  }) => () => void;
}
type PluginAccess = 'offline' | 'cloud';
interface SidebarEntryOptions {
  id: string;
  rank: number;
  label: string | (() => string);
  iconSvg: string;
  stageStore: StageStore;
  locale?: {
    subscribe?: (fn: () => void) => () => void;
  };
  customClassName?: string;
  datasetKey?: string;
  /**
   * Access classification (default 'offline'):
   * - 'offline': always visible, clicks open stage directly without auth gating
   * - 'cloud': cloud-dependent; always visible in sidebar, clicks trigger explicit auth gating
   */
  access?: PluginAccess;
  /** @deprecated use access instead */
  requireAuth?: boolean;
  authReason?: string | (() => string);
}
/**
 * Creates and mounts a standardized sidebar entry under the 新会话 button.
 * Uses idempotent activation (stageStore.open()) to guarantee persistent selection.
 */
declare function createSidebarEntry(options: SidebarEntryOptions): () => void;
//#endregion
//#region src/internal/clipboard.d.ts
/**
 * Robust asynchronous clipboard write with legacy document.execCommand fallback.
 */
declare function copyToClipboard(text: string): Promise<boolean>;
//#endregion
//#region src/internal/a11y.d.ts
/**
 * Traps Tab and Shift+Tab key navigation within the given container element.
 */
declare function trapFocus(container: HTMLElement, event: KeyboardEvent): void;
/**
 * Attempts to focus the first focusable descendant in a container.
 */
declare function focusFirstDescendant(container: HTMLElement): boolean;
//#endregion
export { ActionRow, type ActionRowProps, Badge, type BadgeProps, type BadgeShape, type BadgeSize, type BadgeVariant, Button, type ButtonProps, type ButtonSize, type ButtonVariant, CardGrid, type CardGridProps, type CellContext, type ColumnDef, ConfirmModal, type ConfirmModalProps, CopyButton, type CopyButtonProps, type CopyState, DataTable, type DataTableProps, type DialogSize, Divider, type DividerProps, Drawer, type DrawerPlacement, DrawerPortal, type DrawerPortalProps, type DrawerProps, type DropdownOption, DropdownSelect, type DropdownSelectProps, EmptyState, type EmptyStateProps, FilterBar, type FilterBarProps, GenWaveCard, type GenWaveCardProps, type HeaderContext, IconButton, type IconButtonProps, InputField, type InputFieldProps, type MediaAspectRatio, MediaCard, type MediaCardProps, ModalDialog, type ModalDialogProps, PageHeader, type PageHeaderProps, type PageHeaderTabItem, type PortalContainer, SearchField, type SearchFieldHandle, type SearchFieldProps, SelectableTile, type SelectableTileProps, type SidebarCoordinatorApi, type SidebarEntryOptions, type SortDirection, type StageBox, StageContainer, type StageContainerProps, StageHeader, type StageHeaderProps, type StageHostSingleton, type StageStore, StatBar, type StatBarProps, type StatItem, Table, TableBody, type TableBodyProps, TableCell, type TableCellProps, TableHead, type TableHeadProps, TableHeader, type TableHeaderProps, type TableProps, TableRow, type TableRowProps, Tabs, type TabsProps, type TabsVariant, type TileSelectionMode, Toolbar, type ToolbarProps, copyToClipboard, createPortalSafe, createSidebarEntry, createStageStore, focusFirstDescendant, resolvePortalContainer, trapFocus };
//# sourceMappingURL=index.d.ts.map