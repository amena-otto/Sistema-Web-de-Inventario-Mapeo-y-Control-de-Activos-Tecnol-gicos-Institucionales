import QRCode from 'qrcode'
import { ajustarDatosEtiqueta, crearUrlFicha, crearFormatoEtiquetas, type EquipoEtiqueta, type EtiquetaPreparada } from './etiquetasQr'

// Recurso oficial opcional. No se imprime un sustituto si todavía no existe.
export async function cargarLogoInstitucional(): Promise<HTMLImageElement | null> {
  for (const ruta of ['logo-otto-tonsmann.png', 'publiclogo-otto-tonsmann.png']) {
    const imagen = new Image()
    imagen.src = `${import.meta.env.BASE_URL}${ruta}`
    try { await imagen.decode(); return imagen } catch { /* Probar el siguiente recurso institucional. */ }
  }
  return null
}

let plantillaDeSesion: HTMLImageElement | null = null

export async function cargarPlantillaInstitucional(): Promise<HTMLImageElement | null> {
  if (plantillaDeSesion) return plantillaDeSesion
  const imagen = new Image()
  imagen.src = `${import.meta.env.BASE_URL}plantilla-etiqueta-otto-tonsmann.png`
  try { await imagen.decode(); plantillaDeSesion = imagen; return imagen } catch { return null }
}

export async function leerPlantillaInstitucional(archivo: File): Promise<HTMLImageElement> {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(archivo.type)) throw new Error('Selecciona la imagen original en PNG, JPG o WebP.')
  if (archivo.size > 10 * 1024 * 1024) throw new Error('La plantilla no puede superar 10 MB.')
  const url = URL.createObjectURL(archivo)
  try {
    const imagen = new Image()
    imagen.src = url
    await imagen.decode()
    if (Math.abs(imagen.naturalWidth / imagen.naturalHeight - 2) > 0.06) throw new Error('Selecciona la etiqueta completa de la referencia, con proporción horizontal cercana a 2:1.')
    plantillaDeSesion = imagen
    return imagen
  } finally { URL.revokeObjectURL(url) }
}

// El escudo se toma del recurso oficial o se recorta de la referencia cargada.
// La tarjeta se compone nuevamente para evitar heredar el espacio vacío del fondo.
function dibujarLogo(ctx: CanvasRenderingContext2D, logo: HTMLImageElement | null, plantilla?: HTMLImageElement | null) {
  if (plantilla) {
    const x = 43 / 1171 * plantilla.naturalWidth
    const y = 25 / 589 * plantilla.naturalHeight
    const ancho = 176 / 1171 * plantilla.naturalWidth
    const alto = 191 / 589 * plantilla.naturalHeight
    const proporcion = Math.min(104 / ancho, 108 / alto)
    ctx.drawImage(plantilla, x, y, ancho, alto, 28 + (104 - ancho * proporcion) / 2, 13, ancho * proporcion, alto * proporcion)
  } else if (logo) {
    // Quita solo el margen blanco del archivo, sin modificar ni deformar el escudo.
    const auxiliar = document.createElement('canvas')
    auxiliar.width = logo.naturalWidth
    auxiliar.height = logo.naturalHeight
    const contexto = auxiliar.getContext('2d')
    let x = 0, y = 0, ancho = logo.naturalWidth, alto = logo.naturalHeight
    if (contexto) {
      contexto.drawImage(logo, 0, 0)
      const pixels = contexto.getImageData(0, 0, ancho, alto).data
      let izquierda = ancho, derecha = 0, arriba = alto, abajo = 0
      for (let fila = 0; fila < alto; fila++) for (let columna = 0; columna < ancho; columna++) {
        const i = (fila * ancho + columna) * 4
        if (pixels[i + 3] > 20 && Math.min(pixels[i], pixels[i + 1], pixels[i + 2]) < 230) {
          izquierda = Math.min(izquierda, columna); derecha = Math.max(derecha, columna)
          arriba = Math.min(arriba, fila); abajo = Math.max(abajo, fila)
        }
      }
      if (derecha > izquierda && abajo > arriba) { x = izquierda; y = arriba; ancho = derecha - izquierda + 1; alto = abajo - arriba + 1 }
    }
    const proporcion = Math.min(104 / ancho, 108 / alto)
    ctx.drawImage(logo, x, y, ancho, alto, 28 + (104 - ancho * proporcion) / 2, 13, ancho * proporcion, alto * proporcion)
  }
}

export async function dibujarEtiquetaQr(equipo: EquipoEtiqueta, logo: HTMLImageElement | null, plantilla?: HTMLImageElement | null, altoMm = 35): Promise<EtiquetaPreparada> {
  if (!equipo.id || !equipo.nombre.trim() || !equipo.codigo_institucional.trim()) throw new Error('El equipo debe tener UUID, nombre y código institucional para generar su etiqueta.')
  const formato = crearFormatoEtiquetas(altoMm)
  const url = crearUrlFicha(equipo.id, import.meta.env.VITE_APP_URL)
  const lienzo = document.createElement('canvas')
  lienzo.width = 1080
  lienzo.height = formato.altoMm * 12
  const alto = lienzo.height
  const ctx = lienzo.getContext('2d')
  if (!ctx) throw new Error('El navegador no permite preparar la etiqueta para imprimir.')
  ctx.beginPath(); ctx.roundRect(0, 0, 1080, alto, 24); ctx.clip()
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, 1080, alto)
  dibujarLogo(ctx, logo, plantilla)
  ctx.textBaseline = 'top'
  ctx.fillStyle = '#102e50'
  ctx.font = '36px Arial, sans-serif'
  ctx.fillText('INSTITUTO', 157, 23)
  ctx.font = 'bold 44px Arial, sans-serif'
  ctx.fillText('OTTO TONSMANN', 154, 66)

  // Nombre y código son un bloque consecutivo. El código sigue al alto REAL del
  // nombre; nunca se reserva para él un espacio fijo equivalente a varias líneas.
  const medir = (valor: string, tamano: number) => {
    ctx.font = `${tamano}px Arial, sans-serif`
    return ctx.measureText(valor).width
  }
  const datos = ajustarDatosEtiqueta(equipo.nombre, equipo.codigo_institucional, alto, medir, equipo.numero_serie)
  for (const [bloque, inicio] of [[datos.nombre, datos.nombreY], [datos.codigo, datos.codigoY], [datos.serie, datos.serieY]] as const) {
    ctx.font = `${bloque.tamano}px Arial, sans-serif`
    bloque.lineas.forEach((linea, indice) => ctx.fillText(linea, 32, inicio + indice * bloque.interlineado))
  }

  const qr = await QRCode.toCanvas(url, { errorCorrectionLevel: 'H', margin: 4, scale: 8, color: { dark: '#102e50', light: '#ffffff' } })
  const modulos = qr.width / 8
  const lado = Math.floor(276 / modulos) * modulos
  if (lado < modulos * 2) throw new Error('La URL es demasiado extensa para imprimir un QR legible.')
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(qr, Math.round(762 + (276 - lado) / 2), Math.round(92 + (276 - lado) / 2), lado, lado)

  // Ondas amplias: ocupan hasta 7 mm en las esquinas, sin invadir datos ni QR.
  ctx.fillStyle = '#f2c230'
  ctx.beginPath(); ctx.moveTo(0, alto - 68); ctx.bezierCurveTo(270, alto - 118, 620, alto + 55, 1080, alto - 49); ctx.lineTo(1080, alto); ctx.lineTo(0, alto); ctx.fill()
  ctx.fillStyle = '#1976b9'
  ctx.beginPath(); ctx.moveTo(0, alto - 39); ctx.bezierCurveTo(320, alto - 88, 640, alto + 78, 1080, alto - 65); ctx.lineTo(1080, alto); ctx.lineTo(0, alto); ctx.fill()
  ctx.fillStyle = '#102e50'
  ctx.beginPath(); ctx.moveTo(0, alto - 16); ctx.bezierCurveTo(350, alto - 49, 740, alto + 54, 1080, alto - 30); ctx.lineTo(1080, alto); ctx.lineTo(0, alto); ctx.fill()
  ctx.strokeStyle = '#cbd5e1'
  ctx.lineWidth = 1
  ctx.beginPath(); ctx.roundRect(0.5, 0.5, 1079, alto - 1, 24); ctx.stroke()
  return { ...equipo, url, imagen: lienzo.toDataURL('image/png') }
}
