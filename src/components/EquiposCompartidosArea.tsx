import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { AmbienteUbicacion } from '../services/ubicacionesService'
import { listarEquiposCompartidos, mensajeCompartidos } from '../services/equiposCompartidosService'
import { compartidosExternos } from '../utils/equiposCompartidos'
import { normalizarTexto } from '../utils/inventario'
import type { EquipoUbicacion } from '../utils/equiposPiso'
import EstadoEquipoBadge from './EstadoEquipoBadge'

export default function EquiposCompartidosArea({ ambienteId, ambientes }: { ambienteId: string; ambientes: AmbienteUbicacion[] }) {
  const [equipos, setEquipos] = useState<EquipoUbicacion[]>([])
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [pagina, setPagina] = useState(1)
  const [recarga, setRecarga] = useState(0)
  useEffect(() => {
    let vigente = true
    listarEquiposCompartidos(ambienteId).then((datos) => { if (vigente) setEquipos(compartidosExternos(datos, ambienteId)) })
      .catch((e: unknown) => { if (vigente) setError(mensajeCompartidos(e)) })
      .finally(() => { if (vigente) setCargando(false) })
    return () => { vigente = false }
  }, [ambienteId, recarga])
  const filtrados = useMemo(() => equipos.filter((e) => normalizarTexto([e.nombre,e.codigo_institucional,e.numero_serie].join(' ')).includes(normalizarTexto(busqueda))), [equipos,busqueda])
  const paginas = Math.max(1, Math.ceil(filtrados.length / 10))
  const actual = Math.min(pagina, paginas)
  return <section className="mt-5 rounded-xl border border-blue-100 bg-white p-4 shadow-sm" aria-labelledby="titulo-compartidos">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 id="titulo-compartidos" className="font-semibold">Equipos compartidos desde otras ubicaciones</h3><p className="mt-1 text-sm text-slate-600">Esta área los utiliza, pero están físicamente en otra ubicación. No se suman al inventario físico del área.</p></div><button type="button" onClick={() => { setCargando(true); setError(''); setRecarga((n) => n+1) }} disabled={cargando} className="min-h-10 rounded-lg border border-slate-300 px-3 py-2 text-sm">Actualizar</button></div>
    {cargando ? <p role="status" className="mt-3 text-sm">Consultando equipos compartidos…</p> : error ? <p role="alert" className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{error}</p> : <>
      <label className="mt-4 block text-sm">Buscar entre los {equipos.length} equipos compartidos<input type="search" value={busqueda} onChange={(e) => { setBusqueda(e.target.value); setPagina(1) }} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 sm:max-w-md" /></label>
      {!filtrados.length && <p className="mt-4 text-sm text-slate-500">{busqueda ? 'No hay coincidencias.' : 'No hay equipos externos compartidos con esta área.'}</p>}
      <ul className="mt-4 grid gap-3 md:grid-cols-2">{filtrados.slice((actual-1)*10,actual*10).map((e) => <li key={e.id} className="rounded-xl border border-slate-200 p-4"><div className="flex items-start justify-between gap-2"><div><p className="text-xs font-semibold text-blue-700">{e.codigo_institucional}</p><h4 className="mt-1 font-semibold">{e.nombre}</h4></div><EstadoEquipoBadge estado={e.estado_operativo} situacion={e.situacion} /></div><p className="mt-2 text-sm text-slate-600">Ubicación física: {ambientes.find((a) => a.id === e.ambiente_id)?.nombre ?? 'No disponible'}</p><p className="mt-1 break-all text-xs text-slate-500">Serie: {e.numero_serie ?? 'Sin serie'}</p><Link to={`/equipos?equipo=${encodeURIComponent(e.id)}`} className="mt-3 inline-flex min-h-10 items-center rounded-lg border border-blue-200 px-3 py-2 text-sm font-semibold text-blue-800">Ver ficha y áreas usuarias</Link></li>)}</ul>
      {paginas > 1 && <nav aria-label="Paginación de equipos compartidos" className="mt-4 flex items-center justify-between gap-2"><button type="button" disabled={actual === 1} onClick={() => setPagina(actual-1)} className="rounded border px-3 py-2 disabled:opacity-40">Anterior</button><span className="text-sm">{actual} de {paginas}</span><button type="button" disabled={actual === paginas} onClick={() => setPagina(actual+1)} className="rounded border px-3 py-2 disabled:opacity-40">Siguiente</button></nav>}
    </>}
  </section>
}
