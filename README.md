# Sistema Web de Inventario OT

Aplicación React, TypeScript y Vite para administrar el inventario tecnológico
institucional del IES Privado Otto Tonsmann mediante Supabase.

Este README es el punto de entrada del repositorio. El detalle funcional y
técnico vive en [documentacion/README.md](./documentacion/README.md).

## Inicio local

1. Instala Node.js y las dependencias con `npm install`.
2. Copia `.env.example` a `.env`.
3. Completa `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` con los datos
   públicos del proyecto Supabase.
4. `VITE_APP_URL` está configurado para desarrollo y producción con el dominio
   público de Workers, así los QR generados localmente abren la aplicación
   publicada y permiten descargar e imprimir etiquetas.
5. Ejecuta `npm run dev`.

No agregues claves `service_role` ni credenciales administrativas al frontend.
El archivo `.env` está excluido de Git. La configuración de Auth, los secretos
de las Edge Functions y el orden de despliegue se describen en
[configuración de autenticación](./documentacion/operaciones/configuracion-autenticacion.md)
y [publicación y operaciones](./documentacion/operaciones/despliegue.md).

## Módulos implementados

| Módulo | Ruta | Acceso | Documentación |
|---|---|---|---|
| Inicio / indicadores | `/dashboard` | `inventario.ver` | [dashboard](./documentacion/modulos/dashboard.md) |
| Equipos | `/equipos` | `inventario.ver` | [equipos](./documentacion/modulos/equipos.md) |
| Componentes y activos asociados | ficha de equipo | `inventario.ver` | [componentes](./documentacion/modulos/componentes.md) |
| Ubicaciones | `/ubicaciones` | `inventario.ver` | [ubicaciones](./documentacion/modulos/ubicaciones.md) |
| Mantenimientos | `/mantenimientos` | `mantenimientos.ver` | [mantenimientos](./documentacion/modulos/mantenimientos.md) |
| Movimientos | `/movimientos` | `movimientos.ver` | [movimientos](./documentacion/modulos/movimientos.md) |
| Equipos compartidos | sección de Ubicaciones | `inventario.ver` | [equipos compartidos](./documentacion/modulos/equipos-compartidos.md) |
| Etiquetas QR | desde el listado de Equipos | `inventario.ver` | [etiquetas QR](./documentacion/modulos/etiquetas-qr.md) |
| Reportes e importación CSV | `/reportes` | `reportes.ver` | [reportes](./documentacion/modulos/reportes.md) |
| Usuarios y permisos | `/usuarios` | `usuarios.administrar` | [usuarios y permisos](./documentacion/modulos/usuarios-permisos.md) |
| Baja definitiva | ficha de equipo en `baja` | administrador | [baja definitiva](./documentacion/modulos/baja-definitiva-equipos.md) |

La matriz de permisos de `src/hooks/usePermissions.ts` gobierna menú y rutas;
la autorización real depende de las políticas RLS de Supabase. Las reglas
vigentes están en [seguridad, RLS y auditoría](./documentacion/base-datos/03-seguridad-rls-y-auditoria.md).

## Documentación por área

- **Índice general:** [documentacion/README.md](./documentacion/README.md).
- **Funcionalidad por módulo:** [documentacion/modulos/](./documentacion/modulos/).
- **Arquitectura y base de datos:** [documentacion/base-datos/](./documentacion/base-datos/).
- **Procedimientos operativos:** [documentacion/operaciones/](./documentacion/operaciones/).
- **Pruebas y verificaciones:** [documentacion/pruebas/](./documentacion/pruebas/).
- **Informes históricos:** [documentacion/historico/](./documentacion/historico/).

## Verificación

- `npm run build`: comprueba TypeScript y genera la aplicación de producción.
- `npm run lint`: ejecuta ESLint.
- `npm test`: ejecuta las pruebas automáticas incluidas en `tests/`.

La matriz de pruebas funcionales, RLS y respaldos está en
[plan de pruebas y verificaciones](./documentacion/pruebas/plan-pruebas.md).
GitHub Actions ejecuta lint, build, pruebas automáticas y `deno check` sobre las
Edge Functions. Las pruebas que escriben datos requieren un entorno de staging.
