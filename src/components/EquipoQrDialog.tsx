import { useEffect, useMemo, useState } from 'react'
import { cargarLogoInstitucional, cargarPlantillaInstitucional, leerPlantillaInstitucional, dibujarEtiquetaQr } from '../utils/dibujarEtiquetaQr'
import { crearDocumentoImpresion, dividirEnPaginas, crearFormatoEtiquetas, type EquipoEtiqueta, type EtiquetaPreparada } from '../utils/etiquetasQr'
import './EquipoQrDialog.css'

type Props = { onClose: () => void } & (
  { equipo: EquipoEtiqueta; equipos?: never } | { equipos: EquipoEtiqueta[]; equipo?: never }
)
type Resultado = { origen: EquipoEtiqueta[]; etiquetas: EtiquetaPreparada[]; error: string; sinLogo: boolean; plantillaSolicitada: HTMLImageElement | null; altoMm: number }

export default function EquipoQrDialog({ equipo, equipos, onClose }: Props) {
  const seleccion = useMemo(() => equipos ?? (equipo ? [equipo] : []), [equipo, equipos])
  const [resultado, setResultado] = useState<Resultado | null>(null)
  const [errorAccion, setErrorAccion] = useState('')
  const [plantilla, setPlantilla] = useState<HTMLImageElement | null>(null)
  const [cargandoPlantilla, setCargandoPlantilla] = useState(false)
  const [altoMm, setAltoMm] = useState(35)
  const formato = useMemo(() => crearFormatoEtiquetas(altoMm), [altoMm])
  const [imprimiendo, setImprimiendo] = useState(false)
  const actual = resultado?.origen === seleccion && resultado.plantillaSolicitada === plantilla && resultado.altoMm === altoMm && !cargandoPlantilla ? resultado : null
  const etiquetas = actual?.etiquetas ?? []
  const paginas = dividirEnPaginas(etiquetas, formato)
  const error = errorAccion || actual?.error

  useEffect(() => {
    let vigente = true
    async function preparar() {
      const plantillaActual = plantilla ?? await cargarPlantillaInstitucional()
      const logo = await cargarLogoInstitucional()
      const preparadas: EtiquetaPreparada[] = []
      try {
        if (!seleccion.length) throw new Error('Selecciona al menos un equipo.')
        for (const registro of seleccion) {
          if (!vigente) return
          try { preparadas.push(await dibujarEtiquetaQr(registro, logo, plantillaActual, altoMm)) }
          catch (causa) { throw new Error(`${registro.codigo_institucional}: ${causa instanceof Error ? causa.message : 'No se pudo generar la etiqueta.'}`, { cause: causa }) }
        }
        if (vigente) setResultado({ origen: seleccion, etiquetas: preparadas, error: '', sinLogo: !logo && !plantillaActual, plantillaSolicitada: plantilla, altoMm })
      } catch (causa) {
        if (vigente) setResultado({ origen: seleccion, etiquetas: [], error: causa instanceof Error ? causa.message : 'No se pudieron preparar las etiquetas.', sinLogo: !logo && !plantillaActual, plantillaSolicitada: plantilla, altoMm })
      }
    }
    void preparar()
    return () => { vigente = false }
  }, [seleccion, plantilla, altoMm])

  useEffect(() => {
    const anterior = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const cerrar = document.getElementById('cerrar-etiquetas')
    cerrar?.focus()
    function teclado(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
      if (event.key === 'Tab') {
        const elementos = Array.from(document.getElementById('dialogo-etiquetas')?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled)') ?? [])
        const primero = elementos[0]
        const ultimo = elementos.at(-1)
        if (event.shiftKey && document.activeElement === primero) { event.preventDefault(); ultimo?.focus() }
        else if (!event.shiftKey && document.activeElement === ultimo) { event.preventDefault(); primero?.focus() }
      }
    }
    window.addEventListener('keydown', teclado)
    return () => { window.removeEventListener('keydown', teclado); anterior?.focus() }
  }, [onClose])

  function descargar(etiqueta: EtiquetaPreparada) {
    const enlace = document.createElement('a')
    enlace.href = etiqueta.imagen
    enlace.download = `Etiqueta_${etiqueta.codigo_institucional.replace(/[^a-zA-Z0-9_-]/g, '_')}.png`
    enlace.click()
  }

  async function imprimir() {
    if (!etiquetas.length || imprimiendo) return
    setErrorAccion('')
    const ventana = window.open('', '_blank')
    if (!ventana) { setErrorAccion('Permite las ventanas emergentes para abrir la hoja de impresión.'); return }
    setImprimiendo(true)
    try {
      ventana.document.open()
      ventana.document.write(crearDocumentoImpresion(etiquetas, formato))
      ventana.document.close()
      // Esperar todas las etiquetas: una imagen todavía pendiente no debe salir en blanco.
      await Promise.all(Array.from(ventana.document.images).map((imagen) => imagen.decode()))
      if (ventana.closed) return
      ventana.focus()
      ventana.print()
    } catch (causa) {
      ventana.close()
      setErrorAccion(causa instanceof Error ? causa.message : 'No se pudo preparar la impresión.')
    } finally { setImprimiendo(false) }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-slate-950/60 p-3 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section id="dialogo-etiquetas" role="dialog" aria-modal="true" aria-labelledby="equipo-qr-titulo" className="my-auto max-h-[calc(100dvh-1.5rem)] w-full max-w-6xl overflow-y-auto rounded-2xl bg-white p-4 shadow-2xl sm:p-6">
        <header className="flex items-start justify-between gap-4">
          <div><p className="text-xs font-bold uppercase tracking-widest text-blue-800">Instituto Otto Tonsmann</p><h2 id="equipo-qr-titulo" className="mt-1 text-xl font-bold text-slate-900">Etiquetas institucionales QR</h2><p className="mt-1 text-sm text-slate-600">{seleccion.length} equipo(s) · {formato.anchoMm} × {formato.altoMm} mm · A4 horizontal · {formato.columnas} columnas × {formato.filas} filas · hasta {formato.porPagina} etiquetas por hoja</p></div>
          <button id="cerrar-etiquetas" type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">Cerrar</button>
        </header>
        {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        {actual?.sinLogo && <p role="status" className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">No se encontró el logotipo oficial. El espacio superior izquierdo queda reservado. Incorpora el archivo oficial como public/logo-otto-tonsmann.png antes de imprimir las etiquetas definitivas.</p>}
        <div className="mt-4 rounded-lg border border-slate-200 p-3">
          <label className="block text-sm font-semibold text-slate-800">Cargar referencia institucional (opcional)
            <input type="file" accept="image/png,image/jpeg,image/webp" disabled={cargandoPlantilla || imprimiendo} className="mt-2 block w-full text-sm" onChange={async (event) => {
              const archivo = event.target.files?.[0]
              event.currentTarget.value = ''
              if (!archivo) return
              setErrorAccion('')
              setCargandoPlantilla(true)
              try { setPlantilla(await leerPlantillaInstitucional(archivo)) }
              catch (causa) { setErrorAccion(causa instanceof Error ? causa.message : 'No se pudo abrir la imagen.') }
              finally { setCargandoPlantilla(false) }
            }} />
          </label>
          <p className="mt-2 text-xs text-slate-600">Puedes cargar la referencia completa para usar su escudo original. La composición se adapta al formato compacto; los datos y el QR provienen del inventario.</p>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label className="text-sm text-slate-700">Altura de etiqueta
            <select value={altoMm} disabled={imprimiendo} onChange={(event) => { setErrorAccion(''); setAltoMm(Number(event.target.value)) }} className="ml-2 rounded-lg border border-slate-300 px-3 py-2">
              <option value={35}>35 mm · compacto</option><option value={40}>40 mm</option><option value={45}>45 mm</option>
            </select>
          </label>
          <button type="button" onClick={() => void imprimir()} disabled={!etiquetas.length || imprimiendo} className="rounded-lg bg-blue-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{imprimiendo ? 'Preparando impresión…' : etiquetas.length === 1 ? 'Imprimir etiqueta' : `Imprimir ${etiquetas.length} etiquetas`}</button>
          <span className="text-sm text-slate-600">Vista previa: {paginas.length} hoja(s)</span>
        </div>
        <p className="mt-3 text-sm text-slate-600">En el diálogo de impresión elige A4 horizontal, escala 100 % (tamaño real) y desactiva los encabezados y pies del navegador. Las líneas punteadas indican el contorno de recorte de cada etiqueta. Comprueba la vista previa del navegador antes de confirmar.</p>
        {!actual && <p role="status" className="py-12 text-center text-slate-600">Preparando etiquetas y códigos QR…</p>}
        {paginas.map((pagina, indice) => (
          <section key={indice} className="mt-5">
            <h3 className="mb-2 text-sm font-semibold text-slate-700">Hoja {indice + 1} de {paginas.length} · {pagina.length} etiqueta(s)</h3>
            <div className="overflow-x-auto rounded-lg border border-slate-200 bg-slate-100 p-3">
              <div className="qr-hoja-preview" style={{ padding: `${formato.margenVerticalMm}mm ${formato.margenHorizontalMm}mm`, gridTemplateRows: `repeat(${formato.filas}, ${formato.altoMm}mm)` }}>
                {pagina.map((etiqueta) => <img key={etiqueta.id} src={etiqueta.imagen} alt={`Etiqueta de ${etiqueta.nombre}, código ${etiqueta.codigo_institucional}`} className="qr-etiqueta-preview" style={{ height: `${formato.altoMm}mm` }} />)}
              </div>
            </div>
          </section>
        ))}
        {etiquetas.length > 0 && <section className="mt-5"><h3 className="text-sm font-semibold text-slate-800">Descargar etiquetas completas y comprobar enlaces</h3><ul className="mt-2 divide-y divide-slate-100">{etiquetas.map((etiqueta) => <li key={etiqueta.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"><a href={etiqueta.url} target="_blank" rel="noopener noreferrer" className="break-all text-blue-800 underline">{etiqueta.codigo_institucional} — {etiqueta.nombre}</a><button type="button" onClick={() => descargar(etiqueta)} className="shrink-0 rounded border border-slate-300 px-3 py-2">Descargar PNG</button></li>)}</ul></section>}
      </section>
    </div>
  )
}
