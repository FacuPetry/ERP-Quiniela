import { useEffect, useRef, useState } from "react";
import type { CashOptions, CashDetail, CashOpening } from "@erp/shared";
import { OffCanvas } from "../ui/OffCanvas";
import { DataTable } from "../ui/DataTable";
import { FormToolbarActions } from "../ui/FormToolbarActions";
import { DropDown, AmountBox, TextArea, NumeroComprobante } from "../controls";
import {
  cashOptions,
  cashOpen,
  cashClose,
  cashReverse,
} from "../../services/cash-movement";
import { ApiRequestError } from "../../services/http";
import { useActiveCash } from "./ActiveCash";
import { TextBox } from "../controls";
import { amount, message } from "./format";
function useCashOptions(onExpired: () => void) {
  const [data, setData] = useState<CashOptions | null>(null),
    [error, setError] = useState(""),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    const req = new AbortController();
    void cashOptions(req.signal)
      .then((d) => {
        if (!req.signal.aborted) {
          setData(d);
          setError("");
        }
      })
      .catch((e) => {
        if (req.signal.aborted) return;
        if (e instanceof ApiRequestError && e.status === 401) onExpired();
        else setError(message(e));
      });
    return () => req.abort();
  }, [onExpired, revision]);
  useEffect(() => {
    const refresh = () => setRevision((n) => n + 1);
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, []);
  return { data, error, setError, reload: () => setRevision((n) => n + 1) };
}
export function CashBoxes({
  csrf,
  onClose,
  onChanged,
  onExpired,
}: {
  csrf: string;
  onClose: () => void;
  onChanged?: () => void;
  onExpired: () => void;
}) {
  const { data, error, setError, reload } = useCashOptions(onExpired);
  const { selected, select, validate } = useActiveCash();
  useEffect(() => {
    if (data)
      validate(
        data.aperturas.filter((o) =>
          data.cajas.some((c) => c.Codigo === o.Caja),
        ),
      );
  }, [data, validate]);
  const [box, setBox] = useState(""),
    [initial, setInitial] = useState("0.00"),
    [closing, setClosing] = useState<CashOpening | null>(null),
    [counted, setCounted] = useState("0.00"),
    [note, setNote] = useState(""),
    [busy, setBusy] = useState(false);
  const retry = useRef({ body: "", key: "" });
  async function save() {
    const input = closing
      ? { SaldoContado: counted, Observacion: note || null }
      : { Caja: box, SaldoInicial: initial };
    const body = JSON.stringify({ closing: closing?.IDTabla, input });
    if (retry.current.body !== body)
      retry.current = { body, key: crypto.randomUUID() };
    setBusy(true);
    setError("");
    try {
      if (closing) {
        await cashClose(
          closing.IDTabla,
          input as { SaldoContado: string; Observacion: string | null },
          csrf,
          retry.current.key,
        );
        if (selected?.IDTabla === closing.IDTabla) select(null);
      } else
        await cashOpen(
          input as { Caja: string; SaldoInicial: string },
          csrf,
          retry.current.key,
        );
      onChanged?.();
      setClosing(null);
      setNote("");
      setBox("");
      reload();
    } catch (e) {
      if (e instanceof ApiRequestError && e.status === 401) onExpired();
      else {
        setError(message(e));
      }
    } finally {
      setBusy(false);
    }
  }
  return (
    <OffCanvas
      open
      title="Administrar cajas"
      size="lg"
      busy={busy}
      onClose={onClose}
    >
      {error && (
        <p className="notice error" role="alert">
          {error}{" "}
          <button type="button" onClick={reload}>
            Actualizar opciones
          </button>
        </p>
      )}
      {!data ? (
        <p role="status">Cargando cajas…</p>
      ) : (
        <>
          <p role="status">
            {selected
              ? `Caja seleccionada: ${selected.CajaNombre}`
              : "Seleccioná una caja abierta para registrar movimientos."}
          </p>
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={reload}
          >
            Actualizar cajas
          </button>
          <DataTable
            caption="Cajas abiertas"
            rows={data.aperturas}
            rowKey={(r) => r.IDTabla}
            loading={busy}
            selectedKey={selected?.IDTabla ?? null}
            onSelectionChange={(id) => {
              const opening = data.aperturas.find((o) => o.IDTabla === id);
              if (opening && data.cajas.some((c) => c.Codigo === opening.Caja))
                select(opening);
            }}
            rowLabel={(o) => o.CajaNombre}
            onRowActivate={(o) => {
              if (data.cajas.some((c) => c.Codigo === o.Caja)) select(o);
            }}
            columns={[
              { key: "box", label: "Caja", render: (r) => r.CajaNombre },
              {
                key: "date",
                label: "Apertura",
                render: (r) => r.AperturaEn.slice(0, 10),
              },
              {
                key: "initial",
                label: "Inicial",
                render: (r) => amount(r.SaldoInicial),
              },
              {
                key: "actual",
                label: "Efectivo actual",
                render: (r) => amount(r.SaldoActual),
              },
            ]}
            actions={(r) => (
              <>
                <button
                  type="button"
                  className="button secondary"
                  disabled={
                    busy ||
                    selected?.IDTabla === r.IDTabla ||
                    !data.cajas.some((c) => c.Codigo === r.Caja)
                  }
                  onClick={() => select(r)}
                >
                  {selected?.IDTabla === r.IDTabla
                    ? "Seleccionada"
                    : "Usar caja"}
                </button>
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() => {
                    setClosing(r);
                    setCounted(r.SaldoActual);
                    setNote("");
                  }}
                >
                  Preparar cierre
                </button>
              </>
            )}
          />
          <h3>{closing ? "Cerrar " + closing.CajaNombre : "Abrir caja"}</h3>
          <div className="cash-value-fields">
            {closing ? (
              <>
                <AmountBox
                  label="Saldo teórico"
                  value={closing.SaldoActual}
                  readOnly
                  onValueChange={() => {}}
                />
                <AmountBox
                  label="Efectivo contado"
                  value={counted}
                  onValueChange={setCounted}
                  disabled={busy}
                />
                <TextArea
                  label="Observación de cierre"
                  value={note}
                  onValueChange={setNote}
                  disabled={busy}
                  hint="Si el contado difiere del teórico, la observación es obligatoria. La diferencia se registra sin crear ajustes automáticos."
                />
              </>
            ) : (
              <>
                <DropDown
                  label="Caja"
                  value={box}
                  onValueChange={setBox}
                  disabled={busy}
                  options={[
                    { value: "", label: "Seleccioná una caja" },
                    ...data.cajas
                      .filter(
                        (c) => !data.aperturas.some((o) => o.Caja === c.Codigo),
                      )
                      .map((c) => ({ value: c.Codigo, label: c.Nombre })),
                  ]}
                />
                <AmountBox
                  label="Saldo inicial"
                  value={initial}
                  onValueChange={setInitial}
                  disabled={busy}
                />
              </>
            )}
            <FormToolbarActions
              closeAction={
                closing ? (
                  <button
                    className="button secondary"
                    disabled={busy}
                    onClick={() => setClosing(null)}
                  >
                    Cancelar cierre
                  </button>
                ) : null
              }
            >
              <button
                className="button primary"
                disabled={busy || (!closing && !box)}
                onClick={() => {
                  void save();
                }}
              >
                {busy
                  ? "Guardando…"
                  : closing
                    ? "Confirmar cierre"
                    : "Abrir caja"}
              </button>
            </FormToolbarActions>
          </div>
        </>
      )}
    </OffCanvas>
  );
}
export function ReverseCash({
  detail,
  csrf,
  onClose,
  onSaved,
  onExpired,
}: {
  detail: CashDetail;
  csrf: string;
  onClose: () => void;
  onSaved: () => void;
  onExpired: () => void;
}) {
  const { data, error, setError, reload } = useCashOptions(onExpired),
    [code, setCode] = useState(""),
    [number, setNumber] = useState("0"),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false);
  const retry = useRef({ body: "", key: "" });
  const { selected, validate } = useActiveCash();
  useEffect(() => {
    if (data)
      validate(
        data.aperturas.filter((o) =>
          data.cajas.some((c) => c.Codigo === o.Caja),
        ),
      );
  }, [data, validate]);
  const box = data?.aperturas.some((o) => o.IDTabla === selected?.IDTabla)
    ? selected!.IDTabla
    : "";
  const sense = detail.registro.Sentido === "INGRESO" ? "EGRESO" : "INGRESO";
  const compatible =
    data?.comprobantes.filter(
      (c) =>
        c.Naturaleza === "DEUDA" &&
        c.Cuenta === detail.registro.Cuenta &&
        c.SentidoFondos === sense,
    ) ?? [];
  async function save() {
    const input = {
      Comprobante: code,
      NumeroComprobante: number,
      CajaSaldo: box,
      Motivo: reason,
    };
    const body = JSON.stringify(input);
    if (retry.current.body !== body)
      retry.current = { body, key: crypto.randomUUID() };
    setBusy(true);
    setError("");
    try {
      await cashReverse(detail, input, csrf, retry.current.key);
      onSaved();
    } catch (e) {
      if (e instanceof ApiRequestError && e.status === 401) onExpired();
      else {
        setError(message(e));
      }
    } finally {
      setBusy(false);
    }
  }
  return (
    <OffCanvas
      open
      title="Revertir cobro o pago"
      busy={busy}
      onClose={onClose}
      footer={
        <FormToolbarActions
          closeAction={
            <button
              className="button secondary"
              disabled={busy}
              onClick={onClose}
            >
              Cancelar
            </button>
          }
        >
          <button
            className="button danger"
            disabled={busy || !code || !box || !reason.trim()}
            onClick={() => {
              void save();
            }}
          >
            Confirmar reversión
          </button>
        </FormToolbarActions>
      }
    >
      <p>
        Se registrará una operación contraria con fecha de hoy por{" "}
        {amount(detail.registro.ImporteTotal)}. El movimiento y su cierre
        anteriores se conservarán.
      </p>
      {error && (
        <p className="notice error" role="alert">
          {error} <button onClick={reload}>Actualizar opciones</button>
        </p>
      )}
      {data && (
        <div className="cash-value-fields">
          <DropDown
            label="Comprobante de reversión"
            value={code}
            onValueChange={(value) => {
              setCode(value);
              setNumber(
                data.numeradores.find((n) => n.Comprobante === value)
                  ?.ProximoNumero ?? "0",
              );
            }}
            disabled={busy}
            options={[
              { value: "", label: "Seleccioná un comprobante" },
              ...compatible.map((c) => ({
                value: c.Codigo,
                label: c.Descripcion,
              })),
            ]}
          />
          {!compatible.length && (
            <p className="notice">
              Se necesita un comprobante de Cobros y pagos con la misma cuenta,
              naturaleza Deuda y sentido de fondos contrario.
            </p>
          )}
          <NumeroComprobante
            label="Número de comprobante"
            value={number}
            onValueChange={setNumber}
            disabled={busy}
          />
          <TextBox
            label="Caja seleccionada"
            value={
              box
                ? selected!.CajaNombre
                : "Seleccioná una caja abierta desde Cajas."
            }
            readOnly
            onValueChange={() => {}}
          />
          <TextArea
            label="Motivo"
            required
            value={reason}
            onValueChange={setReason}
            maxLength={500}
            disabled={busy}
          />
        </div>
      )}
    </OffCanvas>
  );
}
