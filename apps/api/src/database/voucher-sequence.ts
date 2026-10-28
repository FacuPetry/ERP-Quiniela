import { createHash } from "node:crypto";
export function voucherLockName(database: string, namespace: string) {
  return (
    "erp_cc_" +
    createHash("sha256")
      .update(JSON.stringify([database, namespace]))
      .digest("hex")
      .slice(0, 48)
  );
}
