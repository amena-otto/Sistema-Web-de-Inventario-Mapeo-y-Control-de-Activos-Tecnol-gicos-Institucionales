# Restauración segura de un respaldo PostgreSQL

Este documento describe cómo verificar y restaurar un respaldo cifrado generado por
`.github/workflows/backup-postgres.yml`. **Nunca debe aplicarse sobre producción sin
una ventana de mantenimiento aprobada y un respaldo previo adicional.**

## 1. Requisitos

- `pg_restore`/`psql` de PostgreSQL 18 (o compatible con el servidor de origen).
- `gpg` y la frase de cifrado `BACKUP_ENCRYPTION_PASSPHRASE`.
- Credenciales de solo lectura de Cloudflare R2.
- Una base de datos **nueva y descartable** para la prueba de restauración.

## 2. Descargar el respaldo

El workflow guarda la suma en el formato estándar de `sha256sum`
(`<hash>  <nombre>`). Descarga el dump con el mismo nombre que el objeto remoto
para poder verificar sin editar el archivo:

```bash
key="postgres/AAAA/MM/DD/inventory-<fecha>.dump.gpg"
name="$(basename "$key")"

aws --endpoint-url "https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com" \
  --region auto \
  s3 cp "s3://${R2_BUCKET_NAME}/${key}" "./${name}"

aws --endpoint-url "https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com" \
  --region auto \
  s3 cp "s3://${R2_BUCKET_NAME}/${key}.sha256" "./${name}.sha256"

sha256sum -c "./${name}.sha256"
```

Debe imprimir `OK`. Si la verificación falla, no descifres ni restaures: vuelve a
descargar el objeto o elige otro respaldo.

## 3. Descifrar y verificar

```bash
printf '%s' "$BACKUP_ENCRYPTION_PASSPHRASE" | gpg --batch --yes --pinentry-mode loopback \
  --passphrase-fd 0 --decrypt --output database.dump "./${name}"

pg_restore --list database.dump > restore-list.txt
for tabla in profiles equipos equipos_eliminados auditoria ambientes pabellones \
  pisos categorias_equipos componentes relaciones_equipos fotografias_equipos \
  mantenimientos mantenimiento_cambios_estado movimientos; do
  grep -Eq "TABLE DATA public ${tabla}([[:space:]]|$)" restore-list.txt \
    || { echo "Falta la tabla public.${tabla}"; exit 1; }
done
```

El patrón exige un espacio o fin de línea después del nombre para evitar que
`equipos` coincida con `equipos_eliminados`. `TABLE DATA` aparece aunque la tabla
esté vacía, así que una tabla legítima sin filas no invalida el respaldo. Si falta
alguna tabla crítica, **no continúes**: el respaldo está incompleto.

## 4. Restaurar en una base descartable

```bash
createdb prueba_restauracion
pg_restore --dbname=prueba_restauracion --no-owner --no-privileges \
  --exit-on-error database.dump
```

Verificaciones mínimas (sin modificar datos):

```sql
select count(*) from public.equipos;
select count(*) from public.equipos_eliminados;
select count(*) from public.profiles;
select count(*) from public.auditoria;
select count(*) from public.movimientos;
select count(*) from public.mantenimientos;
select count(*) from public.fotografias_equipos;
select count(*) from public.eliminaciones_pendientes;
```

Compara los conteos con el sistema de origen y revisa que los UUID y
`codigo_institucional` se conserven.

## 5. Restauración real (solo con aprobación)

1. Programar una ventana de mantenimiento y bloquear escrituras de la aplicación.
2. Crear un respaldo adicional del estado actual.
3. Restaurar primero en una base de ensayo y validar la aplicación.
4. Restaurar en producción con `pg_restore --clean --if-exists` **solo** si el
   procedimiento aprobado lo indica; `--clean` elimina objetos existentes.
5. Verificar RLS, funciones, triggers y Edge Functions antes de reabrir el sistema.
6. Documentar fecha, responsable, respaldo usado y verificaciones realizadas.

## 6. Diagnóstico de fallos del workflow

Si el workflow falla, revisa el paso `Diagnóstico (sin credenciales)`. Muestra
únicamente si cada secreto está definido y el host/puerto (sin usuario ni
contraseña). Causas frecuentes:

- `SUPABASE_DB_URL` apunta al pooler de transacciones (puerto `6543`), que no
  admite `pg_dump`. Usa la conexión directa o el pooler en modo sesión (`5432`).
- Falta uno de los secretos `R2_*` o `BACKUP_ENCRYPTION_PASSPHRASE`.
- La URL no incluye `sslmode=require` ni un modo SSL compatible. El workflow
  define `PGSSLMODE=require`, pero la URL puede sobrescribirlo.
- Credenciales de R2 sin permiso de escritura/lectura sobre el bucket.
- Región de R2: el workflow usa `--region auto`, que es el valor admitido por R2.

Los logs completos de GitHub Actions solo los puede revisar un administrador del
repositorio; no contienen secretos en claro, pero sí el detalle del error.
