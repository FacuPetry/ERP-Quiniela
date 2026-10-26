import { useCallback } from "react";
import type { MasterDefinition } from "@erp/shared";
import { RecordProperties } from "../ui/RecordProperties";
import {
  loadMasterProperties,
  masterPropertyFields,
} from "./master-properties";

export function MasterProperties({
  master,
  recordKey,
  onClose,
  onExpired,
}: {
  master: MasterDefinition;
  recordKey: string;
  onClose: () => void;
  onExpired: () => void;
}) {
  const load = useCallback(
    (signal: AbortSignal) => loadMasterProperties(master, recordKey, signal),
    [master, recordKey],
  );
  return (
    <RecordProperties
      title={`Propiedades · ${master.title}`}
      loadRecord={load}
      fields={masterPropertyFields(master)}
      onClose={onClose}
      onExpired={onExpired}
    />
  );
}
