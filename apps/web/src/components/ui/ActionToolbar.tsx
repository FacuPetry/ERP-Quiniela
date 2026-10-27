import { useId, useState } from "react";
import { Icon, type IconName } from "../Icon";

export interface ToolbarAction {
  key: string;
  label: string;
  icon: IconName;
  onClick: () => void;
  disabled?: boolean;
  showLabel?: boolean;
}

function IconAction({
  icon,
  label,
  disabled = false,
  active = false,
  onClick,
  showLabel = false,
}: {
  icon: IconName;
  label: string;
  disabled?: boolean;
  active?: boolean;
  onClick: () => void;
  showLabel?: boolean;
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
        className={`icon-button action-icon ${icon === "plus" ? "action-add" : ""} ${showLabel ? "action-with-label" : ""}`}
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
        {showLabel && <span>{label}</span>}
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
  addDisabled = false,
  editDisabled = false,
  startActions = [],
  endActions = [],
}: {
  labels: {
    add?: string;
    edit?: string;
    remove?: string;
    filter?: string;
    refresh?: string;
    properties?: string;
  };
  selected: boolean;
  busy: boolean;
  readOnly: boolean;
  filtersActive: boolean;
  onAdd?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onFilter?: () => void;
  onRefresh?: () => void;
  onProperties?: () => void;
  refreshing?: boolean;
  editIcon?: IconName;
  removeIcon?: IconName;
  removeDisabled?: boolean;
  addDisabled?: boolean;
  editDisabled?: boolean;
  startActions?: readonly ToolbarAction[];
  endActions?: readonly ToolbarAction[];
}) {
  return (
    <div
      className="action-toolbar"
      role="group"
      aria-label="Acciones del listado"
    >
      {startActions.map(({ key, ...action }) => (
        <IconAction
          key={key}
          {...action}
          disabled={busy || Boolean(action.disabled)}
        />
      ))}
      {!readOnly && onAdd && (
        <IconAction
          icon="plus"
          label={labels.add ?? "Agregar"}
          disabled={busy || addDisabled}
          onClick={onAdd}
        />
      )}
      {onEdit && (
        <IconAction
          icon={editIcon ?? (readOnly ? "eye" : "edit")}
          label={labels.edit ?? "Modificar"}
          disabled={!selected || busy || editDisabled}
          onClick={onEdit}
        />
      )}
      {!readOnly && onDelete && (
        <IconAction
          icon={removeIcon ?? "trash"}
          label={labels.remove ?? "Eliminar"}
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
      {onFilter && (
        <IconAction
          icon="filter"
          label={labels.filter ?? "Filtrar"}
          disabled={busy}
          active={filtersActive}
          onClick={onFilter}
        />
      )}
      {onRefresh && (
        <IconAction
          icon="refresh"
          label={labels.refresh ?? "Actualizar listado"}
          disabled={busy || refreshing}
          onClick={onRefresh}
        />
      )}
      {endActions.map(({ key, ...action }) => (
        <IconAction
          key={key}
          {...action}
          disabled={busy || Boolean(action.disabled)}
        />
      ))}
    </div>
  );
}
