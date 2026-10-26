let locks = 0;
let restore: (() => void) | undefined;

/** Bloqueo compartido; conserva el espacio de la barra para que el contenido no salte. */
export function lockDocumentScroll() {
  if (locks++ === 0) {
    const root = document.documentElement;
    const body = document.body;
    const previous = {
      overflow: root.style.overflow,
      gutter: root.style.scrollbarGutter,
      padding: body.style.paddingRight,
    };
    const gap = window.innerWidth - root.clientWidth;
    if (gap > 0) {
      if (CSS.supports("scrollbar-gutter", "stable"))
        root.style.scrollbarGutter = "stable";
      else
        body.style.paddingRight = `${parseFloat(getComputedStyle(body).paddingRight) + gap}px`;
    }
    root.style.overflow = "hidden";
    restore = () => {
      root.style.overflow = previous.overflow;
      root.style.scrollbarGutter = previous.gutter;
      body.style.paddingRight = previous.padding;
    };
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--locks === 0) {
      restore?.();
      restore = undefined;
    }
  };
}
