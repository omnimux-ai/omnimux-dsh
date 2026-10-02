import { forwardRef, useCallback, useEffect, useId, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { IconCheckOutline16, IconChevronDownOutline14, IconChevronUpOutline14, IconCloseFill14, IconCloseOutline16, IconCopyOutline16, IconLoadingOutline16, IconRefreshOutline16, IconSearchOutline16, Menu, Modal, Tooltip } from "@deepseek-ai/dsh-client-ui-primitives";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { createPortal } from "react-dom";
//#region src/internal/cssClass.ts
/** CSS Modules values are `string | undefined` under `noUncheckedIndexedAccess`. */
function cssClass(value, name) {
	if (!value) throw new Error(`dsh-ui-kit: missing CSS module class "${name}"`);
	return value;
}
//#endregion
//#region src/internal/cx.ts
/** Tiny className joiner. Avoids a `clsx` dependency in the kit. */
function cx(...parts) {
	const out = [];
	for (const part of parts) {
		if (!part) continue;
		if (typeof part === "string" || typeof part === "number") {
			out.push(String(part));
			continue;
		}
		for (const [key, on] of Object.entries(part)) if (on) out.push(key);
	}
	return out.join(" ");
}
//#endregion
//#region src/internal/injectCss.ts
const injected = /* @__PURE__ */ new Set();
/**
* Insert a kit stylesheet once per id. Safe to call from every CSS-module
* import; a no-op in non-DOM environments (typecheck / SSR).
*/
function injectCss(id, css) {
	if (typeof document === "undefined") return;
	if (injected.has(id)) return;
	injected.add(id);
	const style = document.createElement("style");
	style.setAttribute("data-dsh-ui-kit", id);
	style.textContent = css;
	document.head.appendChild(style);
}
//#endregion
//#region \0dsh-ui-kit-css:/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/remove-expand-btn-css/packages/dsh-ui-kit/src/button/Button.module.css.mjs
injectCss("Button.module.css", ".dshUk-Button-button {\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  flex-shrink: 0;\n  gap: 6px;\n  box-sizing: border-box;\n  margin: 0;\n  border: 1px solid transparent;\n  border-radius: 8px;\n  cursor: pointer;\n  font: inherit;\n  font-size: 13px;\n  font-weight: 500;\n  line-height: 18px;\n  letter-spacing: 0;\n  white-space: nowrap;\n  color: var(--dsw-alias-label-primary);\n  background: transparent;\n  padding: 0 12px;\n  height: 32px;\n  vertical-align: middle;\n  user-select: none;\n  transition:\n    background-color 120ms cubic-bezier(0.16, 1, 0.3, 1),\n    border-color 120ms cubic-bezier(0.16, 1, 0.3, 1),\n    color 120ms cubic-bezier(0.16, 1, 0.3, 1),\n    transform 120ms cubic-bezier(0.16, 1, 0.3, 1),\n    box-shadow 120ms cubic-bezier(0.16, 1, 0.3, 1),\n    opacity 120ms cubic-bezier(0.16, 1, 0.3, 1);\n}\n\n.dshUk-Button-button:focus {\n  outline: none;\n}\n\n.dshUk-Button-button:focus-visible {\n  outline: 2px solid var(--dsw-alias-brand-primary);\n  outline-offset: 2px;\n}\n\n.dshUk-Button-button:disabled,\n.dshUk-Button-button[aria-disabled=\"true\"] {\n  cursor: not-allowed;\n  opacity: 0.4;\n}\n\n.dshUk-Button-button:active:not(:disabled):not([aria-disabled=\"true\"]) {\n  transform: scale(0.96);\n}\n\n.dshUk-Button-sm {\n  height: 28px;\n  padding: 0 10px;\n  border-radius: 6px;\n  font-size: 12px;\n  line-height: 16px;\n}\n\n.dshUk-Button-xs {\n  height: 24px;\n  padding: 0 8px;\n  border-radius: 6px;\n  font-size: 12px;\n  line-height: 16px;\n  gap: 4px;\n}\n\n.dshUk-Button-iconOnly {\n  padding: 0;\n  width: 32px;\n}\n\n.dshUk-Button-iconOnly.dshUk-Button-sm {\n  width: 28px;\n}\n\n.dshUk-Button-iconOnly.dshUk-Button-xs {\n  width: 24px;\n}\n\n.dshUk-Button-primary {\n  background: var(--dsw-alias-button-primary-fill);\n  color: var(--dsw-alias-label-primary-foreground);\n}\n\n.dshUk-Button-primary:hover:not(:disabled):not([aria-disabled=\"true\"]) {\n  background: var(--dsw-alias-button-primary-hover);\n}\n\n.dshUk-Button-secondary {\n  background: var(--dsw-alias-bg-layer-1);\n  border-color: var(--dsw-alias-border-l2);\n  color: var(--dsw-alias-label-primary);\n}\n\n.dshUk-Button-secondary:hover:not(:disabled):not([aria-disabled=\"true\"]) {\n  background: var(--dsw-alias-interactive-bg-hover);\n  border-color: var(--dsw-alias-border-l3);\n}\n\n.dshUk-Button-ghost {\n  background: transparent;\n  color: var(--dsw-alias-label-primary);\n}\n\n.dshUk-Button-ghost:hover:not(:disabled):not([aria-disabled=\"true\"]) {\n  background: var(--dsw-alias-interactive-bg-hover);\n}\n\n.dshUk-Button-ghost:active:not(:disabled):not([aria-disabled=\"true\"]) {\n  background: var(--dsw-alias-interactive-bg-active);\n}\n\n.dshUk-Button-outline {\n  background: transparent;\n  border-color: var(--dsw-alias-border-l2);\n  color: var(--dsw-alias-label-primary);\n}\n\n.dshUk-Button-outline:hover:not(:disabled):not([aria-disabled=\"true\"]) {\n  background: var(--dsw-alias-interactive-bg-hover);\n  border-color: var(--dsw-alias-border-l3);\n}\n\n.dshUk-Button-danger {\n  background: var(--dsw-alias-state-error-primary);\n  color: var(--dsw-alias-label-primary-foreground);\n}\n\n.dshUk-Button-danger:hover:not(:disabled):not([aria-disabled=\"true\"]) {\n  background: var(--dsw-alias-state-error-secondary);\n}\n\n.dshUk-Button-ghost[aria-pressed=\"true\"],\n.dshUk-Button-secondary[aria-pressed=\"true\"] {\n  background: var(--dsw-alias-button-ghost-active-fill);\n  box-shadow: inset 0 0 0 1px var(--dsw-alias-button-ghost-active-border);\n}\n\n/* Outline already owns a real 1px border. Keep pressed fill/border as\n * declarations — do not share the ghost/secondary inset box-shadow or the\n * pressed state would double-stroke. */\n.dshUk-Button-outline[aria-pressed=\"true\"] {\n  background: var(--dsw-alias-button-ghost-active-fill);\n  border-color: var(--dsw-alias-button-ghost-active-border);\n  color: var(--dsw-alias-label-primary);\n}\n\n/* Hover specificity defense: `.dshUk-Button-outline:hover` (and ghost/secondary hover)\n * would otherwise wash the pressed fill/border back to the idle hover tokens. */\n.dshUk-Button-ghost[aria-pressed=\"true\"]:hover:not(:disabled):not([aria-disabled=\"true\"]),\n.dshUk-Button-secondary[aria-pressed=\"true\"]:hover:not(:disabled):not([aria-disabled=\"true\"]),\n.dshUk-Button-outline[aria-pressed=\"true\"]:hover:not(:disabled):not([aria-disabled=\"true\"]) {\n  background: var(--dsw-alias-button-ghost-active-hover);\n}\n\n.dshUk-Button-outline[aria-pressed=\"true\"]:hover:not(:disabled):not([aria-disabled=\"true\"]) {\n  border-color: var(--dsw-alias-button-ghost-active-border);\n}\n\n.dshUk-Button-slot {\n  display: inline-flex;\n  width: 16px;\n  height: 16px;\n  align-items: center;\n  justify-content: center;\n  flex: none;\n}\n\n.dshUk-Button-xs .dshUk-Button-slot {\n  width: 14px;\n  height: 14px;\n}\n\n.dshUk-Button-spinner {\n  animation: dshUkSpin 0.7s linear infinite;\n}\n\n.dshUk-Button-label {\n  min-width: 0;\n}\n\n.dshUk-Button-loadingLabel {\n  opacity: 0.84;\n}\n\n@media (prefers-reduced-motion: reduce) {\n  .dshUk-Button-button {\n    transition: none;\n  }\n\n  .dshUk-Button-button:active:not(:disabled):not([aria-disabled=\"true\"]) {\n    transform: none;\n  }\n\n  .dshUk-Button-spinner {\n    animation: none;\n  }\n}\n\n@keyframes dshUkSpin {\n  from {\n    transform: rotate(0deg);\n  }\n  to {\n    transform: rotate(360deg);\n  }\n}\n");
var Button_module_css_default = {
	"button": "dshUk-Button-button",
	"sm": "dshUk-Button-sm",
	"xs": "dshUk-Button-xs",
	"iconOnly": "dshUk-Button-iconOnly",
	"primary": "dshUk-Button-primary",
	"secondary": "dshUk-Button-secondary",
	"ghost": "dshUk-Button-ghost",
	"outline": "dshUk-Button-outline",
	"danger": "dshUk-Button-danger",
	"slot": "dshUk-Button-slot",
	"spinner": "dshUk-Button-spinner",
	"label": "dshUk-Button-label",
	"loadingLabel": "dshUk-Button-loadingLabel"
};
//#endregion
//#region src/button/Button.tsx
const VARIANT_CLASS$1 = {
	primary: cssClass(Button_module_css_default.primary, "primary"),
	secondary: cssClass(Button_module_css_default.secondary, "secondary"),
	ghost: cssClass(Button_module_css_default.ghost, "ghost"),
	outline: cssClass(Button_module_css_default.outline, "outline"),
	danger: cssClass(Button_module_css_default.danger, "danger")
};
const SIZE_CLASS$2 = {
	default: void 0,
	sm: cssClass(Button_module_css_default.sm, "sm"),
	xs: cssClass(Button_module_css_default.xs, "xs")
};
/**
* 32 / 28 / 24 workbench button. Consumes `--dsw-alias-*` tokens so light and
* dark both follow the host theme (including OmniMux full-shell tint).
*/
const Button = forwardRef(function Button({ variant = "secondary", size = "default", loading = false, leadingIcon, trailingIcon, type = "button", className, disabled, children, ...rest }, ref) {
	const isDisabled = Boolean(disabled) || loading;
	return /* @__PURE__ */ jsxs("button", {
		...rest,
		ref,
		type,
		className: cx(Button_module_css_default.button, VARIANT_CLASS$1[variant], SIZE_CLASS$2[size], className),
		disabled: isDisabled,
		"aria-busy": loading || void 0,
		"aria-disabled": isDisabled || void 0,
		children: [
			loading ? /* @__PURE__ */ jsx("span", {
				className: cx(Button_module_css_default.slot, Button_module_css_default.spinner),
				"aria-hidden": "true",
				children: /* @__PURE__ */ jsx(IconLoadingOutline16, { size: size === "xs" ? 14 : 16 })
			}) : leadingIcon != null ? /* @__PURE__ */ jsx("span", {
				className: Button_module_css_default.slot,
				"aria-hidden": "true",
				children: leadingIcon
			}) : null,
			children != null && children !== "" ? /* @__PURE__ */ jsx("span", {
				className: cx(Button_module_css_default.label, loading && Button_module_css_default.loadingLabel),
				children
			}) : null,
			!loading && trailingIcon != null ? /* @__PURE__ */ jsx("span", {
				className: Button_module_css_default.slot,
				"aria-hidden": "true",
				children: trailingIcon
			}) : null
		]
	});
});
/** Square icon-only button with an official Tooltip and a required aria-label. */
const IconButton = forwardRef(function IconButton({ variant = "ghost", size = "default", loading = false, type = "button", className, disabled, children, title, tooltipSide = "bottom", "aria-label": ariaLabel, ...rest }, ref) {
	const isDisabled = Boolean(disabled) || loading;
	const tooltip = title ?? ariaLabel;
	const button = /* @__PURE__ */ jsx("button", {
		...rest,
		ref,
		type,
		className: cx(Button_module_css_default.button, VARIANT_CLASS$1[variant], SIZE_CLASS$2[size], Button_module_css_default.iconOnly, className),
		disabled: isDisabled,
		"aria-label": ariaLabel,
		"aria-busy": loading || void 0,
		"aria-disabled": isDisabled || void 0,
		children: /* @__PURE__ */ jsx("span", {
			className: cx(Button_module_css_default.slot, loading && Button_module_css_default.spinner),
			"aria-hidden": "true",
			children: loading ? /* @__PURE__ */ jsx(IconLoadingOutline16, { size: size === "xs" ? 14 : 16 }) : children
		})
	});
	if (!tooltip) return button;
	return /* @__PURE__ */ jsx(Tooltip, {
		label: tooltip,
		side: tooltipSide,
		delayMs: 280,
		disabled: isDisabled,
		children: button
	});
});
//#endregion
//#region src/internal/clipboard.ts
/**
* Robust asynchronous clipboard write with legacy document.execCommand fallback.
*/
async function copyToClipboard(text) {
	if (typeof window === "undefined" || typeof document === "undefined") return false;
	if (navigator.clipboard && window.isSecureContext) try {
		await navigator.clipboard.writeText(text);
		return true;
	} catch {}
	try {
		const textarea = document.createElement("textarea");
		textarea.value = text;
		textarea.setAttribute("readonly", "");
		textarea.style.position = "fixed";
		textarea.style.left = "-9999px";
		textarea.style.top = "-9999px";
		textarea.style.opacity = "0";
		textarea.style.pointerEvents = "none";
		document.body.appendChild(textarea);
		textarea.focus();
		textarea.select();
		const successful = document.execCommand("copy");
		document.body.removeChild(textarea);
		return successful;
	} catch {
		return false;
	}
}
//#endregion
//#region \0dsh-ui-kit-css:/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/remove-expand-btn-css/packages/dsh-ui-kit/src/button/CopyButton.module.css.mjs
injectCss("CopyButton.module.css", ".dshUk-CopyButton-copySuccessIcon {\n  color: var(--dsw-alias-state-success-primary);\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n}\n\n.dshUk-CopyButton-copyErrorIcon {\n  color: var(--dsw-alias-state-error-primary);\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n}\n\n.dshUk-CopyButton-copyButtonSuccess {\n  color: var(--dsw-alias-state-success-primary);\n}\n\n.dshUk-CopyButton-copyButtonError {\n  color: var(--dsw-alias-state-error-primary);\n}\n");
var CopyButton_module_css_default = {
	"copySuccessIcon": "dshUk-CopyButton-copySuccessIcon",
	"copyErrorIcon": "dshUk-CopyButton-copyErrorIcon",
	"copyButtonSuccess": "dshUk-CopyButton-copyButtonSuccess",
	"copyButtonError": "dshUk-CopyButton-copyButtonError"
};
//#endregion
//#region src/button/CopyButton.tsx
/**
* One-click copy button with 2s automatic reset state machine and clipboard fallback.
*/
const CopyButton = forwardRef(function CopyButton({ text, timeout = 2e3, label = "复制", copiedLabel = "已复制", errorLabel = "复制失败", size = "sm", variant = "ghost", onCopy, onError, showIcon = true, onClick, className, disabled, ...rest }, ref) {
	const [state, setState] = useState("idle");
	const timerRef = useRef(null);
	useEffect(() => {
		return () => {
			if (timerRef.current) clearTimeout(timerRef.current);
		};
	}, []);
	const handleClick = async (e) => {
		onClick?.(e);
		if (disabled) return;
		if (timerRef.current) clearTimeout(timerRef.current);
		try {
			const resolvedText = typeof text === "function" ? await text() : text;
			if (await copyToClipboard(resolvedText)) {
				setState("copied");
				onCopy?.(resolvedText);
			} else throw new Error("Clipboard copy failed");
		} catch (err) {
			const error = err instanceof Error ? err : new Error(String(err));
			setState("error");
			onError?.(error);
		}
		timerRef.current = setTimeout(() => {
			setState("idle");
		}, timeout);
	};
	let currentLabel = label;
	if (state === "copied") currentLabel = copiedLabel;
	else if (state === "error") currentLabel = errorLabel;
	let iconNode = null;
	if (showIcon) {
		if (state === "copied") iconNode = /* @__PURE__ */ jsx("span", {
			className: cssClass(CopyButton_module_css_default.copySuccessIcon, "copySuccessIcon"),
			children: /* @__PURE__ */ jsx(IconCheckOutline16, { size: size === "xs" ? 14 : 16 })
		});
		else iconNode = /* @__PURE__ */ jsx("span", {
			className: state === "error" ? cssClass(CopyButton_module_css_default.copyErrorIcon, "copyErrorIcon") : void 0,
			children: /* @__PURE__ */ jsx(IconCopyOutline16, { size: size === "xs" ? 14 : 16 })
		});
	}
	const stateClass = state === "copied" ? cssClass(CopyButton_module_css_default.copyButtonSuccess, "copyButtonSuccess") : state === "error" ? cssClass(CopyButton_module_css_default.copyButtonError, "copyButtonError") : void 0;
	return /* @__PURE__ */ jsx(Button, {
		...rest,
		ref,
		size,
		variant,
		disabled,
		leadingIcon: iconNode,
		className: cx(stateClass, className),
		onClick: handleClick,
		"aria-live": "polite",
		children: currentLabel
	});
});
//#endregion
//#region \0dsh-ui-kit-css:/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/remove-expand-btn-css/packages/dsh-ui-kit/src/badge/Badge.module.css.mjs
injectCss("Badge.module.css", ".dshUk-Badge-badge {\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  box-sizing: border-box;\n  font-family: inherit;\n  font-weight: 500;\n  line-height: 1;\n  white-space: nowrap;\n  vertical-align: middle;\n  user-select: none;\n  border: 1px solid transparent;\n  transition:\n    background-color 120ms cubic-bezier(0.16, 1, 0.3, 1),\n    border-color 120ms cubic-bezier(0.16, 1, 0.3, 1),\n    color 120ms cubic-bezier(0.16, 1, 0.3, 1);\n}\n\n/* Shapes */\n.dshUk-Badge-capsule {\n  border-radius: 9999px;\n}\n\n.dshUk-Badge-square {\n  border-radius: 4px;\n}\n\n.dshUk-Badge-dotShape {\n  border-radius: 9999px;\n  padding: 0;\n  min-width: 0;\n}\n\n/* Sizes for text/capsule/square */\n.dshUk-Badge-sm {\n  height: 16px;\n  padding: 0 6px;\n  font-size: 11px;\n  gap: 3px;\n}\n\n.dshUk-Badge-md {\n  height: 20px;\n  padding: 0 8px;\n  font-size: 12px;\n  gap: 4px;\n}\n\n.dshUk-Badge-lg {\n  height: 24px;\n  padding: 0 10px;\n  font-size: 13px;\n  gap: 6px;\n}\n\n/* Dot sizes when standalone */\n.dshUk-Badge-dotShape.dshUk-Badge-sm {\n  width: 6px;\n  height: 6px;\n}\n\n.dshUk-Badge-dotShape.dshUk-Badge-md {\n  width: 8px;\n  height: 8px;\n}\n\n.dshUk-Badge-dotShape.dshUk-Badge-lg {\n  width: 10px;\n  height: 10px;\n}\n\n/* Inline dot indicator inside badge */\n.dshUk-Badge-statusDot {\n  display: inline-block;\n  width: 6px;\n  height: 6px;\n  border-radius: 9999px;\n  background-color: currentColor;\n  flex-shrink: 0;\n}\n\n.dshUk-Badge-iconSlot {\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  flex-shrink: 0;\n}\n\n/* Semantic Variants */\n.dshUk-Badge-default {\n  background-color: var(--dsw-alias-bg-layer-2);\n  border-color: var(--dsw-alias-border-l1);\n  color: var(--dsw-alias-label-secondary);\n}\n\n.dshUk-Badge-neutral {\n  background-color: var(--dsw-alias-bg-layer-1);\n  border-color: var(--dsw-alias-border-l2);\n  color: var(--dsw-alias-label-secondary);\n}\n\n.dshUk-Badge-brand {\n  background-color: var(--dsw-alias-brand-secondary);\n  border-color: var(--dsw-alias-brand-primary);\n  color: var(--dsw-alias-brand-primary);\n}\n\n.dshUk-Badge-success {\n  background-color: var(--dsw-alias-state-success-subtle);\n  border-color: var(--dsw-alias-state-success-primary);\n  color: var(--dsw-alias-state-success-primary);\n}\n\n.dshUk-Badge-warning {\n  background-color: var(--dsw-alias-state-warning-subtle);\n  border-color: var(--dsw-alias-state-warning-primary);\n  color: var(--dsw-alias-state-warning-primary);\n}\n\n.dshUk-Badge-error {\n  background-color: var(--dsw-alias-state-error-subtle);\n  border-color: var(--dsw-alias-state-error-primary);\n  color: var(--dsw-alias-state-error-primary);\n}\n\n.dshUk-Badge-info {\n  background-color: var(--dsw-alias-state-info-subtle);\n  border-color: var(--dsw-alias-state-info-primary);\n  color: var(--dsw-alias-state-info-primary);\n}\n");
var Badge_module_css_default = {
	"badge": "dshUk-Badge-badge",
	"capsule": "dshUk-Badge-capsule",
	"square": "dshUk-Badge-square",
	"dotShape": "dshUk-Badge-dotShape",
	"sm": "dshUk-Badge-sm",
	"md": "dshUk-Badge-md",
	"lg": "dshUk-Badge-lg",
	"statusDot": "dshUk-Badge-statusDot",
	"iconSlot": "dshUk-Badge-iconSlot",
	"default": "dshUk-Badge-default",
	"neutral": "dshUk-Badge-neutral",
	"brand": "dshUk-Badge-brand",
	"success": "dshUk-Badge-success",
	"warning": "dshUk-Badge-warning",
	"error": "dshUk-Badge-error",
	"info": "dshUk-Badge-info"
};
//#endregion
//#region src/badge/Badge.tsx
const VARIANT_CLASS = {
	default: cssClass(Badge_module_css_default.default, "default"),
	neutral: cssClass(Badge_module_css_default.neutral, "neutral"),
	brand: cssClass(Badge_module_css_default.brand, "brand"),
	success: cssClass(Badge_module_css_default.success, "success"),
	warning: cssClass(Badge_module_css_default.warning, "warning"),
	error: cssClass(Badge_module_css_default.error, "error"),
	info: cssClass(Badge_module_css_default.info, "info")
};
const SHAPE_CLASS = {
	capsule: cssClass(Badge_module_css_default.capsule, "capsule"),
	dot: cssClass(Badge_module_css_default.dotShape, "dotShape"),
	square: cssClass(Badge_module_css_default.square, "square")
};
const SIZE_CLASS$1 = {
	sm: cssClass(Badge_module_css_default.sm, "sm"),
	md: cssClass(Badge_module_css_default.md, "md"),
	lg: cssClass(Badge_module_css_default.lg, "lg")
};
/**
* Universal badge / status indicator conforming to official `--dsw-alias-*` tokens.
*/
const Badge = forwardRef(function Badge({ variant = "default", shape = "capsule", size = "md", dot = false, count, maxCount = 99, icon, className, children, ...rest }, ref) {
	const isPureDot = dot || shape === "dot";
	const resolvedShape = isPureDot ? "dot" : shape;
	let displayContent = children;
	if (!isPureDot && count !== void 0 && (children == null || children === "")) displayContent = count > maxCount ? `${maxCount}+` : String(count);
	return /* @__PURE__ */ jsx("span", {
		...rest,
		ref,
		className: cx(Badge_module_css_default.badge, VARIANT_CLASS[variant], SHAPE_CLASS[resolvedShape], SIZE_CLASS$1[size], className),
		role: isPureDot ? "status" : void 0,
		children: isPureDot ? null : /* @__PURE__ */ jsxs(Fragment, { children: [icon != null ? /* @__PURE__ */ jsx("span", {
			className: Badge_module_css_default.iconSlot,
			"aria-hidden": "true",
			children: icon
		}) : null, displayContent != null && displayContent !== "" ? displayContent : null] })
	});
});
//#endregion
//#region \0dsh-ui-kit-css:/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/remove-expand-btn-css/packages/dsh-ui-kit/src/tile/SelectableTile.module.css.mjs
injectCss("SelectableTile.module.css", ".dshUk-SelectableTile-tile {\n  display: flex;\n  align-items: flex-start;\n  gap: 12px;\n  box-sizing: border-box;\n  width: 100%;\n  min-height: 48px;\n  padding: 12px 14px;\n  margin: 0;\n  border: 1px solid var(--dsw-alias-border-l2);\n  border-radius: 8px;\n  background-color: var(--dsw-alias-bg-layer-1);\n  color: var(--dsw-alias-label-primary);\n  cursor: pointer;\n  user-select: none;\n  text-align: left;\n  transition:\n    background-color 120ms cubic-bezier(0.16, 1, 0.3, 1),\n    border-color 120ms cubic-bezier(0.16, 1, 0.3, 1),\n    box-shadow 120ms cubic-bezier(0.16, 1, 0.3, 1),\n    opacity 120ms cubic-bezier(0.16, 1, 0.3, 1);\n}\n\n.dshUk-SelectableTile-tile:hover:not(.dshUk-SelectableTile-disabled):not(.dshUk-SelectableTile-loading) {\n  background-color: var(--dsw-alias-interactive-bg-hover);\n  border-color: var(--dsw-alias-border-l3);\n}\n\n.dshUk-SelectableTile-tile:focus {\n  outline: none;\n}\n\n.dshUk-SelectableTile-tile:focus-visible {\n  outline: 2px solid var(--dsw-alias-brand-primary);\n  outline-offset: 2px;\n}\n\n.dshUk-SelectableTile-selected {\n  background-color: var(--dsw-alias-interactive-bg-selected);\n  border-color: var(--dsw-alias-brand-primary);\n  box-shadow: inset 0 0 0 1px var(--dsw-alias-brand-primary);\n}\n\n.dshUk-SelectableTile-selected:hover:not(.dshUk-SelectableTile-disabled):not(.dshUk-SelectableTile-loading) {\n  background-color: var(--dsw-alias-interactive-bg-selected);\n  border-color: var(--dsw-alias-brand-primary);\n}\n\n.dshUk-SelectableTile-disabled {\n  cursor: not-allowed;\n  opacity: 0.45;\n}\n\n.dshUk-SelectableTile-loading {\n  cursor: wait;\n  opacity: 0.8;\n}\n\n/* Custom indicator icon for radio / checkbox */\n.dshUk-SelectableTile-indicator {\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  width: 16px;\n  height: 16px;\n  margin-top: 2px;\n  flex-shrink: 0;\n  border: 1px solid var(--dsw-alias-border-l3);\n  background-color: var(--dsw-alias-bg-layer-2);\n  transition:\n    border-color 120ms cubic-bezier(0.16, 1, 0.3, 1),\n    background-color 120ms cubic-bezier(0.16, 1, 0.3, 1);\n}\n\n.dshUk-SelectableTile-checkboxIndicator {\n  border-radius: 4px;\n}\n\n.dshUk-SelectableTile-radioIndicator {\n  border-radius: 9999px;\n}\n\n.dshUk-SelectableTile-selected .dshUk-SelectableTile-indicator {\n  border-color: var(--dsw-alias-brand-primary);\n  background-color: var(--dsw-alias-brand-primary);\n}\n\n.dshUk-SelectableTile-checkmark {\n  width: 10px;\n  height: 10px;\n  stroke: var(--dsw-alias-label-primary-foreground);\n  stroke-width: 2;\n  fill: none;\n  stroke-linecap: round;\n  stroke-linejoin: round;\n}\n\n.dshUk-SelectableTile-radioDot {\n  width: 6px;\n  height: 6px;\n  border-radius: 9999px;\n  background-color: var(--dsw-alias-label-primary-foreground);\n}\n\n.dshUk-SelectableTile-iconSlot {\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  flex-shrink: 0;\n  margin-top: 2px;\n  color: var(--dsw-alias-label-secondary);\n}\n\n.dshUk-SelectableTile-content {\n  display: flex;\n  flex-direction: column;\n  flex: 1;\n  min-width: 0;\n  gap: 4px;\n}\n\n.dshUk-SelectableTile-headerRow {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  flex-wrap: wrap;\n}\n\n.dshUk-SelectableTile-title {\n  font-size: 13px;\n  font-weight: 500;\n  line-height: 18px;\n  color: var(--dsw-alias-label-primary);\n  word-break: break-word;\n}\n\n.dshUk-SelectableTile-description {\n  font-size: 12px;\n  line-height: 16px;\n  color: var(--dsw-alias-label-secondary);\n  word-break: break-word;\n}\n\n.dshUk-SelectableTile-extraSlot {\n  display: inline-flex;\n  align-items: center;\n  flex-shrink: 0;\n  margin-left: auto;\n}\n");
var SelectableTile_module_css_default = {
	"tile": "dshUk-SelectableTile-tile",
	"disabled": "dshUk-SelectableTile-disabled",
	"loading": "dshUk-SelectableTile-loading",
	"selected": "dshUk-SelectableTile-selected",
	"indicator": "dshUk-SelectableTile-indicator",
	"checkboxIndicator": "dshUk-SelectableTile-checkboxIndicator",
	"radioIndicator": "dshUk-SelectableTile-radioIndicator",
	"checkmark": "dshUk-SelectableTile-checkmark",
	"radioDot": "dshUk-SelectableTile-radioDot",
	"iconSlot": "dshUk-SelectableTile-iconSlot",
	"content": "dshUk-SelectableTile-content",
	"headerRow": "dshUk-SelectableTile-headerRow",
	"title": "dshUk-SelectableTile-title",
	"description": "dshUk-SelectableTile-description",
	"extraSlot": "dshUk-SelectableTile-extraSlot"
};
//#endregion
//#region src/tile/SelectableTile.tsx
const CHECKMARK_PATH$1 = "M2 5.5 L4.5 8 L8.5 2.5";
/**
* Multi-line block-level selectable tile solving the 32px Button constraint.
* Supports keyboard navigation (Space / Enter) and official `--dsw-alias-*` tokens.
*/
const SelectableTile = forwardRef(function SelectableTile({ id, selected = false, title, description, badge, icon, extra, disabled = false, loading = false, selectionType = "checkbox", onChange, className, ...rest }, ref) {
	const isInteractive = !disabled && !loading;
	const handleClick = (e) => {
		if (!isInteractive) return;
		onChange?.(!selected, id);
	};
	const handleKeyDown = (e) => {
		if (!isInteractive) return;
		if (e.key === " " || e.key === "Enter") {
			e.preventDefault();
			onChange?.(!selected, id);
		}
	};
	return /* @__PURE__ */ jsxs("div", {
		...rest,
		ref,
		role: selectionType === "radio" ? "radio" : "checkbox",
		"aria-checked": selected,
		"aria-disabled": !isInteractive || void 0,
		tabIndex: isInteractive ? 0 : -1,
		onClick: handleClick,
		onKeyDown: handleKeyDown,
		className: cx(cssClass(SelectableTile_module_css_default.tile, "tile"), selected && cssClass(SelectableTile_module_css_default.selected, "selected"), disabled && cssClass(SelectableTile_module_css_default.disabled, "disabled"), loading && cssClass(SelectableTile_module_css_default.loading, "loading"), className),
		children: [
			/* @__PURE__ */ jsx("span", {
				className: cx(cssClass(SelectableTile_module_css_default.indicator, "indicator"), selectionType === "radio" ? cssClass(SelectableTile_module_css_default.radioIndicator, "radioIndicator") : cssClass(SelectableTile_module_css_default.checkboxIndicator, "checkboxIndicator")),
				"aria-hidden": "true",
				children: selected ? selectionType === "radio" ? /* @__PURE__ */ jsx("span", { className: cssClass(SelectableTile_module_css_default.radioDot, "radioDot") }) : /* @__PURE__ */ jsx("svg", {
					viewBox: "0 0 11 11",
					className: cssClass(SelectableTile_module_css_default.checkmark, "checkmark"),
					children: /* @__PURE__ */ jsx("path", { d: CHECKMARK_PATH$1 })
				}) : null
			}),
			icon != null ? /* @__PURE__ */ jsx("span", {
				className: cssClass(SelectableTile_module_css_default.iconSlot, "iconSlot"),
				"aria-hidden": "true",
				children: icon
			}) : null,
			/* @__PURE__ */ jsxs("div", {
				className: cssClass(SelectableTile_module_css_default.content, "content"),
				children: [/* @__PURE__ */ jsxs("div", {
					className: cssClass(SelectableTile_module_css_default.headerRow, "headerRow"),
					children: [/* @__PURE__ */ jsx("span", {
						className: cssClass(SelectableTile_module_css_default.title, "title"),
						children: title
					}), badge != null ? /* @__PURE__ */ jsx("span", { children: badge }) : null]
				}), description != null && description !== "" ? /* @__PURE__ */ jsx("div", {
					className: cssClass(SelectableTile_module_css_default.description, "description"),
					children: description
				}) : null]
			}),
			extra != null ? /* @__PURE__ */ jsx("div", {
				className: cssClass(SelectableTile_module_css_default.extraSlot, "extraSlot"),
				children: extra
			}) : null
		]
	});
});
//#endregion
//#region \0dsh-ui-kit-css:/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/remove-expand-btn-css/packages/dsh-ui-kit/src/table/Table.module.css.mjs
injectCss("Table.module.css", ".dshUk-Table-table {\n  width: 100%;\n  border-collapse: collapse;\n  box-sizing: border-box;\n  font-family: inherit;\n  font-size: 13px;\n  line-height: 18px;\n  color: var(--dsw-alias-label-primary);\n  background-color: var(--dsw-alias-bg-layer-1);\n  text-align: left;\n}\n\n.dshUk-Table-bordered {\n  border: 1px solid var(--dsw-alias-border-l1);\n}\n\n.dshUk-Table-bordered th,\n.dshUk-Table-bordered td {\n  border: 1px solid var(--dsw-alias-border-l1);\n}\n\n.dshUk-Table-tableHeader {\n  background-color: var(--dsw-alias-bg-layer-2);\n}\n\n.dshUk-Table-stickyHeader .dshUk-Table-headCell {\n  position: sticky;\n  top: 0;\n  z-index: 2;\n  background-color: var(--dsw-alias-bg-layer-2);\n}\n\n.dshUk-Table-headCell {\n  padding: 10px 12px;\n  font-size: 12px;\n  font-weight: 500;\n  line-height: 16px;\n  color: var(--dsw-alias-label-secondary);\n  border-bottom: 1px solid var(--dsw-alias-border-l2);\n  user-select: none;\n  box-sizing: border-box;\n  white-space: nowrap;\n}\n\n.dshUk-Table-dense .dshUk-Table-headCell {\n  padding: 6px 8px;\n}\n\n.dshUk-Table-headCellSortable {\n  cursor: pointer;\n  transition:\n    background-color 120ms cubic-bezier(0.16, 1, 0.3, 1),\n    color 120ms cubic-bezier(0.16, 1, 0.3, 1);\n}\n\n.dshUk-Table-headCellSortable:hover {\n  background-color: var(--dsw-alias-interactive-bg-hover);\n  color: var(--dsw-alias-label-primary);\n}\n\n.dshUk-Table-headCellContent {\n  display: inline-flex;\n  align-items: center;\n  gap: 4px;\n}\n\n.dshUk-Table-sortIcon {\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  width: 14px;\n  height: 14px;\n  flex-shrink: 0;\n  color: var(--dsw-alias-label-tertiary);\n  transition: color 120ms ease;\n}\n\n.dshUk-Table-sortIconActive {\n  color: var(--dsw-alias-brand-primary);\n}\n\n.dshUk-Table-tableBody {\n  background-color: var(--dsw-alias-bg-layer-1);\n}\n\n.dshUk-Table-row {\n  border-bottom: 1px solid var(--dsw-alias-border-l1);\n  transition: background-color 120ms cubic-bezier(0.16, 1, 0.3, 1);\n}\n\n.dshUk-Table-row:hover {\n  background-color: var(--dsw-alias-interactive-bg-hover);\n}\n\n.dshUk-Table-rowSelected {\n  background-color: var(--dsw-alias-interactive-bg-selected);\n}\n\n.dshUk-Table-rowSelected:hover {\n  background-color: var(--dsw-alias-interactive-bg-selected);\n}\n\n.dshUk-Table-cell {\n  padding: 10px 12px;\n  font-size: 13px;\n  line-height: 18px;\n  color: var(--dsw-alias-label-primary);\n  box-sizing: border-box;\n}\n\n.dshUk-Table-dense .dshUk-Table-cell {\n  padding: 6px 8px;\n}\n\n.dshUk-Table-alignLeft {\n  text-align: left;\n}\n\n.dshUk-Table-alignCenter {\n  text-align: center;\n}\n\n.dshUk-Table-alignRight {\n  text-align: right;\n}\n");
var Table_module_css_default = {
	"table": "dshUk-Table-table",
	"bordered": "dshUk-Table-bordered",
	"tableHeader": "dshUk-Table-tableHeader",
	"stickyHeader": "dshUk-Table-stickyHeader",
	"headCell": "dshUk-Table-headCell",
	"dense": "dshUk-Table-dense",
	"headCellSortable": "dshUk-Table-headCellSortable",
	"headCellContent": "dshUk-Table-headCellContent",
	"sortIcon": "dshUk-Table-sortIcon",
	"sortIconActive": "dshUk-Table-sortIconActive",
	"tableBody": "dshUk-Table-tableBody",
	"row": "dshUk-Table-row",
	"rowSelected": "dshUk-Table-rowSelected",
	"cell": "dshUk-Table-cell",
	"alignLeft": "dshUk-Table-alignLeft",
	"alignCenter": "dshUk-Table-alignCenter",
	"alignRight": "dshUk-Table-alignRight"
};
//#endregion
//#region src/table/Table.tsx
const Table = forwardRef(function Table({ stickyHeader = false, bordered = false, dense = false, className, children, ...rest }, ref) {
	return /* @__PURE__ */ jsx("table", {
		...rest,
		ref,
		className: cx(cssClass(Table_module_css_default.table, "table"), stickyHeader && cssClass(Table_module_css_default.stickyHeader, "stickyHeader"), bordered && cssClass(Table_module_css_default.bordered, "bordered"), dense && cssClass(Table_module_css_default.dense, "dense"), className),
		children
	});
});
const TableHeader = forwardRef(function TableHeader({ className, children, ...rest }, ref) {
	return /* @__PURE__ */ jsx("thead", {
		...rest,
		ref,
		className: cx(cssClass(Table_module_css_default.tableHeader, "tableHeader"), className),
		children
	});
});
const TableBody = forwardRef(function TableBody({ className, children, ...rest }, ref) {
	return /* @__PURE__ */ jsx("tbody", {
		...rest,
		ref,
		className: cx(cssClass(Table_module_css_default.tableBody, "tableBody"), className),
		children
	});
});
const TableRow = forwardRef(function TableRow({ selected = false, className, children, ...rest }, ref) {
	return /* @__PURE__ */ jsx("tr", {
		...rest,
		ref,
		"aria-selected": selected || void 0,
		className: cx(cssClass(Table_module_css_default.row, "row"), selected && cssClass(Table_module_css_default.rowSelected, "rowSelected"), className),
		children
	});
});
const ALIGN_CLASS = {
	left: cssClass(Table_module_css_default.alignLeft, "alignLeft"),
	center: cssClass(Table_module_css_default.alignCenter, "alignCenter"),
	right: cssClass(Table_module_css_default.alignRight, "alignRight")
};
const TableCell = forwardRef(function TableCell({ align = "left", className, children, ...rest }, ref) {
	return /* @__PURE__ */ jsx("td", {
		...rest,
		ref,
		className: cx(cssClass(Table_module_css_default.cell, "cell"), ALIGN_CLASS[align], className),
		children
	});
});
const TableHead = forwardRef(function TableHead({ align = "left", sortable = false, sortDirection = null, className, children, ...rest }, ref) {
	const ariaSort = sortDirection === "asc" ? "ascending" : sortDirection === "desc" ? "descending" : sortable ? "none" : void 0;
	return /* @__PURE__ */ jsx("th", {
		...rest,
		ref,
		"aria-sort": ariaSort,
		className: cx(cssClass(Table_module_css_default.headCell, "headCell"), sortable && cssClass(Table_module_css_default.headCellSortable, "headCellSortable"), ALIGN_CLASS[align], className),
		children: /* @__PURE__ */ jsxs("div", {
			className: cssClass(Table_module_css_default.headCellContent, "headCellContent"),
			children: [/* @__PURE__ */ jsx("span", { children }), sortable ? /* @__PURE__ */ jsx("span", {
				className: cx(cssClass(Table_module_css_default.sortIcon, "sortIcon"), sortDirection !== null && cssClass(Table_module_css_default.sortIconActive, "sortIconActive")),
				"aria-hidden": "true",
				children: sortDirection === "asc" ? /* @__PURE__ */ jsx("svg", {
					width: "10",
					height: "10",
					viewBox: "0 0 10 10",
					fill: "currentColor",
					children: /* @__PURE__ */ jsx("path", { d: "M5 2L8.5 7H1.5L5 2Z" })
				}) : sortDirection === "desc" ? /* @__PURE__ */ jsx("svg", {
					width: "10",
					height: "10",
					viewBox: "0 0 10 10",
					fill: "currentColor",
					children: /* @__PURE__ */ jsx("path", { d: "M5 8L1.5 3H8.5L5 8Z" })
				}) : /* @__PURE__ */ jsx("svg", {
					width: "10",
					height: "10",
					viewBox: "0 0 10 10",
					fill: "currentColor",
					opacity: "0.4",
					children: /* @__PURE__ */ jsx("path", { d: "M5 2L7.5 5H2.5L5 2ZM5 8L2.5 5H7.5L5 8Z" })
				})
			}) : null]
		})
	});
});
//#endregion
//#region \0dsh-ui-kit-css:/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/remove-expand-btn-css/packages/dsh-ui-kit/src/empty/EmptyState.module.css.mjs
injectCss("EmptyState.module.css", ".dshUk-EmptyState-emptyState {\n  display: flex;\n  flex-direction: column;\n  align-items: center;\n  justify-content: center;\n  text-align: center;\n  padding: 48px 24px;\n  min-height: 240px;\n  box-sizing: border-box;\n  color: var(--dsw-alias-label-secondary);\n}\n\n.dshUk-EmptyState-emptyState.dshUk-EmptyState-compact {\n  padding: 24px 16px;\n  min-height: 140px;\n}\n\n.dshUk-EmptyState-iconWrap {\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  margin-bottom: 12px;\n  color: var(--dsw-alias-label-tertiary);\n}\n\n.dshUk-EmptyState-title {\n  margin: 0 0 6px;\n  font-size: 15px;\n  font-weight: 600;\n  line-height: 20px;\n  color: var(--dsw-alias-label-primary);\n}\n\n.dshUk-EmptyState-description {\n  margin: 0;\n  font-size: 13px;\n  line-height: 18px;\n  color: var(--dsw-alias-label-secondary);\n  max-width: 360px;\n}\n\n.dshUk-EmptyState-actions {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  margin-top: 16px;\n}\n");
var EmptyState_module_css_default = {
	"emptyState": "dshUk-EmptyState-emptyState",
	"compact": "dshUk-EmptyState-compact",
	"iconWrap": "dshUk-EmptyState-iconWrap",
	"title": "dshUk-EmptyState-title",
	"description": "dshUk-EmptyState-description",
	"actions": "dshUk-EmptyState-actions"
};
//#endregion
//#region src/empty/EmptyState.tsx
const EMPTY_CLASS = cssClass(EmptyState_module_css_default.emptyState, "emptyState");
const COMPACT_CLASS = cssClass(EmptyState_module_css_default.compact, "compact");
const ICON_WRAP_CLASS = cssClass(EmptyState_module_css_default.iconWrap, "iconWrap");
const TITLE_CLASS$1 = cssClass(EmptyState_module_css_default.title, "title");
const DESCRIPTION_CLASS = cssClass(EmptyState_module_css_default.description, "description");
const ACTIONS_CLASS = cssClass(EmptyState_module_css_default.actions, "actions");
const EmptyState = forwardRef(function EmptyState({ icon, title, description, action, secondaryAction, compact = false, className, ...rest }, ref) {
	return /* @__PURE__ */ jsxs("div", {
		...rest,
		ref,
		className: cx(EMPTY_CLASS, compact && COMPACT_CLASS, className),
		children: [
			icon && /* @__PURE__ */ jsx("div", {
				className: ICON_WRAP_CLASS,
				children: icon
			}),
			/* @__PURE__ */ jsx("h3", {
				className: TITLE_CLASS$1,
				children: title
			}),
			description && /* @__PURE__ */ jsx("p", {
				className: DESCRIPTION_CLASS,
				children: description
			}),
			(action || secondaryAction) && /* @__PURE__ */ jsxs("div", {
				className: ACTIONS_CLASS,
				children: [action, secondaryAction]
			})
		]
	});
});
//#endregion
//#region \0dsh-ui-kit-css:/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/remove-expand-btn-css/packages/dsh-ui-kit/src/table/DataTable.module.css.mjs
injectCss("DataTable.module.css", ".dshUk-DataTable-tableWrap {\n  position: relative;\n  width: 100%;\n  box-sizing: border-box;\n  background-color: var(--dsw-alias-bg-layer-1);\n  border: 1px solid var(--dsw-alias-border-l1);\n  border-radius: 8px;\n  overflow: hidden;\n}\n\n/* Horizontal scroll indicators via pseudo-elements */\n.dshUk-DataTable-tableWrap::before {\n  content: \"\";\n  position: absolute;\n  top: 0;\n  bottom: 0;\n  left: 0;\n  width: 16px;\n  background: linear-gradient(90deg, var(--dsw-alias-border-l2), transparent);\n  opacity: 0;\n  pointer-events: none;\n  z-index: 3;\n  transition: opacity 150ms ease;\n}\n\n.dshUk-DataTable-tableWrap::after {\n  content: \"\";\n  position: absolute;\n  top: 0;\n  bottom: 0;\n  right: 0;\n  width: 16px;\n  background: linear-gradient(270deg, var(--dsw-alias-border-l2), transparent);\n  opacity: 0;\n  pointer-events: none;\n  z-index: 3;\n  transition: opacity 150ms ease;\n}\n\n.dshUk-DataTable-hasScrollLeft::before {\n  opacity: 1;\n}\n\n.dshUk-DataTable-hasScrollRight::after {\n  opacity: 1;\n}\n\n.dshUk-DataTable-scrollContainer {\n  width: 100%;\n  overflow-x: auto;\n  box-sizing: border-box;\n}\n\n.dshUk-DataTable-clickableRow {\n  cursor: pointer;\n}\n\n/* Custom accessible checkbox/radio indicator for table rows */\n.dshUk-DataTable-selectCell {\n  width: 40px;\n  min-width: 40px;\n  max-width: 40px;\n  text-align: center;\n  padding: 10px 8px;\n  vertical-align: middle;\n}\n\n.dshUk-DataTable-checkboxIndicator {\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  width: 16px;\n  height: 16px;\n  border: 1px solid var(--dsw-alias-border-l3);\n  border-radius: 4px;\n  background-color: var(--dsw-alias-bg-layer-2);\n  cursor: pointer;\n  box-sizing: border-box;\n  transition:\n    background-color 120ms cubic-bezier(0.16, 1, 0.3, 1),\n    border-color 120ms cubic-bezier(0.16, 1, 0.3, 1);\n}\n\n.dshUk-DataTable-radioIndicator {\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  width: 16px;\n  height: 16px;\n  border: 1px solid var(--dsw-alias-border-l3);\n  border-radius: 9999px;\n  background-color: var(--dsw-alias-bg-layer-2);\n  cursor: pointer;\n  box-sizing: border-box;\n  transition:\n    background-color 120ms cubic-bezier(0.16, 1, 0.3, 1),\n    border-color 120ms cubic-bezier(0.16, 1, 0.3, 1);\n}\n\n.dshUk-DataTable-checkboxIndicator:focus-visible,\n.dshUk-DataTable-radioIndicator:focus-visible {\n  outline: 2px solid var(--dsw-alias-brand-primary);\n  outline-offset: 1px;\n}\n\n.dshUk-DataTable-checkboxSelected,\n.dshUk-DataTable-radioSelected {\n  background-color: var(--dsw-alias-brand-primary);\n  border-color: var(--dsw-alias-brand-primary);\n}\n\n.dshUk-DataTable-checkboxIndeterminate {\n  background-color: var(--dsw-alias-brand-primary);\n  border-color: var(--dsw-alias-brand-primary);\n}\n\n.dshUk-DataTable-checkmark {\n  width: 10px;\n  height: 10px;\n  stroke: var(--dsw-alias-label-primary-foreground);\n  stroke-width: 2;\n  fill: none;\n  stroke-linecap: round;\n  stroke-linejoin: round;\n}\n\n.dshUk-DataTable-minusMark {\n  width: 8px;\n  height: 2px;\n  background-color: var(--dsw-alias-label-primary-foreground);\n  border-radius: 1px;\n}\n\n.dshUk-DataTable-radioDot {\n  width: 6px;\n  height: 6px;\n  border-radius: 9999px;\n  background-color: var(--dsw-alias-label-primary-foreground);\n}\n\n/* Empty container */\n.dshUk-DataTable-emptyContainer {\n  padding: 32px 16px;\n  text-align: center;\n}\n\n/* Skeleton loader */\n.dshUk-DataTable-skeletonRow td {\n  padding: 12px;\n}\n\n.dshUk-DataTable-skeletonBar {\n  height: 14px;\n  border-radius: 4px;\n  background: var(--dsw-alias-bg-layer-2);\n  animation: pulse 1.5s ease-in-out infinite;\n}\n\n@keyframes pulse {\n  0% {\n    opacity: 0.5;\n  }\n  50% {\n    opacity: 0.9;\n  }\n  100% {\n    opacity: 0.5;\n  }\n}\n");
var DataTable_module_css_default = {
	"tableWrap": "dshUk-DataTable-tableWrap",
	"hasScrollLeft": "dshUk-DataTable-hasScrollLeft",
	"hasScrollRight": "dshUk-DataTable-hasScrollRight",
	"scrollContainer": "dshUk-DataTable-scrollContainer",
	"clickableRow": "dshUk-DataTable-clickableRow",
	"selectCell": "dshUk-DataTable-selectCell",
	"checkboxIndicator": "dshUk-DataTable-checkboxIndicator",
	"radioIndicator": "dshUk-DataTable-radioIndicator",
	"checkboxSelected": "dshUk-DataTable-checkboxSelected",
	"radioSelected": "dshUk-DataTable-radioSelected",
	"checkboxIndeterminate": "dshUk-DataTable-checkboxIndeterminate",
	"checkmark": "dshUk-DataTable-checkmark",
	"minusMark": "dshUk-DataTable-minusMark",
	"radioDot": "dshUk-DataTable-radioDot",
	"emptyContainer": "dshUk-DataTable-emptyContainer",
	"skeletonRow": "dshUk-DataTable-skeletonRow",
	"skeletonBar": "dshUk-DataTable-skeletonBar"
};
//#endregion
//#region src/table/DataTable.tsx
const CHECKMARK_PATH = "M2 5.5 L4.5 8 L8.5 2.5";
/**
* Generic declarative high-level data table with sorting, multi-selection,
* horizontal scroll indicators, and EmptyState integration.
*/
function DataTable({ data, columns, rowKey, selectedRowKeys = [], onSelectionChange, selectionMode = "none", sortKey = null, sortDirection = null, onSortChange, loading = false, emptyContent, stickyHeader = false, scrollX = true, className, rowClassName, onRowClick }) {
	const scrollContainerRef = useRef(null);
	const [hasScrollLeft, setHasScrollLeft] = useState(false);
	const [hasScrollRight, setHasScrollRight] = useState(false);
	const getRowKey = useCallback((row) => {
		if (typeof rowKey === "function") return rowKey(row);
		return String(row[rowKey]);
	}, [rowKey]);
	const updateScrollShadows = useCallback(() => {
		const el = scrollContainerRef.current;
		if (!el || !scrollX) return;
		if (!(el.scrollWidth > el.clientWidth + 2)) {
			setHasScrollLeft(false);
			setHasScrollRight(false);
			return;
		}
		setHasScrollLeft(el.scrollLeft > 2);
		setHasScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 2);
	}, [scrollX]);
	useEffect(() => {
		updateScrollShadows();
		const el = scrollContainerRef.current;
		if (!el) return;
		el.addEventListener("scroll", updateScrollShadows, { passive: true });
		let observer = null;
		if (typeof ResizeObserver !== "undefined") {
			observer = new ResizeObserver(() => updateScrollShadows());
			observer.observe(el);
		}
		return () => {
			el.removeEventListener("scroll", updateScrollShadows);
			observer?.disconnect();
		};
	}, [
		updateScrollShadows,
		data,
		columns
	]);
	const selectedKeySet = useMemo(() => new Set(selectedRowKeys), [selectedRowKeys]);
	const isAllSelected = useMemo(() => {
		if (data.length === 0) return false;
		return data.every((row) => selectedKeySet.has(getRowKey(row)));
	}, [
		data,
		getRowKey,
		selectedKeySet
	]);
	const isPartiallySelected = useMemo(() => {
		if (isAllSelected || data.length === 0) return false;
		return data.some((row) => selectedKeySet.has(getRowKey(row)));
	}, [
		data,
		getRowKey,
		isAllSelected,
		selectedKeySet
	]);
	const toggleSort = (colId) => {
		if (!onSortChange) return;
		if (sortKey !== colId) {
			onSortChange(colId, "desc");
			return;
		}
		if (sortDirection === "desc") onSortChange(colId, "asc");
		else if (sortDirection === "asc") onSortChange(null, null);
		else onSortChange(colId, "desc");
	};
	const handleSelectAll = (e) => {
		e?.stopPropagation();
		if (!onSelectionChange) return;
		if (isAllSelected) onSelectionChange([], []);
		else onSelectionChange(data.map(getRowKey), [...data]);
	};
	const handleRowSelect = (row, key, e) => {
		e?.stopPropagation();
		if (!onSelectionChange) return;
		if (selectionMode === "single") {
			if (selectedKeySet.has(key)) onSelectionChange([], []);
			else onSelectionChange([key], [row]);
			return;
		}
		if (selectionMode === "multiple") {
			const nextKeys = new Set(selectedKeySet);
			if (nextKeys.has(key)) nextKeys.delete(key);
			else nextKeys.add(key);
			onSelectionChange(Array.from(nextKeys), data.filter((r) => nextKeys.has(getRowKey(r))));
		}
	};
	const getCellValue = (row, column) => {
		if (column.accessorFn) return column.accessorFn(row);
		if (column.accessorKey) return row[column.accessorKey];
	};
	const showSelection = selectionMode === "single" || selectionMode === "multiple";
	return /* @__PURE__ */ jsx("div", {
		className: cx(cssClass(DataTable_module_css_default.tableWrap, "tableWrap"), scrollX && hasScrollLeft && cssClass(DataTable_module_css_default.hasScrollLeft, "hasScrollLeft"), scrollX && hasScrollRight && cssClass(DataTable_module_css_default.hasScrollRight, "hasScrollRight"), className),
		children: /* @__PURE__ */ jsx("div", {
			ref: scrollContainerRef,
			className: cssClass(DataTable_module_css_default.scrollContainer, "scrollContainer"),
			children: /* @__PURE__ */ jsxs(Table, {
				stickyHeader,
				children: [/* @__PURE__ */ jsx(TableHeader, { children: /* @__PURE__ */ jsxs(TableRow, { children: [showSelection ? /* @__PURE__ */ jsx(TableHead, {
					className: cssClass(DataTable_module_css_default.selectCell, "selectCell"),
					children: selectionMode === "multiple" ? /* @__PURE__ */ jsx("span", {
						role: "checkbox",
						"aria-checked": isAllSelected ? "true" : isPartiallySelected ? "mixed" : "false",
						"aria-label": "全选所有行",
						tabIndex: 0,
						className: cx(cssClass(DataTable_module_css_default.checkboxIndicator, "checkboxIndicator"), isAllSelected && cssClass(DataTable_module_css_default.checkboxSelected, "checkboxSelected"), isPartiallySelected && cssClass(DataTable_module_css_default.checkboxIndeterminate, "checkboxIndeterminate")),
						onClick: (e) => handleSelectAll(e),
						onKeyDown: (e) => {
							if (e.key === " " || e.key === "Enter") {
								e.preventDefault();
								handleSelectAll(e);
							}
						},
						children: isAllSelected ? /* @__PURE__ */ jsx("svg", {
							viewBox: "0 0 11 11",
							className: cssClass(DataTable_module_css_default.checkmark, "checkmark"),
							children: /* @__PURE__ */ jsx("path", { d: CHECKMARK_PATH })
						}) : isPartiallySelected ? /* @__PURE__ */ jsx("span", { className: cssClass(DataTable_module_css_default.minusMark, "minusMark") }) : null
					}) : null
				}) : null, columns.map((column) => {
					const colSortDir = sortKey === column.id ? sortDirection : null;
					const headerContent = typeof column.header === "function" ? column.header({
						column,
						sortDirection: colSortDir,
						toggleSort: () => toggleSort(column.id)
					}) : column.header;
					return /* @__PURE__ */ jsx(TableHead, {
						align: column.align,
						sortable: column.sortable,
						sortDirection: colSortDir,
						style: {
							width: column.width,
							minWidth: column.minWidth
						},
						onClick: column.sortable ? () => toggleSort(column.id) : void 0,
						children: headerContent
					}, column.id);
				})] }) }), /* @__PURE__ */ jsx(TableBody, { children: loading ? [
					0,
					1,
					2
				].map((idx) => /* @__PURE__ */ jsxs(TableRow, {
					className: cssClass(DataTable_module_css_default.skeletonRow, "skeletonRow"),
					children: [showSelection ? /* @__PURE__ */ jsx(TableCell, {}) : null, columns.map((col) => /* @__PURE__ */ jsx(TableCell, { children: /* @__PURE__ */ jsx("div", { className: cssClass(DataTable_module_css_default.skeletonBar, "skeletonBar") }) }, col.id))]
				}, `skeleton-${idx}`)) : data.length === 0 ? /* @__PURE__ */ jsx(TableRow, { children: /* @__PURE__ */ jsx(TableCell, {
					colSpan: columns.length + (showSelection ? 1 : 0),
					className: cssClass(DataTable_module_css_default.emptyContainer, "emptyContainer"),
					children: emptyContent ?? /* @__PURE__ */ jsx(EmptyState, { title: "暂无数据" })
				}) }) : data.map((row, rowIndex) => {
					const key = getRowKey(row);
					const isSelected = selectedKeySet.has(key);
					const customRowClass = typeof rowClassName === "function" ? rowClassName(row, rowIndex) : rowClassName;
					return /* @__PURE__ */ jsxs(TableRow, {
						selected: isSelected,
						className: cx(onRowClick && cssClass(DataTable_module_css_default.clickableRow, "clickableRow"), customRowClass),
						onClick: () => onRowClick?.(row, rowIndex),
						children: [showSelection ? /* @__PURE__ */ jsx(TableCell, {
							className: cssClass(DataTable_module_css_default.selectCell, "selectCell"),
							children: /* @__PURE__ */ jsx("span", {
								role: selectionMode === "single" ? "radio" : "checkbox",
								"aria-checked": isSelected,
								"aria-label": `选择第 ${rowIndex + 1} 行`,
								tabIndex: 0,
								className: cx(selectionMode === "single" ? cssClass(DataTable_module_css_default.radioIndicator, "radioIndicator") : cssClass(DataTable_module_css_default.checkboxIndicator, "checkboxIndicator"), isSelected && (selectionMode === "single" ? cssClass(DataTable_module_css_default.radioSelected, "radioSelected") : cssClass(DataTable_module_css_default.checkboxSelected, "checkboxSelected"))),
								onClick: (e) => handleRowSelect(row, key, e),
								onKeyDown: (e) => {
									if (e.key === " " || e.key === "Enter") {
										e.preventDefault();
										handleRowSelect(row, key, e);
									}
								},
								children: isSelected ? selectionMode === "single" ? /* @__PURE__ */ jsx("span", { className: cssClass(DataTable_module_css_default.radioDot, "radioDot") }) : /* @__PURE__ */ jsx("svg", {
									viewBox: "0 0 11 11",
									className: cssClass(DataTable_module_css_default.checkmark, "checkmark"),
									children: /* @__PURE__ */ jsx("path", { d: CHECKMARK_PATH })
								}) : null
							})
						}) : null, columns.map((column) => {
							const value = getCellValue(row, column);
							const renderedCell = column.cell ? column.cell({
								row,
								rowIndex,
								column,
								value
							}) : value;
							return /* @__PURE__ */ jsx(TableCell, {
								align: column.align,
								style: {
									width: column.width,
									minWidth: column.minWidth
								},
								children: renderedCell
							}, column.id);
						})]
					}, key);
				}) })]
			})
		})
	});
}
//#endregion
//#region \0dsh-ui-kit-css:/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/remove-expand-btn-css/packages/dsh-ui-kit/src/card/MediaCard.module.css.mjs
injectCss("MediaCard.module.css", ".dshUk-MediaCard-card {\n  display: flex;\n  flex-direction: column;\n  box-sizing: border-box;\n  width: 100%;\n  border: 1px solid var(--dsw-alias-border-l1);\n  border-radius: 8px;\n  background-color: var(--dsw-alias-bg-layer-1);\n  color: var(--dsw-alias-label-primary);\n  overflow: hidden;\n  user-select: none;\n  cursor: pointer;\n  transition:\n    background-color 120ms cubic-bezier(0.16, 1, 0.3, 1),\n    border-color 120ms cubic-bezier(0.16, 1, 0.3, 1),\n    box-shadow 120ms cubic-bezier(0.16, 1, 0.3, 1),\n    transform 120ms cubic-bezier(0.16, 1, 0.3, 1),\n    opacity 120ms cubic-bezier(0.16, 1, 0.3, 1);\n}\n\n.dshUk-MediaCard-card:hover:not(.dshUk-MediaCard-disabled):not(.dshUk-MediaCard-loading) {\n  border-color: var(--dsw-alias-border-l3);\n  box-shadow: 0 4px 12px var(--dsw-alias-border-l1);\n}\n\n.dshUk-MediaCard-card:focus {\n  outline: none;\n}\n\n.dshUk-MediaCard-card:focus-visible {\n  outline: 2px solid var(--dsw-alias-brand-primary);\n  outline-offset: 2px;\n}\n\n.dshUk-MediaCard-selected {\n  border-color: var(--dsw-alias-brand-primary);\n  box-shadow: inset 0 0 0 1px var(--dsw-alias-brand-primary);\n  background-color: var(--dsw-alias-interactive-bg-selected);\n}\n\n.dshUk-MediaCard-disabled {\n  cursor: not-allowed;\n  opacity: 0.45;\n}\n\n.dshUk-MediaCard-loading {\n  cursor: wait;\n  opacity: 0.8;\n}\n\n/* Media cover wrapper */\n.dshUk-MediaCard-coverWrapper {\n  position: relative;\n  width: 100%;\n  overflow: hidden;\n  background-color: var(--dsw-alias-bg-layer-2);\n}\n\n.dshUk-MediaCard-aspect16x9 {\n  aspect-ratio: 16 / 9;\n}\n\n.dshUk-MediaCard-aspect4x3 {\n  aspect-ratio: 4 / 3;\n}\n\n.dshUk-MediaCard-aspect1x1 {\n  aspect-ratio: 1 / 1;\n}\n\n.dshUk-MediaCard-aspect9x16 {\n  aspect-ratio: 9 / 16;\n}\n\n.dshUk-MediaCard-coverImage {\n  width: 100%;\n  height: 100%;\n  object-fit: cover;\n  display: block;\n  transition: transform 200ms cubic-bezier(0.16, 1, 0.3, 1);\n}\n\n.dshUk-MediaCard-card:hover:not(.dshUk-MediaCard-disabled):not(.dshUk-MediaCard-loading) .dshUk-MediaCard-coverImage {\n  transform: scale(1.03);\n}\n\n.dshUk-MediaCard-coverPlaceholder {\n  width: 100%;\n  height: 100%;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  color: var(--dsw-alias-label-tertiary);\n}\n\n.dshUk-MediaCard-badgeSlot {\n  position: absolute;\n  top: 8px;\n  right: 8px;\n  z-index: 2;\n  pointer-events: none;\n}\n\n/* Hover overlay actions */\n.dshUk-MediaCard-actionsOverlay {\n  position: absolute;\n  bottom: 8px;\n  right: 8px;\n  display: flex;\n  align-items: center;\n  gap: 6px;\n  padding: 4px 6px;\n  border-radius: 6px;\n  background-color: var(--dsw-alias-bg-layer-1);\n  border: 1px solid var(--dsw-alias-border-l2);\n  opacity: 0;\n  transform: translateY(4px);\n  pointer-events: none;\n  transition:\n    opacity 150ms cubic-bezier(0.16, 1, 0.3, 1),\n    transform 150ms cubic-bezier(0.16, 1, 0.3, 1);\n  z-index: 3;\n}\n\n.dshUk-MediaCard-card:hover:not(.dshUk-MediaCard-disabled):not(.dshUk-MediaCard-loading) .dshUk-MediaCard-actionsOverlay,\n.dshUk-MediaCard-card:focus-within .dshUk-MediaCard-actionsOverlay {\n  opacity: 1;\n  transform: translateY(0);\n  pointer-events: auto;\n}\n\n/* Body */\n.dshUk-MediaCard-body {\n  display: flex;\n  flex-direction: column;\n  gap: 4px;\n  padding: 10px 12px 12px;\n  flex: 1;\n}\n\n.dshUk-MediaCard-title {\n  font-size: 13px;\n  font-weight: 500;\n  line-height: 18px;\n  color: var(--dsw-alias-label-primary);\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.dshUk-MediaCard-subtitle {\n  font-size: 12px;\n  line-height: 16px;\n  color: var(--dsw-alias-label-secondary);\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.dshUk-MediaCard-footer {\n  margin-top: auto;\n  padding-top: 8px;\n  font-size: 11px;\n  line-height: 14px;\n  color: var(--dsw-alias-label-tertiary);\n  border-top: 1px solid var(--dsw-alias-border-l1);\n}\n");
var MediaCard_module_css_default = {
	"card": "dshUk-MediaCard-card",
	"disabled": "dshUk-MediaCard-disabled",
	"loading": "dshUk-MediaCard-loading",
	"selected": "dshUk-MediaCard-selected",
	"coverWrapper": "dshUk-MediaCard-coverWrapper",
	"aspect16x9": "dshUk-MediaCard-aspect16x9",
	"aspect4x3": "dshUk-MediaCard-aspect4x3",
	"aspect1x1": "dshUk-MediaCard-aspect1x1",
	"aspect9x16": "dshUk-MediaCard-aspect9x16",
	"coverImage": "dshUk-MediaCard-coverImage",
	"coverPlaceholder": "dshUk-MediaCard-coverPlaceholder",
	"badgeSlot": "dshUk-MediaCard-badgeSlot",
	"actionsOverlay": "dshUk-MediaCard-actionsOverlay",
	"body": "dshUk-MediaCard-body",
	"title": "dshUk-MediaCard-title",
	"subtitle": "dshUk-MediaCard-subtitle",
	"footer": "dshUk-MediaCard-footer"
};
//#endregion
//#region src/card/MediaCard.tsx
const ASPECT_CLASS = {
	"16:9": cssClass(MediaCard_module_css_default.aspect16x9, "aspect16x9"),
	"4:3": cssClass(MediaCard_module_css_default.aspect4x3, "aspect4x3"),
	"1:1": cssClass(MediaCard_module_css_default.aspect1x1, "aspect1x1"),
	"9:16": cssClass(MediaCard_module_css_default.aspect9x16, "aspect9x16")
};
/**
* Media display card with aspect ratio constraints, top-right badge,
* hover actions overlay, and footer metadata slot.
*/
const MediaCard = forwardRef(function MediaCard({ title, coverUrl, coverNode, aspectRatio = "16:9", subtitle, badge, footer, actions, selected = false, disabled = false, loading = false, onClick, className, ...rest }, ref) {
	const isInteractive = !disabled && !loading && Boolean(onClick);
	const handleClick = (e) => {
		if (e.target?.closest?.(`.${cssClass(MediaCard_module_css_default.actionsOverlay, "actionsOverlay")}`)) return;
		if (!disabled && !loading) onClick?.();
	};
	const handleKeyDown = (e) => {
		if (e.target?.closest?.(`.${cssClass(MediaCard_module_css_default.actionsOverlay, "actionsOverlay")}`)) return;
		if (isInteractive && (e.key === " " || e.key === "Enter")) {
			e.preventDefault();
			onClick?.();
		}
	};
	return /* @__PURE__ */ jsxs("div", {
		...rest,
		ref,
		role: isInteractive ? "button" : void 0,
		tabIndex: isInteractive ? 0 : void 0,
		"aria-disabled": disabled || loading || void 0,
		"aria-selected": selected || void 0,
		onClick: handleClick,
		onKeyDown: handleKeyDown,
		className: cx(cssClass(MediaCard_module_css_default.card, "card"), selected && cssClass(MediaCard_module_css_default.selected, "selected"), disabled && cssClass(MediaCard_module_css_default.disabled, "disabled"), loading && cssClass(MediaCard_module_css_default.loading, "loading"), className),
		children: [/* @__PURE__ */ jsxs("div", {
			className: cx(cssClass(MediaCard_module_css_default.coverWrapper, "coverWrapper"), ASPECT_CLASS[aspectRatio]),
			children: [
				coverNode != null ? coverNode : coverUrl ? /* @__PURE__ */ jsx("img", {
					src: coverUrl,
					alt: "",
					className: cssClass(MediaCard_module_css_default.coverImage, "coverImage"),
					loading: "lazy"
				}) : /* @__PURE__ */ jsx("div", {
					className: cssClass(MediaCard_module_css_default.coverPlaceholder, "coverPlaceholder"),
					children: /* @__PURE__ */ jsxs("svg", {
						width: "24",
						height: "24",
						viewBox: "0 0 24 24",
						fill: "none",
						stroke: "currentColor",
						strokeWidth: "1.5",
						children: [
							/* @__PURE__ */ jsx("rect", {
								x: "3",
								y: "3",
								width: "18",
								height: "18",
								rx: "2"
							}),
							/* @__PURE__ */ jsx("circle", {
								cx: "8.5",
								cy: "8.5",
								r: "1.5"
							}),
							/* @__PURE__ */ jsx("path", { d: "M21 15l-5-5L5 21" })
						]
					})
				}),
				badge != null ? /* @__PURE__ */ jsx("div", {
					className: cssClass(MediaCard_module_css_default.badgeSlot, "badgeSlot"),
					children: badge
				}) : null,
				actions != null ? /* @__PURE__ */ jsx("div", {
					className: cssClass(MediaCard_module_css_default.actionsOverlay, "actionsOverlay"),
					onClick: (e) => e.stopPropagation(),
					children: actions
				}) : null
			]
		}), /* @__PURE__ */ jsxs("div", {
			className: cssClass(MediaCard_module_css_default.body, "body"),
			children: [
				/* @__PURE__ */ jsx("div", {
					className: cssClass(MediaCard_module_css_default.title, "title"),
					children: title
				}),
				subtitle != null && subtitle !== "" ? /* @__PURE__ */ jsx("div", {
					className: cssClass(MediaCard_module_css_default.subtitle, "subtitle"),
					children: subtitle
				}) : null,
				footer != null ? /* @__PURE__ */ jsx("div", {
					className: cssClass(MediaCard_module_css_default.footer, "footer"),
					children: footer
				}) : null
			]
		})]
	});
});
//#endregion
//#region \0dsh-ui-kit-css:/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/remove-expand-btn-css/packages/dsh-ui-kit/src/card/CardGrid.module.css.mjs
injectCss("CardGrid.module.css", ".dshUk-CardGrid-grid {\n  display: grid;\n  grid-template-columns: repeat(\n    auto-fill,\n    minmax(var(--card-grid-min-width, 220px), 1fr)\n  );\n  gap: var(--card-grid-gap, 16px);\n  width: 100%;\n  box-sizing: border-box;\n}\n");
var CardGrid_module_css_default = { "grid": "dshUk-CardGrid-grid" };
//#endregion
//#region src/card/CardGrid.tsx
/**
* Responsive fluid card grid container for MediaCard and other card items.
*/
const CardGrid = forwardRef(function CardGrid({ children, minItemWidth = "220px", gap = "16px", maxColumns, className, style, ...rest }, ref) {
	const minWidthValue = typeof minItemWidth === "number" ? `${minItemWidth}px` : minItemWidth;
	const gapValue = typeof gap === "number" ? `${gap}px` : gap;
	const customStyle = {
		...style,
		["--card-grid-min-width"]: minWidthValue,
		["--card-grid-gap"]: gapValue,
		...maxColumns ? { gridTemplateColumns: `repeat(auto-fill, minmax(max(${minWidthValue}, calc((100% - (${gapValue} * ${maxColumns - 1})) / ${maxColumns})), 1fr))` } : {}
	};
	return /* @__PURE__ */ jsx("div", {
		...rest,
		ref,
		style: customStyle,
		className: cx(cssClass(CardGrid_module_css_default.grid, "grid"), className),
		children
	});
});
//#endregion
//#region src/internal/a11y.ts
const FOCUSABLE_SELECTOR = [
	"a[href]",
	"area[href]",
	"input:not([disabled]):not([type='hidden'])",
	"select:not([disabled])",
	"textarea:not([disabled])",
	"button:not([disabled]):not([aria-disabled='true'])",
	"iframe",
	"object",
	"embed",
	"[contenteditable]",
	"[tabindex]:not([tabindex='-1'])"
].join(", ");
/**
* Returns all currently focusable elements within a container element.
*/
function getFocusableElements(container) {
	const nodes = container.querySelectorAll(FOCUSABLE_SELECTOR);
	const elements = [];
	for (let i = 0; i < nodes.length; i++) {
		const node = nodes[i];
		if (node && node.offsetParent !== null && !node.hasAttribute("disabled")) elements.push(node);
	}
	return elements;
}
/**
* Traps Tab and Shift+Tab key navigation within the given container element.
*/
function trapFocus(container, event) {
	if (event.key !== "Tab") return;
	const focusable = getFocusableElements(container);
	if (focusable.length === 0) {
		event.preventDefault();
		return;
	}
	const first = focusable[0];
	const last = focusable[focusable.length - 1];
	if (!first || !last) return;
	if (event.shiftKey) {
		if (document.activeElement === first || !container.contains(document.activeElement)) {
			event.preventDefault();
			last.focus();
		}
	} else if (document.activeElement === last || !container.contains(document.activeElement)) {
		event.preventDefault();
		first.focus();
	}
}
/**
* Attempts to focus the first focusable descendant in a container.
*/
function focusFirstDescendant(container) {
	const focusable = getFocusableElements(container);
	if (focusable.length > 0 && focusable[0]) {
		focusable[0].focus();
		return true;
	}
	container.focus();
	return false;
}
//#endregion
//#region src/internal/portal.ts
/**
* Resolves a portal container element safely, defaulting to `document.body` if available.
*/
function resolvePortalContainer(container) {
	if (typeof document === "undefined") return null;
	if (typeof container === "function") return container() ?? document.body;
	if (container) return container;
	return document.body;
}
/**
* Safely renders React children into a DOM portal with SSR protection.
*/
function createPortalSafe(children, container, key) {
	const target = resolvePortalContainer(container);
	if (!target) return null;
	return createPortal(children, target, key);
}
//#endregion
//#region src/drawer/DrawerPortal.tsx
/**
* Portal wrapper for Drawer with SSR safety and container resolution.
*/
function DrawerPortal({ children, container }) {
	return createPortalSafe(children, container);
}
//#endregion
//#region \0dsh-ui-kit-css:/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/remove-expand-btn-css/packages/dsh-ui-kit/src/drawer/Drawer.module.css.mjs
injectCss("Drawer.module.css", ".dshUk-Drawer-root {\n  position: fixed;\n  inset: 0;\n  z-index: 1000;\n  overflow: hidden;\n}\n\n.dshUk-Drawer-mask {\n  position: absolute;\n  inset: 0;\n  background: var(--dsw-alias-bg-mask-1);\n  backdrop-filter: var(--dsw-mask-blur);\n  transition: opacity 200ms cubic-bezier(0.16, 1, 0.3, 1);\n}\n\n.dshUk-Drawer-drawer {\n  position: absolute;\n  display: flex;\n  flex-direction: column;\n  box-sizing: border-box;\n  background-color: var(--dsw-alias-bg-layer-2);\n  box-shadow: var(--dsw-shadow-lv3);\n  z-index: 1;\n  transition: transform 240ms cubic-bezier(0.16, 1, 0.3, 1);\n}\n\n/* Placements */\n.dshUk-Drawer-placementRight {\n  top: 0;\n  right: 0;\n  bottom: 0;\n  border-left: 1px solid var(--dsw-alias-border-l2);\n}\n\n.dshUk-Drawer-placementLeft {\n  top: 0;\n  left: 0;\n  bottom: 0;\n  border-right: 1px solid var(--dsw-alias-border-l2);\n}\n\n.dshUk-Drawer-placementTop {\n  top: 0;\n  left: 0;\n  right: 0;\n  border-bottom: 1px solid var(--dsw-alias-border-l2);\n}\n\n.dshUk-Drawer-placementBottom {\n  bottom: 0;\n  left: 0;\n  right: 0;\n  border-top: 1px solid var(--dsw-alias-border-l2);\n}\n\n/* Header */\n.dshUk-Drawer-header {\n  display: flex;\n  align-items: flex-start;\n  justify-content: space-between;\n  gap: 12px;\n  padding: 18px 20px 14px;\n  border-bottom: 1px solid var(--dsw-alias-border-l1);\n  flex-shrink: 0;\n}\n\n.dshUk-Drawer-headerText {\n  display: flex;\n  flex-direction: column;\n  gap: 4px;\n  min-width: 0;\n  flex: 1;\n}\n\n.dshUk-Drawer-title {\n  margin: 0;\n  font-size: 16px;\n  line-height: 22px;\n  font-weight: 500;\n  color: var(--dsw-alias-label-primary);\n}\n\n.dshUk-Drawer-description {\n  margin: 0;\n  font-size: 13px;\n  line-height: 18px;\n  color: var(--dsw-alias-label-secondary);\n}\n\n/* Body */\n.dshUk-Drawer-body {\n  flex: 1;\n  overflow-y: auto;\n  padding: 20px;\n  box-sizing: border-box;\n}\n\n/* Footer */\n.dshUk-Drawer-footer {\n  display: flex;\n  align-items: center;\n  justify-content: flex-end;\n  gap: 8px;\n  padding: 14px 20px;\n  border-top: 1px solid var(--dsw-alias-border-l1);\n  background-color: var(--dsw-alias-bg-layer-2);\n  flex-shrink: 0;\n}\n");
var Drawer_module_css_default = {
	"root": "dshUk-Drawer-root",
	"mask": "dshUk-Drawer-mask",
	"drawer": "dshUk-Drawer-drawer",
	"placementRight": "dshUk-Drawer-placementRight",
	"placementLeft": "dshUk-Drawer-placementLeft",
	"placementTop": "dshUk-Drawer-placementTop",
	"placementBottom": "dshUk-Drawer-placementBottom",
	"header": "dshUk-Drawer-header",
	"headerText": "dshUk-Drawer-headerText",
	"title": "dshUk-Drawer-title",
	"description": "dshUk-Drawer-description",
	"body": "dshUk-Drawer-body",
	"footer": "dshUk-Drawer-footer"
};
//#endregion
//#region src/drawer/Drawer.tsx
const PLACEMENT_CLASS = {
	right: cssClass(Drawer_module_css_default.placementRight, "placementRight"),
	left: cssClass(Drawer_module_css_default.placementLeft, "placementLeft"),
	top: cssClass(Drawer_module_css_default.placementTop, "placementTop"),
	bottom: cssClass(Drawer_module_css_default.placementBottom, "placementBottom")
};
/**
* Accessible slide-in drawer panel with multi-directional animation,
* FocusTrap, Escape key handling, and scroll lock prevention.
*/
function Drawer({ open, onClose, title, description, children, footer, placement = "right", width = 400, height = 320, closable = true, closeOnOverlayClick = true, closeOnEsc = true, container, className }) {
	const drawerRef = useRef(null);
	const previousActiveElementRef = useRef(null);
	const titleId = useId();
	const descriptionId = useId();
	useEffect(() => {
		if (!open) return;
		const target = resolvePortalContainer(container);
		if (!target) return;
		const previousOverflow = target.style.overflow;
		target.style.overflow = "hidden";
		return () => {
			target.style.overflow = previousOverflow;
		};
	}, [open, container]);
	useEffect(() => {
		if (!open) return;
		previousActiveElementRef.current = document.activeElement;
		const timer = setTimeout(() => {
			if (drawerRef.current) focusFirstDescendant(drawerRef.current);
		}, 16);
		return () => {
			clearTimeout(timer);
			if (previousActiveElementRef.current && typeof previousActiveElementRef.current.focus === "function") previousActiveElementRef.current.focus();
		};
	}, [open]);
	const handleKeyDown = (e) => {
		if (e.key === "Escape" && closeOnEsc) {
			e.stopPropagation();
			onClose();
			return;
		}
		if (e.key === "Tab" && drawerRef.current) trapFocus(drawerRef.current, e.nativeEvent);
	};
	const handleMaskClick = (e) => {
		if (e.target === e.currentTarget && closeOnOverlayClick) onClose();
	};
	if (!open) return null;
	const sizeStyle = placement === "top" || placement === "bottom" ? { height: typeof height === "number" ? `${height}px` : height } : { width: typeof width === "number" ? `${width}px` : width };
	return /* @__PURE__ */ jsx(DrawerPortal, {
		container,
		children: /* @__PURE__ */ jsxs("div", {
			className: cssClass(Drawer_module_css_default.root, "root"),
			onKeyDown: handleKeyDown,
			children: [/* @__PURE__ */ jsx("div", {
				className: cssClass(Drawer_module_css_default.mask, "mask"),
				onClick: handleMaskClick,
				"aria-hidden": "true"
			}), /* @__PURE__ */ jsxs("div", {
				ref: drawerRef,
				role: "dialog",
				"aria-modal": "true",
				"aria-labelledby": title ? titleId : void 0,
				"aria-describedby": description ? descriptionId : void 0,
				tabIndex: -1,
				style: sizeStyle,
				className: cx(cssClass(Drawer_module_css_default.drawer, "drawer"), PLACEMENT_CLASS[placement], className),
				children: [
					title || description || closable ? /* @__PURE__ */ jsxs("div", {
						className: cssClass(Drawer_module_css_default.header, "header"),
						children: [/* @__PURE__ */ jsxs("div", {
							className: cssClass(Drawer_module_css_default.headerText, "headerText"),
							children: [title ? /* @__PURE__ */ jsx("h3", {
								id: titleId,
								className: cssClass(Drawer_module_css_default.title, "title"),
								children: title
							}) : null, description ? /* @__PURE__ */ jsx("p", {
								id: descriptionId,
								className: cssClass(Drawer_module_css_default.description, "description"),
								children: description
							}) : null]
						}), closable ? /* @__PURE__ */ jsx(IconButton, {
							"aria-label": "关闭抽屉",
							size: "sm",
							variant: "ghost",
							onClick: onClose,
							children: /* @__PURE__ */ jsx(IconCloseOutline16, { size: 16 })
						}) : null]
					}) : null,
					/* @__PURE__ */ jsx("div", {
						className: cssClass(Drawer_module_css_default.body, "body"),
						children
					}),
					footer ? /* @__PURE__ */ jsx("div", {
						className: cssClass(Drawer_module_css_default.footer, "footer"),
						children: footer
					}) : null
				]
			})]
		})
	});
}
//#endregion
//#region \0dsh-ui-kit-css:/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/remove-expand-btn-css/packages/dsh-ui-kit/src/search/SearchField.module.css.mjs
injectCss("SearchField.module.css", ".dshUk-SearchField-root {\n  display: inline-flex;\n  align-items: center;\n  gap: 6px;\n  box-sizing: border-box;\n  height: 32px;\n  min-width: 140px;\n  max-width: 260px;\n  width: 100%;\n  padding: 0 8px 0 10px;\n  border: 1px solid var(--dsw-alias-border-l2);\n  border-radius: 8px;\n  background: var(--dsw-alias-bg-layer-1);\n  color: var(--dsw-alias-label-primary);\n  transition:\n    border-color 120ms cubic-bezier(0.16, 1, 0.3, 1),\n    box-shadow 120ms cubic-bezier(0.16, 1, 0.3, 1),\n    background-color 120ms cubic-bezier(0.16, 1, 0.3, 1);\n}\n\n.dshUk-SearchField-stretch {\n  flex: 1 1 200px;\n}\n\n.dshUk-SearchField-root:hover:not(.dshUk-SearchField-disabled) {\n  border-color: var(--dsw-alias-border-l3);\n}\n\n.dshUk-SearchField-root:focus-within {\n  border-color: var(--dsw-alias-brand-primary);\n  box-shadow: 0 0 0 2px var(--dsw-alias-state-business-tertiary);\n}\n\n.dshUk-SearchField-disabled {\n  opacity: 0.4;\n  cursor: not-allowed;\n}\n\n.dshUk-SearchField-icon {\n  display: inline-flex;\n  width: 16px;\n  height: 16px;\n  align-items: center;\n  justify-content: center;\n  flex: none;\n  color: var(--dsw-alias-label-tertiary);\n}\n\n.dshUk-SearchField-input {\n  flex: 1;\n  min-width: 0;\n  height: 100%;\n  border: none;\n  outline: none;\n  background: transparent;\n  font: inherit;\n  font-size: 13px;\n  line-height: 18px;\n  color: var(--dsw-alias-label-primary);\n}\n\n.dshUk-SearchField-input::placeholder {\n  color: var(--dsw-alias-label-dimmed);\n}\n\n.dshUk-SearchField-input:disabled {\n  cursor: not-allowed;\n}\n\n.dshUk-SearchField-input::-webkit-search-decoration,\n.dshUk-SearchField-input::-webkit-search-cancel-button,\n.dshUk-SearchField-input::-webkit-search-results-button,\n.dshUk-SearchField-input::-webkit-search-results-decoration {\n  -webkit-appearance: none;\n  appearance: none;\n}\n\n.dshUk-SearchField-input[type=\"search\"] {\n  -webkit-appearance: none;\n  appearance: none;\n}\n\n.dshUk-SearchField-shortcut {\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  flex: none;\n  min-width: 18px;\n  height: 18px;\n  padding: 0 5px;\n  border: 1px solid var(--dsw-alias-border-l2);\n  border-radius: 4px;\n  background: var(--dsw-alias-bg-layer-2);\n  color: var(--dsw-alias-label-tertiary);\n  font-size: 11px;\n  line-height: 16px;\n  font-weight: 500;\n  letter-spacing: 0;\n}\n\n.dshUk-SearchField-clear {\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  flex: none;\n  width: 20px;\n  height: 20px;\n  margin: 0;\n  padding: 0;\n  border: none;\n  border-radius: 6px;\n  background: transparent;\n  color: var(--dsw-alias-label-tertiary);\n  cursor: pointer;\n}\n\n.dshUk-SearchField-clear:hover:not(:disabled) {\n  background: var(--dsw-alias-interactive-bg-hover);\n  color: var(--dsw-alias-label-primary);\n}\n\n.dshUk-SearchField-clear:focus {\n  outline: none;\n}\n\n.dshUk-SearchField-clear:focus-visible {\n  outline: 2px solid var(--dsw-alias-brand-primary);\n  outline-offset: 1px;\n}\n\n@media (prefers-reduced-motion: reduce) {\n  .dshUk-SearchField-root {\n    transition: none;\n  }\n}\n");
var SearchField_module_css_default = {
	"root": "dshUk-SearchField-root",
	"stretch": "dshUk-SearchField-stretch",
	"disabled": "dshUk-SearchField-disabled",
	"icon": "dshUk-SearchField-icon",
	"input": "dshUk-SearchField-input",
	"shortcut": "dshUk-SearchField-shortcut",
	"clear": "dshUk-SearchField-clear"
};
//#endregion
//#region src/search/SearchField.tsx
function isTypingTarget(target) {
	if (!(target instanceof HTMLElement)) return false;
	const tag = target.tagName;
	if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
	return target.isContentEditable;
}
function matchesShortcut(event, shortcut) {
	const raw = shortcut.trim();
	if (!raw) return false;
	const lower = raw.toLowerCase();
	const wantsMeta = /⌘|cmd|meta/.test(lower);
	const wantsCtrl = /\bctrl\b|⌃/.test(lower);
	const wantsAlt = /\balt\b|⌥/.test(lower);
	const wantsShift = /\bshift\b|⇧/.test(lower);
	const key = raw.replace(/⌘|⌃|⌥|⇧|cmd|meta|ctrl|alt|shift|\+/gi, "").trim().toLowerCase();
	if (!key) return false;
	if (Boolean(event.metaKey) !== wantsMeta) return false;
	if (Boolean(event.ctrlKey) !== wantsCtrl) return false;
	if (Boolean(event.altKey) !== wantsAlt) return false;
	if (Boolean(event.shiftKey) !== wantsShift) return false;
	return event.key.toLowerCase() === key;
}
/**
* Search field: leading search icon, optional shortcut kbd, and a clear control.
* Uncontrolled `debounceMs` (default 200) batches `onValueChange`. Pass `0`
* (or a controlled `value`) to emit immediately.
*/
const SearchField = forwardRef(function SearchField({ value, defaultValue = "", onValueChange, onClear, debounceMs = 200, shortcut, stretch = false, clearLabel = "Clear", className, disabled, id, placeholder = "Search", ...rest }, ref) {
	const generatedId = useId();
	const inputId = id ?? generatedId;
	const inputRef = useRef(null);
	const timerRef = useRef(null);
	const controlled = value !== void 0;
	const [inner, setInner] = useState(defaultValue);
	const current = controlled ? value : inner;
	const immediate = controlled || debounceMs <= 0;
	useEffect(() => {
		return () => {
			if (timerRef.current) clearTimeout(timerRef.current);
		};
	}, []);
	useEffect(() => {
		if (!shortcut || disabled) return;
		const onKey = (event) => {
			if (event.defaultPrevented) return;
			if (isTypingTarget(event.target)) return;
			if (!matchesShortcut(event, shortcut)) return;
			event.preventDefault();
			inputRef.current?.focus();
			inputRef.current?.select();
		};
		window.addEventListener("keydown", onKey);
		return () => {
			window.removeEventListener("keydown", onKey);
		};
	}, [shortcut, disabled]);
	function emit(next) {
		if (immediate) {
			onValueChange?.(next);
			return;
		}
		if (timerRef.current) clearTimeout(timerRef.current);
		timerRef.current = setTimeout(() => {
			timerRef.current = null;
			onValueChange?.(next);
		}, debounceMs);
	}
	function apply(next) {
		if (!controlled) setInner(next);
		emit(next);
	}
	function onChange(event) {
		apply(event.target.value);
	}
	function handleClear() {
		if (timerRef.current) {
			clearTimeout(timerRef.current);
			timerRef.current = null;
		}
		if (!controlled) setInner("");
		onValueChange?.("");
		onClear?.();
		inputRef.current?.focus();
	}
	useImperativeHandle(ref, () => ({
		focus: () => {
			inputRef.current?.focus();
		},
		clear: handleClear
	}));
	function onKeyDown(event) {
		rest.onKeyDown?.(event);
		if (event.defaultPrevented) return;
		if (event.key === "Escape" && current) {
			event.preventDefault();
			handleClear();
		}
	}
	return /* @__PURE__ */ jsxs("span", {
		className: cx(SearchField_module_css_default.root, stretch && SearchField_module_css_default.stretch, disabled && SearchField_module_css_default.disabled, className),
		children: [
			/* @__PURE__ */ jsx("span", {
				className: SearchField_module_css_default.icon,
				"aria-hidden": "true",
				children: /* @__PURE__ */ jsx(IconSearchOutline16, { size: 16 })
			}),
			/* @__PURE__ */ jsx("input", {
				...rest,
				ref: inputRef,
				id: inputId,
				type: "search",
				className: SearchField_module_css_default.input,
				value: current,
				disabled,
				placeholder,
				autoComplete: "off",
				spellCheck: false,
				onChange,
				onKeyDown
			}),
			current ? /* @__PURE__ */ jsx("button", {
				type: "button",
				className: SearchField_module_css_default.clear,
				"aria-label": clearLabel,
				title: clearLabel,
				disabled,
				onClick: handleClear,
				children: /* @__PURE__ */ jsx(IconCloseFill14, { size: 14 })
			}) : shortcut ? /* @__PURE__ */ jsx("kbd", {
				className: SearchField_module_css_default.shortcut,
				children: shortcut
			}) : null
		]
	});
});
//#endregion
//#region \0dsh-ui-kit-css:/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/remove-expand-btn-css/packages/dsh-ui-kit/src/field/InputField.module.css.mjs
injectCss("InputField.module.css", ".dshUk-InputField-root {\n  display: flex;\n  flex-direction: column;\n  gap: 6px;\n  min-width: 0;\n}\n\n.dshUk-InputField-label {\n  display: block;\n  font-size: 12px;\n  line-height: 16px;\n  font-weight: 500;\n  color: var(--dsw-alias-label-secondary);\n}\n\n.dshUk-InputField-required {\n  margin-left: 2px;\n  color: var(--dsw-alias-state-error-primary);\n}\n\n.dshUk-InputField-control {\n  display: flex;\n  align-items: center;\n  gap: 6px;\n  box-sizing: border-box;\n  height: 32px;\n  padding: 0 10px;\n  border: 1px solid var(--dsw-alias-border-l2);\n  border-radius: 8px;\n  background: var(--dsw-alias-bg-layer-1);\n  transition:\n    border-color 120ms cubic-bezier(0.16, 1, 0.3, 1),\n    box-shadow 120ms cubic-bezier(0.16, 1, 0.3, 1);\n}\n\n.dshUk-InputField-control:hover:not(.dshUk-InputField-disabled) {\n  border-color: var(--dsw-alias-border-l3);\n}\n\n.dshUk-InputField-control:focus-within {\n  border-color: var(--dsw-alias-brand-primary);\n  box-shadow: 0 0 0 2px var(--dsw-alias-state-business-tertiary);\n}\n\n.dshUk-InputField-invalid {\n  border-color: var(--dsw-alias-state-error-primary);\n}\n\n.dshUk-InputField-invalid:focus-within {\n  border-color: var(--dsw-alias-state-error-primary);\n  box-shadow: 0 0 0 2px var(--dsw-alias-interactive-bg-hover-danger);\n}\n\n.dshUk-InputField-disabled {\n  opacity: 0.4;\n  cursor: not-allowed;\n}\n\n.dshUk-InputField-affix {\n  display: inline-flex;\n  align-items: center;\n  flex: none;\n  color: var(--dsw-alias-label-tertiary);\n  font-size: 12px;\n  line-height: 16px;\n}\n\n.dshUk-InputField-input {\n  flex: 1;\n  min-width: 0;\n  height: 100%;\n  border: none;\n  outline: none;\n  background: transparent;\n  font: inherit;\n  font-size: 13px;\n  line-height: 18px;\n  color: var(--dsw-alias-label-primary);\n}\n\n.dshUk-InputField-input::placeholder {\n  color: var(--dsw-alias-label-dimmed);\n}\n\n.dshUk-InputField-input:disabled {\n  cursor: not-allowed;\n}\n\n.dshUk-InputField-meta {\n  min-height: 16px;\n  font-size: 12px;\n  line-height: 16px;\n}\n\n.dshUk-InputField-hint {\n  color: var(--dsw-alias-label-tertiary);\n}\n\n.dshUk-InputField-error {\n  color: var(--dsw-alias-state-error-primary);\n}\n\n@media (prefers-reduced-motion: reduce) {\n  .dshUk-InputField-control {\n    transition: none;\n  }\n}\n");
var InputField_module_css_default = {
	"root": "dshUk-InputField-root",
	"label": "dshUk-InputField-label",
	"required": "dshUk-InputField-required",
	"control": "dshUk-InputField-control",
	"disabled": "dshUk-InputField-disabled",
	"invalid": "dshUk-InputField-invalid",
	"affix": "dshUk-InputField-affix",
	"input": "dshUk-InputField-input",
	"meta": "dshUk-InputField-meta",
	"hint": "dshUk-InputField-hint",
	"error": "dshUk-InputField-error"
};
//#endregion
//#region src/field/InputField.tsx
/**
* Labeled single-line field with prefix / suffix slots, hint, and error text.
* Height stays 32px to line up with Button and SearchField.
*/
const InputField = forwardRef(function InputField({ label, hint, error, prefix, suffix, className, disabled, id, required, ...rest }, ref) {
	const generatedId = useId();
	const inputId = id ?? generatedId;
	const hintId = `${inputId}-hint`;
	const errorId = `${inputId}-error`;
	const invalid = Boolean(error);
	const describedBy = [
		rest["aria-describedby"],
		hint ? hintId : void 0,
		invalid ? errorId : void 0
	].filter(Boolean).join(" ") || void 0;
	return /* @__PURE__ */ jsxs("label", {
		className: cx(InputField_module_css_default.root, className),
		htmlFor: inputId,
		children: [
			label != null && label !== "" ? /* @__PURE__ */ jsxs("span", {
				className: InputField_module_css_default.label,
				children: [label, required ? /* @__PURE__ */ jsx("span", {
					className: InputField_module_css_default.required,
					"aria-hidden": "true",
					children: "*"
				}) : null]
			}) : null,
			/* @__PURE__ */ jsxs("span", {
				className: cx(InputField_module_css_default.control, invalid && InputField_module_css_default.invalid, disabled && InputField_module_css_default.disabled),
				children: [
					prefix != null ? /* @__PURE__ */ jsx("span", {
						className: InputField_module_css_default.affix,
						children: prefix
					}) : null,
					/* @__PURE__ */ jsx("input", {
						...rest,
						ref,
						id: inputId,
						className: InputField_module_css_default.input,
						disabled,
						required,
						"aria-invalid": invalid || void 0,
						"aria-describedby": describedBy
					}),
					suffix != null ? /* @__PURE__ */ jsx("span", {
						className: InputField_module_css_default.affix,
						children: suffix
					}) : null
				]
			}),
			invalid ? /* @__PURE__ */ jsx("span", {
				className: cx(InputField_module_css_default.meta, InputField_module_css_default.error),
				id: errorId,
				role: "alert",
				children: error
			}) : hint ? /* @__PURE__ */ jsx("span", {
				className: cx(InputField_module_css_default.meta, InputField_module_css_default.hint),
				id: hintId,
				children: hint
			}) : null
		]
	});
});
//#endregion
//#region \0dsh-ui-kit-css:/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/remove-expand-btn-css/packages/dsh-ui-kit/src/field/DropdownSelect.module.css.mjs
injectCss("DropdownSelect.module.css", ".dshUk-DropdownSelect-anchor {\n  display: inline-flex;\n  flex-shrink: 0;\n  min-width: 0;\n}\n\n.dshUk-DropdownSelect-trigger {\n  display: inline-flex;\n  align-items: center;\n  gap: 8px;\n  box-sizing: border-box;\n  width: 100%;\n  min-width: 112px;\n  height: 32px;\n  margin: 0;\n  padding: 0 10px;\n  border: 1px solid var(--dsw-alias-border-l2);\n  border-radius: 8px;\n  background: var(--dsw-alias-bg-layer-1);\n  color: var(--dsw-alias-label-primary);\n  cursor: pointer;\n  font: inherit;\n  font-size: 13px;\n  line-height: 18px;\n  text-align: left;\n  transition:\n    background-color 120ms cubic-bezier(0.16, 1, 0.3, 1),\n    border-color 120ms cubic-bezier(0.16, 1, 0.3, 1);\n}\n\n.dshUk-DropdownSelect-trigger:hover:not(:disabled) {\n  border-color: var(--dsw-alias-border-l3);\n  background: var(--dsw-alias-interactive-bg-hover);\n}\n\n.dshUk-DropdownSelect-trigger:focus {\n  outline: none;\n}\n\n.dshUk-DropdownSelect-trigger:focus-visible {\n  outline: 2px solid var(--dsw-alias-brand-primary);\n  outline-offset: 2px;\n}\n\n.dshUk-DropdownSelect-trigger:disabled {\n  opacity: 0.4;\n  cursor: not-allowed;\n}\n\n.dshUk-DropdownSelect-open {\n  border-color: var(--dsw-alias-brand-primary);\n}\n\n.dshUk-DropdownSelect-label {\n  flex: 1;\n  min-width: 0;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.dshUk-DropdownSelect-placeholder {\n  color: var(--dsw-alias-label-dimmed);\n}\n\n.dshUk-DropdownSelect-chevron {\n  display: inline-flex;\n  width: 14px;\n  height: 14px;\n  align-items: center;\n  justify-content: center;\n  flex: none;\n  color: var(--dsw-alias-label-tertiary);\n  transition: transform 120ms cubic-bezier(0.16, 1, 0.3, 1);\n}\n\n.dshUk-DropdownSelect-chevronOpen {\n  transform: rotate(180deg);\n}\n\n@media (prefers-reduced-motion: reduce) {\n  .dshUk-DropdownSelect-trigger,\n  .dshUk-DropdownSelect-chevron {\n    transition: none;\n  }\n}\n");
var DropdownSelect_module_css_default = {
	"anchor": "dshUk-DropdownSelect-anchor",
	"trigger": "dshUk-DropdownSelect-trigger",
	"open": "dshUk-DropdownSelect-open",
	"label": "dshUk-DropdownSelect-label",
	"placeholder": "dshUk-DropdownSelect-placeholder",
	"chevron": "dshUk-DropdownSelect-chevron",
	"chevronOpen": "dshUk-DropdownSelect-chevronOpen"
};
//#endregion
//#region src/field/DropdownSelect.tsx
/**
* 32px select built on the official Menu. Never renders a native `<select>`.
*/
function DropdownSelect({ value, options, onChange, placeholder = "Select", disabled = false, className, "aria-label": ariaLabel, id, align = "start" }) {
	const [open, setOpen] = useState(false);
	const generatedId = useId();
	const triggerId = id ?? generatedId;
	const selected = options.find((option) => option.value === value);
	const items = useMemo(() => options.map((option) => {
		const item = {
			id: option.value,
			label: option.label
		};
		if (option.disabled === true) item.disabled = true;
		if (option.icon !== void 0) item.icon = option.icon;
		if (option.danger === true) item.danger = true;
		return item;
	}), [options]);
	return /* @__PURE__ */ jsx(Menu, {
		open: open && !disabled,
		portal: true,
		compact: true,
		align,
		selectedId: value,
		items,
		onSelect: (next) => {
			onChange(next);
			setOpen(false);
		},
		onClose: () => {
			setOpen(false);
		},
		className: cx(DropdownSelect_module_css_default.anchor, className),
		anchor: /* @__PURE__ */ jsxs("button", {
			type: "button",
			id: triggerId,
			className: cx(DropdownSelect_module_css_default.trigger, open && DropdownSelect_module_css_default.open),
			"aria-label": ariaLabel,
			"aria-haspopup": "listbox",
			"aria-expanded": open,
			disabled,
			onClick: () => {
				if (!disabled) setOpen((prev) => !prev);
			},
			children: [/* @__PURE__ */ jsx("span", {
				className: cx(DropdownSelect_module_css_default.label, !selected && DropdownSelect_module_css_default.placeholder),
				children: selected ? selected.label : placeholder
			}), /* @__PURE__ */ jsx("span", {
				className: cx(DropdownSelect_module_css_default.chevron, open && DropdownSelect_module_css_default.chevronOpen),
				"aria-hidden": "true",
				children: /* @__PURE__ */ jsx(IconChevronDownOutline14, { size: 14 })
			})]
		})
	});
}
//#endregion
//#region \0dsh-ui-kit-css:/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/remove-expand-btn-css/packages/dsh-ui-kit/src/toolbar/Toolbar.module.css.mjs
injectCss("Toolbar.module.css", ".dshUk-Toolbar-bar {\n  display: flex;\n  flex-wrap: nowrap;\n  align-items: center;\n  gap: 8px;\n  box-sizing: border-box;\n  height: 48px;\n  min-height: 44px;\n  max-height: 48px;\n  overflow: hidden;\n  white-space: nowrap;\n}\n\n/* 默认水平内边距走 :where() 的零优先级。使用方常在自己的类上声明 padding\n   来跟所在页面的内容基准线对齐（如 .dshUk-Toolbar-omnimux-assets-stage-toolbar 的 0 24px）。\n   两边同为单类选择器时由文档顺序决定胜负，而本包样式随各消费方打包、在文档中\n   后注入（同一规则实测有 10 份副本），使用方的声明会被静默吃掉，整行左右两侧\n   一起外扩。降到零优先级后使用方声明即可胜出；未声明的使用方仍是 12px。 */\n:where(.dshUk-Toolbar-bar) {\n  padding: 0 12px;\n}\n\n.dshUk-Toolbar-compact {\n  height: 44px;\n  min-height: 44px;\n}\n\n.dshUk-Toolbar-left,\n.dshUk-Toolbar-right {\n  display: flex;\n  flex-wrap: nowrap;\n  align-items: center;\n  gap: 8px;\n  min-width: 0;\n}\n\n.dshUk-Toolbar-left {\n  flex: 1 1 auto;\n  overflow: hidden;\n}\n\n.dshUk-Toolbar-right {\n  flex: 0 0 auto;\n  margin-left: auto;\n}\n\n.dshUk-Toolbar-right > * {\n  flex-shrink: 0;\n}\n\n.dshUk-Toolbar-filters {\n  display: flex;\n  flex-wrap: nowrap;\n  align-items: center;\n  gap: 8px;\n  flex: 0 0 auto;\n}\n\n.dshUk-Toolbar-filters > * {\n  flex-shrink: 0;\n}\n");
var Toolbar_module_css_default = {
	"bar": "dshUk-Toolbar-bar",
	"omnimux-assets-stage-toolbar": "dshUk-Toolbar-omnimux-assets-stage-toolbar",
	"compact": "dshUk-Toolbar-compact",
	"left": "dshUk-Toolbar-left",
	"right": "dshUk-Toolbar-right",
	"filters": "dshUk-Toolbar-filters"
};
//#endregion
//#region src/toolbar/Toolbar.tsx
/**
* Single-row 44–48px toolbar. Left holds search + filters, right holds actions.
* Children never wrap.
*/
function Toolbar({ left, right, compact = false, className, children, ...rest }) {
	return /* @__PURE__ */ jsxs("div", {
		...rest,
		role: "toolbar",
		className: cx(Toolbar_module_css_default.bar, compact && Toolbar_module_css_default.compact, className),
		children: [/* @__PURE__ */ jsx("div", {
			className: Toolbar_module_css_default.left,
			children: left ?? children
		}), right != null ? /* @__PURE__ */ jsx("div", {
			className: Toolbar_module_css_default.right,
			children: right
		}) : null]
	});
}
/**
* FilterBar supporting two layout modes:
* 1. Standard 4-layer layout (New Spec): `filters` on the left, `search` + `tools` (sort/viewMode) on the right.
* 2. Classic layout (Legacy): `search` + `filters` on the left, `actions` on the right.
*/
function FilterBar({ left, search, filters, actions, right, tools, className, compact, ...rest }) {
	let leftContent;
	let rightContent;
	if (left != null) {
		leftContent = left;
		rightContent = right ?? (search != null || tools != null || actions != null ? /* @__PURE__ */ jsxs(Fragment, { children: [
			search,
			tools,
			actions
		] }) : null);
	} else if (filters != null && search != null && tools == null && actions != null && right == null) {
		leftContent = /* @__PURE__ */ jsxs(Fragment, { children: [search, /* @__PURE__ */ jsx("div", {
			className: Toolbar_module_css_default.filters,
			children: filters
		})] });
		rightContent = actions;
	} else {
		leftContent = filters != null ? /* @__PURE__ */ jsx("div", {
			className: Toolbar_module_css_default.filters,
			children: filters
		}) : null;
		rightContent = right ?? (search != null || tools != null || actions != null ? /* @__PURE__ */ jsxs(Fragment, { children: [
			search,
			tools,
			actions
		] }) : null);
	}
	return /* @__PURE__ */ jsx(Toolbar, {
		...rest,
		left: leftContent,
		right: rightContent,
		...compact !== void 0 ? { compact } : {},
		...className !== void 0 ? { className } : {}
	});
}
//#endregion
//#region \0dsh-ui-kit-css:/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/remove-expand-btn-css/packages/dsh-ui-kit/src/divider/Divider.module.css.mjs
injectCss("Divider.module.css", ".dshUk-Divider-divider {\n  display: block;\n  box-sizing: border-box;\n  flex-shrink: 0;\n  border: none;\n}\n\n.dshUk-Divider-horizontal {\n  width: 100%;\n  height: 1px;\n  min-height: 1px;\n  max-height: 1px;\n  background: var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.12));\n  margin: 12px 0 8px;\n  padding: 0;\n  border: none;\n  flex-shrink: 0;\n}\n\n.dshUk-Divider-vertical {\n  display: inline-block;\n  width: 1px;\n  min-width: 1px;\n  max-width: 1px;\n  height: 100%;\n  min-height: 16px;\n  max-height: none;\n  background: var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.12));\n  margin: 0;\n  padding: 0;\n  border: none;\n}\n");
var Divider_module_css_default = {
	"divider": "dshUk-Divider-divider",
	"horizontal": "dshUk-Divider-horizontal",
	"vertical": "dshUk-Divider-vertical"
};
//#endregion
//#region src/divider/Divider.tsx
const DIVIDER_CLASS = cssClass(Divider_module_css_default.divider, "divider");
const HORIZONTAL_CLASS = cssClass(Divider_module_css_default.horizontal, "horizontal");
const VERTICAL_CLASS = cssClass(Divider_module_css_default.vertical, "vertical");
/**
* Standard 1px divider consuming var(--dsw-alias-border-l2).
*/
const Divider = forwardRef(function Divider({ orientation = "horizontal", className, ...rest }, ref) {
	return /* @__PURE__ */ jsx("div", {
		...rest,
		ref,
		role: "separator",
		"aria-orientation": orientation,
		className: cx(DIVIDER_CLASS, orientation === "vertical" ? VERTICAL_CLASS : HORIZONTAL_CLASS, className)
	});
});
//#endregion
//#region \0dsh-ui-kit-css:/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/remove-expand-btn-css/packages/dsh-ui-kit/src/dialog/Dialog.module.css.mjs
injectCss("Dialog.module.css", ".dshUk-Dialog-dialog {\n  width: min(480px, 100%);\n  max-height: min(80vh, 720px);\n  border-radius: 16px;\n}\n\n.dshUk-Dialog-sm {\n  width: min(380px, 100%);\n}\n\n.dshUk-Dialog-lg {\n  width: min(640px, 100%);\n}\n\n.dshUk-Dialog-body {\n  overflow: auto;\n  max-height: min(56vh, 480px);\n}\n\n.dshUk-Dialog-footer {\n  display: flex;\n  align-items: center;\n  justify-content: flex-end;\n  gap: 8px;\n  width: 100%;\n}\n\n.dshUk-Dialog-message {\n  margin: 0;\n  font-size: 14px;\n  line-height: 22px;\n  color: var(--dsw-alias-label-primary);\n}\n");
var Dialog_module_css_default = {
	"dialog": "dshUk-Dialog-dialog",
	"sm": "dshUk-Dialog-sm",
	"lg": "dshUk-Dialog-lg",
	"body": "dshUk-Dialog-body",
	"footer": "dshUk-Dialog-footer",
	"message": "dshUk-Dialog-message"
};
//#endregion
//#region src/dialog/Dialog.tsx
const SIZE_CLASS = {
	sm: cssClass(Dialog_module_css_default.sm, "sm"),
	md: void 0,
	lg: cssClass(Dialog_module_css_default.lg, "lg")
};
/**
* Official Modal with kit geometry: 16px radius, scrollable body, right-aligned
* action footer. Header + close button stay with the primitive.
*/
function ModalDialog({ open, onClose, title, description, children, footer, size = "md", closeLabel = "Close", className, contentClassName }) {
	return /* @__PURE__ */ jsx(Modal, {
		open,
		onClose,
		title,
		closeLabel,
		className: cx(Dialog_module_css_default.dialog, SIZE_CLASS[size], className),
		contentClassName: cx(Dialog_module_css_default.body, contentClassName),
		...description !== void 0 ? { description } : {},
		...footer !== void 0 ? { footer } : {},
		children
	});
}
/** Two-button confirm dialog. Destructive flows should pass `confirmVariant="danger"`. */
function ConfirmModal({ message, children, confirmLabel = "Confirm", cancelLabel = "Cancel", confirmVariant = "primary", confirmLoading = false, onConfirm, onClose, size = "sm", ...rest }) {
	return /* @__PURE__ */ jsx(ModalDialog, {
		...rest,
		size,
		onClose,
		footer: /* @__PURE__ */ jsxs("div", {
			className: Dialog_module_css_default.footer,
			children: [/* @__PURE__ */ jsx(Button, {
				variant: "outline",
				onClick: onClose,
				disabled: confirmLoading,
				children: cancelLabel
			}), /* @__PURE__ */ jsx(Button, {
				variant: confirmVariant,
				loading: confirmLoading,
				onClick: onConfirm,
				children: confirmLabel
			})]
		}),
		children: message != null ? /* @__PURE__ */ jsx("p", {
			className: Dialog_module_css_default.message,
			children: message
		}) : children
	});
}
//#endregion
//#region \0dsh-ui-kit-css:/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/remove-expand-btn-css/packages/dsh-ui-kit/src/stage/StageContainer.module.css.mjs
injectCss("StageContainer.module.css", ".dshUk-StageContainer-stageContainer {\n  position: absolute;\n  top: var(--stage-top, 0px);\n  left: var(--stage-left, 56px);\n  width: var(--stage-width, calc(100vw - 56px));\n  height: var(--stage-height, 100vh);\n  background: var(--dsw-alias-bg-base);\n  color: var(--dsw-alias-label-primary);\n  z-index: 200;\n  display: flex;\n  flex-direction: column;\n  box-sizing: border-box;\n  overflow: hidden;\n}\n\n.dshUk-StageContainer-stageContainer[data-visible=\"false\"] {\n  display: none !important;\n  pointer-events: none !important;\n}\n");
//#endregion
//#region src/stage/StageContainer.tsx
const CONTAINER_CLASS = cssClass({ "stageContainer": "dshUk-StageContainer-stageContainer" }.stageContainer, "stageContainer");
/**
* Standard Stage Container for first-level product pages.
* Handles --stage-* CSS variable synchronization, keepalive lazy-mounting,
* and ResizeObserver layout tracking.
*/
const StageContainer = forwardRef(function StageContainer({ stageStore, title, className, style, children, ...rest }, ref) {
	const open = useSyncExternalStore(stageStore ? (onStoreChange) => stageStore.subscribe(onStoreChange) : () => () => {}, stageStore ? () => stageStore.getSnapshot() : () => false);
	const [everOpened, setEverOpened] = useState(false);
	const [box, setBox] = useState(() => stageStore ? stageStore.readBox() : {
		top: 0,
		left: 0,
		width: 0,
		height: 0
	});
	if (open && !everOpened) setEverOpened(true);
	useLayoutEffect(() => {
		if (!open || !stageStore) return void 0;
		const update = () => {
			setBox(stageStore.readBox());
		};
		update();
		const scroll = typeof document !== "undefined" ? document.querySelector("[data-conversation-scroll]") : null;
		const target = scroll instanceof HTMLElement ? scroll : typeof document !== "undefined" ? document.querySelector("[data-slot=\"conversation\"]")?.parentElement : null;
		const observer = typeof ResizeObserver === "function" && target ? new ResizeObserver(update) : null;
		if (target && observer) observer.observe(target);
		if (typeof window !== "undefined") window.addEventListener("resize", update);
		return () => {
			observer?.disconnect();
			if (typeof window !== "undefined") window.removeEventListener("resize", update);
		};
	}, [open, stageStore]);
	if (!stageStore || !everOpened) return null;
	const customStyle = {
		...style,
		display: open ? style?.display !== "none" ? style?.display : void 0 : "none",
		["--stage-top"]: `${box.top}px`,
		["--stage-left"]: `${box.left}px`,
		["--stage-width"]: `${box.width}px`,
		["--stage-height"]: `${box.height}px`
	};
	return /* @__PURE__ */ jsx("div", {
		...rest,
		ref,
		role: "region",
		"aria-label": title,
		"aria-hidden": open ? void 0 : true,
		"data-visible": open ? "true" : "false",
		className: cx(CONTAINER_CLASS, className),
		style: customStyle,
		children
	});
});
//#endregion
//#region \0dsh-ui-kit-css:/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/remove-expand-btn-css/packages/dsh-ui-kit/src/tabs/Tabs.module.css.mjs
injectCss("Tabs.module.css", "/* Base container */\n.dshUk-Tabs-tabs {\n  display: inline-flex;\n  align-items: center;\n  box-sizing: border-box;\n  flex-shrink: 0;\n  user-select: none;\n  background: transparent;\n  border: none;\n  border-radius: 0;\n  box-shadow: none;\n}\n\n/* Pill variant (classic capsule) */\n.dshUk-Tabs-pill {\n  gap: 2px;\n  padding: 2px;\n  height: 32px;\n  background: var(--dsw-alias-bg-layer-1);\n  border: 1px solid var(--dsw-alias-border-l1);\n  border-radius: 8px;\n}\n\n.dshUk-Tabs-pill.dshUk-Tabs-sm {\n  height: 28px;\n  padding: 2px;\n  border-radius: 6px;\n}\n\n.dshUk-Tabs-pill .dshUk-Tabs-tabItem {\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  gap: 6px;\n  height: 26px;\n  padding: 0 10px;\n  border-radius: 6px;\n  border: none;\n  background: transparent;\n  color: var(--dsw-alias-label-secondary);\n  font: inherit;\n  font-size: 13px;\n  font-weight: 500;\n  line-height: 18px;\n  cursor: pointer;\n  white-space: nowrap;\n  box-sizing: border-box;\n  transition:\n    background-color 120ms cubic-bezier(0.16, 1, 0.3, 1),\n    color 120ms cubic-bezier(0.16, 1, 0.3, 1),\n    box-shadow 120ms cubic-bezier(0.16, 1, 0.3, 1);\n}\n\n.dshUk-Tabs-pill.dshUk-Tabs-sm .dshUk-Tabs-tabItem {\n  height: 22px;\n  padding: 0 8px;\n  border-radius: 4px;\n  font-size: 12px;\n  line-height: 16px;\n  gap: 4px;\n}\n\n.dshUk-Tabs-pill .dshUk-Tabs-tabItem:hover:not(:disabled):not([aria-selected=\"true\"]) {\n  background: var(--dsw-alias-interactive-bg-hover);\n  color: var(--dsw-alias-label-primary);\n}\n\n.dshUk-Tabs-pill .dshUk-Tabs-tabItem:focus {\n  outline: none;\n}\n\n.dshUk-Tabs-pill .dshUk-Tabs-tabItem:focus-visible {\n  outline: 2px solid var(--dsw-alias-brand-primary);\n  outline-offset: 1px;\n}\n\n.dshUk-Tabs-pill .dshUk-Tabs-tabItem:disabled {\n  cursor: not-allowed;\n  opacity: 0.4;\n}\n\n.dshUk-Tabs-pill .dshUk-Tabs-tabItem.dshUk-Tabs-active {\n  background: var(--dsw-alias-bg-elevated);\n  color: var(--dsw-alias-label-primary);\n  font-weight: 600;\n  box-shadow: 0 1px 2px var(--dsw-alias-border-l1);\n}\n\n.dshUk-Tabs-pill .dshUk-Tabs-tabItem.dshUk-Tabs-active:hover {\n  background: var(--dsw-alias-bg-elevated);\n  color: var(--dsw-alias-label-primary);\n}\n\n.dshUk-Tabs-pill .dshUk-Tabs-badge {\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  min-width: 16px;\n  height: 16px;\n  padding: 0 4px;\n  box-sizing: border-box;\n  border-radius: 9999px;\n  font-size: 11px;\n  font-weight: 600;\n  line-height: 1;\n  background: var(--dsw-alias-interactive-bg-hover);\n  color: var(--dsw-alias-label-secondary);\n}\n\n.dshUk-Tabs-pill.dshUk-Tabs-sm .dshUk-Tabs-badge {\n  min-width: 14px;\n  height: 14px;\n  padding: 0 3px;\n  font-size: 10px;\n}\n\n.dshUk-Tabs-pill .dshUk-Tabs-tabItem.dshUk-Tabs-active .dshUk-Tabs-badge {\n  background: var(--dsw-alias-interactive-bg-active);\n  color: var(--dsw-alias-label-primary);\n}\n\n/* Underline variant (pure text + 2px bottom highlight line) */\n.dshUk-Tabs-underline {\n  /* 标签左右热区宽度。容器两端用等量负边距抵消它，首末标签的文字才落在容器\n     内容边缘、与所在页面的内容基准线对齐；激活下划线也用同一变量内缩，保证\n     与文字等宽。改热区只改这一个值。 */\n  --underline-tab-pad-x: 4px;\n  display: inline-flex;\n  align-items: center;\n  gap: 24px;\n  padding: 0 !important;\n  margin-inline: calc(-1 * var(--underline-tab-pad-x));\n  height: 44px;\n  background: transparent !important;\n  border: none !important;\n  border-radius: 0 !important;\n  box-shadow: none !important;\n}\n\n.dshUk-Tabs-underline.dshUk-Tabs-sm {\n  height: 36px;\n  gap: 16px;\n}\n\n.dshUk-Tabs-underline .dshUk-Tabs-tabItem {\n  position: relative;\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  gap: 6px;\n  height: 100%;\n  padding: 0 var(--underline-tab-pad-x) !important;\n  border: none !important;\n  border-radius: 0 !important;\n  background: transparent !important;\n  box-shadow: none !important;\n  color: var(--dsw-alias-label-secondary);\n  font: inherit;\n  font-size: 14px;\n  font-weight: 500;\n  line-height: 20px;\n  cursor: pointer;\n  white-space: nowrap;\n  box-sizing: border-box;\n  transition:\n    color 120ms cubic-bezier(0.16, 1, 0.3, 1),\n    font-weight 120ms cubic-bezier(0.16, 1, 0.3, 1);\n}\n\n.dshUk-Tabs-underline.dshUk-Tabs-sm .dshUk-Tabs-tabItem {\n  font-size: 13px;\n  line-height: 18px;\n  gap: 4px;\n}\n\n.dshUk-Tabs-underline .dshUk-Tabs-tabItem:hover {\n  color: var(--dsw-alias-label-primary) !important;\n  background: transparent !important;\n}\n\n.dshUk-Tabs-underline .dshUk-Tabs-tabItem:focus {\n  outline: none;\n}\n\n.dshUk-Tabs-underline .dshUk-Tabs-tabItem:focus-visible {\n  outline: 2px solid var(--dsw-alias-brand-primary);\n  outline-offset: 2px;\n}\n\n.dshUk-Tabs-underline .dshUk-Tabs-tabItem:disabled {\n  cursor: not-allowed;\n  opacity: 0.4;\n}\n\n.dshUk-Tabs-underline .dshUk-Tabs-tabItem.dshUk-Tabs-active {\n  color: var(--dsw-alias-label-primary) !important;\n  font-weight: 600;\n  background: transparent !important;\n  box-shadow: none !important;\n}\n\n.dshUk-Tabs-underline .dshUk-Tabs-tabItem.dshUk-Tabs-active::after {\n  content: \"\";\n  position: absolute;\n  bottom: 0;\n  left: var(--underline-tab-pad-x);\n  right: var(--underline-tab-pad-x);\n  height: 2px;\n  background: var(--dsw-alias-label-primary);\n  border-radius: 1px;\n}\n\n.dshUk-Tabs-underline .dshUk-Tabs-badge {\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  min-width: 16px;\n  height: 16px;\n  padding: 0 4px;\n  box-sizing: border-box;\n  border-radius: 9999px;\n  font-size: 11px;\n  font-weight: 600;\n  line-height: 1;\n  background: var(--dsw-alias-interactive-bg-hover);\n  color: var(--dsw-alias-label-secondary);\n  transition:\n    background-color 120ms cubic-bezier(0.16, 1, 0.3, 1),\n    color 120ms cubic-bezier(0.16, 1, 0.3, 1);\n}\n\n.dshUk-Tabs-underline.dshUk-Tabs-sm .dshUk-Tabs-badge {\n  min-width: 14px;\n  height: 14px;\n  padding: 0 3px;\n  font-size: 10px;\n}\n\n.dshUk-Tabs-underline .dshUk-Tabs-tabItem.dshUk-Tabs-active .dshUk-Tabs-badge {\n  background: var(--dsw-alias-interactive-bg-active);\n  color: var(--dsw-alias-label-primary);\n}\n\n/* Shared element styles */\n.dshUk-Tabs-label {\n  min-width: 0;\n  overflow: hidden;\n  text-overflow: ellipsis;\n}\n");
var Tabs_module_css_default = {
	"tabs": "dshUk-Tabs-tabs",
	"pill": "dshUk-Tabs-pill",
	"sm": "dshUk-Tabs-sm",
	"tabItem": "dshUk-Tabs-tabItem",
	"active": "dshUk-Tabs-active",
	"badge": "dshUk-Tabs-badge",
	"underline": "dshUk-Tabs-underline",
	"label": "dshUk-Tabs-label"
};
//#endregion
//#region src/tabs/Tabs.tsx
const TABS_CLASS = cssClass(Tabs_module_css_default.tabs, "tabs");
const PILL_CLASS = cssClass(Tabs_module_css_default.pill, "pill");
const UNDERLINE_CLASS = cssClass(Tabs_module_css_default.underline, "underline");
const SM_CLASS = cssClass(Tabs_module_css_default.sm, "sm");
const TAB_ITEM_CLASS = cssClass(Tabs_module_css_default.tabItem, "tabItem");
const ACTIVE_CLASS = cssClass(Tabs_module_css_default.active, "active");
const BADGE_CLASS = cssClass(Tabs_module_css_default.badge, "badge");
const LABEL_CLASS$1 = cssClass(Tabs_module_css_default.label, "label");
const Tabs = forwardRef(function Tabs({ items, activeId, onChange, size = "default", variant = "underline", className, ...rest }, ref) {
	const isPill = variant === "pill";
	return /* @__PURE__ */ jsx("div", {
		...rest,
		ref,
		role: "tablist",
		className: cx(TABS_CLASS, isPill ? PILL_CLASS : UNDERLINE_CLASS, size === "sm" && SM_CLASS, className),
		children: items.map((item) => {
			const isActive = item.id === activeId;
			return /* @__PURE__ */ jsxs("button", {
				type: "button",
				role: "tab",
				"aria-selected": isActive,
				disabled: item.disabled,
				className: cx(TAB_ITEM_CLASS, isActive && ACTIVE_CLASS),
				onClick: () => {
					if (!item.disabled && item.id !== activeId) onChange(item.id);
				},
				children: [/* @__PURE__ */ jsx("span", {
					className: LABEL_CLASS$1,
					children: item.label
				}), item.badge != null && item.badge !== "" ? /* @__PURE__ */ jsx("span", {
					className: BADGE_CLASS,
					children: item.badge
				}) : null]
			}, item.id);
		})
	});
});
//#endregion
//#region \0dsh-ui-kit-css:/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/remove-expand-btn-css/packages/dsh-ui-kit/src/stage/PageHeader.module.css.mjs
injectCss("PageHeader.module.css", ".dshUk-PageHeader-pageHeader {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  padding: 12px 20px;\n  min-height: 56px;\n  box-sizing: border-box;\n  flex: none;\n  gap: 16px;\n  border-bottom: none;\n  -webkit-app-region: drag;\n}\n\n.dshUk-PageHeader-heading {\n  display: flex;\n  flex-direction: column;\n  gap: 2px;\n  min-width: 0;\n  flex: 1 1 auto;\n}\n\n.dshUk-PageHeader-breadcrumb {\n  display: flex;\n  align-items: center;\n  font-size: 12px;\n  line-height: 16px;\n  color: var(--dsw-alias-label-secondary);\n  margin-bottom: 2px;\n}\n\n.dshUk-PageHeader-titleRow {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n}\n\n.dshUk-PageHeader-title {\n  margin: 0;\n  font-size: 20px;\n  font-weight: 600;\n  line-height: 28px;\n  color: var(--dsw-alias-label-primary);\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.dshUk-PageHeader-subtitle {\n  margin: 0;\n  font-size: 13px;\n  font-weight: 400;\n  line-height: 18px;\n  color: var(--dsw-alias-label-secondary);\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.dshUk-PageHeader-tabsContainer {\n  display: flex;\n  align-items: center;\n  flex: none;\n  -webkit-app-region: no-drag;\n}\n\n.dshUk-PageHeader-controls {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  flex: none;\n  -webkit-app-region: no-drag;\n}\n");
var PageHeader_module_css_default = {
	"pageHeader": "dshUk-PageHeader-pageHeader",
	"heading": "dshUk-PageHeader-heading",
	"breadcrumb": "dshUk-PageHeader-breadcrumb",
	"titleRow": "dshUk-PageHeader-titleRow",
	"title": "dshUk-PageHeader-title",
	"subtitle": "dshUk-PageHeader-subtitle",
	"tabsContainer": "dshUk-PageHeader-tabsContainer",
	"controls": "dshUk-PageHeader-controls"
};
//#endregion
//#region src/stage/PageHeader.tsx
const PAGE_HEADER_CLASS = cssClass(PageHeader_module_css_default.pageHeader, "pageHeader");
const HEADING_CLASS = cssClass(PageHeader_module_css_default.heading, "heading");
const BREADCRUMB_CLASS = cssClass(PageHeader_module_css_default.breadcrumb, "breadcrumb");
const TITLE_ROW_CLASS = cssClass(PageHeader_module_css_default.titleRow, "titleRow");
const TITLE_CLASS = cssClass(PageHeader_module_css_default.title, "title");
const SUBTITLE_CLASS = cssClass(PageHeader_module_css_default.subtitle, "subtitle");
const TABS_CONTAINER_CLASS = cssClass(PageHeader_module_css_default.tabsContainer, "tabsContainer");
const CONTROLS_CLASS = cssClass(PageHeader_module_css_default.controls, "controls");
/**
* Standard Layer 1 Page Header for OmniMux first-level product stages.
* Typography single source of truth: 20px / 600 / 28px.
* Layout: heading (breadcrumb + title + subtitle) | tabs | controls (actions + refresh + close).
*/
const PageHeader = forwardRef(function PageHeader({ title, subtitle, badge, tabs, actions, onRefresh, refreshing = false, refreshTitle = "Refresh", onClose, closeTitle = "Close", breadcrumb, className, ...rest }, ref) {
	return /* @__PURE__ */ jsxs("header", {
		...rest,
		ref,
		className: cx(PAGE_HEADER_CLASS, className),
		children: [
			/* @__PURE__ */ jsxs("div", {
				className: HEADING_CLASS,
				children: [
					breadcrumb && /* @__PURE__ */ jsx("div", {
						className: BREADCRUMB_CLASS,
						children: breadcrumb
					}),
					/* @__PURE__ */ jsxs("div", {
						className: TITLE_ROW_CLASS,
						children: [typeof title === "string" ? /* @__PURE__ */ jsx("h1", {
							className: TITLE_CLASS,
							children: title
						}) : title, badge]
					}),
					subtitle && (typeof subtitle === "string" ? /* @__PURE__ */ jsx("p", {
						className: SUBTITLE_CLASS,
						children: subtitle
					}) : subtitle)
				]
			}),
			tabs && /* @__PURE__ */ jsx("div", {
				className: TABS_CONTAINER_CLASS,
				children: /* @__PURE__ */ jsx(Tabs, {
					items: tabs.items,
					activeId: tabs.activeId,
					onChange: tabs.onChange,
					size: "sm"
				})
			}),
			/* @__PURE__ */ jsxs("div", {
				className: CONTROLS_CLASS,
				children: [
					actions,
					onRefresh && /* @__PURE__ */ jsx(IconButton, {
						variant: "ghost",
						size: "sm",
						"aria-label": refreshTitle,
						title: refreshTitle,
						disabled: refreshing,
						onClick: () => {
							onRefresh();
						},
						children: refreshing ? /* @__PURE__ */ jsx(IconLoadingOutline16, {}) : /* @__PURE__ */ jsx(IconRefreshOutline16, {})
					}),
					onClose && /* @__PURE__ */ jsx(IconButton, {
						variant: "ghost",
						size: "sm",
						"aria-label": closeTitle,
						title: closeTitle,
						onClick: () => {
							onClose();
						},
						children: /* @__PURE__ */ jsx(IconCloseOutline16, {})
					})
				]
			})
		]
	});
});
//#endregion
//#region src/stage/StageHeader.tsx
/**
* StageHeader forwards to PageHeader for backward compatibility.
* Standard Layer 1 Header for OmniMux first-level product stages.
* Typography single source of truth: 20px / 600 / 28px.
*/
const StageHeader = forwardRef(function StageHeader(props, ref) {
	return /* @__PURE__ */ jsx(PageHeader, {
		...props,
		ref
	});
});
//#endregion
//#region \0dsh-ui-kit-css:/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/remove-expand-btn-css/packages/dsh-ui-kit/src/stat/StatBar.module.css.mjs
injectCss("StatBar.module.css", ".dshUk-StatBar-statBar {\n  display: flex;\n  align-items: stretch;\n  gap: 12px;\n  width: 100%;\n  box-sizing: border-box;\n  flex-wrap: wrap;\n}\n\n.dshUk-StatBar-item {\n  display: flex;\n  flex-direction: column;\n  gap: 4px;\n  flex: 1 1 0;\n  min-width: 140px;\n  padding: 12px 16px;\n  background: var(--dsw-alias-bg-layer-1);\n  border: 1px solid var(--dsw-alias-border-l1);\n  border-radius: 8px;\n  box-sizing: border-box;\n}\n\n.dshUk-StatBar-label {\n  font-size: 12px;\n  font-weight: 400;\n  line-height: 16px;\n  color: var(--dsw-alias-label-secondary);\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.dshUk-StatBar-valueRow {\n  display: flex;\n  align-items: baseline;\n  gap: 8px;\n  flex-wrap: wrap;\n}\n\n.dshUk-StatBar-value {\n  font-size: 20px;\n  font-weight: 600;\n  line-height: 28px;\n  color: var(--dsw-alias-label-primary);\n  letter-spacing: -0.01em;\n}\n\n.dshUk-StatBar-trend {\n  display: inline-flex;\n  align-items: center;\n  gap: 2px;\n  font-size: 12px;\n  font-weight: 500;\n  line-height: 16px;\n}\n\n.dshUk-StatBar-trendUp {\n  color: var(--dsw-alias-status-success);\n}\n\n.dshUk-StatBar-trendDown {\n  color: var(--dsw-alias-state-error-primary);\n}\n\n.dshUk-StatBar-trendNeutral {\n  color: var(--dsw-alias-label-secondary);\n}\n\n.dshUk-StatBar-trendIcon {\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  width: 14px;\n  height: 14px;\n  flex: none;\n}\n\n.dshUk-StatBar-extra {\n  font-size: 12px;\n  font-weight: 400;\n  line-height: 16px;\n  color: var(--dsw-alias-label-tertiary);\n  margin-top: auto;\n}\n");
var StatBar_module_css_default = {
	"statBar": "dshUk-StatBar-statBar",
	"item": "dshUk-StatBar-item",
	"label": "dshUk-StatBar-label",
	"valueRow": "dshUk-StatBar-valueRow",
	"value": "dshUk-StatBar-value",
	"trend": "dshUk-StatBar-trend",
	"trendUp": "dshUk-StatBar-trendUp",
	"trendDown": "dshUk-StatBar-trendDown",
	"trendNeutral": "dshUk-StatBar-trendNeutral",
	"trendIcon": "dshUk-StatBar-trendIcon",
	"extra": "dshUk-StatBar-extra"
};
//#endregion
//#region src/stat/StatBar.tsx
const STAT_BAR_CLASS = cssClass(StatBar_module_css_default.statBar, "statBar");
const ITEM_CLASS = cssClass(StatBar_module_css_default.item, "item");
const LABEL_CLASS = cssClass(StatBar_module_css_default.label, "label");
const VALUE_ROW_CLASS = cssClass(StatBar_module_css_default.valueRow, "valueRow");
const VALUE_CLASS = cssClass(StatBar_module_css_default.value, "value");
const TREND_CLASS = cssClass(StatBar_module_css_default.trend, "trend");
const TREND_UP_CLASS = cssClass(StatBar_module_css_default.trendUp, "trendUp");
const TREND_DOWN_CLASS = cssClass(StatBar_module_css_default.trendDown, "trendDown");
const TREND_NEUTRAL_CLASS = cssClass(StatBar_module_css_default.trendNeutral, "trendNeutral");
const TREND_ICON_CLASS = cssClass(StatBar_module_css_default.trendIcon, "trendIcon");
const EXTRA_CLASS = cssClass(StatBar_module_css_default.extra, "extra");
/**
* Metric indicator bar for accounts, analytics, and overview panels.
* Trends strictly consume official IconChevron* SVG icons and DSW semantic status tokens.
*/
const StatBar = forwardRef(function StatBar({ items, className, ...rest }, ref) {
	return /* @__PURE__ */ jsx("div", {
		...rest,
		ref,
		className: cx(STAT_BAR_CLASS, className),
		children: items.map((item) => {
			const trend = item.trend;
			return /* @__PURE__ */ jsxs("div", {
				className: ITEM_CLASS,
				children: [
					/* @__PURE__ */ jsx("div", {
						className: LABEL_CLASS,
						children: item.label
					}),
					/* @__PURE__ */ jsxs("div", {
						className: VALUE_ROW_CLASS,
						children: [/* @__PURE__ */ jsx("div", {
							className: VALUE_CLASS,
							children: item.value
						}), trend && /* @__PURE__ */ jsxs("div", {
							className: cx(TREND_CLASS, trend.direction === "up" && TREND_UP_CLASS, trend.direction === "down" && TREND_DOWN_CLASS, trend.direction === "neutral" && TREND_NEUTRAL_CLASS),
							children: [
								trend.direction === "up" && /* @__PURE__ */ jsx("span", {
									className: TREND_ICON_CLASS,
									"aria-hidden": "true",
									children: /* @__PURE__ */ jsx(IconChevronUpOutline14, { size: 14 })
								}),
								trend.direction === "down" && /* @__PURE__ */ jsx("span", {
									className: TREND_ICON_CLASS,
									"aria-hidden": "true",
									children: /* @__PURE__ */ jsx(IconChevronDownOutline14, { size: 14 })
								}),
								/* @__PURE__ */ jsx("span", { children: trend.value })
							]
						})]
					}),
					item.extra != null && item.extra !== "" ? /* @__PURE__ */ jsx("div", {
						className: EXTRA_CLASS,
						children: item.extra
					}) : null
				]
			}, item.key);
		})
	});
});
//#endregion
//#region \0dsh-ui-kit-css:/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/remove-expand-btn-css/packages/dsh-ui-kit/src/action/ActionRow.module.css.mjs
injectCss("ActionRow.module.css", ".dshUk-ActionRow-actionRow {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  flex-wrap: nowrap;\n  min-height: 32px;\n  box-sizing: border-box;\n  width: 100%;\n}\n\n.dshUk-ActionRow-leftGroup {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  flex-shrink: 0;\n  min-width: 0;\n}\n\n.dshUk-ActionRow-rightGroup {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  margin-left: auto;\n  flex-shrink: 0;\n}\n");
var ActionRow_module_css_default = {
	"actionRow": "dshUk-ActionRow-actionRow",
	"leftGroup": "dshUk-ActionRow-leftGroup",
	"rightGroup": "dshUk-ActionRow-rightGroup"
};
//#endregion
//#region src/action/ActionRow.tsx
const ACTION_ROW_CLASS = cssClass(ActionRow_module_css_default.actionRow, "actionRow");
const LEFT_GROUP_CLASS = cssClass(ActionRow_module_css_default.leftGroup, "leftGroup");
const RIGHT_GROUP_CLASS = cssClass(ActionRow_module_css_default.rightGroup, "rightGroup");
/**
* Secondary action row container.
* Single row (flex-wrap: nowrap) with primary & secondary actions on the left
* and rightActions pushed to the right.
*/
const ActionRow = forwardRef(function ActionRow({ primaryAction, secondaryActions, rightActions, className, children, ...rest }, ref) {
	const hasLeft = primaryAction != null || secondaryActions != null;
	const hasRight = rightActions != null;
	return /* @__PURE__ */ jsxs("div", {
		...rest,
		ref,
		className: cx(ACTION_ROW_CLASS, className),
		children: [
			hasLeft && /* @__PURE__ */ jsxs("div", {
				className: LEFT_GROUP_CLASS,
				children: [primaryAction, secondaryActions]
			}),
			children,
			hasRight && /* @__PURE__ */ jsx("div", {
				className: RIGHT_GROUP_CLASS,
				children: rightActions
			})
		]
	});
});
//#endregion
//#region \0dsh-ui-kit-css:/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/remove-expand-btn-css/packages/dsh-ui-kit/src/gen-wave-card/GenWaveCard.module.css.mjs
injectCss("GenWaveCard.module.css", "/* GenWaveCard · 1:1 移植自 chatgpt-gen-loading-card.dshUk-GenWaveCard-html\n   色值全部来自根元素注入的 --gen-wave-* CSS 变量（见 GenWaveCard.dshUk-GenWaveCard-tsx，\n   常量真源在 genWavePalette.dshUk-GenWaveCard-ts，固定深色既定视觉）。 */\n\n.dshUk-GenWaveCard-card {\n  position: relative;\n  width: 413px; /* 实测: x10.5 起、内容右缘 ~x413 */\n  max-width: 100%;\n  background: var(--gen-wave-card-bg);\n  border-radius: 8px;\n  padding: 10px 10px 23px;\n  overflow: hidden;\n  box-sizing: border-box;\n  font-family: -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto,\n    \"PingFang SC\", \"Microsoft YaHei\", \"Hiragino Sans GB\", sans-serif;\n  -webkit-font-smoothing: antialiased;\n}\n\n/* ---------- 顶部行：工具图标 + 状态文案 ---------- */\n.dshUk-GenWaveCard-head {\n  display: flex;\n  align-items: center;\n  gap: 11px; /* 实测: 图标右缘 ~34.5 → 文字 47 */\n  height: 14px;\n}\n\n.dshUk-GenWaveCard-icon {\n  width: 13.5px;\n  height: 13.5px;\n  flex: 0 0 auto;\n  border-radius: 4px;\n  border: 1.2px solid var(--gen-wave-icon); /* 实测描边 ~1.25px */\n  display: grid;\n  place-items: center;\n  color: var(--gen-wave-icon);\n}\n\n.dshUk-GenWaveCard-icon svg {\n  display: block;\n}\n\n.dshUk-GenWaveCard-status {\n  color: var(--gen-wave-status);\n  font-size: 16px; /* 字形 cap 高 23px@2x → ~16px */\n  font-weight: 400;\n  line-height: 1;\n  white-space: nowrap;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  min-width: 0;\n}\n\n/* ---------- 点阵画布 ---------- */\n.dshUk-GenWaveCard-field {\n  display: block;\n  width: 100%;\n  margin-top: 26px; /* 实测: 顶行底 ~24 → 首行点心 53 */\n}\n\n/* ---------- 右下角进度胶囊 ----------\n   视觉由点阵 canvas 同层绘制（DOM 元素保留作 ARIA/状态载体，\n   headless Chrome 下 absolute+大圆角浮层会屏蔽 canvas 合成） */\n.dshUk-GenWaveCard-badge {\n  position: absolute;\n  right: 19px;\n  bottom: 23px;\n  width: 58px;\n  height: 36px;\n  opacity: 0; /* 不可见但保留语义与 API 目标 */\n  user-select: none;\n  pointer-events: none;\n}\n");
var GenWaveCard_module_css_default = {
	"html": "dshUk-GenWaveCard-html",
	"tsx": "dshUk-GenWaveCard-tsx",
	"ts": "dshUk-GenWaveCard-ts",
	"card": "dshUk-GenWaveCard-card",
	"head": "dshUk-GenWaveCard-head",
	"icon": "dshUk-GenWaveCard-icon",
	"status": "dshUk-GenWaveCard-status",
	"field": "dshUk-GenWaveCard-field",
	"badge": "dshUk-GenWaveCard-badge"
};
//#endregion
//#region src/gen-wave-card/genWavePalette.ts
/**
* GenWaveCard 视觉参数与色值常量。
*
* 真源：omnimux-dsh/chatgpt-gen-loading-card.html（1:1 像素实测复刻实现）。
* 以下数值为参考截图（510×492 逻辑视口，2x DPR）逐帧实测反推结果，
* 本组件为深色既定视觉（固定暗色卡片），故色值不消费 --dsw-alias-* 动态主题，
* 而是封装为本文件常量；由于 kit-export 门禁禁止 .tsx / .module.css 中出现
* hex 与 rgb( 字面量，色值集中在此 .ts 文件并以 CSS 变量形式注入卡片根元素。
*/
const GEN_WAVE_CONFIG = {
	COLS: 28,
	ROWS: 29,
	SPACING: 13.3333,
	PAD_Y: 2.5,
	PAD_Y_BOT: 9.5,
	DOT_R_MIN: 1.15,
	DOT_R_MAX: 3.25,
	SIZE_LAMBDA: 28,
	SIZE_TILT: .8,
	SIZE_POW: .5,
	SIZE_PERIOD_MS: 5200,
	REVEAL_TILT: .35,
	REVEAL_SIGMA: .5,
	REVEAL_PERIOD_MS: 8600,
	REVEAL_S_MAX: 31,
	REVEAL_S_MIN: -10,
	MASKED_CELLS: [
		[0, 0],
		[27, 0],
		[0, 28]
	],
	BADGE_X_OFF: 10,
	BADGE_W: 58,
	BADGE_H: 35,
	BADGE_BOTTOM_GAP: 0,
	BADGE_FONT: 23,
	DEMO_TARGET: 96,
	DEMO_MS: 12e3
};
/** 参考截帧定格参数：尺寸波相位 φ=10.5、亮度锋面 T=22.5（reduced-motion / 首帧）。 */
const GEN_WAVE_FREEZE = {
	PHI: 10.5,
	T: 22.5
};
/** 卡片色值（参考截图实测均值，固定深色视觉）。 */
const GEN_WAVE_COLORS = {
	/** 卡片底色 = 页面底色（实测四角 14,14,14），无浮起层、无边框。 */
	cardBg: "#0e0e0e",
	/** 任务文案颜色（字形墨色实测均值 ~174-182）。 */
	status: "#b6b6b8",
	/** 图标描边与内 ›_ 符号色（实测 ~205）。 */
	icon: "#cdcdcd",
	/** 进度胶囊底（实测 33,33,33）。 */
	badgeBg: "rgb(33,33,33)",
	/** 进度百分比墨色（实测均值 ~218-226）。 */
	badgeFg: "rgb(226,226,226)",
	/** 暗点 --dot-dim（实测 ~62）。 */
	dimRgb: [
		62,
		62,
		62
	],
	/** 亮点 --dot-lit（实测 ~224）。 */
	litRgb: [
		224,
		224,
		224
	]
};
const GEN_WAVE_BADGE_FONT_FAMILY = "-apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"PingFang SC\", sans-serif";
/** 按亮度系数 k∈[0,1] 在暗点/亮点实测色之间插值，返回 canvas fillStyle。 */
function dotFillStyle(k) {
	const [dr, dg, db] = GEN_WAVE_COLORS.dimRgb;
	const [lr, lg, lb] = GEN_WAVE_COLORS.litRgb;
	return `rgb(${Math.round(dr + (lr - dr) * k)},${Math.round(dg + (lg - dg) * k)},${Math.round(db + (lb - db) * k)})`;
}
//#endregion
//#region src/gen-wave-card/GenWaveCard.tsx
/**
* 固定深色既定视觉：色值不消费 --dsw-alias-* 动态主题，
* 真源为 genWavePalette.ts（实测色，见该文件注释），
* 以 CSS 变量注入根元素供 GenWaveCard.module.css 使用
*（色值字面量一律集中在 genWavePalette.ts，本文件与 module.css 不得出现）。
*/
const THEME_VARS = {
	"--gen-wave-card-bg": GEN_WAVE_COLORS.cardBg,
	"--gen-wave-status": GEN_WAVE_COLORS.status,
	"--gen-wave-icon": GEN_WAVE_COLORS.icon
};
/**
* 点阵 Loading 卡片（1:1 移植自 chatgpt-gen-loading-card.html）。
*
* canvas 绘 28×29 点阵：尺寸场 |cos|^0.5 周期波（s = col + 0.8·row）
* 叠加亮度场 sigmoid 单向锋面（s = col − 0.35·row，T 在 [-10,31] 往返），
* 左上 r0c0 / 右上 r0c27 / 左下 r28c0 三角位缺位；右下角 58×35 椭圆
* 进度胶囊与点阵同层绘制（DOM badge 保留为 ARIA/状态载体）。
* 自适应容器宽度（点距收窄、水平居中）；prefers-reduced-motion 定格参考帧。
*/
const GenWaveCard = forwardRef(function GenWaveCard({ statusText, progress, autoProgress, className, style, ...rest }, ref) {
	const canvasRef = useRef(null);
	const badgeRef = useRef(null);
	/** reduced-motion 下外部更新进度时触发的单帧重绘钩子。 */
	const redrawRef = useRef(null);
	const setProgressText = (n) => {
		const el = badgeRef.current;
		if (!el) return;
		const v = Math.max(0, Math.min(100, Number(n) || 0));
		el.textContent = Math.round(v) + "%";
	};
	useEffect(() => {
		const canvas = canvasRef.current;
		const badgeEl = badgeRef.current;
		if (!canvas || !badgeEl) return;
		const ctx = canvas.getContext("2d");
		if (!ctx) return;
		const C = GEN_WAVE_CONFIG;
		let cssW = 0;
		let cssH = 0;
		let spacing = C.SPACING;
		let gridOffX = 0;
		let rafId = 0;
		const layout = () => {
			cssW = canvas.getBoundingClientRect().width;
			spacing = Math.min(C.SPACING, (cssW - 2) / (C.COLS - 1));
			const gridW = spacing * (C.COLS - 1);
			const gridH = spacing * (C.ROWS - 1);
			gridOffX = (cssW - gridW) / 2;
			cssH = C.PAD_Y + gridH + C.PAD_Y_BOT;
			const dpr = Math.min(window.devicePixelRatio || 1, 2);
			canvas.style.height = cssH + "px";
			canvas.width = Math.round(cssW * dpr);
			canvas.height = Math.round(cssH * dpr);
			ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		};
		const MASKED = new Set(C.MASKED_CELLS.map(([c, r]) => c + "," + r));
		const maskedOut = (c, r) => MASKED.has(c + "," + r);
		const sizeWave = (col, row, phi) => {
			const s = col + C.SIZE_TILT * row;
			return Math.pow((1 + Math.cos(2 * Math.PI * (s - phi) / C.SIZE_LAMBDA)) / 2, C.SIZE_POW);
		};
		const brightWave = (col, row, T) => {
			const s = col - C.REVEAL_TILT * row;
			return 1 / (1 + Math.exp((s - T) / C.REVEAL_SIGMA));
		};
		const lerp = (a, b, k) => a + (b - a) * k;
		const drawField = (phi, T) => {
			ctx.clearRect(0, 0, cssW, cssH);
			for (let r = 0; r < C.ROWS; r++) for (let c = 0; c < C.COLS; c++) {
				if (maskedOut(c, r)) continue;
				const ks = sizeWave(c, r, phi);
				const kb = brightWave(c, r, T);
				const radius = lerp(C.DOT_R_MIN, C.DOT_R_MAX, ks);
				const x = gridOffX + c * spacing;
				const y = C.PAD_Y + r * spacing;
				ctx.fillStyle = dotFillStyle(kb);
				ctx.beginPath();
				ctx.arc(x, y, radius, 0, Math.PI * 2);
				ctx.fill();
			}
			const bw = C.BADGE_W;
			const bh = C.BADGE_H;
			const bx = cssW - C.BADGE_X_OFF - bw;
			const by = cssH - C.BADGE_BOTTOM_GAP - bh;
			ctx.fillStyle = GEN_WAVE_COLORS.badgeBg;
			ctx.beginPath();
			ctx.ellipse(bx + bw / 2, by + bh / 2, bw / 2, bh / 2, 0, 0, Math.PI * 2);
			ctx.fill();
			ctx.fillStyle = GEN_WAVE_COLORS.badgeFg;
			ctx.font = `500 ${C.BADGE_FONT}px ${GEN_WAVE_BADGE_FONT_FAMILY}`;
			ctx.textAlign = "center";
			ctx.textBaseline = "middle";
			ctx.fillText(badgeEl.textContent ?? "", bx + bw / 2, by + bh / 2 + .5);
		};
		const frame = (now) => {
			const phi = now / C.SIZE_PERIOD_MS * C.SIZE_LAMBDA + GEN_WAVE_FREEZE.PHI;
			const span = C.REVEAL_S_MAX - C.REVEAL_S_MIN;
			const q = now % (C.REVEAL_PERIOD_MS * 2) / C.REVEAL_PERIOD_MS;
			const k = q <= 1 ? q : 2 - q;
			const T = C.REVEAL_S_MIN + span * (.5 - .5 * Math.cos(Math.PI * k));
			drawField(phi, T);
			rafId = requestAnimationFrame(frame);
		};
		const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
		const redrawStatic = () => {
			drawField(GEN_WAVE_FREEZE.PHI, GEN_WAVE_FREEZE.T);
		};
		redrawRef.current = reducedMotion ? redrawStatic : null;
		const relayout = () => {
			layout();
			if (reducedMotion) redrawStatic();
		};
		layout();
		if (reducedMotion) redrawStatic();
		else {
			drawField(GEN_WAVE_FREEZE.PHI, GEN_WAVE_FREEZE.T);
			rafId = requestAnimationFrame(frame);
		}
		let observer = null;
		if (typeof ResizeObserver !== "undefined") {
			observer = new ResizeObserver(relayout);
			observer.observe(canvas);
		}
		window.addEventListener("resize", relayout);
		return () => {
			cancelAnimationFrame(rafId);
			observer?.disconnect();
			window.removeEventListener("resize", relayout);
			redrawRef.current = null;
		};
	}, []);
	useEffect(() => {
		if (progress === void 0) return;
		setProgressText(progress);
		redrawRef.current?.();
	}, [progress]);
	useEffect(() => {
		if (!(autoProgress ?? progress === void 0)) return;
		let running = true;
		const C = GEN_WAVE_CONFIG;
		const t0 = performance.now();
		const tick = (now) => {
			if (!running) return;
			const k = Math.min(1, (now - t0) / C.DEMO_MS);
			setProgressText(C.DEMO_TARGET * (1 - Math.pow(1 - k, 3)));
			redrawRef.current?.();
			if (k < 1) requestAnimationFrame(tick);
		};
		requestAnimationFrame(tick);
		return () => {
			running = false;
		};
	}, [autoProgress, progress === void 0]);
	return /* @__PURE__ */ jsxs("div", {
		...rest,
		ref,
		role: "status",
		"aria-live": "polite",
		"aria-label": "Generation in progress",
		className: cx(cssClass(GenWaveCard_module_css_default.card, "card"), className),
		style: {
			...THEME_VARS,
			...style
		},
		children: [
			/* @__PURE__ */ jsxs("div", {
				className: cssClass(GenWaveCard_module_css_default.head, "head"),
				children: [/* @__PURE__ */ jsx("span", {
					className: cssClass(GenWaveCard_module_css_default.icon, "icon"),
					"aria-hidden": "true",
					children: /* @__PURE__ */ jsxs("svg", {
						width: "8",
						height: "8",
						viewBox: "0 0 8 8",
						fill: "none",
						stroke: "currentColor",
						strokeWidth: "1",
						strokeLinecap: "round",
						strokeLinejoin: "round",
						children: [/* @__PURE__ */ jsx("path", { d: "M1.8 2 4.8 4 1.8 6" }), /* @__PURE__ */ jsx("path", { d: "M5.6 6h1.6" })]
					})
				}), /* @__PURE__ */ jsx("span", {
					className: cssClass(GenWaveCard_module_css_default.status, "status"),
					children: statusText
				})]
			}),
			/* @__PURE__ */ jsx("canvas", {
				ref: canvasRef,
				className: cssClass(GenWaveCard_module_css_default.field, "field"),
				"aria-hidden": "true"
			}),
			/* @__PURE__ */ jsx("span", {
				ref: badgeRef,
				className: cssClass(GenWaveCard_module_css_default.badge, "badge"),
				children: "0%"
			})
		]
	});
});
//#endregion
//#region src/stage/createStageStore.ts
const PRODUCT_STAGE_EVENT = "dsh-product-stage";
const ACTIVE_STAGE_STORAGE_KEY = "omnimux_active_product_stage";
/**
* Creates an idempotent StageStore for a first-level product page.
* Manages mutual exclusion with other product stages via `dsh-product-stage` event.
* @param stageId Unique product stage identifier (e.g. 'omnimux-assets')
* @param getStage Function resolving the host singleton (defaults to window.__omnimuxStage)
*/
function createStageStore(stageId, getStage = () => typeof window !== "undefined" ? window.__omnimuxStage : void 0) {
	let open = false;
	if (typeof window !== "undefined") try {
		open = window.localStorage.getItem(ACTIVE_STAGE_STORAGE_KEY) === stageId;
	} catch {}
	const listeners = /* @__PURE__ */ new Set();
	function emit() {
		for (const listener of listeners) try {
			listener();
		} catch (err) {
			console.error("StageStore listener error:", err);
		}
	}
	if (open && typeof window !== "undefined") {
		const restore = () => {
			try {
				const stage = getStage();
				if (stage && typeof stage.claim === "function") stage.claim(stageId);
			} catch {}
		};
		if (typeof queueMicrotask === "function") queueMicrotask(restore);
		else setTimeout(restore, 0);
	}
	if (typeof window !== "undefined") window.addEventListener(PRODUCT_STAGE_EVENT, (event) => {
		const id = event instanceof CustomEvent ? event.detail?.id : void 0;
		if (id !== stageId && open) {
			open = false;
			emit();
		} else if (id === stageId && !open) {
			open = true;
			emit();
		}
	});
	return {
		getSnapshot: () => open,
		readBox() {
			const stage = getStage();
			if (stage && typeof stage.readBox === "function") return stage.readBox();
			const left = 56;
			const winWidth = typeof window !== "undefined" ? window.innerWidth : 1280;
			const winHeight = typeof window !== "undefined" ? window.innerHeight : 800;
			return {
				top: 0,
				left,
				width: Math.max(8, winWidth - left),
				height: Math.max(8, winHeight)
			};
		},
		subscribe(listener) {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
		set(next) {
			if (open === next) return;
			open = next;
			const stage = getStage();
			if (open) stage?.claim?.(stageId);
			else stage?.release?.(stageId);
			emit();
		},
		open() {
			this.set(true);
		},
		close() {
			this.set(false);
		}
	};
}
//#endregion
//#region src/stage/createSidebarEntry.ts
const SIDEBAR_ENTRY_COMMON_STYLES = `
.omnimux-sidebar-nav-entry {
  box-sizing: border-box; display: flex; align-items: center; gap: 6px; position: relative;
  width: calc(100% - 8px); height: 32px; margin: 0 4px; padding: 0 8px;
  border: none; border-radius: 8px; background: transparent;
  color: var(--dsw-alias-label-primary, inherit);
  font: var(--dsw-font-s-14, inherit); font-size: 14px; line-height: 20px;
  cursor: pointer; text-align: left;
}
.omnimux-sidebar-nav-entry[data-hidden="true"],
.omnimux-sidebar-nav-entry.omnimux-sidebar-nav-entry-hidden {
  display: none !important;
}
.omnimux-sidebar-nav-entry:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}
.omnimux-sidebar-nav-entry[data-active="true"] {
  background: var(--dsw-alias-interactive-bg-active);
  font-weight: 500;
}
.omnimux-sidebar-nav-entry-icon {
  flex: none; display: inline-flex; width: 14px; height: 14px; align-items: center; justify-content: center;
}
.omnimux-sidebar-nav-entry-icon svg {
  display: block; width: 14px; height: 14px;
}
.omnimux-sidebar-nav-entry-label {
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; line-height: 20px;
}
`;
function resolveLabel(label) {
	return typeof label === "function" ? label() : label;
}
function paintLabel(entry, labelText) {
	entry.setAttribute("aria-label", labelText);
	const node = entry.querySelector(".omnimux-sidebar-nav-entry-label");
	if (node) node.textContent = labelText;
}
function registerWhenCoordinatorReady(row) {
	let unregister = () => {};
	let disposed = false;
	const attempt = () => {
		if (disposed) return;
		const api = (typeof window !== "undefined" ? window : void 0)?.__omnimuxSidebar;
		if (!api || typeof api.register !== "function") return;
		unregister = api.register(row);
		clearInterval(timer);
	};
	const timer = setInterval(attempt, 500);
	attempt();
	return () => {
		disposed = true;
		clearInterval(timer);
		unregister();
	};
}
/**
* Creates and mounts a standardized sidebar entry under the 新会话 button.
* Uses idempotent activation (stageStore.open()) to guarantee persistent selection.
*/
function createSidebarEntry(options) {
	const { id, rank, label, iconSvg, stageStore, locale, customClassName, datasetKey, access = "offline", requireAuth, authReason } = options;
	const entry = document.createElement("button");
	entry.type = "button";
	if (datasetKey) entry.setAttribute(datasetKey, "");
	entry.className = `omnimux-sidebar-nav-entry ${customClassName || ""}`.trim();
	entry.innerHTML = `<span class="omnimux-sidebar-nav-entry-icon">${iconSvg}</span><span class="omnimux-sidebar-nav-entry-label"></span>`;
	const updateLabel = () => {
		paintLabel(entry, resolveLabel(label));
	};
	updateLabel();
	entry.addEventListener("click", () => {
		if (access === "cloud" || access === "offline" && requireAuth === true) {
			const auth = (typeof window !== "undefined" ? window : void 0)?.__omnimuxAuth;
			if (auth && typeof auth.ensureLogin === "function") {
				const reason = authReason ? resolveLabel(authReason) : resolveLabel(label);
				auth.ensureLogin({
					reason,
					kind: "explicit",
					onSuccess: () => {
						stageStore.open();
					}
				});
				return;
			}
		}
		stageStore.open();
	});
	const syncActive = () => {
		if (stageStore.getSnapshot()) entry.dataset.active = "true";
		else delete entry.dataset.active;
	};
	const unsubscribeStage = stageStore.subscribe(syncActive);
	syncActive();
	const unsubscribeLocale = typeof locale?.subscribe === "function" ? locale.subscribe(updateLabel) : () => {};
	const unregisterCoordinator = registerWhenCoordinatorReady({
		id: `${id}-entry`,
		rank,
		styles: SIDEBAR_ENTRY_COMMON_STYLES,
		styleId: "omnimux-sidebar-nav-entry-styles",
		create: () => entry
	});
	return () => {
		unregisterCoordinator();
		unsubscribeStage();
		unsubscribeLocale();
	};
}
//#endregion
export { ActionRow, Badge, Button, CardGrid, ConfirmModal, CopyButton, DataTable, Divider, Drawer, DrawerPortal, DropdownSelect, EmptyState, FilterBar, GenWaveCard, IconButton, InputField, MediaCard, ModalDialog, PageHeader, SearchField, SelectableTile, StageContainer, StageHeader, StatBar, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Tabs, Toolbar, copyToClipboard, createPortalSafe, createSidebarEntry, createStageStore, focusFirstDescendant, resolvePortalContainer, trapFocus };

//# sourceMappingURL=index.js.map