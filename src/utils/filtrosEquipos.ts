export type AmbienteFiltrable = {
  id: string
  pabellon_id: string
  piso_id: string
  pabellon: string
  piso: string
  codigo: string
  nombre: string
}

export type SeleccionUbicacion = {
  pabellon: string
  piso: string
  ambiente: string
}

export type OpcionPabellon = { id: string; nombre: string }
export type OpcionPiso = { id: string; nombre: string }
export type OpcionAmbiente = { id: string; codigo: string; nombre: string }

const sinSeleccion: SeleccionUbicacion = {
  pabellon: '',
  piso: '',
  ambiente: '',
}

/**
 * Valida la cadena Pabellón → Piso → Ambiente. Si una selección hija es
 * válida, la cadena completa se reconstruye con sus padres reales.
 */
export function resolverSeleccionUbicacion(
  seleccion: SeleccionUbicacion,
  ambientes: readonly AmbienteFiltrable[],
): SeleccionUbicacion {
  const ambiente = seleccion.ambiente
    ? ambientes.find((item) => item.id === seleccion.ambiente)
    : undefined
  if (ambiente) {
    return {
      pabellon: ambiente.pabellon_id,
      piso: ambiente.piso_id,
      ambiente: ambiente.id,
    }
  }

  const piso = seleccion.piso
    ? ambientes.find((item) => item.piso_id === seleccion.piso)
    : undefined
  if (piso) {
    return {
      pabellon: piso.pabellon_id,
      piso: piso.piso_id,
      ambiente: '',
    }
  }

  const pabellon = seleccion.pabellon
    ? ambientes.find((item) => item.pabellon_id === seleccion.pabellon)
    : undefined
  if (pabellon) {
    return {
      pabellon: pabellon.pabellon_id,
      piso: '',
      ambiente: '',
    }
  }

  return sinSeleccion
}

export function opcionesPabellon(
  ambientes: readonly AmbienteFiltrable[],
): OpcionPabellon[] {
  const vistos = new Map<string, string>()
  for (const ambiente of ambientes) {
    if (!vistos.has(ambiente.pabellon_id)) {
      vistos.set(ambiente.pabellon_id, ambiente.pabellon)
    }
  }
  return [...vistos.entries()]
    .map(([id, nombre]) => ({ id, nombre }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
}

export function opcionesPiso(
  ambientes: readonly AmbienteFiltrable[],
  pabellonId: string,
): OpcionPiso[] {
  if (!pabellonId) return []
  const vistos = new Map<string, string>()
  for (const ambiente of ambientes) {
    if (ambiente.pabellon_id !== pabellonId) continue
    if (!vistos.has(ambiente.piso_id)) {
      vistos.set(ambiente.piso_id, ambiente.piso)
    }
  }
  return [...vistos.entries()]
    .map(([id, nombre]) => ({ id, nombre }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
}

export function opcionesAmbiente(
  ambientes: readonly AmbienteFiltrable[],
  pisoId: string,
): OpcionAmbiente[] {
  if (!pisoId) return []
  return ambientes
    .filter((ambiente) => ambiente.piso_id === pisoId)
    .map((ambiente) => ({
      id: ambiente.id,
      codigo: ambiente.codigo,
      nombre: ambiente.nombre,
    }))
    .sort((a, b) => a.codigo.localeCompare(b.codigo, 'es'))
}

/**
 * Devuelve los ambientes que se enviarán al servicio. Un ambiente concreto
 * tiene prioridad; luego el piso; luego el pabellón. `undefined` significa
 * que no se debe aplicar ningún filtro de ubicación.
 */
export function idsAmbientesDeSeleccion(
  seleccion: SeleccionUbicacion,
  ambientes: readonly AmbienteFiltrable[],
): string[] | undefined {
  const resuelta = resolverSeleccionUbicacion(seleccion, ambientes)
  if (resuelta.ambiente) return [resuelta.ambiente]
  if (resuelta.piso) {
    return ambientes
      .filter((ambiente) => ambiente.piso_id === resuelta.piso)
      .map((ambiente) => ambiente.id)
  }
  if (resuelta.pabellon) {
    return ambientes
      .filter((ambiente) => ambiente.pabellon_id === resuelta.pabellon)
      .map((ambiente) => ambiente.id)
  }
  return undefined
}

export type FiltroActivo = {
  clave: string
  etiqueta: string
}

export type EstadoFiltros = {
  busqueda: string
  estado: string
  categoria: string
  pabellon: string
  piso: string
  ambiente: string
  sinUbicacion: boolean
  ambientesDashboard: readonly string[]
}

export function contarFiltrosActivos(filtros: EstadoFiltros): number {
  return [
    filtros.busqueda.trim(),
    filtros.estado,
    filtros.categoria,
    filtros.pabellon,
    filtros.piso,
    filtros.ambiente,
    filtros.sinUbicacion ? 'sin-ubicacion' : '',
    filtros.ambientesDashboard.length ? 'dashboard' : '',
  ].filter(Boolean).length
}
