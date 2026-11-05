import { normalizarTexto } from './inventario.ts'

export const etiquetasEstadoUbicacion: Record<string, string> = {
  operativo: 'Operativo',
  con_fallas: 'Con observaciones',
  en_mantenimiento: 'En mantenimiento',
  inoperativo: 'Inoperativo',
  en_almacen: 'En almacén',
}

type EquipoBuscable = {
  codigo_institucional: string
  nombre: string
  numero_serie: string | null
  marca: string | null
  modelo: string | null
  estado_operativo: string
  situacion: string
  ambiente_id: string | null
}

export function filtrarEquiposUbicacion<T extends EquipoBuscable>(
  equipos: readonly T[], busqueda: string, ambienteId: string, ambientesDelPiso: readonly string[],
): T[] {
  const ambientesPermitidos = new Set(ambientesDelPiso)
  const terminos = normalizarTexto(busqueda).split(' ').filter(Boolean)
  return equipos.filter((equipo) => {
    if (equipo.situacion !== 'activo' || !equipo.ambiente_id || !ambientesPermitidos.has(equipo.ambiente_id)) return false
    if (ambienteId && equipo.ambiente_id !== ambienteId) return false
    const texto = normalizarTexto([
      equipo.codigo_institucional, equipo.nombre, equipo.numero_serie ?? '',
      equipo.marca ?? '', equipo.modelo ?? '', equipo.estado_operativo,
      equipo.estado_operativo.replace(/_/g, ' '), etiquetasEstadoUbicacion[equipo.estado_operativo] ?? '',
    ].join(' '))
    return terminos.every((termino) => texto.includes(termino))
  })
}
