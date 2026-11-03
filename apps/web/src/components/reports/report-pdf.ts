import type { ReportDocument } from "./report-document";
import { displayDateTime, todayISO } from "../controls/date-value";

export interface ReportPdfFile {
  blob: Blob;
  name: string;
}
export interface PdfFonts {
  regular: string;
  bold: string;
}
let fonts: Promise<PdfFonts> | undefined;
function base64(bytes: Uint8Array) {
  let result = "";
  for (let start = 0; start < bytes.length; start += 8192)
    result += String.fromCharCode(...bytes.subarray(start, start + 8192));
  return btoa(result);
}
async function loadFonts(): Promise<PdfFonts> {
  if (!fonts)
    fonts = Promise.all(
      [
        new URL("./pdf-fonts/OpenSans-Regular.ttf", import.meta.url),
        new URL("./pdf-fonts/OpenSans-Bold.ttf", import.meta.url),
      ].map(async (url) => {
        const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
        if (!r.ok)
          throw new Error(
            "No se pudieron cargar las fuentes del PDF. Volvé a intentar.",
          );
        const bytes = new Uint8Array(await r.arrayBuffer());
        if (
          bytes[0] !== 0 ||
          bytes[1] !== 1 ||
          bytes[2] !== 0 ||
          bytes[3] !== 0
        )
          throw new Error(
            "La fuente del PDF no está disponible. Actualizá la aplicación y volvé a intentar.",
          );
        return base64(bytes);
      }),
    )
      .then(([regular, bold]) => ({ regular: regular!, bold: bold! }))
      .catch((e) => {
        fonts = undefined;
        throw e;
      });
  return fonts;
}
/** PDF vectorial con texto seleccionable, cabeceras repetidas y paginado.
 * Solo consume un documento aceptado; no vuelve a consultar ni calcula dinero. */
export async function createReportPdf(
  model: ReportDocument,
  providedFonts?: PdfFonts,
): Promise<ReportPdfFile> {
  const [{ jsPDF }, { autoTable }, font] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
    providedFonts ?? loadFonts(),
  ]);
  const wide = model.columns.length >= 9;
  const pdf = new jsPDF({
    orientation: model.columns.length > 5 ? "landscape" : "portrait",
    unit: "mm",
    format: wide ? "a3" : "a4",
    compress: true,
    putOnlyUsedFonts: true,
  });
  pdf.addFileToVFS("OpenSans-Regular.ttf", font.regular);
  pdf.addFileToVFS("OpenSans-Bold.ttf", font.bold);
  pdf.addFont("OpenSans-Regular.ttf", "Report", "normal");
  pdf.addFont("OpenSans-Bold.ttf", "Report", "bold");
  pdf.setProperties({
    title: model.title,
    subject: model.filters,
    creator: "ERP Quiniela",
  });
  const width = pdf.internal.pageSize.getWidth(),
    height = pdf.internal.pageSize.getHeight(),
    margin = 12;
  pdf.setFont("Report", "bold");
  pdf.setFontSize(15);
  pdf.setTextColor(38, 62, 48);
  const titleLines = pdf.splitTextToSize(model.title, width - 2 * margin);
  pdf.text(titleLines, margin, 16);
  pdf.setFont("Report", "normal");
  pdf.setFontSize(8);
  pdf.setTextColor(75, 88, 77);
  const filterLines = pdf.splitTextToSize(
    model.filters || "Sin filtros adicionales.",
    width - 2 * margin,
  );
  const top = 20 + titleLines.length * 5;
  pdf.text(filterLines, margin, top);
  const start = top + filterLines.length * 3.7 + 5;
  // Si un informe extraordinariamente ancho requiere paneles de columnas,
  // repetir su identificación y los rótulos de saldos/cortes en cada panel.
  const identity = model.columns.findIndex((c) =>
    ["NumeroComprobanteTexto", "Numero", "Cliente", "CajaNombre"].includes(
      c.key,
    ),
  );
  const repeat = [
    ...new Set([
      0,
      ...(identity >= 0 ? [identity] : []),
      ...model.rows.flatMap((r) =>
        r.labelIndex === undefined ? [] : [r.labelIndex],
      ),
      ...model.columns.flatMap((c, i) => (c.key === "AperturaEn" ? [i] : [])),
    ]),
  ].sort((a, b) => a - b);
  autoTable(pdf, {
    startY: start,
    margin: { top: 17, bottom: 16, left: margin, right: margin },
    theme: "plain",
    head: [model.columns.map((c) => c.label)],
    body: model.rows.map((r) => r.cells),
    styles: {
      font: "Report",
      fontStyle: "normal",
      fontSize: 8,
      cellPadding: 2.2,
      textColor: [58, 73, 62],
      overflow: "linebreak",
      lineWidth: 0,
    },
    headStyles: {
      fontStyle: "bold",
      fillColor: [239, 245, 233],
      textColor: [48, 73, 42],
    },
    columnStyles: Object.fromEntries(
      model.columns.map((c, i) => [
        i,
        {
          halign: c.align,
          ...(c.align === "right" ? { cellWidth: "wrap" } : {}),
        },
      ]),
    ),
    rowPageBreak: "avoid",
    showHead: "everyPage",
    ...(model.columns.length > 12
      ? { horizontalPageBreak: true, horizontalPageBreakRepeat: repeat }
      : {}),
    didParseCell: (cell) => {
      if (cell.section === "head")
        cell.cell.styles.halign = model.columns[cell.column.index]!.align;
      if (cell.section === "body") {
        const kind = model.rows[cell.row.index]?.kind;
        if (kind === "subtotal" || kind === "total") {
          cell.cell.styles.fillColor = [239, 245, 233];
          cell.cell.styles.fontStyle = "bold";
        }
      }
    },
  });
  if (model.notes)
    autoTable(pdf, {
      startY:
        (pdf as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable
          .finalY + 5,
      body: [[model.notes]],
      margin: { top: 17, bottom: 16, left: margin, right: margin },
      theme: "plain",
      styles: {
        font: "Report",
        fontSize: 7.5,
        textColor: [90, 100, 92],
        cellPadding: 1,
        overflow: "linebreak",
      },
      rowPageBreak: "auto",
    });
  const pages = pdf.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    pdf.setPage(page);
    pdf.setFont("Report", "normal");
    pdf.setFontSize(7);
    pdf.setTextColor(105, 115, 107);
    if (page > 1)
      pdf.text(
        pdf.splitTextToSize(model.title, width - 2 * margin)[0],
        margin,
        10,
      );
    pdf.text(
      "ERP Quiniela · Emitido " + displayDateTime(model.generatedAt),
      margin,
      height - 7,
    );
    pdf.text(`Página ${page} de ${pages}`, width - margin, height - 7, {
      align: "right",
    });
  }
  const slug = model.title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return {
    blob: pdf.output("blob"),
    name: `${slug}-${todayISO(new Date(model.generatedAt))}.pdf`,
  };
}
/** Descarga estándar; la pantalla conserva además un enlace para repetirla en móvil. */
export function downloadReportPdf(file: ReportPdfFile) {
  const url = URL.createObjectURL(file.blob),
    link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
