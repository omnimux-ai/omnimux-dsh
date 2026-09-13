import React from 'react'

import { platformGlyph } from '../platform-marks.ts'

export function SvgIcon({
  children,
  size = 14,
  className = '',
  viewBox = '0 0 24 24'
}: {
  children: React.ReactNode
  size?: number
  className?: string
  viewBox?: string
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox={viewBox}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

export function FolderIcon({ size = 14, className }: { size?: number; className?: string }) {
  return (
    <SvgIcon size={size} className={className}>
      <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
    </SvgIcon>
  )
}

export function RefreshIcon({ size = 13, className }: { size?: number; className?: string }) {
  return (
    <SvgIcon size={size} className={className}>
      <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
      <path d="M3 21v-5h5" />
    </SvgIcon>
  )
}

export function TargetIcon({ size = 13, className }: { size?: number; className?: string }) {
  return (
    <SvgIcon size={size} className={className}>
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </SvgIcon>
  )
}

export function CloseIcon({ size = 12, className }: { size?: number; className?: string }) {
  return (
    <SvgIcon size={size} className={className}>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </SvgIcon>
  )
}

export function ImageIcon({ size = 13, className }: { size?: number; className?: string }) {
  return (
    <SvgIcon size={size} className={className}>
      <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
      <circle cx="9" cy="9" r="2" />
      <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
    </SvgIcon>
  )
}

export function EditPencilIcon({ size = 13, className }: { size?: number; className?: string }) {
  return (
    <SvgIcon size={size} className={className}>
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
      <path d="m15 5 4 4" />
    </SvgIcon>
  )
}

export function CheckMarkIcon({ size = 13, className }: { size?: number; className?: string }) {
  return (
    <SvgIcon size={size} className={className}>
      <path d="M20 6 9 17l-5-5" />
    </SvgIcon>
  )
}

export function SunIcon({ size = 14, className }: { size?: number; className?: string }) {
  return (
    <SvgIcon size={size} className={className}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2" />
      <path d="M12 20v2" />
      <path d="m4.93 4.93 1.41 1.41" />
      <path d="m17.66 17.66 1.41 1.41" />
      <path d="M2 12h2" />
      <path d="M20 12h2" />
      <path d="m6.34 17.66-1.41 1.41" />
      <path d="m19.07 4.93-1.41 1.41" />
    </SvgIcon>
  )
}

export function MoonIcon({ size = 14, className }: { size?: number; className?: string }) {
  return (
    <SvgIcon size={size} className={className}>
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
    </SvgIcon>
  )
}

export function RocketIcon({ size = 13, className }: { size?: number; className?: string }) {
  return (
    <SvgIcon size={size} className={className}>
      <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
      <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
      <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" />
      <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
    </SvgIcon>
  )
}

export function ThreadIcon({ size = 13, className }: { size?: number; className?: string }) {
  return (
    <SvgIcon size={size} className={className}>
      <path d="M4 6h16" />
      <path d="M4 12h16" />
      <path d="M4 18h10" />
    </SvgIcon>
  )
}

export function QuoteIcon({ size = 13, className }: { size?: number; className?: string }) {
  return (
    <SvgIcon size={size} className={className}>
      <path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z" />
      <path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z" />
    </SvgIcon>
  )
}

export function GlobeIcon({ size = 13, className }: { size?: number; className?: string }) {
  return (
    <SvgIcon size={size} className={className}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
      <path d="M2 12h20" />
    </SvgIcon>
  )
}

export function FlameIcon({ size = 13, className }: { size?: number; className?: string }) {
  return (
    <SvgIcon size={size} className={className}>
      <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
    </SvgIcon>
  )
}

export function SparklesIcon({ size = 13, className }: { size?: number; className?: string }) {
  return (
    <SvgIcon size={size} className={className}>
      <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
    </SvgIcon>
  )
}

export function ChartIcon({ size = 13, className }: { size?: number; className?: string }) {
  return (
    <SvgIcon size={size} className={className}>
      <path d="M3 3v18h18" />
      <path d="m19 9-5 5-4-4-3 3" />
    </SvgIcon>
  )
}

export function VideoIcon({ size = 13, className }: { size?: number; className?: string }) {
  return (
    <SvgIcon size={size} className={className}>
      <path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5" />
      <rect x="2" y="6" width="14" height="12" rx="2" />
    </SvgIcon>
  )
}

export function ZapIcon({ size = 13, className }: { size?: number; className?: string }) {
  return (
    <SvgIcon size={size} className={className}>
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </SvgIcon>
  )
}

export function FileTextIcon({ size = 13, className }: { size?: number; className?: string }) {
  return (
    <SvgIcon size={size} className={className}>
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
      <path d="M10 9H8" />
      <path d="M16 13H8" />
      <path d="M16 17H8" />
    </SvgIcon>
  )
}

export function SearchIcon({ size = 13, className }: { size?: number; className?: string }) {
  return (
    <SvgIcon size={size} className={className}>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </SvgIcon>
  )
}

export function MenuIcon({ size = 14, className }: { size?: number; className?: string }) {
  return (
    <SvgIcon size={size} className={className}>
      <line x1="4" x2="20" y1="12" y2="12" />
      <line x1="4" x2="20" y1="6" y2="6" />
      <line x1="4" x2="20" y1="18" y2="18" />
    </SvgIcon>
  )
}

export function ArrowUpIcon({ size = 14, className }: { size?: number; className?: string }) {
  return (
    <SvgIcon size={size} className={className}>
      <path d="m5 12 7-7 7 7" />
      <path d="M12 19V5" />
    </SvgIcon>
  )
}

export function MessageSquareIcon({ size = 13, className }: { size?: number; className?: string }) {
  return (
    <SvgIcon size={size} className={className}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </SvgIcon>
  )
}

export function PlusIcon({ size = 14, className }: { size?: number; className?: string }) {
  return (
    <SvgIcon size={size} className={className}>
      <path d="M5 12h14" />
      <path d="M12 5v14" />
    </SvgIcon>
  )
}

export function SidebarPanelIcon({ size = 13, className }: { size?: number; className?: string }) {
  return (
    <SvgIcon size={size} className={className}>
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="M15 3v18" />
    </SvgIcon>
  )
}

export function SaveIcon({ size = 13, className }: { size?: number; className?: string }) {
  return (
    <SvgIcon size={size} className={className}>
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
      <polyline points="17 21 17 13 7 13 7 21" />
      <polyline points="7 3 7 8 15 8" />
    </SvgIcon>
  )
}

export function CopyIcon({ size = 12, className }: { size?: number; className?: string }) {
  return (
    <SvgIcon size={size} className={className}>
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </SvgIcon>
  )
}

export function EditIcon({ size = 12, className }: { size?: number; className?: string }) {
  return (
    <SvgIcon size={size} className={className}>
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </SvgIcon>
  )
}

export function LightbulbIcon({ size = 13, className }: { size?: number; className?: string }) {
  return (
    <SvgIcon size={size} className={className}>
      <line x1="9" y1="18" x2="15" y2="18" />
      <line x1="10" y1="22" x2="14" y2="22" />
      <path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14" />
    </SvgIcon>
  )
}

export function ScissorsIcon({ size = 13, className }: { size?: number; className?: string }) {
  return (
    <SvgIcon size={size} className={className}>
      <path d="m18 2 4 4-12 12H6v-4L18 2z" />
    </SvgIcon>
  )
}

export function RetweetIcon({ size = 13, className }: { size?: number; className?: string }) {
  return (
    <SvgIcon size={size} className={className}>
      <path d="M17 1l4 4-4 4" />
      <path d="M3 11V9a4 4 0 0 1 4-4h14" />
      <path d="M7 23l-4-4 4-4" />
      <path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </SvgIcon>
  )
}

export function BotIcon({ size = 13, className }: { size?: number; className?: string }) {
  return (
    <SvgIcon size={size} className={className}>
      <rect x="3" y="11" width="18" height="10" rx="2" />
      <circle cx="12" cy="5" r="2" />
      <path d="M12 7v4" />
      <line x1="8" y1="16" x2="8" y2="16" />
      <line x1="16" y1="16" x2="16" y2="16" />
    </SvgIcon>
  )
}

export function PlatformMarkIcon({ platform, size = 12, className }: { platform?: string; size?: number; className?: string }) {
  const glyph = platformGlyph(platform)
  return (
    <svg
      width={size}
      height={size}
      viewBox={glyph.viewBox}
      fill="currentColor"
      fillRule="evenodd"
      className={className}
      aria-hidden="true"
    >
      <path d={glyph.path} />
    </svg>
  )
}

export function ChatBubbleIcon({ size = 13, className }: { size?: number; className?: string }) {
  return (
    <SvgIcon size={size} className={className}>
      <path d="M20.5 12.25v8.25h-5.6" />
      <path d="M14.9 20.5v-5.2h5.6" />
      <path d="M20.5 12.25a8.5 8.5 0 0 0-4.06-7.29" />
      <path d="M12 3.75a8.5 8.5 0 1 0 4.44 15.75" />
    </SvgIcon>
  )
}
