[CmdletBinding()]
param(
    [switch] $Configurar,
    [string] $ConfigPath = "$env:LOCALAPPDATA\InventarioInstitucional\Privado\backup-config.xml",
    [string] $Destino = "$env:LOCALAPPDATA\InventarioInstitucional\Respaldos",
    [string] $PostgresBin,
    [string] $GpgPath
)
. "$PSScriptRoot\backup-local-common.ps1"

if ($Configurar) {
    $configFull = Assert-OutsideRepository $ConfigPath
    if (Test-Path -LiteralPath $configFull) { throw 'La configuracion ya existe. Usa otra ruta para evitar sobrescribir credenciales.' }
    [void](New-PrivateDirectory ([IO.Path]::GetDirectoryName($configFull)))
    $sourceHost = Read-Host 'Host PostgreSQL (directo o pooler de sesion)'
    $sourcePort = [int](Read-Host 'Puerto (normalmente 5432; nunca 6543)')
    if ($sourcePort -lt 1 -or $sourcePort -gt 65535 -or $sourcePort -eq 6543 -or $sourceHost -match '[/\s=]' -or -not $sourceHost) { throw 'Host o puerto invalido.' }
    $credential = Get-Credential -Message 'Credenciales PostgreSQL: se guardaran cifradas con DPAPI fuera de Git'
    if (-not $credential) { throw 'Configuracion cancelada.' }
    $passphrase = Read-Host 'Frase de cifrado (20+ caracteres; conserva una copia offline)' -AsSecureString
    $confirm = Read-Host 'Repite la frase de cifrado' -AsSecureString
    if ($passphrase.Length -lt 20 -or (New-Object Net.NetworkCredential('', $passphrase)).Password -cne (New-Object Net.NetworkCredential('', $confirm)).Password) { throw 'Las frases no coinciden o son demasiado cortas.' }
    [pscustomobject]@{ Version = 1; Host = $sourceHost; Port = $sourcePort; Database = 'postgres'; Credential = $credential; Passphrase = $passphrase; SslMode = 'require'; Role = 'postgres' } |
        Export-Clixml -LiteralPath $configFull
    Write-Host 'Configuracion DPAPI creada. Solo esta cuenta Windows puede utilizarla. No se ha creado ni programado un respaldo.'
    return
}

$config = Import-BackupConfiguration $ConfigPath
$bin = Find-PostgresBin $PostgresBin
$gpg = Find-Gpg $GpgPath
$destination = New-PrivateDirectory $Destino
$work = New-PrivateDirectory (Join-Path $destination ('.work-' + [guid]::NewGuid().ToString('N')))
$name = 'inventario-' + [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfffZ') + '-' + [guid]::NewGuid().ToString('N').Substring(0,8) + '.dump.gpg'
$partial = Join-Path $destination ($name + '.partial')
$archive = Join-Path $destination $name
$saved = Save-PgEnvironment
try {
    Set-SourceEnvironment $config
    $clientVersion = Invoke-BackupTool (Join-Path $bin 'pg_dump.exe') @('--version')
    $serverVersion = Invoke-BackupTool (Join-Path $bin 'psql.exe') @('-X','-At','--no-password','-v','ON_ERROR_STOP=1','-c','show server_version_num')
    $clientMajor = [int]([regex]::Match($clientVersion, '(\d+)\.').Groups[1].Value)
    if ($clientMajor -lt [math]::Floor([int]$serverVersion.Trim() / 10000)) { throw 'pg_dump es anterior al servidor. Instala herramientas de version igual o posterior.' }
    $dump = Join-Path $work 'database.dump'
    $arguments = @('--no-password','--format=custom','--lock-wait-timeout=30s',"--file=$dump")
    if ($config.Role) { $arguments += "--role=$($config.Role)" }
    [void](Invoke-BackupTool (Join-Path $bin 'pg_dump.exe') $arguments)
    $list = Invoke-BackupTool (Join-Path $bin 'pg_restore.exe') @('--list', $dump)
    Assert-ArchiveTables $list
    [void](Invoke-BackupTool $gpg @('--batch','--yes','--pinentry-mode','loopback','--no-symkey-cache','--passphrase-fd','0','--symmetric','--cipher-algo','AES256','--output',$partial,$dump) $config.Passphrase)
    $verified = Join-Path $work 'verified.dump'
    [void](Invoke-BackupTool $gpg @('--batch','--yes','--pinentry-mode','loopback','--no-symkey-cache','--passphrase-fd','0','--decrypt','--output',$verified,$partial) $config.Passphrase)
    if ((Get-FileHash -LiteralPath $dump -Algorithm SHA256).Hash -cne (Get-FileHash -LiteralPath $verified -Algorithm SHA256).Hash) { throw 'El descifrado no coincide con el dump original.' }
    Move-Item -LiteralPath $partial -Destination $archive
    $hash = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
    [IO.File]::WriteAllText($archive + '.sha256', "$hash  $name`n", (New-Object Text.UTF8Encoding($false)))
    [pscustomobject]@{ Version = 1; Archivo = $name; SHA256 = $hash; CreadoUtc = [DateTime]::UtcNow.ToString('o'); PgDump = $clientVersion.Trim(); Estado = 'CifradoYDescifradoVerificados'; RestauracionComprobada = $false; IncluyeBinariosStorageDrive = $false } |
        ConvertTo-Json | Set-Content -LiteralPath ($archive + '.json') -Encoding UTF8
    Write-Host 'Copia local cifrada y descifrado verificado. Aun NO acredita restauracion ni programacion automatica.'
    [pscustomobject]@{ Archivo = $archive; SHA256 = $hash; RestauracionComprobada = $false }
} finally {
    Restore-PgEnvironment $saved
    Remove-BackupWorkFiles $work
    if (Test-Path -LiteralPath $partial) { Remove-Item -LiteralPath $partial }
}
