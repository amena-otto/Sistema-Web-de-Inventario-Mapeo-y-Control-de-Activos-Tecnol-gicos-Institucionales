import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import type { Equipo } from '../services/equiposService'

function crearUrlFicha(equipoId: string) {
  const configuracion = import.meta.env.VITE_APP_URL?.trim()
  if (!configuracion) {
    throw new Error('Configura VITE_APP_URL con el dominio HTTPS publicado antes de generar etiquetas.')
  }

  const origen = new URL(configuracion)
  if (
    origen.protocol !== 'https:' ||
    origen.hostname === 'localhost' ||
    origen.hostname.endsWith('.localhost') ||
    origen.username ||
    origen.password ||
    origen.pathname !== '/' ||
    origen.search ||
    origen.hash
  ) {
    throw new Error('VITE_APP_URL debe ser únicamente el origen HTTPS publicado, sin localhost ni rutas.')
  }

  const ficha = new URL('/equipos', origen)
  ficha.searchParams.set('equipo', equipoId)
  return ficha.toString()
}

export default function EquipoQrDialog({
  equipo,
  onClose,
}: {
  equipo: Equipo
  onClose: () => void
}) {
  const [destino] = useState(() => {
    try {
      return { url: crearUrlFicha(equipo.id), error: '' }
    } catch (causa) {
      return {
        url: '',
        error: causa instanceof Error ? causa.message : 'No se pudo preparar la dirección del equipo.',
      }
    }
  })
  const [imagen, setImagen] = useState('')
  const [cargando, setCargando] = useState(Boolean(destino.url))
  const [error, setError] = useState(destino.error)

  useEffect(() => {
    let vigente = true
    if (destino.url) {
      void QRCode.toDataURL(destino.url, {
          errorCorrectionLevel: 'H',
          margin: 4,
          width: 1024,
          color: { dark: '#171717', light: '#ffffff' },
        })
        .then((resultado) => {
          if (vigente) setImagen(resultado)
        })
        .catch((causa: unknown) => {
          if (vigente) {
            setError(causa instanceof Error ? causa.message : 'No se pudo generar el código QR.')
          }
        })
        .finally(() => {
          if (vigente) setCargando(false)
        })
    }

    function cerrarConEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', cerrarConEscape)
    return () => {
      vigente = false
      window.removeEventListener('keydown', cerrarConEscape)
    }
  }, [destino.url, onClose])

  function descargar() {
    if (!imagen) return
    try {
      const enlace = document.createElement('a')
      enlace.href = imagen
      enlace.download = `QR_${equipo.codigo_institucional.replace(/[^a-zA-Z0-9_-]/g, '_')}.png`
      enlace.click()
    } catch (causa) {
      setError(causa instanceof Error ? causa.message : 'No se pudo descargar el código QR.')
    }
  }

  function imprimirEtiqueta() {
    if (!imagen) return
    const ventanaImpresion = window.open('', '_blank')
    if (!ventanaImpresion) {
      setError('El navegador bloqueó la ventana de impresión. Permite las ventanas emergentes e inténtalo de nuevo.')
      return
    }

    const escaparHtml = (texto: string) =>
      texto.replace(/[&<>"']/g, (caracter) => {
        const entidades: Record<string, string> = {
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;',
        }
        return entidades[caracter]
      })

    ventanaImpresion.document.open()
    ventanaImpresion.document.write(`<!doctype html>
      <html lang="es">
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <title>Etiqueta ${escaparHtml(equipo.codigo_institucional)}</title>
          <style>
            @page { size: 80mm 90mm; margin: 0; }
            * { box-sizing: border-box; }
            html, body { width: 80mm; height: 90mm; margin: 0; padding: 0; overflow: hidden; }
            body { font-family: Arial, sans-serif; color: #171717; }
            main { width: 80mm; height: 90mm; padding: 4mm; display: flex; flex-direction: column; align-items: center; justify-content: flex-start; text-align: center; overflow: hidden; break-inside: avoid; page-break-inside: avoid; }
            strong { margin-bottom: 2mm; font-size: 8pt; letter-spacing: .4mm; }
            img { display: block; width: 52mm; height: 52mm; object-fit: contain; }
            .code { margin-top: 2mm; font-size: 11pt; font-weight: 700; overflow-wrap: anywhere; }
            .name { margin-top: 1mm; max-height: 10mm; font-size: 9pt; overflow: hidden; }
            .hint { margin-top: 1mm; font-size: 7pt; color: #555; }
          </style>
        </head>
        <body>
          <main>
            <strong>IES PRIVADO OTTO TONSMANN</strong>
            <img src="${imagen}" alt="Código QR de ${escaparHtml(equipo.codigo_institucional)}">
            <div class="code">${escaparHtml(equipo.codigo_institucional)}</div>
            <div class="name">${escaparHtml(equipo.nombre)}</div>
            <div class="hint">Escanee para consultar la ficha</div>
          </main>
        </body>
      </html>`)
    ventanaImpresion.document.close()
    const imagenImpresion = ventanaImpresion.document.querySelector('img')
    const imprimir = () => {
      ventanaImpresion.focus()
      ventanaImpresion.print()
    }
    if (!imagenImpresion) {
      ventanaImpresion.close()
      setError('No se pudo preparar la imagen QR para imprimir.')
      return
    }
    if (imagenImpresion.complete && imagenImpresion.naturalWidth > 0) {
      imprimir()
    } else {
      imagenImpresion.addEventListener('load', imprimir, { once: true })
      imagenImpresion.addEventListener('error', () => {
        ventanaImpresion.close()
        setError('No se pudo cargar la imagen QR en la hoja de impresión.')
      }, { once: true })
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-slate-950/60 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="equipo-qr-titulo"
        className="my-auto max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-4 shadow-2xl sm:p-7"
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-orange-700">Identificación del activo</p>
            <h2 id="equipo-qr-titulo" className="mt-1 text-lg font-bold text-[#33251d]">Código QR del equipo</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar diálogo QR" className="rounded-lg px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-100 hover:text-slate-800">
            Cerrar
          </button>
        </div>

        {error && <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}

        <div id="etiqueta-qr" className="print-qr-label mx-auto flex w-full max-w-[300px] flex-col items-center rounded-xl border border-slate-200 bg-white p-5 text-center">
          <p className="text-[10px] font-extrabold tracking-[0.15em] text-[#33251d]">IES PRIVADO OTTO TONSMANN</p>
          {cargando ? (
            <div role="status" className="my-5 flex h-56 items-center text-sm text-slate-500">Generando código QR…</div>
          ) : imagen ? (
            <img src={imagen} alt={`Código QR de ${equipo.codigo_institucional}`} className="my-3 aspect-square w-48 object-contain sm:w-56" />
          ) : (
            <div className="my-5 flex h-56 items-center text-sm text-slate-500">No se pudo crear el código QR.</div>
          )}
          <p className="max-w-full break-words text-sm font-extrabold text-slate-900">{equipo.codigo_institucional}</p>
          <p className="mt-1 line-clamp-2 text-sm text-slate-700">{equipo.nombre}</p>
          <p className="mt-2 text-[10px] text-slate-500">Escanee para consultar la ficha</p>
        </div>

        {destino.url && (
          <div className="mt-4 rounded-lg bg-slate-50 p-3">
            <p className="text-xs font-semibold text-slate-600">Enlace de la ficha</p>
            <p className="mt-1 break-all text-xs text-slate-500">{destino.url}</p>
          </div>
        )}

        <div className="mt-5 grid grid-cols-1 gap-2 min-[420px]:grid-cols-2 sm:flex sm:flex-wrap sm:justify-end">
          <button type="button" onClick={imprimirEtiqueta} disabled={!imagen} className="min-h-10 rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50">
            Imprimir etiqueta
          </button>
          <button type="button" onClick={descargar} disabled={!imagen} className="min-h-10 rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50 min-[420px]:col-span-2 sm:col-span-1">
            Descargar PNG
          </button>
        </div>
      </section>
    </div>
  )
}
