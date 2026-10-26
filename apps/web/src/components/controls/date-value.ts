/** Fechas civiles, sin conversión de zona horaria ni normalización por overflow. */
export function currentYear() {
  return Number(
    new Intl.DateTimeFormat("en", {
      year: "numeric",
      timeZone: "America/Argentina/Buenos_Aires",
    }).format(new Date()),
  );
}
function dateExists(day: number, month: number, year: number) {
  if (year < 1000 || year > 9999 || month < 1 || month > 12 || day < 1)
    return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= days[month - 1]!;
}
export function parseDateInput(text: string, year = currentYear()): string {
  const match = /^(\d{1,2})[ /-]+(\d{1,2})(?:[ /-]+(\d{2}|\d{4}))?$/.exec(
    text.trim(),
  );
  if (!match) return "";
  const day = Number(match[1]),
    month = Number(match[2]);
  const fullYear = match[3]
    ? Number(match[3]) + (match[3].length === 2 ? 2000 : 0)
    : year;
  if (!dateExists(day, month, fullYear)) return "";
  return `${fullYear}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
export function formatDateValue(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match &&
    dateExists(Number(match[3]), Number(match[2]), Number(match[1]))
    ? `${match[3]}/${match[2]}/${match[1]}`
    : "";
}
