# Prueba de integracion: todos los datos y claves se generan aqui, son ficticios.
[CmdletBinding()]
param([string] $PostgresBin, [string] $GpgPath)
. "$PSScriptRoot\backup-local-common.ps1"
$bin = Find-PostgresBin $PostgresBin
$gpg = Find-Gpg $GpgPath
$root = New-PrivateDirectory (Join-Path ([IO.Path]::GetTempPath()) ('inventario-backup-test-' + [guid]::NewGuid().ToString('N')))
$data = Join-Path $root 'pgdata'
$listener = New-Object Net.Sockets.TcpListener([Net.IPAddress]::Loopback, 0)
$listener.Start(); $port = $listener.LocalEndpoint.Port; $listener.Stop()
$saved = Save-PgEnvironment
$started = $false
try {
    [void](Invoke-BackupTool (Join-Path $bin 'initdb.exe') @('-D',$data,'-A','trust','-U','postgres','--no-locale','--encoding=UTF8'))
    [void](Invoke-BackupTool (Join-Path $bin 'pg_ctl.exe') @('start','-D',$data,'-l',(Join-Path $root 'postgres.log'),'-o',"-p $port -h 127.0.0.1",'-w'))
    $started = $true
    $env:PGHOST = '127.0.0.1'; $env:PGPORT = [string]$port; $env:PGUSER = 'postgres'; $env:PGDATABASE = 'postgres'
    $sql = 'create schema auth; create schema private; create schema storage; create table auth.users(id uuid primary key);'
    $sql += "insert into auth.users values ('11111111-1111-4111-8111-111111111111');"
    foreach ($table in @('profiles','equipos','equipos_eliminados','auditoria','ambientes','pabellones','pisos','categorias_equipos','componentes','relaciones_equipos','fotografias_equipos','mantenimientos','mantenimiento_cambios_estado','movimientos')) {
        $sql += "create table public.$table(id integer primary key, detalle text); insert into public.$table values (1, E'Prueba ficticia\nsegunda linea');"
    }
    [void](Invoke-BackupTool (Join-Path $bin 'psql.exe') @('-X','-v','ON_ERROR_STOP=1','-c',$sql))
    $configFile = Join-Path $root 'backup-config.xml'
    $password = ConvertTo-SecureString 'Clave ficticia solo para esta prueba' -AsPlainText -Force
    [pscustomobject]@{ Version = 1; Host = '127.0.0.1'; Port = $port; Database = 'postgres'; Credential = (New-Object Management.Automation.PSCredential('postgres', $password)); Passphrase = $password; SslMode = 'disable'; Role = '' } |
        Export-Clixml -LiteralPath $configFile
    $copy = & "$PSScriptRoot\backup-postgres-local.ps1" -ConfigPath $configFile -Destino (Join-Path $root 'copias') -PostgresBin $bin -GpgPath $gpg
    if ($copy.RestauracionComprobada -ne $false) { throw 'No debe afirmar restauracion durante el respaldo.' }
    $second = & "$PSScriptRoot\backup-postgres-local.ps1" -ConfigPath $configFile -Destino (Join-Path $root 'copias') -PostgresBin $bin -GpgPath $gpg
    if ($second.Archivo -eq $copy.Archivo) { throw 'Dos copias no deben sobrescribirse.' }
    $verified = & "$PSScriptRoot\verificar-restaurar-local.ps1" -Archivo $copy.Archivo -ConfigPath $configFile -PostgresBin $bin -GpgPath $gpg -RestorePort $port
    if ($verified.Tablas['public.equipos'] -ne 1 -or $verified.Tablas['auth.users'] -ne 1) { throw 'Conteos restaurados incorrectos.' }
    $invalidConfigFile = Join-Path $root 'backup-config-invalid.xml'
    $invalid = Import-Clixml -LiteralPath $configFile
    $invalid.Passphrase = ConvertTo-SecureString 'Frase incorrecta solo para esta prueba' -AsPlainText -Force
    $invalid | Export-Clixml -LiteralPath $invalidConfigFile
    $rejected = $false
    try { & "$PSScriptRoot\verificar-restaurar-local.ps1" -Archivo $second.Archivo -ConfigPath $invalidConfigFile -PostgresBin $bin -GpgPath $gpg -RestorePort $port | Out-Null }
    catch { if ($_.Exception.Message -match 'Fallo gpg') { $rejected = $true } else { throw } }
    if (-not $rejected) { throw 'No rechazo una clave de cifrado incorrecta.' }
    $invalid.Port = 6543
    $invalid | Export-Clixml -LiteralPath $invalidConfigFile
    $rejected = $false
    try { & "$PSScriptRoot\backup-postgres-local.ps1" -ConfigPath $invalidConfigFile -Destino (Join-Path $root 'copias') -PostgresBin $bin -GpgPath $gpg | Out-Null }
    catch { if ($_.Exception.Message -match '6543') { $rejected = $true } else { throw } }
    if (-not $rejected) { throw 'No rechazo el pooler transaccional.' }
    $rejected = $false
    $bytes = [IO.File]::ReadAllBytes($copy.Archivo)
    $bytes[20] = $bytes[20] -bxor 1
    [IO.File]::WriteAllBytes($copy.Archivo, $bytes)
    try { & "$PSScriptRoot\verificar-restaurar-local.ps1" -Archivo $copy.Archivo -ConfigPath $configFile -PostgresBin $bin -GpgPath $gpg -RestorePort $port | Out-Null }
    catch { if ($_.Exception.Message -match 'Checksum incorrecto') { $rejected = $true } else { throw } }
    if (-not $rejected) { throw 'No rechazo el archivo alterado.' }
    $rejected = $false
    try { Assert-OutsideRepository (Join-Path $PSScriptRoot 'copia-confidencial.dump.gpg') | Out-Null } catch { $rejected = $true }
    if (-not $rejected) { throw 'Permite guardar copias dentro de Git.' }
    $temporaries = @(Get-ChildItem -LiteralPath (Join-Path $root 'copias') -Directory)
    if ($temporaries.Count) { throw 'Quedaron carpetas de trabajo con archivos descifrados.' }
    Write-Host 'PASS: cifrado/descifrado, restauracion real y conteos, rechazo de alteraciones, rutas privadas y limpieza de plaintext.'
    Write-Host "Datos exclusivamente ficticios; carpeta de prueba: $root"
} finally {
    if ($started) { [void](Invoke-BackupTool (Join-Path $bin 'pg_ctl.exe') @('stop','-D',$data,'-m','fast','-w')) }
    Restore-PgEnvironment $saved
}
