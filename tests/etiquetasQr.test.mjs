import test from 'node:test'
import assert from 'node:assert/strict'
import { ajustarDatosEtiqueta, crearFormatoEtiquetas, crearUrlFicha, dividirEnPaginas, formatoEtiquetas, ajustarTexto, crearDocumentoImpresion } from '../src/utils/etiquetasQr.ts'

const uuid = '72dbb2c0-2ff4-4fcb-8ce7-538fcf77ae5e'
const origen = 'https://inventario.example.edu.pe'

test('el enlace conserva el UUID del registro y el origen configurado', () => {
  const enlace = new URL(crearUrlFicha(uuid, ` ${origen}/ `))
  assert.equal(enlace.origin, origen)
  assert.equal(enlace.pathname, '/equipos')
  assert.equal(enlace.searchParams.get('equipo'), uuid)
  assert.equal([...enlace.searchParams].length, 1)
})

test('no genera etiquetas con un dominio ausente, HTTP, localhost o credenciales', () => {
  for (const configuracion of [undefined, '', 'http://example.edu.pe', 'https://localhost', 'https://app.localhost', 'https://user:clave@example.edu.pe', `${origen}/ruta`, `${origen}?token=privado`, `${origen}#ruta`]) assert.throws(() => crearUrlFicha(uuid, configuracion))
})

for (const cantidad of [1, 12, 15, 16, 30, 31, 100]) {
  test(`distribuye ${cantidad} etiquetas sin perder ni repetir registros`, () => {
    const registros = Array.from({ length: cantidad }, (_, indice) => indice)
    const paginas = dividirEnPaginas(registros)
    assert.equal(paginas.length, Math.ceil(cantidad / formatoEtiquetas.porPagina))
    assert.ok(paginas.every((pagina) => pagina.length <= formatoEtiquetas.porPagina))
    assert.deepEqual(paginas.flat(), registros)
  })
}

test('tres columnas y cinco filas caben en A4 con márgenes uniformes', () => {
  const f = formatoEtiquetas
  assert.equal(f.columnas * f.anchoMm + (f.columnas - 1) * f.separacionHorizontalMm + 2 * f.margenHorizontalMm, f.hojaAnchoMm)
  assert.equal(f.filas * f.altoMm + (f.filas - 1) * f.separacionVerticalMm + 2 * f.margenVerticalMm, f.hojaAltoMm)
})

for (const [alto, filas, capacidad] of [[35, 5, 15], [40, 4, 12], [45, 4, 12]]) {
  test(`altura ${alto} mm recalcula filas, márgenes y saltos de página`, () => {
    const formato = crearFormatoEtiquetas(alto)
    assert.equal(formato.filas, filas)
    assert.equal(formato.porPagina, capacidad)
    assert.equal(formato.contenidoAltoMm + 2 * formato.margenVerticalMm, 210)
    assert.deepEqual(dividirEnPaginas(Array(capacidad + 1).fill('etiqueta'), formato).map((hoja) => hoja.length), [capacidad, 1])
  })
}

test('nombre y código quedan consecutivos y fuera de las ondas', () => {
  for (const nombre of ['Laptop', 'Estación de trabajo de laboratorio '.repeat(6).slice(0, 200), 'W'.repeat(200)]) {
    const ajuste = ajustarDatosEtiqueta(nombre, 'INV-2026-001', 420, (texto, tamano) => texto.length * tamano * 0.7)
    const finNombre = ajuste.nombreY + ajuste.nombre.lineas.length * ajuste.nombre.interlineado
    assert.equal(ajuste.codigoY - finNombre, 12)
    assert.ok(ajuste.codigoY + ajuste.codigo.lineas.length * ajuste.codigo.interlineado <= 341)
    assert.equal(ajuste.nombre.lineas.join('').replace(/\s/g, ''), `NOMBRE:${nombre}`.replace(/\s/g, ''))
  }
  assert.throws(() => crearFormatoEtiquetas(100), /altura/)
})

test('ajusta nombres largos y códigos continuos sin truncar el contenido', () => {
  for (const texto of ['Equipo de laboratorio de computación con estación de trabajo y accesorios '.repeat(3).slice(0, 200), 'CODIGO'.repeat(12), 'W'.repeat(200)]) {
    const ajuste = ajustarTexto(texto, 610, 195, 36, 22, (valor, tamano) => valor.length * tamano * 0.8)
    assert.equal(ajuste.lineas.join('').replace(/\s/g, ''), texto.replace(/\s/g, ''))
    assert.ok(ajuste.lineas.every((linea) => linea.length * ajuste.tamano * 0.8 <= 610))
    assert.ok(ajuste.lineas.length * ajuste.interlineado <= 195)
  }
  assert.throws(() => ajustarTexto('W'.repeat(5000), 610, 76, 34, 22, (texto, tamano) => texto.length * tamano), /espacio legible/)
})

test('HTML de impresión genera hojas explícitas y escapa nombres y códigos', () => {
  const etiquetas = Array.from({ length: 16 }, (_, indice) => ({ id: String(indice), nombre: '<script>alert(1)</script>', codigo_institucional: 'A"&B', url: crearUrlFicha(uuid, origen), imagen: 'data:image/png;base64,AAAA' }))
  const html = crearDocumentoImpresion(etiquetas)
  assert.equal((html.match(/class="hoja"/g) ?? []).length, 2)
  assert.equal((html.match(/class="etiqueta"/g) ?? []).length, 16)
  assert.ok(html.includes('@page { size: A4 landscape; margin: 11.5mm 9.5mm; }'))
  assert.ok(html.includes('break-inside: avoid'))
  assert.ok(html.includes('outline: 0.2mm dashed #64748b'))
  assert.ok(!html.includes('<script>'))
  assert.ok(html.includes('&lt;script&gt;'))
  assert.throws(() => crearDocumentoImpresion([{ ...etiquetas[0], imagen: '" onerror="alert(1)' }]), /PNG válida/)
  assert.throws(() => crearDocumentoImpresion([]), /al menos/)
})
