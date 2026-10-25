export type IconName =
  | "home"
  | "account"
  | "exchange"
  | "wallet"
  | "values"
  | "users"
  | "file"
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
  | "refresh";
const paths: Record<IconName, string> = {
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
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}
