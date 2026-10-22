import { useEffect, useState, type FormEvent } from 'react'
import { usePermissions } from '../hooks/usePermissions'
import {
  estadosMantenimiento,
  listarEquiposMantenimiento,
  listarMantenimientos,
  listarTecnicosMantenimiento,
  obtenerIndicadoresMantenimiento,
  registrarMantenimiento,
  type EquipoMantenimiento,
  type EstadoMantenimiento,
  type FiltrosMantenimiento,
  type Mantenimiento,
  type NuevoMantenimiento,
  type TecnicoMantenimiento,
  type TipoMantenimiento,
} from '../services/mantenimientosService'
import { estadosOperativos } from '../services/equiposService'

const porPagina = 10
const etiquetasEstado: Record<EstadoMantenimiento, string> = {
  pendiente: 'Pendiente',
  en_proceso: 'En proceso',
  completado: 'Completado',
}
const etiquetasTipo: Record<TipoMantenimiento, string> = {
  preventivo: 'Preventivo',
  correctivo: 'Correctivo',
}
const etiquetasEquipo: Record<(typeof estadosOperativos)[number], string> = {
  operativo: 'Operativo',
  con_fallas: 'Operativo con observaciones',
  en_mantenimiento: 'En mantenimiento',
  inoperativo: 'Inoperativo',
  en_almacen: 'En almacén',
}

function fechaLocal() {
  const fecha = new Date()
  const offset = fecha.getTimezoneOffset()
  return new Date(fecha.getTime() - offset * 60_000).toISOString().slice(0, 10)
}

function mostrarError(error: unknown, fallback: string) {
  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string'
  ) {
    return error.message
  }
  return fallback
}

function fechaCorta(fecha: string | null) {
  if (!fecha) return '—'
  return new Date(`${fecha.slice(0, 10)}T00:00:00`).toLocaleDateString()
}

function tecnicoEtiqueta(tecnico: TecnicoMantenimiento) {
  return `${tecnico.nombres} ${tecnico.apellidos}`.trim() || tecnico.id
}

const formularioVacio = (): NuevoMantenimiento => ({
  equipoId: '',
  tipo: 'correctivo',
  fecha: fechaLocal(),
  problema: '',
  diagnostico: '',
  acciones: '',
  componentes: '',
  resultado: '',
  observaciones: '',
  proximaRevision: '',
  estado: 'pendiente',
  estadoEquipo: '',
})

const filtrosVacios: FiltrosMantenimiento = {
  equipoId: '',
  responsableId: '',
  estado: '',
  desde: '',
  hasta: '',
  pagina: 1,
  porPagina,
}

export default function Mantenimientos() {
  const { can } = usePermissions()
  const puedeRegistrar = can('mantenimientos.registrar')
  const [equipos, setEquipos] = useState<EquipoMantenimiento[]>([])
  const [tecnicos, setTecnicos] = useState<TecnicoMantenimiento[]>([])
  const [mantenimientos, setMantenimientos] = useState<Mantenimiento[]>([])
  const [total, setTotal] = useState(0)
  const [indicadores, setIndicadores] = useState({
    pendientes: 0,
    enProceso: 0,
    vencidos: 0,
    mes: 0,
  })
  const [filtros, setFiltros] = useState<FiltrosMantenimiento>(filtrosVacios)
  const [cargando, setCargando] = useState(true)
  const [cargandoCatalogos, setCargandoCatalogos] = useState(true)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [modalAbierto, setModalAbierto] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [nuevo, setNuevo] = useState<NuevoMantenimiento>(formularioVacio)

  useEffect(() => {
    let vigente = true
    Promise.all([
      listarEquiposMantenimiento(),
      listarTecnicosMantenimiento(),
    ])
      .then(([listaEquipos, listaTecnicos]) => {
        if (!vigente) return
        setEquipos(listaEquipos)
        setTecnicos(listaTecnicos)
      })
      .catch((e: unknown) => {
        if (vigente) setError(mostrarError(e, 'No se pudieron cargar los catálogos.'))
      })
      .finally(() => {
        if (vigente) setCargandoCatalogos(false)
      })
    return () => {
      vigente = false
    }
  }, [])

  useEffect(() => {
    let vigente = true
    Promise.all([
      listarMantenimientos(filtros),
      obtenerIndicadoresMantenimiento(),
    ])
      .then(([resultado, valores]) => {
        if (!vigente) return
        setMantenimientos(resultado.mantenimientos)
        setTotal(resultado.total)
        setIndicadores(valores)
      })
      .catch((e: unknown) => {
        if (vigente) {
          setError(
            `${mostrarError(e, 'No se pudo cargar el historial.')}. Verifica que hayas ejecutado la migración 008 en Supabase.`,
          )
        }
      })
      .finally(() => {
        if (vigente) setCargando(false)
      })
    return () => {
      vigente = false
    }
  }, [filtros])

  function cambiarFiltro(cambios: Partial<FiltrosMantenimiento>) {
    setError('')
    setCargando(true)
    setFiltros((actuales) => ({ ...actuales, ...cambios, pagina: 1 }))
  }

  async function guardar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setAviso('')
    if (!nuevo.equipoId) {
      setError('Selecciona el equipo intervenido.')
      return
    }
    if (nuevo.proximaRevision && nuevo.proximaRevision < nuevo.fecha) {
      setError('La próxima revisión no puede ser anterior a la fecha del mantenimiento.')
      return
    }

    setGuardando(true)
    try {
      await registrarMantenimiento(nuevo)
      setModalAbierto(false)
      setNuevo(formularioVacio())
      setCargando(true)
      setFiltros((actuales) => ({ ...actuales, pagina: 1 }))
      setAviso('Mantenimiento registrado correctamente.')
      const valores = await obtenerIndicadoresMantenimiento()
      setIndicadores(valores)
    } catch (e) {
      setError(mostrarError(e, 'No se pudo registrar el mantenimiento.'))
    } finally {
      setGuardando(false)
    }
  }

  function actualizarNuevo<K extends keyof NuevoMantenimiento>(
    campo: K,
    valor: NuevoMantenimiento[K],
  ) {
    setNuevo((actual) => ({ ...actual, [campo]: valor }))
  }

  const totalPaginas = Math.max(1, Math.ceil(total / porPagina))

  return (
    <main className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Mantenimientos</h1>
          <p className="mt-1 text-sm text-slate-600">
            Registra intervenciones técnicas y consulta el historial de los equipos.
          </p>
        </div>
        {puedeRegistrar && (
          <button
            type="button"
            onClick={() => {
              setError('')
              setAviso('')
              setModalAbierto(true)
            }}
            className="rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-800"
          >
            Registrar mantenimiento
          </button>
        )}
      </header>

      {error && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}
      {aviso && (
        <div role="status" className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          {aviso}
        </div>
      )}

      <section aria-label="Indicadores de mantenimiento" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { titulo: 'Equipos pendientes', valor: indicadores.pendientes, color: 'text-amber-700' },
          { titulo: 'Equipos en proceso', valor: indicadores.enProceso, color: 'text-blue-700' },
          { titulo: 'Equipos con revisión vencida', valor: indicadores.vencidos, color: 'text-red-700' },
          { titulo: 'Intervenciones este mes', valor: indicadores.mes, color: 'text-emerald-700' },
        ].map((indicador) => (
          <article key={indicador.titulo} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-slate-600">{indicador.titulo}</p>
            <p className={`mt-2 text-3xl font-bold ${indicador.color}`}>{indicador.valor}</p>
          </article>
        ))}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-slate-900">Historial de intervenciones</h2>
          <button
            type="button"
            onClick={() => {
              setError('')
              setCargando(true)
              setFiltros((actuales) => ({ ...actuales }))
            }}
            className="text-sm font-medium text-blue-700 hover:text-blue-900"
          >
            Actualizar
          </button>
        </div>

        <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <label className="text-sm text-slate-700">
            Equipo
            <select
              value={filtros.equipoId}
              onChange={(e) => cambiarFiltro({ equipoId: e.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
            >
              <option value="">Todos</option>
              {equipos.map((equipo) => (
                <option key={equipo.id} value={equipo.id}>
                  {equipo.codigo_institucional} — {equipo.nombre}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm text-slate-700">
            Técnico responsable
            <select
              value={filtros.responsableId}
              onChange={(e) => cambiarFiltro({ responsableId: e.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
            >
              <option value="">Todos</option>
              {tecnicos.filter((tecnico) => tecnico.activo).map((tecnico) => (
                <option key={tecnico.id} value={tecnico.id}>{tecnicoEtiqueta(tecnico)}</option>
              ))}
            </select>
          </label>
          <label className="text-sm text-slate-700">
            Estado
            <select
              value={filtros.estado}
              onChange={(e) => cambiarFiltro({ estado: e.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
            >
              <option value="">Todos</option>
              {estadosMantenimiento.map((estado) => (
                <option key={estado} value={estado}>{etiquetasEstado[estado]}</option>
              ))}
            </select>
          </label>
          <label className="text-sm text-slate-700">
            Desde
            <input
              type="date"
              value={filtros.desde}
              onChange={(e) => cambiarFiltro({ desde: e.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
            />
          </label>
          <label className="text-sm text-slate-700">
            Hasta
            <input
              type="date"
              value={filtros.hasta}
              onChange={(e) => cambiarFiltro({ hasta: e.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
            />
          </label>
        </div>

        {cargando ? (
          <p className="py-10 text-center text-sm text-slate-500">Cargando historial...</p>
        ) : mantenimientos.length === 0 ? (
          <p className="rounded-lg bg-slate-50 px-4 py-10 text-center text-sm text-slate-600">
            No hay mantenimientos que coincidan con los filtros.
          </p>
        ) : (
          <div className="space-y-3">
            {mantenimientos.map((mantenimiento) => (
              <article key={mantenimiento.id} className="rounded-lg border border-slate-200 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-900">
                      {mantenimiento.equipo
                        ? `${mantenimiento.equipo.codigo_institucional} — ${mantenimiento.equipo.nombre}`
                        : 'Equipo no disponible'}
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      {fechaCorta(mantenimiento.fecha_mantenimiento)} · {etiquetasTipo[mantenimiento.tipo]} ·{' '}
                      {mantenimiento.responsable
                        ? `${mantenimiento.responsable.nombres} ${mantenimiento.responsable.apellidos}`.trim()
                        : 'Técnico no disponible'}
                    </p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    mantenimiento.estado === 'completado'
                      ? 'bg-green-100 text-green-800'
                      : mantenimiento.estado === 'en_proceso'
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-amber-100 text-amber-800'
                  }`}>
                    {etiquetasEstado[mantenimiento.estado]}
                  </span>
                </div>
                <p className="mt-3 text-sm text-slate-800">
                  <span className="font-medium">Problema reportado:</span> {mantenimiento.problema_reportado}
                </p>
                {mantenimiento.proxima_revision && (
                  <p className="mt-1 text-sm text-slate-600">
                    Próxima revisión: {fechaCorta(mantenimiento.proxima_revision)}
                  </p>
                )}
                <details className="mt-3">
                  <summary className="cursor-pointer text-sm font-medium text-blue-700 hover:text-blue-900">
                    Ver diagnóstico y detalles
                  </summary>
                  <dl className="mt-3 grid gap-x-6 gap-y-3 rounded-lg bg-slate-50 p-4 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="font-medium text-slate-700">Diagnóstico</dt>
                      <dd className="mt-1 whitespace-pre-wrap text-slate-600">{mantenimiento.diagnostico || '—'}</dd>
                    </div>
                    <div>
                      <dt className="font-medium text-slate-700">Acciones realizadas</dt>
                      <dd className="mt-1 whitespace-pre-wrap text-slate-600">{mantenimiento.acciones_realizadas || '—'}</dd>
                    </div>
                    <div>
                      <dt className="font-medium text-slate-700">Componentes reemplazados</dt>
                      <dd className="mt-1 whitespace-pre-wrap text-slate-600">{mantenimiento.componentes_reemplazados || '—'}</dd>
                    </div>
                    <div>
                      <dt className="font-medium text-slate-700">Resultado</dt>
                      <dd className="mt-1 whitespace-pre-wrap text-slate-600">{mantenimiento.resultado || '—'}</dd>
                    </div>
                    <div>
                      <dt className="font-medium text-slate-700">Estado actual del equipo</dt>
                      <dd className="mt-1 text-slate-600">
                        {mantenimiento.equipo
                          ? etiquetasEquipo[mantenimiento.equipo.estado_operativo]
                          : '—'}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-medium text-slate-700">Observaciones</dt>
                      <dd className="mt-1 whitespace-pre-wrap text-slate-600">{mantenimiento.observaciones || '—'}</dd>
                    </div>
                  </dl>
                </details>
              </article>
            ))}
          </div>
        )}

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
          <span>{total} registro{total === 1 ? '' : 's'}</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={filtros.pagina <= 1 || cargando}
              onClick={() => {
                setError('')
                setCargando(true)
                setFiltros((actuales) => ({ ...actuales, pagina: actuales.pagina - 1 }))
              }}
              className="rounded-lg border border-slate-300 px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Anterior
            </button>
            <span>Página {filtros.pagina} de {totalPaginas}</span>
            <button
              type="button"
              disabled={filtros.pagina >= totalPaginas || cargando}
              onClick={() => {
                setError('')
                setCargando(true)
                setFiltros((actuales) => ({ ...actuales, pagina: actuales.pagina + 1 }))
              }}
              className="rounded-lg border border-slate-300 px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Siguiente
            </button>
          </div>
        </div>
      </section>

      {modalAbierto && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/50 p-4"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !guardando) setModalAbierto(false)
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="form-mantenimiento-titulo"
            className="my-6 w-full max-w-3xl rounded-xl bg-white p-5 shadow-xl sm:p-7"
          >
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 id="form-mantenimiento-titulo" className="text-xl font-bold text-slate-900">
                  Registrar mantenimiento
                </h2>
                <p className="mt-1 text-sm text-slate-600">Completa los datos de la intervención técnica.</p>
              </div>
              <button
                type="button"
                aria-label="Cerrar"
                disabled={guardando}
                onClick={() => setModalAbierto(false)}
                className="rounded-md px-2 py-1 text-xl text-slate-500 hover:bg-slate-100 disabled:opacity-50"
              >
                ×
              </button>
            </div>
            <form className="space-y-4" onSubmit={guardar}>
              {error && (
                <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>
              )}
              {cargandoCatalogos ? (
                <p className="py-5 text-center text-sm text-slate-500">Cargando equipos y técnicos...</p>
              ) : equipos.length === 0 ? (
                <p className="rounded-lg bg-amber-50 p-4 text-sm text-amber-800">
                  No hay equipos activos disponibles para registrar un mantenimiento.
                </p>
              ) : (
                <>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="text-sm font-medium text-slate-700">
                      Equipo intervenido *
                      <select
                        required
                        value={nuevo.equipoId}
                        onChange={(e) => actualizarNuevo('equipoId', e.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                      >
                        <option value="">Selecciona un equipo</option>
                        {equipos.map((equipo) => (
                          <option key={equipo.id} value={equipo.id}>
                            {equipo.codigo_institucional} — {equipo.nombre}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-sm font-medium text-slate-700">
                      Fecha del mantenimiento *
                      <input
                        required
                        type="date"
                        value={nuevo.fecha}
                        onChange={(e) => actualizarNuevo('fecha', e.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                      />
                    </label>
                    <label className="text-sm font-medium text-slate-700">
                      Tipo *
                      <select
                        required
                        value={nuevo.tipo}
                        onChange={(e) => actualizarNuevo('tipo', e.target.value as TipoMantenimiento)}
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                      >
                        <option value="preventivo">Preventivo</option>
                        <option value="correctivo">Correctivo</option>
                      </select>
                    </label>
                    <label className="text-sm font-medium text-slate-700">
                      Estado de la intervención *
                      <select
                        required
                        value={nuevo.estado}
                        onChange={(e) => actualizarNuevo('estado', e.target.value as EstadoMantenimiento)}
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                      >
                        {estadosMantenimiento.map((estado) => (
                          <option key={estado} value={estado}>{etiquetasEstado[estado]}</option>
                        ))}
                      </select>
                    </label>
                    <label className="text-sm font-medium text-slate-700 sm:col-span-2">
                      Problema reportado *
                      <textarea
                        required
                        rows={2}
                        value={nuevo.problema}
                        onChange={(e) => actualizarNuevo('problema', e.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                      />
                    </label>
                    <label className="text-sm font-medium text-slate-700">
                      Diagnóstico
                      <textarea
                        rows={2}
                        value={nuevo.diagnostico}
                        onChange={(e) => actualizarNuevo('diagnostico', e.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                      />
                    </label>
                    <label className="text-sm font-medium text-slate-700">
                      Acciones realizadas
                      <textarea
                        rows={2}
                        value={nuevo.acciones}
                        onChange={(e) => actualizarNuevo('acciones', e.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                      />
                    </label>
                    <label className="text-sm font-medium text-slate-700">
                      Componentes reemplazados
                      <textarea
                        rows={2}
                        value={nuevo.componentes}
                        onChange={(e) => actualizarNuevo('componentes', e.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                      />
                    </label>
                    <label className="text-sm font-medium text-slate-700">
                      Resultado de la intervención
                      <textarea
                        rows={2}
                        value={nuevo.resultado}
                        onChange={(e) => actualizarNuevo('resultado', e.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                      />
                    </label>
                    <label className="text-sm font-medium text-slate-700">
                      Próxima revisión
                      <input
                        type="date"
                        min={nuevo.fecha}
                        value={nuevo.proximaRevision}
                        onChange={(e) => actualizarNuevo('proximaRevision', e.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                      />
                    </label>
                    <label className="text-sm font-medium text-slate-700">
                      Estado resultante del equipo
                      <select
                        value={nuevo.estadoEquipo}
                        onChange={(e) => actualizarNuevo('estadoEquipo', e.target.value as NuevoMantenimiento['estadoEquipo'])}
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                      >
                        <option value="">No modificar estado</option>
                        {estadosOperativos.map((estado) => (
                          <option key={estado} value={estado}>{etiquetasEquipo[estado]}</option>
                        ))}
                      </select>
                    </label>
                    <label className="text-sm font-medium text-slate-700 sm:col-span-2">
                      Observaciones
                      <textarea
                        rows={2}
                        value={nuevo.observaciones}
                        onChange={(e) => actualizarNuevo('observaciones', e.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                      />
                    </label>
                  </div>
                  <p className="text-xs text-slate-500">
                    Técnico responsable: se asignará automáticamente al usuario que inició sesión.
                  </p>
                </>
              )}
              <div className="flex justify-end gap-3 border-t border-slate-200 pt-4">
                <button
                  type="button"
                  disabled={guardando}
                  onClick={() => setModalAbierto(false)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardando || cargandoCatalogos || equipos.length === 0}
                  className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {guardando ? 'Guardando...' : 'Guardar mantenimiento'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </main>
  )
}
