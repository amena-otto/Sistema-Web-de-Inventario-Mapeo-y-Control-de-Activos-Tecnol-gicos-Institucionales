import { useEffect, useState, type FormEvent } from 'react'
import { usePermissions } from '../hooks/usePermissions'
import {
  etiquetaUbicacion,
  listarAmbientesMovimiento,
  listarEquiposHistorialMovimiento,
  listarEquiposMovimiento,
  listarHistorialMovimientos,
  listarResponsablesMovimiento,
  registrarMovimiento,
  type EquipoMovimiento,
  type EquipoFiltroMovimiento,
  type FiltrosMovimiento,
  type Movimiento,
  type ResponsableMovimiento,
  type AmbienteMovimiento,
} from '../services/movimientosService'

const porPagina = 15

function fechaLocal() {
  const fecha = new Date()
  return new Date(
    fecha.getTime() - fecha.getTimezoneOffset() * 60_000,
  ).toISOString().slice(0, 10)
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

function nombreResponsable(responsable: ResponsableMovimiento) {
  return `${responsable.nombres} ${responsable.apellidos}`.trim()
}

export default function Movimientos() {
  const { can } = usePermissions()
  const puedeRegistrar = can('movimientos.registrar')
  const [equipos, setEquipos] = useState<EquipoMovimiento[]>([])
  const [equiposHistorial, setEquiposHistorial] = useState<EquipoFiltroMovimiento[]>([])
  const [ambientes, setAmbientes] = useState<AmbienteMovimiento[]>([])
  const [responsables, setResponsables] = useState<ResponsableMovimiento[]>([])
  const [movimientos, setMovimientos] = useState<Movimiento[]>([])
  const [total, setTotal] = useState(0)
  const [catalogosCargando, setCatalogosCargando] = useState(true)
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [modalAbierto, setModalAbierto] = useState(false)
  const [actualizacion, setActualizacion] = useState(0)
  const [filtros, setFiltros] = useState<FiltrosMovimiento>({
    equipoId: '',
    desde: '',
    hasta: '',
    pagina: 1,
    porPagina,
  })
  const [nuevo, setNuevo] = useState({
    equipoId: '',
    ambienteDestinoId: '',
    responsableNuevoId: '',
    posicionNueva: '',
    fecha: fechaLocal(),
    motivo: '',
  })

  useEffect(() => {
    let vigente = true
    Promise.all([
      listarEquiposMovimiento(),
      listarEquiposHistorialMovimiento(),
      listarAmbientesMovimiento(),
      listarResponsablesMovimiento(),
    ])
      .then(([equiposDisponibles, equiposTodos, ambientesDisponibles, personalActivo]) => {
        if (!vigente) return
        setEquipos(equiposDisponibles)
        setEquiposHistorial(equiposTodos)
        setAmbientes(ambientesDisponibles)
        setResponsables(personalActivo.filter((responsable) => responsable.activo))
      })
      .catch((e: unknown) => {
        if (vigente) {
          setError(
            `${mostrarError(e, 'No se pudieron cargar los catálogos.')}. Verifica que hayas ejecutado la migración 010 en Supabase.`,
          )
        }
      })
      .finally(() => {
        if (vigente) setCatalogosCargando(false)
      })
    return () => {
      vigente = false
    }
  }, [])

  useEffect(() => {
    let vigente = true
    listarHistorialMovimientos(filtros)
      .then((resultado) => {
        if (!vigente) return
        setMovimientos(resultado.movimientos)
        setTotal(resultado.total)
      })
      .catch((e: unknown) => {
        if (vigente) {
          setError(
            `${mostrarError(e, 'No se pudo cargar el historial de movimientos.')}. Verifica que hayas ejecutado la migración 010 en Supabase.`,
          )
        }
      })
      .finally(() => {
        if (vigente) setCargando(false)
      })
    return () => {
      vigente = false
    }
  }, [filtros, actualizacion])

  function cambiarFiltro(cambios: Partial<FiltrosMovimiento>) {
    setError('')
    setCargando(true)
    setFiltros((actual) => ({ ...actual, ...cambios, pagina: 1 }))
  }

  function seleccionarEquipo(equipoId: string) {
    const equipo = equipos.find((item) => item.id === equipoId)
    setNuevo((actual) => ({
      ...actual,
      equipoId,
      ambienteDestinoId: equipo?.ambiente_id ?? '',
      responsableNuevoId: equipo?.responsable_id ?? '',
      posicionNueva: equipo?.posicion ?? '',
    }))
  }

  async function guardar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setAviso('')
    if (!nuevo.equipoId) {
      setError('Selecciona el equipo que se trasladará o reasignará.')
      return
    }

    setGuardando(true)
    try {
      await registrarMovimiento({
        equipoId: nuevo.equipoId,
        ambienteDestinoId: nuevo.ambienteDestinoId || null,
        responsableNuevoId: nuevo.responsableNuevoId || null,
        posicionNueva: nuevo.posicionNueva.trim() || null,
        fecha: nuevo.fecha,
        motivo: nuevo.motivo,
      })
      setModalAbierto(false)
      setNuevo({
        equipoId: '',
        ambienteDestinoId: '',
        responsableNuevoId: '',
        posicionNueva: '',
        fecha: fechaLocal(),
        motivo: '',
      })
      setAviso('Movimiento registrado; la ubicación y asignación actuales fueron actualizadas.')
      setCargando(true)
      setFiltros((actual) => ({ ...actual, pagina: 1 }))
      setActualizacion((actual) => actual + 1)
    } catch (e) {
      setError(mostrarError(e, 'No se pudo registrar el movimiento.'))
      return
    } finally {
      setGuardando(false)
    }

    try {
      const [equiposActualizados, equiposTodos] = await Promise.all([
        listarEquiposMovimiento(),
        listarEquiposHistorialMovimiento(),
      ])
      setEquipos(equiposActualizados)
      setEquiposHistorial(equiposTodos)
    } catch (e) {
      setError(
        `El movimiento se registró, pero no se pudieron actualizar los equipos disponibles: ${mostrarError(e, 'error desconocido')}`,
      )
    }
  }

  function abrirFormulario() {
    setError('')
    setAviso('')
    setNuevo({
      equipoId: '',
      ambienteDestinoId: '',
      responsableNuevoId: '',
      posicionNueva: '',
      fecha: fechaLocal(),
      motivo: '',
    })
    setModalAbierto(true)
  }

  const totalPaginas = Math.max(1, Math.ceil(total / porPagina))
  const equipoSeleccionado = equipos.find((equipo) => equipo.id === nuevo.equipoId)
  const responsablesPorId = new Map(responsables.map((item) => [item.id, item]))
  const responsableActual = responsablesPorId.get(equipoSeleccionado?.responsable_id ?? '')
  const responsableActualNoActivo =
    equipoSeleccionado?.responsable_id &&
    !responsableActual
      ? equipoSeleccionado.responsable_id
      : null
  const ambienteActualNoActivo =
    equipoSeleccionado?.ambiente_id &&
    !ambientes.some((ambiente) => ambiente.id === equipoSeleccionado.ambiente_id)
      ? equipoSeleccionado.ambiente_id
      : null

  return (
    <main className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Movimientos y asignaciones</h1>
          <p className="mt-1 text-sm text-slate-600">
            Registra traslados y cambios de responsable sin perder el historial anterior.
          </p>
        </div>
        {puedeRegistrar && (
          <button
            type="button"
            onClick={abrirFormulario}
            className="rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-800"
          >
            Registrar movimiento
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

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Historial de movimientos</h2>
            <p className="mt-1 text-sm text-slate-600">
              Cada traslado registra ubicación, responsable, fecha, motivo y usuario que lo efectuó.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setError('')
              setCargando(true)
              setActualizacion((actual) => actual + 1)
            }}
            className="text-sm font-medium text-blue-700 hover:text-blue-900"
          >
            Actualizar
          </button>
        </div>

        <div className="mb-5 grid gap-3 sm:grid-cols-3">
          <label className="text-sm text-slate-700">
            Equipo
            <select
              value={filtros.equipoId}
              onChange={(event) => cambiarFiltro({ equipoId: event.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
            >
              <option value="">Todos los equipos</option>
              {equiposHistorial.map((equipo) => (
                <option key={equipo.id} value={equipo.id}>
                  {equipo.codigo_institucional} — {equipo.nombre}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm text-slate-700">
            Desde
            <input
              type="date"
              value={filtros.desde}
              onChange={(event) => cambiarFiltro({ desde: event.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="text-sm text-slate-700">
            Hasta
            <input
              type="date"
              value={filtros.hasta}
              onChange={(event) => cambiarFiltro({ hasta: event.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>
        </div>

        {cargando ? (
          <p className="py-10 text-center text-sm text-slate-500">Cargando historial...</p>
        ) : movimientos.length === 0 ? (
          <p className="rounded-lg bg-slate-50 px-4 py-10 text-center text-sm text-slate-600">
            No hay movimientos que coincidan con los filtros.
          </p>
        ) : (
          <div className="space-y-3">
            {movimientos.map((movimiento) => (
              <article key={movimiento.id} className="rounded-lg border border-slate-200 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-900">
                      {movimiento.codigo_institucional} — {movimiento.equipo_nombre}
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      {fechaCorta(movimiento.fecha_movimiento)}
                      {movimiento.actor ? ` · Registrado por ${movimiento.actor}` : ''}
                    </p>
                  </div>
                  <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-800">
                    Movimiento registrado
                  </span>
                </div>
                <div className="mt-4 grid gap-4 text-sm md:grid-cols-2">
                  <div className="rounded-lg bg-slate-50 p-3">
                    <p className="font-medium text-slate-700">Ubicación</p>
                    <p className="mt-1 text-slate-600">{movimiento.ubicacion_origen ?? 'Sin ubicación'}</p>
                    <p className="my-1 text-xs font-semibold uppercase text-slate-400">Traslado a</p>
                    <p className="text-slate-800">{movimiento.ubicacion_destino ?? 'Sin ubicación'}</p>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-3">
                    <p className="font-medium text-slate-700">Responsable</p>
                    <p className="mt-1 text-slate-600">{movimiento.responsable_anterior ?? 'Sin responsable'}</p>
                    <p className="my-1 text-xs font-semibold uppercase text-slate-400">Asignado a</p>
                    <p className="text-slate-800">{movimiento.responsable_nuevo ?? 'Sin responsable'}</p>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-3 md:col-span-2">
                    <p className="font-medium text-slate-700">Posición en el ambiente</p>
                    <p className="mt-1 text-slate-600">{movimiento.posicion_anterior ?? 'Sin posición'}</p>
                    <p className="my-1 text-xs font-semibold uppercase text-slate-400">Nueva posición</p>
                    <p className="text-slate-800">{movimiento.posicion_nueva ?? 'Sin posición'}</p>
                  </div>
                </div>
                <p className="mt-3 text-sm text-slate-700">
                  <span className="font-medium">Motivo:</span> {movimiento.motivo}
                </p>
              </article>
            ))}
          </div>
        )}

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
          <span>{total} movimiento{total === 1 ? '' : 's'}</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={filtros.pagina <= 1 || cargando}
              onClick={() => {
                setError('')
                setCargando(true)
                setFiltros((actual) => ({ ...actual, pagina: actual.pagina - 1 }))
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
                setFiltros((actual) => ({ ...actual, pagina: actual.pagina + 1 }))
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
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !guardando) setModalAbierto(false)
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="form-movimiento-titulo"
            className="my-6 w-full max-w-2xl rounded-xl bg-white p-5 shadow-xl sm:p-7"
          >
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 id="form-movimiento-titulo" className="text-xl font-bold text-slate-900">
                  Registrar traslado o reasignación
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  La ubicación y el responsable actuales se guardarán como origen.
                </p>
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

            <form onSubmit={(event) => void guardar(event)} className="space-y-4">
              {error && (
                <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                  {error}
                </div>
              )}
              {catalogosCargando ? (
                <p className="py-6 text-center text-sm text-slate-500">Cargando equipos, ubicaciones y personal...</p>
              ) : equipos.length === 0 ? (
                <p className="rounded-lg bg-amber-50 p-4 text-sm text-amber-800">
                  No hay equipos activos disponibles para trasladar o reasignar.
                </p>
              ) : (
                <>
                  <label className="block text-sm font-medium text-slate-700">
                    Equipo *
                    <select
                      required
                      value={nuevo.equipoId}
                      onChange={(event) => seleccionarEquipo(event.target.value)}
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

                  {equipoSeleccionado && (
                    <div className="grid gap-3 rounded-lg bg-slate-50 p-3 text-sm sm:grid-cols-2">
                      <p>
                        <span className="font-medium text-slate-700">Ubicación actual:</span>{' '}
                        {etiquetaUbicacion(equipoSeleccionado.ambiente_id, ambientes)}
                      </p>
                      <p>
                        <span className="font-medium text-slate-700">Posición actual:</span>{' '}
                        {equipoSeleccionado.posicion || 'Sin posición'}
                      </p>
                      <p>
                        <span className="font-medium text-slate-700">Responsable actual:</span>{' '}
                        {responsableActual
                          ? nombreResponsable(responsableActual)
                          : responsableActualNoActivo
                            ? 'Cuenta inactiva'
                            : 'Sin responsable'}
                      </p>
                    </div>
                  )}

                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="text-sm font-medium text-slate-700">
                      Nueva ubicación
                      <select
                        value={nuevo.ambienteDestinoId}
                        onChange={(event) => setNuevo((actual) => ({
                          ...actual,
                          ambienteDestinoId: event.target.value,
                        }))}
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                      >
                        <option value="">Sin ubicación</option>
                        {ambienteActualNoActivo && (
                          <option value={ambienteActualNoActivo} disabled>
                            Ubicación actual (inactiva; no seleccionable)
                          </option>
                        )}
                        {ambientes.map((ambiente) => (
                          <option key={ambiente.id} value={ambiente.id}>
                            {ambiente.pabellon} / {ambiente.piso} / {ambiente.codigo} — {ambiente.nombre}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-sm font-medium text-slate-700">
                      Nuevo responsable
                      <select
                        value={nuevo.responsableNuevoId}
                        onChange={(event) => setNuevo((actual) => ({
                          ...actual,
                          responsableNuevoId: event.target.value,
                        }))}
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                      >
                        <option value="">Sin responsable</option>
                        {responsableActualNoActivo && (
                          <option value={responsableActualNoActivo} disabled>
                            Responsable actual (cuenta inactiva; no seleccionable)
                          </option>
                        )}
                        {responsables.map((responsable) => (
                          <option key={responsable.id} value={responsable.id}>
                            {nombreResponsable(responsable)} — {responsable.rol}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-sm font-medium text-slate-700 sm:col-span-2">
                      Nueva posición en el ambiente
                      <input
                        maxLength={100}
                        value={nuevo.posicionNueva}
                        onChange={(event) => setNuevo((actual) => ({
                          ...actual,
                          posicionNueva: event.target.value,
                        }))}
                        placeholder="Ej. Escritorio 4"
                        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                      />
                    </label>
                    <label className="text-sm font-medium text-slate-700">
                      Fecha del movimiento *
                      <input
                        required
                        type="date"
                        value={nuevo.fecha}
                        onChange={(event) => setNuevo((actual) => ({
                          ...actual,
                          fecha: event.target.value,
                        }))}
                        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                      />
                    </label>
                    <label className="text-sm font-medium text-slate-700 sm:col-span-2">
                      Motivo del movimiento *
                      <textarea
                        required
                        minLength={2}
                        maxLength={1000}
                        rows={3}
                        value={nuevo.motivo}
                        onChange={(event) => setNuevo((actual) => ({
                          ...actual,
                          motivo: event.target.value,
                        }))}
                        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                        placeholder="Indica por qué se traslada o reasigna el equipo."
                      />
                    </label>
                  </div>
                  <p className="text-xs text-slate-500">
                    El usuario que confirma la operación queda registrado automáticamente como responsable del movimiento.
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
                  disabled={guardando || catalogosCargando || equipos.length === 0}
                  className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {guardando ? 'Guardando...' : 'Guardar movimiento'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </main>
  )
}
