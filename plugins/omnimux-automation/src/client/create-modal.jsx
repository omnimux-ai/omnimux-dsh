import { useEffect, useRef, useState } from "react";
import { Button } from "./controls.jsx";
import { permissionLabel } from "./permissions.js";
import {
  AutomationFormError,
  defaultFormState,
  insertSkillGesture,
  skillGestureToken
} from "./helpers.js";
import { shouldConfirmFullAccess } from "./create-modal-logic.js";
import { CloseOutlineIcon, FolderIcon, ShieldIcon, SparkleIcon } from "./icons.jsx";
import { MenuHostProvider, MenuPanel, MenuPopup, MenuRow, MenuSelect, useMenuState } from "./menu.jsx";
import { IconCheckOutline16, IconChevronDownOutline14, RiskConfirmation } from "@deepseek-ai/dsh-client-ui-primitives";
const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7];
const KINDS = ["once", "interval", "hourly", "daily", "weekly", "monthly", "custom"];
const HOURS = Array.from({ length: 24 }, (_, index) => String(index).padStart(2, "0"));
const MINUTES = Array.from({ length: 60 }, (_, index) => String(index).padStart(2, "0"));
function CreateModal({
  t,
  permissionT,
  modelT,
  busy,
  workspaces,
  models,
  modelFailures,
  defaultModel,
  skills,
  permissions,
  defaultPermission,
  draft,
  editing,
  onClose,
  onSubmit
}) {
  const [form, setForm] = useState(() => ({ ...defaultFormState(/* @__PURE__ */ new Date(), workspaces, defaultModel, defaultPermission), ...draft }));
  const [validationError, setValidationError] = useState();
  const [confirmingPermission, setConfirmingPermission] = useState();
  const [fullAccessAcknowledged, setFullAccessAcknowledged] = useState(false);
  const update = (patch) => {
    setForm((current) => ({ ...current, ...patch }));
    setValidationError(void 0);
  };
  const choosePermission = (permission) => {
    if (shouldConfirmFullAccess(form.permission, permission)) {
      setFullAccessAcknowledged(false);
      setConfirmingPermission(permission);
      return;
    }
    update({ permission });
  };
  const cancelFullAccessConfirmation = () => {
    setFullAccessAcknowledged(false);
    setConfirmingPermission(void 0);
  };
  const confirmFullAccess = () => {
    if (!fullAccessAcknowledged || confirmingPermission === void 0) return;
    update({ permission: confirmingPermission });
    cancelFullAccessConfirmation();
  };
  useEffect(() => {
    const onKey = (event) => {
      if (event.key !== "Escape") return;
      if (document.querySelector(".dsh-st-model-select-menu") !== null) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
    };
  }, [onClose]);
  const handleSubmit = async (event) => {
    event.preventDefault();
    try {
      await onSubmit(form);
    } catch (caught) {
      if (caught instanceof AutomationFormError) {
        setValidationError(t(caught.key));
        return;
      }
      setValidationError(caught instanceof Error ? caught.message : t("error.action"));
    }
  };
  const datePart = form.onceAt.slice(0, 10);
  const timePart = form.onceAt.slice(11, 16) || "09:00";
  const today = localDateValue(/* @__PURE__ */ new Date());
  const minOnceTime = datePart === today ? localTimeValue(/* @__PURE__ */ new Date()) : void 0;
  const [menuHost, setMenuHost] = useState(null);
  const workspace = workspaces.find((item) => item.id === form.workspaceId);
  const promptRef = useRef(null);
  const caretRef = useRef(0);
  const rememberCaret = () => {
    const el = promptRef.current;
    if (el !== null) caretRef.current = el.selectionStart;
  };
  const insertSkill = (skill) => {
    const next = insertSkillGesture(form.prompt, skillGestureToken(skill), caretRef.current);
    update({ prompt: next.text });
    queueMicrotask(() => {
      const el = promptRef.current;
      if (el === null) return;
      el.focus();
      el.setSelectionRange(next.caret, next.caret);
      caretRef.current = next.caret;
    });
  };
  return <div className="dsh-st-mask" role="presentation">
      <MenuHostProvider host={menuHost}>
      <form className="dsh-st-modal" onClick={(event) => event.stopPropagation()} onSubmit={handleSubmit}>
        <div className="dsh-st-modal-head">
          <div>
            <h2>{editing === true ? t("modal.edit") : t("modal.title")}</h2>
            <p>{t("form.subtitle")}</p>
          </div>
          <Button type="button" className="dsh-st-modal-close" onClick={onClose} aria-label={t("form.cancel")}><CloseOutlineIcon width={14} height={14} /></Button>
        </div>

        <label className="dsh-st-field">
          {t("form.name")}
          <input value={form.name} placeholder={t("form.namePlaceholder")} onChange={(event) => update({ name: event.target.value })} />
        </label>

        <div className="dsh-st-plan-row">
          <div className="dsh-st-field">
            {t("form.planTime")}
            <div className="dsh-st-inline">
              <MenuSelect
    value={form.scheduleKind}
    options={KINDS.map((kind) => ({ value: kind, label: t(`form.${kind}`) }))}
    onChange={(value) => update({ scheduleKind: value })}
  />
              {form.scheduleKind === "once" && <>
                  <input type="date" min={today} value={datePart} onChange={(event) => update({ onceAt: clampOnceAt(`${event.target.value}T${timePart}`) })} />
                  <TimeSelect value={timePart} {...minOnceTime === void 0 ? {} : { minTime: minOnceTime }} onChange={(value) => update({ onceAt: clampOnceAt(`${datePart}T${value}`) })} />
                </>}
              {form.scheduleKind === "interval" && <>
                  <input className="is-narrow" type="number" min={1} value={form.everyMinutes} onChange={(event) => update({ everyMinutes: event.target.value })} />
                  <span className="dsh-st-suffix">{t("form.minutesShort")}</span>
                </>}
              {form.scheduleKind === "hourly" && <>
                  <MenuSelect value={form.hourlyMinute} options={MINUTES.map((item) => ({ value: item, label: item }))} onChange={(value) => update({ hourlyMinute: value })} />
                  <span className="dsh-st-suffix">{t("form.minutesShort")}</span>
                </>}
              {(form.scheduleKind === "daily" || form.scheduleKind === "weekly") && <TimeSelect value={form.time} onChange={(value) => update({ time: value })} />}
              {form.scheduleKind === "monthly" && <>
                  <MenuSelect
    value={form.monthDay}
    options={Array.from({ length: 31 }, (_, index) => {
      const day = String(index + 1);
      return { value: day, label: t("form.monthDay", { day }) };
    })}
    onChange={(value) => update({ monthDay: value })}
  />
                  <TimeSelect value={form.time} onChange={(value) => update({ time: value })} />
                </>}
              {form.scheduleKind === "custom" && <>
                  <input className="is-narrow" type="number" min={1} value={form.customDays} onChange={(event) => update({ customDays: event.target.value })} />
                  <span className="dsh-st-suffix">{t("form.daysShort")}</span>
                  <TimeSelect value={form.time} onChange={(value) => update({ time: value })} />
                </>}
            </div>
          </div>
          <label className="dsh-st-field dsh-st-concurrency" title={t("form.maxConcurrentRunsHint")}>
            <span>{t("form.maxConcurrentRuns")}</span>
            <input type="number" min={1} step={1} required value={form.maxConcurrentRuns} onChange={(event) => update({ maxConcurrentRuns: event.target.value })} />
          </label>
        </div>

        {form.scheduleKind === "weekly" && <div className="dsh-st-weekdays">
            {WEEKDAYS.map((day) => <Button
    key={day}
    type="button"
    className={form.weekdays.includes(day) ? "is-on" : ""}
    onClick={() => update({
      weekdays: form.weekdays.includes(day) ? form.weekdays.filter((value) => value !== day) : [...form.weekdays, day]
    })}
  >
                {t(`day.${day}`)}
              </Button>)}
          </div>}

        <div className="dsh-st-field">
          <span>{t("form.prompt")}</span>
          <div className="dsh-st-prompt-card">
            <textarea ref={promptRef} value={form.prompt} placeholder={t("form.promptPlaceholder")} onChange={(event) => {
    rememberCaret();
    update({ prompt: event.target.value });
  }} onSelect={rememberCaret} onClick={rememberCaret} onKeyUp={rememberCaret} />
            <div className="dsh-st-composer">
              <div className="dsh-st-composer-left">
                <MenuPanel ghost up label={<><FolderIcon width={14} height={14} />{workspace?.title || t("form.workspace")}</>}>
                  {workspaces.length === 0 && <div className="dsh-st-select-empty">{t("form.error.workspace")}</div>}
                  {workspaces.map((item) => <MenuRow
    key={item.id}
    icon={<FolderIcon width={14} height={14} />}
    label={item.title}
    active={item.id === form.workspaceId}
    onClick={() => update({ workspaceId: item.id })}
  />)}
                </MenuPanel>
                <MenuPanel ghost up label={<><SparkleIcon width={14} height={14} />{t("form.skills")}</>}>
                  {skills.length === 0 && <div className="dsh-st-select-empty">{t("form.skillsEmpty")}</div>}
                  {skills.map((item) => <MenuRow
    key={item.id}
    icon={<SparkleIcon width={14} height={14} />}
    label={item.name}
    onClick={() => insertSkill(item)}
  />)}
                </MenuPanel>
                <MenuSelect
    pill
    up
    icon={<ShieldIcon width={14} height={14} />}
    value={form.permission}
    options={permissions.map((option) => ({
      value: option.value,
      label: permissionLabel(option, t),
      icon: <ShieldIcon width={14} height={14} />
    }))}
    onChange={choosePermission}
  />
              </div>
              <div className="dsh-st-composer-right">
                <ModelPicker
    modelT={modelT}
    models={models}
    failures={modelFailures}
    modelKey={form.modelKey}
    reasoningEffort={form.reasoningEffort}
    onSelection={(modelKey, reasoningEffort) => update({ modelKey, reasoningEffort })}
  />
              </div>
            </div>
          </div>
        </div>


        {validationError !== void 0 && <p className="dsh-st-error">{validationError}</p>}
        <div className="dsh-st-modal-actions">
          <Button type="button" className="dsh-st-btn" onClick={onClose} disabled={busy}>{t("form.cancel")}</Button>
          <Button type="submit" className="dsh-st-btn dsh-st-btn--primary" disabled={busy}>{t("modal.save")}</Button>
        </div>
      </form>
      <div className="dsh-st-flyout-root" ref={setMenuHost} />
      <RiskConfirmation
    open={confirmingPermission !== void 0}
    title={permissionT("confirm.title")}
    description={permissionT("confirm.description")}
    acknowledgeLabel={permissionT("confirm.acknowledge")}
    cancelLabel={permissionT("confirm.cancel")}
    confirmLabel={permissionT("confirm.enable")}
    acknowledged={fullAccessAcknowledged}
    onAcknowledgedChange={setFullAccessAcknowledged}
    onCancel={cancelFullAccessConfirmation}
    onConfirm={confirmFullAccess}
  />
      </MenuHostProvider>
    </div>;
}
function ModelPicker({
  modelT,
  models,
  failures,
  modelKey,
  reasoningEffort,
  onSelection
}) {
  const menu = useMenuState();
  const [pane, setPane] = useState("root");
  const selected = models.find((item) => `${item.provider}::${item.model}` === modelKey);
  const reasoning = selected?.reasoning;
  const effectiveEffort = reasoningEffort === "none" ? reasoning?.defaultEffort : reasoningEffort;
  const effortLabel = reasoning === void 0 ? void 0 : effectiveEffort === void 0 ? modelT("effort.providerDefault") : reasoning.efforts.find((item) => item.id === effectiveEffort)?.name ?? effectiveEffort;
  const trigger = selected?.label ?? modelT("trigger.fallback");
  const modelGroups = Array.from(models.reduce((groups, item) => {
    const group = groups.get(item.provider) ?? { label: item.providerLabel, models: [] };
    group.models.push(item);
    groups.set(item.provider, group);
    return groups;
  }, /* @__PURE__ */ new Map()));
  useEffect(() => {
    if (!menu.open) return;
    const onKey = (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      if (pane !== "root") setPane("root");
      else menu.setOpen(false);
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
    };
  }, [menu.open, menu.setOpen, pane]);
  const selectModel = (item) => {
    onSelection(
      `${item.provider}::${item.model}`,
      item.reasoning?.defaultEffort ?? "none"
    );
    menu.setOpen(false);
    setPane("root");
  };
  const selectEffort = (effort) => {
    onSelection(modelKey, effort);
    menu.setOpen(false);
    setPane("root");
  };
  return <div className={`dsh-st-model-select${menu.open ? " is-open" : ""}`} ref={menu.root}>
      <Button
    type="button"
    className="dsh-st-model-select-trigger"
    aria-label={selected === void 0 ? modelT("trigger.selectAria") : effortLabel === void 0 ? modelT("trigger.aria", { model: selected.label }) : modelT("trigger.ariaEffort", { model: selected.label, effort: effortLabel })}
    onMouseDown={(event) => event.stopPropagation()}
    onClick={() => {
      if (menu.open) {
        menu.setOpen(false);
        return;
      }
      setPane("root");
      menu.setOpen(true);
    }}
  >
        <span>{trigger}</span>
        {effortLabel !== void 0 && <span className="dsh-st-model-trigger-effort">{effortLabel}</span>}
        <IconChevronDownOutline14 className={`dsh-st-model-trigger-chevron${menu.open ? " is-open" : ""}`} />
      </Button>
      <MenuPopup open={menu.open} anchor={menu.root} menuRef={menu.menu} up end className="dsh-st-model-select-menu is-up is-end" ariaLabel={modelT("menu.aria")}>
        {pane === "root" && <>
            <MenuRow
    kv
    label={modelT("menu.model")}
    hint={selected?.label ?? modelT("trigger.fallback")}
    chevron
    onClick={() => setPane("model")}
  />
            {reasoning !== void 0 && <MenuRow
    kv
    label={modelT("menu.effort")}
    hint={effortLabel ?? modelT("effort.providerDefault")}
    chevron
    onClick={() => setPane("effort")}
  />}
          </>}
        {pane === "model" && <>
            {failures.map((failure) => <div key={failure.provider} className="dsh-st-model-warning">
                {modelT("warning.groupLoad", { name: failure.providerLabel, message: failure.message })}
              </div>)}
            {modelGroups.map(([provider, group]) => <section key={provider} role="group" aria-label={group.label} className="dsh-st-model-group">
            <div className="dsh-st-model-group-title">{group.label}</div>
            {group.models.map((item) => {
    const value = `${item.provider}::${item.model}`;
    return <Button
      key={value}
      type="button"
      role="menuitemradio"
      aria-checked={value === modelKey}
      className="dsh-st-model-option"
      title={item.label}
      onClick={() => selectModel(item)}
    >
                  <span className="dsh-st-model-option-copy">
                    <span className="dsh-st-model-name">{item.label}</span>
                  </span>
                  <span className="dsh-st-model-check">{value === modelKey && <IconCheckOutline16 />}</span>
                </Button>;
  })}
          </section>)}
            {modelGroups.length === 0 && failures.length === 0 && <div className="dsh-st-model-empty">{modelT("empty.models")}</div>}
          </>}
        {pane === "effort" && reasoning !== void 0 && <>
            {reasoning.defaultEffort === void 0 && <Button
    type="button"
    role="menuitemradio"
    aria-checked={reasoningEffort === "none"}
    className="dsh-st-model-option"
    onClick={() => selectEffort("none")}
  >
                <span className="dsh-st-model-option-copy"><span className="dsh-st-model-name">{modelT("effort.providerDefault")}</span></span>
                <span className="dsh-st-model-check">{reasoningEffort === "none" && <IconCheckOutline16 />}</span>
              </Button>}
            {reasoning.efforts.map((item) => <Button
    key={item.id}
    type="button"
    role="menuitemradio"
    aria-checked={effectiveEffort === item.id}
    className="dsh-st-model-option"
    onClick={() => selectEffort(item.id)}
  >
                <span className="dsh-st-model-option-copy">
                  <span className="dsh-st-model-name">{item.name}</span>
                  {item.description !== void 0 && <span className="dsh-st-model-description">{item.description}</span>}
                </span>
                <span className="dsh-st-model-check">{effectiveEffort === item.id && <IconCheckOutline16 />}</span>
              </Button>)}
            {reasoning.efforts.length === 0 && reasoning.defaultEffort !== void 0 && <div className="dsh-st-model-empty">{modelT("empty.efforts")}</div>}
          </>}
      </MenuPopup>
    </div>;
}
function TimeSelect({
  value,
  onChange,
  minTime
}) {
  const hour = value.slice(0, 2) || "09";
  const minute = value.slice(3, 5) || "00";
  const minHour = minTime?.slice(0, 2);
  const minMinute = minTime?.slice(3, 5);
  const hours = HOURS.filter((item) => minHour === void 0 || item >= minHour);
  const minutes = MINUTES.filter((item) => minHour === void 0 || hour > minHour || minMinute === void 0 || item >= minMinute);
  return <div className="dsh-st-time">
      <MenuSelect value={hour} options={hours.map((item) => ({ value: item, label: item }))} onChange={(next) => onChange(`${next}:${minute}`)} />
      <span className="dsh-st-time-sep">:</span>
      <MenuSelect value={minute} options={minutes.map((item) => ({ value: item, label: item }))} onChange={(next) => onChange(`${hour}:${next}`)} />
    </div>;
}
function localDateValue(now) {
  const offset = now.getTimezoneOffset() * 6e4;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}
function localTimeValue(now) {
  const offset = now.getTimezoneOffset() * 6e4;
  return new Date(now.getTime() - offset).toISOString().slice(11, 16);
}
function clampOnceAt(value) {
  const selected = new Date(value);
  const now = /* @__PURE__ */ new Date();
  if (!Number.isFinite(selected.getTime()) || selected.getTime() > now.getTime()) return value;
  const next = new Date(now.getTime() + 6e4);
  next.setSeconds(0, 0);
  const offset = next.getTimezoneOffset() * 6e4;
  return new Date(next.getTime() - offset).toISOString().slice(0, 16);
}
export {
  CreateModal
};
