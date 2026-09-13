import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Button } from "./controls.jsx";
import { createPortal } from "react-dom";
const MenuHostContext = createContext(null);
function useMenuOpen() {
  const [open, setOpen] = useState(false);
  const root = useRef(null);
  const menu = useRef(null);
  useEffect(() => {
    if (!open) return;
    const close = (event) => {
      const target = event.target;
      if (root.current !== null && root.current.contains(target)) return;
      if (menu.current !== null && menu.current.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => {
      document.removeEventListener("mousedown", close);
    };
  }, [open]);
  return { open, setOpen, root, menu };
}
function flyoutStyle(anchor, host, up, end) {
  const box = anchor.getBoundingClientRect();
  const frame = host.getBoundingClientRect();
  const gap = 6;
  return {
    position: "absolute",
    zIndex: 1200,
    top: up === true ? "auto" : `${box.bottom - frame.top + gap}px`,
    bottom: up === true ? `${frame.bottom - box.top + gap}px` : "auto",
    left: end === true ? "auto" : `${box.left - frame.left}px`,
    right: end === true ? `${frame.right - box.right}px` : "auto"
  };
}
function MenuPopup({
  open,
  anchor,
  menuRef,
  up,
  end,
  className,
  ariaLabel,
  children,
  onClick
}) {
  const host = useContext(MenuHostContext);
  const [style, setStyle] = useState({});
  useLayoutEffect(() => {
    if (!open || anchor.current === null || host === null) return;
    const update = () => {
      if (anchor.current !== null) setStyle(flyoutStyle(anchor.current, host, up, end));
    };
    update();
    window.addEventListener("resize", update);
    document.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      document.removeEventListener("scroll", update, true);
    };
  }, [open, anchor, host, up, end]);
  if (!open) return null;
  const node = <div
    ref={menuRef}
    className={`${className}${host !== null ? " is-float" : ""}`}
    role="menu"
    aria-label={ariaLabel}
    style={host !== null ? style : void 0}
    onMouseDown={(event) => event.stopPropagation()}
    onClick={(event) => {
      event.stopPropagation();
      onClick?.();
    }}
  >
      {children}
    </div>;
  if (host !== null) return createPortal(node, host);
  return node;
}
function MenuHostProvider({
  host,
  children
}) {
  return <MenuHostContext.Provider value={host}>{children}</MenuHostContext.Provider>;
}
function MenuRow({
  icon,
  label,
  hint,
  active,
  chevron,
  kv,
  onClick
}) {
  return <Button type="button" className={`dsh-st-menu-row${active === true ? " is-on" : ""}${kv === true ? " is-kv" : ""}`} onClick={onClick}>
      <span className="dsh-st-menu-row-main">
        {icon}
        <span>{label}</span>
      </span>
      <span className="dsh-st-menu-row-side">
        {hint !== void 0 && <span>{hint}</span>}
        {active === true && chevron !== true && <i className="dsh-st-tick" />}
        {chevron === true && <i className="dsh-st-next" />}
      </span>
    </Button>;
}
function MenuSelect({
  value,
  options,
  onChange,
  wide,
  pill,
  up,
  icon
}) {
  const menu = useMenuOpen();
  const current = options.find((item) => item.value === value)?.label ?? value;
  return <div className={`dsh-st-select${wide === true ? " is-wide" : ""}${pill === true ? " is-pill" : ""}${menu.open ? " is-open" : ""}`} ref={menu.root}>
      <Button
    type="button"
    className="dsh-st-select-btn"
    onMouseDown={(event) => event.stopPropagation()}
    onClick={() => menu.setOpen((value2) => !value2)}
  >
        {icon}
        <span>{current}</span>
        <em />
      </Button>
      <MenuPopup
    open={menu.open}
    anchor={menu.root}
    menuRef={menu.menu}
    up={up}
    end={up}
    className={`dsh-st-select-menu${pill === true ? " is-composer" : ""}${up === true ? " is-up" : ""}${up === true ? " is-end" : ""}`}
  >
        {options.map((item) => <MenuRow
    key={item.value}
    icon={item.icon}
    label={item.label}
    active={item.value === value}
    onClick={() => {
      onChange(item.value);
      menu.setOpen(false);
    }}
  />)}
      </MenuPopup>
    </div>;
}
function MenuPanel({
  label,
  children,
  ghost,
  up,
  persist
}) {
  const menu = useMenuOpen();
  return <div className={`dsh-st-select${ghost === true ? " is-pill" : ""}${menu.open ? " is-open" : ""}`} ref={menu.root}>
      <Button
    type="button"
    className="dsh-st-chip-btn"
    onMouseDown={(event) => event.stopPropagation()}
    onClick={() => menu.setOpen((value) => !value)}
  >
        {label}
        {ghost === true && <em />}
      </Button>
      <MenuPopup
    open={menu.open}
    anchor={menu.root}
    menuRef={menu.menu}
    up={up}
    className={`dsh-st-select-menu is-composer${up === true ? " is-up" : ""}`}
    onClick={() => {
      if (persist !== true) menu.setOpen(false);
    }}
  >
        {children}
      </MenuPopup>
    </div>;
}
function useMenuState() {
  return useMenuOpen();
}
export {
  MenuHostProvider,
  MenuPanel,
  MenuPopup,
  MenuRow,
  MenuSelect,
  useMenuState
};
