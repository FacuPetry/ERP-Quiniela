export function Pagination({
  page,
  total,
  limit,
  loading,
  onChange,
}: {
  page: number;
  total: number;
  limit: number;
  loading: boolean;
  onChange: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / limit));
  return (
    <div className="pagination">
      <p className="muted small" role="status">
        {total} {total === 1 ? "registro" : "registros"} · Página {page} de{" "}
        {pages}
      </p>
      <div>
        <button
          type="button"
          className="button secondary"
          disabled={loading || page <= 1}
          onClick={() => onChange(page - 1)}
        >
          Anterior
        </button>
        <button
          type="button"
          className="button secondary"
          disabled={loading || page >= pages}
          onClick={() => onChange(page + 1)}
        >
          Siguiente
        </button>
      </div>
    </div>
  );
}
