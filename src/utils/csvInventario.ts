import { columnasImportacion } from './inventario.ts'

export function normalizarCsv(valor: string) {
  return valor
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase()
}

export function normalizarCabeceraCsv(valor: string) {
  const cabecera = normalizarCsv(valor).replace(/\s+/g, '_')
  const alias: Record<string, string> = {
    numero_de_serie: 'numero_serie',
    codigo_de_ambiente: 'ambiente_codigo',
    codigo_ambiente: 'ambiente_codigo',
  }
  return alias[cabecera] ?? cabecera
}

export function prepararCsvInventario(texto: string) {
  const filas = analizarCsv(texto)
  if (filas.length < 2) throw new Error('El CSV no contiene filas para importar.')
  if (filas.length > 501) throw new Error('El límite es 500 equipos por importación.')
  const cabeceras = filas[0].map(normalizarCabeceraCsv)
  if (new Set(cabeceras).size !== cabeceras.length) throw new Error('El CSV contiene encabezados repetidos.')
  const faltantes = columnasImportacion.filter((campo) => !cabeceras.includes(campo))
  if (faltantes.length) throw new Error(`Faltan columnas obligatorias: ${faltantes.join(', ')}.`)
  return { cabeceras, filas: filas.slice(1) }
}

export function valoresFilaCsv(fila: string[], cabeceras: string[]): Record<string, string> {
  const celdas = [...fila]
  while (celdas.length > cabeceras.length && celdas.at(-1) === '') celdas.pop()
  if (celdas.length > cabeceras.length) throw new Error(`La fila tiene ${celdas.length} columnas y el encabezado tiene ${cabeceras.length}.`)
  return Object.fromEntries(cabeceras.map((cabecera, indice) => [cabecera, (celdas[indice] ?? '').trim()]))
}

export function detectarSeparador(texto: string) {
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

export function analizarCsv(texto: string): (string[] & { numeroLinea: number })[] {
  const separador = detectarSeparador(texto)
  const filas: (string[] & { numeroLinea: number })[] = []
  let numeroLinea = 1
  let inicioFila = 1
  let fila: string[] = []
  let celda = ''
  let entreComillas = false
  let comillaCerrada = false

  for (let indice = 0; indice < texto.length; indice += 1) {
    const caracter = texto[indice]
    if (comillaCerrada && caracter !== separador && caracter !== '\n' && caracter !== '\r') {
      if (!caracter.trim()) continue
      throw new Error(`Fila ${inicioFila}: hay texto después de cerrar las comillas.`)
    }
    if (caracter === '"') {
      if (entreComillas && texto[indice + 1] === '"') {
        celda += '"'
        indice += 1
      } else if (entreComillas) {
        entreComillas = false
        comillaCerrada = true
      } else if (!celda.trim()) {
        celda = ''
        entreComillas = true
      } else {
        throw new Error(`Fila ${inicioFila}: hay comillas dentro de un valor sin entrecomillar.`)
      }
    } else if (caracter === separador && !entreComillas) {
      fila.push(celda.trim())
      celda = ''
      comillaCerrada = false
    } else if ((caracter === '\n' || caracter === '\r') && !entreComillas) {
      if (caracter === '\r' && texto[indice + 1] === '\n') indice += 1
      fila.push(celda.trim())
      if (fila.some(Boolean)) filas.push(Object.assign(fila, { numeroLinea: inicioFila }))
      numeroLinea += 1
      inicioFila = numeroLinea
      fila = []
      celda = ''
      comillaCerrada = false
    } else {
      celda += caracter
      if (caracter === '\n' || (caracter === '\r' && texto[indice + 1] !== '\n')) numeroLinea += 1
    }
  }

  if (entreComillas) throw new Error(`Fila ${inicioFila}: el CSV contiene comillas sin cerrar.`)
  fila.push(celda.trim())
  if (fila.some(Boolean)) filas.push(Object.assign(fila, { numeroLinea: inicioFila }))
  return filas
}

export async function leerArchivoCsv(archivo: File) {
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

export function fechaCsvAISO(valor: string = '') {
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

