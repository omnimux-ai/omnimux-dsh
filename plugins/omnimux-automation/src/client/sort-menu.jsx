import { useState } from "react";
import { DropdownMenu } from "./dropdown-menu.jsx";
import { SlidersIcon } from "./icons.jsx";
import {
  readSortDefault,
  writeSortDefault
} from "./helpers.js";
const SORT_OPTIONS = [
  ["created", "desc"],
  ["created", "asc"],
  ["planned", "asc"],
  ["planned", "desc"]
];
function SortMenu({
  t,
  storage,
  storageKey,
  sortKey,
  sortDirection,
  onSelect,
  compact = false,
  iconOnly = false,
  className
}) {
  const [saved, setSaved] = useState(() => readSortDefault(storage, storageKey));
  const options = SORT_OPTIONS.map(([key, direction]) => {
    const selected = sortKey === key && sortDirection === direction;
    const isDefault = saved?.key === key && saved.direction === direction;
    return {
      key: `${key}-${direction}`,
      label: t(key === "planned" ? `sort.planned.${direction}` : `sort.created.${direction}`),
      selected,
      keepOpen: true,
      onSelect: () => onSelect(key, direction),
      ...selected && storage !== void 0 ? {
        trailing: {
          label: t("sort.default.saved"),
          active: isDefault,
          onSelect: () => {
            writeSortDefault(storage, storageKey, key, direction);
            setSaved({ key, direction });
          }
        }
      } : {}
    };
  });
  return <DropdownMenu
    ariaLabel={t("sort.by")}
    {...compact || className !== void 0 ? { className: [compact ? "dsh-st-dropdown-compact" : "", className ?? ""].filter(Boolean).join(" ") } : {}}
    {...iconOnly ? { buttonClassName: "dsh-st-icon", trigger: <SlidersIcon width={16} height={16} /> } : {}}
    menuClassName={compact ? "dsh-st-dropdown-sort dsh-st-dropdown-compact" : "dsh-st-dropdown-sort"}
    options={options}
  />;
}
export {
  SortMenu
};
