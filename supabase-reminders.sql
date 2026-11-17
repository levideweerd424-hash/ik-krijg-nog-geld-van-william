-- Voer dit eenmalig uit in Supabase > SQL Editor.
alter table public.claims
  add column if not exists due_date date,
  add column if not exists notification_email text;
