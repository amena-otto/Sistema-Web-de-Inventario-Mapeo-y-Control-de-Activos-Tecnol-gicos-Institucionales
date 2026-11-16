-- Cambio exclusivamente de estructura. No actualiza, inserta ni elimina registros.
-- 018 se reserva para la migración de códigos por categoría de la instalación.
begin;

alter table public.ambientes alter column piso_id drop not null;
alter table public.ambientes alter column codigo drop not null;
alter table public.ambientes add column if not exists icono text;

-- NOT VALID conserva registros históricos; la regla se exige en nuevas escrituras.
alter table public.ambientes drop constraint if exists ambientes_ubicacion_por_tipo;
alter table public.ambientes add constraint ambientes_ubicacion_por_tipo
  check (tipo = 'oficina' or (piso_id is not null and nullif(btrim(codigo), '') is not null)) not valid;

alter table public.ambientes drop constraint if exists ambientes_icono_valido;
alter table public.ambientes add constraint ambientes_icono_valido
  check (icono is null or icono in ('oficina', 'aula', 'laboratorio', 'contabilidad',
    'personas', 'tecnologia', 'marketing', 'logistica', 'tesoreria')) not valid;

commit;
