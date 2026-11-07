import { useState } from 'react'
import {
  eliminarEquipoDadoDeBaja,
  listarLimpiezasPendientes,
  type LimpiezaPendiente,
} from '../services/equiposService'

export default function LimpiezasPendientes() {
  const [pendientes, setPendientes] = useState<LimpiezaPendiente[] | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [mensaje, setMensaje] = useState('')

  async function ejecutar(pendiente?: LimpiezaPendiente) {
    if (ocupado) return
    setOcupado(true)
    setMensaje('')
    try {
      if (pendiente) {
        const resultado = await eliminarEquipoDadoDeBaja(pendiente.equipoId, pendiente.codigoInstitucional)
        setMensaje(resultado.advertencia ?? 'Limpieza completada.')
      }
      setPendientes(await listarLimpiezasPendientes())
    } catch (error) {
      setMensaje(error instanceof Error ? error.message : 'No se pudo consultar o reanudar la limpieza.')
    } finally {
      setOcupado(false)
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <button type="button" disabled={ocupado} onClick={() => void ejecutar()}
        className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold disabled:opacity-50">
        {ocupado ? 'Procesando...' : 'Consultar limpiezas pendientes'}
      </button>
      {mensaje && <p role="status" className="mt-2 text-sm">{mensaje}</p>}
      {pendientes?.length === 0 && <p className="mt-2 text-sm">Sin limpiezas pendientes.</p>}
      {pendientes?.map((pendiente) => (
        <div key={pendiente.equipoId} className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          <span>{pendiente.codigoInstitucional}: {pendiente.storage} en Storage, {pendiente.drive} en Drive</span>
          <button type="button" disabled={ocupado} onClick={() => void ejecutar(pendiente)}
            className="rounded-lg border border-slate-300 px-3 py-2 font-semibold disabled:opacity-50">
            Reanudar limpieza
          </button>
        </div>
      ))}
    </div>
  )
}
