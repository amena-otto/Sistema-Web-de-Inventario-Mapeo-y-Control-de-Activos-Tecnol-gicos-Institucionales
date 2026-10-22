begin;

drop function if exists public.listar_tecnicos_mantenimiento();

create function public.listar_tecnicos_mantenimiento()
returns table (id uuid, nombres text, apellidos text, activo boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null
     or not private.tiene_rol(array['admin', 'tecnico']) then
    raise exception 'No tienes permiso para consultar los técnicos.';
  end if;

  return query
  select p.id, p.nombres, p.apellidos, p.activo
  from public.profiles p
  where p.rol in ('admin', 'tecnico')
  order by p.apellidos, p.nombres;
end;
$$;

revoke all on function public.listar_tecnicos_mantenimiento()
  from public, anon;
grant execute on function public.listar_tecnicos_mantenimiento()
  to authenticated;

notify pgrst, 'reload schema';

commit;
