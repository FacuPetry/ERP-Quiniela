import { useEffect, useId, useRef, type ReactNode } from "react";
import { Icon } from "../Icon";
import { lockDocumentScroll } from "./document-scroll-lock";

export function Modal({
  title,
  onClose,
  busy,
  children,
  className = "",
  lockScroll = false,
  closeOnBackdrop = false,
  restoreFocus = false,
}: {
  title: string;
  onClose: () => void;
  busy: boolean;
  children: ReactNode;
  className?: string;
  lockScroll?: boolean;
  closeOnBackdrop?: boolean;
  restoreFocus?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const backdropPress = useRef(false);
  useEffect(() => {
    const element = dialog.current!;
    const opener = document.activeElement;
    element.showModal();
    const unlock = lockScroll ? lockDocumentScroll() : undefined;
    return () => {
      element.close();
      unlock?.();
      if (restoreFocus && opener instanceof HTMLElement && opener.isConnected)
        opener.focus({ preventScroll: true });
    };
  }, [lockScroll, restoreFocus]);
  return (
    <dialog
      ref={dialog}
      className={`modal ${className}`}
      onPointerDown={(event) => {
        const bounds = event.currentTarget.getBoundingClientRect();
        backdropPress.current =
          event.target === event.currentTarget &&
          (event.clientX < bounds.left ||
            event.clientX > bounds.right ||
            event.clientY < bounds.top ||
            event.clientY > bounds.bottom);
      }}
      onClick={(event) => {
        if (
          !closeOnBackdrop ||
          busy ||
          !backdropPress.current ||
          event.target !== event.currentTarget
        )
          return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < bounds.left ||
          event.clientX > bounds.right ||
          event.clientY < bounds.top ||
          event.clientY > bounds.bottom
        )
          onClose();
      }}
      aria-labelledby={titleId}
      aria-busy={busy}
      onCancel={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!busy) onClose();
      }}
    >
      <div className="modal-heading">
        <h2 id={titleId}>{title}</h2>
        <button
          type="button"
          className="icon-button"
          aria-label="Cerrar ventana"
          disabled={busy}
          onClick={onClose}
        >
          <Icon name="close" />
        </button>
      </div>
      {children}
    </dialog>
  );
}
