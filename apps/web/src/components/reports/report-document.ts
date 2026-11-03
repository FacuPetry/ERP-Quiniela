import { isValidElement, type ReactNode } from "react";
import type {
  BalancePlacement,
  TableColumn,
  TableTotals,
} from "../ui/DataTable";
import { groupReportRows } from "./group-rows";

export interface ReportDocument {
  title: string;
  filters: string;
  generatedAt: string;
  columns: { key: string; label: string; align: "left" | "center" | "right" }[];
  rows: {
    kind: "detail" | "balance" | "subtotal" | "total";
    cells: string[];
    labelIndex?: number;
  }[];
  notes: string;
}
/** Obtiene texto de la presentación, nunca HTML ni una captura de la pantalla.
 * Los componentes complejos pueden aportar TableColumn.exportValue. */
export function reportText(value: ReactNode): string {
  if (value == null || typeof value === "boolean") return "";
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "bigint"
  )
    return String(value);
  if (Array.isArray(value)) return value.map(reportText).join("");
  if (isValidElement<{ children?: ReactNode }>(value)) {
    if (value.type === "br") return "\n";
    return (
      reportText(value.props.children) +
      (["p", "div", "section", "h2", "h3", "li"].includes(String(value.type))
        ? "\n"
        : "")
    );
  }
  return "";
}
export function buildReportDocument<T>({
  title,
  filters,
  rows,
  columns,
  rowKey,
  grouping,
  openingBalance,
  closingBalance,
  closingBalancePlacement = "beforeTotals",
  totals,
  notes,
  generatedAt = new Date().toISOString(),
}: {
  title: string;
  filters: ReactNode;
  rows: readonly T[];
  columns: readonly TableColumn<T>[];
  rowKey: (r: T) => string;
  grouping?:
    | {
        key: (r: T) => string;
        subtotal: (key: string) => TableTotals | undefined;
      }
    | undefined;
  openingBalance?: TableTotals | undefined;
  closingBalance?: TableTotals | undefined;
  closingBalancePlacement?: BalancePlacement | undefined;
  totals?: TableTotals | readonly TableTotals[] | undefined;
  notes?: ReactNode;
  generatedAt?: string;
}): ReportDocument {
  const body: ReportDocument["rows"] = [];
  const append = (
    value: TableTotals | undefined,
    kind: "balance" | "subtotal" | "total",
  ) => {
    if (!value) return;
    const label = value.labelKey ?? columns[0]?.key;
    const span = value.labelKey
      ? 1
      : Math.max(1, Math.min(columns.length, value.labelSpan ?? 1));
    body.push({
      kind,
      labelIndex: Math.max(
        0,
        columns.findIndex((c) => c.key === label),
      ),
      cells: columns.map((c, index) =>
        c.key === label
          ? value.label
          : index < span
            ? ""
            : reportText(value.values[c.key]),
      ),
    });
  };
  const groups = grouping
    ? groupReportRows(rows, rowKey, grouping.key)
    : { rows, lastRows: new Map<string, string>() };
  append(openingBalance, "balance");
  for (const row of groups.rows) {
    body.push({
      kind: "detail",
      cells: columns.map((c) =>
        c.exportValue ? c.exportValue(row) : reportText(c.render(row)),
      ),
    });
    const key = groups.lastRows.get(rowKey(row));
    if (grouping && key !== undefined)
      append(grouping.subtotal(key), "subtotal");
  }
  if (closingBalancePlacement === "beforeTotals")
    append(closingBalance, "balance");
  if (totals)
    for (const total of Array.isArray(totals) ? totals : [totals])
      append(total, "total");
  if (closingBalancePlacement === "afterTotals")
    append(closingBalance, "balance");
  return {
    title,
    filters: reportText(filters).trim(),
    generatedAt,
    columns: columns.map((c) => ({
      key: c.key,
      label: c.label,
      align: c.align ?? "left",
    })),
    rows: body,
    notes: reportText(notes).trim(),
  };
}
