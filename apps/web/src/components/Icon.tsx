export type IconName =
  | "chevron"
  | "home"
  | "account"
  | "exchange"
  | "wallet"
  | "values"
  | "users"
  | "file"
  | "pdf"
  | "bank"
  | "box"
  | "tag"
  | "activity"
  | "menu"
  | "close"
  | "logout"
  | "arrow"
  | "shield"
  | "check"
  | "eye"
  | "plus"
  | "edit"
  | "trash"
  | "filter"
  | "refresh"
  | "search"
  | "eraser"
  | "calendar"
  | "whatsapp"
  | "message"
  | "copy";
const paths: Record<IconName, string> = {
  // Bootstrap Icons (MIT); licencia en public/licenses/bootstrap-icons.
  whatsapp:
    "M13.601 2.326A7.85 7.85 0 0 0 7.994 0C3.627 0 .068 3.558.064 7.926c0 1.399.366 2.76 1.057 3.965L0 16l4.204-1.102a7.9 7.9 0 0 0 3.79.965h.004c4.368 0 7.926-3.558 7.93-7.93A7.9 7.9 0 0 0 13.6 2.326zM7.994 14.521a6.6 6.6 0 0 1-3.356-.92l-.24-.144-2.494.654.666-2.433-.156-.251a6.56 6.56 0 0 1-1.007-3.505c0-3.626 2.957-6.584 6.591-6.584a6.56 6.56 0 0 1 4.66 1.931 6.56 6.56 0 0 1 1.928 4.66c-.004 3.639-2.961 6.592-6.592 6.592m3.615-4.934c-.197-.099-1.17-.578-1.353-.646-.182-.065-.315-.099-.445.099-.133.197-.513.646-.627.775-.114.133-.232.148-.43.05-.197-.1-.836-.308-1.592-.985-.59-.525-.985-1.175-1.103-1.372-.114-.198-.011-.304.088-.403.087-.088.197-.232.296-.346.1-.114.133-.198.198-.33.065-.134.034-.248-.015-.347-.05-.099-.445-1.076-.612-1.47-.16-.389-.323-.335-.445-.34-.114-.007-.247-.007-.38-.007a.73.73 0 0 0-.529.247c-.182.198-.691.677-.691 1.654s.71 1.916.81 2.049c.098.133 1.394 2.132 3.383 2.992.47.205.84.326 1.129.418.475.152.904.129 1.246.08.38-.058 1.171-.48 1.338-.943.164-.464.164-.86.114-.943-.049-.084-.182-.133-.38-.232",
  message:
    "M21 15a2 2 0 0 1-2 2H7l-5 4V5a2 2 0 0 1 2-2h15a2 2 0 0 1 2 2ZM6 7h11M6 11h8",
  copy: "M9 9h12v12H9ZM15 5V2H2v13h3",
  pdf: "M14 2H4v20h16V8Zm0 0v6h6M6 17v-5h2v2H6m4 3v-5h1c3 0 3 5 0 5Zm6 0v-5h3m-3 2h2",
  chevron: "m9 5 7 7-7 7",
  calendar: "M8 2v4m8-4v4M3 10h18M3 4h18v18H3ZM7 14h2m4 0h2m-8 4h2m4 0h2",
  eraser: "m16 3 5 5-12 13H5l-4-4L16 3ZM7 11l8 8M9 21h12",
  search: "M21 21l-5.2-5.2M10.5 3a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15",
  refresh: "M21 2v6h-6M20.49 13a9 9 0 1 1-2.12-9.36L21 8",
  plus: "M12 5v14M5 12h14",
  edit: "M17 3a2.828 2.828 0 0 1 4 4L7 21l-4 1 1-4ZM15 5l4 4",
  trash: "M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7",
  filter: "M3 4h18l-7 8v7l-4 2v-9Z",
  home: "m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z",
  account: "M6 3h12v18l-3-2-3 2-3-2-3 2ZM9 7h6M9 11h6M9 15h3",
  exchange: "M3 7h17m-4-4 4 4-4 4M21 17H4m4-4-4 4 4 4",
  wallet:
    "M20 8V5H5a2 2 0 0 1 0-4h12v4M3 3v15a3 3 0 0 0 3 3h14V8H6M20 12h-6v5h6M17 14.5h.01",
  values: "M4 4h16v16H4ZM8 8h8M8 12h4M8 16h8",
  users:
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-3.87M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8m8 .13a4 4 0 0 1 0 7.75",
  file: "M14 2H4v20h16V8Zm0 0v6h6M8 12h8M8 16h8",
  bank: "m2 8 10-6 10 6ZM4 21h16M6 11v6m6-6v6m6-6v6",
  box: "M3 5h18v15H3ZM2 2h20v3H2Zm7 7h6",
  tag: "M20 12 12 20 2 10V2h8ZM7 7h.01",
  activity: "M2 12h5l3-9 4 18 3-9h5",
  menu: "M4 6h16M4 12h16M4 18h16",
  close: "m6 6 12 12M6 18 18 6",
  logout: "M9 21H3V3h6m5 5 5 4-5 4m-6-4h11",
  arrow: "M5 12h14m-6-6 6 6-6 6",
  shield: "m12 2 9 4v6c0 5-9 10-9 10S3 17 3 12V6ZM8 12l3 3 5-6",
  check: "m5 12 4 4L19 6",
  eye: "M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12Zm10-3a3 3 0 1 0 0 6 3 3 0 0 0 0-6",
};
export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox={name === "whatsapp" ? "0 0 16 16" : "0 0 24 24"}
      fill={name === "whatsapp" ? "currentColor" : "none"}
      stroke={name === "whatsapp" ? "none" : "currentColor"}
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}
