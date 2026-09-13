import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Button } from "./controls.jsx";
import { createPortal } from "react-dom";
import { CheckOutlineIcon, ChevronIcon } from "./icons.jsx";
function DropdownMenu({
  ariaLabel,
  className,
  buttonClassName,
  menuClassName,
  options,
  trigger
}) {
  const [open, setOpen] = useState(false);
  const root = useRef(null);
  const menuRef = useRef(null);
  const [menuStyle, setMenuStyle] = useState({});
  const selectedLabel = options.find((option) => option.selected)?.label ?? options[0]?.label ?? ariaLabel;
  useEffect(() => {
    if (!open) return;
    const close = (event) => {
      if (root.current !== null && root.current.contains(event.target)) return;
      if (menuRef.current?.contains(event.target) === true) return;
      setOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);
  useLayoutEffect(() => {
    if (!open) return;
    const update = () => {
      const button = root.current?.querySelector(".dsh-st-dropdown-btn");
      const rect = button?.getBoundingClientRect();
      if (rect === void 0) return;
      const height = menuRef.current?.offsetHeight ?? 220;
      const margin = 8;
      let top = rect.bottom + 6;
      if (top + height > window.innerHeight - margin) top = Math.max(margin, rect.top - height - 6);
      const right = Math.max(margin, window.innerWidth - rect.right);
      setMenuStyle((current) => current.top === top && current.right === right ? current : { position: "fixed", top, right });
    };
    const onScroll = (event) => {
      if (event.target instanceof Node && menuRef.current?.contains(event.target)) return;
      update();
    };
    update();
    window.addEventListener("resize", update);
    document.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("resize", update);
      document.removeEventListener("scroll", onScroll, true);
    };
  }, [open, selectedLabel]);
  const menu = open && typeof document !== "undefined" ? createPortal(
    <div ref={menuRef} className={`dsh-st-dropdown-menu is-float${menuClassName === void 0 ? "" : ` ${menuClassName}`}`} style={menuStyle}>
        {options.map((option) => <DropdownRow
      key={option.key}
      label={option.label}
      selected={option.selected}
      trailing={option.trailing}
      onSelect={() => {
        if (option.keepOpen !== true) setOpen(false);
        option.onSelect();
      }}
    />)}
      </div>,
    document.body
  ) : null;
  return <div className={`dsh-st-dropdown${className === void 0 ? "" : ` ${className}`}`} ref={root}>
      <Button type="button" className={`dsh-st-dropdown-btn${buttonClassName === void 0 ? "" : ` ${buttonClassName}`}${open ? " is-open" : ""}`} aria-label={ariaLabel} aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        {trigger ?? <>
          <span className="dsh-st-dropdown-label">{selectedLabel}</span>
          <ChevronIcon width={10} height={10} className="dsh-st-dropdown-chevron" />
        </>}
      </Button>
      {menu}
    </div>;
}
function DropdownRow({
  label,
  selected,
  trailing,
  onSelect
}) {
  return <div
    className={`dsh-st-dropdown-row${selected ? " is-selected" : ""}${trailing === void 0 ? "" : " has-trailing"}`}
    role="menuitemradio"
    aria-checked={selected}
    tabIndex={0}
    onClick={onSelect}
    onKeyDown={(event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onSelect();
      }
    }}
  >
      <span className="dsh-st-dropdown-label-cell">{label}</span>
      {trailing !== void 0 && <Button
    type="button"
    className={`dsh-st-dropdown-default${trailing.active ? " is-on" : ""}`}
    disabled={trailing.active}
    onClick={(event) => {
      event.stopPropagation();
      trailing.onSelect();
    }}
  >{trailing.label}</Button>}
      <span className="dsh-st-dropdown-spacer" />
      <span className="dsh-st-dropdown-check">
        {selected ? <CheckOutlineIcon width={16} height={16} /> : <span className="dsh-st-sort-tick" />}
      </span>
    </div>;
}
export {
  DropdownMenu
};
