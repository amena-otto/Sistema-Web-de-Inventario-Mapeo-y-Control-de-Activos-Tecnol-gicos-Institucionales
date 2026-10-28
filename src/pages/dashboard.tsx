import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { usePermissions } from '../hooks/usePermissions'
import { supabase } from '../services/supabaseClient'
import {
  type FiltrosDashboard,
  obtenerResumenDashboard,
  type ResumenDashboard,
} from '../services/dashboardService'

const coloresEstado = [
  { nombre: 'Operativos', estado: 'operativo', color: 'bg-emerald-500', valor: (r: ResumenDashboard) => r.equiposOperativos },
  { nombre: 'Con fallas', estado: 'con_fallas', color: 'bg-orange-500', valor: (r: ResumenDashboard) => r.equiposConFallas },
  { nombre: 'En mantenimiento', estado: 'en_mantenimiento', color: 'bg-amber-500', valor: (r: ResumenDashboard) => r.equiposMantenimiento },
  { nombre: 'Inoperativos', estado: 'inoperativo', color: 'bg-rose-500', valor: (r: ResumenDashboard) => r.equiposInoperativos },
  { nombre: 'En almacén', estado: 'en_almacen', color: 'bg-violet-500', valor: (r: ResumenDashboard) => r.equiposAlmacen },
  { nombre: 'Dados de baja', estado: 'baja', color: 'bg-slate-400', valor: (r: ResumenDashboard) => r.equiposBaja },
  { nombre: 'Archivados', estado: 'archivado', color: 'bg-sky-500', valor: (r: ResumenDashboard) => r.equiposArchivados },
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
  to,
}: {
  etiqueta: string
  cantidad: number
  detalle: string
  tono: string
  icono: string
  to: string
}) {
  return (
    <Link to={to} className="group relative block overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_4px_16px_rgba(51,37,29,0.04)] transition duration-200 hover:-translate-y-1 hover:border-orange-200 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-orange-500">
      <span aria-hidden="true" className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-orange-500 to-amber-300 opacity-0 transition group-hover:opacity-100" />
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-500">{etiqueta}</p>
          <p className="mt-3 text-3xl font-bold tracking-tight text-[#33251d]">{cantidad.toLocaleString('es-PE')}</p>
          <p className="mt-1 text-xs text-slate-500">{detalle}</p>
        </div>
        <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${tono} transition duration-200 group-hover:scale-105`}>
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d={icono} />
          </svg>
        </span>
      </div>
    </Link>
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
    <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_8px_28px_rgba(51,37,29,0.045)] sm:p-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4">
        <div>
          <h2 className="font-bold text-[#33251d]">{titulo}</h2>
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
  const [filtros, setFiltros] = useState<FiltrosDashboard>({
    pabellonId: '',
    pisoId: '',
    ambienteId: '',
  })
  const [resumen, setResumen] = useState<ResumenDashboard | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const solicitudCarga = useRef(0)

  const cargar = useCallback(async () => {
    const solicitudActual = ++solicitudCarga.current
    setCargando(true)
    setError('')
    try {
      const resultado = await obtenerResumenDashboard(puedeVerMantenimientos, filtros)
      if (solicitudActual === solicitudCarga.current) setResumen(resultado)
    } catch (e) {
      if (solicitudActual === solicitudCarga.current) {
        setError(
          e instanceof Error && e.message
            ? e.message
            : 'No se pudo cargar el resumen del inventario.',
        )
      }
    } finally {
      if (solicitudActual === solicitudCarga.current) setCargando(false)
    }
  }, [puedeVerMantenimientos, filtros])

  useEffect(() => {
    let vigente = true
    queueMicrotask(() => {
      if (vigente) void cargar()
    })
    const canal = supabase
      .channel('dashboard-inventario')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'equipos' }, () => {
        if (vigente) void cargar()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mantenimientos' }, () => {
        if (vigente) void cargar()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ambientes' }, () => {
        if (vigente) void cargar()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'categorias_equipos' }, () => {
        if (vigente) void cargar()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pisos' }, () => {
        if (vigente) void cargar()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pabellones' }, () => {
        if (vigente) void cargar()
      })
      .subscribe()
    return () => {
      vigente = false
      solicitudCarga.current += 1
      void supabase.removeChannel(canal)
    }
  }, [cargar])

  const nombre = perfil?.nombres?.trim().split(/\s+/)[0] ?? 'Usuario'
  const maxUbicacion = Math.max(
    1,
    ...(resumen?.ubicaciones.map((ubicacion) => ubicacion.cantidad) ?? []),
  )
  const maxCategoria = Math.max(
    1,
    ...(resumen?.categorias.map((categoria) => categoria.cantidad) ?? []),
  )
  const maxPabellon = Math.max(
    1,
    ...(resumen?.pabellones.map((pabellon) => pabellon.cantidad) ?? []),
  )
  const maxPiso = Math.max(
    1,
    ...(resumen?.pisos.map((piso) => piso.cantidad) ?? []),
  )
  const valoresEstados = resumen
    ? coloresEstado.map((estado) => ({ ...estado, cantidad: Math.max(0, estado.valor(resumen)) }))
    : []
  const totalEstado = valoresEstados.reduce((total, estado) => total + estado.cantidad, 0)
  const ambientesDelFiltro = resumen
    ? filtros.ambienteId
      ? [filtros.ambienteId]
      : filtros.pabellonId || filtros.pisoId
        ? resumen.ubicaciones.map((ubicacion) => ubicacion.id)
        : []
    : []

  function enlaceEquipos(parametros: Record<string, string>, ambientesIds = ambientesDelFiltro) {
    const query = new URLSearchParams({ historial: 'completo', ...parametros })
    if (ambientesIds.length === 1) {
      query.set('ambiente', ambientesIds[0])
    } else {
      ambientesIds.forEach((id) => query.append('ambientes', id))
    }
    return `/equipos?${query.toString()}`
  }

  return (
    <div className="space-y-6 pb-2">
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0f1026] via-[#1a1b3a] to-[#2d2f5f] px-6 py-7 text-white shadow-xl shadow-[#0f1026]/20 sm:px-8 sm:py-9">
        <div aria-hidden="true" className="pointer-events-none absolute -right-12 -top-24 h-72 w-72 rounded-full border-[36px] border-white/[0.12]" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-36 right-44 h-64 w-64 rounded-full border-[28px] border-white/[0.08]" />
        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/90">Panel de gestión institucional</p>
            <h1 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">Bienvenido, {nombre}</h1>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-white/95">
              Consulta el estado de los activos tecnológicos y las principales novedades del instituto en un solo lugar.
            </p>
          </div>
          <div className="flex items-center gap-3 rounded-lg border border-white/40 bg-white/20 px-4 py-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/30 text-white">
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M7 3v3m10-3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13H4V6a1 1 0 0 1 1-1Z" />
              </svg>
            </span>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-white/80">Hoy</p>
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
          <section aria-label="Filtros de ubicación" className="grid gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_4px_16px_rgba(51,37,29,0.035)] sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-sm font-medium text-slate-700">
              Pabellón
              <select
                value={filtros.pabellonId}
                onChange={(event) => setFiltros({ pabellonId: event.target.value, pisoId: '', ambienteId: '' })}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2.5 outline-none transition focus:border-orange-400 focus:ring-4 focus:ring-orange-100"
              >
                <option value="">Todos los pabellones</option>
                {resumen.opcionesPabellon.map((item) => <option key={item.id} value={item.id}>{item.nombre}</option>)}
              </select>
            </label>
            <label className="text-sm font-medium text-slate-700">
              Piso
              <select
                value={filtros.pisoId}
                onChange={(event) => setFiltros((actual) => ({ ...actual, pisoId: event.target.value, ambienteId: '' }))}
                disabled={!filtros.pabellonId}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2.5 outline-none transition focus:border-orange-400 focus:ring-4 focus:ring-orange-100 disabled:bg-slate-100"
              >
                <option value="">Todos los pisos</option>
                {resumen.opcionesPiso.map((item) => <option key={item.id} value={item.id}>{item.nombre}</option>)}
              </select>
            </label>
            <label className="text-sm font-medium text-slate-700">
              Ambiente
              <select
                value={filtros.ambienteId}
                onChange={(event) => setFiltros((actual) => ({ ...actual, ambienteId: event.target.value }))}
                disabled={!filtros.pisoId}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2.5 outline-none transition focus:border-orange-400 focus:ring-4 focus:ring-orange-100 disabled:bg-slate-100"
              >
                <option value="">Todos los ambientes</option>
                {resumen.opcionesAmbiente.map((item) => <option key={item.id} value={item.id}>{item.codigo} — {item.nombre}</option>)}
              </select>
            </label>
            <div className="flex items-end">
              <button
                type="button"
                onClick={() => setFiltros({ pabellonId: '', pisoId: '', ambienteId: '' })}
                disabled={!filtros.pabellonId && !filtros.pisoId && !filtros.ambienteId}
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-orange-200 hover:bg-orange-50/60 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Limpiar filtros
              </button>
            </div>
          </section>

          <section aria-label="Indicadores del inventario" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <TarjetaIndicador
              etiqueta="Equipos registrados"
              cantidad={resumen.totalEquipos}
              detalle={`${resumen.equiposActivos.toLocaleString('es-PE')} activos en el inventario`}
              tono="bg-orange-50 text-orange-700"
              icono="M4 5h16v11H4zM8 20h8M12 16v4"
              to={enlaceEquipos({})}
            />
            <TarjetaIndicador
              etiqueta="Operativos"
              cantidad={resumen.equiposOperativos}
              detalle="Equipos disponibles para uso"
              tono="bg-emerald-50 text-emerald-700"
              icono="m5 12 4 4L19 6"
              to={enlaceEquipos({ estado: 'operativo' })}
            />
            <TarjetaIndicador
              etiqueta="En mantenimiento"
              cantidad={resumen.equiposMantenimiento}
              detalle="Activos con estado operativo de mantenimiento"
              tono="bg-amber-50 text-amber-700"
              icono="M14.5 6.5a4 4 0 0 0-5 5L4 17l3 3 5.5-5.5a4 4 0 0 0 5-5l-2.5 2.5-3-3z"
              to={enlaceEquipos({ estado: 'en_mantenimiento' })}
            />
            <TarjetaIndicador
              etiqueta="En almacén"
              cantidad={resumen.equiposAlmacen}
              detalle="Equipos almacenados"
              tono="bg-violet-50 text-violet-700"
              icono="M3 10h18M5 10V5h14v5M5 10v9h14v-9M9 19v-5h6v5"
              to={enlaceEquipos({ estado: 'en_almacen' })}
            />
            <TarjetaIndicador
              etiqueta="Dados de baja"
              cantidad={resumen.equiposBaja}
              detalle="Registros conservados en historial"
              tono="bg-rose-50 text-rose-700"
              icono="M5 7h14M10 11v6m4-6v6M6 7l1 13h10l1-13M9 7V4h6v3"
              to={enlaceEquipos({ estado: 'baja' })}
            />
            <TarjetaIndicador
              etiqueta="Inoperativos"
              cantidad={resumen.equiposInoperativos}
              detalle="Requieren evaluación o atención"
              tono="bg-slate-100 text-slate-700"
              icono="M12 8v5m0 4h.01M10.3 4.9 2.8 18a1.5 1.5 0 0 0 1.3 2.2h15.8a1.5 1.5 0 0 0 1.3-2.2L13.7 4.9a2 2 0 0 0-3.4 0Z"
              to={enlaceEquipos({ estado: 'inoperativo' })}
            />
            {resumen.mantenimientos && (
              <TarjetaIndicador
                etiqueta="Pendientes de revisión"
                cantidad={resumen.mantenimientos.revisionVencida}
                detalle="Equipos con revisión vencida"
                tono="bg-orange-50 text-orange-700"
                icono="M12 8v5m0 4h.01M10.3 4.9 2.8 18a1.5 1.5 0 0 0 1.3 2.2h15.8a1.5 1.5 0 0 0 1.3-2.2L13.7 4.9a2 2 0 0 0-3.4 0Z"
                to="/mantenimientos?revision=vencida"
              />
            )}
          </section>

          <section className="grid gap-6 xl:grid-cols-[1.45fr_1fr]">
            <Panel
              titulo="Equipos por pabellón, piso y ambiente"
              subtitulo="Distribución por edificio y ubicación detallada"
            >
              {resumen.pabellones.length || resumen.pisos.length || resumen.ubicaciones.length ? (
                <div className="max-h-[420px] space-y-3 overflow-y-auto pr-1">
                  {resumen.pabellones.length > 0 && (
                    <div className="rounded-lg bg-slate-50 p-3">
                      <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">Por pabellón</h3>
                      <div className="space-y-3">
                        {resumen.pabellones.map((pabellon) => (
                          <Link
                            key={pabellon.id}
                            to={enlaceEquipos({}, pabellon.ambientesIds)}
                            className="block rounded-md p-1 transition hover:bg-orange-50 focus-visible:outline-2 focus-visible:outline-orange-500"
                          >
                            <div className="flex justify-between gap-3 text-sm">
                              <span className="truncate text-slate-700">{pabellon.nombre}</span>
                              <span className="font-bold tabular-nums text-[#33251d]">{pabellon.cantidad}</span>
                            </div>
                            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white">
                              <div className="h-full rounded-full bg-orange-600" style={{ width: `${(pabellon.cantidad / maxPabellon) * 100}%` }} />
                            </div>
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}
                  {resumen.pisos.length > 0 && (
                    <div className="rounded-lg bg-slate-50 p-3">
                      <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">Por piso</h3>
                      <div className="space-y-3">
                        {resumen.pisos.map((piso) => (
                          <Link
                            key={piso.id}
                            to={enlaceEquipos({}, piso.ambientesIds)}
                            className="block rounded-md p-1 transition hover:bg-orange-50 focus-visible:outline-2 focus-visible:outline-orange-500"
                          >
                            <div className="flex justify-between gap-3 text-sm">
                              <span className="truncate text-slate-700">{piso.pabellon} / {piso.nombre}</span>
                              <span className="font-bold tabular-nums text-[#33251d]">{piso.cantidad}</span>
                            </div>
                            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white">
                              <div className="h-full rounded-full bg-orange-400" style={{ width: `${(piso.cantidad / maxPiso) * 100}%` }} />
                            </div>
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}
                  {resumen.ubicaciones.map((ubicacion) => (
                    <Link
                      key={ubicacion.id}
                      to={enlaceEquipos({}, [ubicacion.id])}
                      className="block rounded-lg border border-slate-100 p-3 transition hover:border-blue-200 hover:bg-blue-50/50"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-700">
                            {ubicacion.pabellon} / {ubicacion.piso}
                          </p>
                          <p className="mt-0.5 truncate text-xs text-slate-500">
                            {ubicacion.codigo} — {ubicacion.ambiente}
                          </p>
                        </div>
                        <span className="text-sm font-bold tabular-nums text-[#33251d]">{ubicacion.cantidad}</span>
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-orange-600 to-orange-400 transition-all duration-500"
                          style={{ width: `${(ubicacion.cantidad / maxUbicacion) * 100}%` }}
                        />
                      </div>
                    </Link>
                  ))}
                  {resumen.equiposSinUbicacion > 0 && (
                    <Link
                      to={enlaceEquipos({ sinUbicacion: 'true' }, [])}
                      className="block rounded-lg border border-dashed border-slate-300 p-3 transition hover:border-orange-300 hover:bg-orange-50/50"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-semibold text-slate-700">Sin ubicación activa</span>
                        <span className="text-sm font-bold tabular-nums text-[#33251d]">{resumen.equiposSinUbicacion}</span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">Incluye equipos sin ambiente asignado o cuya ubicación ya no está registrada.</p>
                    </Link>
                  )}
                  <p className="border-t border-slate-100 pt-3 text-xs text-slate-500">
                    Total: {resumen.totalEquipos.toLocaleString('es-PE')} equipos · distribución por ubicación y sin ubicación activa.
                  </p>
                </div>
              ) : (
                <div className="rounded-lg bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                  No hay ambientes que coincidan con los filtros.
                </div>
              )}
            </Panel>

            <Panel
              titulo="Distribución por categoría"
              subtitulo="Cantidad de equipos registrados en cada categoría"
            >
              {resumen.categorias.length ? (
                <div className="max-h-[420px] space-y-3 overflow-y-auto pr-1">
                  {resumen.categorias.map((categoria) => (
                    <Link
                      key={categoria.id}
                      to={enlaceEquipos({ categoria: categoria.id })}
                      className="block rounded-lg p-2 transition hover:bg-blue-50/60"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="truncate text-sm font-medium text-slate-700">{categoria.nombre}</span>
                        <span className="text-sm font-bold tabular-nums text-[#33251d]">{categoria.cantidad}</span>
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-orange-400 transition-all duration-500"
                          style={{ width: `${(categoria.cantidad / maxCategoria) * 100}%` }}
                        />
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="rounded-lg bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                  No hay categorías que coincidan con los filtros.
                </div>
              )}
            </Panel>
          </section>

          <section className="grid gap-6">
            <Panel
              titulo="Estado de los equipos"
              subtitulo="Distribución de los registros por situación"
            >
              {totalEstado > 0 ? (
                <div className="grid gap-5 lg:grid-cols-[minmax(220px,0.8fr)_minmax(0,1.8fr)] lg:items-center">
                  <div className="rounded-2xl bg-gradient-to-br from-orange-50 to-amber-50/60 p-5">
                    <p className="text-xs font-semibold uppercase tracking-wider text-orange-800/70">Total de equipos</p>
                    <p className="mt-2 text-4xl font-bold tracking-tight text-[#33251d]">{totalEstado.toLocaleString('es-PE')}</p>
                    <p className="mt-1 text-xs text-slate-500">Distribución actual por situación</p>
                    <div className="mt-5 flex h-3 overflow-hidden rounded-full bg-white shadow-inner" aria-label="Gráfico de distribución por estado">
                      {valoresEstados.filter((estado) => estado.cantidad > 0).map((estado) => (
                        <div
                          key={estado.nombre}
                          className={`${estado.color} h-full`}
                          style={{ width: `${(estado.cantidad / totalEstado) * 100}%` }}
                          title={`${estado.nombre}: ${estado.cantidad}`}
                        />
                      ))}
                    </div>
                    <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                      <span>Estado del inventario</span>
                      <span className="font-semibold text-slate-700">100%</span>
                    </div>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {valoresEstados.map((estado) => (
                      <Link
                        key={estado.nombre}
                        to={enlaceEquipos({ estado: estado.estado })}
                        className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/50 px-3 py-3 transition hover:border-orange-200 hover:bg-orange-50/60 focus-visible:outline-2 focus-visible:outline-orange-500"
                      >
                        <span className="flex items-center gap-2.5">
                          <span className={`h-2.5 w-2.5 rounded-full ${estado.color}`} />
                          <span className="text-sm font-medium text-slate-600">{estado.nombre}</span>
                        </span>
                        <span className="flex items-center gap-3">
                          <span className="text-xs text-slate-400">{Math.round((estado.cantidad / totalEstado) * 100)}%</span>
                          <span className="w-8 text-right text-sm font-bold tabular-nums text-slate-800">{estado.cantidad}</span>
                        </span>
                      </Link>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="rounded-lg bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                  No hay equipos que coincidan con los filtros.
                </div>
              )}
            </Panel>
          </section>

          <section className="grid gap-6 xl:grid-cols-[1.45fr_1fr]">
            {resumen.mantenimientos ? (
              <Panel
                titulo="Resumen de mantenimientos"
                subtitulo="Intervenciones técnicas registradas según su estado"
                accion={<Link to="/mantenimientos" className="text-xs font-semibold text-orange-700 hover:underline">Ver mantenimientos →</Link>}
              >
                <div className="grid gap-3 sm:grid-cols-3">
                  {[
                    { etiqueta: 'Pendientes', estado: 'pendiente', cantidad: resumen.mantenimientos.pendientes, fondo: 'bg-amber-50', texto: 'text-amber-800', barra: 'bg-amber-500' },
                    { etiqueta: 'En proceso', estado: 'en_proceso', cantidad: resumen.mantenimientos.enProceso, fondo: 'bg-blue-50', texto: 'text-blue-800', barra: 'bg-blue-600' },
                    { etiqueta: 'Completados', estado: 'completado', cantidad: resumen.mantenimientos.completados, fondo: 'bg-emerald-50', texto: 'text-emerald-800', barra: 'bg-emerald-600' },
                  ].map((estado) => (
                    <Link key={estado.etiqueta} to={`/mantenimientos?estado=${estado.estado}`} className={`rounded-lg ${estado.fondo} p-4 transition hover:ring-2 hover:ring-blue-300`}>
                      <p className={`text-xs font-semibold ${estado.texto}`}>{estado.etiqueta}</p>
                      <p className={`mt-2 text-2xl font-bold ${estado.texto}`}>{estado.cantidad}</p>
                      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/80">
                        <div className={`h-full rounded-full ${estado.barra}`} style={{ width: `${resumen.mantenimientos.total ? (estado.cantidad / resumen.mantenimientos.total) * 100 : 0}%` }} />
                      </div>
                    </Link>
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
                    <span className="block text-sm font-semibold text-[#33251d]">Consultar inventario</span>
                    <span className="mt-1 block text-xs text-slate-500">Buscar y revisar equipos registrados</span>
                  </span>
                  <span className="text-lg text-slate-400 transition group-hover:translate-x-1 group-hover:text-orange-700">→</span>
                </Link>
                {puedeVerMantenimientos && (
                  <Link to="/mantenimientos" className="group flex items-center justify-between rounded-lg border border-slate-200 p-4 transition hover:border-blue-200 hover:bg-blue-50/60">
                    <span>
                      <span className="block text-sm font-semibold text-[#33251d]">Gestionar mantenimiento</span>
                      <span className="mt-1 block text-xs text-slate-500">Registrar o consultar intervenciones</span>
                    </span>
                    <span className="text-lg text-slate-400 transition group-hover:translate-x-1 group-hover:text-orange-700">→</span>
                  </Link>
                )}
                <Link to="/ubicaciones" className="group flex items-center justify-between rounded-lg border border-slate-200 p-4 transition hover:border-blue-200 hover:bg-blue-50/60">
                  <span>
                    <span className="block text-sm font-semibold text-[#33251d]">Ver ubicaciones</span>
                    <span className="mt-1 block text-xs text-slate-500">Explorar ambientes y mapa institucional</span>
                  </span>
                  <span className="text-lg text-slate-400 transition group-hover:translate-x-1 group-hover:text-orange-700">→</span>
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
