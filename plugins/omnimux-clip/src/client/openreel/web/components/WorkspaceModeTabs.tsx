import type { JSX } from "react";
import { useClipT } from "../../../i18n/index.js";

export type WorkspaceMode = "video" | "motion";

const MODES: Array<{
  id: WorkspaceMode;
  label: string;
}> = [
  { id: "video", label: "Video Editor" },
  { id: "motion", label: "Motion Design" },
];

export function WorkspaceModeTabs({
  activeMode,
  onSelectMode,
  ariaLabel = "Editor workspaces",
  className = "",
  accessibleLabels,
}: {
  activeMode: WorkspaceMode;
  onSelectMode: (mode: WorkspaceMode) => void;
  ariaLabel?: string;
  className?: string;
  accessibleLabels?: Partial<Record<WorkspaceMode, string>>;
}): JSX.Element {
  const t = useClipT();
  return (
    <div
      role="tablist"
      aria-label={t(ariaLabel)}
      className={`inline-flex items-center gap-0 rounded-[9px] bg-bg-3 p-[3px] ${className}`}
    >
      {MODES.map((mode) => {
        const isActive = activeMode === mode.id;
        return (
          <button
            key={mode.id}
            type="button"
            role="tab"
            aria-label={
              accessibleLabels?.[mode.id]
                ? t(accessibleLabels[mode.id] as string)
                : undefined
            }
            aria-selected={isActive}
            onClick={() => onSelectMode(mode.id)}
            className={`rounded-[7px] px-4 py-[7px] text-[13px] transition-colors ${
              isActive
                ? "bg-bg-1 text-fg font-semibold shadow-[0_1px_2px_rgba(0,0,0,0.12)]"
                : "bg-transparent text-fg-3 font-medium hover:text-fg-2"
            }`}
          >
            {t(mode.label)}
          </button>
        );
      })}
    </div>
  );
}
