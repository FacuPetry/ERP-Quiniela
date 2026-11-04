import { renderMessageTemplate, type BalanceMessagePreview } from "@erp/shared";
/** Solo reemplaza variables reales del backend; no calcula el saldo. */
export function messagePreview(
  template: string | null,
  preview: BalanceMessagePreview | null,
) {
  if (!preview || template === null) return { message: "", error: undefined };
  try {
    return {
      message: renderMessageTemplate(template, preview.Variables),
      error: undefined,
    };
  } catch (error) {
    return {
      message: "",
      error:
        error instanceof Error
          ? error.message
          : "Revisá las variables del mensaje.",
    };
  }
}
