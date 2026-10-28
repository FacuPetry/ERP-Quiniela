import { useListSorting } from "../ui/useListSorting";
import { displayDate } from "../controls/date-value";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  CashDetail,
  CashList,
  CashRecord,
  SessionResponse,
} from "@erp/shared";
import { cashServices, treasuryServices } from "../../services/cash-movement";
import { ApiRequestError } from "../../services/http";
import { ActionToolbar } from "../ui/ActionToolbar";
import { DataTable } from "../ui/DataTable";
import { Pagination } from "../ui/Pagination";
import { FilterDialog, type FilterField } from "../ui/FilterDialog";
import { initialListFilters } from "../ui/filter-defaults";
import { CashProperties } from "./CashProperties";
import { cashStateLabel, cashCorrection } from "@erp/shared";
import { TreasuryForm } from "../treasury/TreasuryForm";
import { CashForm } from "./CashForm";
import { CashBoxes, ReverseCash, AnnulCash } from "./CashActions";
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
      { value: "ANULADO", label: "Anulados" },
    ],
  },
  { key: "Desde", label: "Fecha desde", kind: "date" },
  { key: "Hasta", label: "Fecha hasta", kind: "date" },
];
export function CashPage({
  treasury = false,
  session,
  onExpired,
}: {
  treasury?: boolean;
  session: SessionResponse;
  onExpired: () => void;
}) {
  const services = treasury ? treasuryServices : cashServices;
  const title = treasury ? "Tesorería" : "Cobros y pagos";
  const Form = treasury ? TreasuryForm : CashForm;
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
    [annul, setAnnul] = useState<CashDetail | null>(null),
    [property, setProperty] = useState<string | null>(null);
  const sorting = useListSorting(setPage);
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
    void services
      .list(
        Object.fromEntries(
          Object.entries({
            ...filters,
            ...sorting.query,
            pagina: String(page),
          }).filter(([, v]) => v),
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
  }, [requested, filters, page, revision, expired, sorting.value, services]);
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
      const d = await services.detail(row.IDTabla);
      if (!mounted.current) return;
      if (action === "correct") correct(d);
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
  function correct(d: CashDetail) {
    const action = cashCorrection(d.registro, activeBox?.IDTabla ?? null);
    if (action === "anular") setAnnul(d);
    else if (action === "revertir") setReverse(d);
    else
      setError(
        "Seleccioná la apertura original si sigue abierta; para revertir una jornada cerrada necesitás otra caja abierta seleccionada.",
      );
  }
  function saved() {
    setView(null);
    setReverse(null);
    setAnnul(null);
    if (requested) setRevision((n) => n + 1);
  }
  const row = data?.registros.find((r) => r.IDTabla === selected);
  const reversal = (
    <>
      {annul && (
        <AnnulCash
          services={services}
          treasury={treasury}
          detail={annul}
          csrf={session.csrfToken}
          onClose={() => setAnnul(null)}
          onSaved={saved}
          onExpired={expired}
        />
      )}
      {reverse && (
        <ReverseCash
          services={services}
          treasury={treasury}
          detail={reverse}
          csrf={session.csrfToken}
          onClose={() => setReverse(null)}
          onSaved={saved}
          onExpired={expired}
        />
      )}
    </>
  );
  if (view)
    return (
      <>
        <Form
          key={view.detail?.registro.IDTabla ?? "new"}
          {...(view.detail ? { detail: view.detail } : {})}
          csrf={session.csrfToken}
          canWrite={canWrite}
          onClose={() => setView(null)}
          onSaved={saved}
          onExpired={expired}
          {...(canWrite ? { onCorrection: correct } : {})}
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
      <section className="panel master-panel" aria-label={title}>
        <div className="master-toolbar">
          <div>
            <h2>{title}</h2>
            <p className="muted small">
              Consultá movimientos o registrá una nueva operación.
            </p>
          </div>
          <ActionToolbar
            labels={{
              add: treasury
                ? "Agregar movimiento de Tesorería"
                : "Agregar cobro o pago",
              edit: treasury
                ? "Consultar movimiento de Tesorería"
                : "Consultar cobro o pago",
              remove:
                row?.JornadaEstado === "CERRADO"
                  ? "Revertir movimiento"
                  : "Anular movimiento",
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
              !row || !cashCorrection(row, activeBox?.IDTabla ?? null)
            }
            filtersActive={Object.entries(filters).some(
              ([k, v]) => v !== defaults[k as keyof typeof defaults],
            )}
            onAdd={() => setView({})}
            onEdit={() => {
              void open(row);
            }}
            onDelete={() => {
              void open(row, "correct");
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
          properties={false}
          sort={sorting.value}
          onSortChange={sorting.onChange}
          sortingDisabled={!requested}
          caption={title}
          rows={error ? [] : (data?.registros ?? [])}
          rowKey={(r) => r.IDTabla}
          rowLabel={(r) =>
            r.NumeroComprobanteTexto +
            " · " +
            (treasury ? r.ConceptoDescripcion : r.ClienteNombre)
          }
          loading={loading}
          selectedKey={selected}
          onSelectionChange={setSelected}
          onRowActivate={(r) => {
            void open(r);
          }}
          selectionDisabled={busy}
          columns={[
            {
              key: "date",
              sort: "FechaOrigen",
              label: "Fecha",
              render: (r) => displayDate(r.FechaOrigen),
            },
            {
              key: "voucher",
              sort: "Comprobante",
              label: "Comprobante",
              render: (r) => r.ComprobanteDescripcion,
            },
            {
              key: "number",
              sort: "NumeroComprobante",
              label: "Número",
              render: (r) => r.NumeroComprobanteTexto,
            },
            {
              key: treasury ? "concept" : "client",
              sort: treasury ? "Concepto" : "Cliente",
              label: treasury ? "Concepto" : "Cliente",
              render: (r) =>
                treasury ? r.ConceptoDescripcion : r.ClienteNombre,
            },
            {
              key: "sense",
              sort: "Sentido",
              label: "Operación",
              render: (r) => (r.Sentido === "INGRESO" ? "Ingreso" : "Egreso"),
            },
            {
              key: "amount",
              sort: "ImporteTotal",
              label: "Total",
              render: (r) => amount(r.ImporteTotal),
            },
            {
              key: "state",
              sort: "Estado",
              label: "Estado",
              render: (r) => cashStateLabel(r),
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
        <CashProperties
          services={services}
          treasury={treasury}
          id={property}
          onClose={() => setProperty(null)}
          onExpired={expired}
        />
      )}{" "}
      {reversal}
    </>
  );
}
