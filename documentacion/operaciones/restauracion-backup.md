# Respaldo local cifrado para Windows, sin servicios de pago

Este procedimiento usa PostgreSQL, GnuPG y el Programador de tareas de Windows.
No requiere R2, cuenta de almacenamiento, tarjeta ni suscripcion. No sube archivos
ni credenciales a GitHub. No esta programado por instalar los scripts: primero hay
que crear una copia, restaurarla y comprobar posteriormente la tarea programada.

## Herramientas gratuitas

- Windows PowerShell 5.1 o PowerShell 7 en Windows.
- Herramientas PostgreSQL instaladas, incluyendo pg_dump, pg_restore, psql y createdb.
  pg_dump debe tener version mayor igual que el servidor. Para pruebas locales,
  usar tambien servidor de version igual o posterior a las herramientas que generan el dump.
- GnuPG de [Gpg4win](https://gpg4win.org/index.html),
  [instalador oficial](https://gnupg.org/download/index.html), o gpg incluido en Git para Windows.
- Una instancia PostgreSQL local descartable, para restauracion. No usar Supabase
  como destino ni una instancia local que contenga trabajo importante.

Referencias: [pg_dump](https://www.postgresql.org/docs/17/app-pgdump.html),
[Programador de tareas](https://learn.microsoft.com/en-us/powershell/module/scheduledtasks/new-scheduledtaskprincipal).

## 1. Configurar una sola vez

Desde la raiz del repositorio:

```powershell
.\scripts\backup-postgres-local.ps1 -Configurar
```

Los campos se solicitan interactivamente. Usar host de conexion directa o pooler
**de sesion**, puerto 5432; nunca el pooler transaccional 6543. Indicar el usuario
PostgreSQL correspondiente al host, no una cuenta de acceso a la web del inventario.
No pegar URLs ni claves en comandos, historial, .env versionados o archivos del repo.
La conexion remota exige SSL y se opera en modo de solo lectura. El script usa SET ROLE
postgres para poder incluir Auth; si los permisos son insuficientes, falla en lugar de
producir una copia incompleta. Un usuario tecnico necesita acceso administrativo de
respaldo autorizado; no elevar ni cambiar permisos de produccion desde este procedimiento.

Elegir una frase de cifrado de al menos 20 caracteres y guardarla tambien en un
medio institucional offline seguro. Las credenciales y la frase se guardan con DPAPI
en `%LOCALAPPDATA%\InventarioInstitucional\Privado\backup-config.xml`, con ACL solo
para la cuenta Windows actual. Cambiar de cuenta o perder su perfil puede impedir
abrir ese archivo: conservar la frase offline es indispensable para recuperar el .gpg.
La configuracion no sobrescribe archivos existentes; para rotarla usar otro ConfigPath.

Nunca activar transcripciones de PowerShell ni imprimir objetos de configuracion o
variables de entorno que contengan claves. El cifrado protege la copia guardada;
la cuenta Windows que ejecuta el procedimiento puede acceder a los datos.

## 2. Crear una copia local

```powershell
$copia = .\scripts\backup-postgres-local.ps1
$copia.Archivo
```

Por defecto se guarda fuera de Git en
`%LOCALAPPDATA%\InventarioInstitucional\Respaldos`.
El nombre incorpora fecha UTC e identificador unico. Se genera:

- `.dump.gpg`: archivo PostgreSQL custom completo cifrado con AES256.
- `.dump.gpg.sha256`: checksum SHA256 del cifrado.
- `.dump.gpg.json`: version, fecha y estado **CifradoYDescifradoVerificados**.

Se verifican tablas institucionales y auth.users, y se compara el dump original
con su descifrado antes de marcar la copia como creada. Los dumps sin cifrar se
crean en una carpeta temporal privada y se retiran en finally. Si se interrumpe
abruptamente Windows, revisar carpetas .work-* o .verify-* antes de compartir discos.
No se promete borrado irrecuperable de datos en disco.

**Este resultado todavia NO acredita restauracion ni automatizacion.** No sustituye
el paso siguiente. Los scripts rechazan cualquier destino dentro de un repositorio,
enlaces/junctions y carpetas existentes sin permisos privados. No cambian permisos
de carpetas ajenas. Para otro disco, elegir una subcarpeta nueva y usarla siempre:

```powershell
$copia = .\scripts\backup-postgres-local.ps1 -Destino 'E:\InventarioPrivado\Respaldos'
```

No hay borrado automatico por antiguedad. Revisar espacio y conservar varias copias
verificadas. Copiar cifrado y checksum a un disco externo institucional existente,
desconectarlo y guardarlo aparte. Una unica copia en el mismo PC no protege contra
perdida del equipo, averia, incendio o ransomware. No es obligatorio contratar almacenamiento.

## 3. Restaurar y verificar en PostgreSQL local

Usar una instancia PostgreSQL local descartable activa. El ejemplo usa puerto 5432;
si se preparo otra instancia, indicar su puerto. La credencial es exclusivamente
**del PostgreSQL local**, distinta de la configuracion de Supabase:

```powershell
$adminLocal = Get-Credential -UserName 'postgres' -Message 'Administrador de la instancia LOCAL descartable'
.\scripts\verificar-restaurar-local.ps1 -Archivo $copia.Archivo -RestorePort 5432 -RestoreCredential $adminLocal
Remove-Variable adminLocal
```

Para una copia previa, sustituir Archivo por una ruta local absoluta al .dump.gpg;
conservar al lado su .sha256. ConfigPath y la cuenta Windows deben ser los utilizados
para crear la copia. El verificador no consulta Supabase: solo usa la frase local.

El destino esta fijado a 127.0.0.1. Se crea una base nueva con nombre aleatorio
`inventario_prueba_*`; no admite un nombre de base existente, no ejecuta DROP ni
--clean, y no restaura en la base postgres de administracion. Se necesita un rol
local que pueda crear bases y roles. Los roles Supabase ausentes se crean NOLOGIN
solo en esa instancia local; no se alteran roles preexistentes.

El modo predeterminado AplicacionSupabase restaura auth/public/private/storage,
prepara pgcrypto, uuid-ossp y la publicacion supabase_realtime, y compara los conteos
de todas las tablas COPY reconocidas en esos esquemas con el snapshot del propio
archivo, incluyendo tablas vacias. El dump contiene mas esquemas; Vault, Realtime
como servicio, Auth como servicio y otras extensiones gestionadas necesitan su propio
entorno compatible. No se afirma que la adaptacion local recupere esos servicios.

Si se necesita probar todos los objetos y el destino tiene sus extensiones:

```powershell
.\scripts\verificar-restaurar-local.ps1 -Archivo $copia.Archivo -RestorePort 5432 -RestoreCredential (Get-Credential postgres) -Modo Completo
```

Este modo falla ante cualquier incompatibilidad; nunca convierte una restauracion
parcial en exito. Ambos modos usan --no-owner y --no-privileges: **no certifican los
propietarios ni ACL originales**. La presencia de politicas RLS no reemplaza probar
permisos por rol en un entorno compatible. El archivo custom original conserva sus
metadatos; el procedimiento de recuperacion completa debe validar tambien esos permisos.

Solo tras restauracion SQL y conteos correctos aparece
`.dump.gpg.restauracion.json`, vinculado al SHA256 de esa copia. Registrar tambien
UUID, codigos, series y recorridos funcionales para una recuperacion institucional
completa. Se conserva la base de prueba para inspeccion; los archivos descifrados
temporales se retiran. Eliminar manualmente solo esa base ficticia tras revisarla.
No subir bases, dumps, credenciales ni reportes institucionales a GitHub o sus artifacts.

## 4. Programar sin pagar servicios

Primero completar los pasos 1-3 con la misma cuenta Windows que ejecutara la tarea.
La siguiente orden REGISTRA una tarea diaria local a las 18:00, hora del equipo.
Ejecutarla es una decision administrativa; el repositorio no la registra solo.

```powershell
$scriptRespaldo = (Resolve-Path '.\scripts\backup-postgres-local.ps1').Path
$usuarioRespaldo = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$accionRespaldo = New-ScheduledTaskAction -Execute "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -Argument ('-NoProfile -NonInteractive -File "{0}"' -f $scriptRespaldo)
$horarioRespaldo = New-ScheduledTaskTrigger -Daily -At '18:00'
$identidadRespaldo = New-ScheduledTaskPrincipal -UserId $usuarioRespaldo -LogonType Interactive -RunLevel Limited
$opcionesRespaldo = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 2)
Register-ScheduledTask -TaskName 'Inventario-RespaldoLocal' -Action $accionRespaldo -Trigger $horarioRespaldo -Principal $identidadRespaldo -Settings $opcionesRespaldo -Description 'Copia PostgreSQL cifrada LOCAL; requiere verificacion de restauracion independiente'
Start-ScheduledTask -TaskName 'Inventario-RespaldoLocal'
```

Este ejemplo usa los destinos predeterminados. Para un destino distinto, agregar
`-Destino` y `-ConfigPath` a los argumentos de la tarea, con rutas entre comillas,
**nunca claves**. No usar SYSTEM: DPAPI corresponde a la cuenta que configuro el respaldo.
La tarea Interactive requiere que esa cuenta tenga sesion iniciada; la PC debe estar
encendida, con red y espacio. StartWhenAvailable no crea copias durante un apagado.
Si se requiere ejecutar sin sesion, configurarlo en la interfaz del Programador,
con la misma cuenta y su credencial Windows gestionada por el sistema; comprobar
DPAPI, red y rutas mediante una ejecucion real antes de darlo por operativo.
No desactivar globalmente la politica de ejecucion; seguir la politica institucional
de scripts firmados o desbloqueados y probar tambien en modo NonInteractive.

Comprobar al terminar (no basta registrar la tarea):

```powershell
Get-ScheduledTaskInfo -TaskName 'Inventario-RespaldoLocal' | Select-Object LastRunTime,LastTaskResult,NextRunTime
$ultimaCopia = Get-ChildItem "$env:LOCALAPPDATA\InventarioInstitucional\Respaldos" -Filter '*.dump.gpg' | Sort-Object LastWriteTime -Descending | Select-Object -First 1
.\scripts\verificar-restaurar-local.ps1 -Archivo $ultimaCopia.FullName -RestorePort 5432 -RestoreCredential (Get-Credential postgres)
```

Exigir LastTaskResult=0, fecha reciente, checksum valido y restauracion comprobada
para ese mismo archivo; habilitar/revisar historial del Programador. Repetir la
restauracion periodicamente y despues de cambios de esquema o herramientas. Aun
con tarea operativa no hay proteccion completa de archivos externos ni del PC.
Este cambio no registra ninguna tarea ni acredita un calendario institucional activo.

## 5. Fotografias y archivos independientes

pg_dump **no contiene los binarios** de Supabase Storage ni Google Drive.
Descargar por separado los buckets institucionales y exportar/copiar las carpetas
autorizadas de Drive a un medio local institucional, conservando rutas e IDs para
reconciliar con fotografias_equipos. No borrar ni mover originales para respaldarlos.
Tambien hay que verificar que esas copias independientes pueden abrirse y recuperarse;
no se realizaron exportaciones de esos archivos en este cambio. Un respaldo SQL
correcto no demuestra que todas las fotografias sean recuperables.

## 6. GitHub y pruebas del procedimiento

El workflow backup-postgres.yml ahora solo ejecuta scripts con datos ficticios en
Windows. No tiene schedule, secretos de produccion, AWS/R2 ni pasos upload-artifact.
Las cinco dependencias retiradas son R2_ACCOUNT_ID, R2_BUCKET_NAME,
R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY y BACKUP_ENCRYPTION_PASSPHRASE.
Tampoco necesita SUPABASE_DB_URL en Actions. Si esos secretos existen en Settings,
un administrador puede retirarlos tras comprobar que ningun otro workflow los usa;
ninguno se copia a archivos ni se recupera su valor desde GitHub.

```powershell
.\scripts\test-backup-local.ps1
```

Esta prueba crea su propia instancia temporal PostgreSQL en loopback, usa datos y
claves ficticias, verifica cifrado, restauracion y conteos, rechazo de corrupcion y
rutas dentro de Git, y detiene la instancia al terminar. No toca Supabase ni acredita
una copia reciente de produccion. Los antiguos respaldos locales del 7 de noviembre
siguen siendo archivos privados fuera del repo; no se los presenta como calendario activo.
