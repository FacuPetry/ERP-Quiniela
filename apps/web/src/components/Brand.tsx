export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="brand">
      <span className="brand-mark" aria-hidden="true">
        EQ
      </span>
      {!compact && (
        <div>
          <strong>ERP Quiniela</strong>
          <span>Administración y tesorería</span>
        </div>
      )}
    </div>
  );
}
