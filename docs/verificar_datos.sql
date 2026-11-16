-- Solo lectura. Ejecutar antes y después del ajuste de estructura, sin escrituras
-- concurrentes. La nueva columna icono se excluye de la huella de ambientes.
select 'ambientes' as tabla, count(*) as registros,
  md5(coalesce(string_agg((to_jsonb(t) - 'icono')::text, E'\n' order by id), '')) as huella
from public.ambientes t
union all
select 'pabellones', count(*), md5(coalesce(string_agg(to_jsonb(t)::text, E'\n' order by id), '')) from public.pabellones t
union all
select 'pisos', count(*), md5(coalesce(string_agg(to_jsonb(t)::text, E'\n' order by id), '')) from public.pisos t
union all
select 'equipos', count(*), md5(coalesce(string_agg(to_jsonb(t)::text, E'\n' order by id), '')) from public.equipos t
union all
select 'movimientos', count(*), md5(coalesce(string_agg(to_jsonb(t)::text, E'\n' order by id), '')) from public.movimientos t
order by tabla;
