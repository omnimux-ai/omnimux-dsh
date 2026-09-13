import { useEffect } from "react";
import { Button } from "./controls.jsx";
function DeleteConfirmation({
  target,
  t,
  busy,
  onCancel,
  onConfirm
}) {
  useEffect(() => {
    if (target === void 0 || busy) return;
    const onKeyDown = (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onCancel();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [busy, onCancel, target]);
  if (target === void 0) return null;
  return <div className="dsh-st-mask" onMouseDown={(event) => event.stopPropagation()}>
      <section
    className="dsh-st-confirm-modal"
    role="alertdialog"
    aria-modal="true"
    aria-labelledby="dsh-st-confirm-delete-title"
    aria-describedby="dsh-st-confirm-delete-description"
    onMouseDown={(event) => event.stopPropagation()}
  >
        <h2 id="dsh-st-confirm-delete-title">{t("card.confirmDelete")}</h2>
        <p className="dsh-st-confirm-target">{target.name}</p>
        <p id="dsh-st-confirm-delete-description">{t("card.confirmDeleteHint")}</p>
        <div className="dsh-st-modal-actions">
          <Button type="button" className="dsh-st-btn" autoFocus disabled={busy} onClick={onCancel}>{t("card.cancel")}</Button>
          <Button type="button" className="dsh-st-btn dsh-st-btn--danger" disabled={busy} onClick={onConfirm}>{t("card.confirm")}</Button>
        </div>
      </section>
    </div>;
}
export {
  DeleteConfirmation
};
