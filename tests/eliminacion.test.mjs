import test from 'node:test'
import assert from 'node:assert/strict'
import {
  contarArchivosPendientes,
  estadoLimpiezaDesdePendiente,
  extraerArchivosEquipo,
  normalizarListaArchivos,
  quitarArchivos,
  resumirLimpieza,
} from '../supabase/functions/_shared/eliminacion.ts'

test('extraerArchivosEquipo filtra vacíos y elimina duplicados', () => {
  const resultado = extraerArchivosEquipo([
    { ruta_storage: 'equipos/a.jpg', drive_file_id: null },
    { ruta_storage: 'equipos/a.jpg', drive_file_id: 'drive-1' },
    { ruta_storage: '  ', drive_file_id: 'drive-1' },
    { ruta_storage: null, drive_file_id: '' },
  ])

  assert.deepEqual(resultado, {
    rutasStorage: ['equipos/a.jpg'],
    driveFileIds: ['drive-1'],
  })
})

test('extraerArchivosEquipo tolera nulos y valores ausentes', () => {
  assert.deepEqual(extraerArchivosEquipo(null), {
    rutasStorage: [],
    driveFileIds: [],
  })
  assert.deepEqual(extraerArchivosEquipo(undefined), {
    rutasStorage: [],
    driveFileIds: [],
  })
})

test('normalizarListaArchivos acepta arreglos de JavaScript', () => {
  assert.deepEqual(
    normalizarListaArchivos([' drive-1 ', 'drive-2', 'drive-1', '', null]),
    ['drive-1', 'drive-2'],
  )
})

test('normalizarListaArchivos acepta JSON serializado', () => {
  assert.deepEqual(normalizarListaArchivos('["drive-1","drive-2"]'), [
    'drive-1',
    'drive-2',
  ])
})

test('normalizarListaArchivos acepta el literal de PostgreSQL', () => {
  assert.deepEqual(normalizarListaArchivos('{drive-1,"drive,2"}'), [
    'drive-1',
    'drive,2',
  ])
  assert.deepEqual(normalizarListaArchivos('{}'), [])
})

test('normalizarListaArchivos ignora valores no textuales', () => {
  assert.deepEqual(normalizarListaArchivos(null), [])
  assert.deepEqual(normalizarListaArchivos(42), [])
  assert.deepEqual(normalizarListaArchivos(undefined), [])
  assert.deepEqual(normalizarListaArchivos(''), [])
})

test('estadoLimpiezaDesdePendiente interpreta la fila de la base', () => {
  const estado = estadoLimpiezaDesdePendiente({
    rutas_storage: ['equipos/a.jpg'],
    drive_file_ids: '{drive-1,drive-2}',
    storage_limpiado: true,
    drive_limpiado: false,
  })

  assert.deepEqual(estado, {
    storageLimpiado: true,
    driveLimpiado: false,
    rutasStorage: ['equipos/a.jpg'],
    driveFileIds: ['drive-1', 'drive-2'],
  })
})

test('contarArchivosPendientes respeta las marcas de limpieza', () => {
  assert.deepEqual(
    contarArchivosPendientes({
      storageLimpiado: true,
      driveLimpiado: false,
      rutasStorage: ['equipos/a.jpg'],
      driveFileIds: ['drive-1', 'drive-2'],
    }),
    { storage: 0, drive: 2 },
  )
})

test('resumirLimpieza no advierte cuando todo está limpio', () => {
  const resumen = resumirLimpieza({
    storageLimpiado: true,
    driveLimpiado: true,
    rutasStorage: [],
    driveFileIds: [],
  })

  assert.deepEqual(resumen, {
    limpiezaCompleta: true,
    archivosPendientes: { storage: 0, drive: 0 },
    advertencia: null,
  })
})

test('resumirLimpieza advierte y cuenta los archivos pendientes', () => {
  const resumen = resumirLimpieza({
    storageLimpiado: false,
    driveLimpiado: false,
    rutasStorage: ['equipos/a.jpg'],
    driveFileIds: ['drive-1', 'drive-2'],
  })

  assert.equal(resumen.limpiezaCompleta, false)
  assert.deepEqual(resumen.archivosPendientes, { storage: 1, drive: 2 })
  assert.match(resumen.advertencia, /1 fotografía\(s\) en Supabase Storage/)
  assert.match(resumen.advertencia, /2 fotografía\(s\) en Google Drive/)
  assert.match(resumen.advertencia, /Vuelve a confirmar la eliminación/)
})

test('quitarArchivos conserva el orden y quita solo los procesados', () => {
  assert.deepEqual(
    quitarArchivos(['drive-1', 'drive-2', 'drive-3'], ['drive-2', 'drive-4']),
    ['drive-1', 'drive-3'],
  )
})
