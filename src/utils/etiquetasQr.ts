export type EquipoEtiqueta = { id: string; nombre: string; codigo_institucional: string; numero_serie?: string | null }
export type EtiquetaPreparada = EquipoEtiqueta & { url: string; imagen: string }

export function crearFormatoEtiquetas(altoMm = 35) {
  if (![35, 40, 45].includes(altoMm)) throw new Error('Selecciona una altura de 35, 40 o 45 mm.')
  const filas = Math.floor((189 + 3) / (altoMm + 3))
  const contenidoAltoMm = filas * altoMm + (filas - 1) * 3
  return {
    anchoMm: 90, altoMm, columnas: 3, filas, porPagina: 3 * filas,
    hojaAnchoMm: 297, hojaAltoMm: 210, separacionHorizontalMm: 4, separacionVerticalMm: 3,
    contenidoAnchoMm: 278, contenidoAltoMm, margenHorizontalMm: 9.5,
    margenVerticalMm: (210 - contenidoAltoMm) / 2,
  }
}
export const formatoEtiquetas = crearFormatoEtiquetas()
export type FormatoEtiquetas = ReturnType<typeof crearFormatoEtiquetas>

// Conserva el contrato del generador original: origen HTTPS y UUID en ?equipo=.
export function crearUrlFicha(equipoId: string, configuracion?: string) {
  if (!configuracion?.trim()) throw new Error('Configura VITE_APP_URL con el dominio HTTPS publicado antes de generar etiquetas.')
  const origen = new URL(configuracion.trim())
  if (origen.protocol !== 'https:' || origen.hostname === 'localhost' || origen.hostname.endsWith('.localhost') || origen.username || origen.password || origen.pathname !== '/' || origen.search || origen.hash) {
    throw new Error('VITE_APP_URL debe ser únicamente el origen HTTPS publicado, sin localhost ni rutas.')
  }
  const ficha = new URL('/equipos', origen)
  ficha.searchParams.set('equipo', equipoId)
  return ficha.toString()
}

export function dividirEnPaginas<T>(etiquetas: readonly T[], formato = formatoEtiquetas): T[][] {
  const paginas: T[][] = []
  for (let inicio = 0; inicio < etiquetas.length; inicio += formato.porPagina) paginas.push(etiquetas.slice(inicio, inicio + formato.porPagina))
  return paginas
}

export function ajustarTexto(
  texto: string, ancho: number, alto: number, maximo: number, minimo: number,
  medir: (texto: string, tamano: number) => number,
) {
  for (let tamano = maximo; tamano >= minimo; tamano -= 1) {
    const lineas: string[] = []
    let linea = ''
    for (const palabra of texto.trim().split(/\s+/)) {
      const candidato = linea ? `${linea} ${palabra}` : palabra
      if (medir(candidato, tamano) <= ancho) { linea = candidato; continue }
      if (linea) { lineas.push(linea); linea = '' }
      for (const caracter of palabra) {
        if (medir(linea + caracter, tamano) > ancho) { lineas.push(linea); linea = '' }
        linea += caracter
      }
    }
    if (linea) lineas.push(linea)
    if (lineas.length * tamano * 1.15 <= alto && lineas.every((l) => medir(l, tamano) <= ancho)) return { lineas, tamano, interlineado: tamano * 1.15 }
  }
  throw new Error('El texto supera el espacio legible de la etiqueta. Selecciona una altura mayor.')
}

export function ajustarDatosEtiqueta(
  nombre: string,
  codigo: string,
  altoPx: number,
  medir: (texto: string, tamano: number) => number,
  numeroSerie?: string | null,
) {
  const espacio = altoPx - 220
  const serie = numeroSerie?.trim() || 'Sin serie'
  for (let maximo = 44; maximo >= 20; maximo--) {
    const bloqueNombre = ajustarTexto(`NOMBRE: ${nombre}`, 706, espacio, maximo, 20, medir)
    const bloqueCodigo = ajustarTexto(`CÓDIGO: ${codigo}`, 706, espacio, Math.min(40, maximo), 20, medir)
    const bloqueSerie = ajustarTexto(`SERIE: ${serie}`, 706, espacio, Math.min(36, maximo), 20, medir)
    const altoNombre = bloqueNombre.lineas.length * bloqueNombre.interlineado
    const altoCodigo = bloqueCodigo.lineas.length * bloqueCodigo.interlineado
    const altoSerie = bloqueSerie.lineas.length * bloqueSerie.interlineado
    if (altoNombre + altoCodigo + altoSerie + 24 <= espacio) {
      const codigoY = 141 + altoNombre + 12
      const serieY = codigoY + altoCodigo + 12
      return {
        nombre: bloqueNombre,
        codigo: bloqueCodigo,
        serie: bloqueSerie,
        nombreY: 141,
        codigoY,
        serieY,
      }
    }
  }
  throw new Error('El nombre, código o serie necesitan más espacio legible. Selecciona una altura de 40 o 45 mm.')
}

function escaparHtml(texto: string) {
  const entidades: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
  return texto.replace(/[&<>"']/g, (caracter) => entidades[caracter])
}

export function crearEstilosImpresionEtiquetas(formato = formatoEtiquetas) {
  return `
  @page { size: A4 landscape; margin: ${formato.margenVerticalMm}mm ${formato.margenHorizontalMm}mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; font-family: Arial, sans-serif; }
  .hoja { width: ${formato.contenidoAnchoMm}mm; height: ${formato.contenidoAltoMm}mm; display: grid;
    grid-template-columns: repeat(3, 90mm); grid-template-rows: repeat(${formato.filas}, ${formato.altoMm}mm);
    column-gap: 4mm; row-gap: 3mm; break-after: page; page-break-after: always;
    break-inside: avoid; page-break-inside: avoid; }
  .hoja:last-child { break-after: auto; page-break-after: auto; }
  .etiqueta { display: block; width: 90mm; height: ${formato.altoMm}mm; margin: 0;
    outline: 0.2mm dashed #64748b; outline-offset: 0;
    object-fit: contain; break-inside: avoid; page-break-inside: avoid;
    print-color-adjust: exact; -webkit-print-color-adjust: exact; }
  @media screen { body { background: #e2e8f0; padding: 20px; }
    .hoja { margin: 0 auto 20px; background: white; outline: 1px solid #94a3b8; } }
`
}

export function crearDocumentoImpresion(etiquetas: readonly EtiquetaPreparada[], formato = formatoEtiquetas) {
  if (!etiquetas.length) throw new Error('Selecciona al menos un equipo.')
  const hojas = dividirEnPaginas(etiquetas, formato).map((pagina) => `<section class="hoja">${pagina.map((etiqueta) => {
    if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(etiqueta.imagen)) throw new Error('La etiqueta no contiene una imagen PNG válida.')
    return `<img class="etiqueta" src="${etiqueta.imagen}" alt="${escaparHtml(`${etiqueta.codigo_institucional} — ${etiqueta.nombre} — Serie ${etiqueta.numero_serie ?? 'Sin serie'}`)}">`
  }).join('')}</section>`).join('')
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Etiquetas institucionales</title><style>${crearEstilosImpresionEtiquetas(formato)}</style></head><body>${hojas}</body></html>`
}
