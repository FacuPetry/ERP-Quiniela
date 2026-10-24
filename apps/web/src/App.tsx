import { useEffect, useRef, useState } from 'react';
import { getServiceStatus } from './services/status';

type Status = { api: boolean; database: boolean } | null;

export function App() {
  const [status, setStatus] = useState<Status>(null);
  const [loading, setLoading] = useState(true);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  const request = useRef<AbortController | null>(null);

  async function refresh() {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    const result = await getServiceStatus(AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]));
    if (controller.signal.aborted) return;
    setStatus(result);
    setCheckedAt(new Date());
    setLoading(false);
  }

  useEffect(() => { void refresh(); return () => request.current?.abort(); }, []);
  const ready = status?.api && status.database;

  return <div className="min-h-screen bg-[#f5f6f3] text-[#18362e]">
    <header className="border-b border-[#dfe5dd] bg-white">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-6 py-5">
        <span className="grid size-10 place-items-center rounded-xl bg-[#183e33] text-sm font-bold text-white" aria-hidden="true">EQ</span>
        <div><p className="font-semibold tracking-tight">ERP Quiniela</p><p className="text-xs text-[#64736b]">Administración y tesorería</p></div>
        <span className="ml-auto rounded-full bg-[#edf2e9] px-3 py-1 text-xs font-medium">Etapa 1</span>
      </div>
    </header>
    <main className="mx-auto max-w-6xl px-6 py-12 sm:py-20">
      <p className="mb-4 text-xs font-semibold tracking-[0.18em] text-[#5c7465] uppercase">Inicio del proyecto</p>
      <h1 className="max-w-3xl text-3xl font-semibold leading-tight tracking-tight sm:text-5xl">Una base para administrar<br className="hidden sm:block" /> cada movimiento.</h1>
      <p className="mt-5 max-w-2xl text-base leading-7 text-[#637168]">Cuenta corriente, cobros, pagos y tesorería en un mismo sistema. Esta primera entrega permite comprobar la conexión entre la aplicación y su base de datos.</p>
      <section className="mt-10 grid gap-4 sm:grid-cols-3" aria-label="Estado de los servicios" aria-busy={loading}>
        {[{ title: 'Aplicación web', subtitle: 'Interfaz disponible', ok: true },
          { title: 'Servidor', subtitle: 'Comunicación con la API', ok: status?.api },
          { title: 'Base de datos', subtitle: 'Conexión con MySQL', ok: status?.database }].map(item => <article key={item.title} className="rounded-2xl border border-[#dfe5dd] bg-white p-6">
            <div className="mb-6 flex items-center justify-between"><h2 className="font-semibold">{item.title}</h2><span className={`size-2.5 rounded-full ${item.ok ? 'bg-[#397757]' : loading ? 'bg-[#b6bfae]' : 'bg-[#b36b3e]'}`} aria-hidden="true" /></div>
            <p className="text-sm text-[#68756c]">{item.subtitle}</p>
            <p className="mt-2 text-sm font-medium">{item.title === 'Aplicación web' ? 'Disponible' : loading ? 'Comprobando…' : item.ok ? 'Conectado' : 'Sin conexión'}</p>
          </article>)}
      </section>
      <div className="mt-6 flex flex-wrap items-center gap-4">
        <button type="button" onClick={() => { void refresh(); }} disabled={loading} className="rounded-lg bg-[#183e33] px-5 py-3 text-sm font-medium text-white transition hover:bg-[#295442] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#397757] disabled:cursor-wait disabled:opacity-60">{loading ? 'Verificando…' : 'Verificar conexión'}</button>
        <p role="status" className="text-sm text-[#637168]">{loading ? 'Consultando servicios.' : ready ? 'Conexión completa verificada.' : 'Hay servicios pendientes de conexión.'}</p>
      </div>
      {checkedAt && <p className="mt-4 text-xs text-[#718076]">Última comprobación: {new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', hourCycle: 'h23', hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(checkedAt)}</p>}
      <aside className="mt-14 border-t border-[#dfe5dd] pt-6 text-sm leading-6 text-[#68756c]"><strong className="font-medium text-[#304d3c]">Próxima entrega</strong><p>Acceso de usuarios, menú lateral y estructura visual de los módulos.</p></aside>
    </main>
  </div>;
}
