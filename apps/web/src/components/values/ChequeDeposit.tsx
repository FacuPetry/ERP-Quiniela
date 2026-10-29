import { useEffect, useRef, useState } from "react";
import {
  moneyText,
  moneyUnits,
  type ValueRecord,
  type ValueList,
  type ChequeDepositInput,
  type ChequeDepositResult,
} from "@erp/shared";
import { depositCheques, valueList } from "../../services/values";
import { referenceOptions } from "../../services/masters";
import { ApiRequestError } from "../../services/http";
import {
  DatePicker,
  DropDown,
  TextBox,
  TextArea,
  todayISO,
  type DropDownOption,
} from "../controls";
import { OffCanvas } from "../ui/OffCanvas";
import { ActionToolbar } from "../ui/ActionToolbar";
import { DataTable } from "../ui/DataTable";
import { Pagination } from "../ui/Pagination";
import { FormToolbarActions } from "../ui/FormToolbarActions";
import { useListSorting } from "../ui/useListSorting";
import { displayDate } from "../controls/date-value";
import { amount, message } from "../cash-movement/format";
import "../cash-movement/cash-movement.css";
import "./values.css";

export function ChequeDeposit({
  csrf,
  onClose,
  onSaved,
  onExpired,
}: {
  csrf: string;
  onClose: () => void;
  onSaved: (result: ChequeDepositResult) => void;
  onExpired: () => void;
}) {
  const [account, setAccount] = useState(""),
    [date, setDate] = useState(todayISO),
    [note, setNote] = useState("");
  const [accounts, setAccounts] = useState<DropDownOption[]>([]),
    [optionsLoading, setOptionsLoading] = useState(true),
    [optionsError, setOptionsError] = useState(""),
    [optionsRevision, setOptionsRevision] = useState(0);
  const [q, setQ] = useState(""),
    [search, setSearch] = useState(""),
    [page, setPage] = useState(1),
    [requested, setRequested] = useState(false),
    [revision, setRevision] = useState(0),
    [data, setData] = useState<ValueList | null>(null),
    [loading, setLoading] = useState(false),
    [listError, setListError] = useState("");
  const [selected, setSelected] = useState<Record<string, ValueRecord>>({}),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [errors, setErrors] = useState<Record<string, string>>({});
  const saving = useRef(false),
    retry = useRef({ fingerprint: "", key: "" });
  const sorting = useListSorting(setPage);
  useEffect(() => {
    const request = new AbortController();
    setOptionsLoading(true);
    setOptionsError("");
    void Promise.all([
      referenceOptions("cuentas-bancarias", {}, request.signal),
      referenceOptions("bancos", {}, request.signal),
    ])
      .then(([rows, banks]) => {
        if (request.signal.aborted) return;
        const activeBanks = new Set(banks.map((b) => b.Codigo));
        setAccounts(
          rows
            .filter((r) => activeBanks.has(r.Banco))
            .map((r) => ({ value: String(r.Codigo), label: String(r.Nombre) })),
        );
      })
      .catch((e) => {
        if (request.signal.aborted) return;
        if (e instanceof ApiRequestError && e.status === 401) onExpired();
        else setOptionsError(message(e));
      })
      .finally(() => {
        if (!request.signal.aborted) setOptionsLoading(false);
      });
    return () => request.abort();
  }, [optionsRevision, onExpired]);
  useEffect(() => {
    if (!requested) return;
    const request = new AbortController();
    setLoading(true);
    setListError("");
    void valueList(
      {
        Tipo: "TERCERO",
        Estado: "CARTERA",
        q: search,
        pagina: String(page),
        ...sorting.query,
      },
      request.signal,
    )
      .then((d) => {
        if (request.signal.aborted) return;
        if (page > 1 && !d.registros.length) {
          setPage(Math.max(1, Math.ceil(d.total / d.limite)));
          return;
        }
        setData(d);
      })
      .catch((e) => {
        if (request.signal.aborted) return;
        setData(null);
        if (e instanceof ApiRequestError && e.status === 401) onExpired();
        else setListError(message(e));
      })
      .finally(() => {
        if (!request.signal.aborted) setLoading(false);
      });
    return () => request.abort();
  }, [requested, search, page, revision, sorting.value, onExpired]);
  const refresh = () => {
    setRequested(true);
    setRevision((n) => n + 1);
  };
  function choose(keys: string[]) {
    setError("");
    if (keys.length > 100) {
      setError("Se permiten hasta 100 cheques por depósito.");
      return;
    }
    setSelected((previous) => {
      const next = Object.fromEntries(
        Object.entries(previous).filter(([key]) => keys.includes(key)),
      );
      for (const row of data?.registros ?? [])
        if (keys.includes(row.Clave)) next[row.Clave] = row;
      return next;
    });
  }
  const total = moneyText(
    Object.values(selected).reduce(
      (sum, row) => sum + moneyUnits(row.Importe),
      0n,
    ),
  );
  async function confirm() {
    if (saving.current) return;
    setError("");
    setErrors({});
    if (!account || !date || !Object.keys(selected).length) {
      setError(
        "Seleccioná una cuenta de destino, una fecha válida y al menos un cheque.",
      );
      return;
    }
    const input: ChequeDepositInput = {
      BancoCuenta: account,
      Fecha: date,
      Observacion: note.trim() || null,
      Cheques: Object.values(selected)
        .map((r) => r.IDTabla)
        .sort((a, b) => (BigInt(a) < BigInt(b) ? -1 : 1)),
    };
    const fingerprint = JSON.stringify(input);
    if (retry.current.fingerprint !== fingerprint)
      retry.current = { fingerprint, key: crypto.randomUUID() };
    saving.current = true;
    setBusy(true);
    try {
      onSaved(await depositCheques(input, csrf, retry.current.key));
    } catch (e) {
      if (e instanceof ApiRequestError && e.status === 401) onExpired();
      else {
        setError(message(e));
        if (e instanceof ApiRequestError) setErrors(e.campos);
      }
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  return (
    <OffCanvas
      open
      size="lg"
      title="Depositar cheques de terceros"
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
            className="button primary"
            disabled={
              busy ||
              optionsLoading ||
              Boolean(optionsError) ||
              !account ||
              !date ||
              !Object.keys(selected).length
            }
            onClick={() => void confirm()}
          >
            {busy ? "Registrando…" : "Confirmar depósito"}
          </button>
        </FormToolbarActions>
      }
    >
      <p className="muted small">
        El depósito retira los cheques de cartera. Su acreditación bancaria se
        registrará por separado.
      </p>
      {optionsError && (
        <div>
          <p className="notice error" role="alert">
            {optionsError}
          </p>
          <button
            className="button secondary"
            disabled={busy || optionsLoading}
            onClick={() => setOptionsRevision((n) => n + 1)}
          >
            Reintentar cuentas
          </button>
        </div>
      )}
      {!optionsLoading && !optionsError && !accounts.length && (
        <p className="notice">
          No hay cuentas bancarias propias activas disponibles.
        </p>
      )}
      <div className="cash-value-fields value-deposit">
        <div className="form-grid">
          <DropDown
            label="Cuenta de destino"
            value={account}
            onValueChange={setAccount}
            options={accounts}
            required
            disabled={busy || Boolean(optionsError)}
            loading={optionsLoading}
            error={errors.BancoCuenta}
          />
          <DatePicker
            label="Fecha de depósito"
            value={date}
            onValueChange={setDate}
            required
            size="sm"
            disabled={busy}
            error={errors.Fecha}
          />
          <TextArea
            label="Observaciones"
            value={note}
            onValueChange={setNote}
            maxLength={4000}
            wide
            disabled={busy}
            error={errors.Observacion}
          />
        </div>
        <form
          className="cash-search"
          onSubmit={(e) => {
            e.preventDefault();
            if (busy) return;
            setSearch(q);
            setPage(1);
            refresh();
          }}
        >
          <TextBox
            label="Búsqueda"
            value={q}
            onValueChange={setQ}
            maxLength={100}
            disabled={busy}
          />
          <button className="button secondary" disabled={busy || loading}>
            Buscar
          </button>
        </form>
        <div>
          {listError && (
            <p className="notice error" role="alert">
              {listError}
            </p>
          )}
          <DataTable<ValueRecord>
            caption="Cheques en cartera para depositar"
            rows={data?.registros ?? []}
            loading={loading}
            rowKey={(r) => r.Clave}
            rowLabel={(r) => `Cheque ${r.Numero}`}
            selectionMode="multiple"
            selectedKeys={Object.keys(selected)}
            onMultipleSelectionChange={choose}
            selectionDisabled={busy}
            sort={sorting.value}
            onSortChange={sorting.onChange}
            sortingDisabled={!requested}
            toolbar={(actions) => (
              <div className="cash-section-toolbar">
                <h3>Cheques en cartera</h3>
                <ActionToolbar
                  labels={{}}
                  selected={actions.selected}
                  busy={busy || loading}
                  readOnly
                  filtersActive={Boolean(search)}
                  onRefresh={refresh}
                  onProperties={actions.onProperties}
                  endActions={[
                    {
                      key: "clear",
                      label: "Limpiar selección",
                      icon: "eraser",
                      disabled: !Object.keys(selected).length,
                      onClick: () => setSelected({}),
                    },
                  ]}
                />
              </div>
            )}
            columns={[
              {
                key: "number",
                label: "Número",
                render: (r) => r.Numero,
                sort: "Numero",
              },
              {
                key: "bank",
                label: "Banco",
                render: (r) => r.BancoNombre,
                sort: "Banco",
              },
              {
                key: "client",
                label: "Cliente de origen",
                render: (r) => r.ClienteNombre,
                sort: "Cliente",
              },
              {
                key: "date",
                label: "Emisión",
                render: (r) => displayDate(r.Fecha),
                sort: "Fecha",
              },
              {
                key: "due",
                label: "Vencimiento",
                render: (r) => displayDate(r.Vencimiento),
                sort: "Vencimiento",
              },
              {
                key: "amount",
                label: "Importe",
                render: (r) => amount(r.Importe),
                sort: "Importe",
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
          <p className="cash-total" role="status">
            Seleccionados: {Object.keys(selected).length} · Total:{" "}
            {amount(total)}
          </p>
        </div>
      </div>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
    </OffCanvas>
  );
}
