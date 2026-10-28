import { useState } from "react";
import { numberSuggestion, type NumberingOption } from "@erp/shared";

/** Mantiene la sugerencia automática hasta que el usuario edita alguna de sus partes. */
export function useVoucherNumber(
  comprobante: string,
  numeradores: readonly NumberingOption[],
  caja?: { codigo: string | null; apertura: string | null },
) {
  const context = JSON.stringify([comprobante, caja?.apertura ?? null]);
  const [draft, setDraft] = useState<{ context: string; value: string | null }>(
    { context, value: null },
  );
  // Cambiar comprobante o jornada vuelve a la sugerencia; un refresco de opciones
  // conserva un número que el usuario ya editó.
  if (draft.context !== context) setDraft({ context, value: null });
  const edited = draft.context === context ? draft.value : null;
  const suggestion = numberSuggestion(
    comprobante,
    numeradores,
    caja?.codigo,
    Boolean(caja),
  );
  return {
    ...suggestion,
    number: edited ?? suggestion.number,
    automatic: suggestion.automatic && edited === null,
    onValueChange: (value: string) => setDraft({ context, value }),
  };
}
