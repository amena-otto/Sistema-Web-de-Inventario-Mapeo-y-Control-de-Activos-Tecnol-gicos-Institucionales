export const estadosOperativos = [
  'operativo', 'con_fallas', 'en_mantenimiento', 'inoperativo', 'en_almacen',
] as const

export const columnasImportacion = ['nombre', 'numero_serie', 'categoria', 'ambiente_codigo', 'estado_operativo'] as const

type Obligatorios = {
  nombre: string
  numero_serie: string | null
  categoria_id: string
  ambiente_id: string | null
  estado_operativo: string
}

type Catalogos = {
  categorias: { id: string; nombre: string }[]
  ambientes: { id: string; codigo: string }[]
}

export function normalizarTexto(valor: string) {
  return valor.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' ').toLowerCase()
}

// Divide la búsqueda en términos independientes y elimina caracteres que
// romperían la sintaxis de filtros de PostgREST. La lista y la exportación
// comparten esta misma regla para no mostrar resultados distintos.
export function terminosBusqueda(valor: string, maximo = 6) {
  const seguro = valor
    .replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑüÜ\s_-]/g, '')
    .trim()
  if (!seguro) return []
  return seguro.split(/\s+/).filter(Boolean).slice(0, maximo)
}

export function validarEquipo(datos: Obligatorios, catalogos?: Catalogos) {
  const errores: Partial<Record<keyof Obligatorios, string>> = {}
  if (!datos.nombre.trim()) errores.nombre = 'Ingresa el nombre del equipo.'
  if (!datos.numero_serie?.trim()) errores.numero_serie = 'Ingresa el número de serie.'
  if (!datos.categoria_id.trim()) errores.categoria_id = 'Selecciona una categoría.'
  else if (catalogos && !catalogos.categorias.some((c) => c.id === datos.categoria_id)) errores.categoria_id = 'Selecciona una categoría válida y activa.'
  if (!datos.ambiente_id?.trim()) errores.ambiente_id = 'Selecciona una ubicación institucional.'
  else if (catalogos && !catalogos.ambientes.some((a) => a.id === datos.ambiente_id)) errores.ambiente_id = 'Selecciona un ambiente válido y activo.'
  if (!estadosOperativos.some((e) => e === datos.estado_operativo)) errores.estado_operativo = 'Selecciona un estado operativo válido.'
  return errores
}

export function prepararFilaImportacion(valores: Record<string, string>, catalogos: Catalogos) {
  for (const campo of columnasImportacion) {
    if (!valores[campo]?.trim()) throw new Error(`El campo ${campo} es obligatorio.`)
  }
  const categorias = catalogos.categorias.filter((c) => normalizarTexto(c.nombre) === normalizarTexto(valores.categoria))
  if (categorias.length !== 1) throw new Error(`Categoría inexistente o ambigua: ${valores.categoria}.`)
  const ambientes = catalogos.ambientes.filter((a) => normalizarTexto(a.codigo) === normalizarTexto(valores.ambiente_codigo))
  if (ambientes.length !== 1) throw new Error(`Ambiente inválido, inactivo o ambiguo: ${valores.ambiente_codigo}.`)
  const entrada = normalizarTexto(valores.estado_operativo).replace(/ /g, '_')
  const estado = entrada === 'operativo_con_observaciones' ? 'con_fallas' : entrada
  const estadoOperativo = estadosOperativos.find((e) => e === estado)
  if (!estadoOperativo) throw new Error(`Estado no reconocido: ${valores.estado_operativo}.`)
  return { categoria_id: categorias[0].id, ambiente_id: ambientes[0].id, estado_operativo: estadoOperativo }
}

// La coincidencia descriptiva es una advertencia; una serie distinta identifica otro activo.
export function duplicadoImportacion(
  equipo: { numero_serie: string | null; codigo_patrimonial: string | null },
  serie: string,
  patrimonio: string,
) {
  return Boolean(
    (serie.trim() && equipo.numero_serie?.trim() === serie.trim()) ||
    (patrimonio.trim() && equipo.codigo_patrimonial?.trim() === patrimonio.trim()),
  )
}

export async function ejecutarImportacion<T extends Obligatorios & { codigo_patrimonial: string | null }, R>(
  datos: T,
  tecnicas: Record<string, string>,
  buscarDuplicados: () => Promise<{ codigo_institucional: string; numero_serie: string | null; codigo_patrimonial: string | null }[]>,
  crear: (datos: T) => Promise<R>,
) {
  const errores = validarEquipo(datos)
  if (Object.keys(errores).length) throw new Error(Object.values(errores).join(' '))
  // Sin una transacción de servidor, estas escrituras podrían dejar una fila parcial.
  if (Object.values(tecnicas).some((valor) => valor.trim())) {
    throw new Error('Las características técnicas deben agregarse desde la ficha del equipo después de importar. Esta fila no se ha creado.')
  }
  const duplicados = (await buscarDuplicados()).filter((equipo) => duplicadoImportacion(equipo, datos.numero_serie ?? '', datos.codigo_patrimonial ?? ''))
  if (duplicados.length) throw new Error(`Duplicado de ${duplicados.map((e) => e.codigo_institucional).join(', ')}`)
  return crear(datos)
}
