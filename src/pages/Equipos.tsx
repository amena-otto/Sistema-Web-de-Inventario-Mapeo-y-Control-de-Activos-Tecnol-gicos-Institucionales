import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import EquipoQrDialog from '../components/EquipoQrDialog'
import ConfirmarEliminacionEquipo from '../components/ConfirmarEliminacionEquipo'
import { listarHistorialMovimientos, type Movimiento } from '../services/movimientosService'
import { listarMantenimientos, type Mantenimiento } from '../services/mantenimientosService'
import { usePermissions } from '../hooks/usePermissions'
import {
  actualizarEquipo,
  cargarCatalogos,
  crearCategoria,
  crearEquipo,
  darDeBajaEquipo,
  eliminarFotografia,
  estadosOperativos,
  establecerFotografiaPrincipal,
  guardarComponente,
  guardarRelacion,
  listarOpcionesRelacion,
  listarEquipos,
  obtenerDatosDetalleEquipo,
  obtenerEquipo,
  obtenerFotografiasEquipo,
  posiblesDuplicados,
  reactivarEquipo,
  subirFotografia,
  type Ambiente,
  type Categoria,
  type Componente,
  type DatosEquipo,
  type Equipo,
  type EstadoOperativo,
  type Fotografia,
  type FotografiaConUrl,
  type RelacionEquipo,
  type Responsable,
  type UbicacionEquipo,
} from '../services/equiposService'

const porPagina = 12
const registrosRecientes = 10
const etiquetasEstado: Record<EstadoOperativo, string> = {
  operativo: 'Operativo',
  con_fallas: 'Operativo con observaciones',
  en_mantenimiento: 'En mantenimiento',
  inoperativo: 'Inoperativo',
  en_almacen: 'En almacén',
}

const vacio: DatosEquipo = {
  categoria_id: '',
  ambiente_id: null,
  nombre: '',
  marca: '',
  modelo: '',
  numero_serie: '',
  codigo_patrimonial: '',
  posicion: '',
  responsable_id: null,
  estado_operativo: 'operativo',
  fecha_adquisicion: null,
  fecha_garantia: null,
  observaciones: '',
}

const etiquetasTecnicas = [
  ['Procesador', 'Procesador'],
  ['Memoria RAM', 'RAM (capacidad y tipo)'],
  ['Almacenamiento', 'Almacenamiento (tipo y capacidad)'],
  ['Sistema operativo', 'Sistema operativo'],
] as const
const tiposFotografia = new Set(['image/jpeg', 'image/png', 'image/webp'])

type ArchivoConVista = {
  archivo: File
  vista: string
}

function mostrarError(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message
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

function fechaCorta(value: string | null) {
  return value ? new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString() : '—'
}

function formatoPeso(bytes: number) {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function Equipos() {
  const { can } = usePermissions()
  const [searchParams, setSearchParams] = useSearchParams()
  const puedeCrear = can('equipos.crear')
  const puedeEditar = can('equipos.editar')
  const puedeDarDeBaja = can('equipos.baja')
  const puedeAdministrarCategorias = can('categorias.administrar')
  const puedeVerMantenimientos = can('mantenimientos.ver')
  const puedeVerMovimientos = can('movimientos.ver')
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [ambientes, setAmbientes] = useState<Ambiente[]>([])
  const [responsables, setResponsables] = useState<Responsable[]>([])
  const [equipos, setEquipos] = useState<Equipo[]>([])
  const [total, setTotal] = useState(0)
  const [actualizacion, setActualizacion] = useState(0)
  const [pagina, setPagina] = useState(1)
  const [verHistorialCompleto, setVerHistorialCompleto] = useState(false)
  const verEquiposDadosDeBaja = searchParams.get('estado') === 'baja'
  const [busqueda, setBusqueda] = useState('')
  const [estado, setEstado] = useState(() => {
    const estadoInicial = searchParams.get('estado') ?? ''
    return estadoInicial === 'baja' ? '' : estadoInicial
  })
  const [categoriaFiltro, setCategoriaFiltro] = useState(() => searchParams.get('categoria') ?? '')
  const [ambienteFiltro, setAmbienteFiltro] = useState(() => searchParams.get('ambiente') ?? '')
  const [ambienteFiltrosIds, setAmbienteFiltrosIds] = useState(() => searchParams.getAll('ambientes'))
  const [sinUbicacionFiltro, setSinUbicacionFiltro] = useState(() => searchParams.get('sinUbicacion') === 'true')
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [modalAbierto, setModalAbierto] = useState(false)
  const [categoriaModal, setCategoriaModal] = useState(false)
  const [categoriaNueva, setCategoriaNueva] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [guardandoCategoria, setGuardandoCategoria] = useState(false)
  const [editando, setEditando] = useState<Equipo | null>(null)
  const [cargandoDatosEdicion, setCargandoDatosEdicion] = useState(false)
  const [errorDatosEdicion, setErrorDatosEdicion] = useState('')
  const [datos, setDatos] = useState<DatosEquipo>(vacio)
  const [tecnicas, setTecnicas] = useState<Record<string, string>>({})
  const [duplicados, setDuplicados] = useState<Equipo[]>([])
  const [equipoDetalle, setEquipoDetalle] = useState<Equipo | null>(null)
  const [equipoQr, setEquipoQr] = useState<Equipo | null>(null)
  const [detalleCargando, setDetalleCargando] = useState(false)
  const [componentes, setComponentes] = useState<Componente[]>([])
  const [relaciones, setRelaciones] = useState<RelacionEquipo[]>([])
  const [historialMantenimientos, setHistorialMantenimientos] = useState<Mantenimiento[]>([])
  const [historialMovimientos, setHistorialMovimientos] = useState<Movimiento[]>([])
  const [fotografias, setFotografias] = useState<FotografiaConUrl[]>([])
  const [fotografiasCargando, setFotografiasCargando] = useState(false)
  const [errorFotografias, setErrorFotografias] = useState('')
  const [ubicacionDetalle, setUbicacionDetalle] = useState<UbicacionEquipo | null>(null)
  const [fechaUltimoMantenimiento, setFechaUltimoMantenimiento] = useState<string | null>(null)
  const [opcionesRelacion, setOpcionesRelacion] = useState<{ id: string; codigo_institucional: string; nombre: string }[]>([])
  const [opcionesRelacionCargando, setOpcionesRelacionCargando] = useState(false)
  const [errorOpcionesRelacion, setErrorOpcionesRelacion] = useState('')
  const [componenteTipo, setComponenteTipo] = useState('')
  const [componenteDetalle, setComponenteDetalle] = useState('')
  const [equipoRelacionado, setEquipoRelacionado] = useState('')
  const [foto, setFoto] = useState<ArchivoConVista | null>(null)
  const [fotoAdicional, setFotoAdicional] = useState<ArchivoConVista[]>([])
  const [gestionandoFoto, setGestionandoFoto] = useState(false)
  const [equipoAEliminar, setEquipoAEliminar] = useState<Equipo | null>(null)
  const solicitudDetalle = useRef(0)
  const solicitudFotografias = useRef(0)
  const solicitudEdicion = useRef(0)
  const componenteMontado = useRef(false)
  const equipoDetalleIdActual = useRef<string | null>(null)
  const equipoEdicionIdActual = useRef<string | null>(null)
  const fotoInputRef = useRef<HTMLInputElement>(null)
  const fotoAdicionalInputRef = useRef<HTMLInputElement>(null)
  const fotoAdicionalSeccionRef = useRef<HTMLDivElement>(null)
  const fotoAdicionalSelectorRef = useRef<HTMLButtonElement>(null)
  const enfocarSeccionFotosAdicionales = useRef(false)
  const vistasPendientes = useRef(new Set<string>())
  useEffect(() => {
    componenteMontado.current = true
    return () => {
      componenteMontado.current = false
      solicitudDetalle.current += 1
      solicitudFotografias.current += 1
      solicitudEdicion.current += 1
    }
  }, [])

  useEffect(
    () => () => {
      for (const fotografia of fotografias) {
        if (fotografia.url.startsWith('blob:')) URL.revokeObjectURL(fotografia.url)
      }
    },
    [fotografias],
  )

  useEffect(
    () => () => {
      vistasPendientes.current.forEach((vista) => URL.revokeObjectURL(vista))
      vistasPendientes.current.clear()
    },
    [],
  )

  useEffect(() => {
    if (!modalAbierto) return
    const overflowAnterior = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    function cerrarConEscape(event: KeyboardEvent) {
      if (event.key === 'Escape' && !guardando) setModalAbierto(false)
    }
    window.addEventListener('keydown', cerrarConEscape)
    return () => {
      document.body.style.overflow = overflowAnterior
      window.removeEventListener('keydown', cerrarConEscape)
    }
  }, [modalAbierto, guardando])

  useEffect(() => {
    if (!modalAbierto) solicitudEdicion.current += 1
  }, [modalAbierto])

  useEffect(() => {
    if (!modalAbierto || !editando || !enfocarSeccionFotosAdicionales.current) return
    enfocarSeccionFotosAdicionales.current = false
    requestAnimationFrame(() => {
      fotoAdicionalSeccionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      fotoAdicionalSelectorRef.current?.focus({ preventScroll: true })
    })
  }, [editando, modalAbierto])

  useEffect(() => {
    let vigente = true
    cargarCatalogos()
      .then((catalogos) => {
        if (!vigente) return
        setCategorias(catalogos.categorias)
        setAmbientes(catalogos.ambientes)
        setResponsables(catalogos.responsables)
      })
      .catch((e: unknown) => {
        if (vigente) setError(mostrarError(e, 'No se pudieron cargar los catálogos.'))
      })
    return () => {
      vigente = false
    }
  }, [])

  useEffect(() => {
    let vigente = true
    listarEquipos({
      pagina,
      porPagina: verHistorialCompleto || verEquiposDadosDeBaja ? porPagina : registrosRecientes,
      busqueda,
      estado: verEquiposDadosDeBaja ? '' : estado,
      situacion: verEquiposDadosDeBaja
        ? 'baja'
        : estado === 'archivado'
          ? 'archivado'
          : 'activo',
      categoriaId: categoriaFiltro,
      ambienteId: ambienteFiltro,
      ambienteIds: ambienteFiltrosIds.length ? ambienteFiltrosIds : undefined,
      sinUbicacion: sinUbicacionFiltro,
      ordenReciente: !verHistorialCompleto && !verEquiposDadosDeBaja,
    })
      .then((resultado) => {
        if (!vigente) return
        setEquipos(resultado.equipos)
        setTotal(resultado.total)
      })
      .catch((e: unknown) => {
        if (vigente) setError(mostrarError(e, 'No se pudo cargar el inventario.'))
      })
      .finally(() => {
        if (vigente) setCargando(false)
      })
    return () => {
      vigente = false
    }
  }, [pagina, busqueda, estado, categoriaFiltro, ambienteFiltro, ambienteFiltrosIds, sinUbicacionFiltro, actualizacion, verHistorialCompleto, verEquiposDadosDeBaja])

  const paginas = Math.max(1, Math.ceil(total / porPagina))
  const categoriasPorId = useMemo(
    () => new Map(categorias.map((categoria) => [categoria.id, categoria.nombre])),
    [categorias],
  )
  const ambientesPorId = useMemo(
    () => new Map(ambientes.map((ambiente) => [ambiente.id, ambiente])),
    [ambientes],
  )
  const responsablesPorId = useMemo(
    () =>
      new Map(
        responsables.map((responsable) => [
          responsable.id,
          `${responsable.nombres} ${responsable.apellidos}`,
        ]),
      ),
    [responsables],
  )
  const fotografiaPrincipal = fotografias.find((fotografia) => fotografia.tipo === 'principal')
  const cerrarQr = useCallback(() => setEquipoQr(null), [])
  const cerrarDetalle = useCallback(() => {
    solicitudDetalle.current += 1
    solicitudFotografias.current += 1
    equipoDetalleIdActual.current = null
    setEquipoDetalle(null)
    setFotografiasCargando(false)
    setEquipoAEliminar(null)
    if (searchParams.has('equipo')) {
      const parametros = new URLSearchParams(searchParams)
      parametros.delete('equipo')
      setSearchParams(parametros, { replace: true })
    }
  }, [searchParams, setSearchParams])
  const seleccionarVistaEquipos = useCallback(
    (verDadosDeBaja: boolean) => {
      setPagina(1)
      setSearchParams(
        (actuales) => {
          const parametros = new URLSearchParams(actuales)
          if (verDadosDeBaja) {
            parametros.set('estado', 'baja')
          } else if (parametros.get('estado') === 'baja') {
            parametros.delete('estado')
          }
          return parametros
        },
        { replace: true },
      )
    },
    [setSearchParams],
  )

  function crearVistaArchivo(archivo: File): ArchivoConVista {
    const vista = URL.createObjectURL(archivo)
    vistasPendientes.current.add(vista)
    return { archivo, vista }
  }

  function liberarVistaArchivo(seleccion: ArchivoConVista) {
    URL.revokeObjectURL(seleccion.vista)
    vistasPendientes.current.delete(seleccion.vista)
  }

  function limpiarFotografiasPendientes() {
    if (foto) liberarVistaArchivo(foto)
    fotoAdicional.forEach(liberarVistaArchivo)
    setFoto(null)
    setFotoAdicional([])
  }

  function seleccionarFotografiaPrincipal(archivo: File | undefined) {
    if (!archivo) return
    if (!tiposFotografia.has(archivo.type)) {
      setError('Selecciona una imagen JPEG, PNG o WebP.')
      return
    }
    setError('')
    if (foto) liberarVistaArchivo(foto)
    setFoto(crearVistaArchivo(archivo))
  }

  function seleccionarFotografiasAdicionales(archivos: FileList | File[]) {
    const seleccionadas = Array.from(archivos)
    if (!seleccionadas.length) return
    const invalidas = seleccionadas.filter((archivo) => !tiposFotografia.has(archivo.type))
    if (invalidas.length) {
      setError('Algunos archivos no son compatibles. Selecciona imágenes JPEG, PNG o WebP.')
      if (invalidas.length === seleccionadas.length) return
    } else {
      setError('')
    }
    const validas = seleccionadas.filter((archivo) => tiposFotografia.has(archivo.type))
    if (!validas.length) return
    const firmas = new Set(
      fotoAdicional.map(({ archivo }) => `${archivo.name}:${archivo.size}:${archivo.lastModified}`),
    )
    const nuevas = validas.filter((archivo) => {
      const firma = `${archivo.name}:${archivo.size}:${archivo.lastModified}`
      if (firmas.has(firma)) return false
      firmas.add(firma)
      return true
    })
    setFotoAdicional([...fotoAdicional, ...nuevas.map(crearVistaArchivo)])
  }

  function iniciarNuevo() {
    solicitudEdicion.current += 1
    equipoEdicionIdActual.current = null
    limpiarFotografiasPendientes()
    setEditando(null)
    setCargandoDatosEdicion(false)
    setErrorDatosEdicion('')
    setDatos({ ...vacio, categoria_id: categorias[0]?.id ?? '' })
    setTecnicas({})
    setDuplicados([])
    setError('')
    setModalAbierto(true)
  }

  function iniciarEdicion(equipo: Equipo) {
    const solicitudActual = ++solicitudEdicion.current
    equipoEdicionIdActual.current = equipo.id
    limpiarFotografiasPendientes()
    setEditando(equipo)
    setCargandoDatosEdicion(true)
    setErrorDatosEdicion('')
    setFotografias([])
    setFotografiasCargando(true)
    setErrorFotografias('')
    setError('')
    setAviso('')
    setDuplicados([])
    setDatos({
      categoria_id: equipo.categoria_id,
      ambiente_id: equipo.ambiente_id,
      nombre: equipo.nombre,
      marca: equipo.marca ?? '',
      modelo: equipo.modelo ?? '',
      numero_serie: equipo.numero_serie ?? '',
      codigo_patrimonial: equipo.codigo_patrimonial ?? '',
      posicion: equipo.posicion ?? '',
      responsable_id: equipo.responsable_id,
      estado_operativo: equipo.estado_operativo,
      fecha_adquisicion: equipo.fecha_adquisicion,
      fecha_garantia: equipo.fecha_garantia,
      observaciones: equipo.observaciones ?? '',
    })
    setTecnicas({})
    setModalAbierto(true)

    void obtenerDatosDetalleEquipo(equipo.id, equipo.ambiente_id)
      .then((detalle) => {
        if (!componenteMontado.current || solicitudActual !== solicitudEdicion.current) return
        setTecnicas(
          Object.fromEntries(
            detalle.componentes
              .filter((componente) =>
                etiquetasTecnicas.some(([tipo]) => tipo === componente.tipo),
              )
              .map((componente) => [componente.tipo, componente.capacidad ?? '']),
          ),
        )
      })
      .catch((e: unknown) => {
        if (componenteMontado.current && solicitudActual === solicitudEdicion.current) {
          const mensaje = mostrarError(e, 'No se pudieron cargar las características técnicas.')
          setErrorDatosEdicion(mensaje)
          setError(mensaje)
        }
      })
      .finally(() => {
        if (componenteMontado.current && solicitudActual === solicitudEdicion.current) {
          setCargandoDatosEdicion(false)
        }
      })

    void obtenerFotografiasEquipo(equipo.id)
      .then((resultado) => {
        if (!componenteMontado.current || solicitudActual !== solicitudEdicion.current) {
          resultado.forEach((fotografia) => {
            if (fotografia.url.startsWith('blob:')) URL.revokeObjectURL(fotografia.url)
          })
          return
        }
        setFotografias(resultado)
        setErrorFotografias('')
      })
      .catch((e: unknown) => {
        if (componenteMontado.current && solicitudActual === solicitudEdicion.current) {
          setErrorFotografias(mostrarError(e, 'No se pudieron cargar las fotografías.'))
        }
      })
      .finally(() => {
        if (componenteMontado.current && solicitudActual === solicitudEdicion.current) {
          setFotografiasCargando(false)
        }
      })
  }

  function cambiarDato<K extends keyof DatosEquipo>(campo: K, valor: DatosEquipo[K]) {
    setDatos((anterior) => ({ ...anterior, [campo]: valor }))
    setDuplicados([])
  }

  async function agregarCategoria(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!categoriaNueva.trim()) return
    setGuardandoCategoria(true)
    setError('')
    try {
      const categoria = await crearCategoria(categoriaNueva)
      setCategorias((actuales) =>
        [...actuales, categoria].sort((a, b) => a.nombre.localeCompare(b.nombre)),
      )
      setCategoriaNueva('')
      setCategoriaModal(false)
      setDatos((actual) => ({ ...actual, categoria_id: categoria.id }))
      setAviso(`Categoría "${categoria.nombre}" creada.`)
    } catch (e) {
      setError(mostrarError(e, 'No se pudo crear la categoría.'))
    } finally {
      setGuardandoCategoria(false)
    }
  }

  async function guardarEquipo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (cargandoDatosEdicion || errorDatosEdicion) return
    setError('')
    setAviso('')
    setGuardando(true)

    try {
      const encontrados = await posiblesDuplicados(
        datos.numero_serie ?? '',
        datos.codigo_patrimonial ?? '',
        editando?.id,
        datos,
      )
      if (encontrados.length && duplicados.length === 0) {
        setDuplicados(encontrados)
        setError('Encontré posibles duplicados. Revísalos antes de confirmar el guardado.')
        return
      }

      const limpio: DatosEquipo = {
        ...datos,
        nombre: datos.nombre.trim(),
        marca: datos.marca?.trim() || null,
        modelo: datos.modelo?.trim() || null,
        numero_serie: datos.numero_serie?.trim() || null,
        codigo_patrimonial: datos.codigo_patrimonial?.trim() || null,
        posicion: datos.posicion?.trim() || null,
        observaciones: datos.observaciones?.trim() || null,
      }
      const guardado = editando
        ? await actualizarEquipo(editando.id, limpio)
        : await crearEquipo(limpio)

      let advertencia = ''
      for (const [tipo, capacidad] of Object.entries(tecnicas)) {
        try {
          await guardarComponente(guardado.id, {
              tipo,
              marca: null,
              modelo: null,
              capacidad: capacidad.trim() || null,
              numero_serie: null,
              observaciones: null,
            })
        } catch (e) {
          advertencia = `El equipo ${guardado.codigo_institucional} se guardó, pero no se pudo guardar la característica ${tipo}: ${mostrarError(e, 'error desconocido')}`
          break
        }
      }

      setModalAbierto(false)
      setPagina(1)
      setActualizacion((actual) => actual + 1)
      setAviso(
        editando
          ? `Se actualizaron los datos de ${guardado.codigo_institucional}.`
          : `Equipo ${guardado.codigo_institucional} registrado correctamente.`,
      )
      if (advertencia) setError(advertencia)
      if (foto) {
        let fotoGuardada = false
        try {
          const tienePrincipal = fotografias.some((item) => item.tipo === 'principal')
          await subirFotografia(
            guardado.id,
            foto.archivo,
            editando && tienePrincipal ? 'reemplazar' : 'principal',
          )
          fotoGuardada = true
          liberarVistaArchivo(foto)
          setFoto(null)
          setAviso(
            editando
              ? `Fotografía principal de ${guardado.codigo_institucional} reemplazada.`
              : `Equipo ${guardado.codigo_institucional} y fotografía principal registrados.`,
          )
        } catch (e) {
          setError(
            `${advertencia ? `${advertencia} ` : ''}El equipo quedó guardado, pero la fotografía no: ${mostrarError(e, 'error desconocido')}`,
          )
        }
        if (fotoGuardada) {
          try {
            await refrescarFotografias(guardado.id)
          } catch (e) {
            setError(`La fotografía se guardó, pero no se pudo actualizar la vista: ${mostrarError(e, 'error desconocido')}`)
          }
        }
      }
      if (fotoAdicional.length && !editando) {
        const fallidas: ArchivoConVista[] = []
        const erroresFoto: string[] = []
        for (const seleccion of fotoAdicional) {
          try {
            await subirFotografia(guardado.id, seleccion.archivo, 'adicional')
            liberarVistaArchivo(seleccion)
          } catch (e) {
            fallidas.push(seleccion)
            erroresFoto.push(`${seleccion.archivo.name}: ${mostrarError(e, 'error desconocido')}`)
          }
        }
        setFotoAdicional(fallidas)
        if (erroresFoto.length) {
          setError(`El equipo quedó guardado, pero algunas fotografías no se subieron: ${erroresFoto.join('; ')}`)
        }
        if (fallidas.length < fotoAdicional.length) {
          setAviso(`Equipo ${guardado.codigo_institucional} y ${fotoAdicional.length - fallidas.length} fotografía(s) adicional(es) registradas.`)
          try {
            await refrescarFotografias(guardado.id)
          } catch (e) {
            setError(`Las fotografías se guardaron, pero no se pudo actualizar la vista: ${mostrarError(e, 'error desconocido')}`)
          }
        }
      }
    } catch (e) {
      setError(mostrarError(e, 'No se pudo guardar el equipo.'))
    } finally {
      setGuardando(false)
    }
  }

  const refrescarFotografias = useCallback(async (equipoId: string, detalleSolicitud?: number) => {
    const solicitudActual = ++solicitudFotografias.current
    if (
      detalleSolicitud !== undefined ||
      equipoDetalleIdActual.current === equipoId ||
      equipoEdicionIdActual.current === equipoId
    ) {
      setFotografiasCargando(true)
      setErrorFotografias('')
    }
    try {
      const resultado = await obtenerFotografiasEquipo(equipoId)
      const puedeActualizar =
        componenteMontado.current &&
        solicitudActual === solicitudFotografias.current &&
        (detalleSolicitud === undefined || detalleSolicitud === solicitudDetalle.current)
      if (puedeActualizar) {
        setFotografias(resultado)
        setErrorFotografias('')
      } else {
        resultado.forEach((fotografia) => {
          if (fotografia.url.startsWith('blob:')) URL.revokeObjectURL(fotografia.url)
        })
      }
    } catch (e) {
      if (
        componenteMontado.current &&
        solicitudActual === solicitudFotografias.current &&
        (detalleSolicitud === undefined || detalleSolicitud === solicitudDetalle.current)
      ) {
        setErrorFotografias(mostrarError(e, 'No se pudieron cargar las fotografías.'))
      }
      throw e
    } finally {
      if (
        componenteMontado.current &&
        solicitudActual === solicitudFotografias.current &&
        (detalleSolicitud === undefined || detalleSolicitud === solicitudDetalle.current)
      ) {
        setFotografiasCargando(false)
      }
    }
  }, [])

  const abrirDetalle = useCallback(async (equipo: Equipo) => {
    const solicitudActual = ++solicitudDetalle.current
    equipoDetalleIdActual.current = equipo.id
    setEquipoDetalle(equipo)
    setDetalleCargando(true)
    setError('')
    setAviso('')
    setComponentes([])
    setRelaciones([])
    setFotografias([])
    setFotografiasCargando(false)
    setErrorFotografias('')
    setUbicacionDetalle(null)
    setHistorialMantenimientos([])
    setHistorialMovimientos([])
    setOpcionesRelacion([])
    setErrorOpcionesRelacion('')

    void refrescarFotografias(equipo.id, solicitudActual).catch(() => undefined)

    const necesitaOpcionesRelacion = puedeEditar && equipo.situacion === 'activo'
    if (necesitaOpcionesRelacion) {
      setOpcionesRelacionCargando(true)
      void listarOpcionesRelacion(equipo.id)
        .then((opciones) => {
          if (!componenteMontado.current || solicitudActual !== solicitudDetalle.current) return
          setOpcionesRelacion(opciones)
        })
        .catch((e: unknown) => {
          if (!componenteMontado.current || solicitudActual !== solicitudDetalle.current) return
          setErrorOpcionesRelacion(mostrarError(e, 'No se pudieron cargar los equipos relacionados.'))
        })
        .finally(() => {
          if (componenteMontado.current && solicitudActual === solicitudDetalle.current) {
            setOpcionesRelacionCargando(false)
          }
        })
    } else {
      setOpcionesRelacionCargando(false)
    }

    try {
      const [detalle, mantenimientos, movimientos] = await Promise.all([
        obtenerDatosDetalleEquipo(equipo.id, equipo.ambiente_id),
        puedeVerMantenimientos
          ? listarMantenimientos({
              equipoId: equipo.id,
              responsableId: '',
              estado: '',
              tipo: '',
              estadoEquipo: '',
              desde: '',
              hasta: '',
              revisionVencida: false,
              ordenReciente: false,
              pagina: 1,
              porPagina: 5,
            })
          : Promise.resolve({ mantenimientos: [], total: 0 }),
        puedeVerMovimientos
          ? listarHistorialMovimientos({
              equipoId: equipo.id,
              desde: '',
              hasta: '',
              pagina: 1,
              porPagina: 5,
            })
          : Promise.resolve({ movimientos: [], total: 0 }),
      ])
      if (!componenteMontado.current || solicitudActual !== solicitudDetalle.current) return
      setComponentes(detalle.componentes)
      setRelaciones(detalle.relaciones)
      setUbicacionDetalle(detalle.ubicacion)
      setFechaUltimoMantenimiento(
        mantenimientos.mantenimientos[0]?.fecha_mantenimiento ?? null,
      )
      setHistorialMantenimientos(mantenimientos.mantenimientos)
      setHistorialMovimientos(movimientos.movimientos)
    } catch (e) {
      if (!componenteMontado.current || solicitudActual !== solicitudDetalle.current) return
      setError(mostrarError(e, 'No se pudo cargar el detalle del equipo.'))
      setComponentes([])
      setRelaciones([])
      setUbicacionDetalle(null)
      setFechaUltimoMantenimiento(null)
      setHistorialMantenimientos([])
      setHistorialMovimientos([])
    } finally {
      if (componenteMontado.current && solicitudActual === solicitudDetalle.current) {
        setDetalleCargando(false)
      }
    }
  }, [puedeEditar, puedeVerMantenimientos, puedeVerMovimientos, refrescarFotografias])

  useEffect(() => {
    const equipoId = searchParams.get('equipo')
    if (!equipoId) return
    let vigente = true
    obtenerEquipo(equipoId)
      .then((equipo) => {
        if (vigente && componenteMontado.current) void abrirDetalle(equipo)
      })
      .catch((e: unknown) => {
        if (vigente && componenteMontado.current) {
          setError(mostrarError(e, 'No se pudo abrir la ficha del equipo.'))
        }
      })
    return () => {
      vigente = false
    }
  }, [searchParams, abrirDetalle])

  async function agregarComponente(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!equipoDetalle || !componenteTipo.trim() || !componenteDetalle.trim()) return
    setError('')
    try {
      await guardarComponente(equipoDetalle.id, {
        tipo: componenteTipo.trim(),
        marca: null,
        modelo: null,
        capacidad: componenteDetalle.trim(),
        numero_serie: null,
        observaciones: null,
      })
      setComponenteTipo('')
      setComponenteDetalle('')
      await abrirDetalle(equipoDetalle)
    } catch (e) {
      setError(mostrarError(e, 'No se pudo registrar el componente.'))
    }
  }

  async function agregarRelacion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!equipoDetalle || !equipoRelacionado) return
    setError('')
    try {
      await guardarRelacion(equipoDetalle.id, equipoRelacionado)
      setEquipoRelacionado('')
      await abrirDetalle(equipoDetalle)
    } catch (e) {
      setError(mostrarError(e, 'No se pudo relacionar el equipo.'))
    }
  }

  async function irAEditarParaAgregarFoto() {
    if (!equipoDetalle) return
    const equipo = equipoDetalle
    cerrarDetalle()
    enfocarSeccionFotosAdicionales.current = true
    await iniciarEdicion(equipo)
  }

  async function agregarFotoEditando() {
    if (!editando || !fotoAdicional.length) return
    setError('')
    setAviso('')
    setGestionandoFoto(true)
    try {
      const fallidas: ArchivoConVista[] = []
      const erroresFoto: string[] = []
      for (const seleccion of fotoAdicional) {
        try {
          await subirFotografia(editando.id, seleccion.archivo, 'adicional')
          liberarVistaArchivo(seleccion)
        } catch (e) {
          fallidas.push(seleccion)
          erroresFoto.push(`${seleccion.archivo.name}: ${mostrarError(e, 'error desconocido')}`)
        }
      }
      setFotoAdicional(fallidas)
      if (erroresFoto.length) {
        setError(`No se pudieron subir algunas fotografías: ${erroresFoto.join('; ')}`)
      }
      if (fallidas.length < fotoAdicional.length) {
        setAviso(`${fotoAdicional.length - fallidas.length} fotografía(s) adicional(es) agregadas.`)
        try {
          await refrescarFotografias(editando.id)
        } catch (e) {
          setError(`Las fotografías se agregaron, pero no se pudo actualizar la vista: ${mostrarError(e, 'error desconocido')}`)
        }
      }
    } finally {
      setGestionandoFoto(false)
    }
  }

  async function cambiarFotografiaPrincipal(equipoId: string, fotografia: Fotografia) {
    setError('')
    setAviso('')
    setGestionandoFoto(true)
    try {
      await establecerFotografiaPrincipal(fotografia.id, equipoId)
      setAviso('Fotografía principal actualizada.')
      try {
        await refrescarFotografias(equipoId)
      } catch (e) {
        setError(`La fotografía principal se cambió, pero no se pudo actualizar la vista: ${mostrarError(e, 'error desconocido')}`)
      }
    } catch (e) {
      setError(mostrarError(e, 'No se pudo cambiar la fotografía principal.'))
    } finally {
      setGestionandoFoto(false)
    }
  }

  async function eliminarFoto(equipoId: string, fotografia: Fotografia) {
    if (!window.confirm('¿Eliminar esta fotografía? Esta acción no se puede deshacer.')) return
    setError('')
    setAviso('')
    setGestionandoFoto(true)
    try {
      await eliminarFotografia(fotografia.id, equipoId)
      setAviso(
        fotografia.tipo === 'principal'
          ? 'Fotografía eliminada. Si había fotografías adicionales, una de ellas quedó como principal.'
          : 'Fotografía eliminada correctamente.',
      )
      try {
        await refrescarFotografias(equipoId)
      } catch (e) {
        setError(`La fotografía se eliminó, pero no se pudo actualizar la vista: ${mostrarError(e, 'error desconocido')}`)
      }
    } catch (e) {
      setError(mostrarError(e, 'No se pudo eliminar la fotografía.'))
    } finally {
      setGestionandoFoto(false)
    }
  }

  async function confirmarBaja(equipo: Equipo) {
    if (
      !window.confirm(
        `¿Dar de baja ${equipo.codigo_institucional}? El registro se conservará en el historial.`,
      )
    ) {
      return
    }
    setError('')
    try {
      await darDeBajaEquipo(equipo.id)
      setAviso(`${equipo.codigo_institucional} fue dado de baja.`)
      cerrarDetalle()
      setPagina(1)
      setActualizacion((actual) => actual + 1)
    } catch (e) {
      setError(mostrarError(e, 'No se pudo dar de baja el equipo.'))
    }
  }

  async function reactivar(equipo: Equipo) {
    if (!window.confirm(`¿Reactivar ${equipo.codigo_institucional}?`)) return
    setError('')
    try {
      await reactivarEquipo(equipo.id)
      setAviso(`${equipo.codigo_institucional} fue reactivado.`)
      setActualizacion((actual) => actual + 1)
    } catch (e) {
      setError(mostrarError(e, 'No se pudo reactivar el equipo.'))
    }
  }

  function solicitarEliminacionDefinitiva(equipo: Equipo) {
    setEquipoAEliminar(equipo)
  }

  function finalizarEliminacionDefinitiva(equipo: Equipo) {
    setAviso(
      `El equipo ${equipo.codigo_institucional} se eliminó definitivamente. La constancia de la baja quedó registrada en la auditoría.`,
    )
    if (equipoDetalle?.id === equipo.id) cerrarDetalle()
    setEquipoAEliminar(null)
    setPagina(1)
    setActualizacion((actual) => actual + 1)
  }

  return (
    <section className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-col items-stretch justify-between gap-4 sm:flex-row sm:items-start">
        <div className="min-w-0">
          <h2 className="text-2xl font-semibold">Inventario tecnológico</h2>
          <p className="mt-1 text-sm text-slate-600">
            Registra, consulta y controla los activos tecnológicos institucionales.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2 sm:flex sm:shrink-0">
          {puedeAdministrarCategorias && (
            <button
              type="button"
              onClick={() => { setCategoriaNueva(''); setCategoriaModal(true) }}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Crear categoría
            </button>
          )}
          {puedeCrear && (
            <button
              type="button"
              onClick={iniciarNuevo}
              className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-orange-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500"
            >
              Nuevo equipo
            </button>
          )}
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}
      {aviso && (
        <p role="status" className="mt-4 rounded-lg bg-green-50 p-3 text-sm text-green-700">
          {aviso}
        </p>
      )}
      <div role="tablist" aria-label="Situación de los equipos" className="flex flex-wrap gap-2">
        <button
          type="button"
          role="tab"
          aria-selected={!verEquiposDadosDeBaja}
          onClick={() => seleccionarVistaEquipos(false)}
          className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
            !verEquiposDadosDeBaja
              ? 'bg-orange-500 text-white shadow-sm'
              : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
          }`}
        >
          Inventario
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={verEquiposDadosDeBaja}
          onClick={() => seleccionarVistaEquipos(true)}
          className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
            verEquiposDadosDeBaja
              ? 'bg-orange-500 text-white shadow-sm'
              : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
          }`}
        >
          Equipos dados de baja
        </button>
      </div>
      <div className="mt-5 grid min-w-0 gap-3 rounded-xl bg-white p-3 shadow sm:grid-cols-2 sm:p-4 lg:grid-cols-4">
        <input
          type="search"
          value={busqueda}
          onChange={(event) => {
            setBusqueda(event.target.value)
            setPagina(1)
          }}
          placeholder="Código, serie, marca o equipo"
          aria-label="Buscar en inventario"
          className="min-w-0 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
        />
        <select
          value={categoriaFiltro}
          onChange={(event) => {
            setCategoriaFiltro(event.target.value)
            setPagina(1)
          }}
          aria-label="Filtrar por categoría"
          className="min-w-0 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
        >
          <option value="">Todas las categorías</option>
          {categorias.map((categoria) => (
            <option key={categoria.id} value={categoria.id}>{categoria.nombre}</option>
          ))}
        </select>
        <select
          value={ambienteFiltro}
          onChange={(event) => {
            setAmbienteFiltro(event.target.value)
            setAmbienteFiltrosIds([])
            setSinUbicacionFiltro(false)
            setPagina(1)
          }}
          aria-label="Filtrar por ubicación"
          className="min-w-0 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
        >
          <option value="">Todas las ubicaciones</option>
          {ambientes.map((ambiente) => (
            <option key={ambiente.id} value={ambiente.id}>
              {ambiente.pabellon} / {ambiente.piso} / {ambiente.codigo} — {ambiente.nombre}
            </option>
          ))}
        </select>
        <select
          value={verEquiposDadosDeBaja ? 'baja' : estado}
          disabled={verEquiposDadosDeBaja}
          onChange={(event) => {
            setEstado(event.target.value)
            setPagina(1)
          }}
          aria-label="Filtrar por estado"
          className="min-w-0 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
        >
          {verEquiposDadosDeBaja
            ? <option value="baja">Equipos dados de baja</option>
            : <option value="">Todos los equipos activos</option>}
          {estadosOperativos.map((opcion) => (
            <option key={opcion} value={opcion}>{etiquetasEstado[opcion]}</option>
          ))}
          {!verEquiposDadosDeBaja && <option value="archivado">Archivado</option>}
        </select>
      </div>

      {(ambienteFiltrosIds.length > 0 || sinUbicacionFiltro) && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-900">
          <span>
            {sinUbicacionFiltro
              ? 'Equipos sin ubicación asignada'
              : `Inventario filtrado por ${ambienteFiltrosIds.length} ambiente(s) del dashboard`}
          </span>
          <button
            type="button"
            onClick={() => {
              setAmbienteFiltrosIds([])
              setSinUbicacionFiltro(false)
              setPagina(1)
            }}
            className="font-semibold text-orange-800 hover:underline"
          >
            Quitar filtro
          </button>
        </div>
      )}

      <div className="mt-4 min-w-0 overflow-hidden rounded-xl bg-white shadow">
        <div className="flex flex-col items-stretch justify-between gap-3 border-b border-slate-100 px-3 py-3 sm:flex-row sm:items-center sm:px-4">
          <h2 className="min-w-0 font-semibold text-slate-800">
            {verEquiposDadosDeBaja
              ? 'Equipos dados de baja'
              : verHistorialCompleto
                ? 'Historial completo de equipos'
                : 'Últimos equipos registrados'}
          </h2>
          {!verEquiposDadosDeBaja && (
            <button
              type="button"
              onClick={() => {
                setPagina(1)
                setVerHistorialCompleto((actual) => !actual)
              }}
              className="w-full rounded-lg border border-blue-200 px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50 sm:w-auto"
            >
              {verHistorialCompleto ? 'Ver últimos registros' : 'Ver historial completo'}
            </button>
          )}
        </div>
        <div className="divide-y divide-slate-100 md:hidden">
          {cargando && <p role="status" className="px-4 py-8 text-center text-sm text-slate-500">Cargando inventario...</p>}
          {!cargando && equipos.length === 0 && <p className="px-4 py-8 text-center text-sm text-slate-500">No hay equipos para mostrar.</p>}
          {!cargando && equipos.map((equipo) => {
            const ambiente = equipo.ambiente_id ? ambientesPorId.get(equipo.ambiente_id) : null
            const deBaja = equipo.situacion !== 'activo'
            return (
              <article key={equipo.id} className="min-w-0 space-y-3 p-4">
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="break-words text-sm font-bold text-orange-800">{equipo.codigo_institucional}</p>
                    <h3 className="mt-0.5 break-words font-semibold text-slate-900">{equipo.nombre}</h3>
                    <p className="mt-0.5 break-words text-xs text-slate-500">{equipo.modelo ?? 'Sin modelo'}</p>
                  </div>
                  <span className={`max-w-[45%] shrink-0 rounded-full px-2.5 py-1 text-center text-[11px] font-semibold leading-tight ${deBaja ? 'bg-slate-100 text-slate-700' : 'bg-emerald-50 text-emerald-800'}`}>
                    {equipo.situacion === 'baja'
                      ? 'Dado de baja'
                      : equipo.situacion === 'archivado'
                        ? 'Archivado'
                        : etiquetasEstado[equipo.estado_operativo]}
                  </span>
                </div>
                <dl className="grid min-w-0 grid-cols-2 gap-x-3 gap-y-2 rounded-lg bg-slate-50 p-3 text-xs">
                  <div className="min-w-0">
                    <dt className="text-slate-500">Categoría</dt>
                    <dd className="mt-0.5 break-words font-medium text-slate-800">{categoriasPorId.get(equipo.categoria_id) ?? '—'}</dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-slate-500">Serie / marca</dt>
                    <dd className="mt-0.5 break-words font-medium text-slate-800">{equipo.numero_serie ?? 'Sin serie'} / {equipo.marca ?? 'Sin marca'}</dd>
                  </div>
                  <div className="col-span-2 min-w-0">
                    <dt className="text-slate-500">Ubicación</dt>
                    <dd className="mt-0.5 break-words font-medium text-slate-800">
                      {ambiente
                        ? `${ambiente.pabellon} / ${ambiente.piso} / ${ambiente.codigo}${equipo.posicion ? ` · ${equipo.posicion}` : ''}`
                        : 'Sin ubicación'}
                    </dd>
                  </div>
                </dl>
                <div className="grid grid-cols-2 gap-2 min-[420px]:grid-cols-3">
                  <button type="button" onClick={() => setEquipoQr(equipo)} className="min-h-10 rounded-lg border border-orange-200 px-3 py-2 text-sm font-semibold text-orange-700 hover:bg-orange-50">QR</button>
                  <button type="button" onClick={() => void abrirDetalle(equipo)} className="min-h-10 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Detalle</button>
                  {puedeEditar && !deBaja && (
                    <button type="button" onClick={() => void iniciarEdicion(equipo)} className="min-h-10 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Editar</button>
                  )}
                  {puedeDarDeBaja && !deBaja && (
                    <button type="button" onClick={() => void confirmarBaja(equipo)} className="min-h-10 rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50">Dar de baja</button>
                  )}
                  {puedeDarDeBaja && deBaja && (
                    <button type="button" onClick={() => void reactivar(equipo)} className="min-h-10 rounded-lg border border-green-200 px-3 py-2 text-sm font-semibold text-green-700 hover:bg-green-50">Reactivar</button>
                  )}
                </div>
              </article>
            )
          })}
        </div>
        <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="border-b bg-slate-50 text-slate-600">
            <tr>
              <th className="px-4 py-3">Código / equipo</th>
              <th className="px-4 py-3">Categoría</th>
              <th className="px-4 py-3">Serie / marca</th>
              <th className="px-4 py-3">Ubicación</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {cargando && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">Cargando inventario...</td></tr>
            )}
            {!cargando && equipos.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">No hay equipos para mostrar.</td></tr>
            )}
            {!cargando && equipos.map((equipo) => {
              const ambiente = equipo.ambiente_id ? ambientesPorId.get(equipo.ambiente_id) : null
              const deBaja = equipo.situacion !== 'activo'
              return (
                <tr key={equipo.id} className="border-b last:border-0">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-blue-800">{equipo.codigo_institucional}</p>
                    <p className="font-medium text-slate-800">{equipo.nombre}</p>
                    <p className="text-xs text-slate-500">{equipo.modelo ?? 'Sin modelo'}</p>
                  </td>
                  <td className="px-4 py-3">{categoriasPorId.get(equipo.categoria_id) ?? '—'}</td>
                  <td className="px-4 py-3">
                    <p>{equipo.numero_serie ?? 'Sin serie'}</p>
                    <p className="text-xs text-slate-500">{equipo.marca ?? 'Sin marca'}</p>
                  </td>
                  <td className="px-4 py-3">
                    {ambiente
                      ? `${ambiente.pabellon} / ${ambiente.piso} / ${ambiente.codigo}`
                      : 'Sin ubicación'}
                    {equipo.posicion && <p className="text-xs text-slate-500">{equipo.posicion}</p>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded px-2 py-1 text-xs font-medium ${deBaja ? 'bg-slate-200 text-slate-700' : 'bg-green-100 text-green-800'}`}>
                      {equipo.situacion === 'baja'
                        ? 'Dado de baja'
                        : equipo.situacion === 'archivado'
                          ? 'Archivado'
                          : etiquetasEstado[equipo.estado_operativo]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => setEquipoQr(equipo)} className="rounded border border-orange-200 px-3 py-1 font-semibold text-orange-700 hover:bg-orange-50">QR</button>
                      <button type="button" onClick={() => void abrirDetalle(equipo)} className="rounded border border-slate-300 px-3 py-1 hover:bg-slate-50">Detalle</button>
                      {puedeEditar && !deBaja && (
                        <button type="button" onClick={() => void iniciarEdicion(equipo)} className="rounded border border-slate-300 px-3 py-1 hover:bg-slate-50">Editar</button>
                      )}
                      {puedeDarDeBaja && !deBaja && (
                        <button type="button" onClick={() => void confirmarBaja(equipo)} className="rounded border border-red-200 px-3 py-1 text-red-700 hover:bg-red-50">Dar de baja</button>
                      )}
                      {puedeDarDeBaja && deBaja && (
                        <button type="button" onClick={() => void reactivar(equipo)} className="rounded border border-green-200 px-3 py-1 text-green-700 hover:bg-green-50">Reactivar</button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        </div>
      </div>
      <div className="mt-3 flex flex-col items-start justify-between gap-3 text-sm text-slate-600 sm:flex-row sm:items-center">
        <span>
          {verHistorialCompleto ? total : Math.min(total, registrosRecientes)} de {total} equipos
          {verHistorialCompleto ? ` · página ${pagina} de ${paginas}` : ' · más recientes'}
        </span>
        <div className="flex w-full gap-2 sm:w-auto sm:justify-end">
          {verHistorialCompleto && (
            <>
              <button type="button" disabled={pagina <= 1 || cargando} onClick={() => setPagina((actual) => actual - 1)} className="min-h-10 flex-1 rounded-lg border border-slate-300 px-3 py-2 disabled:opacity-50 sm:flex-none">Anterior</button>
              <button type="button" disabled={pagina >= paginas || cargando} onClick={() => setPagina((actual) => actual + 1)} className="min-h-10 flex-1 rounded-lg border border-slate-300 px-3 py-2 disabled:opacity-50 sm:flex-none">Siguiente</button>
            </>
          )}
        </div>
      </div>

      {categoriaModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <form onSubmit={(event) => void agregarCategoria(event)} className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold">Nueva categoría de equipo</h3>
            <p className="mt-1 text-sm text-slate-500">Ejemplos: computadoras, impresoras, redes o periféricos.</p>
            <label className="mt-4 block text-sm">Nombre
              <input autoFocus required maxLength={100} value={categoriaNueva} onChange={(event) => setCategoriaNueva(event.target.value)} className="mt-1 w-full rounded border border-slate-300 px-3 py-2" />
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" disabled={guardandoCategoria} onClick={() => setCategoriaModal(false)} className="rounded border border-slate-300 px-4 py-2">Cancelar</button>
              <button type="submit" disabled={guardandoCategoria} className="rounded bg-blue-600 px-4 py-2 font-semibold text-white disabled:opacity-60">{guardandoCategoria ? 'Guardando...' : 'Crear categoría'}</button>
            </div>
          </form>
        </div>
      )}

      {modalAbierto && (
        <div className="fixed inset-0 z-50 flex min-h-full items-start justify-center overflow-y-auto bg-slate-950/50 p-3 backdrop-blur-[2px] sm:p-6 lg:p-8">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="formulario-equipo-titulo"
            className="my-0 max-h-[calc(100dvh-1.5rem)] w-full max-w-5xl overflow-y-auto rounded-2xl border border-white/70 bg-white p-4 shadow-2xl sm:my-0 sm:max-h-[calc(100dvh-3rem)] sm:p-7 lg:p-8"
          >
            <div className="flex flex-col items-stretch justify-between gap-3 sm:flex-row sm:items-center">
              <div className="min-w-0">
                <h3 id="formulario-equipo-titulo" className="text-xl font-bold text-slate-900">{editando ? 'Editar equipo' : 'Crear equipo'}</h3>
                <p className="text-sm text-slate-500">El código institucional se asigna automáticamente y no cambia al mover el activo.</p>
                {cargandoDatosEdicion && (
                  <p role="status" className="mt-1 text-xs text-slate-500">Cargando características del equipo…</p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2 sm:flex sm:shrink-0">
                <button type="button" onClick={() => setModalAbierto(false)} className="min-h-10 rounded-lg px-3 py-2 text-sm font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-800">Cancelar</button>
                <button
                  type="submit"
                  form="formulario-equipo"
                  disabled={guardando || cargandoDatosEdicion || Boolean(errorDatosEdicion) || !categorias.length}
                  className="min-h-10 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-orange-600 disabled:opacity-60"
                >
                  {guardando ? 'Guardando...' : editando ? 'Guardar cambios' : 'Guardar equipo'}
                </button>
              </div>
            </div>
            {error && (
              <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                {error}
              </p>
            )}
            {errorDatosEdicion && (
              <p role="alert" className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                No se puede guardar todavía porque no fue posible cargar las características técnicas. Cierra y vuelve a abrir la edición para intentarlo otra vez.
              </p>
            )}
            {aviso && (
              <p role="status" className="mt-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
                {aviso}
              </p>
            )}
            {!categorias.length && (
              <p role="alert" className="mt-4 rounded bg-amber-50 p-3 text-sm text-amber-900">
                No hay categorías activas. Un administrador debe crearlas en la gestión de categorías antes de registrar equipos.
              </p>
            )}
            <form id="formulario-equipo" onSubmit={(event) => void guardarEquipo(event)} className="mt-4 space-y-5">
              <fieldset disabled={guardando || !categorias.length} className="min-w-0 space-y-5">
                <div className="min-w-0 rounded-xl border border-slate-100 bg-white p-3 sm:p-5">
                  <div className="border-b border-slate-100 pb-4">
                    <h4 className="font-bold text-slate-900">Datos principales</h4>
                    <p className="mt-1 text-sm text-slate-500">
                      Solo el nombre y la categoría son obligatorios. Puedes completar el resto ahora o después.
                    </p>
                  </div>
                  <div className="mt-4 space-y-4">
                    <label className="grid gap-2 text-sm sm:grid-cols-[190px_minmax(0,1fr)] sm:items-center">
                      <span className="font-semibold text-slate-700">Nombre o descripción <span className="text-orange-600">*</span></span>
                      <input required maxLength={200} value={datos.nombre} onChange={(e) => cambiarDato('nombre', e.target.value)} placeholder="Ej. Computadora de oficina" className="w-full rounded-xl border border-slate-200 px-3.5 py-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-orange-400 focus:ring-4 focus:ring-orange-100" />
                    </label>
                    <label className="grid gap-2 text-sm sm:grid-cols-[190px_minmax(0,1fr)] sm:items-center">
                      <span className="font-semibold text-slate-700">Categoría <span className="text-orange-600">*</span></span>
                      <span className="relative block">
                        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400">
                          <path d="m20 13-7 7L3 10V4h6l11 9Z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                          <circle cx="7.5" cy="7.5" r="1" fill="currentColor" />
                        </svg>
                        <select required value={datos.categoria_id} onChange={(e) => cambiarDato('categoria_id', e.target.value)} className="w-full appearance-none rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-20 text-sm text-slate-800 outline-none transition focus:border-orange-400 focus:ring-4 focus:ring-orange-100">
                          <option value="">Selecciona una categoría</option>
                          {categorias.map((item) => <option key={item.id} value={item.id}>{item.nombre}</option>)}
                        </select>
                        <button
                          type="button"
                          aria-label="Quitar categoría seleccionada"
                          disabled={!datos.categoria_id}
                          onClick={() => cambiarDato('categoria_id', '')}
                          className="absolute right-9 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:invisible"
                        >
                          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-4 w-4">
                            <path d="m7 7 10 10M17 7 7 17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                          </svg>
                        </button>
                        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500">
                          <path d="m7 10 5 5 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </span>
                    </label>
                    <label className="grid gap-2 text-sm sm:grid-cols-[190px_minmax(0,1fr)] sm:items-center">
                      <span className="font-semibold text-slate-700">Estado operativo</span>
                      <select value={datos.estado_operativo} onChange={(e) => cambiarDato('estado_operativo', e.target.value as EstadoOperativo)} className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm outline-none transition focus:border-orange-400 focus:ring-4 focus:ring-orange-100">
                        {estadosOperativos.map((item) => <option key={item} value={item}>{etiquetasEstado[item]}</option>)}
                      </select>
                    </label>
                  </div>
                </div>

                <details className="rounded-xl border border-slate-200 p-4 sm:p-5">
                  <summary className="cursor-pointer font-medium">Más datos (opcionales)</summary>
                  <div className="mt-4 space-y-5">
                    <div>
                      <h4 className="font-semibold">Identificación, ubicación y control</h4>
                      {editando && (
                        <p className="mt-1 text-xs text-slate-500">
                          La ubicación, posición y responsable se cambian desde el módulo Movimientos para conservar su historial.
                        </p>
                      )}
                      <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        <label className="text-sm">Ubicación
                          <select disabled={!!editando} value={datos.ambiente_id ?? ''} onChange={(e) => cambiarDato('ambiente_id', e.target.value || null)} className="mt-1 w-full rounded border border-slate-300 px-3 py-2 disabled:bg-slate-100">
                            <option value="">Sin ubicación asignada</option>
                            {ambientes.map((item) => <option key={item.id} value={item.id}>{item.pabellon} / {item.piso} / {item.codigo} — {item.nombre}</option>)}
                          </select>
                        </label>
                        <label className="text-sm">Código / posición en ambiente
                          <input disabled={!!editando} maxLength={100} value={datos.posicion ?? ''} onChange={(e) => cambiarDato('posicion', e.target.value)} placeholder="Ej. Escritorio 4" className="mt-1 w-full rounded border border-slate-300 px-3 py-2 disabled:bg-slate-100" />
                        </label>
                        <label className="text-sm">Responsable asignado
                          <select disabled={!!editando} value={datos.responsable_id ?? ''} onChange={(e) => cambiarDato('responsable_id', e.target.value || null)} className="mt-1 w-full rounded border border-slate-300 px-3 py-2 disabled:bg-slate-100">
                            <option value="">Sin responsable</option>
                            {responsables.map((item) => <option key={item.id} value={item.id}>{item.nombres} {item.apellidos} ({item.rol})</option>)}
                          </select>
                        </label>
                        <label className="text-sm">Marca
                          <input maxLength={100} value={datos.marca ?? ''} onChange={(e) => cambiarDato('marca', e.target.value)} className="mt-1 w-full rounded border border-slate-300 px-3 py-2" />
                        </label>
                        <label className="text-sm">Modelo
                          <input maxLength={100} value={datos.modelo ?? ''} onChange={(e) => cambiarDato('modelo', e.target.value)} className="mt-1 w-full rounded border border-slate-300 px-3 py-2" />
                        </label>
                        <label className="text-sm">Número de serie
                          <input maxLength={150} value={datos.numero_serie ?? ''} onChange={(e) => cambiarDato('numero_serie', e.target.value)} className="mt-1 w-full rounded border border-slate-300 px-3 py-2" />
                        </label>
                        <label className="text-sm">Código patrimonial
                          <input maxLength={100} value={datos.codigo_patrimonial ?? ''} onChange={(e) => cambiarDato('codigo_patrimonial', e.target.value)} className="mt-1 w-full rounded border border-slate-300 px-3 py-2" />
                        </label>
                        <label className="text-sm">Fecha de adquisición
                          <input type="date" value={datos.fecha_adquisicion ?? ''} onChange={(e) => cambiarDato('fecha_adquisicion', e.target.value || null)} className="mt-1 w-full rounded border border-slate-300 px-3 py-2" />
                        </label>
                        <label className="text-sm">Vencimiento de garantía
                          <input type="date" value={datos.fecha_garantia ?? ''} onChange={(e) => cambiarDato('fecha_garantia', e.target.value || null)} className="mt-1 w-full rounded border border-slate-300 px-3 py-2" />
                        </label>
                        <label className="text-sm sm:col-span-2">Observaciones
                          <textarea maxLength={2000} rows={2} value={datos.observaciones ?? ''} onChange={(e) => cambiarDato('observaciones', e.target.value)} className="mt-1 w-full rounded border border-slate-300 px-3 py-2" />
                        </label>
                      </div>
                    </div>

                    <div>
                      <h4 className="font-semibold">Características técnicas</h4>
                      <p className="text-xs text-slate-500">Se registran como componentes asociados, separados del activo principal.</p>
                      <div className="mt-2 grid gap-3 sm:grid-cols-2">
                        {etiquetasTecnicas.map(([tipo, etiqueta]) => (
                          <label key={tipo} className="text-sm">{etiqueta}
                            <input maxLength={300} value={tecnicas[tipo] ?? ''} onChange={(e) => setTecnicas((actual) => ({ ...actual, [tipo]: e.target.value }))} className="mt-1 w-full rounded border border-slate-300 px-3 py-2" />
                          </label>
                        ))}
                      </div>
                    </div>

                  </div>
                </details>

              </fieldset>

              <fieldset disabled={guardando || (!categorias.length && !editando)} className="min-w-0">
                    <div className="rounded-xl border border-slate-100 bg-white p-4 sm:p-5">
                      <h4 className="font-bold text-slate-900">Fotografías del equipo</h4>
                      <p className="mt-1 text-sm text-slate-500">
                        La imagen se optimiza al guardarla. Usa JPG, PNG o WebP (máximo 2 MB por imagen optimizada).
                      </p>
                      <div className="mt-5 space-y-6">
                        <div className="grid gap-3 sm:grid-cols-[190px_minmax(0,1fr)] sm:items-start">
                          <div className="pt-2 text-sm font-semibold text-slate-700">Imagen principal</div>
                          <div>
                            <div className="grid gap-3 sm:grid-cols-[60px_minmax(0,1fr)]">
                              {foto || fotografiaPrincipal ? (
                                <img
                                  src={foto?.vista ?? fotografiaPrincipal?.url}
                                  alt={foto ? `Vista previa de ${foto.archivo.name}` : 'Imagen principal actual'}
                                  className="h-[60px] w-[60px] rounded-lg border border-slate-200 object-cover"
                                />
                              ) : (
                                <div className="hidden h-[60px] w-[60px] rounded-lg border border-dashed border-slate-200 bg-slate-50 sm:block" />
                              )}
                              <input
                                ref={fotoInputRef}
                                type="file"
                                accept="image/jpeg,image/png,image/webp"
                                className="sr-only"
                                onChange={(event) => {
                                  seleccionarFotografiaPrincipal(event.target.files?.[0])
                                  event.currentTarget.value = ''
                                }}
                              />
                              <button
                                type="button"
                                onClick={() => fotoInputRef.current?.click()}
                                onDragOver={(event) => event.preventDefault()}
                                onDrop={(event) => {
                                  event.preventDefault()
                                  seleccionarFotografiaPrincipal(event.dataTransfer.files[0])
                                }}
                                className="flex min-h-28 w-full flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white px-5 py-5 text-center transition hover:border-orange-300 hover:bg-orange-50/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500"
                              >
                                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-orange-100 text-orange-600">
                                  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-5 w-5">
                                    <path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M5 15.5v3A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5v-3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                                  </svg>
                                </span>
                                <span className="mt-2 text-sm font-semibold text-slate-800">
                                  <span className="text-orange-700">Haz clic para cambiar</span> o arrastra y suelta
                                </span>
                                <span className="mt-1 text-xs text-slate-500">JPG, PNG o WebP · máximo 2 MB</span>
                              </button>
                            </div>
                            {foto && (
                              <>
                                <div className="mt-2 flex items-center gap-3 rounded-lg border border-slate-200 p-3">
                                  <span className="relative flex h-10 w-10 shrink-0 items-end justify-center rounded-md border border-slate-200 bg-white pb-1 text-[9px] font-bold text-orange-700">
                                    {foto.archivo.name.split('.').pop()?.slice(0, 4).toUpperCase() ?? 'IMG'}
                                    <span className="absolute -bottom-1 left-0 rounded bg-orange-500 px-1 text-[7px] text-white">ARCHIVO</span>
                                  </span>
                                  <span className="min-w-0 flex-1">
                                    <span className="block truncate text-sm font-semibold text-slate-700">{foto.archivo.name}</span>
                                    <span className="text-xs text-slate-500">{formatoPeso(foto.archivo.size)} · Lista para guardar</span>
                                  </span>
                                  <svg aria-label="Archivo listo" role="img" viewBox="0 0 24 24" fill="none" className="h-5 w-5 shrink-0 text-green-600">
                                    <path d="m5 12 4 4L19 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                  </svg>
                                  <button
                                    type="button"
                                    aria-label="Quitar fotografía principal"
                                    onClick={() => {
                                      if (foto) liberarVistaArchivo(foto)
                                      setFoto(null)
                                    }}
                                    className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                                  >
                                    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-4 w-4">
                                      <path d="m7 7 10 10M17 7 7 17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                                    </svg>
                                  </button>
                                </div>
                                <div className="mt-2 flex items-center gap-2">
                                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-orange-100" role="progressbar" aria-label="Archivo listo para guardar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={100}>
                                    <div className="h-full w-full rounded-full bg-orange-500" />
                                  </div>
                                  <span className="text-xs font-medium text-slate-600">100%</span>
                                </div>
                              </>
                            )}
                          </div>
                        </div>

                        <div ref={fotoAdicionalSeccionRef} className="grid gap-3 border-t border-slate-100 pt-5 sm:grid-cols-[190px_minmax(0,1fr)] sm:items-start">
                          <div className="pt-2 text-sm font-semibold text-slate-700">Imágenes adicionales</div>
                          <div>
                            {fotografiasCargando && (
                              <p role="status" className="mb-2 text-xs text-slate-500">Cargando imágenes existentes…</p>
                            )}
                            {errorFotografias && (
                              <div role="alert" className="mb-2 flex flex-wrap items-center gap-2 rounded-lg bg-red-50 p-2 text-xs text-red-700">
                                <span>{errorFotografias}</span>
                                <button type="button" onClick={() => void refrescarFotografias(editando?.id ?? '').catch(() => undefined)} disabled={!editando} className="font-semibold underline disabled:hidden">
                                  Reintentar
                                </button>
                              </div>
                            )}
                            <div className="mb-3 flex flex-wrap gap-2">
                              {editando && fotografias.filter((item) => item.tipo !== 'principal').map((fotografia) => (
                                <div key={fotografia.id} className="w-16">
                                  <a href={fotografia.url} target="_blank" rel="noreferrer">
                                    <img
                                      src={fotografia.url}
                                      alt={fotografia.descripcion ?? `Fotografía de ${editando.codigo_institucional}`}
                                      className="h-16 w-16 rounded-md border border-slate-200 object-cover"
                                    />
                                  </a>
                                  <div className="mt-1 flex justify-center gap-2">
                                    <button
                                      type="button"
                                      disabled={gestionandoFoto}
                                      aria-label="Usar como imagen principal"
                                      title="Usar como imagen principal"
                                      onClick={() => void cambiarFotografiaPrincipal(editando.id, fotografia)}
                                      className="text-xs font-medium text-blue-700 hover:underline disabled:opacity-50"
                                    >
                                      Principal
                                    </button>
                                    <button
                                      type="button"
                                      disabled={gestionandoFoto}
                                      aria-label="Eliminar imagen adicional"
                                      title="Eliminar imagen"
                                      onClick={() => void eliminarFoto(editando.id, fotografia)}
                                      className="text-xs font-medium text-red-700 hover:underline disabled:opacity-50"
                                    >
                                      Quitar
                                    </button>
                                  </div>
                                </div>
                              ))}
                              {fotoAdicional.map((seleccion, indice) => (
                                <div key={`${seleccion.archivo.name}-${seleccion.archivo.size}-${seleccion.archivo.lastModified}-${indice}`} className="w-16">
                                  <div className="relative">
                                    <img src={seleccion.vista} alt={`Vista previa de ${seleccion.archivo.name}`} className="h-16 w-16 rounded-md border border-orange-200 object-cover" />
                                    <button
                                      type="button"
                                      aria-label={`Quitar ${seleccion.archivo.name}`}
                                      onClick={() => {
                                        liberarVistaArchivo(seleccion)
                                        setFotoAdicional((actuales) => actuales.filter((_, posicion) => posicion !== indice))
                                      }}
                                      className="absolute -right-1 -top-1 rounded-full bg-white p-0.5 text-slate-600 shadow hover:text-red-600"
                                    >
                                      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-4 w-4">
                                        <path d="m7 7 10 10M17 7 7 17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                                      </svg>
                                    </button>
                                  </div>
                                  <span className="mt-1 block truncate text-[10px] text-slate-500">{seleccion.archivo.name}</span>
                                </div>
                              ))}
                            </div>
                            <input
                              ref={fotoAdicionalInputRef}
                              type="file"
                              accept="image/jpeg,image/png,image/webp"
                              multiple
                              className="sr-only"
                              onChange={(event) => {
                                if (event.target.files) seleccionarFotografiasAdicionales(event.target.files)
                                event.currentTarget.value = ''
                              }}
                            />
                            <div
                              onDragOver={(event) => event.preventDefault()}
                              onDrop={(event) => {
                                event.preventDefault()
                                seleccionarFotografiasAdicionales(event.dataTransfer.files)
                              }}
                              className="flex min-h-24 flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white px-4 py-4 text-center transition hover:border-orange-300 hover:bg-orange-50/40"
                            >
                              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-orange-100 text-orange-600">
                                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-5 w-5">
                                  <path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M5 15.5v3A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5v-3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              </span>
                              <button ref={fotoAdicionalSelectorRef} type="button" onClick={() => fotoAdicionalInputRef.current?.click()} className="mt-2 text-sm font-semibold text-orange-700 hover:text-orange-800">
                                Haz clic para añadir imágenes
                              </button>
                              <span className="mt-1 text-xs text-slate-500">o arrástralas aquí · Puedes seleccionar varias</span>
                            </div>
                            <div className="mt-3 flex justify-end">
                              <button
                                type="button"
                                disabled={!fotoAdicional.length || gestionandoFoto || !editando}
                                onClick={() => void agregarFotoEditando()}
                                className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-orange-200 hover:bg-orange-50 disabled:opacity-50"
                              >
                                {gestionandoFoto ? 'Subiendo...' : editando ? `Subir imágenes${fotoAdicional.length ? ` (${fotoAdicional.length})` : ''}` : `${fotoAdicional.length} lista(s) para guardar`}
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
              </fieldset>

              {duplicados.length > 0 && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">
                  <p className="font-semibold">Coincidencias posibles (vuelve a guardar si confirmas que son activos distintos):</p>
                  <ul className="mt-1 list-inside list-disc">
                    {duplicados.map((item) => <li key={item.id}>{item.codigo_institucional} — {item.nombre} — serie {item.numero_serie ?? 'sin serie'} — patrimonio {item.codigo_patrimonial ?? 'sin código'}</li>)}
                  </ul>
                </div>
              )}
              <div className="grid grid-cols-2 gap-2 border-t border-slate-100 pt-4 sm:flex sm:justify-end">
                <button type="button" onClick={() => setModalAbierto(false)} className="min-h-10 rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100">Cancelar</button>
                <button type="submit" disabled={guardando || cargandoDatosEdicion || Boolean(errorDatosEdicion) || !categorias.length} className="min-h-10 rounded-lg bg-orange-500 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-orange-600 disabled:opacity-60">
                  {guardando ? 'Guardando...' : editando ? 'Guardar cambios' : 'Registrar equipo'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {equipoQr && <EquipoQrDialog key={equipoQr.id} equipo={equipoQr} onClose={cerrarQr} />}

      {equipoDetalle && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/50 p-3 sm:p-8">
          <section className="mx-auto max-w-4xl rounded-xl bg-white p-4 shadow-xl sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-blue-700">{equipoDetalle.codigo_institucional}</p>
                <h3 className="break-words text-xl font-semibold">{equipoDetalle.nombre}</h3>
                <p className="text-sm text-slate-500">{categoriasPorId.get(equipoDetalle.categoria_id) ?? 'Categoría'} · {equipoDetalle.marca ?? 'Sin marca'} {equipoDetalle.modelo ?? ''}</p>
              </div>
              <button type="button" onClick={cerrarDetalle} aria-label="Cerrar detalle" className="rounded border px-3 py-1">Cerrar</button>
            </div>
            {error && (
              <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                {error}
              </p>
            )}
            {aviso && (
              <p role="status" className="mt-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
                {aviso}
              </p>
            )}
            {detalleCargando ? <p className="py-8 text-center">Cargando detalle...</p> : (
              <div className="mt-4 space-y-5">
                <dl className="grid gap-3 rounded-lg bg-slate-50 p-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
                  <div><dt className="text-slate-500">Número de serie</dt><dd className="font-medium">{equipoDetalle.numero_serie ?? '—'}</dd></div>
                  <div><dt className="text-slate-500">Código patrimonial</dt><dd className="font-medium">{equipoDetalle.codigo_patrimonial ?? '—'}</dd></div>
                  <div><dt className="text-slate-500">Estado operativo</dt><dd className="font-medium">{equipoDetalle.situacion === 'baja' ? 'Dado de baja' : etiquetasEstado[equipoDetalle.estado_operativo]}</dd></div>
                  <div><dt className="text-slate-500">Ubicación / posición</dt><dd className="font-medium">{equipoDetalle.ambiente_id ? ubicacionDetalle ? `${ubicacionDetalle.pabellon} / ${ubicacionDetalle.piso} / ${ubicacionDetalle.codigo} — ${ubicacionDetalle.nombre}${ubicacionDetalle.activo ? '' : ' (inactivo)'}` : ambientesPorId.get(equipoDetalle.ambiente_id)?.nombre ?? 'Ubicación no disponible' : 'Sin ubicación'}{equipoDetalle.posicion ? ` / ${equipoDetalle.posicion}` : ''}</dd></div>
                  <div><dt className="text-slate-500">Responsable</dt><dd className="font-medium">{equipoDetalle.responsable_id ? responsablesPorId.get(equipoDetalle.responsable_id) ?? 'No visible' : 'Sin asignar'}</dd></div>
                  <div><dt className="text-slate-500">Adquisición / garantía</dt><dd className="font-medium">{fechaCorta(equipoDetalle.fecha_adquisicion)} / {fechaCorta(equipoDetalle.fecha_garantia)}</dd></div>
                  {puedeVerMantenimientos && <div><dt className="text-slate-500">Último mantenimiento registrado</dt><dd className="font-medium">{fechaUltimoMantenimiento ? new Date(fechaUltimoMantenimiento).toLocaleDateString() : 'Sin mantenimientos'}</dd></div>}
                  <div><dt className="text-slate-500">Registrado</dt><dd className="font-medium">{new Date(equipoDetalle.created_at).toLocaleString()}</dd></div>
                  <div><dt className="text-slate-500">Actualizado</dt><dd className="font-medium">{new Date(equipoDetalle.updated_at).toLocaleString()}</dd></div>
                  <div className="sm:col-span-2 lg:col-span-3"><dt className="text-slate-500">Observaciones</dt><dd className="font-medium">{equipoDetalle.observaciones || '—'}</dd></div>
                </dl>

                <div>
                  <h4 className="font-semibold">Componentes y características técnicas</h4>
                  {componentes.length ? (
                    <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                      {componentes.map((componente) => (
                        <li key={componente.id} className="rounded border border-slate-200 p-3 text-sm">
                          <span className="font-medium">{componente.tipo}</span>
                          <span className="ml-2 text-slate-600">{componente.capacidad ?? componente.modelo ?? componente.marca ?? '—'}</span>
                          {componente.numero_serie && <p className="text-xs text-slate-500">Serie: {componente.numero_serie}</p>}
                        </li>
                      ))}
                    </ul>
                  ) : <p className="mt-1 text-sm text-slate-500">Sin componentes registrados.</p>}
                  {puedeEditar && equipoDetalle.situacion === 'activo' && (
                    <form onSubmit={(event) => void agregarComponente(event)} className="mt-2 flex flex-wrap gap-2">
                      <input required value={componenteTipo} onChange={(e) => setComponenteTipo(e.target.value)} maxLength={80} placeholder="Tipo de componente" className="rounded border border-slate-300 px-3 py-2 text-sm" />
                      <input required value={componenteDetalle} onChange={(e) => setComponenteDetalle(e.target.value)} maxLength={300} placeholder="Modelo, capacidad o especificación" className="min-w-56 flex-1 rounded border border-slate-300 px-3 py-2 text-sm" />
                      <button type="submit" className="rounded border border-slate-300 px-3 py-2 text-sm">Agregar componente</button>
                    </form>
                  )}
                </div>

                <div>
                  <h4 className="font-semibold">Equipos relacionados</h4>
                  {relaciones.length ? (
                    <ul className="mt-2 space-y-1 text-sm">
                      {relaciones.map((relacion) => (
                        <li key={relacion.id} className="rounded border border-slate-200 p-2">
                          {relacion.equipo_principal_id === equipoDetalle.id ? relacion.equipo_relacionado_id : relacion.equipo_principal_id}
                          <span className="ml-2 text-slate-500">({relacion.tipo_relacion})</span>
                        </li>
                      ))}
                    </ul>
                  ) : <p className="mt-1 text-sm text-slate-500">Sin relaciones registradas.</p>}
                  {puedeEditar && equipoDetalle.situacion === 'activo' && (
                    <>
                      {errorOpcionesRelacion && (
                        <p role="alert" className="mt-2 rounded bg-red-50 p-2 text-sm text-red-700">
                          {errorOpcionesRelacion}
                        </p>
                      )}
                      <form onSubmit={(event) => void agregarRelacion(event)} className="mt-2 flex flex-wrap gap-2">
                        <select required value={equipoRelacionado} onChange={(e) => setEquipoRelacionado(e.target.value)} className="min-w-56 flex-1 rounded border border-slate-300 px-3 py-2 text-sm">
                          <option value="">Selecciona el equipo relacionado</option>
                          {opcionesRelacionCargando && <option disabled>Cargando equipos…</option>}
                          {opcionesRelacion.map((opcion) => <option key={opcion.id} value={opcion.id}>{opcion.codigo_institucional} — {opcion.nombre}</option>)}
                        </select>
                        <button type="submit" disabled={opcionesRelacionCargando || Boolean(errorOpcionesRelacion)} className="rounded border border-slate-300 px-3 py-2 text-sm disabled:opacity-50">Relacionar como periférico</button>
                      </form>
                    </>
                  )}
                </div>

                <div>
                  <h4 className="font-semibold">Fotografías</h4>
                  {fotografiasCargando && (
                    <p role="status" className="mt-2 text-sm text-slate-500">Cargando fotografías…</p>
                  )}
                  {errorFotografias && (
                    <div role="alert" className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
                      <span>{errorFotografias}</span>
                      <button
                        type="button"
                        onClick={() => void refrescarFotografias(equipoDetalle.id).catch(() => undefined)}
                        className="font-semibold underline"
                      >
                        Reintentar
                      </button>
                    </div>
                  )}
                  {fotografias.length ? (
                    <div className="mt-2 flex flex-wrap gap-3">
                      {fotografias.map((fotografia) => (
                        <div key={fotografia.id} className="w-40">
                          <a href={fotografia.url} target="_blank" rel="noreferrer">
                            <img src={fotografia.url} alt={fotografia.descripcion ?? `Fotografía de ${equipoDetalle.codigo_institucional}`} className="h-32 w-40 rounded-lg border object-cover" />
                          </a>
                          <div className="mt-1 flex flex-wrap items-center gap-1">
                            <span className={`rounded px-2 py-1 text-[10px] font-semibold ${fotografia.tipo === 'principal' ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-600'}`}>
                              {fotografia.tipo === 'principal' ? 'Principal' : 'Adicional'}
                            </span>
                            {puedeEditar && equipoDetalle.situacion === 'activo' && fotografia.tipo !== 'principal' && (
                              <button
                                type="button"
                                disabled={gestionandoFoto}
                                onClick={() => void cambiarFotografiaPrincipal(equipoDetalle.id, fotografia)}
                                className="text-xs font-medium text-blue-700 hover:underline disabled:opacity-50"
                              >
                                Hacer principal
                              </button>
                            )}
                            {puedeEditar && equipoDetalle.situacion === 'activo' && (
                              <button
                                type="button"
                                disabled={gestionandoFoto}
                                onClick={() => void eliminarFoto(equipoDetalle.id, fotografia)}
                                className="text-xs font-medium text-red-700 hover:underline disabled:opacity-50"
                              >
                                Eliminar
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : !fotografiasCargando && !errorFotografias && (
                    <p className="mt-1 text-sm text-slate-500">Sin fotografías.</p>
                  )}
                  {puedeEditar && equipoDetalle.situacion === 'activo' && (
                    <div className="mt-2">
                      <button type="button" onClick={() => void irAEditarParaAgregarFoto()} disabled={gestionandoFoto} className="min-h-10 rounded border border-slate-300 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50">
                        Agregar fotografía
                      </button>
                    </div>
                  )}
                </div>

                {(puedeVerMantenimientos || puedeVerMovimientos) && (
                  <div className="grid gap-4 lg:grid-cols-2">
                    {puedeVerMantenimientos && (
                      <section className="rounded-lg border border-slate-200 p-4">
                        <h4 className="font-semibold">Historial de mantenimiento</h4>
                        {historialMantenimientos.length ? (
                          <ul className="mt-3 space-y-2">
                            {historialMantenimientos.map((mantenimiento) => (
                              <li key={mantenimiento.id} className="rounded-lg bg-slate-50 p-3 text-sm">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <span className="font-semibold capitalize">{mantenimiento.tipo} · {mantenimiento.estado.replace('_', ' ')}</span>
                                  <time className="text-xs text-slate-500">{fechaCorta(mantenimiento.fecha_mantenimiento)}</time>
                                </div>
                                <p className="mt-1 text-slate-600">{mantenimiento.problema_reportado || mantenimiento.descripcion || 'Sin descripción'}</p>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="mt-2 text-sm text-slate-500">Sin mantenimientos registrados.</p>
                        )}
                        {equipoDetalle && (
                          <Link
                            to={`/mantenimientos?equipo=${equipoDetalle.id}`}
                            className="mt-3 inline-flex text-sm font-semibold text-blue-700 hover:text-blue-900"
                          >
                            Ver todo el historial de este equipo
                          </Link>
                        )}
                      </section>
                    )}
                    {puedeVerMovimientos && (
                      <section className="rounded-lg border border-slate-200 p-4">
                        <h4 className="font-semibold">Historial de movimientos</h4>
                        {historialMovimientos.length ? (
                          <ul className="mt-3 space-y-2">
                            {historialMovimientos.map((movimiento) => (
                              <li key={movimiento.id} className="rounded-lg bg-slate-50 p-3 text-sm">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <span className="font-semibold">{movimiento.ubicacion_origen ?? 'Sin ubicación'} → {movimiento.ubicacion_destino ?? 'Sin ubicación'}</span>
                                  <time className="text-xs text-slate-500">{fechaCorta(movimiento.fecha_movimiento)}</time>
                                </div>
                                <p className="mt-1 text-slate-600">{movimiento.motivo}</p>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="mt-2 text-sm text-slate-500">Sin movimientos registrados.</p>
                        )}
                      </section>
                    )}
                  </div>
                )}
              </div>
            )}
            <div className="mt-5 grid grid-cols-1 gap-2 min-[420px]:grid-cols-2 sm:flex sm:justify-end">
              {puedeEditar && equipoDetalle.situacion === 'activo' && <button type="button" onClick={() => { cerrarDetalle(); void iniciarEdicion(equipoDetalle) }} className="min-h-10 rounded-lg border border-slate-300 px-4 py-2 text-sm">Editar equipo</button>}
              {puedeDarDeBaja && equipoDetalle.situacion === 'activo' && <button type="button" onClick={() => void confirmarBaja(equipoDetalle)} className="min-h-10 rounded-lg border border-red-200 px-4 py-2 text-sm text-red-700">Dar de baja</button>}
              {puedeDarDeBaja && equipoDetalle.situacion !== 'activo' && <button type="button" onClick={() => void reactivar(equipoDetalle)} className="min-h-10 rounded-lg border border-green-200 px-4 py-2 text-sm text-green-700">Reactivar equipo</button>}
              {puedeDarDeBaja && equipoDetalle.situacion === 'baja' && (
                <button
                  type="button"
                  onClick={() => solicitarEliminacionDefinitiva(equipoDetalle)}
                  className="min-h-10 rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-100"
                >
                  Eliminar definitivamente
                </button>
              )}
            </div>
          </section>
        </div>
      )}

      {equipoAEliminar && (
        <ConfirmarEliminacionEquipo
          equipo={equipoAEliminar}
          onCancelar={() => setEquipoAEliminar(null)}
          onEliminado={finalizarEliminacionDefinitiva}
        />
      )}
    </section>
  )
}
