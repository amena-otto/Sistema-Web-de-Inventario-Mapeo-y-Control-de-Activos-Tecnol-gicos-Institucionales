import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { usePermissions } from '../hooks/usePermissions'
import {
  obtenerResumenDashboard,
  type ResumenDashboard,
} from '../services/dashboardService'

const coloresEstado = [
  { nombre: 'Operativos', color: 'bg-emerald-500', valor: (r: ResumenDashboard) => r.equiposOperativos },
  { nombre: 'Con fallas', color: 'bg-orange-500', valor: (r: ResumenDashboard) => r.equiposConFallas },
  { nombre: 'En mantenimiento', color: 'bg-amber-500', valor: (r: ResumenDashboard) => r.equiposMantenimiento },
  { nombre: 'Inoperativos', color: 'bg-rose-500', valor: (r: ResumenDashboard) => r.equiposInoperativos },
  { nombre: 'En almacén', color: 'bg-violet-500', valor: (r: ResumenDashboard) => r.equiposAlmacen },
  { nombre: 'Dados de baja', color: 'bg-slate-400', valor: (r: ResumenDashboard) => r.equiposBaja },
  { nombre: 'Archivados', color: 'bg-sky-500', valor: (r: ResumenDashboard) => r.equiposArchivados },
]

function fechaInstitucional() {
  return new Intl.DateTimeFormat('es-PE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date())
}

function TarjetaIndicador({
  etiqueta,
  cantidad,
  detalle,
  tono,
  icono,
}: {
  etiqueta: string
  cantidad: number
  detalle: string
  tono: string
  icono: string
}) {
  return (
    <article className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-[0_4px_16px_rgba(15,41,71,0.04)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-500">{etiqueta}</p>
          <p className="mt-3 text-3xl font-bold tracking-tight text-[#17395e]">{cantidad.toLocaleString('es-PE')}</p>
          <p className="mt-1 text-xs text-slate-500">{detalle}</p>
        </div>
        <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${tono}`}>
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d={icono} />
          </svg>
        </span>
      </div>
    </article>
  )
}

function Panel({
  titulo,
  subtitulo,
  children,
  accion,
}: {
  titulo: string
  subtitulo: string
  children: ReactNode
  accion?: ReactNode
}) {
  return (
    <section className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-[0_4px_16px_rgba(15,41,71,0.04)] sm:p-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-bold text-[#17395e]">{titulo}</h2>
          <p className="mt-1 text-xs text-slate-500">{subtitulo}</p>
        </div>
        {accion}
      </div>
      {children}
    </section>
  )
}

export default function Dashboard() {
  const { perfil } = useAuth()
  const { can } = usePermissions()
  const puedeVerMantenimientos = can('mantenimientos.ver')
  const [resumen, setResumen] = useState<ResumenDashboard | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')

  const cargar = useCallback(async () => {
    setCargando(true)
    setError('')
    try {
      setResumen(await obtenerResumenDashboard(puedeVerMantenimientos))
    } catch (e) {
      setError(
        e instanceof Error && e.message
          ? e.message
          : 'No se pudo cargar el resumen del inventario.',
      )
    } finally {
      setCargando(false)
    }
  }, [puedeVerMantenimientos])

  useEffect(() => {
    let vigente = true
    obtenerResumenDashboard(puedeVerMantenimientos)
      .then((datos) => {
        if (vigente) setResumen(datos)
      })
      .catch((e: unknown) => {
        if (vigente) {
          setError(
            e instanceof Error && e.message
              ? e.message
              : 'No se pudo cargar el resumen del inventario.',
          )
        }
      })
      .finally(() => {
        if (vigente) setCargando(false)
      })
    return () => {
      vigente = false
    }
  }, [puedeVerMantenimientos])

  const nombre = perfil?.nombres?.trim().split(/\s+/)[0] ?? 'Usuario'
  const maxLaboratorio = Math.max(
    1,
    ...(resumen?.laboratorios.map((lab) => lab.cantidad) ?? []),
  )
  const valoresEstados = resumen
    ? coloresEstado.map((estado) => ({ ...estado, cantidad: Math.max(0, estado.valor(resumen)) }))
    : []
  const totalEstado = valoresEstados.reduce((total, estado) => total + estado.cantidad, 0)

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-2xl bg-[#15395f] px-6 py-7 text-white shadow-lg shadow-blue-950/10 sm:px-8 sm:py-9">
        <div aria-hidden="true" className="pointer-events-none absolute -right-12 -top-24 h-72 w-72 rounded-full border-[36px] border-white/[0.045]" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-36 right-44 h-64 w-64 rounded-full border-[28px] border-amber-300/[0.08]" />
        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-200">Panel de gestión institucional</p>
            <h1 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">Bienvenido, {nombre}</h1>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-blue-100/80">
              Consulta el estado de los activos tecnológicos y las principales novedades del instituto en un solo lugar.
            </p>
          </div>
          <div className="flex items-center gap-3 rounded-lg border border-white/15 bg-white/[0.08] px-4 py-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-300/15 text-amber-200">
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M7 3v3m10-3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13H4V6a1 1 0 0 1 1-1Z" />
              </svg>
            </span>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-blue-100/60">Hoy</p>
              <p className="mt-0.5 text-sm font-medium capitalize">{fechaInstitucional()}</p>
            </div>
          </div>
        </div>
      </section>

      {error && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <span>{error}</span>
          <button type="button" onClick={() => void cargar()} className="rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-semibold hover:bg-red-100">
            Reintentar
          </button>
        </div>
      )}

      {cargando && !resumen ? (
        <div role="status" className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
          Cargando indicadores institucionales…
        </div>
      ) : resumen ? (
        <>
          <section aria-label="Indicadores del inventario" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <TarjetaIndicador
              etiqueta="Equipos registrados"
              cantidad={resumen.totalEquipos}
              detalle={`${resumen.equiposActivos.toLocaleString('es-PE')} activos en el inventario`}
              tono="bg-blue-50 text-[#1c5286]"
              icono="M4 5h16v11H4zM8 20h8M12 16v4"
            />
            <TarjetaIndicador
              etiqueta="En mantenimiento"
              cantidad={resumen.equiposMantenimiento}
              detalle="Equipos con intervención activa"
              tono="bg-amber-50 text-amber-700"
              icono="M14.5 6.5a4 4 0 0 0-5 5L4 17l3 3 5.5-5.5a4 4 0 0 0 5-5l-2.5 2.5-3-3z"
            />
            <TarjetaIndicador
              etiqueta="Dados de baja"
              cantidad={resumen.equiposBaja}
              detalle="Registros conservados en historial"
              tono="bg-rose-50 text-rose-700"
              icono="M5 7h14M10 11v6m4-6v6M6 7l1 13h10l1-13M9 7V4h6v3"
            />
            <TarjetaIndicador
              etiqueta="Inoperativos"
              cantidad={resumen.equiposInoperativos}
              detalle="Requieren evaluación o atención"
              tono="bg-slate-100 text-slate-700"
              icono="M12 8v5m0 4h.01M10.3 4.9 2.8 18a1.5 1.5 0 0 0 1.3 2.2h15.8a1.5 1.5 0 0 0 1.3-2.2L13.7 4.9a2 2 0 0 0-3.4 0Z"
            />
          </section>

          <section className="grid gap-6 xl:grid-cols-[1.45fr_1fr]">
            <Panel
              titulo="Equipos por laboratorio"
              subtitulo="Cantidad de activos asignados a cada laboratorio"
              accion={<span className="rounded-full bg-blue-50 px-3 py-1 text-[11px] font-semibold text-[#1c5286]">Top 8</span>}
            >
              {resumen.laboratorios.length ? (
                <div className="space-y-4">
                  {resumen.laboratorios.map((laboratorio, indice) => (
                    <div key={laboratorio.id} className="grid grid-cols-[minmax(0,1fr)_2.2rem] items-center gap-x-4 gap-y-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="w-5 text-[11px] font-semibold text-slate-400">{String(indice + 1).padStart(2, '0')}</span>
                        <span className="truncate text-sm font-medium text-slate-700" title={laboratorio.nombre}>{laboratorio.nombre}</span>
                      </div>
                      <span className="text-right text-sm font-bold tabular-nums text-[#17395e]">{laboratorio.cantidad}</span>
                      <div className="col-span-2 h-2 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-[#1c5286] to-[#4b86b9] transition-all duration-500"
                          style={{ width: `${(laboratorio.cantidad / maxLaboratorio) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-lg bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                  No hay laboratorios activos para mostrar.
                </div>
              )}
            </Panel>

            <Panel
              titulo="Estado de los equipos"
              subtitulo="Distribución de los registros por situación"
            >
              {totalEstado > 0 ? (
                <>
                  <div className="flex h-3 overflow-hidden rounded-full bg-slate-100" aria-label="Gráfico de distribución por estado">
                    {valoresEstados.filter((estado) => estado.cantidad > 0).map((estado) => (
                      <div
                        key={estado.nombre}
                        className={`${estado.color} h-full`}
                        style={{ width: `${(estado.cantidad / totalEstado) * 100}%` }}
                        title={`${estado.nombre}: ${estado.cantidad}`}
                      />
                    ))}
                  </div>
                  <div className="mt-6 space-y-4">
                    {valoresEstados.map((estado) => (
                      <div key={estado.nombre} className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5">
                          <span className={`h-2.5 w-2.5 rounded-full ${estado.color}`} />
                          <span className="text-sm text-slate-600">{estado.nombre}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-slate-400">{Math.round((estado.cantidad / totalEstado) * 100)}%</span>
                          <span className="w-8 text-right text-sm font-bold tabular-nums text-slate-800">{estado.cantidad}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-6 border-t border-slate-100 pt-4 text-xs text-slate-500">
                    Total de equipos: <strong className="text-slate-700">{totalEstado.toLocaleString('es-PE')}</strong>
                  </div>
                </>
              ) : (
                <div className="rounded-lg bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                  No hay equipos registrados.
                </div>
              )}
            </Panel>
          </section>

          <section className="grid gap-6 xl:grid-cols-[1.45fr_1fr]">
            {resumen.mantenimientos ? (
              <Panel
                titulo="Resumen de mantenimientos"
                subtitulo="Intervenciones técnicas registradas según su estado"
                accion={<Link to="/mantenimientos" className="text-xs font-semibold text-[#1c5286] hover:underline">Ver mantenimientos →</Link>}
              >
                <div className="grid gap-3 sm:grid-cols-3">
                  {[
                    { etiqueta: 'Pendientes', cantidad: resumen.mantenimientos.pendientes, fondo: 'bg-amber-50', texto: 'text-amber-800', barra: 'bg-amber-500' },
                    { etiqueta: 'En proceso', cantidad: resumen.mantenimientos.enProceso, fondo: 'bg-blue-50', texto: 'text-blue-800', barra: 'bg-blue-600' },
                    { etiqueta: 'Completados', cantidad: resumen.mantenimientos.completados, fondo: 'bg-emerald-50', texto: 'text-emerald-800', barra: 'bg-emerald-600' },
                  ].map((estado) => (
                    <div key={estado.etiqueta} className={`rounded-lg ${estado.fondo} p-4`}>
                      <p className={`text-xs font-semibold ${estado.texto}`}>{estado.etiqueta}</p>
                      <p className={`mt-2 text-2xl font-bold ${estado.texto}`}>{estado.cantidad}</p>
                      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/80">
                        <div className={`h-full rounded-full ${estado.barra}`} style={{ width: `${resumen.mantenimientos.total ? (estado.cantidad / resumen.mantenimientos.total) * 100 : 0}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
                <p className="mt-4 text-xs text-slate-500">
                  {resumen.mantenimientos.total.toLocaleString('es-PE')} intervenciones registradas en total.
                </p>
              </Panel>
            ) : (
              <Panel titulo="Mantenimientos" subtitulo="Resumen de intervenciones técnicas">
                <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600">
                  El detalle de mantenimientos está disponible para los perfiles autorizados de administración y soporte técnico.
                </p>
              </Panel>
            )}

            <Panel titulo="Accesos rápidos" subtitulo="Ir a las funciones de gestión más utilizadas">
              <div className="grid gap-3">
                <Link to="/equipos" className="group flex items-center justify-between rounded-lg border border-slate-200 p-4 transition hover:border-blue-200 hover:bg-blue-50/60">
                  <span>
                    <span className="block text-sm font-semibold text-[#17395e]">Consultar inventario</span>
                    <span className="mt-1 block text-xs text-slate-500">Buscar y revisar equipos registrados</span>
                  </span>
                  <span className="text-lg text-slate-400 transition group-hover:translate-x-1 group-hover:text-[#1c5286]">→</span>
                </Link>
                {puedeVerMantenimientos && (
                  <Link to="/mantenimientos" className="group flex items-center justify-between rounded-lg border border-slate-200 p-4 transition hover:border-blue-200 hover:bg-blue-50/60">
                    <span>
                      <span className="block text-sm font-semibold text-[#17395e]">Gestionar mantenimiento</span>
                      <span className="mt-1 block text-xs text-slate-500">Registrar o consultar intervenciones</span>
                    </span>
                    <span className="text-lg text-slate-400 transition group-hover:translate-x-1 group-hover:text-[#1c5286]">→</span>
                  </Link>
                )}
                <Link to="/ubicaciones" className="group flex items-center justify-between rounded-lg border border-slate-200 p-4 transition hover:border-blue-200 hover:bg-blue-50/60">
                  <span>
                    <span className="block text-sm font-semibold text-[#17395e]">Ver ubicaciones</span>
                    <span className="mt-1 block text-xs text-slate-500">Explorar ambientes y mapa institucional</span>
                  </span>
                  <span className="text-lg text-slate-400 transition group-hover:translate-x-1 group-hover:text-[#1c5286]">→</span>
                </Link>
              </div>
            </Panel>
          </section>
          {cargando && (
            <p role="status" className="text-right text-xs text-slate-400">Actualizando indicadores…</p>
          )}
        </>
      ) : null}
    </div>
  )
}
