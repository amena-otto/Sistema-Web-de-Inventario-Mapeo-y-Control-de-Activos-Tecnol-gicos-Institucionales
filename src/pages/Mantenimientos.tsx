import { useEffect, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { usePermissions } from '../hooks/usePermissions'
import SearchableSelect from '../components/SearchableSelect'
import {
  actualizarMantenimiento,
  estadosMantenimiento,
  listarEquiposMantenimiento,
  listarMantenimientos,
  listarTecnicosMantenimiento,
  obtenerIndicadoresMantenimiento,
  registrarMantenimiento,
  type ActualizacionMantenimiento,
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

function tecnicoFiltroEtiqueta(tecnico: TecnicoMantenimiento) {
  return `${tecnicoEtiqueta(tecnico)}${tecnico.activo ? '' : ' (inactivo)'}`
}

function etiquetaEstadoEquipo(estado: string | null) {
  if (!estado) return '—'
  return etiquetasEquipo[estado as keyof typeof etiquetasEquipo] ?? estado
}

function textoTransicion(cambio: Mantenimiento['cambios'][number]) {
  const partes: string[] = []
  if (
    cambio.estado_mantenimiento_anterior !==
    cambio.estado_mantenimiento_nuevo
  ) {
    const anterior = cambio.estado_mantenimiento_anterior
      ? etiquetasEstado[cambio.estado_mantenimiento_anterior]
      : 'Alta'
    partes.push(
      `Intervención: ${anterior} → ${etiquetasEstado[cambio.estado_mantenimiento_nuevo]}`,
    )
  }
  if (cambio.estado_equipo_anterior !== cambio.estado_equipo_nuevo) {
    partes.push(
      `Equipo: ${etiquetaEstadoEquipo(cambio.estado_equipo_anterior)} → ${etiquetaEstadoEquipo(cambio.estado_equipo_nuevo)}`,
    )
  }
  return partes.join(' · ')
}

type FormularioEdicion = ActualizacionMantenimiento & {
  fechaMantenimiento: string
  estadoEquipoOriginal: string
  estadoOriginal: EstadoMantenimiento
}

// función de transición no requerida tras simplificación del flujo

const formularioVacio = (): NuevoMantenimiento => ({
  equipoId: '',
  tipo: 'preventivo',
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
  responsableId: '',
  motivoEstado: '',
})

const filtrosVacios: FiltrosMantenimiento = {
  equipoId: '',
  responsableId: '',
  estado: '',
  tipo: '',
  estadoEquipo: '',
  desde: '',
  hasta: '',
  revisionVencida: false,
  ordenReciente: true,
  pagina: 1,
  porPagina,
}

export default function Mantenimientos() {
  const { can, rol } = usePermissions()
  const { perfil } = useAuth()
  const esAdmin = rol === 'admin'
  const [searchParams] = useSearchParams()
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
  const filtrosDesdeUrl = ['equipo', 'estado', 'tipo', 'estadoEquipo', 'revision'].some(
    (clave) => searchParams.has(clave),
  )
  const [filtros, setFiltros] = useState<FiltrosMantenimiento>(() => ({
    ...filtrosVacios,
    equipoId: searchParams.get('equipo') ?? '',
    estado: searchParams.get('estado') ?? '',
    tipo: searchParams.get('tipo') ?? '',
    estadoEquipo: searchParams.get('estadoEquipo') ?? '',
    revisionVencida: searchParams.get('revision') === 'vencida',
    ordenReciente: !filtrosDesdeUrl,
  }))
  const [verHistorialCompleto, setVerHistorialCompleto] = useState(filtrosDesdeUrl)
  const [cargando, setCargando] = useState(true)
  const [cargandoCatalogos, setCargandoCatalogos] = useState(true)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [modalAbierto, setModalAbierto] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [nuevo, setNuevo] = useState<NuevoMantenimiento>(formularioVacio)
  const [edicion, setEdicion] = useState<FormularioEdicion | null>(null)
  const [modoEdicion, setModoEdicion] = useState<'editar' | 'ejecutar'>('editar')
  const [guardandoEdicion, setGuardandoEdicion] = useState(false)
  const [errorEdicion, setErrorEdicion] = useState('')

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
            `${mostrarError(e, 'No se pudo cargar el historial.')}. Verifica que hayas ejecutado las migraciones 008 y 013 en Supabase.`,
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

  const tecnicosActivos = tecnicos.filter((tecnico) => tecnico.activo)
  const otrosTecnicosActivos = tecnicosActivos.filter(
    (tecnico) => tecnico.id !== perfil?.id,
  )
  const nombrePropio = perfil
    ? `${perfil.nombres} ${perfil.apellidos}`.trim()
    : ''
  const equipoSeleccionadoNuevo =
    equipos.find((equipo) => equipo.id === nuevo.equipoId) ?? null
  const cambiaEstadoEquipoNuevo = Boolean(
    nuevo.estadoEquipo &&
      equipoSeleccionadoNuevo &&
      nuevo.estadoEquipo !== equipoSeleccionadoNuevo.estado_operativo,
  )
  const hayFiltros = Boolean(
    filtros.equipoId ||
      filtros.responsableId ||
      filtros.estado ||
      filtros.tipo ||
      filtros.estadoEquipo ||
      filtros.desde ||
      filtros.hasta ||
      filtros.revisionVencida,
  )

  function cambiarFiltro(cambios: Partial<FiltrosMantenimiento>) {
    setError('')
    setCargando(true)
    setFiltros((actuales) => ({ ...actuales, ...cambios, pagina: 1 }))
  }

  function limpiarFiltros() {
    setError('')
    setCargando(true)
    setFiltros((actuales) => ({
      ...filtrosVacios,
      ordenReciente: actuales.ordenReciente,
    }))
  }

  function puedeEditarMantenimiento(mantenimiento: Mantenimiento) {
    if (!puedeRegistrar) return false
    if (esAdmin) return true
    return mantenimiento.responsable_id === perfil?.id
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
    // Al crear un mantenimiento, el estado debe ser siempre Pendiente
    if (nuevo.estado === 'completado') {
      setError('No es posible registrar un mantenimiento directamente como Completado. Debe registrarse como Pendiente.')
      return
    }
    if (cambiaEstadoEquipoNuevo && !nuevo.motivoEstado.trim()) {
      setError('Indica el motivo del cambio de estado del equipo.')
      return
    }

    setGuardando(true)
    try {
      await registrarMantenimiento({ ...nuevo, estado: 'pendiente' })
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

  function abrirEdicion(mantenimiento: Mantenimiento, modo: 'editar' | 'ejecutar' | 'iniciar' = 'editar') {
    const esResponsable = mantenimiento.responsable_id === perfil?.id
    if (modo === 'iniciar') {
      if (!(puedeRegistrar && mantenimiento.estado === 'pendiente' && (esResponsable || esAdmin))) return
    } else if (modo === 'ejecutar') {
      if (!(puedeRegistrar && mantenimiento.estado !== 'completado' && (esResponsable || esAdmin))) return
    } else {
      if (!puedeEditarMantenimiento(mantenimiento) && !(esAdmin)) return
      if (esResponsable === false && !esAdmin) return
    }
    setError('')
    setAviso('')
    setErrorEdicion('')
    setModoEdicion(modo === 'iniciar' ? 'editar' : modo)
    setEdicion({
      id: mantenimiento.id,
      estado: modo === 'iniciar' ? 'en_proceso' : mantenimiento.estado,
      problema: mantenimiento.problema_reportado,
      diagnostico: mantenimiento.diagnostico ?? '',
      acciones: mantenimiento.acciones_realizadas ?? '',
      componentes: mantenimiento.componentes_reemplazados ?? '',
      resultado: mantenimiento.resultado ?? '',
      observaciones: mantenimiento.observaciones ?? '',
      proximaRevision: mantenimiento.proxima_revision ?? '',
      estadoEquipo: mantenimiento.equipo?.estado_operativo ?? '',
      motivoEstado: '',
      responsableId: mantenimiento.responsable_id ?? '',
      fechaMantenimiento: mantenimiento.fecha_mantenimiento,
      estadoEquipoOriginal: mantenimiento.equipo?.estado_operativo ?? '',
      estadoOriginal: mantenimiento.estado,
    })
  }

  function cerrarEdicion() {
    if (!guardandoEdicion) {
      setEdicion(null)
      setModoEdicion('editar')
    }
  }

  function actualizarEdicion<K extends keyof FormularioEdicion>(
    campo: K,
    valor: FormularioEdicion[K],
  ) {
    setEdicion((actual) => {
      if (!actual) return actual
      const siguiente: FormularioEdicion = { ...actual, [campo]: valor }
      if (
        campo === 'estado' &&
        valor === 'completado' &&
        siguiente.estadoEquipo === 'en_mantenimiento'
      ) {
        siguiente.estadoEquipo = 'operativo'
      }
      return siguiente
    })
  }

  async function guardarEdicion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!edicion) return
    setErrorEdicion('')
    setAviso('')

    if (!edicion.problema.trim()) {
      setErrorEdicion('El problema reportado es obligatorio.')
      return
    }
    if (
      edicion.proximaRevision &&
      edicion.proximaRevision < edicion.fechaMantenimiento
    ) {
      setErrorEdicion(
        'La próxima revisión no puede ser anterior a la fecha del mantenimiento.',
      )
      return
    }
    const estadoEquipoResultante =
      edicion.estadoEquipo || edicion.estadoEquipoOriginal
    const cambiaEstadoEquipo =
      Boolean(edicion.estadoEquipo) &&
      edicion.estadoEquipo !== edicion.estadoEquipoOriginal

    const esResponsable = edicion.responsableId === perfil?.id || mantenimientoEnEdicion?.responsable_id === perfil?.id
    if (!esAdmin && !esResponsable) {
      setErrorEdicion('Solo el técnico responsable o un administrador puede gestionar este mantenimiento.')
      return
    }
    if (modoEdicion === 'ejecutar' && edicion.estadoOriginal !== 'completado') {
      if (
        !edicion.diagnostico.trim() ||
        !edicion.acciones.trim() ||
        !edicion.resultado.trim()
      ) {
        setErrorEdicion(
          'Para registrar el mantenimiento realizado debes ingresar diagnóstico, acciones realizadas y resultado.',
        )
        return
      }
      if (estadoEquipoResultante === 'en_mantenimiento') {
        setErrorEdicion(
          'Al completar la intervención debes indicar un estado resultante distinto de "En mantenimiento".',
        )
        return
      }
    }
    if (cambiaEstadoEquipo && !edicion.motivoEstado.trim()) {
      setErrorEdicion('Indica el motivo del cambio de estado del equipo.')
      return
    }

    setGuardandoEdicion(true)
    try {
      const payload = {
        ...edicion,
        estado:
          modoEdicion === 'ejecutar' && edicion.estadoOriginal !== 'completado'
            ? 'completado'
            : edicion.estadoOriginal === 'pendiente' && edicion.estado === 'en_proceso'
              ? 'en_proceso'
              : edicion.estadoOriginal === 'completado'
                ? 'completado'
                : edicion.estado,
      }
      if (payload.estado === 'completado' && edicion.estadoOriginal !== 'completado') {
        if (!edicion.diagnostico.trim() || !edicion.acciones.trim() || !edicion.resultado.trim()) {
          setErrorEdicion(
            'Para registrar el mantenimiento realizado debes ingresar diagnóstico, acciones realizadas y resultado.',
          )
          setGuardandoEdicion(false)
          return
        }
      }
      await actualizarMantenimiento(payload)
      setEdicion(null)
      setModoEdicion('editar')
      setCargando(true)
      setFiltros((actuales) => ({ ...actuales }))
      setAviso(
        modoEdicion === 'ejecutar' && edicion.estadoOriginal !== 'completado'
          ? 'Mantenimiento realizado registrado correctamente.'
          : edicion.estadoOriginal === 'pendiente' && edicion.estado === 'en_proceso'
            ? 'Revisión iniciada correctamente.'
            : 'Intervención actualizada.',
      )
      const valores = await obtenerIndicadoresMantenimiento()
      setIndicadores(valores)
    } catch (e) {
      setErrorEdicion(
        mostrarError(e, 'No se pudo actualizar la intervención.'),
      )
    } finally {
      setGuardandoEdicion(false)
    }
  }

  const totalPaginas = Math.max(1, Math.ceil(total / filtros.porPagina))
  const mantenimientoEnEdicion = edicion
    ? mantenimientos.find((item) => item.id === edicion.id) ?? null
    : null

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
            className="rounded-lg bg-[#3B18AF] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#2f1490]"
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
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              {verHistorialCompleto
                ? 'Historial completo de intervenciones'
                : hayFiltros
                  ? 'Mantenimientos filtrados'
                  : 'Últimos mantenimientos registrados'}
            </h2>
            {!verHistorialCompleto && !hayFiltros && (
              <p className="mt-1 text-xs text-slate-500">Mostrando los 10 registros más recientes.</p>
            )}
            {hayFiltros && (
              <p className="mt-1 text-xs text-slate-500">
                {total} registro{total === 1 ? '' : 's'} con los filtros seleccionados.
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setError('')
                setCargando(true)
                setFiltros((actuales) => ({ ...actuales }))
              }}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Actualizar
            </button>
            <button
              type="button"
              onClick={() => {
                setError('')
                setCargando(true)
                const mostrarHistorial = !verHistorialCompleto
                setFiltros((actuales) => ({
                  ...actuales,
                  pagina: 1,
                  ordenReciente: !mostrarHistorial,
                }))
                setVerHistorialCompleto((actual) => !actual)
              }}
              className="rounded-lg border border-blue-200 px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50"
            >
              {verHistorialCompleto ? 'Ver últimos registros' : 'Ver historial completo'}
            </button>
          </div>
        </div>

        {filtros.revisionVencida && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <span>Listado filtrado: equipos con revisión vencida.</span>
            <button
              type="button"
              onClick={() => cambiarFiltro({ revisionVencida: false })}
              className="font-semibold underline"
            >
              Quitar filtro
            </button>
          </div>
        )}

        <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
          <div className="text-sm text-slate-700">
            <SearchableSelect
              label="Equipo"
              placeholder="Todos"
              value={filtros.equipoId}
              onChange={(value) => cambiarFiltro({ equipoId: value })}
              options={equipos.map((equipo) => ({
                value: equipo.id,
                label: `${equipo.codigo_institucional} — ${equipo.nombre}`,
                keywords: `${equipo.codigo_institucional} ${equipo.nombre}`,
              }))}
            />
          </div>
          <div className="text-sm text-slate-700">
            <SearchableSelect
              label="Técnico responsable"
              placeholder="Todos"
              value={filtros.responsableId}
              onChange={(value) => cambiarFiltro({ responsableId: value })}
              options={tecnicos.map((tecnico) => ({
                value: tecnico.id,
                label: tecnicoFiltroEtiqueta(tecnico),
                keywords: `${tecnico.nombres} ${tecnico.apellidos}`,
              }))}
            />
          </div>
          <div className="text-sm text-slate-700">
            <SearchableSelect
              label="Estado de la intervención"
              placeholder="Todos"
              value={filtros.estado}
              onChange={(value) => cambiarFiltro({ estado: value })}
              options={estadosMantenimiento.map((estado) => ({
                value: estado,
                label: etiquetasEstado[estado],
              }))}
            />
          </div>
          <div className="text-sm text-slate-700">
            <SearchableSelect
              label="Tipo"
              placeholder="Todos"
              value={filtros.tipo}
              onChange={(value) => cambiarFiltro({ tipo: value })}
              options={([
                { value: 'preventivo', label: etiquetasTipo.preventivo },
                { value: 'correctivo', label: etiquetasTipo.correctivo },
              ])}
            />
          </div>
          <></>
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
        {hayFiltros && (
          <div className="mb-4 flex justify-end">
            <button
              type="button"
              onClick={limpiarFiltros}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Limpiar filtros
            </button>
          </div>
        )}

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
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      mantenimiento.estado === 'completado'
                        ? 'bg-green-100 text-green-800'
                        : mantenimiento.estado === 'en_proceso'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-amber-100 text-amber-800'
                    }`}>
                      {etiquetasEstado[mantenimiento.estado]}
                    </span>
                    {(mantenimiento.responsable_id === perfil?.id || esAdmin) && mantenimiento.estado === 'pendiente' && (
                      <button
                        type="button"
                        onClick={() => abrirEdicion(mantenimiento, 'iniciar')}
                        className="rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-600"
                      >
                        Iniciar revisión
                      </button>
                    )}
                    {(mantenimiento.responsable_id === perfil?.id || esAdmin) && mantenimiento.estado === 'en_proceso' && (
                      <button
                        type="button"
                        onClick={() => abrirEdicion(mantenimiento, 'ejecutar')}
                        className="rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-600"
                      >
                        Mantenimiento realizado
                      </button>
                    )}
                    {(mantenimiento.responsable_id === perfil?.id || esAdmin) && mantenimiento.estado !== 'completado' && (
                      <button
                        type="button"
                        onClick={() => abrirEdicion(mantenimiento, 'editar')}
                        className="rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-600"
                      >
                        Editar
                      </button>
                    )}
                    {puedeRegistrar && mantenimiento.estado === 'completado' && (
                      <button
                        type="button"
                        onClick={() => {
                          setError('')
                          setAviso('')
                          // abrir modal para agendar nueva revisión
                          setNuevo({
                            ...formularioVacio(),
                            equipoId: mantenimiento.equipo_id,
                            tipo: mantenimiento.tipo,
                            fecha: fechaLocal(),
                            problema: '',
                            proximaRevision: '',
                            responsableId: '',
                          })
                          setModalAbierto(true)
                        }}
                        className="rounded-lg border border-indigo-200 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-50"
                      >
                        Agendar nueva revisión
                      </button>
                    )}
                    {(mantenimiento.responsable_id === perfil?.id || esAdmin) && mantenimiento.estado === 'completado' && (
                      <button
                        type="button"
                        onClick={() => abrirEdicion(mantenimiento, 'editar')}
                        className="rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-600"
                      >
                        Editar
                      </button>
                    )}
                  </div>
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
                    <div className="sm:col-span-2">
                      <dt className="font-medium text-slate-700">Cambios de estado derivados</dt>
                      <dd className="mt-1 text-slate-600">
                        {mantenimiento.cambios.length ? (
                          <ul className="space-y-1">
                            {mantenimiento.cambios.map((cambio) => (
                              <li key={cambio.id}>
                                <span className="font-medium text-slate-700">
                                  {textoTransicion(cambio) || 'Actualización registrada'}
                                </span>
                                {' · '}
                                {fechaCorta(cambio.created_at)}
                                {cambio.usuario
                                  ? ` · ${cambio.usuario.nombres} ${cambio.usuario.apellidos}`.trim()
                                  : ''}
                                {cambio.motivo ? ` · Motivo: ${cambio.motivo}` : ''}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          'Sin cambios de estado registrados.'
                        )}
                      </dd>
                    </div>
                  </dl>
                </details>
              </article>
            ))}
          </div>
        )}

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
          <span>
            {mantenimientos.length} de {total} registro{total === 1 ? '' : 's'}
          </span>
          {totalPaginas > 1 && <div className="flex items-center gap-2">
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
          </div>}
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
                      <input
                        type="text"
                        readOnly
                        value={etiquetasEstado['pendiente']}
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-100 px-3 py-2 text-slate-600"
                      />
                      <input type="hidden" value="pendiente" readOnly />
                    </label>
                    <label className="text-sm font-medium text-slate-700 sm:col-span-2">
                      Problema reportado / Motivo de la programación *
                      <textarea
                        required
                        rows={2}
                        value={nuevo.problema}
                        onChange={(e) => actualizarNuevo('problema', e.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                      />
                    </label>
                    <label className="text-sm font-medium text-slate-700">
                      Próxima revisión (opcional)
                      <input
                        type="date"
                        min={nuevo.fecha}
                        value={nuevo.proximaRevision}
                        onChange={(e) => actualizarNuevo('proximaRevision', e.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                      />
                    </label>
                    <label className="text-sm font-medium text-slate-700">
                      Observaciones (opcional)
                      <textarea
                        rows={2}
                        value={nuevo.observaciones}
                        onChange={(e) => actualizarNuevo('observaciones', e.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                      />
                    </label>
                    <label className="text-sm font-medium text-slate-700">
                      Técnico responsable
                      <select
                        disabled={!esAdmin}
                        value={nuevo.responsableId}
                        onChange={(e) => actualizarNuevo('responsableId', e.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 disabled:bg-slate-100 disabled:text-slate-600"
                      >
                        <option value="">{nombrePropio ? `${nombrePropio} (yo)` : 'Usuario actual'}</option>
                        {esAdmin &&
                          otrosTecnicosActivos.map((tecnico) => (
                            <option key={tecnico.id} value={tecnico.id}>
                              {tecnicoEtiqueta(tecnico)}
                            </option>
                          ))}
                      </select>
                      <span className="mt-1 block text-xs font-normal text-slate-500">
                        {esAdmin
                          ? 'Puedes asignar la intervención a otro técnico activo.'
                          : 'Solo un administrador puede asignar la intervención a otro técnico.'}
                      </span>
                    </label>
                  </div>
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
                  className="rounded-lg bg-[#3B18AF] px-4 py-2 text-sm font-semibold text-white hover:bg-[#2f1490] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {guardando ? 'Guardando...' : 'Guardar mantenimiento'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {edicion && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/50 p-4"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !guardandoEdicion) cerrarEdicion()
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="form-edicion-titulo"
            className="my-6 w-full max-w-3xl rounded-xl bg-white p-5 shadow-xl sm:p-7"
          >
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 id="form-edicion-titulo" className="text-xl font-bold text-slate-900">
                  {edicion.estadoOriginal === 'pendiente' && edicion.estado === 'en_proceso'
                    ? 'Iniciar revisión'
                    : modoEdicion === 'ejecutar' && edicion.estadoOriginal !== 'completado'
                      ? 'Registrar mantenimiento realizado'
                      : edicion.estadoOriginal === 'completado'
                        ? 'Editar mantenimiento'
                        : 'Editar mantenimiento'}
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  {mantenimientoEnEdicion?.equipo
                    ? `${mantenimientoEnEdicion.equipo.codigo_institucional} — ${mantenimientoEnEdicion.equipo.nombre}`
                    : 'Intervención técnica'}{' '}
                  · Programado: {fechaCorta(edicion.fechaMantenimiento)}
                </p>
              </div>
              <button
                type="button"
                aria-label="Cerrar"
                disabled={guardandoEdicion}
                onClick={cerrarEdicion}
                className="rounded-md px-2 py-1 text-xl text-slate-500 hover:bg-slate-100 disabled:opacity-50"
              >
                ×
              </button>
            </div>
            <form className="space-y-4" onSubmit={guardarEdicion}>
              {errorEdicion && (
                <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                  {errorEdicion}
                </div>
              )}
              {edicion.estadoOriginal === 'pendiente' && edicion.estado === 'en_proceso' && (
                <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  Esta acción iniciará la revisión y cambiará el estado a <strong>En proceso</strong>.
                </div>
              )}
              {modoEdicion === 'ejecutar' && edicion.estadoOriginal !== 'completado' && edicion.estadoOriginal !== 'pendiente' && (
                <div className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                  Esta acción registrará la ejecución real del mantenimiento y lo marcará como <strong>Completado</strong>.
                </div>
              )}
              {edicion.estadoOriginal === 'completado' && (
                <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  Estado actual de la intervención: <strong>{etiquetasEstado[edicion.estadoOriginal]}</strong>.
                </div>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-sm font-medium text-slate-700">
                  Estado de la intervención *
                  <input
                    type="text"
                    readOnly
                    value={edicion.estadoOriginal === 'pendiente' && edicion.estado === 'en_proceso' ? etiquetasEstado['en_proceso'] : modoEdicion === 'ejecutar' && edicion.estadoOriginal !== 'completado' && edicion.estadoOriginal !== 'pendiente' ? etiquetasEstado['completado'] : etiquetasEstado[edicion.estado]}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-100 px-3 py-2 text-slate-600"
                  />
                  {edicion.estadoOriginal === 'pendiente' && edicion.estado === 'en_proceso' && (
                    <input type="hidden" value="en_proceso" />
                  )}
                  {modoEdicion === 'ejecutar' && edicion.estadoOriginal !== 'completado' && edicion.estadoOriginal !== 'pendiente' && (
                    <input type="hidden" value="completado" />
                  )}
                </label>
                <div className="text-sm font-medium text-slate-700">
                  Fecha del mantenimiento
                  <p className="mt-1 rounded-lg bg-slate-100 px-3 py-2 font-normal text-slate-600">
                    {fechaCorta(edicion.fechaMantenimiento)}
                  </p>
                </div>
                <label className="text-sm font-medium text-slate-700 sm:col-span-2">
                  Problema reportado *
                  <textarea
                    required
                    rows={2}
                    value={edicion.problema}
                    onChange={(e) => actualizarEdicion('problema', e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                    readOnly={edicion.estadoOriginal === 'completado' && !esAdmin}
                  />
                </label>
                {(modoEdicion === 'ejecutar' || edicion.estadoOriginal === 'completado') && edicion.estadoOriginal !== 'pendiente' && (
                  <>
                    <label className="text-sm font-medium text-slate-700">
                      Diagnóstico
                      <textarea
                        rows={2}
                        value={edicion.diagnostico}
                        onChange={(e) => actualizarEdicion('diagnostico', e.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                      />
                      {modoEdicion === 'ejecutar' && edicion.estadoOriginal !== 'completado' && (
                        <span className="mt-1 block text-xs font-normal text-slate-500">Obligatorio para completar.</span>
                      )}
                    </label>
                    <label className="text-sm font-medium text-slate-700">
                      Acciones realizadas
                      <textarea
                        rows={2}
                        value={edicion.acciones}
                        onChange={(e) => actualizarEdicion('acciones', e.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                      />
                      {modoEdicion === 'ejecutar' && edicion.estadoOriginal !== 'completado' && (
                        <span className="mt-1 block text-xs font-normal text-slate-500">Obligatorio para completar.</span>
                      )}
                    </label>
                    <label className="text-sm font-medium text-slate-700">
                      Componentes reemplazados
                      <textarea
                        rows={2}
                        value={edicion.componentes}
                        onChange={(e) => actualizarEdicion('componentes', e.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                      />
                    </label>
                    <label className="text-sm font-medium text-slate-700">
                      Resultado de la intervención
                      <textarea
                        rows={2}
                        value={edicion.resultado}
                        onChange={(e) => actualizarEdicion('resultado', e.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                      />
                      {modoEdicion === 'ejecutar' && edicion.estadoOriginal !== 'completado' && (
                        <span className="mt-1 block text-xs font-normal text-slate-500">Obligatorio para completar.</span>
                      )}
                    </label>
                  </>
                )}
                <label className="text-sm font-medium text-slate-700">
                  Próxima revisión
                  <input
                    type="date"
                    min={edicion.fechaMantenimiento}
                    value={edicion.proximaRevision}
                    onChange={(e) => actualizarEdicion('proximaRevision', e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                  />
                </label>
                <label className="text-sm font-medium text-slate-700">
                  Estado resultante del equipo
                  <select
                    value={edicion.estadoEquipo}
                    onChange={(e) =>
                      actualizarEdicion('estadoEquipo', e.target.value as ActualizacionMantenimiento['estadoEquipo'])
                    }
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                  >
                    <option value="">No modificar estado</option>
                    {estadosOperativos
                      .filter(
                        (estado) =>
                          !(edicion.estado === 'completado' && estado === 'en_mantenimiento'),
                      )
                      .map((estado) => (
                        <option key={estado} value={estado}>{etiquetasEquipo[estado]}</option>
                      ))}
                  </select>
                  {edicion.estado === 'completado' && (
                    <span className="mt-1 block text-xs font-normal text-slate-500">
                      Al completar, el equipo no puede quedar en mantenimiento.
                    </span>
                  )}
                </label>
                {edicion.estadoEquipo &&
                  edicion.estadoEquipo !== edicion.estadoEquipoOriginal && (
                  <label className="text-sm font-medium text-slate-700 sm:col-span-2">
                    Motivo del cambio de estado del equipo *
                    <textarea
                      required
                      rows={2}
                      value={edicion.motivoEstado}
                      onChange={(e) => actualizarEdicion('motivoEstado', e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                    />
                    <span className="mt-1 block text-xs font-normal text-slate-500">
                      Cambio: {etiquetaEstadoEquipo(edicion.estadoEquipoOriginal)} →{' '}
                      {edicion.estadoEquipo
                        ? etiquetaEstadoEquipo(edicion.estadoEquipo)
                        : 'sin cambio'}
                    </span>
                  </label>
                )}
                <label className="text-sm font-medium text-slate-700 sm:col-span-2">
                  Técnico responsable
                  {esAdmin ? (
                    <select
                      required
                      value={edicion.responsableId}
                      onChange={(e) => actualizarEdicion('responsableId', e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                    >
                      {edicion.responsableId &&
                        !tecnicosActivos.some(
                          (tecnico) => tecnico.id === edicion.responsableId,
                        ) && (
                          <option value={edicion.responsableId}>
                            Asignación actual (inactivo)
                          </option>
                        )}
                      {tecnicosActivos.map((tecnico) => (
                        <option key={tecnico.id} value={tecnico.id}>
                          {tecnicoEtiqueta(tecnico)}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <p className="mt-1 rounded-lg bg-slate-100 px-3 py-2 font-normal text-slate-600">
                      {nombrePropio || 'Usuario actual'}
                    </p>
                  )}
                </label>
                <label className="text-sm font-medium text-slate-700 sm:col-span-2">
                  Observaciones
                  <textarea
                    rows={2}
                    value={edicion.observaciones}
                    onChange={(e) => actualizarEdicion('observaciones', e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                  />
                </label>
              </div>
              <div className="flex justify-end gap-3 border-t border-slate-200 pt-4">
                <button
                  type="button"
                  disabled={guardandoEdicion}
                  onClick={cerrarEdicion}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardandoEdicion}
                  className="rounded-lg bg-[#3B18AF] px-4 py-2 text-sm font-semibold text-white hover:bg-[#2f1490] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {guardandoEdicion ? 'Guardando...' : 'Guardar cambios'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </main>
  )
}
