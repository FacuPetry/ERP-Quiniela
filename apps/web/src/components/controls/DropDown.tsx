import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { Field, type FieldProps, type FieldBinding } from "./Field";
import { Icon } from "../Icon";

export interface DropDownOption {
  value: string;
  label: string;
  disabled?: boolean;
  /** Permite mostrar una referencia histórica sin ofrecerla como nueva selección. */
  hidden?: boolean;
}
export interface DropDownProps extends FieldProps {
  value: string;
  onValueChange: (value: string) => void;
  options: readonly DropDownOption[];
  placeholder?: string;
  disabled?: boolean;
  loading?: boolean;
  readOnly?: boolean;
  name?: string;
}

/** Lista de selección sin acceso a APIs ni conocimiento de las entidades. */
export function DropDown({
  id,
  label,
  required,
  invalid,
  error,
  hint,
  wide,
  size,
  ...props
}: DropDownProps) {
  return (
    <Field {...{ id, label, required, invalid, error, hint, wide, size }}>
      {(binding) => (
        <Selection {...props} required={Boolean(required)} binding={binding} />
      )}
    </Field>
  );
}

function Selection({
  binding,
  value,
  onValueChange,
  options,
  placeholder = "Seleccioná una opción",
  disabled = false,
  loading = false,
  readOnly = false,
  required,
  name,
}: Omit<DropDownProps, keyof FieldProps> & {
  binding: FieldBinding;
  required: boolean;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const search = useRef({ text: "", time: 0 });
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [position, setPosition] = useState<CSSProperties>({});
  const visible = options.filter((option) => !option.hidden);
  const unavailable = disabled || loading || readOnly;
  const expanded = open && !unavailable;
  const listId = `${binding.id}-options`;
  const optionId = (index: number) => `${binding.id}-option-${index}`;
  const selected = options.find((option) => option.value === value);
  const activeOption = visible[active];

  function show(last = false) {
    if (unavailable) return;
    const selectedIndex = visible.findIndex(
      (option) => option.value === value && !option.disabled,
    );
    const enabled = visible
      .map((option, index) => (option.disabled ? -1 : index))
      .filter((index) => index >= 0);
    setActive(
      selectedIndex >= 0
        ? selectedIndex
        : ((last ? enabled.at(-1) : enabled[0]) ?? -1),
    );
    search.current = { text: "", time: 0 };
    setOpen(true);
  }
  function choose(index: number) {
    const option = visible[index];
    if (!option || option.disabled || unavailable) return;
    onValueChange(option.value);
    setOpen(false);
    trigger.current?.focus();
  }
  function move(direction: number) {
    for (let step = 1; step <= visible.length; step++) {
      const index =
        (active + step * direction + visible.length) % visible.length;
      if (!visible[index]?.disabled) {
        setActive(index);
        break;
      }
    }
  }
  function keyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (unavailable) return;
    if (event.key === "Escape") {
      if (expanded) {
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
      }
      return;
    }
    if (event.key === "Tab") {
      setOpen(false);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (expanded) choose(active);
      else show();
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!expanded) show(event.key === "ArrowUp");
      else move(event.key === "ArrowDown" ? 1 : -1);
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      const enabled = visible
        .map((option, index) => (option.disabled ? -1 : index))
        .filter((index) => index >= 0);
      setOpen(true);
      setActive((event.key === "Home" ? enabled[0] : enabled.at(-1)) ?? -1);
    } else if (
      event.key.length === 1 &&
      !event.ctrlKey &&
      !event.altKey &&
      !event.metaKey
    ) {
      event.preventDefault();
      const now = Date.now();
      const text =
        (now - search.current.time < 700 ? search.current.text : "") +
        event.key;
      search.current = { text, time: now };
      const normalized = (word: string) =>
        word
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLocaleLowerCase();
      const index = visible.findIndex(
        (option) =>
          !option.disabled &&
          normalized(option.label).startsWith(normalized(text)),
      );
      setOpen(true);
      if (index >= 0) setActive(index);
    }
  }

  useEffect(() => {
    if (unavailable) setOpen(false);
  }, [unavailable]);
  useLayoutEffect(() => {
    if (!expanded) return;
    const update = () => {
      const rect = trigger.current!.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const below = viewportHeight - rect.bottom - 12;
      const above = rect.top - 12;
      const height = Math.min(
        248,
        Math.max(below, above),
        visible.length * 36 + 12 || 48,
      );
      const upwards = below < Math.min(248, height) && above > below;
      const width = Math.min(rect.width, window.innerWidth - 16);
      setPosition({
        position: "fixed",
        left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
        width,
        maxHeight: Math.max(40, height),
        ...(upwards
          ? { bottom: viewportHeight - rect.top + 5 }
          : { top: rect.bottom + 5 }),
      });
    };
    const outside = (event: PointerEvent) => {
      if (
        !trigger.current?.contains(event.target as Node) &&
        !list.current?.contains(event.target as Node)
      )
        setOpen(false);
    };
    const scroll = (event: Event) => {
      if (!list.current?.contains(event.target as Node)) update();
    };
    update();
    document.addEventListener("pointerdown", outside);
    window.addEventListener("resize", update);
    document.addEventListener("scroll", scroll, true);
    return () => {
      document.removeEventListener("pointerdown", outside);
      window.removeEventListener("resize", update);
      document.removeEventListener("scroll", scroll, true);
    };
  }, [expanded, visible.length]);
  useEffect(() => {
    if (!expanded) return;
    const container = list.current;
    const option = document.getElementById(optionId(active));
    if (!container || !option) return;
    // Desplazar solo las opciones: scrollIntoView también puede mover la página
    // y dejar fuera de pantalla un desplegable fijo en formularios largos.
    const bounds = container.getBoundingClientRect();
    const item = option.getBoundingClientRect();
    if (item.top < bounds.top) container.scrollTop -= bounds.top - item.top;
    else if (item.bottom > bounds.bottom)
      container.scrollTop += item.bottom - bounds.bottom;
  }, [expanded, active, binding.id]);

  return (
    <>
      <button
        {...binding}
        ref={trigger}
        type="button"
        className="base-control dropdown-trigger"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={expanded}
        aria-controls={expanded ? listId : undefined}
        aria-activedescendant={
          expanded && activeOption ? optionId(active) : undefined
        }
        aria-required={required}
        aria-busy={loading}
        aria-readonly={readOnly}
        disabled={disabled || loading}
        onClick={() => (expanded ? setOpen(false) : show())}
        onKeyDown={keyDown}
        onBlur={(event) => {
          if (!list.current?.contains(event.relatedTarget as Node))
            setOpen(false);
        }}
      >
        <span className={value && selected ? "" : "dropdown-placeholder"}>
          {loading ? "Cargando opciones…" : (selected?.label ?? placeholder)}
        </span>
        <svg
          className="dropdown-chevron"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {name && (
        <input
          type="hidden"
          name={name}
          value={value}
          disabled={disabled || loading}
        />
      )}
      {expanded &&
        createPortal(
          <div
            ref={list}
            id={listId}
            role="listbox"
            aria-label={trigger.current?.labels?.[0]?.textContent ?? "Opciones"}
            className="dropdown-options"
            style={position}
            // Evita trasladar el foco con el mouse sin bloquear el scroll táctil.
            onMouseDown={(event) => event.preventDefault()}
          >
            {visible.length ? (
              visible.map((option, index) => (
                <div
                  key={option.value}
                  id={optionId(index)}
                  role="option"
                  aria-selected={value === option.value}
                  aria-disabled={Boolean(option.disabled)}
                  className={`dropdown-option ${active === index ? "is-active" : ""}`}
                  onPointerMove={(event) => {
                    if (event.pointerType === "mouse" && !option.disabled)
                      setActive(index);
                  }}
                  onClick={() => choose(index)}
                >
                  <span>{option.label}</span>
                  {value === option.value && <Icon name="check" size={16} />}
                </div>
              ))
            ) : (
              <div className="dropdown-empty">No hay opciones disponibles.</div>
            )}
          </div>,
          trigger.current?.closest("dialog") ?? document.body,
        )}
    </>
  );
}
