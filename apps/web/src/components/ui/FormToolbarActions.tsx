import type { ReactNode } from "react";

/** Acciones dinámicas a la izquierda; Cerrar/Cancelar siempre en el extremo derecho. */
export function FormToolbarActions({
  children,
  closeAction,
  annulAction,
}: {
  children: ReactNode;
  closeAction: ReactNode;
  annulAction?: { onClick: () => void; disabled?: boolean };
}) {
  return (
    <div
      className="form-toolbar-actions"
      role="group"
      aria-label="Acciones del formulario"
    >
      <div className="form-toolbar-dynamic">
        {children}
        {annulAction && (
          <button
            type="button"
            className="button danger"
            disabled={annulAction.disabled}
            onClick={annulAction.onClick}
          >
            Anular
          </button>
        )}
      </div>
      <div className="form-toolbar-close">{closeAction}</div>
    </div>
  );
}
