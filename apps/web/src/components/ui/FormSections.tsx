import type { ReactNode } from "react";
import "./form-sections.css";

/** Secciones simultáneas; navegación sin ocultar ni desmontar controles. */
export function FormSections({
  idPrefix,
  sections,
}: {
  idPrefix: string;
  sections: readonly { key: string; title: string; content: ReactNode }[];
}) {
  return (
    <div className="form-sections">
      <nav className="form-sections-nav" aria-label="Fichas del formulario">
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
      <div className="form-sections-content">
        {sections.map((section) => (
          <section
            key={section.key}
            id={idPrefix + "-" + section.key}
            tabIndex={-1}
            aria-label={section.title}
            className="form-section"
          >
            {section.content}
          </section>
        ))}
      </div>
    </div>
  );
}
