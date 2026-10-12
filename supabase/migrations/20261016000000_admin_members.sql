-- ═════════════════════════════════════════════════════════════════════════
-- Admin → Members: remove a member's monthly AI Studio spend cap. Safe to run again.
-- ═════════════════════════════════════════════════════════════════════════
create or replace function public.admin_clear_studio_limit(p_user uuid)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  perform public.require_staff();
  delete from public.studio_limits where user_id = p_user;
  perform public.log_admin_action('studio_limit_removed', 'user', p_user::text, '{}'::jsonb);
end;
$$;
grant execute on function public.admin_clear_studio_limit(uuid) to authenticated;
