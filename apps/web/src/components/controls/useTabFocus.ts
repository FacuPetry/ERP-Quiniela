import { useEffect } from "react";

let users = 0,
  pendingTab = false,
  tabTarget: EventTarget | null = null;
const key = (e: KeyboardEvent) => {
  pendingTab = e.key === "Tab" && !e.ctrlKey && !e.metaKey && !e.altKey;
};
const pointer = () => {
  pendingTab = false;
  tabTarget = null;
};
const focus = (e: FocusEvent) => {
  tabTarget = pendingTab ? e.target : null;
  pendingTab = false;
};
/** Una sola escucha compartida: distingue Tab/Shift+Tab de mouse, touch,
 * foco programático y navegación hacia otros controles. */
export function useTabFocus() {
  useEffect(() => {
    if (++users === 1) {
      document.addEventListener("keydown", key, true);
      document.addEventListener("pointerdown", pointer, true);
      document.addEventListener("focusin", focus, true);
    }
    return () => {
      if (--users === 0) {
        document.removeEventListener("keydown", key, true);
        document.removeEventListener("pointerdown", pointer, true);
        document.removeEventListener("focusin", focus, true);
        pendingTab = false;
        tabTarget = null;
      }
    };
  }, []);
  return (target: EventTarget) => tabTarget === target;
}
