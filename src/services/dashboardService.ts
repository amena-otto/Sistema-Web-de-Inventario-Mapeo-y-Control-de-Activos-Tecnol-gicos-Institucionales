import { supabase } from './supabaseClient'

export type ResumenDashboard = {
  totalEquipos: number
  equiposActivos: number
  equiposBaja: number
  equiposArchivados: number
  equiposOperativos: number
  equiposConFallas: number
  equiposAlmacen: number
  equiposMantenimiento: number
  equiposInoperativos: number
  laboratorios: { id: string; nombre: string; cantidad: number }[]
  mantenimientos: {
    total: number
    pendientes: number
    enProceso: number
    completados: number
  } | null
}

type EquipoDashboard = {
  ambiente_id: string | null
  estado_operativo: string
  situacion: string
}

type AmbienteDashboard = {
  id: string
  codigo: string
  nombre: string
  tipo: string
  pisos: { nombre: string; pabellones: { nombre: string } }
}

async function contarMantenimientos(estado: string) {
  const { count, error } = await supabase
    .from('mantenimientos')
    .select('id', { count: 'exact', head: true })
    .eq('estado', estado)
  if (error) throw error
  return count ?? 0
}

export async function obtenerResumenDashboard(
  puedeVerMantenimientos: boolean,
): Promise<ResumenDashboard> {
  const equipos: EquipoDashboard[] = []
  const limite = 500

  for (let desde = 0; ; desde += limite) {
    const { data, error } = await supabase
      .from('equipos')
      .select('ambiente_id, estado_operativo, situacion')
      .order('id')
      .range(desde, desde + limite - 1)
    if (error) throw error

    const lote = (data ?? []) as EquipoDashboard[]
    equipos.push(...lote)
    if (lote.length < limite) break
  }

  const { data: ambientesData, error: ambientesError } = await supabase
    .from('ambientes')
    .select('id, codigo, nombre, tipo, pisos!inner(nombre, pabellones!inner(nombre))')
    .eq('activo', true)
    .eq('tipo', 'laboratorio')
  if (ambientesError) throw ambientesError

  const ambientes = (ambientesData ?? []) as unknown as AmbienteDashboard[]
  const laboratoriosMap = new Map(
    ambientes.map((ambiente) => [
      ambiente.id,
      {
        id: ambiente.id,
        nombre: `${ambiente.nombre} · ${ambiente.pisos.pabellones.nombre}`,
        cantidad: 0,
      },
    ]),
  )

  let equiposActivos = 0
  let equiposBaja = 0
  let equiposArchivados = 0
  let equiposOperativos = 0
  let equiposConFallas = 0
  let equiposAlmacen = 0
  let equiposMantenimiento = 0
  let equiposInoperativos = 0

  for (const equipo of equipos) {
    if (equipo.situacion === 'baja') {
      equiposBaja += 1
      continue
    }
    if (equipo.situacion === 'archivado') {
      equiposArchivados += 1
      continue
    }
    if (equipo.situacion !== 'activo') continue

    equiposActivos += 1
    if (equipo.estado_operativo === 'operativo') equiposOperativos += 1
    if (equipo.estado_operativo === 'con_fallas') equiposConFallas += 1
    if (equipo.estado_operativo === 'en_almacen') equiposAlmacen += 1
    if (equipo.estado_operativo === 'en_mantenimiento') equiposMantenimiento += 1
    if (equipo.estado_operativo === 'inoperativo') equiposInoperativos += 1

    if (equipo.ambiente_id) {
      const laboratorio = laboratoriosMap.get(equipo.ambiente_id)
      if (laboratorio) laboratorio.cantidad += 1
    }
  }

  const mantenimientos = puedeVerMantenimientos
    ? await Promise.all([
        contarMantenimientos('pendiente'),
        contarMantenimientos('en_proceso'),
        contarMantenimientos('completado'),
      ]).then(([pendientes, enProceso, completados]) => ({
        total: pendientes + enProceso + completados,
        pendientes,
        enProceso,
        completados,
      }))
    : null

  return {
    totalEquipos: equipos.length,
    equiposActivos,
    equiposBaja,
    equiposArchivados,
    equiposOperativos,
    equiposConFallas,
    equiposAlmacen,
    equiposMantenimiento,
    equiposInoperativos,
    laboratorios: [...laboratoriosMap.values()]
      .sort((a, b) => b.cantidad - a.cantidad || a.nombre.localeCompare(b.nombre))
      .slice(0, 8),
    mantenimientos,
  }
}
