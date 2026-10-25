import { useEffect, useMemo, useState } from 'react'
import { usePermissions } from '../hooks/usePermissions'
import {
  cargarCatalogos,
  estadosOperativos,
  importarFila,
  listarEquiposParaExportar,
  type Ambiente,
  type Categoria,
  type DatosEquipo,
  type Equipo,
  type EstadoOperativo,
} from '../services/equiposService'
import {
  listarMantenimientos,
  type FiltrosMantenimiento,
  type Mantenimiento,
} from '../services/mantenimientosService'
import {
  listarHistorialMovimientos,
  type Movimiento,
} from '../services/movimientosService'

type TipoReporte =
  | 'inventario'
  | 'pabellon'
  | 'piso-ambiente'
  | 'operativos'
  | 'inoperativos'
  | 'categoria'
  | 'mantenimientos'
  | 'movimientos'
  | 'bajas'

type FilaReporte = Record<string, string | number>

const datosEquipoVacios: DatosEquipo = {
  categoria_id: '',
  ambiente_id: null,
  nombre: '',
  marca: null,
  modelo: null,
  numero_serie: null,
  codigo_patrimonial: null,
  posicion: null,
  responsable_id: null,
  estado_operativo: 'operativo',
  fecha_adquisicion: null,
  fecha_garantia: null,
  observaciones: null,
}

const nombresReportes: Record<TipoReporte, string> = {
  inventario: 'Inventario general',
  pabellon: 'Inventario por pabellón',
  'piso-ambiente': 'Inventario por piso y ambiente',
  operativos: 'Equipos operativos',
  inoperativos: 'Equipos inoperativos',
  categoria: 'Equipos por categoría',
  mantenimientos: 'Historial de mantenimientos',
  movimientos: 'Historial de movimientos',
  bajas: 'Equipos dados de baja',
}

const estadosLabel: Record<string, string> = {
  operativo: 'Operativo',
  con_fallas: 'Operativo con observaciones',
  en_mantenimiento: 'En mantenimiento',
  inoperativo: 'Inoperativo',
  en_almacen: 'En almacén',
  activo: 'Activo',
  baja: 'Dado de baja',
  archivado: 'Archivado',
}

const columnasEquipo = [
  'Código institucional',
  'Nombre',
  'Categoría',
  'Marca',
  'Modelo',
  'Número de serie',
  'Código patrimonial',
  'Pabellón',
  'Piso',
  'Código de ambiente',
  'Ambiente',
  'Posición',
  'Estado operativo',
  'Situación',
  'Fecha de adquisición',
  'Vencimiento de garantía',
  'Observaciones',
]

function mostrarError(error: unknown, fallback = 'No se pudo generar el reporte.') {
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

function escaparCsv(valor: string | number) {
  const texto = String(valor)
  const seguro = /^[=+\-@\t\r]/.test(texto) ? `'${texto}` : texto
  return `"${seguro.replace(/"/g, '""')}"`
}

function escaparExcel(valor: string | number) {
  const texto = [...String(valor)]
    .filter((caracter) => {
      const codigo = caracter.codePointAt(0) ?? 0
      return codigo === 9 || codigo === 10 || codigo === 13 || codigo >= 32
    })
    .join('')
  return texto.replace(/[&<>"']/g, (caracter) => {
      const entidades: Record<string, string> = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&apos;',
      }
      return entidades[caracter]
    })
}

function columnaExcel(indice: number) {
  let numero = indice + 1
  let columna = ''
  while (numero > 0) {
    const resto = (numero - 1) % 26
    columna = String.fromCharCode(65 + resto) + columna
    numero = Math.floor((numero - 1) / 26)
  }
  return columna
}

function calcularCrc32(datos: Uint8Array) {
  let crc = 0xffffffff
  for (const byte of datos) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0)
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

function crearArchivoXlsx(
  titulo: string,
  generado: string,
  columnas: string[],
  filas: FilaReporte[],
) {
  const encoder = new TextEncoder()
  const contenidoFilas = [
    [titulo],
    [`Fecha de generación: ${generado}`],
    columnas,
    ...filas.map((fila) => columnas.map((columna) => fila[columna] ?? '')),
  ]
  const hoja = contenidoFilas.map((celdas, indiceFila) => {
    const numeroFila = indiceFila + 1
    const celdasXml = celdas.map((valor, indiceColumna) => {
      const referencia = `${columnaExcel(indiceColumna)}${numeroFila}`
      return `<c r="${referencia}" t="inlineStr"><is><t xml:space="preserve">${escaparExcel(valor)}</t></is></c>`
    }).join('')
    return `<row r="${numeroFila}">${celdasXml}</row>`
  }).join('')
  const archivos = [
    {
      nombre: '[Content_Types].xml',
      contenido: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
    },
    {
      nombre: '_rels/.rels',
      contenido: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    },
    {
      nombre: 'xl/workbook.xml',
      contenido: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Reporte" sheetId="1" r:id="rId1"/></sheets></workbook>',
    },
    {
      nombre: 'xl/_rels/workbook.xml.rels',
      contenido: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
    },
    {
      nombre: 'xl/worksheets/sheet1.xml',
      contenido: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${hoja}</sheetData></worksheet>`,
    },
  ].map((archivo) => ({
    nombre: encoder.encode(archivo.nombre),
    contenido: encoder.encode(archivo.contenido),
  }))

  const bytesZip: number[] = []
  const directorioCentral: number[] = []
  const escribir16 = (destino: number[], valor: number) => {
    destino.push(valor & 0xff, (valor >>> 8) & 0xff)
  }
  const escribir32 = (destino: number[], valor: number) => {
    destino.push(valor & 0xff, (valor >>> 8) & 0xff, (valor >>> 16) & 0xff, (valor >>> 24) & 0xff)
  }
  const escribirBytes = (destino: number[], bytes: Uint8Array) => {
    for (let inicio = 0; inicio < bytes.length; inicio += 0x8000) {
      destino.push(...bytes.subarray(inicio, inicio + 0x8000))
    }
  }

  archivos.forEach((archivo) => {
    const crc = calcularCrc32(archivo.contenido)
    const offset = bytesZip.length
    escribir32(bytesZip, 0x04034b50)
    escribir16(bytesZip, 20)
    escribir16(bytesZip, 0)
    escribir16(bytesZip, 0)
    escribir16(bytesZip, 0)
    escribir16(bytesZip, 0)
    escribir32(bytesZip, crc)
    escribir32(bytesZip, archivo.contenido.length)
    escribir32(bytesZip, archivo.contenido.length)
    escribir16(bytesZip, archivo.nombre.length)
    escribir16(bytesZip, 0)
    escribirBytes(bytesZip, archivo.nombre)
    escribirBytes(bytesZip, archivo.contenido)

    escribir32(directorioCentral, 0x02014b50)
    escribir16(directorioCentral, 20)
    escribir16(directorioCentral, 20)
    escribir16(directorioCentral, 0)
    escribir16(directorioCentral, 0)
    escribir16(directorioCentral, 0)
    escribir16(directorioCentral, 0)
    escribir32(directorioCentral, crc)
    escribir32(directorioCentral, archivo.contenido.length)
    escribir32(directorioCentral, archivo.contenido.length)
    escribir16(directorioCentral, archivo.nombre.length)
    escribir16(directorioCentral, 0)
    escribir16(directorioCentral, 0)
    escribir16(directorioCentral, 0)
    escribir16(directorioCentral, 0)
    escribir32(directorioCentral, 0)
    escribir32(directorioCentral, offset)
    escribirBytes(directorioCentral, archivo.nombre)
  })

  const offsetDirectorio = bytesZip.length
  bytesZip.push(...directorioCentral)
  escribir32(bytesZip, 0x06054b50)
  escribir16(bytesZip, 0)
  escribir16(bytesZip, 0)
  escribir16(bytesZip, archivos.length)
  escribir16(bytesZip, archivos.length)
  escribir32(bytesZip, directorioCentral.length)
  escribir32(bytesZip, offsetDirectorio)
  escribir16(bytesZip, 0)
  return new Uint8Array(bytesZip)
}

function descargarArchivo(nombre: string, contenido: BlobPart, tipo: string) {
  const url = URL.createObjectURL(new Blob([contenido], { type: tipo }))
  const enlace = document.createElement('a')
  enlace.href = url
  enlace.download = nombre
  enlace.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function fechaHoraGeneracion() {
  return new Date().toLocaleString('es-PE', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
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

export default function Reportes() {
  const { can } = usePermissions()
  const puedeVerMantenimientos = can('mantenimientos.ver')
  const puedeVerMovimientos = can('movimientos.ver')
  const puedeImportarEquipos = can('equipos.crear')
  const [tipo, setTipo] = useState<TipoReporte>('inventario')
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [ambientes, setAmbientes] = useState<Ambiente[]>([])
  const [busqueda, setBusqueda] = useState('')
  const [estado, setEstado] = useState('')
  const [categoriaId, setCategoriaId] = useState('')
  const [pabellonId, setPabellonId] = useState('')
  const [pisoId, setPisoId] = useState('')
  const [ambienteId, setAmbienteId] = useState('')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [cargandoCatalogos, setCargandoCatalogos] = useState(true)
  const [generando, setGenerando] = useState(false)
  const [importando, setImportando] = useState(false)
  const [resultadoImportacion, setResultadoImportacion] = useState<string[]>([])
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [filas, setFilas] = useState<FilaReporte[]>([])
  const [columnas, setColumnas] = useState<string[]>([])
  const [fechaGeneracion, setFechaGeneracion] = useState('')

  useEffect(() => {
    let vigente = true
    cargarCatalogos()
      .then((catalogos) => {
        if (!vigente) return
        setCategorias(catalogos.categorias)
        setAmbientes(catalogos.ambientes)
      })
      .catch((causa: unknown) => {
        if (vigente) setError(mostrarError(causa))
      })
      .finally(() => {
        if (vigente) setCargandoCatalogos(false)
      })
    return () => {
      vigente = false
    }
  }, [])

  const pabellones = useMemo(
    () => [...new Map(ambientes.map((ambiente) => [ambiente.pabellon_id, ambiente.pabellon])).entries()]
      .map(([id, nombre]) => ({ id, nombre }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre)),
    [ambientes],
  )
  const pisos = useMemo(
    () => [...new Map(
      ambientes
        .filter((ambiente) => !pabellonId || ambiente.pabellon_id === pabellonId)
        .map((ambiente) => [ambiente.piso_id, ambiente.piso]),
    ).entries()]
      .map(([id, nombre]) => ({ id, nombre }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre)),
    [ambientes, pabellonId],
  )
  const ambientesFiltrados = useMemo(
    () => ambientes.filter((ambiente) =>
      (!pabellonId || ambiente.pabellon_id === pabellonId) &&
      (!pisoId || ambiente.piso_id === pisoId),
    ),
    [ambientes, pabellonId, pisoId],
  )

  const reportesDisponibles = useMemo(() => (
    (Object.keys(nombresReportes) as TipoReporte[]).filter((reporte) =>
      (reporte !== 'mantenimientos' || puedeVerMantenimientos) &&
      (reporte !== 'movimientos' || puedeVerMovimientos),
    )
  ), [puedeVerMantenimientos, puedeVerMovimientos])

  function cambiarTipo(nuevoTipo: TipoReporte) {
    setTipo(nuevoTipo)
    setError('')
    setAviso('')
    setFilas([])
  }

  async function cargarEquiposFiltrados() {
    const usaFiltroUbicacion = Boolean(pabellonId || pisoId || ambienteId)
    const idsAmbientes = usaFiltroUbicacion
      ? ambientesFiltrados
          .filter((ambiente) => !ambienteId || ambiente.id === ambienteId)
          .map((ambiente) => ambiente.id)
      : undefined
    let estadoFiltro = estado
    if (tipo === 'operativos') estadoFiltro = 'operativo'
    if (tipo === 'inoperativos') estadoFiltro = 'inoperativo'
    if (tipo === 'bajas') estadoFiltro = 'baja'
    if (tipo === 'pabellon' && !pabellonId) {
      throw new Error('Selecciona un pabellón para generar este reporte.')
    }
    if (tipo === 'piso-ambiente' && !pisoId && !ambienteId) {
      throw new Error('Selecciona un piso o ambiente para generar este reporte.')
    }
    if (tipo === 'categoria' && !categoriaId) {
      throw new Error('Selecciona una categoría para generar este reporte.')
    }

    const resultado = await listarEquiposParaExportar({
      busqueda,
      estado: estadoFiltro,
      categoriaId,
      ambienteId,
      ambienteIds: idsAmbientes,
    })
    return resultado
  }

  async function cargarMantenimientosFiltrados(equiposFiltrados: Equipo[]) {
    const filtros: FiltrosMantenimiento = {
      equipoId: '',
      responsableId: '',
      estado: '',
      tipo: '',
      estadoEquipo: '',
      desde,
      hasta,
      revisionVencida: false,
      ordenReciente: true,
      pagina: 1,
      porPagina: 100,
    }
    const todos: Mantenimiento[] = []
    let total = Number.POSITIVE_INFINITY
    while (todos.length < total) {
      const resultado = await listarMantenimientos(filtros)
      todos.push(...resultado.mantenimientos)
      total = resultado.total
      if (!resultado.mantenimientos.length) break
      filtros.pagina += 1
    }
    const equipoIdsPermitidos = new Set(equiposFiltrados.map((equipo) => equipo.id))
    const filtrados = todos.filter((item) => equipoIdsPermitidos.has(item.equipo_id))
    return filtrados
  }

  async function cargarMovimientosFiltrados(equiposFiltrados: Equipo[]) {
    const todos: Movimiento[] = []
    const paginaTamano = 100
    let pagina = 1
    let total = Number.POSITIVE_INFINITY
    while (todos.length < total) {
      const resultado = await listarHistorialMovimientos({
        equipoId: '',
        desde,
        hasta,
        pagina,
        porPagina: paginaTamano,
      })
      todos.push(...resultado.movimientos)
      total = resultado.total
      if (!resultado.movimientos.length || todos.length >= total) break
      pagina += 1
    }
    const equipoIdsPermitidos = new Set(equiposFiltrados.map((equipo) => equipo.id))
    const filtrados = todos.filter((item) => equipoIdsPermitidos.has(item.equipo_id))
    return filtrados
  }

  function descargarPlantilla() {
    const categoriaEjemplo = (
      categorias[0]?.nombre ?? 'Reemplazar por categoría existente'
    ).replace(/"/g, '""')
    const contenido =
      'nombre,categoria,marca,modelo,numero_serie,codigo_patrimonial,ambiente_codigo,estado_operativo,fecha_adquisicion,fecha_garantia,posicion,observaciones,Procesador,Memoria RAM,Almacenamiento,Sistema operativo\r\n' +
      `Computadora aula 1,"${categoriaEjemplo}",Lenovo,ThinkCentre,,PAT-001,A101,operativo,2025-01-15,,Puesto 1,Ejemplo,Intel Core i5,8 GB DDR4,SSD 256 GB,Windows`
    const url = URL.createObjectURL(new Blob([`\uFEFF${contenido}`], { type: 'text/csv;charset=utf-8' }))
    const enlace = document.createElement('a')
    enlace.href = url
    enlace.download = 'plantilla-inventario.csv'
    enlace.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  async function importarCsv(archivo: File) {
    setImportando(true)
    setError('')
    setAviso('')
    setResultadoImportacion([])
    const resultados: string[] = []

    try {
      if (archivo.size > 2 * 1024 * 1024) {
        throw new Error('El archivo CSV no puede superar 2 MB.')
      }
      const filasCsv = analizarCsv(await leerArchivoCsv(archivo))
      if (filasCsv.length < 2) throw new Error('El CSV no contiene filas para importar.')
      if (filasCsv.length > 501) throw new Error('El límite es 500 equipos por importación.')

      const cabeceras = filasCsv[0].map(normalizarCabeceraCsv)
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

      for (const [indice, fila] of filasCsv.slice(1).entries()) {
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
          if (!estadosOperativos.some((opcion) => opcion === estadoNormalizado)) {
            throw new Error(`estado inválido: ${valores.estado_operativo}`)
          }

          await importarFila(
            {
              ...datosEquipoVacios,
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
        } catch (causa) {
          resultados.push(`Fila ${numeroFila}: ${mostrarError(causa, 'no se pudo importar')}`)
        }
      }

      setResultadoImportacion(resultados)
      const exitosas = resultados.filter((item) => item.endsWith('importada.')).length
      setAviso(`Importación finalizada: ${exitosas} de ${resultados.length} filas agregadas.`)
      if (exitosas !== resultados.length) {
        setError('Algunas filas no se importaron; revisa el resultado para ver el motivo de cada una.')
      }
      if (exitosas > 0) {
        setFilas([])
        setColumnas([])
        setFechaGeneracion('')
      }
    } catch (causa) {
      setError(mostrarError(causa, 'No se pudo procesar el archivo CSV.'))
    } finally {
      setImportando(false)
    }
  }

  async function generarReporte() {
    setGenerando(true)
    setError('')
    setAviso('')
    setFilas([])
    try {
      const resultadoInventario = await cargarEquiposFiltrados()
      const equiposFiltrados = resultadoInventario.equipos
      const categoriasPorId = new Map(resultadoInventario.categorias.map((categoria) => [categoria.id, categoria.nombre]))
      const ambientesPorId = new Map(resultadoInventario.ambientes.map((ambiente) => [ambiente.id, ambiente]))
      const fecha = fechaHoraGeneracion()
      let encabezados: string[]
      let registros: FilaReporte[]

      if (tipo === 'mantenimientos') {
        const historial = await cargarMantenimientosFiltrados(equiposFiltrados)
        const equiposPorId = new Map(equiposFiltrados.map((equipo) => [equipo.id, equipo]))
        encabezados = [
          'Código institucional', 'Equipo', 'Número de serie', 'Tipo',
          'Fecha de mantenimiento', 'Estado de la intervención',
          'Estado del equipo', 'Técnico responsable', 'Problema reportado',
          'Diagnóstico', 'Acciones realizadas', 'Componentes reemplazados',
          'Resultado', 'Observaciones', 'Próxima revisión',
          'Cambios de estado derivados',
        ]
        registros = historial.map((item) => {
          const equipo = equiposPorId.get(item.equipo_id)
          const estadoEquipo =
            item.equipo?.estado_operativo ?? equipo?.estado_operativo ?? ''
          return {
            'Código institucional': equipo?.codigo_institucional ?? item.equipo?.codigo_institucional ?? '',
            Equipo: equipo?.nombre ?? item.equipo?.nombre ?? '',
            'Número de serie': equipo?.numero_serie ?? '',
            Tipo: item.tipo,
            'Fecha de mantenimiento': item.fecha_mantenimiento,
            'Estado de la intervención': item.estado,
            'Estado del equipo': estadoEquipo
              ? estadosLabel[estadoEquipo] ?? estadoEquipo
              : '',
            'Técnico responsable': item.responsable
              ? `${item.responsable.nombres} ${item.responsable.apellidos}`.trim()
              : '',
            'Problema reportado': item.problema_reportado || item.descripcion || '',
            Diagnóstico: item.diagnostico ?? '',
            'Acciones realizadas': item.acciones_realizadas ?? '',
            'Componentes reemplazados': item.componentes_reemplazados ?? '',
            Resultado: item.resultado ?? '',
            Observaciones: item.observaciones ?? '',
            'Próxima revisión': item.proxima_revision ?? '',
            'Cambios de estado derivados': item.cambios
              .map((cambio) => {
                const fecha = cambio.created_at.slice(0, 10)
                const intervencion = `${cambio.estado_mantenimiento_anterior ?? 'alta'} → ${cambio.estado_mantenimiento_nuevo}`
                const equipoCambio =
                  cambio.estado_equipo_nuevo &&
                  cambio.estado_equipo_anterior !== cambio.estado_equipo_nuevo
                    ? `; equipo ${cambio.estado_equipo_anterior ?? '—'} → ${cambio.estado_equipo_nuevo}`
                    : ''
                const motivo = cambio.motivo ? `; motivo: ${cambio.motivo}` : ''
                return `${fecha}: ${intervencion}${equipoCambio}${motivo}`
              })
              .join(' | '),
          }
        })
      } else if (tipo === 'movimientos') {
        const historial = await cargarMovimientosFiltrados(equiposFiltrados)
        const equiposPorId = new Map(equiposFiltrados.map((equipo) => [equipo.id, equipo]))
        encabezados = [
          'Código institucional', 'Equipo', 'Número de serie', 'Fecha',
          'Ubicación de origen', 'Ubicación de destino', 'Responsable anterior',
          'Responsable nuevo', 'Posición anterior', 'Posición nueva', 'Motivo',
        ]
        registros = historial.map((item) => ({
          'Código institucional': item.codigo_institucional,
          Equipo: item.equipo_nombre,
          'Número de serie': equiposPorId.get(item.equipo_id)?.numero_serie ?? '',
          Fecha: item.fecha_movimiento,
          'Ubicación de origen': item.ubicacion_origen ?? '',
          'Ubicación de destino': item.ubicacion_destino ?? '',
          'Responsable anterior': item.responsable_anterior ?? '',
          'Responsable nuevo': item.responsable_nuevo ?? '',
          'Posición anterior': item.posicion_anterior ?? '',
          'Posición nueva': item.posicion_nueva ?? '',
          Motivo: item.motivo,
        }))
      } else {
        encabezados = columnasEquipo
        registros = equiposFiltrados.map((equipo) => {
          const ambiente = equipo.ambiente_id ? ambientesPorId.get(equipo.ambiente_id) : undefined
          return {
            'Código institucional': equipo.codigo_institucional,
            Nombre: equipo.nombre,
            Categoría: categoriasPorId.get(equipo.categoria_id) ?? '',
            Marca: equipo.marca ?? '',
            Modelo: equipo.modelo ?? '',
            'Número de serie': equipo.numero_serie ?? '',
            'Código patrimonial': equipo.codigo_patrimonial ?? '',
            Pabellón: ambiente?.pabellon ?? '',
            Piso: ambiente?.piso ?? '',
            'Código de ambiente': ambiente?.codigo ?? '',
            Ambiente: ambiente?.nombre ?? '',
            Posición: equipo.posicion ?? '',
            'Estado operativo': estadosLabel[equipo.estado_operativo] ?? equipo.estado_operativo,
            Situación: estadosLabel[equipo.situacion] ?? equipo.situacion,
            'Fecha de adquisición': equipo.fecha_adquisicion ?? '',
            'Vencimiento de garantía': equipo.fecha_garantia ?? '',
            Observaciones: equipo.observaciones ?? '',
          }
        })
      }

      setColumnas(encabezados)
      setFilas(registros)
      setFechaGeneracion(fecha)
      setAviso(`Reporte generado: ${registros.length} registro(s).`)
    } catch (causa) {
      setError(mostrarError(causa))
    } finally {
      setGenerando(false)
    }
  }

  function exportar(formato: 'csv' | 'xlsx') {
    if (!filas.length) return
    const titulo = nombresReportes[tipo]
    if (formato === 'csv') {
      const contenido = [
        escaparCsv(titulo),
        escaparCsv(`Fecha de generación: ${fechaGeneracion}`),
        columnas.map(escaparCsv).join(','),
        ...filas.map((fila) => columnas.map((columna) => escaparCsv(fila[columna] ?? '')).join(',')),
      ].join('\r\n')
      descargarArchivo(
        `reporte-${tipo}-${new Date().toISOString().slice(0, 10)}.csv`,
        `\uFEFF${contenido}`,
        'text/csv;charset=utf-8',
      )
      return
    }

    descargarArchivo(
      `reporte-${tipo}-${new Date().toISOString().slice(0, 10)}.xlsx`,
      crearArchivoXlsx(titulo, fechaGeneracion, columnas, filas),
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    )
  }

  const vistaPrevia = filas.slice(0, 8)
  const camposInventario = true
  const camposFecha = ['mantenimientos', 'movimientos'].includes(tipo)
  const estadoOpciones = tipo === 'bajas'
    ? ['baja']
    : tipo === 'operativos'
      ? ['operativo']
      : tipo === 'inoperativos'
        ? ['inoperativo']
        : [...estadosOperativos, 'activo', 'baja', 'archivado']

  return (
    <section className="mx-auto flex w-full max-w-7xl flex-col gap-5">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Reportes e importación</h1>
        <p className="mt-1 text-sm text-slate-600">
          Genera y descarga reportes del inventario, mantenimientos y movimientos con los filtros seleccionados.
        </p>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className="text-sm font-medium text-slate-700">
            Tipo de reporte
            <select value={tipo} onChange={(event) => cambiarTipo(event.target.value as TipoReporte)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5">
              {reportesDisponibles.map((reporte) => <option key={reporte} value={reporte}>{nombresReportes[reporte]}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700">
            Buscar equipo
            <input value={busqueda} onChange={(event) => setBusqueda(event.target.value)} placeholder="Código, nombre, marca, serie…" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
          </label>
          {camposInventario && (
            <>
              <label className="text-sm font-medium text-slate-700">
                Estado o situación
                <select value={estado} onChange={(event) => setEstado(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5">
                  <option value="">Todos</option>
                  {estadoOpciones.map((opcion) => <option key={opcion} value={opcion}>{estadosLabel[opcion] ?? opcion}</option>)}
                </select>
              </label>
              <label className="text-sm font-medium text-slate-700">
                Categoría
                <select value={categoriaId} onChange={(event) => setCategoriaId(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5">
                  <option value="">Todas</option>
                  {categorias.map((categoria) => <option key={categoria.id} value={categoria.id}>{categoria.nombre}</option>)}
                </select>
              </label>
              <label className="text-sm font-medium text-slate-700">
                Pabellón
                <select value={pabellonId} onChange={(event) => { setPabellonId(event.target.value); setPisoId(''); setAmbienteId('') }} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5">
                  <option value="">Todos</option>
                  {pabellones.map((item) => <option key={item.id} value={item.id}>{item.nombre}</option>)}
                </select>
              </label>
              <label className="text-sm font-medium text-slate-700">
                Piso
                <select value={pisoId} onChange={(event) => { setPisoId(event.target.value); setAmbienteId('') }} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5">
                  <option value="">Todos</option>
                  {pisos.map((item) => <option key={item.id} value={item.id}>{item.nombre}</option>)}
                </select>
              </label>
              <label className="text-sm font-medium text-slate-700">
                Ambiente
                <select value={ambienteId} onChange={(event) => setAmbienteId(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5">
                  <option value="">Todos</option>
                  {ambientesFiltrados.map((ambiente) => <option key={ambiente.id} value={ambiente.id}>{ambiente.codigo} — {ambiente.nombre}</option>)}
                </select>
              </label>
            </>
          )}
          {camposFecha && (
            <>
              <label className="text-sm font-medium text-slate-700">
                Desde
                <input type="date" value={desde} max={hasta || undefined} onChange={(event) => setDesde(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
              </label>
              <label className="text-sm font-medium text-slate-700">
                Hasta
                <input type="date" value={hasta} min={desde || undefined} onChange={(event) => setHasta(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
              </label>
              <div className="sm:col-span-2 lg:col-span-3">
                <p className="text-xs text-slate-500">La búsqueda y filtros de inventario también se aplican a los historiales usando los equipos coincidentes.</p>
              </div>
            </>
          )}
        </div>
        {error && <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        {aviso && <p role="status" className="mt-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">{aviso}</p>}
        <div className="mt-5 flex flex-wrap gap-2">
          <button type="button" onClick={() => void generarReporte()} disabled={generando || importando || cargandoCatalogos} className="min-h-10 rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700 disabled:cursor-wait disabled:opacity-60">
            {generando ? 'Generando…' : 'Generar reporte'}
          </button>
          <button type="button" onClick={() => exportar('csv')} disabled={!filas.length || generando} className="min-h-10 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            Descargar CSV
          </button>
          <button type="button" onClick={() => exportar('xlsx')} disabled={!filas.length || generando} className="min-h-10 rounded-lg border border-green-300 px-4 py-2 text-sm font-semibold text-green-800 hover:bg-green-50 disabled:opacity-50">
            Descargar Excel
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <div>
          <h2 className="font-semibold text-slate-900">Importación masiva de equipos</h2>
          <p className="mt-1 text-sm text-slate-600">
            Descarga la plantilla CSV o importa equipos desde un archivo. Se verifican categorías,
            ambientes, fechas, estados y posibles duplicados antes de agregar cada registro.
          </p>
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={descargarPlantilla}
            disabled={cargandoCatalogos}
            className="min-h-10 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Descargar plantilla CSV
          </button>
          {puedeImportarEquipos && (
            <label className={`inline-flex min-h-10 items-center rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white transition ${importando ? 'cursor-wait opacity-60' : 'cursor-pointer hover:bg-orange-700'}`}>
              {importando ? 'Importando equipos…' : 'Importar equipos CSV'}
              <input
                type="file"
                accept=".csv,text/csv"
                disabled={importando || cargandoCatalogos}
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
        {resultadoImportacion.length > 0 && (
          <details className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <summary className="cursor-pointer text-sm font-medium text-slate-800">
              Resultado de importación ({resultadoImportacion.length} filas)
            </summary>
            <ul className="mt-2 max-h-48 overflow-auto text-sm text-slate-700">
              {resultadoImportacion.map((linea) => (
                <li key={linea}>{linea}</li>
              ))}
            </ul>
          </details>
        )}
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 sm:px-5">
          <div>
            <h2 className="font-semibold text-slate-900">Vista previa · {nombresReportes[tipo]}</h2>
            <p className="text-xs text-slate-500">
              {filas.length} registro(s){fechaGeneracion ? ` · Generado ${fechaGeneracion}` : ''}
            </p>
          </div>
          {filas.length > vistaPrevia.length && <span className="text-xs text-slate-500">Se muestran los primeros {vistaPrevia.length}</span>}
        </div>
        {!filas.length ? (
          <p className="px-4 py-10 text-center text-sm text-slate-500">Selecciona los filtros y genera un reporte para ver la vista previa.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>{columnas.map((columna) => <th key={columna} className="whitespace-nowrap px-3 py-3">{columna}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {vistaPrevia.map((fila, indice) => (
                  <tr key={`${String(fila['Código institucional'] ?? fila.Fecha ?? indice)}-${indice}`}>
                    {columnas.map((columna) => <td key={columna} className="max-w-xs px-3 py-3 text-slate-700">{fila[columna] ?? '—'}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </section>
  )
}
