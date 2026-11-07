import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const workflow = readFileSync(
  new URL('../.github/workflows/backup-postgres.yml', import.meta.url),
  'utf8',
)

test('el respaldo espera un bloqueo y no falla de inmediato', () => {
  assert.match(workflow, /--lock-wait-timeout=30s/)
})

test('el respaldo verifica tablas críticas con un patrón exacto', () => {
  assert.match(workflow, /TABLE DATA public \$\{tabla\}\(\[\[:space:\]\]\|\$\)/)
  assert.match(workflow, /equipos_eliminados/)
  assert.match(workflow, /mantenimiento_cambios_estado/)
  assert.ok(!workflow.includes('TABLE DATA public ${tabla}\\b'))
})

test('el checksum usa el formato estándar con el nombre remoto', () => {
  assert.match(workflow, /printf '%s  %s\\n' "\$hash_cifrado" "\$object_name"/)
  assert.ok(!workflow.includes("sha256sum \"$encrypted\" | awk '{print $1}' > \"$checksum\""))
})

test('el respaldo comprueba el tamaño real del objeto remoto', () => {
  assert.match(workflow, /ContentLength/)
  assert.match(workflow, /tamano_remoto/)
  assert.match(workflow, /tamano_checksum/)
})

test('el respaldo vuelve a verificar las tablas después de descifrar', () => {
  assert.match(
    workflow,
    /--decrypt --output "\$verified_dump" "\$encrypted"[\s\S]*verificar_tablas "\$restore_list"/,
  )
})
