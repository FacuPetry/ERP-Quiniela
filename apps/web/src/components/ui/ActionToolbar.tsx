import { useId, useState } from "react";
import { Icon, type IconName } from "../Icon";

function IconAction({
  icon,
  label,
  disabled = false,
  active = false,
  onClick,
}: {
  icon: IconName;
  label: string;
  disabled?: boolean;
  active?: boolean;
  onClick: () => void;
}) {
  const id = useId();
  const [hint, setHint] = useState(false);
  return (
    <span
      className="action-control"
      onMouseEnter={() => setHint(true)}
      onMouseLeave={() => setHint(false)}
    >
      <button
        type="button"
        className={`icon-button action-icon ${icon === "plus" ? "action-add" : ""}`}
        aria-label={label}
        aria-describedby={hint ? id : undefined}
        disabled={disabled}
        data-active={active || undefined}
        onClick={onClick}
        onFocus={() => setHint(true)}
        onBlur={() => setHint(false)}
        onKeyDown={(event) => {
          if (event.key === "Escape") setHint(false);
        }}
      >
        <Icon name={icon} />
        {active && <span className="filter-active-dot" aria-hidden="true" />}
      </button>
      {hint && (
        <span className="action-tooltip" role="tooltip" id={id}>
          {label}
          {active ? " · Filtros activos" : ""}
        </span>
      )}
    </span>
  );
}

export function ActionToolbar({
  labels,
  selected,
  busy,
  readOnly,
  filtersActive,
  onAdd,
  onEdit,
  onDelete,
  onFilter,
  onRefresh,
  onProperties,
  refreshing = false,
  editIcon,
  removeIcon,
  removeDisabled = false,
}: {
  labels: {
    add: string;
    edit: string;
    remove: string;
    filter: string;
    refresh?: string;
    properties?: string;
  };
  selected: boolean;
  busy: boolean;
  readOnly: boolean;
  filtersActive: boolean;
  onAdd: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onFilter: () => void;
  onRefresh?: () => void;
  onProperties?: () => void;
  refreshing?: boolean;
  editIcon?: IconName;
  removeIcon?: IconName;
  removeDisabled?: boolean;
}) {
  return (
    <div
      className="action-toolbar"
      role="group"
      aria-label="Acciones del listado"
    >
      {!readOnly && (
        <IconAction
          icon="plus"
          label={labels.add}
          disabled={busy}
          onClick={onAdd}
        />
      )}
      <IconAction
        icon={editIcon ?? (readOnly ? "eye" : "edit")}
        label={labels.edit}
        disabled={!selected || busy}
        onClick={onEdit}
      />
      {!readOnly && (
        <IconAction
          icon={removeIcon ?? "trash"}
          label={labels.remove}
          disabled={!selected || busy || removeDisabled}
          onClick={onDelete}
        />
      )}
      {onProperties && (
        <IconAction
          icon="file"
          label={labels.properties ?? "Propiedades"}
          disabled={!selected || busy || refreshing}
          onClick={onProperties}
        />
      )}
      <IconAction
        icon="filter"
        label={labels.filter}
        disabled={busy}
        active={filtersActive}
        onClick={onFilter}
      />
      {onRefresh && (
        <IconAction
          icon="refresh"
          label={labels.refresh ?? "Actualizar listado"}
          disabled={busy || refreshing}
          onClick={onRefresh}
        />
      )}
    </div>
  );
}
