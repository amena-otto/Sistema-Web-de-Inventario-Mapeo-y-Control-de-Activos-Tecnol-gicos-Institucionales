# Fase 11: pruebas, seguridad y respaldos

## Estado y alcance de las verificaciones

Este repositorio no tiene un ejecutor de pruebas automatizadas de interfaz ni credenciales de una base aislada. Por eso, las pruebas que crean o modifican datos deben ejecutarse en staging, nunca en producción. No se deben marcar como aprobadas hasta guardar evidencia de una ejecución real.

| Área | Estado | Cómo verificar |
|---|---|---|
| Compilación y tipos TypeScript | Automatizable | `npm ci` y `npm run build` |
| Reglas ESLint | Automatizable | `npm run lint` |
| CRUD, búsqueda, filtros, estados y totales | Pendiente en staging | Seguir la matriz funcional de abajo |
| Ubicaciones e historial de movimientos | Pendiente en staging | Cambiar ubicación y comprobar el historial |
| Planos de piso | Pendiente en staging | Cargar, reemplazar y eliminar un plano; comprobar `pisos.plano_storage_path` y el objeto del bucket `planos-institucionales` |
| Baja definitiva de equipos | Pendiente en staging | Dar de baja, abrir el detalle, confirmar el código y comprobar `equipos_eliminados` y la auditoría |
| Mantenimientos | Pendiente en staging | Crear, editar y comprobar el historial |
| QR | Pendiente en staging | Abrir el QR, seguir el enlace `.dev` e imprimir |
| Permisos por rol | Pendiente en staging | Iniciar sesión con un usuario de cada rol |
| Rutas públicas y destino de `/` | Automatizable (revisión) + pendiente en staging | Abrir `/` con y sin sesión: siempre pasa por `/login`, sin bucles |
| Revalidación de acceso y cuenta desactivada | Pendiente en staging | Desactivar la cuenta con la sesión abierta y navegar, cambiar de pestaña o esperar el intervalo de revalidación |
| RLS de PostgreSQL y Storage | Pendiente en staging | Ejecutar `supabase/tests/rls.sql` |
| Importación CSV | Pendiente en staging | Probar la plantilla, filas incompletas, fechas erróneas y duplicados |
| Interfaz móvil | Pendiente de comprobación manual | Usar la matriz de dispositivos/navegadores |
| Errores de red y datos inválidos | Pendiente en staging | Confirmar mensajes visibles y que la pantalla siga operativa |
| Respaldo local cifrado | Procedimiento disponible, no programado | Crear copia y comprobar restauracion; ver operaciones/restauracion-backup.md |
| Restauracion local del procedimiento | Probada con datos ficticios | No acredita un calendario de produccion ni binarios Storage/Drive |
| Consumo del plan gratuito | Pendiente de medir | Revisar uso de base, almacenamiento, egreso y funciones en Supabase |

El flujo de CI ejecuta lint y build en cada pull request y en cada push a `main`. No sustituye pruebas funcionales ni una revisión del servicio real.

## Prueba funcional en staging

Preparar datos descartables, un usuario activo de cada rol (`admin`, `tecnico`, `consulta`) y anotar fecha, navegador, resolución, usuario/rol, resultado y evidencia sin datos personales.

1. **Equipos:** crear un equipo con datos válidos, volver a abrirlo, editarlo y comprobar que los cambios persisten. Verificar que un registro incompleto presenta un error legible.
2. **Búsqueda y filtros:** buscar por código, nombre y serie; combinar categoría, ubicación y estado; limpiar filtros; comprobar que la tabla, paginación y totales coinciden con los resultados.
3. **Estados:** comparar los conteos del dashboard con el inventario filtrado, incluidos equipos en mantenimiento, almacén, baja y archivados.
4. **Ubicación e historial:** cambiar la ubicación desde el flujo normal de movimientos; confirmar que el equipo queda en el ambiente esperado y que el movimiento anterior y nuevo permanecen en el historial.
5. **Mantenimientos:** registrar una intervención, asignarla a un técnico, iniciarla, completarla y editarla. Comprobar que no se puede retroceder de estado, que al completar se exigen diagnóstico, acciones y resultado, y que todo cambio de estado del equipo pide motivo y aparece en el historial con usuario y fecha. Verificar que un técnico no puede reasignar la intervención ni editar una ya completada, y que las escrituras directas sobre la tabla son rechazadas.
6. **QR e impresión:** generar y leer un QR con cámara y desde pantalla; validar que el destino no sea `localhost`; revisar vista e impresión en una página.
7. **Roles:** `admin` gestiona usuarios y catálogos; `tecnico` opera equipos y mantenimientos según sus permisos; `consulta` solo lee las áreas permitidas. Probar también la URL directa de cada módulo.
8. **Importación:** descargar la plantilla; importar una fila válida, una fila incompleta, una fecha imposible, categoría/ambiente inexistente y un duplicado. Revisar el resultado por fila y confirmar que no se dupliquen registros.
9. **Errores:** desconectar la red o usar datos inválidos; verificar que las operaciones fallidas informen el error, no indiquen éxito y permitan continuar.
10. **Móvil y escritorio:** repetir navegación, filtros, modales, tabla, importación y QR en un escritorio y en un móvil (o emulación), con anchuras de 360, 390 y 768 px.
11. **Ruta raíz:** sin sesión, abrir `/` y confirmar que termina en `/login` sin recargas repetidas. Con sesión activa, abrir `/` y confirmar que la aplicación muestra el panel sin quedar en un ciclo de redirecciones. Escribir una URL inexistente y comprobar que también pasa por `/login` y luego por el panel.
12. **Perfil y rutas protegidas:** con cada rol, abrir directamente `/dashboard`, `/equipos`, `/reportes`, `/mantenimientos`, `/movimientos` y `/usuarios`. Un rol sin permiso debe terminar en `/dashboard`, no en una pantalla en blanco ni en un bucle.
13. **Cuenta desactivada con sesión abierta:** iniciar sesión, desactivar el usuario desde otro navegador y, en la sesión abierta, navegar a otro módulo, cambiar de pestaña y volver, o esperar al menos 60 s. La aplicación debe bloquear la operación, dejar de mostrar el perfil, borrar la sesión local, volver a `/login` y mostrar el mensaje de cuenta desactivada. Repetir con el usuario eliminado en Auth. Confirmar en la pestaña Network que no hay una consulta de perfil por cada render.

No usar registros reales ni cuentas con privilegios de producción para estas pruebas.

## Pruebas RLS

El script `supabase/tests/rls.sql` cubre acceso anónimo y los roles `admin`, `tecnico` y `consulta`, incluyendo equipos, perfiles, catálogos, mantenimientos, ciclo y trazabilidad de estados, movimientos, fotografías, marcadores, autoría, inmutabilidad de la auditoría y baja definitiva. Debe ejecutarse completo desde SQL Editor en un proyecto de staging que tenga el mismo esquema/migraciones y al menos un usuario activo por rol.

El script crea fixtures y hace pruebas de escritura dentro de bloques PL/pgSQL que revierten sus cambios al terminar. Aun así, no ejecutarlo en producción: requiere privilegios SQL y puede fallar si el esquema de staging no coincide. Revisar que el resultado no contenga filas `FALLA`; un error de ejecución no equivale a una prueba aprobada.

## Respaldo local sin almacenamiento de pago

El workflow backup-postgres.yml solo valida scripts con datos ficticios y no
conserva respaldos de produccion. No requiere servicios de almacenamiento ni secretos.
Usar scripts/backup-postgres-local.ps1 y scripts/verificar-restaurar-local.ps1
segun [la guia operativa](operaciones/restauracion-backup.md). Registrar una tarea
Windows es un paso adicional: no afirmar automatizacion hasta comprobar ejecuciones
y restauracion de una copia reciente. Storage y Drive requieren copias independientes.

## Prueba de restauracion

Seguir operaciones/restauracion-backup.md. El verificador solo admite loopback y
crea una base descartable nueva; compara conteos con el propio snapshot. No restaura
ACL originales ni certifica servicios gestionados, por lo que una recuperacion
completa requiere pruebas adicionales. No usar produccion como destino de ensayo.

## Consumo de recursos

Para validar el plan gratuito, registrar semanalmente en Supabase **Settings → Usage** (la ubicación puede variar en el panel): tamaño de base de datos, almacenamiento de archivos, egreso, usuarios activos de Auth, invocaciones/duración de Edge Functions y uso de Realtime. Comparar con los límites que muestra el plan contratado y revisar alertas/overages antes de cada publicación. Registrar fecha y valores en la bitácora operativa. Incluir la ejecucion de GitHub Actions y el espacio del disco local; los límites gratuitos y precios pueden cambiar y deben confirmarse en las consolas de los proveedores. No se midieron cuotas durante este cambio.

## CI

El workflow `.github/workflows/ci.yml` instala dependencias con `npm ci`, ejecuta `npm test`, lint, build y `deno check` sobre todas las Edge Functions. Las variables Supabase de compilación son valores ficticios no funcionales; no se guardan secretos de producción en el workflow. Las pruebas automáticas incluyen utilidades de inventario/CSV, los helpers de limpieza por lotes y pruebas de integración SQL con PGlite sobre las migraciones `015` y `016` (idempotencia, triggers, RPC y permisos de la tabla de limpieza diferida). El estado de la matriz funcional, RLS en un proyecto real y la restauración siguen requiriendo evidencia manual de staging.

El informe de cierre con las matrices RB-01…RB-12 y CA-01…CA-16, los hallazgos, el estado de las validaciones y el veredicto técnico está en `documentacion/auditoria-cierre.md`.
