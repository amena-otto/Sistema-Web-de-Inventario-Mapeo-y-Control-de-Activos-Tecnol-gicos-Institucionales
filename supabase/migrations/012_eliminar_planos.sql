begin;

-- Los administradores pueden eliminar los planos del bucket privado. Sin esta
-- política, la aplicación puede desvincular el plano del piso, pero el archivo
-- permanece en Storage y sigue consumiendo cuota.
drop policy if exists planos_institucionales_eliminar on storage.objects;
create policy planos_institucionales_eliminar
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'planos-institucionales'
    and (select private.tiene_rol(array['admin']))
    and (storage.foldername(name))[1] = 'pisos'
  );

commit;
