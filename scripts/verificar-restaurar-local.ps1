[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)] [string] $Archivo,
    [string] $ConfigPath = "$env:LOCALAPPDATA\InventarioInstitucional\Privado\backup-config.xml",
    [string] $PostgresBin,
    [string] $GpgPath,
    [ValidateRange(1024,65535)] [int] $RestorePort = 55439,
    [string] $RestoreUser = 'postgres',
    [Management.Automation.PSCredential] $RestoreCredential,
    [ValidateSet('AplicacionSupabase','Completo')] [string] $Modo = 'AplicacionSupabase'
)
. "$PSScriptRoot\backup-local-common.ps1"

$archive = Assert-OutsideRepository $Archivo
if (-not (Test-Path -LiteralPath $archive -PathType Leaf)) { throw 'No existe la copia cifrada.' }
$expected = ([IO.File]::ReadAllText($archive + '.sha256') -split '\s+')[0]
if ($expected -notmatch '^[a-fA-F0-9]{64}$' -or (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash -ine $expected) { throw 'Checksum incorrecto. No se descifra ni se crea una base.' }
$config = Import-BackupConfiguration $ConfigPath
$bin = Find-PostgresBin $PostgresBin
$gpg = Find-Gpg $GpgPath
$work = New-PrivateDirectory (Join-Path ([IO.Path]::GetDirectoryName($archive)) ('.verify-' + [guid]::NewGuid().ToString('N')))
$database = 'inventario_prueba_' + [guid]::NewGuid().ToString('N')
$saved = Save-PgEnvironment
$created = $false
try {
    $dump = Join-Path $work 'database.dump'
    [void](Invoke-BackupTool $gpg @('--batch','--yes','--pinentry-mode','loopback','--no-symkey-cache','--passphrase-fd','0','--decrypt','--output',$dump,$archive) $config.Passphrase)
    $list = Invoke-BackupTool (Join-Path $bin 'pg_restore.exe') @('--list',$dump)
    Assert-ArchiveTables $list
    # Comparar contra el snapshot del propio archivo, no contra produccion mutable.
    $dataFile = Join-Path $work 'data.sql'
    [void](Invoke-BackupTool (Join-Path $bin 'pg_restore.exe') @('--data-only',"--file=$dataFile",$dump))
    $counts = @{}
    $reader = [IO.File]::OpenText($dataFile)
    $table = $null
    try {
        while ($null -ne ($line = $reader.ReadLine())) {
            if ($null -ne $table) {
                if ($line -ceq '\.') { $table = $null } else { $counts[$table]++ }
            } elseif ($line -match '^COPY "?(public|auth|private|storage)"?\."?([a-z_][a-z0-9_]*)"? \(') {
                $table = $Matches[1] + '.' + $Matches[2]
                $counts[$table] = 0L
            }
        }
    } finally { $reader.Dispose() }
    if (-not $counts.ContainsKey('public.equipos') -or -not $counts.ContainsKey('auth.users')) { throw 'No se pudieron interpretar los datos COPY del respaldo.' }

    # Host fijo: nunca se restaura sobre Supabase ni sobre una DB existente.
    $env:PGHOST = '127.0.0.1'; $env:PGPORT = [string]$RestorePort
    $env:PGDATABASE = 'postgres'; $env:PGUSER = $RestoreUser
    $env:PGSSLMODE = 'disable'; $env:PGCONNECT_TIMEOUT = '10'
    $env:PGOPTIONS = '-c timezone=UTC'
    if ($RestoreCredential) {
        $env:PGUSER = $RestoreCredential.UserName
        $env:PGPASSWORD = $RestoreCredential.GetNetworkCredential().Password
    }
    $identity = Invoke-BackupTool (Join-Path $bin 'psql.exe') @('-X','-At','--no-password','-v','ON_ERROR_STOP=1','-c',"select host(inet_server_addr()) || '|' || current_database()")
    if ($identity.Trim() -ne '127.0.0.1|postgres') { throw 'La instancia de destino no es PostgreSQL local.' }
    [void](Invoke-BackupTool (Join-Path $bin 'createdb.exe') @('--no-password','--template=template0',$database))
    $created = $true
    $env:PGDATABASE = $database
    foreach ($role in @('anon','authenticated','service_role','supabase_admin','supabase_auth_admin','supabase_storage_admin','authenticator','dashboard_user')) {
        $sql = "do `$`$ begin if not exists (select 1 from pg_roles where rolname = '$role') then create role $role nologin; end if; end; `$`$;"
        [void](Invoke-BackupTool (Join-Path $bin 'psql.exe') @('-X','--no-password','-v','ON_ERROR_STOP=1','-c',$sql))
    }
    $arguments = @('--no-password',"--dbname=$database",'--no-owner','--no-privileges','--exit-on-error','--single-transaction')
    if ($Modo -eq 'AplicacionSupabase') {
        $bootstrap = 'create schema auth; create schema storage; create schema private; create schema extensions; create extension pgcrypto with schema extensions; create extension "uuid-ossp" with schema extensions; create publication supabase_realtime;'
        [void](Invoke-BackupTool (Join-Path $bin 'psql.exe') @('-X','--no-password','-v','ON_ERROR_STOP=1','-c',$bootstrap))
        foreach ($schema in @('auth','public','private','storage')) { $arguments += "--schema=$schema" }
    }
    $arguments += $dump
    [void](Invoke-BackupTool (Join-Path $bin 'pg_restore.exe') $arguments)
    foreach ($key in $counts.Keys) {
        $actual = Invoke-BackupTool (Join-Path $bin 'psql.exe') @('-X','-At','--no-password','-v','ON_ERROR_STOP=1','-c',"select count(*) from $key")
        if ([long]$actual.Trim() -ne $counts[$key]) { throw "Conteo distinto al snapshot: $key." }
    }
    $evidence = [pscustomobject]@{
        Archivo = [IO.Path]::GetFileName($archive); SHA256 = $expected.ToLowerInvariant()
        VerificadoUtc = [DateTime]::UtcNow.ToString('o'); BaseDescartable = $database
        Modo = $Modo; Estado = 'RestauracionYConteosComprobados'; Tablas = $counts
        PropietariosYPermisosOriginalesVerificados = $false; BinariosStorageDriveVerificados = $false
        ServiciosGestionadosSupabaseVerificados = $false
    }
    $evidence | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath ($archive + '.restauracion.json') -Encoding UTF8
    Write-Host "Restauracion real comprobada en $database (127.0.0.1:$RestorePort). Conteos coinciden con el snapshot."
    Write-Host 'No certifica ACL originales, servicios gestionados ni binarios Storage/Drive. La base de prueba se conserva localmente.'
    $evidence
} catch {
    if ($created) { Write-Warning "La prueba no aprobo. Se conserva exclusivamente la base local $database para diagnostico." }
    throw
} finally {
    Restore-PgEnvironment $saved
    Remove-BackupWorkFiles $work
}
