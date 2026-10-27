import { useEffect, useState } from "react";
import {
  moneyUnits,
  moneyText,
  type PendingMovement,
  type AllocationDetail,
} from "@erp/shared";
import { OffCanvas } from "../ui/OffCanvas";
import { DataTable } from "../ui/DataTable";
import { Pagination } from "../ui/Pagination";
import { FormToolbarActions } from "../ui/FormToolbarActions";
import { AmountBox, TextBox } from "../controls";
import { pendingList } from "../../services/cash-movement";
import { ApiRequestError } from "../../services/http";
import { amount, message } from "./format";
export function AllocationPicker({
  client,
  voucher,
  initial,
  onConfirm,
  onClose,
  onExpired,
}: {
  client: string;
  voucher: string;
  initial: AllocationDetail[];
  onConfirm: (rows: AllocationDetail[]) => void;
  onClose: () => void;
  onExpired: () => void;
}) {
  const [selected, setSelected] = useState<Record<string, AllocationDetail>>(
      {},
    ),
    [rows, setRows] = useState<PendingMovement[]>([]),
    [total, setTotal] = useState(0),
    [page, setPage] = useState(1),
    [q, setQ] = useState(""),
    [search, setSearch] = useState(""),
    [revision, setRevision] = useState(0),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  useEffect(() => {
    const request = new AbortController();
    setLoading(true);
    setError("");
    void pendingList(
      {
        Cliente: client,
        Comprobante: voucher,
        q: search,
        pagina: String(page),
        Excluir: initial.map((a) => a.CuentaCorriente).join(","),
      },
      request.signal,
    )
      .then((data) => {
        if (request.signal.aborted) return;
        if (page > 1 && !data.registros.length) {
          setPage(Math.max(1, Math.ceil(data.total / data.limite)));
          return;
        }
        setRows(data.registros);
        setTotal(data.total);
        setSelected((current) => {
          const next = { ...current };
          for (const row of data.registros)
            if (next[row.IDTabla])
              next[row.IDTabla] = {
                ...next[row.IDTabla]!,
                Pendiente: row.Pendiente,
              };
          return next;
        });
      })
      .catch((e) => {
        if (request.signal.aborted) return;
        if (e instanceof ApiRequestError && e.status === 401) onExpired();
        else setError(message(e));
      })
      .finally(() => {
        if (!request.signal.aborted) setLoading(false);
      });
    return () => request.abort();
  }, [client, voucher, initial, search, page, revision, onExpired]);
  function choose(keys: string[]) {
    setSelected((current) => {
      const next = Object.fromEntries(
        Object.entries(current).filter(([key]) => keys.includes(key)),
      );
      for (const key of keys) {
        if (next[key]) continue;
        const row = rows.find((r) => r.IDTabla === key);
        if (row)
          next[key] = {
            CuentaCorriente: key,
            Importe: row.Pendiente,
            ImporteOriginal: row.Importe,
            Pendiente: row.Pendiente,
            NumeroComprobanteTexto: row.NumeroComprobanteTexto,
            ComprobanteDescripcion: row.ComprobanteDescripcion,
            FechaOrigen: row.FechaOrigen,
          };
      }
      return next;
    });
  }
  function confirm() {
    try {
      if (initial.length + Object.keys(selected).length > 100)
        throw new Error("Se permiten hasta 100 afectaciones por movimiento.");
      for (const a of Object.values(selected))
        if (
          moneyUnits(a.Importe) <= 0n ||
          moneyUnits(a.Importe) > moneyUnits(a.Pendiente)
        )
          throw new Error(
            "El importe a afectar debe ser mayor que cero y no superar el pendiente.",
          );
      onConfirm(Object.values(selected));
    } catch (e) {
      setError(message(e));
    }
  }
  return (
    <OffCanvas
      open
      size="lg"
      title="Pendientes de Cuenta corriente"
      onClose={onClose}
      footer={
        <FormToolbarActions
          closeAction={
            <button className="button secondary" onClick={onClose}>
              Cancelar
            </button>
          }
        >
          <button
            className="button primary"
            disabled={loading}
            onClick={confirm}
          >
            Confirmar afectaciones
          </button>
        </FormToolbarActions>
      }
    >
      <form
        className="cash-search"
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
          setSearch(q);
          setRevision((n) => n + 1);
        }}
      >
        <TextBox label="Búsqueda" value={q} onValueChange={setQ} />
        <button className="button secondary">Buscar</button>
      </form>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      <DataTable
        caption="Movimientos pendientes"
        rows={rows}
        rowKey={(r) => r.IDTabla}
        rowLabel={(r) => r.NumeroComprobanteTexto}
        loading={loading}
        selectionMode="multiple"
        selectedKeys={Object.keys(selected)}
        onMultipleSelectionChange={choose}
        columns={[
          {
            key: "numero",
            label: "Comprobante",
            render: (r) => (
              <>
                {r.ComprobanteDescripcion}
                <br />
                {r.NumeroComprobanteTexto}
              </>
            ),
          },
          { key: "fecha", label: "Fecha", render: (r) => r.FechaOrigen },
          {
            key: "original",
            label: "Original",
            render: (r) => amount(r.Importe),
          },
          {
            key: "pendiente",
            label: "Pendiente",
            render: (r) => amount(r.Pendiente),
          },
          {
            key: "aplicar",
            label: "A afectar",
            render: (r) =>
              selected[r.IDTabla] ? (
                <AmountBox
                  label={
                    <span className="sr-only">{`Afectar ${r.NumeroComprobanteTexto}`}</span>
                  }
                  value={selected[r.IDTabla]!.Importe}
                  onValueChange={(value) =>
                    setSelected((s) => ({
                      ...s,
                      [r.IDTabla]: { ...s[r.IDTabla]!, Importe: value },
                    }))
                  }
                />
              ) : null,
          },
        ]}
      />
      <Pagination
        page={page}
        total={total}
        limit={20}
        loading={loading}
        onChange={setPage}
      />
      <p className="cash-total">
        Seleccionados: {Object.keys(selected).length} · Total:{" "}
        {amount(
          moneyText(
            Object.values(selected).reduce((s, a) => {
              try {
                return s + moneyUnits(a.Importe);
              } catch {
                return s;
              }
            }, 0n),
          ),
        )}
      </p>
    </OffCanvas>
  );
}
