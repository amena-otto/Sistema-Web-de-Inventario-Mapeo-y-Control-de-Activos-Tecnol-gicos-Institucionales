# Interfaz y equipos compartidos

Base: `45527da` (main), con PR #11 de oficinas independientes ya integrado.
Rama propuesta para la instalación: `feat/interfaz-equipos-compartidos`.

## Cambios incluidos

- Una sola ubicación física por equipo y una relación adicional de áreas usuarias.
- Ficha organizada en General, Áreas usuarias, Información técnica, Fotografías e Historial.
- Áreas usuarias: consulta para los perfiles autorizados; configuración por administrador o técnico sobre equipos activos.
- Sección de equipos externos compartidos dentro de cada oficina seleccionada. Búsqueda, paginación y ubicación física visible. No vuelve a contar como externo al equipo ubicado en esa misma oficina.
- Etiqueta Compartido en el listado cuando hay más de un área usuaria o un área distinta de la ubicación física. La lectura se hace por lotes.
- Guardado explícito y atómico: no cambia ubicación, responsable, serie, código ni movimientos. Detecta configuraciones modificadas por otra persona desde que se abrió la ficha.
- Auditoría de vínculos creados y retirados. Se mantiene la protección de las áreas que tengan vínculos de uso.
- Oficinas existentes del agrupador AREAS también son elegibles, sin reclasificar sus registros.
- Vista tabla o tarjetas en escritorio; tarjetas en celular. Filtros aplicados removibles. Se conservan búsqueda, paginación y operaciones anteriores.
- Color azul real para acciones y mantenimiento; antes los tokens blue estaban redefinidos como naranja. Se mantiene la identidad institucional en la barra lateral. Fondo claro, foco visible y soporte de movimiento reducido.
- Inicio incorpora Con observaciones entre los indicadores principales y mantiene su enlace filtrado.

## Ejemplo

Impresora físicamente en Marketing: abrir ficha, entrar a Áreas usuarias, seleccionar Marketing y Contabilidad, Guardar áreas usuarias.

Contabilidad la verá en Equipos compartidos desde otras ubicaciones, con Marketing como ubicación física. Marketing conservará una sola fila física; el inventario global seguirá teniendo una sola impresora.

Las áreas se configuran después de crear el equipo, desde su ficha. No se agregó una escritura parcial adicional al proceso de creación. Si la migración no está aplicada, el sistema informa la falta de habilitación y conserva disponible el inventario físico.

## Datos y estructura

La migración 020 solo crea la tabla de vínculos, permisos, políticas, trigger y RPC. No modifica ni rellena registros de equipos, ambientes, movimientos o áreas existentes. Ningún equipo se marca automáticamente como compartido.

La nueva tabla tiene RLS. authenticated puede leer según rol y acceso al equipo; las escrituras directas no están concedidas. La RPC valida actor, equipo activo, oficinas activas, máximo 100 áreas, referencias válidas y configuración anterior. La eliminación definitiva de un equipo elimina únicamente sus vínculos, con auditoría; eliminar un ambiente vinculado está protegido por FK.

El tipo Oficina sigue representando el ambiente. Si más adelante se necesitan departamentos independientes de sus espacios físicos, ese catálogo organizacional es un alcance adicional; esta versión usa las oficinas/áreas actuales.

Los reportes y el dashboard siguen contando activos físicos únicos. El CSV existente mantiene ubicación física y no importa ni exporta vínculos de uso compartido en esta versión.

## Integración con OpenCode

1. Conservar cualquier trabajo local pendiente, incluido `documentacion/operaciones/restauracion-backup.md`. No usar reset, clean ni reemplazos forzados.
2. Revisar las ramas y tomar el main que ya contiene oficinas. Crear `feat/interfaz-equipos-compartidos` desde esa base una vez protegido el trabajo local.
3. Ejecutar `git apply --check "C:\ruta\Inventario_Interfaz_Compartidos\interfaz-compartidos.patch"`.
4. Si pasa, aplicar con `git apply "C:\ruta\Inventario_Interfaz_Compartidos\interfaz-compartidos.patch"`. Si falla, adaptar los cambios a la versión local sin forzar el parche. No volver a aplicar el ZIP de oficinas anterior.
5. Ejecutar `npm ci`, `npm run lint`, `npm test` y `npm run build`.
6. Revisar la migración 020 contra el esquema actual y probarla en una copia de prueba. No ejecutar db reset, semillas ni migraciones pendientes en bloque. Mantener las migraciones 018 y 019 de la instalación.
7. Ejecutar `verificar_datos.sql` antes y después del ajuste estructural en la copia de prueba, sin escrituras concurrentes. Los conteos y huellas de los registros existentes deben coincidir.
8. Comprobar con datos ficticios: impresora de Marketing utilizada por Contabilidad; retirada del uso; equipo de baja; permisos consulta/técnico/admin; formularios; vistas tabla/tarjetas; móvil; QR; movimientos y reportes físicos.
9. Dejar preparados commit y revisión del cambio. No aplicar SQL a producción, fusionar ni desplegar automáticamente como parte de esta integración local.

## Verificación de la entrega

Lint y build correctos. Pruebas: 137 aprobadas, una omitida, cero fallos.

Pruebas nuevas en PostgreSQL embebido (PGlite): idempotencia, múltiples áreas sin movimiento ni duplicación, validación de destinos, permisos, RLS, rechazo de escritura directa, detección de configuración obsoleta, equipos de baja/eliminados, revocación y rollback ante fallo de inserción/auditoría.

Pendiente: revisión visual y prueba funcional completa con navegador contra la instalación real. No se conectó ni alteró la base real. No se publicaron commits porque la conexión GitHub disponible solo tiene lectura.
