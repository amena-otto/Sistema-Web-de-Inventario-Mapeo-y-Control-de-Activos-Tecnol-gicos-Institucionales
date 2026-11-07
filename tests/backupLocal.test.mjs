import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const root = new URL('../', import.meta.url)
test('GitHub solo prueba datos ficticios, sin almacenamiento ni secretos de respaldo', () => {
  const workflow = readFileSync(new URL('.github/workflows/backup-postgres.yml', root), 'utf8')
  assert.doesNotMatch(workflow, /R2_|AWS_|secrets\.|upload-artifact|schedule:/)
  assert.match(workflow, /test-backup-local\.ps1/)
})

test('PowerShell rechaza sintaxis invalida y rutas de respaldo dentro del repositorio', { skip: process.platform !== 'win32' }, () => {
  const script = `
    $ErrorActionPreference = 'Stop'
    Get-ChildItem scripts/*local*.ps1 | ForEach-Object {
      $tokens = $null; $errors = $null
      [void][System.Management.Automation.Language.Parser]::ParseFile($_.FullName, [ref]$tokens, [ref]$errors)
      if ($errors.Count) { throw $errors[0] }
    }
    . ./scripts/backup-local-common.ps1
    $rejected = $false
    try { Assert-OutsideRepository (Join-Path (Get-Location) 'secreto.dump') | Out-Null } catch { $rejected = $true }
    if (-not $rejected) { throw 'Permite respaldos dentro del repositorio' }
    if ((ConvertTo-NativeArgument 'ruta con espacios') -cne '"ruta con espacios"') { throw 'Escapado incorrecto' }
  `
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
})
