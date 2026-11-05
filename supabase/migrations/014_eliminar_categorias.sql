begin;

-- Solo los administradores pueden eliminar categorías. La aplicación valida
-- antes que la categoría no tenga equipos asignados.
grant delete on public.categorias_equipos to authenticated;

drop policy if exists categorias_eliminar on public.categorias_equipos;
create policy categorias_eliminar on public.categorias_equipos
  for delete to authenticated
  using ((select private.tiene_rol(array['admin'])));

commit;
