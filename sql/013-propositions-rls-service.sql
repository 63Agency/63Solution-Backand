-- Si la suppression via l’API Nest échoue alors que la clé service_role est correcte,
-- vérifiez que RLS n’est pas mal configuré sur public.propositions.
-- Le backend Nest utilise SUPABASE_SERVICE_ROLE_KEY (bypass RLS).
-- Ce script désactive RLS sur propositions pour éviter les blocages si vous accédez
-- aussi à la table avec la clé anon côté front.

alter table public.propositions disable row level security;

-- Alternative : garder RLS et autoriser le rôle service (si vous préférez RLS actif) :
-- alter table public.propositions enable row level security;
-- drop policy if exists "propositions_service_all" on public.propositions;
-- create policy "propositions_service_all" on public.propositions
--   for all using (true) with check (true);
