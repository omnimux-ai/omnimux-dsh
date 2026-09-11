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
      className="omnimux-products-icon"
    >
      {children}
    </svg>
  )
}

export function FileIcon(props) {
  return (
    <Icon {...props}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" />
      <path d="M14 3v5h5" />
    </Icon>
  )
}

export function PlusIcon(props) {
  return (
    <Icon {...props}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </Icon>
  )
}

export function CheckIcon(props) {
  return (
    <Icon {...props}>
      <path d="m5 12 5 5 9-10" />
    </Icon>
  )
}

export function CloseIcon(props) {
  return (
    <Icon {...props}>
      <path d="M6 6l12 12" />
      <path d="M18 6 6 18" />
    </Icon>
  )
}

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

export function ChatIcon(props) {
  return (
    <Icon {...props}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </Icon>
  )
}

