import type { ReactNode } from "react";
import { Modal } from "@deepseek-ai/dsh-client-ui-primitives";

import { Button } from "../button/Button.tsx";
import type { ButtonVariant } from "../button/Button.tsx";
import { cssClass } from "../internal/cssClass.ts";
import { cx } from "../internal/cx.ts";
import css from "./Dialog.module.css";

export type DialogSize = "sm" | "md" | "lg";

export interface ModalDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
  size?: DialogSize;
  closeLabel?: string;
  className?: string;
  contentClassName?: string;
}

const SIZE_CLASS: Record<DialogSize, string | undefined> = {
  sm: cssClass(css.sm, "sm"),
  md: undefined,
  lg: cssClass(css.lg, "lg"),
};

/**
 * Official Modal with kit geometry: 16px radius, scrollable body, right-aligned
 * action footer. Header + close button stay with the primitive.
 */
export function ModalDialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
  closeLabel = "Close",
  className,
  contentClassName,
}: ModalDialogProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      closeLabel={closeLabel}
      className={cx(css.dialog, SIZE_CLASS[size], className)}
      contentClassName={cx(css.body, contentClassName)}
      {...(description !== undefined ? { description } : {})}
      {...(footer !== undefined ? { footer } : {})}
    >
      {children}
    </Modal>
  );
}

export interface ConfirmModalProps extends Omit<ModalDialogProps, "footer" | "children"> {
  message?: ReactNode;
  children?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmVariant?: ButtonVariant;
  confirmLoading?: boolean;
  onConfirm: () => void;
}

/** Two-button confirm dialog. Destructive flows should pass `confirmVariant="danger"`. */
export function ConfirmModal({
  message,
  children,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  confirmVariant = "primary",
  confirmLoading = false,
  onConfirm,
  onClose,
  size = "sm",
  ...rest
}: ConfirmModalProps) {
  return (
    <ModalDialog
      {...rest}
      size={size}
      onClose={onClose}
      footer={(
        <div className={css.footer}>
          <Button variant="outline" onClick={onClose} disabled={confirmLoading}>
            {cancelLabel}
          </Button>
          <Button variant={confirmVariant} loading={confirmLoading} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      )}
    >
      {message != null ? <p className={css.message}>{message}</p> : children}
    </ModalDialog>
  );
}
