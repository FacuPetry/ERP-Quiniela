import { useCallback, useEffect, useRef, useState } from "react";
import type {
  CashDetail,
  CashList,
  CashRecord,
  SessionResponse,
} from "@erp/shared";
import { cashDetail, cashList } from "../../services/cash-movement";
import { ApiRequestError } from "../../services/http";
import { ActionToolbar } from "../ui/ActionToolbar";
import { DataTable } from "../ui/DataTable";
import { Pagination } from "../ui/Pagination";
import { FilterDialog, type FilterField } from "../ui/FilterDialog";
import { initialListFilters } from "../ui/filter-defaults";
import { RecordProperties, type PropertyField } from "../ui/RecordProperties";
import { CashForm } from "./CashForm";
import { CashBoxes, ReverseCash } from "./CashActions";
import { useActiveCash } from "./ActiveCash";
import { amount, message } from "./format";
import "./cash-movement.css";
const defaults = { q: "", Estado: "TODOS", Desde: "", Hasta: "" };
const filtersConfig: FilterField[] = [
  { key: "q", label: "Búsqueda general", kind: "text" },
  {
    key: "Estado",
    label: "Estado",
    kind: "select",
    options: [
      { value: "TODOS", label: "Todos" },
      { value: "CONFIRMADO", label: "Confirmados" },
      { value: "REVERTIDO", label: "Revertidos" },
    ],
  },
  { key: "Desde", label: "Fecha desde", kind: "date" },
  { key: "Hasta", label: "Fecha hasta", kind: "date" },
];
const properties: PropertyField<CashDetail>[] = [
  {
    key: "comprobante",
    label: "Comprobante",
    render: (d) => d.registro.ComprobanteDescripcion,
  },
  {
    key: "numero",
    label: "Número",
    render: (d) => d.registro.NumeroComprobanteTexto,
  },
  {
    key: "cliente",
    label: "Cliente",
    render: (d) => d.registro.Cliente + " - " + d.registro.ClienteNombre,
  },
  { key: "fecha", label: "Fecha", render: (d) => d.registro.FechaOrigen },
  { key: "caja", label: "Caja", render: (d) => d.registro.CajaNombre },
  {
    key: "total",
    label: "Total",
    render: (d) => amount(d.registro.ImporteTotal),
  },
  {
    key: "cash",
    label: "Efectivo",
    render: (d) => amount(d.registro.ImporteEfectivo),
  },
  {
    key: "advance",
    label: "Importe inicial a cuenta",
    render: (d) => amount(d.registro.ImporteACuenta),
  },
  {
    key: "available",
    label: "Disponible a cuenta",
    render: (d) => amount(d.registro.DisponibleACuenta),
  },
  {
    key: "state",
    label: "Estado",
    render: (d) =>
      d.registro.Estado === "REVERTIDO"
        ? "Revertido"
        : d.registro.CajaMovimientoOrigen
          ? "Reversión confirmada"
          : "Confirmado",
  },
  {
    key: "note",
    label: "Observaciones",
    render: (d) => d.registro.Observacion,
  },
  {
    key: "values",
    label: "Valores",
    render: (d) =>
      d.valores
        .map(
          (v) =>
            `${v.Tipo === "TRANSFERENCIA" ? "Transferencia" : v.Tipo === "PROPIO" ? "Cheque propio" : "Cheque de terceros"} · ${v.CuentaNombre ?? v.BancoNombre} · ${v.Numero} · ${amount(v.Importe)}`,
        )
        .join("\n"),
  },
];
function Properties({
  id,
  onClose,
  onExpired,
}: {
  id: string;
  onClose: () => void;
  onExpired: () => void;
}) {
  const load = useCallback(
    (signal: AbortSignal) => cashDetail(id, signal),
    [id],
  );
  return (
    <RecordProperties
      title="Propiedades · Cobros y pagos"
      loadRecord={load}
      fields={properties}
      onClose={onClose}
      onExpired={onExpired}
    />
  );
}
export function CashPage({
  session,
  onExpired,
}: {
  session: SessionResponse;
  onExpired: () => void;
}) {
  const [filters, setFilters] = useState<Record<string, string>>(() =>
      initialListFilters(defaults, ["Desde", "Hasta"], "Estado"),
    ),
    [page, setPage] = useState(1),
    [requested, setRequested] = useState(false),
    [revision, setRevision] = useState(0),
    [data, setData] = useState<CashList | null>(null),
    [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [selected, setSelected] = useState<string | null>(null),
    [view, setView] = useState<{ detail?: CashDetail } | null>(null),
    [filtering, setFiltering] = useState(false),
    [managingBoxes, setManagingBoxes] = useState(false),
    [reverse, setReverse] = useState<CashDetail | null>(null),
    [property, setProperty] = useState<string | null>(null);
  const handler = useRef(onExpired),
    mounted = useRef(true),
    opening = useRef(false);
  handler.current = onExpired;
  const expired = useCallback(() => handler.current(), []);
  const canWrite = session.usuario.rol.codigo === "ADMIN";
  const { selected: activeBox } = useActiveCash();
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (!requested) return;
    const request = new AbortController();
    setLoading(true);
    setError("");
    void cashList(
      Object.fromEntries(
        Object.entries({ ...filters, pagina: String(page) }).filter(
          ([, v]) => v,
        ),
      ),
      request.signal,
    )
      .then((d) => {
        if (request.signal.aborted) return;
        if (page > 1 && !d.registros.length) {
          setPage(Math.max(1, Math.ceil(d.total / d.limite)));
          return;
        }
        setData(d);
        setSelected((s) =>
          d.registros.some((r) => r.IDTabla === s) ? s : null,
        );
      })
      .catch((e) => {
        if (request.signal.aborted) return;
        setData(null);
        if (e instanceof ApiRequestError && e.status === 401) expired();
        else setError(message(e));
      })
      .finally(() => {
        if (!request.signal.aborted) setLoading(false);
      });
    return () => request.abort();
  }, [requested, filters, page, revision, expired]);
  function refresh() {
    setRequested(true);
    setRevision((n) => n + 1);
  }
  async function open(row: CashRecord | undefined, action = "view") {
    if (!row || opening.current || loading) return;
    opening.current = true;
    setBusy(true);
    setError("");
    try {
      const d = await cashDetail(row.IDTabla);
      if (!mounted.current) return;
      if (action === "reverse") setReverse(d);
      else setView({ detail: d });
    } catch (e) {
      if (mounted.current) {
        if (e instanceof ApiRequestError && e.status === 401) expired();
        else setError(message(e));
      }
    } finally {
      opening.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  function saved() {
    setView(null);
    setReverse(null);
    if (requested) setRevision((n) => n + 1);
  }
  const row = data?.registros.find((r) => r.IDTabla === selected);
  const reversal = reverse && (
    <ReverseCash
      detail={reverse}
      csrf={session.csrfToken}
      onClose={() => setReverse(null)}
      onSaved={saved}
      onExpired={expired}
    />
  );
  if (view)
    return (
      <>
        <CashForm
          {...(view.detail ? { detail: view.detail } : {})}
          csrf={session.csrfToken}
          canWrite={canWrite}
          onClose={() => setView(null)}
          onSaved={saved}
          onExpired={expired}
          {...(canWrite ? { onReverse: setReverse } : {})}
          onRelated={(id) => {
            void open({ IDTabla: id } as CashRecord);
          }}
        />
        {error && (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}
        {reversal}
      </>
    );
  return (
    <>
      <section className="panel master-panel" aria-label="Cobros y pagos">
        <div className="master-toolbar">
          <div>
            <h2>Cobros y pagos</h2>
            <p className="muted small">
              Consultá movimientos o registrá una nueva operación.
            </p>
          </div>
          <ActionToolbar
            labels={{
              add: "Agregar cobro o pago",
              edit: "Consultar cobro o pago",
              remove: "Revertir movimiento",
              filter: "Filtrar",
            }}
            selected={Boolean(row)}
            addDisabled={!activeBox}
            endActions={
              canWrite
                ? [
                    {
                      key: "cajas",
                      label: activeBox?.CajaNombre ?? "Administrar caja",
                      icon: "box",
                      showLabel: true,
                      onClick: () => setManagingBoxes(true),
                    },
                  ]
                : []
            }
            busy={busy}
            readOnly={!canWrite}
            editIcon="eye"
            removeIcon="close"
            removeDisabled={
              row?.Estado !== "CONFIRMADO" || Boolean(row.CajaMovimientoOrigen)
            }
            filtersActive={Object.entries(filters).some(
              ([k, v]) => v !== defaults[k as keyof typeof defaults],
            )}
            onAdd={() => setView({})}
            onEdit={() => {
              void open(row);
            }}
            onDelete={() => {
              void open(row, "reverse");
            }}
            onFilter={() => setFiltering(true)}
            onRefresh={refresh}
            refreshing={loading}
            onProperties={() => {
              if (row) setProperty(row.IDTabla);
            }}
          />
        </div>
        {error && (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}
        <DataTable
          caption="Cobros y pagos"
          rows={error ? [] : (data?.registros ?? [])}
          rowKey={(r) => r.IDTabla}
          rowLabel={(r) => r.NumeroComprobanteTexto + " · " + r.ClienteNombre}
          loading={loading}
          selectedKey={selected}
          onSelectionChange={setSelected}
          onRowActivate={(r) => {
            void open(r);
          }}
          selectionDisabled={busy}
          columns={[
            { key: "date", label: "Fecha", render: (r) => r.FechaOrigen },
            {
              key: "voucher",
              label: "Comprobante",
              render: (r) => r.ComprobanteDescripcion,
            },
            {
              key: "number",
              label: "Número",
              render: (r) => r.NumeroComprobanteTexto,
            },
            { key: "client", label: "Cliente", render: (r) => r.ClienteNombre },
            {
              key: "sense",
              label: "Operación",
              render: (r) => (r.Sentido === "INGRESO" ? "Ingreso" : "Egreso"),
            },
            {
              key: "amount",
              label: "Total",
              render: (r) => amount(r.ImporteTotal),
            },
            {
              key: "state",
              label: "Estado",
              render: (r) =>
                r.Estado === "REVERTIDO"
                  ? "Revertido"
                  : r.CajaMovimientoOrigen
                    ? "Reversión"
                    : "Confirmado",
            },
          ]}
        />
        {requested && data && (
          <Pagination
            page={page}
            total={data.total}
            limit={data.limite}
            loading={loading || busy}
            onChange={setPage}
          />
        )}
      </section>
      {filtering && (
        <FilterDialog
          fields={filtersConfig}
          values={filters}
          defaults={defaults}
          onExpired={expired}
          onClose={() => setFiltering(false)}
          onApply={(v) => {
            setFilters(v);
            setPage(1);
            setSelected(null);
            refresh();
            setFiltering(false);
          }}
        />
      )}
      {managingBoxes && (
        <CashBoxes
          csrf={session.csrfToken}
          onClose={() => setManagingBoxes(false)}
          onExpired={expired}
        />
      )}
      {property && (
        <Properties
          id={property}
          onClose={() => setProperty(null)}
          onExpired={expired}
        />
      )}{" "}
      {reversal}
    </>
  );
}
