/**
 * Inline SVG icon set: 14px linear strokes following `currentColor`, so the
 * icons track the active theme instead of the OS emoji font. Sizes and stroke
 * width follow the sidebar-extra-entries contract (14×14 box).
 */

/**
 * @param {{ size?: number, children: any }} props
 */
function Icon({ size = 14, children }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="omnimux-assets-icon"
    >
      {children}
    </svg>
  )
}

/** @param {{ size?: number }} props */
export function FolderIcon(props) {
  return (
    <Icon {...props}>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
    </Icon>
  )
}

/** @param {{ size?: number }} props */
export function FileIcon(props) {
  return (
    <Icon {...props}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" />
      <path d="M14 3v5h5" />
    </Icon>
  )
}

/** @param {{ size?: number }} props */
export function AlertIcon(props) {
  return (
    <Icon {...props}>
      <path d="M12 4 2.8 20h18.4Z" />
      <path d="M12 10v4" />
      <path d="M12 17.5h.01" />
    </Icon>
  )
}

/** @param {{ size?: number }} props */
export function BotIcon(props) {
  return (
    <Icon {...props}>
      <rect x="5" y="8" width="14" height="11" rx="2" />
      <path d="M12 8V4" />
      <path d="M9 4h6" />
      <path d="M9.5 13h.01" />
      <path d="M14.5 13h.01" />
      <path d="M9 16.5h6" />
    </Icon>
  )
}

/** Folder with a check mark — local artifacts group icon. */
export function FolderCheckIcon(props) {
  return (
    <Icon {...props}>
      <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
      <path d="m9 13 2 2 4-4" />
    </Icon>
  )
}

/** @param {{ size?: number }} props */
export function PlusIcon(props) {
  return (
    <Icon {...props}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </Icon>
  )
}

/** @param {{ size?: number }} props */
export function DotsIcon(props) {
  return (
    <Icon {...props}>
      <circle cx="5" cy="12" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1.6" fill="currentColor" stroke="none" />
    </Icon>
  )
}

/** @param {{ size?: number }} props */
export function CheckIcon(props) {
  return (
    <Icon {...props}>
      <path d="m5 12 5 5 9-10" />
    </Icon>
  )
}

/** @param {{ size?: number }} props */
export function CloseIcon(props) {
  return (
    <Icon {...props}>
      <path d="M6 6l12 12" />
      <path d="M18 6 6 18" />
    </Icon>
  )
}

/** @param {{ size?: number }} props */
export function RefreshIcon(props) {
  return (
    <Icon {...props}>
      <path d="M20 11a8 8 0 0 0-14.9-3" />
      <path d="M4 5v4h4" />
      <path d="M4 13a8 8 0 0 0 14.9 3" />
      <path d="M20 19v-4h-4" />
    </Icon>
  )
}

/** @param {{ size?: number }} props */
export function ImportIcon(props) {
  return (
    <Icon {...props}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </Icon>
  )
}

/** @param {{ size?: number }} props */
export function GridIcon(props) {
  return (
    <Icon {...props}>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
    </Icon>
  )
}

/** @param {{ size?: number }} props */
export function ListIcon(props) {
  return (
    <Icon {...props}>
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </Icon>
  )
}

/** @param {{ size?: number }} props */
export function ChevronRightIcon(props) {
  return (
    <Icon {...props}>
      <path d="m9 6 6 6-6 6" />
    </Icon>
  )
}

/** @param {{ size?: number }} props */
export function ImageIcon(props) {
  return (
    <Icon {...props}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="m21 15-5-5L5 21" />
    </Icon>
  )
}

/** @param {{ size?: number }} props */
export function VideoIcon(props) {
  return (
    <Icon {...props}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m10 9 5 3-5 3z" />
    </Icon>
  )
}

/** @param {{ size?: number }} props */
export function AudioIcon(props) {
  return (
    <Icon {...props}>
      <path d="M9 18V5l12-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="16" r="3" />
    </Icon>
  )
}

/** @param {{ size?: number }} props */
export function DocIcon(props) {
  return (
    <Icon {...props}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" />
      <path d="M14 3v5h5" />
      <path d="M9 13h6" />
      <path d="M9 17h6" />
    </Icon>
  )
}

/** @param {{ size?: number }} props */
export function CodeIcon(props) {
  return (
    <Icon {...props}>
      <path d="m8 6-6 6 6 6" />
      <path d="m16 6 6 6-6 6" />
    </Icon>
  )
}

/** @param {{ size?: number }} props */
export function BracesIcon(props) {
  return (
    <Icon {...props}>
      <path d="M8 3c-1.5 0-2 .8-2 2v3c0 1.5-.8 2-2 2 1.2 0 2 .8 2 2v3c0 1.2.5 2 2 2" />
      <path d="M16 3c1.5 0 2 .8 2 2v3c0 1.5.8 2 2 2-1.2 0-2 .8-2 2v3c0 1.2-.5 2-2 2" />
    </Icon>
  )
}

const TYPE_ICONS = {
  image: ImageIcon,
  video: VideoIcon,
  audio: AudioIcon,
  document: DocIcon,
  html: CodeIcon,
  json: BracesIcon,
}

/**
 * File-type icon for table rows: picks a bucket icon, falls back to FileIcon.
 * @param {{ type?: string, size?: number }} props
 */
export function TypeIcon({ type, size = 14 }) {
  const Component = TYPE_ICONS[type] ?? FileIcon
  return <Component size={size} />
}

/** @param {{ size?: number }} props */
export function EyeIcon(props) {
  return (
    <Icon {...props}>
      <path d="M2.062 12.348a1 1 0 0 1 0-.696A10.75 10.75 0 0 1 21.938 12.348a1 1 0 0 1 0 .696A10.75 10.75 0 0 1 2.062 12.348" />
      <circle cx="12" cy="12" r="3" />
    </Icon>
  )
}

/** @param {{ size?: number }} props */
export function ChatIcon(props) {
  return (
    <Icon {...props}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </Icon>
  )
}

/** Alias MessageIcon for convenience */
export const MessageIcon = ChatIcon
