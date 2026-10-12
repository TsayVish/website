-- ═════════════════════════════════════════════════════════════════════════
-- Deleting AI Studio results. Removes a finished (or failed) job and the files it
-- made from the library; returns their storage paths so the app can delete the files.
-- Credit history keeps its rows. Safe to run again.
-- ═════════════════════════════════════════════════════════════════════════
create or replace function public.studio_delete_generation(p_id uuid)
returns setof text language plpgsql security definer set search_path = ''
as $$
declare g public.studio_generations;
begin
  select * into g from public.studio_generations where id = p_id;
  if g.id is null or not public.can_edit_project(g.project_id) then raise exception 'Not found.'; end if;
  if g.status in ('queued', 'running') then raise exception 'Stop it first, then delete it.'; end if;
  return query delete from public.studio_media where generation_id = p_id returning path;
  delete from public.studio_generations where id = p_id;
end;
$$;
grant execute on function public.studio_delete_generation(uuid) to authenticated;
