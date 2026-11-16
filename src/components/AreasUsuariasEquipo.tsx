import { useEffect, useState } from 'react'
import type { Ambiente } from '../services/equiposService'
import { guardarAreasEquipo, listarAreasEquipo, mensajeCompartidos, type AreaUsuaria } from '../services/equiposCompartidosService'
import { esOficina } from '../utils/ubicaciones'
import { mismosIds } from '../utils/equiposCompartidos'

export default function AreasUsuariasEquipo({ equipoId, ambientes, puedeEditar, onGuardado }: { onGuardado?: (ids: string[]) => void; equipoId: string; ambientes: Ambiente[]; puedeEditar: boolean }) {
  const [areas, setAreas] = useState<AreaUsuaria[]>([])
  const [seleccion, setSeleccion] = useState<string[]>([])
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [recarga, setRecarga] = useState(0)
  useEffect(() => {
    let vigente = true
    listarAreasEquipo(equipoId).then((datos) => {
      if (!vigente) return
      setAreas(datos); setSeleccion(datos.map((a) => a.ambiente_id))
    }).catch((e: unknown) => { if (vigente) setError(mensajeCompartidos(e)) })
      .finally(() => { if (vigente) setCargando(false) })
    return () => { vigente = false }
  }, [equipoId, recarga])
  const oficinas = ambientes.filter(esOficina)
  const anteriores = areas.map((a) => a.ambiente_id)
  const opciones = [...oficinas.map((a) => ({ id: a.id, nombre: a.nombre, activo: true })), ...areas.filter((a) => !oficinas.some((o) => o.id === a.ambiente_id)).map((a) => ({ id: a.ambiente_id, nombre: a.ambiente.nombre, activo: false }))]
  async function guardar() {
    setGuardando(true); setAviso(''); setError('')
    try {
      await guardarAreasEquipo(equipoId, seleccion, anteriores)
      // La escritura ya fue confirmada. Actualizar el estado sin una segunda lectura falible.
      setAreas(seleccion.map((id) => { const o = opciones.find((a) => a.id === id)!; return { ambiente_id: id, ambiente: { nombre: o.nombre, activo: o.activo } } }))
      onGuardado?.(seleccion)
      setAviso('Áreas usuarias actualizadas. La ubicación física se conserva.')
    } catch (e) { setError(mensajeCompartidos(e)) }
    finally { setGuardando(false) }
  }
  return <section aria-labelledby="titulo-areas-usuarias" className="rounded-xl border border-blue-100 bg-blue-50/40 p-4">
    <h4 id="titulo-areas-usuarias" className="font-semibold">Áreas usuarias y uso compartido</h4>
    <p className="mt-1 text-sm text-slate-600">Selecciona todas las áreas que utilizan este equipo, incluida la de origen si corresponde. Esta configuración no traslada ni duplica el activo.</p>
    {cargando ? <p role="status" className="mt-3 text-sm">Consultando áreas usuarias…</p> : <>
      {error && <div role="alert" className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{error} <button type="button" disabled={guardando} onClick={() => { setCargando(true); setError(''); setAviso(''); setRecarga((n) => n + 1) }} className="font-semibold underline">Recargar</button></div>}
      {!error && <>
        <p className="mt-3 text-sm font-medium">{areas.length ? `${areas.length} área(s) usuaria(s) registradas` : 'Sin áreas usuarias adicionales registradas'}</p>
        {puedeEditar ? <fieldset disabled={guardando} className="mt-3 grid max-h-64 gap-2 overflow-y-auto sm:grid-cols-2"><legend className="sr-only">Áreas que utilizan el equipo</legend>{opciones.map((a) => <label key={a.id} className="flex min-h-11 items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"><input type="checkbox" checked={seleccion.includes(a.id)} onChange={(e) => setSeleccion((ids) => e.target.checked ? [...ids, a.id] : ids.filter((id) => id !== a.id))} />{a.nombre}{!a.activo && ' (inactiva o no disponible)'}</label>)}</fieldset> : <ul className="mt-3 flex flex-wrap gap-2">{areas.map((a) => <li key={a.ambiente_id} className="rounded-full border border-blue-200 bg-white px-3 py-1 text-sm">{a.ambiente.nombre}{a.ambiente.activo ? '' : ' (inactiva)'}</li>)}</ul>}
        {puedeEditar && <button type="button" disabled={guardando || mismosIds(seleccion, anteriores)} onClick={() => void guardar()} className="mt-4 min-h-10 rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{guardando ? 'Guardando…' : 'Guardar áreas usuarias'}</button>}
      </>}
    </>}
    {aviso && <p role="status" className="mt-3 text-sm text-emerald-800">{aviso}</p>}
  </section>
}
