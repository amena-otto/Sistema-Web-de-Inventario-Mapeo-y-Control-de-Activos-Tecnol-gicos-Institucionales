import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { usePermissions } from '../hooks/usePermissions'
import SearchableSelect from '../components/SearchableSelect'
import {
  actualizarMantenimiento,
  buscarEquiposMantenimiento,
  estadosMantenimiento,
  estadosOperativosFinales,
  finalizarMantenimiento,
  guardarAvanceMantenimiento,
  iniciarMantenimiento,
  listarEquiposMantenimiento,
  listarMantenimientos,
  listarTecnicosMantenimiento,
  obtenerIndicadoresMantenimiento,
  registrarMantenimiento,
  type ActualizacionMantenimiento,
  type DatosAvanceMantenimiento,
  type DatosCierreMantenimiento,
  type EquipoMantenimiento,
  type EstadoMantenimiento,
  type EstadoOperativoFinal,
  type FiltrosMantenimiento,
  type Mantenimiento,
  type NuevoMantenimiento,
  type TecnicoMantenimiento,
  type TipoMantenimiento,
} from '../services/mantenimientosService'
import { estadosOperativos } from '../services/equiposService'

const porPagina = 10
const tamanoBusquedaEquipos = 20

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
const etiquetasEstadoFinal: Record<EstadoOperativoFinal, string> = {
  operativo: 'Operativo',
  con_fallas: 'Operativo con observaciones',
  inoperativo: 'Inoperativo',
}

type DatosAvanceForm = Omit<DatosAvanceMantenimiento, 'mantenimientoId'>
type DatosCierreForm = Omit<
  DatosCierreMantenimiento,
  'mantenimientoId' | 'estadoOperativoFinal'
> & {
  estadoOperativoFinal: EstadoOperativoFinal | ''
}

type FormularioEdicion = ActualizacionMantenimiento & {
  fechaMantenimiento: string
  estadoOriginal: EstadoMantenimiento
}

function fechaLocal() {
  const fecha = new Date()
  const offset = fecha.getTimezoneOffset()
  return new Date(fecha.getTime() - offset * 60_000).toISOString().slice(0, 10)
}

function fechaHoraLocal(value: string) {
  const fecha = new Date(value)
  if (Number.isNaN(fecha.getTime())) return '—'
  const offset = fecha.getTimezoneOffset()
  return new Date(fecha.getTime() - offset * 60_000)
    .toISOString()
    .slice(0, 16)
    .replace('T', ' ')
}

function fechaHoraISO(value: string) {
  if (!value) return ''
  const fecha = new Date(value)
  return Number.isNaN(fecha.getTime()) ? '' : fecha.toISOString()
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

function nombreUsuario(usuario: { nombres: string; apellidos: string } | null) {
  return usuario ? `${usuario.nombres} ${usuario.apellidos}`.trim() : 'Usuario no disponible'
}

const formularioVacio = (): NuevoMantenimiento => ({
  equipoId: '',
  tipo: 'preventivo',
  fecha: fechaLocal(),
  problema: '',
  observaciones: '',
  proximaRevision: '',
  responsableId: '',
})

const avanceVacio = (): DatosAvanceForm => ({
  descripcion: '',
  observaciones: '',
  diagnostico: '',
  acciones: '',
  componentes: '',
  proximoSeguimiento: '',
  actualizarSeguimiento: false,
})

const cierreVacio = (): DatosCierreForm => ({
  diagnostico: '',
  acciones: '',
  resultado: '',
  estadoOperativoFinal: '',
  componentes: '',
  observacionesFinales: '',
  proximaRevision: '',
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
  const [busquedaEquipos, setBusquedaEquipos] = useState({
    termino: '',
    pagina: 0,
    resultados: [] as EquipoMantenimiento[],
    total: 0,
    cargando: true,
  })

  const [edicion, setEdicion] = useState<FormularioEdicion | null>(null)
  const [guardandoEdicion, setGuardandoEdicion] = useState(false)
  const [errorEdicion, setErrorEdicion] = useState('')

  const [inicioConfirmado, setInicioConfirmado] = useState<Mantenimiento | null>(null)
  const [guardandoInicio, setGuardandoInicio] = useState(false)
  const [bloqueoEquipoId, setBloqueoEquipoId] = useState<string | null>(null)

  const [avance, setAvance] = useState<{
    mantenimiento: Mantenimiento
    datos: DatosAvanceForm
  } | null>(null)
  const [guardandoAvance, setGuardandoAvance] = useState(false)
  const [errorAvance, setErrorAvance] = useState('')

  const [cierre, setCierre] = useState<{
    mantenimiento: Mantenimiento
    datos: DatosCierreForm
  } | null>(null)
  const [guardandoCierre, setGuardandoCierre] = useState(false)
  const [errorCierre, setErrorCierre] = useState('')

  useEffect(() => {
    let vigente = true
    Promise.all([listarEquiposMantenimiento(), listarTecnicosMantenimiento()])
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
    Promise.all([listarMantenimientos(filtros), obtenerIndicadoresMantenimiento()])
      .then(([resultado, valores]) => {
        if (!vigente) return
        setMantenimientos(resultado.mantenimientos)
        setTotal(resultado.total)
        setIndicadores(valores)
      })
      .catch((e: unknown) => {
        if (vigente) {
          setError(
            `${mostrarError(e, 'No se pudo cargar el historial.')}. Verifica que hayas ejecutado las migraciones 008, 013 y 021 en Supabase.`,
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

  const buscarEquipos = useCallback((termino: string) => {
    setBusquedaEquipos((actual) =>
      actual.termino === termino && actual.pagina === 0
        ? actual
        : { ...actual, termino, pagina: 0, cargando: true },
    )
  }, [])

  useEffect(() => {
    let vigente = true
    const esSiguientePagina = busquedaEquipos.pagina > 0
    buscarEquiposMantenimiento(
      busquedaEquipos.termino,
      busquedaEquipos.pagina * tamanoBusquedaEquipos,
      tamanoBusquedaEquipos,
    )
      .then(({ equipos: encontrados, total: encontradosTotal }) => {
        if (!vigente) return
        setBusquedaEquipos((actual) => ({
          ...actual,
          resultados: esSiguientePagina
            ? [...actual.resultados, ...encontrados]
            : encontrados,
          total: encontradosTotal,
          cargando: false,
        }))
      })
      .catch((e: unknown) => {
        if (vigente) {
          setError(mostrarError(e, 'No se pudo buscar equipos.'))
          setBusquedaEquipos((actual) => ({ ...actual, cargando: false }))
        }
      })
    return () => {
      vigente = false
    }
  }, [busquedaEquipos.termino, busquedaEquipos.pagina])

  const tecnicosActivos = tecnicos.filter((tecnico) => tecnico.activo)
  const otrosTecnicosActivos = tecnicosActivos.filter(
    (tecnico) => tecnico.id !== perfil?.id,
  )
  const nombrePropio = perfil
    ? `${perfil.nombres} ${perfil.apellidos}`.trim()
    : ''
  const equipoSeleccionadoNuevo =
    busquedaEquipos.resultados.find((equipo) => equipo.id === nuevo.equipoId) ??
    equipos.find((equipo) => equipo.id === nuevo.equipoId) ??
    null
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

  function recargarListado() {
    setCargando(true)
    setFiltros((actuales) => ({ ...actuales }))
  }

  async function recargarIndicadores() {
    try {
      setIndicadores(await obtenerIndicadoresMantenimiento())
    } catch (e) {
      setError(mostrarError(e, 'No se pudieron actualizar los indicadores.'))
    }
  }

  function puedeGestionar(mantenimiento: Mantenimiento) {
    if (!puedeRegistrar) return false
    return esAdmin || mantenimiento.responsable_id === perfil?.id
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
      setError('La próxima revisión no puede ser anterior a la fecha programada.')
      return
    }

    setGuardando(true)
    try {
      await registrarMantenimiento(nuevo)
      setModalAbierto(false)
      setNuevo(formularioVacio())
      setAviso('Mantenimiento registrado como pendiente. El estado del equipo no se ha modificado.')
      recargarListado()
      await recargarIndicadores()
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

  function abrirEdicion(mantenimiento: Mantenimiento) {
    if (!puedeGestionar(mantenimiento)) return
    if (mantenimiento.estado === 'completado' && !esAdmin) return
    if (
      mantenimiento.estado !== 'pendiente' &&
      mantenimiento.estado !== 'completado'
    ) {
      return
    }
    setError('')
    setAviso('')
    setErrorEdicion('')
    setEdicion({
      id: mantenimiento.id,
      estado: mantenimiento.estado,
      problema: mantenimiento.problema_reportado,
      diagnostico: mantenimiento.diagnostico ?? '',
      acciones: mantenimiento.acciones_realizadas ?? '',
      componentes: mantenimiento.componentes_reemplazados ?? '',
      resultado: mantenimiento.resultado ?? '',
      observaciones: mantenimiento.observaciones ?? '',
      proximaRevision: mantenimiento.proxima_revision ?? '',
      responsableId: mantenimiento.responsable_id ?? '',
      fechaMantenimiento: mantenimiento.fecha_mantenimiento,
      estadoOriginal: mantenimiento.estado,
    })
  }

  function actualizarEdicion<K extends keyof FormularioEdicion>(
    campo: K,
    valor: FormularioEdicion[K],
  ) {
    setEdicion((actual) => (actual ? { ...actual, [campo]: valor } : actual))
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
        'La próxima revisión no puede ser anterior a la fecha programada.',
      )
      return
    }
    if (edicion.estadoOriginal === 'completado' && !esAdmin) {
      setErrorEdicion('Solo un administrador puede corregir una intervención completada.')
      return
    }

    setGuardandoEdicion(true)
    try {
      await actualizarMantenimiento(edicion)
      setEdicion(null)
      setAviso('Intervención actualizada sin modificar su estado ni el del equipo.')
      recargarListado()
      await recargarIndicadores()
    } catch (e) {
      setErrorEdicion(mostrarError(e, 'No se pudo actualizar la intervención.'))
    } finally {
      setGuardandoEdicion(false)
    }
  }

  async function confirmarInicio() {
    if (!inicioConfirmado) return
    setGuardandoInicio(true)
    setError('')
    setAviso('')
    try {
      await iniciarMantenimiento(inicioConfirmado.id)
      setAviso(
        'Mantenimiento iniciado. El equipo quedó en mantenimiento automáticamente.',
      )
      setBloqueoEquipoId(null)
      setInicioConfirmado(null)
      recargarListado()
      await recargarIndicadores()
    } catch (e) {
      const mensaje = mostrarError(e, 'No se pudo iniciar el mantenimiento.')
      setError(mensaje)
      if (/en_proceso/i.test(mensaje)) setBloqueoEquipoId(inicioConfirmado.equipo_id)
      setInicioConfirmado(null)
    } finally {
      setGuardandoInicio(false)
    }
  }

  function abrirAvance(mantenimiento: Mantenimiento) {
    if (!puedeGestionar(mantenimiento)) return
    setError('')
    setAviso('')
    setErrorAvance('')
    setAvance({ mantenimiento, datos: avanceVacio() })
  }

  function actualizarAvance<K extends keyof DatosAvanceForm>(
    campo: K,
    valor: DatosAvanceForm[K],
  ) {
    setAvance((actual) =>
      actual ? { ...actual, datos: { ...actual.datos, [campo]: valor } } : actual,
    )
  }

  async function guardarAvance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!avance) return
    setErrorAvance('')
    if (!avance.datos.descripcion.trim()) {
      setErrorAvance('Describe el avance registrado.')
      return
    }
    if (avance.datos.actualizarSeguimiento && !fechaHoraISO(avance.datos.proximoSeguimiento)) {
      setErrorAvance('Indica una próxima fecha de seguimiento válida.')
      return
    }
    setGuardandoAvance(true)
    try {
      await guardarAvanceMantenimiento({
        mantenimientoId: avance.mantenimiento.id,
        ...avance.datos,
        proximoSeguimiento: fechaHoraISO(avance.datos.proximoSeguimiento),
      })
      setAvance(null)
      setAviso('Avance guardado. La intervención continúa en proceso.')
      recargarListado()
      await recargarIndicadores()
    } catch (e) {
      setErrorAvance(mostrarError(e, 'No se pudo guardar el avance.'))
    } finally {
      setGuardandoAvance(false)
    }
  }

  function abrirCierre(mantenimiento: Mantenimiento) {
    if (!puedeGestionar(mantenimiento)) return
    setError('')
    setAviso('')
    setErrorCierre('')
    setCierre({
      mantenimiento,
      datos: {
        ...cierreVacio(),
        diagnostico: mantenimiento.diagnostico ?? '',
        acciones: mantenimiento.acciones_realizadas ?? '',
        componentes: mantenimiento.componentes_reemplazados ?? '',
        proximaRevision: mantenimiento.proxima_revision ?? '',
      },
    })
  }

  function actualizarCierre<K extends keyof DatosCierreForm>(
    campo: K,
    valor: DatosCierreForm[K],
  ) {
    setCierre((actual) =>
      actual ? { ...actual, datos: { ...actual.datos, [campo]: valor } } : actual,
    )
  }

  async function guardarCierre(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!cierre) return
    setErrorCierre('')
    const datos = cierre.datos
    if (!datos.diagnostico.trim() || !datos.acciones.trim() || !datos.resultado.trim()) {
      setErrorCierre(
        'Para finalizar debes registrar diagnóstico, acciones realizadas y resultado.',
      )
      return
    }
    if (!datos.estadoOperativoFinal) {
      setErrorCierre('Selecciona expresamente el estado operativo final del equipo.')
      return
    }
    if (datos.proximaRevision && datos.proximaRevision < cierre.mantenimiento.fecha_mantenimiento) {
      setErrorCierre('La próxima revisión preventiva no puede ser anterior a la fecha programada.')
      return
    }
    setGuardandoCierre(true)
    try {
      await finalizarMantenimiento({
        mantenimientoId: cierre.mantenimiento.id,
        diagnostico: datos.diagnostico,
        acciones: datos.acciones,
        resultado: datos.resultado,
        estadoOperativoFinal: datos.estadoOperativoFinal,
        componentes: datos.componentes,
        observacionesFinales: datos.observacionesFinales,
        proximaRevision: datos.proximaRevision,
      })
      setCierre(null)
      setAviso('Mantenimiento completado y estado operativo final registrado.')
      recargarListado()
      await recargarIndicadores()
    } catch (e) {
      setErrorCierre(mostrarError(e, 'No se pudo finalizar el mantenimiento.'))
    } finally {
      setGuardandoCierre(false)
    }
  }

  function programarNuevaIntervencion(mantenimiento: Mantenimiento) {
    setError('')
    setAviso('')
    setNuevo({
      ...formularioVacio(),
      equipoId: mantenimiento.equipo_id,
      tipo: mantenimiento.tipo,
    })
    setModalAbierto(true)
  }

  function verHistorialDelEquipo() {
    if (!bloqueoEquipoId) return
    cambiarFiltro({
      equipoId: bloqueoEquipoId,
      estado: '',
      revisionVencida: false,
      ordenReciente: false,
    })
    setVerHistorialCompleto(true)
    setBloqueoEquipoId(null)
  }

  const totalPaginas = Math.max(1, Math.ceil(total / filtros.porPagina))

  return (
    <main className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Mantenimientos</h1>
          <p className="mt-1 text-sm text-slate-600">
            Registra, ejecuta y cierra intervenciones con trazabilidad del equipo.
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
            className="rounded-lg bg-orange-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-orange-700"
          >
            Registrar mantenimiento
          </button>
        )}
      </header>

      {error && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <p>{error}</p>
          {bloqueoEquipoId && (
            <button
              type="button"
              onClick={verHistorialDelEquipo}
              className="mt-2 font-semibold text-blue-700 underline hover:text-blue-900"
            >
              Ver el historial del equipo
            </button>
          )}
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
                recargarListado()
              }}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Actualizar
            </button>
            <button
              type="button"
              onClick={() => {
                setError('')
                recargarListado()
                const mostrarHistorial = !verHistorialCompleto
                setFiltros((actuales) => ({
                  ...actuales,
                  pagina: 1,
                  ordenReciente: !mostrarHistorial,
                }))
                setVerHistorialCompleto((actual) => !actual)
              }}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
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
              options={[
                { value: 'preventivo', label: etiquetasTipo.preventivo },
                { value: 'correctivo', label: etiquetasTipo.correctivo },
              ]}
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
                      Programado: {fechaCorta(mantenimiento.fecha_mantenimiento)} · {etiquetasTipo[mantenimiento.tipo]} ·{' '}
                      {nombreUsuario(mantenimiento.responsable)}
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
                    {puedeGestionar(mantenimiento) && mantenimiento.estado === 'pendiente' && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setError('')
                            setAviso('')
                            setInicioConfirmado(mantenimiento)
                          }}
                          className="rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-600"
                        >
                          Iniciar mantenimiento
                        </button>
                        <button
                          type="button"
                          onClick={() => abrirEdicion(mantenimiento)}
                          className="rounded-lg border border-orange-200 px-3 py-1.5 text-xs font-semibold text-orange-700 hover:bg-orange-50"
                        >
                          Editar programación
                        </button>
                      </>
                    )}
                    {puedeGestionar(mantenimiento) && mantenimiento.estado === 'en_proceso' && (
                      <>
                        <button
                          type="button"
                          onClick={() => abrirAvance(mantenimiento)}
                          className="rounded-lg border border-blue-200 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-50"
                        >
                          Guardar avance
                        </button>
                        <button
                          type="button"
                          onClick={() => abrirCierre(mantenimiento)}
                          className="rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-600"
                        >
                          Finalizar mantenimiento
                        </button>
                      </>
                    )}
                    {puedeRegistrar && mantenimiento.estado === 'completado' && (
                      <button
                        type="button"
                        onClick={() => programarNuevaIntervencion(mantenimiento)}
                        className="rounded-lg border border-indigo-200 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-50"
                      >
                        Programar nueva intervención
                      </button>
                    )}
                    {esAdmin && mantenimiento.estado === 'completado' && (
                      <button
                        type="button"
                        onClick={() => abrirEdicion(mantenimiento)}
                        className="rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-600"
                      >
                        Corrección administrativa
                      </button>
                    )}
                  </div>
                </div>

                <p className="mt-3 text-sm text-slate-800">
                  <span className="font-medium">Problema reportado:</span> {mantenimiento.problema_reportado}
                </p>
                {mantenimiento.estado === 'en_proceso' && mantenimiento.proximo_seguimiento && (
                  <p className="mt-1 text-sm text-blue-700">
                    Próximo seguimiento: {fechaHoraLocal(mantenimiento.proximo_seguimiento)}
                  </p>
                )}
                {mantenimiento.proxima_revision && (
                  <p className="mt-1 text-sm text-slate-600">
                    Próxima revisión preventiva: {fechaCorta(mantenimiento.proxima_revision)}
                  </p>
                )}

                {mantenimiento.avances.length > 0 && (
                  <div className="mt-3 rounded-lg bg-blue-50 p-3">
                    <p className="text-sm font-semibold text-blue-900">Avances de la intervención</p>
                    <ol className="mt-2 space-y-3">
                      {mantenimiento.avances.map((item) => (
                        <li key={item.id} className="text-sm text-slate-700">
                          <p className="font-medium text-slate-900">
                            {fechaHoraLocal(item.fecha_hora)} · {nombreUsuario(item.usuario)}
                          </p>
                          <p className="mt-0.5 whitespace-pre-wrap">{item.descripcion}</p>
                          {item.observaciones && (
                            <p className="mt-0.5 whitespace-pre-wrap text-slate-600">
                              Observaciones: {item.observaciones}
                            </p>
                          )}
                          {item.proximo_seguimiento && (
                            <p className="mt-0.5 text-blue-700">
                              Próximo seguimiento: {fechaHoraLocal(item.proximo_seguimiento)}
                            </p>
                          )}
                        </li>
                      ))}
                    </ol>
                  </div>
                )}

                <details className="mt-3">
                  <summary className="cursor-pointer text-sm font-medium text-blue-700 hover:text-blue-900">
                    Consultar historial y detalles
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
                          ? etiquetaEstadoEquipo(mantenimiento.equipo.estado_operativo)
                          : '—'}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-medium text-slate-700">Observaciones</dt>
                      <dd className="mt-1 whitespace-pre-wrap text-slate-600">{mantenimiento.observaciones || '—'}</dd>
                    </div>
                    <div>
                      <dt className="font-medium text-slate-700">Estado operativo previo</dt>
                      <dd className="mt-1 text-slate-600">
                        {etiquetaEstadoEquipo(mantenimiento.estado_operativo_anterior)}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-medium text-slate-700">Inicio real</dt>
                      <dd className="mt-1 text-slate-600">
                        {mantenimiento.fecha_inicio_real
                          ? `${fechaHoraLocal(mantenimiento.fecha_inicio_real)} · ${nombreUsuario(mantenimiento.iniciado_por)}`
                          : '—'}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-medium text-slate-700">Finalización real</dt>
                      <dd className="mt-1 text-slate-600">
                        {mantenimiento.fecha_finalizacion_real
                          ? `${fechaHoraLocal(mantenimiento.fecha_finalizacion_real)} · ${nombreUsuario(mantenimiento.finalizado_por)}`
                          : '—'}
                      </dd>
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
                                {fechaHoraLocal(cambio.created_at)}
                                {cambio.usuario ? ` · ${nombreUsuario(cambio.usuario)}` : ''}
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
          {totalPaginas > 1 && (
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
          )}
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
                <p className="mt-1 text-sm text-slate-600">
                  La intervención se guarda como pendiente y el equipo conserva su estado operativo.
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
            <form className="space-y-4" onSubmit={guardar}>
              {error && (
                <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>
              )}
              {cargandoCatalogos ? (
                <p className="py-5 text-center text-sm text-slate-500">Cargando catálogos...</p>
              ) : (
                <>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <SearchableSelect
                      label="Equipo intervenido *"
                      placeholder="Escribe nombre, código, serie, categoría o ubicación"
                      className="sm:col-span-2"
                      value={nuevo.equipoId}
                      onChange={(value) => actualizarNuevo('equipoId', value)}
                      options={busquedaEquipos.resultados.map((equipo) => ({
                        value: equipo.id,
                        label: `${equipo.nombre} · ${equipo.codigo_institucional}`,
                        keywords: [
                          equipo.codigo_institucional,
                          equipo.nombre,
                          equipo.numero_serie,
                          equipo.categoria_nombre,
                          equipo.ubicacion,
                        ]
                          .filter(Boolean)
                          .join(' '),
                        detalle: [
                          equipo.numero_serie ? `Serie: ${equipo.numero_serie}` : null,
                          equipo.ubicacion ? `Ubicación: ${equipo.ubicacion}` : null,
                          equipo.categoria_nombre ? `Categoría: ${equipo.categoria_nombre}` : null,
                        ]
                          .filter(Boolean)
                          .join('\n'),
                      }))}
                      onBuscar={buscarEquipos}
                      remoto
                      buscando={busquedaEquipos.cargando}
                      selectedLabel={
                        equipoSeleccionadoNuevo
                          ? `${equipoSeleccionadoNuevo.nombre} · ${equipoSeleccionadoNuevo.codigo_institucional}`
                          : null
                      }
                      emptyMessage="No se encontraron equipos con esa búsqueda"
                      hayMas={busquedaEquipos.resultados.length < busquedaEquipos.total}
                      onCargarMas={() =>
                        setBusquedaEquipos((actual) => ({
                          ...actual,
                          pagina: actual.pagina + 1,
                          cargando: true,
                        }))
                      }
                    />
                    <label className="text-sm font-medium text-slate-700">
                      Fecha programada *
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
                    <div className="text-sm font-medium text-slate-700">
                      Estado de la intervención
                      <p className="mt-1 rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-slate-600">
                        {etiquetasEstado.pendiente}
                      </p>
                    </div>
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
                      Próxima revisión preventiva (opcional)
                      <input
                        type="date"
                        min={nuevo.fecha}
                        value={nuevo.proximaRevision}
                        onChange={(e) => actualizarNuevo('proximaRevision', e.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                      />
                    </label>
                    <label className="text-sm font-medium text-slate-700">
                      Observaciones iniciales (opcional)
                      <textarea
                        rows={2}
                        value={nuevo.observaciones}
                        onChange={(e) => actualizarNuevo('observaciones', e.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                      />
                    </label>
                    <label className="text-sm font-medium text-slate-700 sm:col-span-2">
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
                  disabled={guardando || cargandoCatalogos}
                  className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {guardando ? 'Guardando...' : 'Guardar mantenimiento'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {inicioConfirmado && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !guardandoInicio) setInicioConfirmado(null)
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirmar-inicio-titulo"
            className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl"
          >
            <h2 id="confirmar-inicio-titulo" className="text-lg font-bold text-slate-900">
              Iniciar mantenimiento
            </h2>
            <p className="mt-3 text-sm text-slate-600">
              Se registrará la fecha y hora real de inicio, la intervención pasará a{' '}
              <strong>En proceso</strong> y el equipo cambiará automáticamente a{' '}
              <strong>En mantenimiento</strong>. No necesitas seleccionar el estado del equipo.
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                disabled={guardandoInicio}
                onClick={() => setInicioConfirmado(null)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={guardandoInicio}
                onClick={confirmarInicio}
                className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-50"
              >
                {guardandoInicio ? 'Iniciando...' : 'Confirmar inicio'}
              </button>
            </div>
          </section>
        </div>
      )}

      {avance && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/50 p-4"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !guardandoAvance) setAvance(null)
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="form-avance-titulo"
            className="my-6 w-full max-w-2xl rounded-xl bg-white p-5 shadow-xl sm:p-7"
          >
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 id="form-avance-titulo" className="text-xl font-bold text-slate-900">
                  Guardar avance
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  La intervención permanece en proceso; el equipo sigue en mantenimiento.
                </p>
              </div>
              <button
                type="button"
                aria-label="Cerrar"
                disabled={guardandoAvance}
                onClick={() => setAvance(null)}
                className="rounded-md px-2 py-1 text-xl text-slate-500 hover:bg-slate-100 disabled:opacity-50"
              >
                ×
              </button>
            </div>
            <form className="space-y-4" onSubmit={guardarAvance}>
              {errorAvance && (
                <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                  {errorAvance}
                </div>
              )}
              <label className="block text-sm font-medium text-slate-700">
                Descripción del avance *
                <textarea
                  required
                  rows={3}
                  value={avance.datos.descripcion}
                  onChange={(e) => actualizarAvance('descripcion', e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-sm font-medium text-slate-700">
                  Diagnóstico actual
                  <textarea
                    rows={2}
                    value={avance.datos.diagnostico}
                    onChange={(e) => actualizarAvance('diagnostico', e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                  />
                </label>
                <label className="text-sm font-medium text-slate-700">
                  Acciones realizadas
                  <textarea
                    rows={2}
                    value={avance.datos.acciones}
                    onChange={(e) => actualizarAvance('acciones', e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                  />
                </label>
                <label className="text-sm font-medium text-slate-700">
                  Componentes reemplazados
                  <textarea
                    rows={2}
                    value={avance.datos.componentes}
                    onChange={(e) => actualizarAvance('componentes', e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                  />
                </label>
                <label className="text-sm font-medium text-slate-700">
                  Observaciones
                  <textarea
                    rows={2}
                    value={avance.datos.observaciones}
                    onChange={(e) => actualizarAvance('observaciones', e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                  />
                </label>
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={avance.datos.actualizarSeguimiento}
                  onChange={(e) => actualizarAvance('actualizarSeguimiento', e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300"
                />
                Establecer o modificar la próxima fecha de seguimiento
              </label>
              {avance.datos.actualizarSeguimiento && (
                <label className="block text-sm font-medium text-slate-700">
                  Próximo seguimiento
                  <input
                    type="datetime-local"
                    value={avance.datos.proximoSeguimiento}
                    onChange={(e) => actualizarAvance('proximoSeguimiento', e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                  />
                </label>
              )}
              <div className="flex justify-end gap-3 border-t border-slate-200 pt-4">
                <button
                  type="button"
                  disabled={guardandoAvance}
                  onClick={() => setAvance(null)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardandoAvance}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {guardandoAvance ? 'Guardando...' : 'Guardar avance'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {cierre && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/50 p-4"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !guardandoCierre) setCierre(null)
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="form-cierre-titulo"
            className="my-6 w-full max-w-3xl rounded-xl bg-white p-5 shadow-xl sm:p-7"
          >
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 id="form-cierre-titulo" className="text-xl font-bold text-slate-900">
                  Finalizar mantenimiento
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  Registra el cierre y elige expresamente la condición real del equipo.
                </p>
              </div>
              <button
                type="button"
                aria-label="Cerrar"
                disabled={guardandoCierre}
                onClick={() => setCierre(null)}
                className="rounded-md px-2 py-1 text-xl text-slate-500 hover:bg-slate-100 disabled:opacity-50"
              >
                ×
              </button>
            </div>
            <form className="space-y-4" onSubmit={guardarCierre}>
              {errorCierre && (
                <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                  {errorCierre}
                </div>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-sm font-medium text-slate-700 sm:col-span-2">
                  Diagnóstico final *
                  <textarea
                    required
                    rows={2}
                    value={cierre.datos.diagnostico}
                    onChange={(e) => actualizarCierre('diagnostico', e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                  />
                </label>
                <label className="text-sm font-medium text-slate-700 sm:col-span-2">
                  Acciones realizadas *
                  <textarea
                    required
                    rows={2}
                    value={cierre.datos.acciones}
                    onChange={(e) => actualizarCierre('acciones', e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                  />
                </label>
                <label className="text-sm font-medium text-slate-700">
                  Componentes reemplazados
                  <textarea
                    rows={2}
                    value={cierre.datos.componentes}
                    onChange={(e) => actualizarCierre('componentes', e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                  />
                </label>
                <label className="text-sm font-medium text-slate-700">
                  Resultado de la intervención *
                  <textarea
                    required
                    rows={2}
                    value={cierre.datos.resultado}
                    onChange={(e) => actualizarCierre('resultado', e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                  />
                </label>
                <label className="text-sm font-medium text-slate-700">
                  Estado operativo final del equipo *
                  <select
                    required
                    value={cierre.datos.estadoOperativoFinal}
                    onChange={(e) =>
                      actualizarCierre(
                        'estadoOperativoFinal',
                        e.target.value as EstadoOperativoFinal,
                      )
                    }
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                  >
                    <option value="">Selecciona el estado real</option>
                    {estadosOperativosFinales.map((estado) => (
                      <option key={estado} value={estado}>
                        {etiquetasEstadoFinal[estado]}
                      </option>
                    ))}
                  </select>
                  <span className="mt-1 block text-xs font-normal text-slate-500">
                    No se selecciona automáticamente. Finalizar no implica que el equipo quedó operativo.
                  </span>
                </label>
                <label className="text-sm font-medium text-slate-700">
                  Próxima revisión preventiva (opcional)
                  <input
                    type="date"
                    min={cierre.mantenimiento.fecha_mantenimiento}
                    value={cierre.datos.proximaRevision}
                    onChange={(e) => actualizarCierre('proximaRevision', e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                  />
                </label>
                <label className="text-sm font-medium text-slate-700 sm:col-span-2">
                  Observaciones finales
                  <textarea
                    rows={2}
                    value={cierre.datos.observacionesFinales}
                    onChange={(e) => actualizarCierre('observacionesFinales', e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                  />
                </label>
              </div>
              <div className="flex justify-end gap-3 border-t border-slate-200 pt-4">
                <button
                  type="button"
                  disabled={guardandoCierre}
                  onClick={() => setCierre(null)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardandoCierre}
                  className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-50"
                >
                  {guardandoCierre ? 'Finalizando...' : 'Finalizar mantenimiento'}
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
            if (e.target === e.currentTarget && !guardandoEdicion) setEdicion(null)
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
                  {edicion.estado === 'completado'
                    ? 'Corrección administrativa'
                    : 'Editar programación'}
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  Esta edición no cambia el estado de la intervención ni el del equipo.
                </p>
              </div>
              <button
                type="button"
                aria-label="Cerrar"
                disabled={guardandoEdicion}
                onClick={() => setEdicion(null)}
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
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="text-sm font-medium text-slate-700">
                  Estado de la intervención
                  <p className="mt-1 rounded-lg bg-slate-100 px-3 py-2 font-normal text-slate-600">
                    {etiquetasEstado[edicion.estado]}
                  </p>
                </div>
                <div className="text-sm font-medium text-slate-700">
                  Fecha programada original
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
                  />
                </label>
                <label className="text-sm font-medium text-slate-700">
                  Próxima revisión preventiva
                  <input
                    type="date"
                    min={edicion.fechaMantenimiento}
                    value={edicion.proximaRevision}
                    onChange={(e) => actualizarEdicion('proximaRevision', e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                  />
                </label>
                <label className="text-sm font-medium text-slate-700">
                  Técnico responsable
                  {esAdmin ? (
                    <select
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
                {edicion.estado === 'completado' && (
                  <>
                    <label className="text-sm font-medium text-slate-700">
                      Diagnóstico
                      <textarea
                        rows={2}
                        value={edicion.diagnostico}
                        onChange={(e) => actualizarEdicion('diagnostico', e.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                      />
                    </label>
                    <label className="text-sm font-medium text-slate-700">
                      Acciones realizadas
                      <textarea
                        rows={2}
                        value={edicion.acciones}
                        onChange={(e) => actualizarEdicion('acciones', e.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                      />
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
                      Resultado
                      <textarea
                        rows={2}
                        value={edicion.resultado}
                        onChange={(e) => actualizarEdicion('resultado', e.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                      />
                    </label>
                  </>
                )}
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
                  onClick={() => setEdicion(null)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardandoEdicion}
                  className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-50"
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
