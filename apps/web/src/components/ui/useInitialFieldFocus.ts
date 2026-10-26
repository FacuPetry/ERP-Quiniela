import { useEffect, type RefObject } from "react";

/** Foco inicial según el orden del DOM, incluidos los inputs de solo lectura. */
export function useInitialFieldFocus(
  form: RefObject<HTMLElement | null>,
  fallback?: RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    const controls =
      'input:not([type="hidden"]), textarea, select, [role="combobox"]';
    const focusFirst = () => {
      const first = [
        ...(form.current?.querySelectorAll<HTMLElement>(controls) ?? []),
      ].find((element) => !element.matches(":disabled"));
      (first ?? fallback?.current)?.focus();
    };
    const initial = form.current?.querySelector<HTMLElement>(controls);
    if (initial?.getAttribute("aria-busy") !== "true") {
      focusFirst();
      return;
    }
    // Un selector de referencias puede estar deshabilitado mientras carga.
    // Esperar su carga sin quitar el foco si el usuario ya comenzó a navegar.
    let cancelled = false;
    const cancel = () => {
      cancelled = true;
      observer.disconnect();
    };
    const observer = new MutationObserver(() => {
      if (initial.getAttribute("aria-busy") === "true") return;
      observer.disconnect();
      if (!cancelled) focusFirst();
    });
    observer.observe(initial, {
      attributes: true,
      attributeFilter: ["aria-busy", "disabled"],
    });
    document.addEventListener("pointerdown", cancel, { once: true });
    document.addEventListener("keydown", cancel, { once: true });
    return () => {
      observer.disconnect();
      document.removeEventListener("pointerdown", cancel);
      document.removeEventListener("keydown", cancel);
    };
  }, [form, fallback]);
}
