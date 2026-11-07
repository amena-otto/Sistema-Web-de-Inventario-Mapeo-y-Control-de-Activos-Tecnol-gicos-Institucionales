# Despliegue y reversión: eliminación definitiva de equipos

Este documento define el orden seguro para publicar la corrección de eliminación
definitiva de equipos y cómo revertir sin perder fotografías. **No se ejecutó
ningún cambio en producción durante la auditoría:** este plan es para que un
administrador lo aplique en una ventana aprobada.

## 1. Alcance

Componentes involucrados:

| Componente | Cambio |
|---|---|
| `supabase/migrations/016_limpieza_diferida_eliminacion_equipos.sql` | Nueva tabla `public.eliminaciones_pendientes` (aditiva). |
| `supabase/functions/fotografias-drive` | Autoriza la limpieza contra `fotografias_equipos` y `eliminaciones_pendientes`. |
| `supabase/functions/admin-eliminar-equipo` | Registra archivos, ejecuta la RPC y solo después limpia Storage/Drive; lotes de 50 IDs y reintentos idempotentes. |
| Aplicación web | Muestra una advertencia si la limpieza de archivos queda pendiente. |

La migración `015_corregir_eliminacion_definitiva_equipos.sql` **no se modifica**.
Debe estar aplicada antes de este despliegue (producción ya la tiene).

## 2. Requisitos previos

1. Respaldo reciente verificado con `documentacion/operaciones/restauracion-backup.md`.
2. Rama de trabajo revisada y aprobada; no desplegar desde una rama sin revisión.
3. Ventana de mantenimiento y responsable de la operación designados.
4. Acceso a los secretos de Supabase y a la consola de Google Drive.
5. Un proyecto de staging con el mismo esquema para la prueba funcional.

## 3. Orden definitivo de despliegue

### Paso 1: respaldo y línea base (solo lectura)

Antes de aplicar cambios, guardar evidencia de:

```sql
select to_regclass('public.eliminaciones_pendientes') as tabla_pendientes;
select tgname
from pg_trigger
where tgrelid = 'public.equipos'::regclass
  and not tgisinternal
order by tgname;
select proname
from pg_proc
where proname = 'eliminar_equipo_dado_de_baja';
select count(*) from public.equipos_eliminados;
```

Confirmar que los seis triggers legítimos siguen presentes:
`asignar_actor`, `asignar_codigo_equipo`, `auditoria_equipos`,
`proteger_equipos`, `set_updated_at` y `validar_cambio_asignacion_equipo`.

### Paso 2: aplicar la migración 016

Aplicar **primero** `016_limpieza_diferida_eliminacion_equipos.sql`. Es aditiva,
idempotente y no modifica datos existentes. Verificar después:

```sql
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'eliminaciones_pendientes'
order by ordinal_position;

select relrowsecurity
from pg_class
where oid = 'public.eliminaciones_pendientes'::regclass;

select has_table_privilege('authenticated', 'public.eliminaciones_pendientes', 'select') as cliente_puede_leer;
select has_table_privilege('service_role', 'public.eliminaciones_pendientes', 'select') as servicio_puede_leer;
```

Resultados esperados: la tabla existe, RLS activo, el cliente no puede leerla y
`service_role` sí.

> No aplicar `016` después de publicar las funciones: `admin-eliminar-equipo`
> necesita la tabla para registrar los archivos antes de la RPC.

### Paso 3: publicar `fotografias-drive`

Publicar esta función antes o junto con `admin-eliminar-equipo`. La nueva versión
tolera entornos donde `016` aún no exista, pero en el orden recomendado la tabla
ya está creada.

### Paso 4: publicar `admin-eliminar-equipo`

Con `016` aplicada y `fotografias-drive` actualizada, publicar la función de
administración. A partir de este momento el flujo es:

1. valida administrador, equipo, situación y código;
2. registra las rutas de Storage y los IDs de Drive en `eliminaciones_pendientes`;
3. ejecuta la RPC `eliminar_equipo_dado_de_baja`;
4. solo si la RPC confirma, limpia Storage y Drive (Drive en lotes de 50);
5. si la limpieza falla, devuelve éxito con una advertencia y conserva la fila
   pendiente para el reintento.

Un fallo de PostgreSQL deja el equipo y sus fotografías intactos.

### Paso 5: publicar la aplicación web

Publicar el frontend después de las funciones. El cliente nuevo muestra la
advertencia de archivos pendientes y sigue funcionando con una función antigua
que no devuelva ese campo (la interpreta como limpieza completa).

## 4. Prueba funcional en staging (datos ficticios)

No usar equipos ni fotografías reales. Crear un equipo descartable, subir al
menos dos fotografías (una en Drive y, si es posible, una ruta heredada de
Storage) y probar:

1. **Camino feliz:** dar de baja, confirmar el código y comprobar que el equipo,
   componentes, relaciones, fotografías, mantenimientos y movimientos
   desaparecen; `equipos_eliminados` conserva la constancia y `auditoria` no se
   borra; Storage y Drive quedan limpios; `eliminaciones_pendientes` no conserva
   la fila.
2. **Fallo de PostgreSQL:** simular un error en la RPC (por ejemplo, en staging,
   revocar temporalmente el permiso de ejecución o introducir un fallo
   controlado). Comprobar que las fotografías siguen existiendo en la base,
   Storage y Drive, que no queda una fila huérfana en
   `eliminaciones_pendientes` y que el mensaje invita a reintentar.
3. **Reintento:** restaurar la RPC y repetir la operación. Debe completarse sin
   duplicar la constancia en `equipos_eliminados`.
4. **Limpieza incompleta:** simular un fallo de Google Drive (por ejemplo,
   revocar el token OAuth en staging). La eliminación debe confirmarse con
   advertencia y la fila pendiente debe conservar los IDs. Restaurar el token y
   repetir: solo se procesan los archivos pendientes.
5. **Más de 100 fotografías:** validar que el administrador divide la lista en
   lotes y que `fotografias-drive` acepta cada lote (límite de la función: 100;
   tamaño usado por el cliente: 50).
6. **Doble clic/reintento tardío:** repetir la eliminación de un equipo ya
   eliminado con el código correcto. Debe responder éxito idempotente y no fallar
   por “equipo inexistente”.

## 5. Verificación posterior al despliegue

```sql
-- No deben quedar filas de equipos eliminados con archivos sin limpiar.
select equipo_id, codigo_institucional,
       cardinality(rutas_storage) as storage_pendiente,
       cardinality(drive_file_ids) as drive_pendiente,
       storage_limpiado, drive_limpiado, creado_at
from public.eliminaciones_pendientes
order by creado_at desc;
```

Revisar los logs de las Edge Functions para confirmar que no hay errores de tabla
ausente ni de permisos. Si hay filas pendientes, volver a confirmar la eliminación
del mismo equipo desde la aplicación para reanudar la limpieza.

## 6. Plan de reversión

### 6.1 Revertir la aplicación web

Volver a publicar la compilación anterior. Es la reversión de menor riesgo y no
afecta la base ni las Edge Functions.

### 6.2 Revertir las Edge Functions

Volver a desplegar las versiones del commit anterior. **Advertencia:** la versión
anterior de `admin-eliminar-equipo` borraba Storage y Drive **antes** de la RPC;
con `marcadores_mapa` retirada, esa versión deja el equipo sin fotografías si la
RPC falla. Por eso:

- Preferir corregir hacia adelante antes que revertir la función de eliminación.
- Si la reversión es imprescindible, deshabilitar temporalmente la eliminación
  definitiva en la interfaz y no ejecutar bajas definitivas hasta corregir.
- Los archivos de Drive se mueven a la papelera (`trashed: true`), no se borran
  de forma permanente; se pueden restaurar desde la papelera de la cuenta OAuth.

`fotografias-drive` puede revertirse sin riesgo para los datos; su versión
anterior valida solo contra `fotografias_equipos`.

### 6.3 Revertir la migración 016

`016` es aditiva y puede quedarse aplicada sin afectar el sistema. No es necesario
revertirla. Si se decide eliminarla:

1. Revertir primero ambas Edge Functions a versiones que no consulten la tabla.
2. Confirmar que no hay filas pendientes de limpieza.
3. Recién entonces ejecutar, con aprobación expresa:

```sql
-- Solo si se revirtieron las funciones y no hay limpiezas pendientes.
drop table if exists public.eliminaciones_pendientes;
```

No ejecutar este `drop` mientras las funciones nuevas sigan publicadas: la
eliminación dejaría de registrar archivos y volvería el riesgo de pérdida.

## 7. Reparación de fotografías perdidas por la versión anterior

Si la versión antigua ya borró archivos antes de un fallo de PostgreSQL:

1. **Google Drive:** abrir la papelera de la cuenta OAuth y restaurar los archivos
   por su nombre/fecha. La función usa `trashed: true`, por lo que son
   recuperables.
2. **Supabase Storage:** restaurar desde el respaldo del bucket o desde la copia
   externa aprobada. El `pg_dump` no incluye objetos de Storage.
3. **Base de datos:** reconstruir las filas de `fotografias_equipos` solo con
   evidencia verificada; no inventar rutas ni IDs.
4. Documentar el incidente, los archivos recuperados y los que no se pudieron
   recuperar.

## 8. Criterios de aceptación

- [ ] Respaldo verificado antes del despliegue.
- [ ] `016` aplicada y verificada (RLS, permisos, columnas).
- [ ] Los seis triggers de `equipos` siguen presentes.
- [ ] `fotografias-drive` y `admin-eliminar-equipo` publicadas en ese orden.
- [ ] Prueba de fallo de RPC sin pérdida de fotografías.
- [ ] Prueba de reintento idempotente.
- [ ] Prueba de limpieza incompleta y reanudación.
- [ ] Prueba de más de 100 fotografías.
- [ ] Sin filas pendientes inesperadas después de las pruebas.
