import { useEffect, type RefObject } from "react";

/** Foco inicial según el orden del DOM, incluidos los inputs de solo lectura. */
export function useInitialFieldFocus(
  form: RefObject<HTMLElement | null>,
  fallback?: RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    const first = form.current?.querySelector<HTMLElement>(
      'input:not([type="hidden"]):not(:disabled), textarea:not(:disabled), select:not(:disabled), [role="combobox"]:not(:disabled)',
    );
    (first ?? fallback?.current)?.focus();
  }, [form, fallback]);
}
