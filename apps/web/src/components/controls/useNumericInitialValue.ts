import { useEffect, useRef } from "react";

/** undefined solicita inicialización; una cadena vacía representa un campo limpiado. */
export function useNumericInitialValue(
  value: string | undefined,
  initialValue: string,
  onValueChange: (value: string) => void,
  enabled = true,
) {
  const initial = useRef(initialValue);
  const initialized = useRef(false);
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    if (enabled && value === undefined) onValueChange(initial.current);
  }, [value, onValueChange, enabled]);
  return value ?? (enabled ? initial.current : "");
}
