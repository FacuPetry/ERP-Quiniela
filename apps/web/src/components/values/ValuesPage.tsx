import { useCallback, useEffect, useRef, useState } from "react";
import {
  valueStates,
  valueTypes,
  valueStateLabel,
  valueTypeLabel,
  type ValueList,
  type ValueOperation,
  type ValueRecord,
  type SessionResponse,
} from "@erp/shared";
import { valueList } from "../../services/values";
import { ApiRequestError } from "../../services/http";
import { ActionToolbar } from "../ui/ActionToolbar";
import { DataTable } from "../ui/DataTable";
import { FilterDialog, type FilterField } from "../ui/FilterDialog";
import { Pagination } from "../ui/Pagination";
import { initialListFilters } from "../ui/filter-defaults";
import { useListSorting } from "../ui/useListSorting";
import { displayDate } from "../controls/date-value";
import { CashProperties } from "../cash-movement/CashProperties";
import { cashServices, treasuryServices } from "../../services/cash-movement";
import { amount, message } from "../cash-movement/format";
import { ValueProperties } from "./ValueProperties";
import { ValueView } from "./ValueView";
import { ChequeDeposit } from "./ChequeDeposit";

const defaults = {
  q: "",
  Tipo: "TODOS",
  Estado: "TODOS",
  Banco: "",
  BancoCuenta: "",
  FechaPor: "EMISION",
  Desde: "",
  Hasta: "",
};
const fields: FilterField[] = [
  { key: "q", label: "Búsqueda general", kind: "text" },
  {
    key: "Tipo",
    label: "Tipo de valor",
    kind: "select",
    options: [{ value: "TODOS", label: "Todos" }, ...valueTypes],
  },
  {
    key: "Estado",
    label: "Estado del valor",
    kind: "select",
    options: [{ value: "TODOS", label: "Todos" }, ...valueStates],
  },
  {
    key: "Banco",
    label: "Banco",
    kind: "relation",
    reference: {
      name: "Banco",
      label: "Banco",
      kind: "relation",
      maxLength: 20,
      relation: "bancos",
      relationLabelField: "Nombre",
    },
  },
  {
    key: "BancoCuenta",
    label: "Cuenta propia",
    kind: "relation",
    reference: {
      name: "BancoCuenta",
      label: "Cuenta propia",
      kind: "relation",
      maxLength: 20,
      relation: "cuentas-bancarias",
      relationLabelField: "Nombre",
    },
  },
  {
    key: "FechaPor",
    label: "Filtrar fechas por",
    kind: "select",
    options: [
      { value: "EMISION", label: "Emisión / operación" },
      { value: "VENCIMIENTO", label: "Vencimiento (cheques)" },
    ],
  },
  { key: "Desde", label: "Fecha desde", kind: "date" },
  { key: "Hasta", label: "Fecha hasta", kind: "date" },
];
export function ValuesPage({
  session,
  onExpired,
}: {
  session: SessionResponse;
  onExpired: () => void;
}) {
  const [depositing, setDepositing] = useState(false),
    [notice, setNotice] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>(() =>
      initialListFilters(defaults, ["Desde", "Hasta"]),
    ),
    [page, setPage] = useState(1),
    [requested, setRequested] = useState(false),
    [revision, setRevision] = useState(0),
    [data, setData] = useState<ValueList | null>(null),
    [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  const [selected, setSelected] = useState<string | null>(null),
    [view, setView] = useState<ValueRecord | null>(null),
    [property, setProperty] = useState<ValueRecord | null>(null),
    [filtering, setFiltering] = useState(false),
    [operation, setOperation] = useState<ValueOperation | null>(null);
  const handler = useRef(onExpired);
  handler.current = onExpired;
  const expired = useCallback(() => handler.current(), []);
  const sorting = useListSorting(setPage);
  useEffect(() => {
    if (!requested) return;
    const request = new AbortController();
    setLoading(true);
    setError("");
    void valueList(
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
        setSelected((s) => (d.registros.some((r) => r.Clave === s) ? s : null));
      })
      .catch((e) => {
        if (request.signal.aborted) return;
        setData(null);
        setSelected(null);
        if (e instanceof ApiRequestError && e.status === 401) expired();
        else setError(message(e));
      })
      .finally(() => {
        if (!request.signal.aborted) setLoading(false);
      });
    return () => request.abort();
  }, [requested, filters, page, revision, sorting.value, expired]);
  const refresh = () => {
    setRequested(true);
    setRevision((n) => n + 1);
  };
  const row = data?.registros.find((r) => r.Clave === selected);
  return (
    <>
      {view ? (
        <ValueView
          key={view.Clave}
          row={view}
          onClose={() => setView(null)}
          onExpired={expired}
          onOperation={setOperation}
        />
      ) : (
        <section className="panel master-panel" aria-label="Valores">
          <div className="master-toolbar">
            <div>
              <h2>Valores</h2>
              <p className="muted small">
                Consultá cheques y transferencias, su historial y las
                operaciones relacionadas.
              </p>
            </div>
            <ActionToolbar
              labels={{ edit: "Consultar valor" }}
              selected={Boolean(row)}
              busy={loading}
              readOnly
              filtersActive={Object.entries(filters).some(
                ([k, v]) => v !== defaults[k as keyof typeof defaults],
              )}
              onEdit={() => {
                if (row) setView(row);
              }}
              onProperties={() => {
                if (row) setProperty(row);
              }}
              onFilter={() => setFiltering(true)}
              onRefresh={refresh}
              refreshing={loading}
              startActions={
                session.usuario.rol.codigo === "ADMIN"
                  ? [
                      {
                        key: "deposit",
                        label: "Depositar cheques",
                        icon: "bank",
                        showLabel: true,
                        onClick: () => {
                          setNotice("");
                          setDepositing(true);
                        },
                      },
                    ]
                  : []
              }
            />
          </div>
          {notice && (
            <p className="notice" role="status">
              {notice}
            </p>
          )}
          {error && (
            <p className="notice error" role="alert">
              {error}
            </p>
          )}
          <DataTable<ValueRecord>
            caption="Valores"
            properties={false}
            rows={error ? [] : (data?.registros ?? [])}
            loading={loading}
            rowKey={(r) => r.Clave}
            rowLabel={(r) =>
              valueTypeLabel(r.Tipo) + " · " + (r.Numero || "Sin referencia")
            }
            selectedKey={selected}
            onSelectionChange={setSelected}
            onRowActivate={setView}
            sort={sorting.value}
            onSortChange={sorting.onChange}
            sortingDisabled={!requested}
            columns={[
              {
                key: "type",
                label: "Tipo",
                sort: "Tipo",
                render: (r) => valueTypeLabel(r.Tipo),
              },
              {
                key: "number",
                label: "Número / Referencia",
                sort: "Numero",
                render: (r) => r.Numero || "Sin referencia",
              },
              {
                key: "date",
                label: "Fecha",
                sort: "Fecha",
                render: (r) => displayDate(r.Fecha),
              },
              {
                key: "due",
                label: "Vencimiento",
                sort: "Vencimiento",
                render: (r) => displayDate(r.Vencimiento),
              },
              {
                key: "bank",
                label: "Banco",
                sort: "Banco",
                render: (r) => r.BancoNombre,
              },
              {
                key: "account",
                label: "Cuenta propia",
                sort: "BancoCuenta",
                render: (r) => r.CuentaNombre,
              },
              {
                key: "amount",
                label: "Importe",
                sort: "Importe",
                render: (r) => amount(r.Importe),
              },
              {
                key: "state",
                label: "Estado del valor",
                sort: "Estado",
                render: (r) => valueStateLabel(r.Estado),
              },
              {
                key: "client",
                label: "Cliente de origen",
                sort: "Cliente",
                render: (r) => r.ClienteNombre,
              },
            ]}
          />
          {requested && data && (
            <Pagination
              page={page}
              total={data.total}
              limit={data.limite}
              loading={loading}
              onChange={setPage}
            />
          )}
        </section>
      )}
      {filtering && (
        <FilterDialog
          fields={fields}
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
      {depositing && (
        <ChequeDeposit
          csrf={session.csrfToken}
          onExpired={expired}
          onClose={() => setDepositing(false)}
          onSaved={(result) => {
            setDepositing(false);
            setNotice(
              `Depósito registrado: ${result.Cheques.length} ${result.Cheques.length === 1 ? "cheque" : "cheques"} · ${amount(result.ImporteTotal)}. Pendiente de acreditación bancaria.`,
            );
            if (requested) setRevision((n) => n + 1);
          }}
        />
      )}
      {property && (
        <ValueProperties
          row={property}
          onClose={() => setProperty(null)}
          onExpired={expired}
          onOperation={setOperation}
        />
      )}
      {operation && (
        <CashProperties
          key={operation.IDTabla}
          id={operation.IDTabla}
          services={
            operation.Modulo === "TESORERIA" ? treasuryServices : cashServices
          }
          treasury={operation.Modulo === "TESORERIA"}
          onClose={() => setOperation(null)}
          onExpired={expired}
        />
      )}
    </>
  );
}
