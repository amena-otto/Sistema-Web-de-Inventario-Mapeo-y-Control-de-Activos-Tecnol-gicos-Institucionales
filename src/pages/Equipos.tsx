import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
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
  importarFila,
  listarOpcionesRelacion,
  listarEquipos,
  listarEquiposParaExportar,
  obtenerDetalleEquipo,
  obtenerEquipo,
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
  type RelacionEquipo,
  type Responsable,
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

function normalizarCsv(valor: string) {
  return valor
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase()
}

function normalizarCabeceraCsv(valor: string) {
  return normalizarCsv(valor).replace(/\s+/g, '_')
}

function detectarSeparador(texto: string) {
  const primeraLinea = texto.split(/\r\n|\n|\r/, 1)[0] ?? ''
  let entreComillas = false
  const conteos = new Map<string, number>([
    [',', 0],
    [';', 0],
    ['\t', 0],
  ])

  for (let indice = 0; indice < primeraLinea.length; indice += 1) {
    const caracter = primeraLinea[indice]
    if (caracter === '"' && primeraLinea[indice + 1] === '"' && entreComillas) {
      indice += 1
    } else if (caracter === '"') {
      entreComillas = !entreComillas
    } else if (!entreComillas && conteos.has(caracter)) {
      conteos.set(caracter, (conteos.get(caracter) ?? 0) + 1)
    }
  }

  const [separador, cantidad] = [...conteos.entries()].sort(
    (a, b) => b[1] - a[1],
  )[0]
  if (!cantidad) {
    throw new Error('No se reconoció el separador del CSV. Usa la plantilla descargable.')
  }
  return separador
}

function analizarCsv(texto: string): string[][] {
  const separador = detectarSeparador(texto)
  const filas: string[][] = []
  let fila: string[] = []
  let celda = ''
  let entreComillas = false

  for (let indice = 0; indice < texto.length; indice += 1) {
    const caracter = texto[indice]
    if (caracter === '"') {
      if (entreComillas && texto[indice + 1] === '"') {
        celda += '"'
        indice += 1
      } else if (entreComillas) {
        entreComillas = false
      } else if (!celda.trim()) {
        celda = ''
        entreComillas = true
      } else {
        celda += caracter
      }
    } else if (caracter === separador && !entreComillas) {
      fila.push(celda.trim())
      celda = ''
    } else if ((caracter === '\n' || caracter === '\r') && !entreComillas) {
      if (caracter === '\r' && texto[indice + 1] === '\n') indice += 1
      fila.push(celda.trim())
      if (fila.some(Boolean)) filas.push(fila)
      fila = []
      celda = ''
    } else {
      celda += caracter
    }
  }

  if (entreComillas) throw new Error('El CSV contiene comillas sin cerrar.')
  fila.push(celda.trim())
  if (fila.some(Boolean)) filas.push(fila)
  return filas
}

async function leerArchivoCsv(archivo: File) {
  const bytes = new Uint8Array(await archivo.arrayBuffer())
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(bytes.subarray(2))
  }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder('utf-16be').decode(bytes.subarray(2))
  }
  try {
    return new TextDecoder('utf-8', { fatal: true })
      .decode(bytes)
      .replace(/^\uFEFF/, '')
  } catch {
    return new TextDecoder('windows-1252').decode(bytes)
  }
}

function fechaCsvAISO(valor: string) {
  const fecha = valor.trim()
  if (!fecha) return null

  let partes = fecha.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  let iso: string
  if (partes) {
    iso = `${partes[1]}-${partes[2].padStart(2, '0')}-${partes[3].padStart(2, '0')}`
  } else {
    partes = fecha.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
    if (!partes) throw new Error(`fecha inválida: ${fecha}`)
    iso = `${partes[3]}-${partes[2].padStart(2, '0')}-${partes[1].padStart(2, '0')}`
  }

  const fechaValidada = new Date(`${iso}T00:00:00.000Z`)
  if (
    Number.isNaN(fechaValidada.getTime()) ||
    fechaValidada.toISOString().slice(0, 10) !== iso
  ) {
    throw new Error(`fecha inválida: ${fecha}`)
  }
  return iso
}

export default function Equipos() {
  const { can } = usePermissions()
  const [searchParams] = useSearchParams()
  const puedeCrear = can('equipos.crear')
  const puedeEditar = can('equipos.editar')
  const puedeDarDeBaja = can('equipos.baja')
  const puedeAdministrarCategorias = can('categorias.administrar')
  const puedeVerMantenimientos = can('mantenimientos.ver')
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [ambientes, setAmbientes] = useState<Ambiente[]>([])
  const [responsables, setResponsables] = useState<Responsable[]>([])
  const [equipos, setEquipos] = useState<Equipo[]>([])
  const [total, setTotal] = useState(0)
  const [actualizacion, setActualizacion] = useState(0)
  const [pagina, setPagina] = useState(1)
  const [verHistorialCompleto, setVerHistorialCompleto] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const [estado, setEstado] = useState(() => searchParams.get('estado') ?? '')
  const [categoriaFiltro, setCategoriaFiltro] = useState(() => searchParams.get('categoria') ?? '')
  const [ambienteFiltro, setAmbienteFiltro] = useState(() => searchParams.get('ambiente') ?? '')
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [modalAbierto, setModalAbierto] = useState(false)
  const [categoriaModal, setCategoriaModal] = useState(false)
  const [categoriaNueva, setCategoriaNueva] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [guardandoCategoria, setGuardandoCategoria] = useState(false)
  const [editando, setEditando] = useState<Equipo | null>(null)
  const [datos, setDatos] = useState<DatosEquipo>(vacio)
  const [tecnicas, setTecnicas] = useState<Record<string, string>>({})
  const [duplicados, setDuplicados] = useState<Equipo[]>([])
  const [equipoDetalle, setEquipoDetalle] = useState<Equipo | null>(null)
  const [detalleCargando, setDetalleCargando] = useState(false)
  const [componentes, setComponentes] = useState<Componente[]>([])
  const [relaciones, setRelaciones] = useState<RelacionEquipo[]>([])
  const [fotografias, setFotografias] = useState<(Fotografia & { url: string })[]>([])
  const [fechaUltimoMantenimiento, setFechaUltimoMantenimiento] = useState<string | null>(null)
  const [opcionesRelacion, setOpcionesRelacion] = useState<{ id: string; codigo_institucional: string; nombre: string }[]>([])
  const [componenteTipo, setComponenteTipo] = useState('')
  const [componenteDetalle, setComponenteDetalle] = useState('')
  const [equipoRelacionado, setEquipoRelacionado] = useState('')
  const [foto, setFoto] = useState<File | null>(null)
  const [fotoAdicional, setFotoAdicional] = useState<File | null>(null)
  const [gestionandoFoto, setGestionandoFoto] = useState(false)
  const fotoInputRef = useRef<HTMLInputElement>(null)
  const [importando, setImportando] = useState(false)
  const [exportando, setExportando] = useState(false)
  const [resultadoImportacion, setResultadoImportacion] = useState<string[]>([])

  useEffect(
    () => () => {
      for (const fotografia of fotografias) {
        if (fotografia.url.startsWith('blob:')) URL.revokeObjectURL(fotografia.url)
      }
    },
    [fotografias],
  )

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
      porPagina: verHistorialCompleto ? porPagina : registrosRecientes,
      busqueda,
      estado,
      categoriaId: categoriaFiltro,
      ambienteId: ambienteFiltro,
      ordenReciente: !verHistorialCompleto,
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
  }, [pagina, busqueda, estado, categoriaFiltro, ambienteFiltro, actualizacion, verHistorialCompleto])

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

  function iniciarNuevo() {
    setEditando(null)
    setDatos({ ...vacio, categoria_id: categorias[0]?.id ?? '' })
    setTecnicas({})
    setDuplicados([])
    setFoto(null)
    setFotoAdicional(null)
    setError('')
    setModalAbierto(true)
  }

  async function iniciarEdicion(equipo: Equipo) {
    setEditando(equipo)
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
    try {
      const detalle = await obtenerDetalleEquipo(equipo.id, false)
      setFotografias(detalle.fotografias)
      setTecnicas(
        Object.fromEntries(
          detalle.componentes
            .filter((componente) =>
              etiquetasTecnicas.some(([tipo]) => tipo === componente.tipo),
            )
            .map((componente) => [componente.tipo, componente.capacidad ?? '']),
        ),
      )
    } catch (e) {
      setError(mostrarError(e, 'No se pudieron cargar las características técnicas.'))
      return
    }
    setDuplicados([])
    setFoto(null)
    setFotoAdicional(null)
    setError('')
    setModalAbierto(true)
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
            foto,
            editando && tienePrincipal ? 'reemplazar' : 'principal',
          )
          fotoGuardada = true
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
    } catch (e) {
      setError(mostrarError(e, 'No se pudo guardar el equipo.'))
    } finally {
      setGuardando(false)
    }
  }

  const abrirDetalle = useCallback(async (equipo: Equipo) => {
    setEquipoDetalle(equipo)
    setDetalleCargando(true)
    setError('')
    try {
      const detalle = await obtenerDetalleEquipo(equipo.id, puedeVerMantenimientos)
      setComponentes(detalle.componentes)
      setRelaciones(detalle.relaciones)
      setFotografias(detalle.fotografias)
      setFechaUltimoMantenimiento(detalle.fechaUltimoMantenimiento)
      const opciones = await listarOpcionesRelacion(equipo.id)
      setOpcionesRelacion(opciones)
    } catch (e) {
      setError(mostrarError(e, 'No se pudo cargar el detalle del equipo.'))
      setComponentes([])
      setRelaciones([])
      setFotografias([])
      setFechaUltimoMantenimiento(null)
      setOpcionesRelacion([])
    } finally {
      setDetalleCargando(false)
    }
  }, [puedeVerMantenimientos])

  useEffect(() => {
    const equipoId = searchParams.get('equipo')
    if (!equipoId) return
    let vigente = true
    obtenerEquipo(equipoId)
      .then((equipo) => {
        if (vigente) void abrirDetalle(equipo)
      })
      .catch((e: unknown) => {
        if (vigente) setError(mostrarError(e, 'No se pudo abrir la ficha del equipo.'))
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

  async function agregarFoto(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!equipoDetalle || !foto) return
    setError('')
    setAviso('')
    setGestionandoFoto(true)
    try {
      await subirFotografia(equipoDetalle.id, foto, 'adicional')
      setFoto(null)
      setAviso('Fotografía adicional agregada correctamente.')
      try {
        await refrescarFotografias(equipoDetalle.id)
      } catch (e) {
        setError(`La fotografía se agregó, pero no se pudo actualizar la vista: ${mostrarError(e, 'error desconocido')}`)
      }
    } catch (e) {
      setError(mostrarError(e, 'No se pudo subir la fotografía.'))
    } finally {
      setGestionandoFoto(false)
    }
  }

  async function agregarFotoEditando(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editando || !fotoAdicional) return
    setError('')
    setAviso('')
    setGestionandoFoto(true)
    try {
      await subirFotografia(editando.id, fotoAdicional, 'adicional')
      setFotoAdicional(null)
      setAviso('Fotografía adicional agregada correctamente.')
      try {
        await refrescarFotografias(editando.id)
      } catch (e) {
        setError(`La fotografía se agregó, pero no se pudo actualizar la vista: ${mostrarError(e, 'error desconocido')}`)
      }
    } catch (e) {
      setError(mostrarError(e, 'No se pudo subir la fotografía adicional.'))
    } finally {
      setGestionandoFoto(false)
    }
  }

  async function refrescarFotografias(equipoId: string) {
    const detalle = await obtenerDetalleEquipo(equipoId, false)
    setFotografias(detalle.fotografias)
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
      setEquipoDetalle(null)
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

  function descargarPlantilla() {
    const categoriaEjemplo = (
      categorias[0]?.nombre ?? 'Reemplazar por categoría existente'
    ).replace(/"/g, '""')
    const contenido =
      'nombre,categoria,marca,modelo,numero_serie,codigo_patrimonial,ambiente_codigo,estado_operativo,fecha_adquisicion,fecha_garantia,posicion,observaciones,Procesador,Memoria RAM,Almacenamiento,Sistema operativo\r\n' +
      `Computadora aula 1,"${categoriaEjemplo}",Lenovo,ThinkCentre,,PAT-001,A101,operativo,2025-01-15,,Puesto 1,Ejemplo,Intel Core i5,8 GB DDR4,SSD 256 GB,Windows`
    const enlace = document.createElement('a')
    enlace.href = URL.createObjectURL(new Blob([contenido], { type: 'text/csv;charset=utf-8' }))
    enlace.download = 'plantilla-inventario.csv'
    enlace.click()
    URL.revokeObjectURL(enlace.href)
  }

  function valorCsv(valor: string | null | undefined) {
    const seguro = valor ?? ''
    const protegido = /^[=+\-@\t\r]/.test(seguro) ? `'${seguro}` : seguro
    return `"${protegido.replace(/"/g, '""')}"`
  }

  async function exportarInventario() {
    setExportando(true)
    setError('')
    try {
      const { equipos: todos, categorias: categoriasExportadas, ambientes: ambientesExportados } =
        await listarEquiposParaExportar({
          busqueda,
          estado,
          categoriaId: categoriaFiltro,
          ambienteId: ambienteFiltro,
        })
      const nombresCategoria = new Map(
        categoriasExportadas.map((categoria) => [categoria.id, categoria.nombre]),
      )
      const datosAmbiente = new Map(
        ambientesExportados.map((ambiente) => [ambiente.id, ambiente]),
      )
      const cabeceras = [
        'codigo_institucional',
        'nombre',
        'categoria',
        'marca',
        'modelo',
        'numero_serie',
        'codigo_patrimonial',
        'ambiente_codigo',
        'estado_operativo',
        'situacion',
        'fecha_adquisicion',
        'fecha_garantia',
        'posicion',
        'observaciones',
      ]
      const filas = todos.map((equipo) => {
        const ambiente = equipo.ambiente_id
          ? datosAmbiente.get(equipo.ambiente_id)
          : undefined
        return [
          equipo.codigo_institucional,
          equipo.nombre,
          nombresCategoria.get(equipo.categoria_id) ?? equipo.categoria_id,
          equipo.marca,
          equipo.modelo,
          equipo.numero_serie,
          equipo.codigo_patrimonial,
          ambiente?.codigo,
          equipo.estado_operativo,
          equipo.situacion,
          equipo.fecha_adquisicion,
          equipo.fecha_garantia,
          equipo.posicion,
          equipo.observaciones,
        ]
          .map(valorCsv)
          .join(',')
      })
      const contenido = `\uFEFF${cabeceras.join(',')}\r\n${filas.join('\r\n')}`
      const url = URL.createObjectURL(
        new Blob([contenido], { type: 'text/csv;charset=utf-8' }),
      )
      const enlace = document.createElement('a')
      enlace.href = url
      enlace.download = 'inventario-equipos.csv'
      enlace.click()
      URL.revokeObjectURL(url)
      setAviso(`Se exportaron ${todos.length} equipos del inventario filtrado.`)
    } catch (e) {
      setError(mostrarError(e, 'No se pudo exportar el inventario actual.'))
    } finally {
      setExportando(false)
    }
  }

  async function importarCsv(archivo: File) {
    setImportando(true)
    setError('')
    setResultadoImportacion([])
    const resultados: string[] = []

    try {
      if (archivo.size > 2 * 1024 * 1024) {
        throw new Error('El archivo CSV no puede superar 2 MB.')
      }
      const filas = analizarCsv(await leerArchivoCsv(archivo))
      if (filas.length < 2) throw new Error('El CSV no contiene filas para importar.')
      if (filas.length > 501) throw new Error('El límite es 500 equipos por importación.')

      const cabeceras = filas[0].map(normalizarCabeceraCsv)
      if (new Set(cabeceras).size !== cabeceras.length) {
        throw new Error('El CSV contiene encabezados repetidos.')
      }
      const requeridas = ['nombre', 'categoria', 'estado_operativo']
      const faltantes = requeridas.filter((campo) => !cabeceras.includes(campo))
      if (faltantes.length) {
        throw new Error(
          `Faltan columnas obligatorias: ${faltantes.join(', ')}. Descarga la plantilla CSV para ver los encabezados válidos.`,
        )
      }

      const catalogos = await cargarCatalogos()
      setCategorias(catalogos.categorias)
      setAmbientes(catalogos.ambientes)
      setResponsables(catalogos.responsables)

      for (const [indice, fila] of filas.slice(1).entries()) {
        const numeroFila = indice + 2
        try {
          while (fila.length > cabeceras.length && fila.at(-1) === '') fila.pop()
          if (fila.length > cabeceras.length) {
            throw new Error(
              `la fila tiene ${fila.length} columnas y el encabezado tiene ${cabeceras.length}`,
            )
          }
          while (fila.length < cabeceras.length) fila.push('')
          const valores = Object.fromEntries(
            cabeceras.map((cabecera, posicion) => [
              cabecera,
              (fila[posicion] ?? '').trim(),
            ]),
          )
          const categoriaImportada = catalogos.categorias.find(
            (item) => normalizarCsv(item.nombre) === normalizarCsv(valores.categoria),
          )
          if (!categoriaImportada) {
            throw new Error(
              `categoría "${valores.categoria}" no encontrada. Categorías disponibles: ${catalogos.categorias.map((item) => item.nombre).join(', ') || 'ninguna activa'}`,
            )
          }
          const ambiente = valores.ambiente_codigo
            ? catalogos.ambientes.find(
                (item) => normalizarCsv(item.codigo) === normalizarCsv(valores.ambiente_codigo),
              )
            : undefined
          if (valores.ambiente_codigo && !ambiente) {
            throw new Error(`ambiente no encontrado: ${valores.ambiente_codigo}`)
          }
          if (!valores.nombre.trim()) throw new Error('nombre obligatorio')
          const estadoEntrada = normalizarCsv(valores.estado_operativo).replace(/\s+/g, '_')
          const estadoNormalizado =
            estadoEntrada === 'operativo_con_observaciones'
              ? 'con_fallas'
              : estadoEntrada
          if (
            !estadosOperativos.some((opcion) => opcion === estadoNormalizado)
          ) {
            throw new Error(`estado inválido: ${valores.estado_operativo}`)
          }

          await importarFila(
            {
              ...vacio,
              categoria_id: categoriaImportada.id,
              ambiente_id: ambiente?.id ?? null,
              nombre: valores.nombre.trim(),
              marca: valores.marca || null,
              modelo: valores.modelo || null,
              numero_serie: valores.numero_serie || null,
              codigo_patrimonial: valores.codigo_patrimonial || null,
              posicion: valores.posicion || null,
              estado_operativo: estadoNormalizado as EstadoOperativo,
              fecha_adquisicion: fechaCsvAISO(valores.fecha_adquisicion),
              fecha_garantia: fechaCsvAISO(valores.fecha_garantia),
              observaciones: valores.observaciones || null,
            },
            valores.numero_serie,
            {
              Procesador: valores.procesador ?? '',
              'Memoria RAM': valores.memoria_ram ?? '',
              Almacenamiento: valores.almacenamiento ?? '',
              'Sistema operativo': valores.sistema_operativo ?? '',
            },
          )
          resultados.push(`Fila ${numeroFila}: importada.`)
        } catch (e) {
          resultados.push(`Fila ${numeroFila}: ${mostrarError(e, 'no se pudo importar')}`)
        }
      }

      setResultadoImportacion(resultados)
      const exitosas = resultados.filter((item) => item.endsWith('importada.')).length
      setAviso(`Importación finalizada: ${exitosas} de ${resultados.length} filas agregadas.`)
      if (exitosas !== resultados.length) {
        setError('Algunas filas no se importaron; abre el resultado para revisar el motivo de cada una.')
      }
      setPagina(1)
      setActualizacion((actual) => actual + 1)
    } catch (e) {
      setError(mostrarError(e, 'No se pudo procesar el archivo CSV.'))
    } finally {
      setImportando(false)
    }
  }

  return (
    <section>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold">Inventario tecnológico</h2>
          <p className="mt-1 text-sm text-slate-600">
            Registra, consulta y controla los activos tecnológicos institucionales.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
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
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Registrar equipo
            </button>
          )}
        </div>
      </div>

      <details className="mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <summary className="cursor-pointer font-semibold text-slate-800">
          Herramientas de inventario
        </summary>
        <div className="mt-4">
          <h3 className="text-sm font-semibold text-slate-700">Importación masiva</h3>
          <p className="mt-1 text-sm text-slate-500">
            Descarga la plantilla y complétala. La categoría debe coincidir con
            una categoría activa; se aceptan CSV de Excel separados por coma o
            punto y coma.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <button
              type="button"
              onClick={descargarPlantilla}
              className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 text-left transition hover:border-green-300 hover:bg-green-50"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-green-100 text-green-700">
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-6 w-6">
                  <path d="M5 3.75h9l5 5v11.5H5V3.75Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
                  <path d="M14 3.75v5h5M8 12h8M8 15.5h8M8 19h5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                </svg>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-slate-800">Descargar plantilla</span>
                <span className="mt-0.5 block text-xs text-slate-500">Archivo CSV para Excel</span>
              </span>
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-5 w-5 shrink-0 text-green-700">
                <path d="M12 3.75v11m0 0 4-4m-4 4-4-4M5 16.75v3.5h14v-3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => void exportarInventario()}
              disabled={exportando}
              className={`flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 text-left transition ${exportando ? 'cursor-wait opacity-60' : 'hover:border-amber-300 hover:bg-amber-50'}`}
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-6 w-6">
                  <path d="M5 3.75h9l5 5v11.5H5V3.75Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
                  <path d="M14 3.75v5h5M12 11v7m0 0 3-3m-3 3-3-3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-slate-800">{exportando ? 'Preparando exportación...' : 'Exportar inventario'}</span>
                <span className="mt-0.5 block text-xs text-slate-500">Descarga la tabla actual en CSV</span>
              </span>
            </button>
            {puedeCrear && (
              <label className={`flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 text-left transition ${importando ? 'cursor-wait opacity-60' : 'cursor-pointer hover:border-blue-300 hover:bg-blue-50'}`}>
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-700">
                  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-6 w-6">
                    <path d="M5 3.75h9l5 5v11.5H5V3.75Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
                    <path d="M14 3.75v5h5M8 15h8m-4-4v8m0 0 3-3m-3 3-3-3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-slate-800">{importando ? 'Importando equipos...' : 'Importar equipos'}</span>
                  <span className="mt-0.5 block text-xs text-slate-500">Selecciona un archivo CSV</span>
                </span>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  disabled={importando}
                  className="sr-only"
                  onChange={(event) => {
                    const archivo = event.target.files?.[0]
                    if (archivo) void importarCsv(archivo)
                    event.currentTarget.value = ''
                  }}
                />
              </label>
            )}
          </div>
        </div>
      </details>

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
      {resultadoImportacion.length > 0 && (
        <details className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
          <summary className="cursor-pointer text-sm font-medium">
            Resultado de importación ({resultadoImportacion.length} filas)
          </summary>
          <ul className="mt-2 max-h-48 overflow-auto text-sm text-slate-700">
            {resultadoImportacion.map((linea) => (
              <li key={linea}>{linea}</li>
            ))}
          </ul>
        </details>
      )}

      <div className="mt-5 grid gap-3 rounded-xl bg-white p-4 shadow sm:grid-cols-2 lg:grid-cols-4">
        <input
          type="search"
          value={busqueda}
          onChange={(event) => {
            setBusqueda(event.target.value)
            setPagina(1)
          }}
          placeholder="Código, serie, marca o equipo"
          aria-label="Buscar en inventario"
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <select
          value={categoriaFiltro}
          onChange={(event) => {
            setCategoriaFiltro(event.target.value)
            setPagina(1)
          }}
          aria-label="Filtrar por categoría"
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
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
            setPagina(1)
          }}
          aria-label="Filtrar por ubicación"
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">Todas las ubicaciones</option>
          {ambientes.map((ambiente) => (
            <option key={ambiente.id} value={ambiente.id}>
              {ambiente.pabellon} / {ambiente.piso} / {ambiente.codigo} — {ambiente.nombre}
            </option>
          ))}
        </select>
        <select
          value={estado}
          onChange={(event) => {
            setEstado(event.target.value)
            setPagina(1)
          }}
          aria-label="Filtrar por estado"
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">Todos los estados</option>
          {estadosOperativos.map((opcion) => (
            <option key={opcion} value={opcion}>{etiquetasEstado[opcion]}</option>
          ))}
          <option value="baja">Dado de baja</option>
          <option value="archivado">Archivado</option>
        </select>
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl bg-white shadow">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
          <h2 className="font-semibold text-slate-800">
            {verHistorialCompleto ? 'Historial completo de equipos' : 'Últimos equipos registrados'}
          </h2>
          <button
            type="button"
            onClick={() => {
              setPagina(1)
              setVerHistorialCompleto((actual) => !actual)
            }}
            className="rounded-lg border border-blue-200 px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50"
          >
            {verHistorialCompleto ? 'Ver últimos registros' : 'Ver historial completo'}
          </button>
        </div>
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
      <div className="mt-3 flex items-center justify-between text-sm text-slate-600">
        <span>
          {verHistorialCompleto ? total : Math.min(total, registrosRecientes)} de {total} equipos
          {verHistorialCompleto ? ` · página ${pagina} de ${paginas}` : ' · más recientes'}
        </span>
        <div className="flex gap-2">
          {verHistorialCompleto && (
            <>
              <button type="button" disabled={pagina <= 1 || cargando} onClick={() => setPagina((actual) => actual - 1)} className="rounded border border-slate-300 px-3 py-1 disabled:opacity-50">Anterior</button>
              <button type="button" disabled={pagina >= paginas || cargando} onClick={() => setPagina((actual) => actual + 1)} className="rounded border border-slate-300 px-3 py-1 disabled:opacity-50">Siguiente</button>
            </>
          )}
        </div>
      </div>

      {categoriaModal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/50 p-4">
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
        <div className="fixed inset-0 z-30 overflow-y-auto bg-slate-950/50 p-3 sm:p-8">
          <section className="mx-auto max-w-4xl rounded-xl bg-white p-5 shadow-xl">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-xl font-semibold">{editando ? 'Editar equipo' : 'Registrar equipo'}</h3>
                <p className="text-sm text-slate-500">El código institucional se asigna automáticamente y no cambia al mover el activo.</p>
              </div>
              <button type="button" onClick={() => setModalAbierto(false)} aria-label="Cerrar formulario" className="rounded border px-3 py-1">Cerrar</button>
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
            {!categorias.length && (
              <p role="alert" className="mt-4 rounded bg-amber-50 p-3 text-sm text-amber-900">
                No hay categorías activas. Un administrador debe crearlas en la gestión de categorías antes de registrar equipos.
              </p>
            )}
            <form onSubmit={(event) => void guardarEquipo(event)} className="mt-4 space-y-5">
              <fieldset disabled={guardando || !categorias.length} className="space-y-5">
                <div>
                  <h4 className="font-semibold">Datos principales</h4>
                  <p className="mt-1 text-sm text-slate-500">
                    Solo el nombre y la categoría son obligatorios. Puedes completar el resto ahora o después.
                  </p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <label className="text-sm">Nombre o descripción <span className="text-red-600">*</span>
                      <input required maxLength={200} value={datos.nombre} onChange={(e) => cambiarDato('nombre', e.target.value)} placeholder="Ej. Computadora de oficina" className="mt-1 w-full rounded border border-slate-300 px-3 py-2" />
                    </label>
                    <label className="text-sm">Categoría <span className="text-red-600">*</span>
                      <select required value={datos.categoria_id} onChange={(e) => cambiarDato('categoria_id', e.target.value)} className="mt-1 w-full rounded border border-slate-300 px-3 py-2">
                        {categorias.map((item) => <option key={item.id} value={item.id}>{item.nombre}</option>)}
                      </select>
                    </label>
                    <label className="text-sm">Estado operativo
                      <select value={datos.estado_operativo} onChange={(e) => cambiarDato('estado_operativo', e.target.value as EstadoOperativo)} className="mt-1 w-full rounded border border-slate-300 px-3 py-2">
                        {estadosOperativos.map((item) => <option key={item} value={item}>{etiquetasEstado[item]}</option>)}
                      </select>
                    </label>
                  </div>
                </div>

                <details className="rounded-lg border border-slate-200 p-4">
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

                    <div>
                      <h4 className="font-semibold">Fotografía principal</h4>
                      <p className="mt-1 text-xs text-slate-500">
                        {editando
                          ? 'Selecciona una imagen para reemplazar la principal al guardar. Se optimiza antes de subirla (máximo 2 MB).'
                          : 'La imagen se optimiza antes de subirla (máximo 2 MB).'}
                      </p>
                      <input
                        ref={fotoInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="sr-only"
                        onChange={(event) => {
                          setFoto(event.target.files?.[0] ?? null)
                          event.currentTarget.value = ''
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => fotoInputRef.current?.click()}
                        className="mt-2 rounded border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-50"
                      >
                        Seleccionar fotografía
                      </button>
                      <span className="ml-3 text-sm text-slate-600">
                        {foto?.name ?? 'Ninguna fotografía seleccionada'}
                      </span>
                      {editando && (
                        <>
                          <div className="mt-3 flex flex-wrap gap-3">
                            {fotografias.map((fotografia) => (
                              <div key={fotografia.id} className="w-40">
                                <a href={fotografia.url} target="_blank" rel="noreferrer">
                                  <img
                                    src={fotografia.url}
                                    alt={fotografia.descripcion ?? `Fotografía de ${editando.codigo_institucional}`}
                                    className="h-28 w-40 rounded-lg border object-cover"
                                  />
                                </a>
                                <div className="mt-1 flex flex-wrap items-center gap-1">
                                  <span className={`rounded px-2 py-1 text-[10px] font-semibold ${fotografia.tipo === 'principal' ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-600'}`}>
                                    {fotografia.tipo === 'principal' ? 'Principal' : 'Adicional'}
                                  </span>
                                  {fotografia.tipo !== 'principal' && (
                                    <button
                                      type="button"
                                      disabled={gestionandoFoto}
                                      onClick={() => void cambiarFotografiaPrincipal(editando.id, fotografia)}
                                      className="text-xs font-medium text-blue-700 hover:underline disabled:opacity-50"
                                    >
                                      Hacer principal
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    disabled={gestionandoFoto}
                                    onClick={() => void eliminarFoto(editando.id, fotografia)}
                                    className="text-xs font-medium text-red-700 hover:underline disabled:opacity-50"
                                  >
                                    Eliminar
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                          <form onSubmit={(event) => void agregarFotoEditando(event)} className="mt-3 flex flex-wrap items-center gap-2">
                            <input
                              type="file"
                              accept="image/jpeg,image/png,image/webp"
                              onChange={(event) => setFotoAdicional(event.target.files?.[0] ?? null)}
                              className="text-sm"
                            />
                            <button
                              type="submit"
                              disabled={!fotoAdicional || gestionandoFoto}
                              className="rounded border border-slate-300 px-3 py-2 text-sm disabled:opacity-50"
                            >
                              {gestionandoFoto ? 'Subiendo...' : 'Agregar fotografía'}
                            </button>
                          </form>
                        </>
                      )}
                    </div>
                  </div>
                </details>
              </fieldset>

              {duplicados.length > 0 && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">
                  <p className="font-semibold">Coincidencias posibles (vuelve a guardar si confirmas que son activos distintos):</p>
                  <ul className="mt-1 list-inside list-disc">
                    {duplicados.map((item) => <li key={item.id}>{item.codigo_institucional} — {item.nombre} — serie {item.numero_serie ?? 'sin serie'} — patrimonio {item.codigo_patrimonial ?? 'sin código'}</li>)}
                  </ul>
                </div>
              )}
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setModalAbierto(false)} className="rounded border border-slate-300 px-4 py-2">Cancelar</button>
                <button type="submit" disabled={guardando || !categorias.length} className="rounded bg-blue-600 px-4 py-2 font-semibold text-white disabled:opacity-60">
                  {guardando ? 'Guardando...' : editando ? 'Guardar cambios' : 'Registrar equipo'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {equipoDetalle && (
        <div className="fixed inset-0 z-30 overflow-y-auto bg-slate-950/50 p-3 sm:p-8">
          <section className="mx-auto max-w-4xl rounded-xl bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-blue-700">{equipoDetalle.codigo_institucional}</p>
                <h3 className="text-xl font-semibold">{equipoDetalle.nombre}</h3>
                <p className="text-sm text-slate-500">{categoriasPorId.get(equipoDetalle.categoria_id) ?? 'Categoría'} · {equipoDetalle.marca ?? 'Sin marca'} {equipoDetalle.modelo ?? ''}</p>
              </div>
              <button type="button" onClick={() => setEquipoDetalle(null)} aria-label="Cerrar detalle" className="rounded border px-3 py-1">Cerrar</button>
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
                  <div><dt className="text-slate-500">Ubicación / posición</dt><dd className="font-medium">{equipoDetalle.ambiente_id ? ambientesPorId.get(equipoDetalle.ambiente_id)?.nombre : 'Sin ubicación'}{equipoDetalle.posicion ? ` / ${equipoDetalle.posicion}` : ''}</dd></div>
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
                    <form onSubmit={(event) => void agregarRelacion(event)} className="mt-2 flex flex-wrap gap-2">
                      <select required value={equipoRelacionado} onChange={(e) => setEquipoRelacionado(e.target.value)} className="min-w-56 flex-1 rounded border border-slate-300 px-3 py-2 text-sm">
                        <option value="">Selecciona el equipo relacionado</option>
                        {opcionesRelacion.map((opcion) => <option key={opcion.id} value={opcion.id}>{opcion.codigo_institucional} — {opcion.nombre}</option>)}
                      </select>
                      <button type="submit" className="rounded border border-slate-300 px-3 py-2 text-sm">Relacionar como periférico</button>
                    </form>
                  )}
                </div>

                <div>
                  <h4 className="font-semibold">Fotografías</h4>
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
                  ) : <p className="mt-1 text-sm text-slate-500">Sin fotografías.</p>}
                  {puedeEditar && equipoDetalle.situacion === 'activo' && (
                    <form onSubmit={(event) => void agregarFoto(event)} className="mt-2 flex flex-wrap items-center gap-2">
                      <input type="file" required accept="image/jpeg,image/png,image/webp" onChange={(e) => setFoto(e.target.files?.[0] ?? null)} className="text-sm" />
                      <button type="submit" disabled={!foto || gestionandoFoto} className="rounded border border-slate-300 px-3 py-2 text-sm disabled:opacity-50">
                        {gestionandoFoto ? 'Subiendo...' : 'Agregar fotografía'}
                      </button>
                    </form>
                  )}
                </div>
              </div>
            )}
            <div className="mt-5 flex justify-end gap-2">
              {puedeEditar && equipoDetalle.situacion === 'activo' && <button type="button" onClick={() => { setEquipoDetalle(null); void iniciarEdicion(equipoDetalle) }} className="rounded border border-slate-300 px-4 py-2">Editar equipo</button>}
              {puedeDarDeBaja && equipoDetalle.situacion === 'activo' && <button type="button" onClick={() => void confirmarBaja(equipoDetalle)} className="rounded border border-red-200 px-4 py-2 text-red-700">Dar de baja</button>}
              {puedeDarDeBaja && equipoDetalle.situacion !== 'activo' && <button type="button" onClick={() => void reactivar(equipoDetalle)} className="rounded border border-green-200 px-4 py-2 text-green-700">Reactivar equipo</button>}
            </div>
          </section>
        </div>
      )}
    </section>
  )
}
