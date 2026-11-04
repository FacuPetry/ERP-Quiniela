import { useEffect, useMemo, useRef, useState } from "react";
import {
  maxSelectedMessageClients,
  messageBalanceFilters,
  type ClientMessageRow,
  type ClientMessagesResult,
} from "@erp/shared";
import {
  listClientMessages,
  selectedClientMessages,
} from "../../services/messages";
import { ApiRequestError } from "../../services/http";
import { DataTable, type TableColumn } from "../ui/DataTable";
import { ActionToolbar, type ToolbarAction } from "../ui/ActionToolbar";
import { FilterDialog, type FilterField } from "../ui/FilterDialog";
import { Pagination } from "../ui/Pagination";
import { useListSorting } from "../ui/useListSorting";
import { TextArea } from "../controls";
import { amountFormat, formatAmount } from "../controls/amount-value";
import { displayDate, displayDateTime } from "../controls/date-value";
import { Icon } from "../Icon";
import { whatsappMessageUrl } from "@erp/shared";
import { messagePreview } from "./message-preview";
import "../reports/reports.css";

const defaults = {
  q: "",
  ClienteTipo: "",
  Saldo: "POSITIVO",
  Estado: "ACTIVOS",
};
const fields: readonly FilterField[] = [
  { key: "q", label: "Búsqueda por código, nombre o fantasía", kind: "text" },
  {
    key: "ClienteTipo",
    label: "Tipo de cliente",
    kind: "relation",
    includeInactive: true,
    reference: {
      name: "ClienteTipo",
      label: "Tipo de cliente",
      maxLength: 20,
      relation: "tipos-cliente",
      relationLabelField: "Descripcion",
    },
  },
  {
    key: "Saldo",
    label: "Saldo neto",
    kind: "select",
    options: messageBalanceFilters,
  },
  {
    key: "Estado",
    label: "Clientes",
    kind: "select",
    options: [
      { value: "ACTIVOS", label: "Activos" },
      { value: "INACTIVOS", label: "Inactivos" },
      { value: "TODOS", label: "Todos" },
    ],
  },
];
const money = (value: string) => formatAmount(value, amountFormat());
const columns: TableColumn<ClientMessageRow>[] = [
  {
    key: "ClienteNombre",
    label: "Cliente",
    sort: "ClienteNombre",
    render: (r) => `${r.Cliente} · ${r.ClienteNombre}`,
  },
  {
    key: "Telefono",
    label: "Teléfono",
    sort: "Telefono",
    property: (r) =>
      `${r.Telefono || "Sin teléfono"} · ${r.WhatsAppError ?? `WhatsApp: +${r.WhatsAppNumero}`}`,
    render: (r) => (
      <span title={r.WhatsAppError ?? `WhatsApp: +${r.WhatsAppNumero}`}>
        {r.Telefono || "Sin teléfono"}
      </span>
    ),
  },
  {
    key: "SaldoTotal",
    label: "Saldo total",
    sort: "SaldoTotal",
    align: "right",
    render: (r) => money(r.SaldoTotal),
  },
  {
    key: "Mensaje",
    label: "Mensaje generado",
    property: (r) => r.ErrorMensaje ?? r.Mensaje,
    render: (r) => (
      <span
        className="report-ledger-details"
        title={r.ErrorMensaje ?? r.Mensaje}
      >
        {r.ErrorMensaje ?? r.Mensaje}
      </span>
    ),
  },
];
export function ClientMessages({
  template,
  csrf,
  onExpired,
}: {
  template: string | null;
  csrf: string;
  onExpired: () => void;
}) {
  const [filters, setFilters] = useState<Record<string, string>>(defaults);
  const [filtering, setFiltering] = useState(false);
  const [requested, setRequested] = useState(false);
  const [sourceIds, setSourceIds] = useState<string[] | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [data, setData] = useState<ClientMessagesResult | null>(null);
  const [page, setPage] = useState(1),
    [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(false),
    [copying, setCopying] = useState<string | null>(null);
  const [error, setError] = useState(""),
    [status, setStatus] = useState("");
  const [fallback, setFallback] = useState<ClientMessageRow | null>(null);
  const fallbackText = useRef<HTMLTextAreaElement>(null);
  const run = useRef(0);
  const sorting = useListSorting(setPage);
  const rows = useMemo(
    () =>
      (data?.registros ?? []).map((row) => {
        const rendered = messagePreview(template, row);
        return {
          ...row,
          Mensaje: rendered.message,
          ErrorMensaje: rendered.error ?? null,
        };
      }),
    [data, template],
  );
  const latestRows = useRef(rows);
  latestRows.current = rows;
  useEffect(() => {
    if (!requested) return;
    const controller = new AbortController();
    const current = ++run.current;
    setLoading(true);
    setCopying(null);
    setData(null);
    setError("");
    setStatus("");
    setFallback(null);
    const parameters = { pagina: String(page), limite: "20", ...sorting.query };
    const task = sourceIds
      ? selectedClientMessages(sourceIds, parameters, csrf, controller.signal)
      : listClientMessages(
          {
            ...Object.fromEntries(
              Object.entries(filters).filter(([, value]) => value !== ""),
            ),
            ...parameters,
          },
          controller.signal,
        );
    void task
      .then((result) => {
        if (controller.signal.aborted || current !== run.current) return;
        if (page > 1 && !result.registros.length) {
          setPage(Math.max(1, Math.ceil(result.total / result.limite)));
          return;
        }
        setData(result);
      })
      .catch((e) => {
        if (controller.signal.aborted || current !== run.current) return;
        if (e instanceof ApiRequestError && e.status === 401) onExpired();
        else
          setError(
            e instanceof Error
              ? e.message
              : "No se pudo consultar los mensajes de clientes.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted && current === run.current)
          setLoading(false);
      });
    return () => {
      controller.abort();
      run.current++;
    };
  }, [
    requested,
    filters,
    sourceIds,
    page,
    revision,
    sorting.value,
    csrf,
    onExpired,
  ]);
  useEffect(() => {
    setStatus("");
    setFallback(null);
  }, [template]);
  function choose(keys: string[]) {
    if (keys.length > maxSelectedMessageClients) {
      setError(
        `Podés seleccionar hasta ${maxSelectedMessageClients} clientes por consulta.`,
      );
      return;
    }
    setSelected(keys);
    setStatus("");
  }
  async function copy(row: ClientMessageRow) {
    if (loading || copying || row.ErrorMensaje || !row.Mensaje) return;
    const current = run.current;
    setCopying(row.Cliente);
    setStatus("");
    setError("");
    setFallback(null);
    try {
      await navigator.clipboard.writeText(row.Mensaje);
      if (
        current === run.current &&
        latestRows.current.find((r) => r.Cliente === row.Cliente)?.Mensaje ===
          row.Mensaje
      )
        setStatus(
          `Mensaje de ${row.ClienteNombre} copiado. Pegalo en WhatsApp para enviarlo manualmente.`,
        );
    } catch {
      if (
        current === run.current &&
        latestRows.current.find((r) => r.Cliente === row.Cliente)?.Mensaje ===
          row.Mensaje
      ) {
        setFallback(row);
        setError(
          "No se pudo copiar automáticamente. Copiá el texto seleccionado debajo del listado.",
        );
        requestAnimationFrame(() => {
          fallbackText.current?.focus();
          fallbackText.current?.select();
        });
      }
    } finally {
      if (current === run.current) setCopying(null);
    }
  }
  function refresh() {
    if (!requested) {
      setFiltering(true);
      return;
    }
    setSelected([]);
    setRevision((v) => v + 1);
  }
  const startActions: ToolbarAction[] = [
    {
      key: "prepare",
      label: "Consultar seleccionados",
      icon: "check",
      showLabel: true,
      disabled: !selected.length || template === null,
      onClick: () => {
        setSourceIds([...selected]);
        setSelected([]);
        setPage(1);
        setRequested(true);
        setRevision((v) => v + 1);
      },
    },
    {
      key: "select-page",
      label: "Seleccionar página",
      icon: "plus",
      disabled: !rows.length,
      onClick: () =>
        choose([...new Set([...selected, ...rows.map((r) => r.Cliente)])]),
    },
    {
      key: "clear",
      label: "Limpiar selección",
      icon: "eraser",
      disabled: !selected.length,
      onClick: () => setSelected([]),
    },
    ...(sourceIds
      ? [
          {
            key: "back",
            label: "Volver a filtros",
            icon: "arrow" as const,
            showLabel: true,
            onClick: () => {
              setSourceIds(null);
              setSelected([]);
              setPage(1);
            },
          },
        ]
      : []),
  ];
  return (
    <div className="report-layout messages-clients">
      <p className="muted small">
        Filtrá clientes o seleccioná varios con los CheckBox. Cada mensaje se
        copia o abre individualmente; no hay envíos automáticos. Se utiliza el
        texto de Configurar mensaje, incluidos los cambios sin guardar.
      </p>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {status && (
        <p className="notice" role="status">
          {status}
        </p>
      )}
      <section
        className="panel report-results"
        aria-label="Mensajes por clientes"
      >
        <DataTable
          caption="Mensajes por clientes"
          rows={rows}
          columns={columns}
          rowKey={(r) => r.Cliente}
          rowLabel={(r) => `${r.Cliente} - ${r.ClienteNombre}`}
          loading={loading}
          selectionMode="multiple"
          selectedKeys={selected}
          onMultipleSelectionChange={choose}
          selectionDisabled={loading || Boolean(copying)}
          sort={sorting.value}
          onSortChange={(sort) => {
            setSelected([]);
            sorting.onChange(sort);
          }}
          sortingDisabled={loading || Boolean(copying)}
          showEmptyMessage={false}
          bordered={false}
          toolbar={({ selected: focused, onProperties }) => (
            <div className="report-toolbar messages-clients-toolbar">
              <div>
                <h4>Mensajes por clientes</h4>
                <p className="muted small">
                  {selected.length} seleccionados
                  {sourceIds
                    ? ` · Consulta de ${sourceIds.length} clientes elegidos`
                    : ""}
                  {data
                    ? ` · Saldo hasta ${displayDate(data.FechaHasta)} · Consultado ${displayDateTime(data.consultadoEn)}`
                    : " · Aplicá filtros para consultar"}
                </p>
              </div>
              <ActionToolbar
                labels={{ filter: "Filtrar clientes" }}
                selected={focused}
                readOnly
                busy={loading || Boolean(copying) || template === null}
                filtersActive={
                  requested &&
                  !sourceIds &&
                  (filters.Saldo !== "TODOS" ||
                    filters.Estado !== "TODOS" ||
                    Boolean(filters.ClienteTipo || filters.q))
                }
                onProperties={onProperties}
                onFilter={() => setFiltering(true)}
                onRefresh={refresh}
                startActions={startActions}
              />
            </div>
          )}
          actions={(row) => {
            const url = !row.ErrorMensaje
              ? whatsappMessageUrl(row.WhatsAppNumero, row.Mensaje)
              : null;
            return (
              <>
                <button
                  type="button"
                  className="icon-button"
                  title={`Copiar mensaje de ${row.ClienteNombre}`}
                  aria-label={`Copiar mensaje de ${row.ClienteNombre}`}
                  disabled={
                    Boolean(copying) ||
                    Boolean(row.ErrorMensaje) ||
                    !row.Mensaje
                  }
                  onClick={() => {
                    void copy(row);
                  }}
                >
                  <Icon name="copy" size={17} />
                </button>
                {url ? (
                  <a
                    className="icon-button"
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={`Abrir WhatsApp de ${row.ClienteNombre}`}
                    aria-label={`Abrir WhatsApp de ${row.ClienteNombre}`}
                  >
                    <Icon name="message" size={17} />
                  </a>
                ) : (
                  <button
                    type="button"
                    className="icon-button"
                    disabled
                    title={
                      row.ErrorMensaje ??
                      row.WhatsAppError ??
                      "Revisá el mensaje."
                    }
                    aria-label={`Abrir WhatsApp de ${row.ClienteNombre}`}
                  >
                    <Icon name="message" size={17} />
                  </button>
                )}
              </>
            );
          }}
        />
        {data && (
          <Pagination
            page={data.pagina}
            total={data.total}
            limit={data.limite}
            loading={loading || Boolean(copying)}
            onChange={setPage}
          />
        )}
      </section>
      {fallback && (
        <TextArea
          ref={fallbackText}
          label={`Copia manual: ${fallback.ClienteNombre}`}
          value={fallback.Mensaje}
          onValueChange={() => {}}
          readOnly
          height={160}
        />
      )}
      <p className="muted small">
        Saldo total neto hasta hoy, con los mismos criterios del Resumen de
        Cuenta corriente. Positivo: a pagar por el cliente; negativo: a su
        favor. El texto completo puede consultarse desde Propiedades. Copiar o
        abrir un chat no confirma el envío.
      </p>
      {filtering && (
        <FilterDialog
          fields={fields}
          values={filters}
          defaults={defaults}
          onExpired={onExpired}
          onClose={() => setFiltering(false)}
          onApply={(next) => {
            setFilters(next);
            setSourceIds(null);
            setSelected([]);
            setPage(1);
            setRequested(true);
            setRevision((v) => v + 1);
            setFiltering(false);
          }}
        />
      )}
    </div>
  );
}
