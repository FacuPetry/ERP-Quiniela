import { useEffect, useRef, type ReactNode } from "react";
import "./form-sections.css";

/** Secciones simultáneas; navegación sin ocultar ni desmontar controles. */
export function FormSections({
  idPrefix,
  sections,
}: {
  idPrefix: string;
  sections: readonly { key: string; title: string; content: ReactNode }[];
}) {
  const layout = useRef<HTMLDivElement>(null);
  const navigation = useRef<HTMLElement>(null);
  useEffect(() => {
    const nav = navigation.current;
    if (!nav) return;
    const measure = () =>
      layout.current?.style.setProperty(
        "--form-sections-nav-height",
        `${nav.getBoundingClientRect().height}px`,
      );
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(nav);
    return () => observer.disconnect();
  }, []);
  return (
    <div ref={layout} className="form-sections">
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
              onClick={(event) => {
                event.preventDefault();
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
