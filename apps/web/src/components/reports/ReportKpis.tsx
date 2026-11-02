import { Icon, type IconName } from "../Icon";

export interface ReportKpi {
  key: string;
  label: string;
  /** Valor ya formateado por el informe; la base no calcula importes. */
  value: string;
  description?: string;
  icon?: IconName;
  emphasis?: boolean;
}

export function ReportKpis({ items }: { items: readonly ReportKpi[] }) {
  if (!items.length) return null;
  return (
    <div
      className="report-totals"
      role="group"
      aria-label="Indicadores del informe"
    >
      {items.map((item) => (
        <section
          key={item.key}
          className={
            "panel report-total" + (item.emphasis ? " report-total-net" : "")
          }
          aria-label={item.label}
        >
          {item.icon && <Icon name={item.icon} />}
          <h2>{item.label}</h2>
          <p className="report-number">{item.value}</p>
          {item.description && (
            <p className="small muted">{item.description}</p>
          )}
        </section>
      ))}
    </div>
  );
}
