-- v3: add data_room_consent event type (idempotent-ish)
do $$
begin
  if not exists (
    select 1
    from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'security_event_type'
      and e.enumlabel = 'data_room_consent'
  ) then
    alter type public.security_event_type add value 'data_room_consent';
  end if;
end $$;

