# Equipos compartidos y áreas usuarias

El uso compartido permite registrar que un equipo es utilizado por varias áreas, manteniendo una sola ubicación física y un solo registro de inventario. No crea copias del activo ni modifica su responsable, serie, código ni movimientos.

## Modelo de datos

La migración `020_equipos_compartidos.sql` crea la tabla `equipo_areas_usuarias` con:

- `id`: identificador del vínculo.
- `equipo_id`: equipo al que se asocia el área usuaria.
- `ambiente_id`: oficina o área que utiliza el equipo.
- `creado_por`: usuario que registró el vínculo.
- `created_at`: fecha de creación.

Existe una restricción `unique (equipo_id, ambiente_id)` que evita vínculos repetidos, un índice por `ambiente_id`, RLS habilitado y un trigger de auditoría para inserciones y eliminaciones. `authenticated` solo tiene concedido `SELECT`, condicionado al rol (`admin`, `tecnico` o `consulta`) y a que el equipo exista. Las escrituras directas no están concedidas.

La función `public.configurar_areas_equipo(equipo_id, areas, areas_anteriores)` valida:

- que el actor sea administrador o técnico activo;
- que la lista tenga como máximo 100 áreas y no contenga valores nulos;
- que el equipo esté activo y no eliminado;
- que las áreas seleccionadas estén activas y sean oficinas o áreas del agrupador `AREAS`;
- que la configuración anterior no haya cambiado desde que se abrió la ficha.

Después de validar, sustituye los vínculos de forma atómica y auditoría cada inserción o retirada. No se marca automáticamente a ningún equipo como compartido.

## Interfaz

- **Áreas usuarias:** en la ficha del equipo se listan las áreas registradas. Los perfiles autorizados pueden seleccionar oficinas activas y guardar la configuración mediante la RPC. Las áreas inactivas ya vinculadas se muestran como tales para no perder el histórico.
- **Equipos compartidos por ubicación:** en cada oficina se muestra una sección con equipos que están físicamente en otra ubicación pero son utilizados por esa área. Incluye búsqueda, paginación de 10 elementos, ubicación física, número de serie, estado y enlace a la ficha.
- **Etiqueta Compartido:** el listado de equipos muestra la etiqueta cuando hay más de un área usuaria o un área distinta de la ubicación física. La lectura se hace por lotes de 200 registros.

Si la migración 020 no está aplicada, la interfaz informa que el uso compartido aún no está habilitado y mantiene disponible el inventario físico.

## Flujo de trabajo

1. Crear el equipo con su ubicación física y responsable.
2. Abrir su ficha y acceder a **Áreas usuarias y uso compartido**.
3. Seleccionar todas las áreas que utilizan el equipo, incluida la de origen si corresponde.
4. Guardar áreas usuarias.
5. Verificar que la ubicación física y los movimientos no han cambiado.
6. Consultar desde cada oficina los equipos compartidos externos.

Ejemplo: una impresora instalada físicamente en Marketing puede tener como áreas usuarias a Marketing y Contabilidad. Contabilidad la verá en su sección de equipos compartidos con Marketing como ubicación física, sin duplicar el activo en el inventario global.

## Puntos de validación

- El inventario físico y los reportes siguen contando cada activo una sola vez.
- El CSV existente no importa ni exporta vínculos de uso compartido en esta versión.
- No debe ser posible editar áreas usuarias sin permisos de administrador o técnico.
- Eliminar definitivamente un equipo elimina sus vínculos, con auditoría; eliminar un ambiente vinculado está protegido por llave foránea.
- No se debe confundir este mecanismo con la tabla `equipos_compartidos` ni con una vista `v_equipos_compartidos`: en esta versión no existen.

## Fuentes

- `docs/INTERFAZ_Y_EQUIPOS_COMPARTIDOS.md`
- `supabase/migrations/020_equipos_compartidos.sql`
- `src/components/AreasUsuariasEquipo.tsx`
- `src/components/EquiposCompartidosArea.tsx`
- `src/services/equiposCompartidosService.ts`
- `src/utils/equiposCompartidos.ts`
