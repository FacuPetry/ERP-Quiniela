import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { Modal } from "./Modal";
import { FormToolbarActions } from "./FormToolbarActions";
import "./offcanvas.css";

export interface OffCanvasProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  side?: "left" | "right";
  /** sm conserva el ancho de Propiedades; md y lg ofrecen más espacio. */
  size?: "sm" | "md" | "lg";
  footer?: ReactNode;
  /** Reservado para una confirmación en curso; cargar datos no impide cerrar. */
  busy?: boolean;
  closeOnBackdrop?: boolean;
}

/** Contenedor visual: no conoce entidades, consultas, selección ni operaciones financieras. */
export function OffCanvas({
  open,
  title,
  onClose,
  children,
  side = "right",
  size = "sm",
  footer,
  busy = false,
  closeOnBackdrop = true,
}: OffCanvasProps) {
  if (!open) return null;
  return createPortal(
    <Modal
      title={title}
      onClose={onClose}
      busy={busy}
      className={`offcanvas offcanvas-${side} offcanvas-${size}`}
      lockScroll
      restoreFocus
      closeOnBackdrop={closeOnBackdrop}
    >
      <div className="offcanvas-body">{children}</div>
      {footer !== null && (
        <div className="offcanvas-footer">
          {footer === undefined ? (
            <FormToolbarActions
              closeAction={
                <button
                  type="button"
                  className="button secondary"
                  disabled={busy}
                  onClick={onClose}
                >
                  Cerrar
                </button>
              }
            >
              {null}
            </FormToolbarActions>
          ) : (
            footer
          )}
        </div>
      )}
    </Modal>,
    document.body,
  );
}
