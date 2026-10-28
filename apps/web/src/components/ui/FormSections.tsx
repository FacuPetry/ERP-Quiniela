import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import "./form-sections.css";

/** Secciones simultáneas; navegación sin ocultar ni desmontar controles. */
export function FormSections({
  idPrefix,
  sections,
  stickyOffset = 0,
}: {
  idPrefix: string;
  /** Espacio reservado para una cabecera fija externa, en píxeles. */
  stickyOffset?: number;
  sections: readonly { key: string; title: string; content: ReactNode }[];
}) {
  const layout = useRef<HTMLDivElement>(null);
  const navigation = useRef<HTMLElement>(null);
  const [activeKey, setActiveKey] = useState(() => sections[0]?.key ?? "");
  const sectionKeys = sections.map((section) => section.key).join("\0");
  useEffect(() => {
    const root = layout.current;
    const nav = navigation.current;
    if (!root || !nav) return;
    const keys = sectionKeys ? sectionKeys.split("\0") : [];
    const elements = keys.flatMap((key) => {
      const element = document.getElementById(idPrefix + "-" + key);
      return element ? [{ key, element }] : [];
    });
    let frame = 0;
    const update = () => {
      frame = 0;
      root.style.setProperty(
        "--form-sections-nav-height",
        `${nav.getBoundingClientRect().height}px`,
      );
      const title = elements[0]?.element.querySelector<HTMLElement>(
        ".form-section-title",
      );
      const line = title
        ? Number.parseFloat(getComputedStyle(title).top) || 0
        : stickyOffset;
      let current = elements[0]?.key ?? "";
      for (const section of elements) {
        if (section.element.getBoundingClientRect().top <= line + 24)
          current = section.key;
      }
      // Una última sección corta puede no alcanzar la línea sticky al llegar al final de la página.
      const last = elements.at(-1);
      const atEnd =
        window.scrollY > 0 &&
        window.scrollY + window.innerHeight >=
          document.documentElement.scrollHeight - 2;
      if (
        last &&
        atEnd &&
        root.getBoundingClientRect().top < line &&
        last.element.getBoundingClientRect().top < window.innerHeight
      )
        current = last.key;
      setActiveKey(current);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(nav);
    observer.observe(root);
    for (const section of elements) observer.observe(section.element);
    window.addEventListener("scroll", schedule, {
      passive: true,
      capture: true,
    });
    window.addEventListener("resize", schedule);
    schedule();
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [idPrefix, sectionKeys, stickyOffset]);
  return (
    <div
      ref={layout}
      className="form-sections"
      style={{ "--form-sections-top": `${stickyOffset}px` } as CSSProperties}
    >
      <div className="form-sections-sidebar">
        <nav
          ref={navigation}
          className="form-sections-nav"
          aria-label="Fichas del formulario"
        >
          {sections.map((section) => (
            <a
              key={section.key}
              href={"#" + idPrefix + "-" + section.key}
              aria-current={activeKey === section.key ? "location" : undefined}
              onClick={(event) => {
                event.preventDefault();
                setActiveKey(section.key);
                const target = document.getElementById(
                  idPrefix + "-" + section.key,
                );
                target?.scrollIntoView({ block: "start" });
                target?.focus({ preventScroll: true });
              }}
            >
              {section.title}
            </a>
          ))}
        </nav>
      </div>
      <div className="form-sections-content">
        {sections.map((section) => (
          <section
            key={section.key}
            id={idPrefix + "-" + section.key}
            tabIndex={-1}
            aria-labelledby={idPrefix + "-" + section.key + "-title"}
            className="form-section"
          >
            <h3
              id={idPrefix + "-" + section.key + "-title"}
              className="form-section-title"
            >
              {section.title}
            </h3>
            {section.content}
          </section>
        ))}
      </div>
    </div>
  );
}
