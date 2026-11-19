# Entrega de oficinas independientes

> Documento histórico de la rama `feat/ubicaciones-oficinas`. Conserva el alcance
> y las verificaciones originales. El comportamiento vigente se describe en
> [ubicaciones](../modulos/ubicaciones.md).

Base revisada: c0fc3a06127e7879ff22acb9139bd33830acef06 (main).

## Comportamiento

- Ubicaciones ofrece Áreas académicas y Pabellones.
- Oficinas nuevas: tipo, nombre, descripción opcional e icono automático o elegido. No solicita ni genera piso, pabellón o código de aula.
- Aulas y laboratorios conservan piso y código obligatorios.
- Oficinas existentes y ambientes del pabellón heredado AREAS se presentan en Áreas académicas. La lectura no cambia sus IDs, nombres, códigos, tipos ni relaciones originales.
- Al editar una oficina heredada se conservan su código y piso originales; guardar es una acción explícita del usuario. No hay conversión masiva de registros.
- Iconos SVG por ambiente y categoría. Los iconos personalizados de ambientes se guardan en `ambientes.icono`; los de categorías se sugieren según nombre.
- Tarjetas con conteos de equipos activos y resumen de estado. Se conserva la tabla y la paginación existentes.
- El enlace desde un ambiente abre Equipos filtrado; al pulsar Agregar equipo queda preseleccionada esa ubicación.
- Traslados admiten oficinas independientes, aulas y laboratorios con la RPC existente.
- Catálogos, detalle, exportación y dashboard admiten relaciones de piso nulas. Oficinas cuentan en totales y ubicaciones, sin inventar un piso o pabellón en las agrupaciones físicas.
- CSV conserva las cinco columnas. En `ambiente_codigo` admite el nombre de una oficina o su código heredado. Coincidencias ambiguas se rechazan.
- La interfaz advierte nombres repetidos de oficinas ignorando tildes, espacios y mayúsculas. Es una validación de interfaz, no una garantía de exclusión entre operaciones concurrentes.

## Qué contiene la migración

`supabase/migrations/019_oficinas_independientes.sql` solamente cambia estructura:
permite NULL en piso/código, agrega icono opcional y reglas para escrituras futuras.
No contiene UPDATE, INSERT, DELETE ni reasignación de activos. Conserva FK, RLS,
funciones y triggers existentes. No valida retroactivamente las dos nuevas
restricciones CHECK. Se reservó 018 porque existe una migración de códigos por
categoría fuera de este main; no se incluyó ni modificó ese trabajo.

## Aplicación en la copia local del usuario

1. Descomprimir el paquete fuera del repositorio. Abrir PowerShell en la raíz del repositorio.
2. Ejecutar `git status --short`. Si hay trabajo local pendiente, conservarlo en su propia rama/commit antes de continuar. No reemplazar archivos a mano sobre cambios pendientes.
3. Crear una rama: `git switch -c feat/ubicaciones-oficinas`.
4. Comprobar compatibilidad, sustituyendo la ruta del parche:
   `git apply --check "C:\ruta\Inventario_Ubicaciones\ubicaciones-oficinas.patch"`.
5. Solo si la comprobación pasa, aplicar:
   `git apply "C:\ruta\Inventario_Ubicaciones\ubicaciones-oficinas.patch"`.
   Si falla, revisar las diferencias de la versión local; el parche no debe forzarse.
6. Ejecutar `npm ci`, `npm run lint`, `npm test` y `npm run build`.
7. Revisar el SQL 019 contra el esquema de la instalación en una copia de prueba antes de aplicarlo a producción. Usar `verificar_datos.sql` antes y después sobre la misma base sin escrituras concurrentes. Los conteos y huellas deben coincidir.
8. Aplicar únicamente la migración nueva revisada y luego el frontend. No se ha realizado ninguno de esos pasos sobre la base real desde esta entrega.
9. Comprobar manualmente creación/edición de oficina, aulas, laboratorios, traslados, CSV, reportes, vistas de escritorio y celular y roles admin/técnico/consulta antes de publicar.

Las ocho oficinas actuales se reconocen automáticamente para su presentación.
No hay que borrar AREAS ni su piso, ni trasladar activos para usar la nueva vista.

## Verificación realizada

Lint y compilación correctos. Suite automatizada: 128 pruebas correctas, cero
omitidas y cero fallos. Las pruebas nuevas ejecutan SQL en PostgreSQL embebido
(PGlite), conservan filas y referencias de muestra, comprueban repetición de la
migración, oficina sin piso/código, restricciones de aula/icono y CSV ambiguo.

La revisión automatizada de la interfaz usó el frontend real con un Supabase
simulado en memoria, sin tocar producción, en escritorio (1440 px) y móvil
(390 px). Se comprobaron tarjetas e iconos de oficina, formularios de oficina y
aula, equipos, el modal de traslados con destinos de oficina, aula y
laboratorio, reportes, dashboard, la vista previa CSV con dos filas válidas y la
ausencia de desbordamiento horizontal. No se verificó contra una sesión real ni
contra el esquema completo de producción porque el repositorio no incluye las
migraciones base.

No se publicaron cambios: la rama local `feat/ubicaciones-oficinas` conserva el
trabajo, sin push ni merge a `main`.
