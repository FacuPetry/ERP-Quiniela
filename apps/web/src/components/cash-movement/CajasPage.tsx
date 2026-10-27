import { useState } from "react";
import type { MasterDefinition, SessionResponse } from "@erp/shared";
import { MasterPage } from "../masters/MasterPage";
import { CashBoxes } from "./CashActions";
import { useActiveCash } from "./ActiveCash";
import "./cash-movement.css";

export function CajasPage({
  master,
  session,
  onExpired,
}: {
  master: MasterDefinition;
  session: SessionResponse;
  onExpired: () => void;
}) {
  const [managing, setManaging] = useState(false);
  const { selected } = useActiveCash();
  return (
    <>
      <MasterPage
        master={master}
        session={session}
        onExpired={onExpired}
        endActions={
          session.usuario.rol.codigo === "ADMIN"
            ? [
                {
                  key: "boxes",
                  label: "Administrar cajas",
                  icon: "box",
                  showLabel: true,
                  onClick: () => setManaging(true),
                },
              ]
            : []
        }
        listNotice={
          <p className="cash-selection" role="status">
            {selected
              ? `Caja seleccionada: ${selected.CajaNombre}`
              : session.usuario.rol.codigo === "ADMIN"
                ? "No hay una caja seleccionada. Abrí Administrar cajas para abrir o seleccionar una caja."
                : "Consultá las cajas del negocio."}
          </p>
        }
      />
      {managing && (
        <CashBoxes
          csrf={session.csrfToken}
          onClose={() => setManaging(false)}
          onExpired={onExpired}
        />
      )}
    </>
  );
}
