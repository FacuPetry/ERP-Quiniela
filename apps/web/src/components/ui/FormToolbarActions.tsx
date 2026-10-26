import type { ReactNode } from "react";

/** El módulo decide cuándo ofrecer Anular; esta base solo presenta la acción. */
export function FormToolbarActions({
  children,
  annulAction,
}: {
  children: ReactNode;
  annulAction?: { onClick: () => void; disabled?: boolean };
}) {
  return (
    <div className="form-toolbar-actions">
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
  );
}
