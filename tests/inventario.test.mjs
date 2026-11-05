import test from 'node:test'
import assert from 'node:assert/strict'
import { validarEquipo, prepararFilaImportacion, ejecutarImportacion, columnasImportacion } from '../src/utils/inventario.ts'
import { analizarCsv, normalizarCabeceraCsv, leerArchivoCsv, fechaCsvAISO, prepararCsvInventario, valoresFilaCsv } from '../src/utils/csvInventario.ts'

const catalogos = {
  categorias: [{ id: 'cat', nombre: 'Cómputo' }],
  ambientes: [{ id: 'amb', codigo: 'A101' }],
}
const valores = { nombre: 'PC', numero_serie: '0001-A', categoria: 'Computo', ambiente_codigo: 'A101', estado_operativo: 'operativo' }
const datos = { nombre: 'PC', numero_serie: '0001-A', categoria_id: 'cat', ambiente_id: 'amb', estado_operativo: 'operativo', codigo_patrimonial: null }

test('los cinco campos completos son válidos', () => {
  assert.deepEqual(validarEquipo(datos, catalogos), {})
  assert.deepEqual(columnasImportacion, ['nombre', 'numero_serie', 'categoria', 'ambiente_codigo', 'estado_operativo'])
})

for (const campo of ['nombre', 'numero_serie', 'categoria_id', 'ambiente_id', 'estado_operativo']) {
  test(`rechaza ${campo} vacío o con espacios, también en registros antiguos`, () => {
    for (const valor of ['', '   ']) assert.ok(validarEquipo({ ...datos, [campo]: valor }, catalogos)[campo])
  })
}

test('rechaza categorías y ambientes fuera del catálogo activo', () => {
  assert.ok(validarEquipo({ ...datos, categoria_id: 'inactiva' }, catalogos).categoria_id)
  assert.ok(validarEquipo({ ...datos, ambiente_id: 'inactivo' }, catalogos).ambiente_id)
})

test('resuelve categoría con tildes y el ambiente sin perder ceros de la serie', () => {
  assert.deepEqual(prepararFilaImportacion(valores, catalogos), { categoria_id: 'cat', ambiente_id: 'amb', estado_operativo: 'operativo' })
})

for (const campo of columnasImportacion) {
  test(`importación exige el valor ${campo}`, () => {
    assert.throws(() => prepararFilaImportacion({ ...valores, [campo]: '  ' }, catalogos), /obligatorio/)
  })
}

test('rechaza categoría inexistente, ambiente inválido y estado desconocido', () => {
  assert.throws(() => prepararFilaImportacion({ ...valores, categoria: 'Otra' }, catalogos), /Categoría/)
  assert.throws(() => prepararFilaImportacion({ ...valores, ambiente_codigo: 'XYZ' }, catalogos), /Ambiente/)
  assert.throws(() => prepararFilaImportacion({ ...valores, estado_operativo: 'roto' }, catalogos), /Estado/)
})

test('no elige arbitrariamente entre códigos de ambiente repetidos', () => {
  assert.throws(() => prepararFilaImportacion(valores, { ...catalogos, ambientes: [...catalogos.ambientes, { id: 'otro', codigo: 'A101' }] }), /ambiguo/)
})

test('una importación válida crea exactamente un equipo', async () => {
  const filas = []
  const creado = await ejecutarImportacion(datos, {}, async () => [], async (fila) => { filas.push(fila); return { id: 'nuevo' } })
  assert.deepEqual(creado, { id: 'nuevo' })
  assert.deepEqual(filas, [datos])
})

test('rechaza duplicados por serie y patrimonio antes de insertar', async () => {
  for (const equipo of [
    { numero_serie: datos.numero_serie, codigo_patrimonial: null },
    { numero_serie: 'diferente', codigo_patrimonial: 'PAT-1' },
  ]) {
    await assert.rejects(ejecutarImportacion({ ...datos, codigo_patrimonial: 'PAT-1' }, {}, async () => [{ ...equipo, codigo_institucional: 'INV-1' }], async () => assert.fail('No debe insertar')), /Duplicado de INV-1/)
  }
})

test('acepta series distintas aunque coincidan nombre, categoría, marca y modelo', async () => {
  assert.equal(await ejecutarImportacion(datos, {}, async () => [{ numero_serie: 'OTRA-SERIE', codigo_patrimonial: null, codigo_institucional: 'INV-2' }], async () => 'creado'), 'creado')
})

test('filas inválidas y técnicas antiguas no provocan inserciones parciales', async () => {
  await assert.rejects(ejecutarImportacion({ ...datos, ambiente_id: null }, {}, async () => assert.fail(), async () => assert.fail()), /ubicación/)
  await assert.rejects(ejecutarImportacion(datos, { Procesador: 'Intel' }, async () => assert.fail(), async () => assert.fail()), /Esta fila no se ha creado/)
})

test('fallos en detección de duplicados impiden la inserción', async () => {
  await assert.rejects(ejecutarImportacion(datos, {}, async () => { throw new Error('Sin conexión') }, async () => assert.fail()), /Sin conexión/)
})

test('CSV de Excel admite coma, punto y coma, tabulación, comillas y líneas vacías', () => {
  for (const sep of [',', ';', '\t']) {
    const csv = `\uFEFFNombre${sep}Número de serie\r\n\r\n"Equipo, oficina"${sep}0001\r\n`
    const filas = analizarCsv(csv)
    assert.deepEqual(filas[0].map(normalizarCabeceraCsv), ['nombre', 'numero_serie'])
    assert.equal(filas[1][0], 'Equipo, oficina')
    assert.equal(filas[1][1], '0001')
    assert.equal(filas[1].numeroLinea, 3)
  }
})

test('cuenta líneas físicas con celdas multilínea y rechaza comillas abiertas', () => {
  const filas = analizarCsv('a,b\n"dos\nlineas",x\nultimo,y')
  assert.equal(filas[2].numeroLinea, 4)
  assert.throws(() => analizarCsv('a,b\n"sin cierre,x'), /comillas sin cerrar/)
  assert.throws(() => analizarCsv('a,b\n"cerrada"texto,x'), /Fila 2:.*después/)
  assert.throws(() => analizarCsv('a,b\nmal"formado,x'), /Fila 2:.*comillas/)
  assert.equal(analizarCsv('a,b\n"Equipo ""A""",x')[1][0], 'Equipo "A"')
})

test('lee UTF-8, UTF-16 y Windows-1252 de Excel', async () => {
  for (const [bytes, esperado] of [
    [new TextEncoder().encode('\uFEFFCategoría'), 'Categoría'],
    [Uint8Array.from([0xff, 0xfe, 0x41, 0, 0xe1, 0]), 'Aá'],
    [Uint8Array.from([0xfe, 0xff, 0, 0x41, 0, 0xe1]), 'Aá'],
    [Uint8Array.from([0x41, 0xe1]), 'Aá'],
  ]) assert.equal(await leerArchivoCsv(new File([bytes], 'excel.csv')), esperado)
})

test('fechas opcionales ausentes y fechas antiguas válidas', () => {
  assert.equal(fechaCsvAISO(undefined), null)
  assert.equal(fechaCsvAISO('31/12/2025'), '2025-12-31')
  assert.throws(() => fechaCsvAISO('31/02/2025'), /fecha inválida/)
})

test('valida encabezados, duplicados normalizados y límite de 500 registros', () => {
  const cabecera = columnasImportacion.join(',')
  const fila = 'PC,001,Cómputo,A101,operativo'
  assert.equal(prepararCsvInventario(`${cabecera}\n${Array(500).fill(fila).join('\n')}`).filas.length, 500)
  assert.throws(() => prepararCsvInventario(`${cabecera}\n${Array(501).fill(fila).join('\n')}`), /500/)
  assert.throws(() => prepararCsvInventario('nombre,categoria,estado_operativo\nPC,Cómputo,operativo'), /numero_serie, ambiente_codigo/)
  assert.throws(() => prepararCsvInventario(`${cabecera},Número de serie\n${fila},001`), /repetidos/)
  assert.throws(() => prepararCsvInventario(cabecera), /no contiene filas/)
})

test('proceso CSV completo conserva columnas antiguas seguras y rechaza filas sin insertar', async () => {
  const csv = `${columnasImportacion.join(';')};marca;fecha_adquisicion\r\nPC;0001-A;Computo;A101;operativo;Lenovo;\r\nPC;;Computo;A101;operativo;;\r\nPC;0001-A;Computo;A101;operativo;;`
  const { cabeceras, filas } = prepararCsvInventario(csv)
  const guardadas = []
  const rechazadas = []
  for (const fila of filas) {
    try {
      const valores = valoresFilaCsv(fila, cabeceras)
      const equipo = { ...datos, ...prepararFilaImportacion(valores, catalogos), nombre: valores.nombre, numero_serie: valores.numero_serie, marca: valores.marca || null, fecha_adquisicion: fechaCsvAISO(valores.fecha_adquisicion) }
      await ejecutarImportacion(equipo, {}, async () => guardadas, async (registro) => { guardadas.push({ ...registro, codigo_institucional: 'INV-1' }) })
    } catch (error) { rechazadas.push(`Fila ${fila.numeroLinea}: ${error.message}`) }
  }
  assert.equal(guardadas.length, 1)
  assert.equal(guardadas[0].marca, 'Lenovo')
  assert.equal(guardadas[0].fecha_adquisicion, null)
  assert.match(rechazadas[0], /Fila 3:.*numero_serie/)
  assert.match(rechazadas[1], /Fila 4:.*Duplicado/)
})

test('columnas de más se rechazan y las faltantes quedan vacías para validación', () => {
  assert.throws(() => valoresFilaCsv(['a', 'b', 'c'], ['nombre', 'numero_serie']), /3 columnas/)
  assert.deepEqual(valoresFilaCsv(['a'], ['nombre', 'numero_serie']), { nombre: 'a', numero_serie: '' })
})

