# Fase 11: pruebas, seguridad y respaldos

## Estado y alcance de las verificaciones

Este repositorio no tiene un ejecutor de pruebas automatizadas de interfaz ni credenciales de una base aislada. Por eso, las pruebas que crean o modifican datos deben ejecutarse en staging, nunca en producción. No se deben marcar como aprobadas hasta guardar evidencia de una ejecución real.

| Área | Estado | Cómo verificar |
|---|---|---|
| Compilación y tipos TypeScript | Automatizable | `npm ci` y `npm run build` |
| Reglas ESLint | Automatizable | `npm run lint` |
| CRUD, búsqueda, filtros, estados y totales | Pendiente en staging | Seguir la matriz funcional de abajo |
| Ubicaciones e historial de movimientos | Pendiente en staging | Cambiar ubicación y comprobar el historial |
| Mantenimientos | Pendiente en staging | Crear, editar y comprobar el historial |
| QR | Pendiente en staging | Abrir el QR, seguir el enlace `.dev` e imprimir |
| Permisos por rol | Pendiente en staging | Iniciar sesión con un usuario de cada rol |
| RLS de PostgreSQL y Storage | Pendiente en staging | Ejecutar `supabase/tests/rls.sql` |
| Importación CSV | Pendiente en staging | Probar la plantilla, filas incompletas, fechas erróneas y duplicados |
| Interfaz móvil | Pendiente de comprobación manual | Usar la matriz de dispositivos/navegadores |
| Errores de red y datos inválidos | Pendiente en staging | Confirmar mensajes visibles y que la pantalla siga operativa |
| Respaldo externo automático | Requiere configurar secretos | Completar la configuración de GitHub Actions y R2 |
| Restauración documentada | Pendiente de ejecutar | Restaurar un respaldo en un proyecto Supabase aislado |
| Consumo del plan gratuito | Pendiente de medir | Revisar uso de base, almacenamiento, egreso y funciones en Supabase |

El flujo de CI ejecuta lint y build en cada pull request y en cada push a `main`. No sustituye pruebas funcionales ni una revisión del servicio real.

## Prueba funcional en staging

Preparar datos descartables, un usuario activo de cada rol (`admin`, `tecnico`, `consulta`) y anotar fecha, navegador, resolución, usuario/rol, resultado y evidencia sin datos personales.

1. **Equipos:** crear un equipo con datos válidos, volver a abrirlo, editarlo y comprobar que los cambios persisten. Verificar que un registro incompleto presenta un error legible.
2. **Búsqueda y filtros:** buscar por código, nombre y serie; combinar categoría, ubicación y estado; limpiar filtros; comprobar que la tabla, paginación y totales coinciden con los resultados.
3. **Estados:** comparar los conteos del dashboard con el inventario filtrado, incluidos equipos en mantenimiento, almacén, baja y archivados.
4. **Ubicación e historial:** cambiar la ubicación desde el flujo normal de movimientos; confirmar que el equipo queda en el ambiente esperado y que el movimiento anterior y nuevo permanecen en el historial.
5. **Mantenimientos:** registrar, modificar y cerrar un mantenimiento; comprobar equipo, fechas, estado, responsable e historial.
6. **QR e impresión:** generar y leer un QR con cámara y desde pantalla; validar que el destino no sea `localhost`; revisar vista e impresión en una página.
7. **Roles:** `admin` gestiona usuarios y catálogos; `tecnico` opera equipos y mantenimientos según sus permisos; `consulta` solo lee las áreas permitidas. Probar también la URL directa de cada módulo.
8. **Importación:** descargar la plantilla; importar una fila válida, una fila incompleta, una fecha imposible, categoría/ambiente inexistente y un duplicado. Revisar el resultado por fila y confirmar que no se dupliquen registros.
9. **Errores:** desconectar la red o usar datos inválidos; verificar que las operaciones fallidas informen el error, no indiquen éxito y permitan continuar.
10. **Móvil y escritorio:** repetir navegación, filtros, modales, tabla, importación y QR en un escritorio y en un móvil (o emulación), con anchuras de 360, 390 y 768 px.

No usar registros reales ni cuentas con privilegios de producción para estas pruebas.

## Pruebas RLS

El script `supabase/tests/rls.sql` cubre acceso anónimo y los roles `admin`, `tecnico` y `consulta`, incluyendo equipos, perfiles, catálogos, mantenimientos, movimientos, fotografías, marcadores y autoría. Debe ejecutarse completo desde SQL Editor en un proyecto de staging que tenga el mismo esquema/migraciones y al menos un usuario activo por rol.

El script crea fixtures y hace pruebas de escritura dentro de bloques PL/pgSQL que revierten sus cambios al terminar. Aun así, no ejecutarlo en producción: requiere privilegios SQL y puede fallar si el esquema de staging no coincide. Revisar que el resultado no contenga filas `FALLA`; un error de ejecución no equivale a una prueba aprobada.

## Respaldo automático fuera de Supabase

La acción `.github/workflows/backup-postgres.yml` está preparada para ejecutar un `pg_dump` PostgreSQL diario a las 08:00 UTC (03:00 en Perú) y bajo demanda. Verifica que el dump pueda listarse, cifra el archivo con AES-256 y lo envía a un bucket Cloudflare R2 mediante S3 API. El repositorio no contiene las credenciales ni el respaldo.

Antes de habilitarla:

1. Crear en Cloudflare R2 un bucket privado dedicado al respaldo; configurar una regla de ciclo de vida para eliminar objetos del prefijo `postgres/` después de 30 días.
2. Crear un token/credencial R2 limitado a lectura/escritura del bucket dedicado. No usar una credencial de administrador global.
3. En GitHub, abrir **Settings → Secrets and variables → Actions → New repository secret** y crear:
   - `SUPABASE_DB_URL`: cadena de conexión PostgreSQL del proyecto (preferir conexión directa o pooler de sesión, no pooler transaccional).
   - `R2_ACCOUNT_ID` y `R2_BUCKET_NAME`.
   - `R2_ACCESS_KEY_ID` y `R2_SECRET_ACCESS_KEY` del token R2 limitado.
   - `BACKUP_ENCRYPTION_PASSPHRASE`: frase larga, aleatoria y exclusiva del respaldo.
4. Guardar la frase de cifrado en un gestor institucional fuera de GitHub. Sin ella, un dump descargado no se puede descifrar.
5. Ejecutar **Actions → Encrypted PostgreSQL backup → Run workflow** y comprobar que finaliza correctamente y que el archivo `.dump.gpg` y el `.sha256` aparecen en R2.
6. Si la política de red de Supabase bloquea GitHub-hosted runners, no abrir la base a Internet de forma amplia. Usar un runner privado con IP fija autorizada o ejecutar el proceso desde una red de confianza.

La tarea se ejecuta diariamente; la retención de 30 días se aplica mediante el ciclo de vida configurado en R2, no borrando respaldos desde el workflow. La cuenta de almacenamiento y la configuración de lifecycle son responsabilidad del administrador del bucket.

### Prueba de restauración

Realizarla en una instancia Supabase de staging aislada, con versión compatible y sin datos de usuarios reales:

1. Descargar el dump cifrado y su suma desde R2; validar `sha256sum -c` usando el valor del `.sha256`.
2. Descifrarlo con la frase del gestor institucional y confirmar que `pg_restore --list` termina sin error.
3. Restaurar a staging siguiendo el procedimiento de recuperación de Supabase para la versión del proyecto; nunca restaurar con `--clean` sobre producción.
4. Verificar tablas y conteos de equipos, mantenimientos, movimientos y catálogos; probar inicio de sesión, políticas RLS y funciones de la aplicación.
5. Documentar fecha, versión, duración, resultado, errores y acciones correctivas. Borrar staging con el procedimiento aprobado una vez concluida la validación.

El dump lógico no incluye objetos de Google Drive ni sustituye los respaldos administrados/PITR del proveedor. Verificar aparte los respaldos y cuotas de esos servicios.

## CI

El workflow `.github/workflows/ci.yml` instala dependencias con `npm ci` y ejecuta lint y build. Las variables Supabase de compilación son valores ficticios no funcionales; no se guardan secretos de producción en el workflow. Actualmente no hay pruebas unitarias o de navegador configuradas, por lo que el estado de la matriz funcional y RLS requiere evidencia manual de staging.
