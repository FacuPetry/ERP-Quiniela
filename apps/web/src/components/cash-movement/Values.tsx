import { useListSorting } from "../ui/useListSorting";
import { displayDate } from "../controls/date-value";
import { useEffect, useState } from "react";
import {
  moneyUnits,
  moneyText,
  type CashValue,
  type CashOptions,
  type ValueDetail,
} from "@erp/shared";
import { OffCanvas } from "../ui/OffCanvas";
import { DataTable } from "../ui/DataTable";
import { Pagination } from "../ui/Pagination";
import { FormToolbarActions } from "../ui/FormToolbarActions";
import {
  TextBox,
  DropDown,
  DatePicker,
  AmountBox,
  todayISO,
} from "../controls";
import { portfolio } from "../../services/cash-movement";
import { ApiRequestError } from "../../services/http";
import { amount, message } from "./format";
export interface DraftValue {
  input: CashValue;
  amount: string;
  bank: string;
  number: string;
}
export function ValueEditor({
  initial,
  sense,
  options,
  onConfirm,
  onClose,
}: {
  initial?: DraftValue;
  sense: string;
  options: CashOptions;
  onConfirm: (v: DraftValue) => void;
  onClose: () => void;
}) {
  const old = initial?.input;
  const [v, setV] = useState(() => ({
    Tipo: old && old.Tipo !== "CARTERA" ? old.Tipo : "TRANSFERENCIA",
    Banco: old && "Banco" in old ? old.Banco : "",
    BancoCuenta: old && "BancoCuenta" in old ? (old.BancoCuenta ?? "") : "",
    CuentaLibradora:
      old && "CuentaLibradora" in old ? (old.CuentaLibradora ?? "") : "",
    Numero: old && "Numero" in old ? old.Numero : "",
    Librador: old && "Librador" in old ? (old.Librador ?? "") : "",
    Documento: old && "Documento" in old ? (old.Documento ?? "") : "",
    Emision: old && "Emision" in old ? old.Emision : todayISO(),
    Vencimiento: old && "Vencimiento" in old ? old.Vencimiento : todayISO(),
    Importe: initial?.amount ?? "0.00",
    Referencia: old && "Referencia" in old ? (old.Referencia ?? "") : "",
  }));
  const [error, setError] = useState("");
  const change = (k: string, value: string) =>
    setV((s) => ({ ...s, [k]: value }));
  function confirm() {
    try {
      if (moneyUnits(v.Importe) <= 0n)
        throw new Error("El importe debe ser mayor que cero.");
      let input: CashValue;
      if (v.Tipo === "TRANSFERENCIA") {
        if (!v.BancoCuenta) throw new Error("Seleccioná una cuenta bancaria.");
        input = {
          Tipo: "TRANSFERENCIA",
          BancoCuenta: v.BancoCuenta,
          Importe: v.Importe,
          Referencia: v.Referencia || null,
        };
      } else {
        const bank =
          v.Tipo === "PROPIO"
            ? options.cuentas.find((a) => a.Codigo === v.BancoCuenta)?.Banco
            : v.Banco;
        if (!bank || !/^\d{1,30}$/.test(v.Numero))
          throw new Error("Completá banco y número de cheque.");
        if (v.Tipo === "PROPIO" && !v.BancoCuenta)
          throw new Error("Seleccioná la cuenta propia.");
        if (v.Tipo === "TERCERO" && !v.CuentaLibradora.trim())
          throw new Error("Ingresá la cuenta libradora.");
        if (!v.Emision || !v.Vencimiento || v.Vencimiento < v.Emision)
          throw new Error("Revisá las fechas de emisión y vencimiento.");
        input = {
          Tipo: v.Tipo as "PROPIO" | "TERCERO",
          Banco: bank,
          BancoCuenta: v.Tipo === "PROPIO" ? v.BancoCuenta : null,
          CuentaLibradora: v.Tipo === "TERCERO" ? v.CuentaLibradora : null,
          Numero: v.Numero,
          Librador: v.Librador || null,
          Documento: v.Documento || null,
          Emision: v.Emision,
          Vencimiento: v.Vencimiento,
          Importe: v.Importe,
        };
      }
      const bank =
        input.Tipo === "TRANSFERENCIA" || input.Tipo === "PROPIO"
          ? (options.cuentas.find((a) => a.Codigo === input.BancoCuenta)
              ?.Nombre ?? "")
          : (options.bancos.find((b) => b.Codigo === input.Banco)?.Nombre ??
            "");
      onConfirm({
        input,
        amount: v.Importe,
        bank,
        number:
          input.Tipo === "TRANSFERENCIA"
            ? (input.Referencia ?? "")
            : input.Numero,
      });
    } catch (e) {
      setError(message(e));
    }
  }
  return (
    <OffCanvas
      open
      title={initial ? "Modificar valor" : "Agregar valor"}
      size="sm"
      onClose={onClose}
      footer={
        <FormToolbarActions
          closeAction={
            <button className="button secondary" onClick={onClose}>
              Cancelar
            </button>
          }
        >
          <button className="button primary" onClick={confirm}>
            Incorporar valor
          </button>
        </FormToolbarActions>
      }
    >
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      <div className="cash-value-fields">
        <DropDown
          label="Tipo de valor"
          value={v.Tipo}
          onValueChange={(value) => change("Tipo", value)}
          options={[
            { value: "TRANSFERENCIA", label: "Transferencia bancaria" },
            {
              value: sense === "EGRESO" ? "PROPIO" : "TERCERO",
              label:
                sense === "EGRESO"
                  ? "Cheque propio"
                  : "Cheque recibido de terceros",
            },
          ]}
        />
        {(v.Tipo === "TRANSFERENCIA" || v.Tipo === "PROPIO") && (
          <DropDown
            label="Cuenta bancaria propia"
            value={v.BancoCuenta}
            onValueChange={(value) => change("BancoCuenta", value)}
            options={[
              { value: "", label: "Seleccioná una cuenta" },
              ...options.cuentas.map((a) => ({
                value: a.Codigo,
                label: a.Nombre,
              })),
            ]}
          />
        )}
        {v.Tipo === "TRANSFERENCIA" ? (
          <TextBox
            label="Referencia"
            value={v.Referencia}
            onValueChange={(value) => change("Referencia", value)}
            maxLength={100}
          />
        ) : (
          <>
            {v.Tipo === "TERCERO" && (
              <>
                <DropDown
                  label="Banco"
                  value={v.Banco}
                  onValueChange={(value) => change("Banco", value)}
                  options={[
                    { value: "", label: "Seleccioná un banco" },
                    ...options.bancos.map((b) => ({
                      value: b.Codigo,
                      label: b.Nombre,
                    })),
                  ]}
                />
                <TextBox
                  label="Cuenta libradora"
                  required
                  value={v.CuentaLibradora}
                  onValueChange={(value) => change("CuentaLibradora", value)}
                  maxLength={50}
                />
              </>
            )}
            <TextBox
              label="Número de cheque"
              required
              value={v.Numero}
              onValueChange={(value) => change("Numero", value)}
              maxLength={30}
            />
            <TextBox
              label="Librador"
              value={v.Librador}
              onValueChange={(value) => change("Librador", value)}
              maxLength={150}
            />
            <TextBox
              label="Documento del librador"
              value={v.Documento}
              onValueChange={(value) => change("Documento", value)}
              maxLength={20}
            />
            <DatePicker
              label="Emisión"
              value={v.Emision}
              onValueChange={(value) => change("Emision", value)}
            />
            <DatePicker
              label="Vencimiento"
              value={v.Vencimiento}
              onValueChange={(value) => change("Vencimiento", value)}
            />
          </>
        )}
        <AmountBox
          label="Importe"
          required
          value={v.Importe}
          maxIntegerDigits={16}
          onValueChange={(value) => change("Importe", value)}
        />
      </div>
    </OffCanvas>
  );
}
export function PortfolioPicker({
  initial,
  onConfirm,
  onClose,
  onExpired,
}: {
  initial: DraftValue[];
  onConfirm: (v: DraftValue[]) => void;
  onClose: () => void;
  onExpired: () => void;
}) {
  const [selected, setSelected] = useState<Record<string, DraftValue>>(() =>
      Object.fromEntries(
        initial.flatMap((v) =>
          v.input.Tipo === "CARTERA" ? [[v.input.Cheque, v]] : [],
        ),
      ),
    ),
    [rows, setRows] = useState<ValueDetail[]>([]),
    [total, setTotal] = useState(0),
    [page, setPage] = useState(1),
    [q, setQ] = useState(""),
    [search, setSearch] = useState(""),
    [revision, setRevision] = useState(0),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const sorting = useListSorting(setPage);
  useEffect(() => {
    const request = new AbortController();
    setLoading(true);
    setError("");
    void portfolio(
      { ...sorting.query, q: search, pagina: String(page) },
      request.signal,
    )
      .then((d) => {
        if (!request.signal.aborted) {
          setRows(d.registros);
          setTotal(d.total);
        }
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
  }, [search, page, revision, onExpired, sorting.value]);
  function choose(keys: string[]) {
    setSelected((old) => {
      const next = Object.fromEntries(
        Object.entries(old).filter(([k]) => keys.includes(k)),
      );
      for (const id of keys) {
        if (next[id]) continue;
        const r = rows.find((r) => r.IDTabla === id);
        if (r)
          next[id] = {
            input: { Tipo: "CARTERA", Cheque: id },
            amount: r.Importe,
            bank: r.BancoNombre,
            number: r.Numero,
          };
      }
      return next;
    });
  }
  return (
    <OffCanvas
      open
      size="md"
      title="Cheques disponibles en cartera"
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
            onClick={() => onConfirm(Object.values(selected))}
          >
            Confirmar valores
          </button>
        </FormToolbarActions>
      }
    >
      <form
        className="cash-search"
        onSubmit={(e) => {
          e.preventDefault();
          setSearch(q);
          setPage(1);
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
        sort={sorting.value}
        onSortChange={sorting.onChange}
        properties={{
          fields: [
            {
              key: "number",
              label: "Número de cheque",
              render: (r) => r.Numero,
            },
            { key: "bank", label: "Banco", render: (r) => r.BancoNombre },
            {
              key: "issuer",
              label: "Cuenta libradora",
              render: (r) => r.CuentaLibradora,
            },
            {
              key: "emission",
              label: "Emisión",
              render: (r) => displayDate(r.Emision),
            },
            {
              key: "due",
              label: "Vencimiento",
              render: (r) => displayDate(r.Vencimiento),
            },
            {
              key: "amount",
              label: "Importe",
              render: (r) => amount(r.Importe),
            },
            { key: "state", label: "Estado", render: (r) => r.Estado },
          ],
        }}
        caption="Cheques de cartera"
        rows={rows}
        rowKey={(r) => r.IDTabla}
        rowLabel={(r) => r.Numero}
        loading={loading}
        selectionMode="multiple"
        selectedKeys={Object.keys(selected)}
        onMultipleSelectionChange={choose}
        columns={[
          {
            key: "number",
            sort: "Numero",
            label: "Cheque",
            render: (r) => r.Numero,
          },
          {
            key: "bank",
            sort: "Banco",
            label: "Banco",
            render: (r) => r.BancoNombre,
          },
          {
            key: "date",
            sort: "Vencimiento",
            label: "Vencimiento",
            render: (r) => displayDate(r.Vencimiento),
          },
          {
            key: "amount",
            sort: "Importe",
            label: "Importe",
            render: (r) => amount(r.Importe),
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
            Object.values(selected).reduce(
              (s, v) => s + moneyUnits(v.amount),
              0n,
            ),
          ),
        )}
      </p>
    </OffCanvas>
  );
}
