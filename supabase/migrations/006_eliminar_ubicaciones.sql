begin;

grant delete on public.pabellones, public.pisos, public.ambientes to authenticated;

drop policy if exists pabellones_eliminar on public.pabellones;
create policy pabellones_eliminar on public.pabellones
  for delete to authenticated
  using ((select private.tiene_rol(array['admin'])));

drop policy if exists pisos_eliminar on public.pisos;
create policy pisos_eliminar on public.pisos
  for delete to authenticated
  using ((select private.tiene_rol(array['admin'])));

drop policy if exists ambientes_eliminar on public.ambientes;
create policy ambientes_eliminar on public.ambientes
  for delete to authenticated
  using ((select private.tiene_rol(array['admin'])));

commit;
