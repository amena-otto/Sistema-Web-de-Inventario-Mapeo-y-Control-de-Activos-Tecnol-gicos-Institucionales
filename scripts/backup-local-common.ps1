Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Assert-OutsideRepository([string] $Path) {
    $full = [IO.Path]::GetFullPath($Path)
    if ((Test-Path -LiteralPath $full) -and ((Get-Item -LiteralPath $full -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'No se permiten archivos enlazados.' }
    $cursor = if ([IO.File]::Exists($full)) { [IO.Path]::GetDirectoryName($full) } else { $full }
    while ($cursor) {
        if (Test-Path -LiteralPath (Join-Path $cursor '.git')) {
            throw 'Los respaldos y credenciales deben quedar fuera de cualquier repositorio Git.'
        }
        if ((Test-Path -LiteralPath $cursor) -and ((Get-Item -LiteralPath $cursor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) {
            throw 'No se permiten enlaces ni junctions en la ruta privada.'
        }
        $cursor = [IO.Path]::GetDirectoryName($cursor)
    }
    return $full
}

function New-PrivateDirectory([string] $Path) {
    $full = Assert-OutsideRepository $Path
    $sid = [Security.Principal.WindowsIdentity]::GetCurrent().User
    if (Test-Path -LiteralPath $full) {
        $existing = Get-Acl -LiteralPath $full
        $rules = @($existing.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier]))
        if (-not $existing.AreAccessRulesProtected -or @($rules | Where-Object { $_.IdentityReference -ne $sid }).Count) {
            throw 'La carpeta existente no es privada. Elige una subcarpeta nueva; no se cambian permisos de carpetas ajenas.'
        }
        return $full
    }
    [void][IO.Directory]::CreateDirectory($full)
    $acl = New-Object Security.AccessControl.DirectorySecurity
    $acl.SetAccessRuleProtection($true, $false)
    $rule = New-Object Security.AccessControl.FileSystemAccessRule($sid, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
    $acl.AddAccessRule($rule)
    Set-Acl -LiteralPath $full -AclObject $acl
    return $full
}

function Find-PostgresBin([string] $Path) {
    if (-not $Path) {
        $candidates = @(Get-ChildItem 'C:\Program Files\PostgreSQL' -Directory -ErrorAction SilentlyContinue |
            Where-Object Name -Match '^\d+$' | Sort-Object { [int]$_.Name } -Descending)
        foreach ($candidate in $candidates) {
            if (Test-Path -LiteralPath (Join-Path $candidate.FullName 'bin\pg_dump.exe')) { $Path = Join-Path $candidate.FullName 'bin'; break }
        }
    }
    foreach ($tool in @('psql', 'pg_dump', 'pg_restore', 'createdb')) {
        if (-not $Path -or -not (Test-Path -LiteralPath (Join-Path $Path "$tool.exe"))) { throw 'Instala PostgreSQL y especifica -PostgresBin con su carpeta bin.' }
    }
    return [IO.Path]::GetFullPath($Path)
}

function Find-Gpg([string] $Path) {
    if (-not $Path) {
        $command = Get-Command gpg.exe -ErrorAction SilentlyContinue
        if ($command) { $Path = $command.Source }
        else {
            foreach ($candidate in @('C:\Program Files\Git\usr\bin\gpg.exe', 'C:\Program Files (x86)\GnuPG\bin\gpg.exe', 'C:\Program Files\GnuPG\bin\gpg.exe')) {
                if (Test-Path -LiteralPath $candidate) { $Path = $candidate; break }
            }
        }
    }
    if (-not $Path -or -not (Test-Path -LiteralPath $Path)) { throw 'Instala GnuPG gratuito o especifica -GpgPath.' }
    return [IO.Path]::GetFullPath($Path)
}

# Escapado de argumentos nativos Windows; nunca se pasan claves como argumentos.
function ConvertTo-NativeArgument([string] $Value) {
    if ($Value -notmatch '[\s"]' -and $Value.Length) { return $Value }
    return '"' + ([regex]::Replace([regex]::Replace($Value, '(\\*)"', '$1$1\"'), '(\\+)$', '$1$1')) + '"'
}

function Invoke-BackupTool {
    param([string] $Tool, [string[]] $Arguments, [Security.SecureString] $InputSecret)
    $info = New-Object Diagnostics.ProcessStartInfo
    $info.FileName = $Tool
    $info.Arguments = (($Arguments | ForEach-Object { ConvertTo-NativeArgument $_ }) -join ' ')
    $info.UseShellExecute = $false
    $info.CreateNoWindow = $true
    # pg_ctl start deja un servidor hijo: no heredar tuberias que impedirian EOF.
    if ([IO.Path]::GetFileName($Tool) -eq 'pg_ctl.exe' -and $Arguments[0] -eq 'start') {
        $launcher = [Diagnostics.Process]::Start($info)
        $launcher.WaitForExit()
        $launchCode = $launcher.ExitCode
        $launcher.Dispose()
        if ($launchCode -ne 0) { throw "Fallo pg_ctl start (codigo $launchCode)." }
        return ''
    }
    $info.RedirectStandardOutput = $true
    $info.RedirectStandardError = $true
    $info.RedirectStandardInput = $true
    $info.StandardOutputEncoding = New-Object Text.UTF8Encoding($false)
    $info.StandardErrorEncoding = New-Object Text.UTF8Encoding($false)
    $process = New-Object Diagnostics.Process
    $process.StartInfo = $info
    [void]$process.Start()
    $stdout = $process.StandardOutput.ReadToEndAsync()
    $stderr = $process.StandardError.ReadToEndAsync()
    if ($InputSecret) {
        $plain = (New-Object Net.NetworkCredential('', $InputSecret)).Password
        $bytes = $null
        try {
            $bytes = [Text.Encoding]::UTF8.GetBytes($plain + "`n")
            $process.StandardInput.BaseStream.Write($bytes, 0, $bytes.Length)
        } finally {
            if ($bytes) { [Array]::Clear($bytes, 0, $bytes.Length) }
            $plain = $null
        }
    }
    $process.StandardInput.Close()
    $process.WaitForExit()
    $output = $stdout.GetAwaiter().GetResult()
    [void]$stderr.GetAwaiter().GetResult()
    $code = $process.ExitCode
    $process.Dispose()
    if ($code -ne 0) { throw "Fallo $([IO.Path]::GetFileName($Tool)) (codigo $code). No se publican argumentos ni mensajes que puedan contener datos confidenciales." }
    return $output
}

function Import-BackupConfiguration([string] $Path) {
    $full = Assert-OutsideRepository $Path
    $config = Import-Clixml -LiteralPath $full
    if ($config.Version -ne 1 -or $config.Credential -isnot [Management.Automation.PSCredential] -or $config.Passphrase -isnot [Security.SecureString]) { throw 'Configuracion privada invalida o cuenta Windows distinta.' }
    if ($config.Port -eq 6543 -or $config.Host -match '[/\s=]' -or $config.Database -match '[/\s=]') { throw 'Usa parametros PostgreSQL separados y conexion directa o pooler de sesion, nunca 6543.' }
    if ($config.SslMode -ne 'require' -and -not ($config.Host -eq '127.0.0.1' -and $config.SslMode -eq 'disable')) { throw 'Se requiere SSL para origenes remotos.' }
    if ($config.Passphrase.Length -lt 20) { throw 'La frase de cifrado requiere al menos 20 caracteres.' }
    return $config
}

function Save-PgEnvironment {
    $saved = @{}
    foreach ($item in @(Get-ChildItem Env: | Where-Object Name -Like 'PG*')) { $saved[$item.Name] = $item.Value; [Environment]::SetEnvironmentVariable($item.Name, $null, 'Process') }
    return $saved
}

function Restore-PgEnvironment($Saved) {
    foreach ($item in @(Get-ChildItem Env: | Where-Object Name -Like 'PG*')) { [Environment]::SetEnvironmentVariable($item.Name, $null, 'Process') }
    foreach ($key in $Saved.Keys) { [Environment]::SetEnvironmentVariable($key, $Saved[$key], 'Process') }
}

function Set-SourceEnvironment($Config) {
    $env:PGHOST = $Config.Host; $env:PGPORT = [string]$Config.Port
    $env:PGDATABASE = $Config.Database; $env:PGUSER = $Config.Credential.UserName
    $env:PGPASSWORD = $Config.Credential.GetNetworkCredential().Password
    $env:PGSSLMODE = $Config.SslMode; $env:PGCONNECT_TIMEOUT = '30'
    $env:PGOPTIONS = '-c default_transaction_read_only=on -c timezone=UTC'
}

function Assert-ArchiveTables([string] $List) {
    foreach ($table in @('profiles','equipos','equipos_eliminados','auditoria','ambientes','pabellones','pisos','categorias_equipos','componentes','relaciones_equipos','fotografias_equipos','mantenimientos','mantenimiento_cambios_estado','movimientos')) {
        if ($List -notmatch "(?m)TABLE DATA public $table(?:\s|$)") { throw "Respaldo incompleto: falta public.$table." }
    }
    if ($List -notmatch '(?m)TABLE DATA auth users(?:\s|$)') { throw 'Respaldo incompleto: falta auth.users.' }
}

function Remove-BackupWorkFiles([string] $Directory) {
    # Solo archivos conocidos dentro de la carpeta privada creada por esta ejecucion.
    foreach ($name in @('database.dump', 'verified.dump', 'data.sql')) {
        $file = Join-Path $Directory $name
        if (Test-Path -LiteralPath $file) { Remove-Item -LiteralPath $file }
    }
    if (Test-Path -LiteralPath $Directory) { [IO.Directory]::Delete($Directory, $false) }
}
