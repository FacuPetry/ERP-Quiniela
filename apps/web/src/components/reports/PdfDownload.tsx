import { useEffect, useState } from "react";
import type { ReportPdfFile } from "./report-pdf";
/** Respaldo para navegadores móviles que requieren un gesto explícito al descargar. */
export function PdfDownload({ file }: { file: ReportPdfFile }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const value = URL.createObjectURL(file.blob);
    setUrl(value);
    return () => URL.revokeObjectURL(value);
  }, [file]);
  return url ? (
    <p className="muted small">
      <a href={url} download={file.name}>
        Descargar PDF
      </a>{" "}
      ·{" "}
      <a href={url} target="_blank" rel="noopener noreferrer">
        Abrir para imprimir
      </a>
    </p>
  ) : null;
}
