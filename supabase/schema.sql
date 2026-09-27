-- 234Mile pilot schema. Run in a new Supabase project, not alongside the old unrestricted trips policies.
create extension if not exists pgcrypto;

create table if not exists public.driver_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 2 and 80),
  phone_e164 text not null check (phone_e164 ~ '^234[0-9]{10}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.vehicles (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references auth.users(id) on delete cascade,
  make text not null,
  model text not null,
  colour text,
  plate_number text not null,
  relationship text not null check (relationship in ('owned','company','rented','borrowed')),
  registered_owner text not null,
  created_at timestamptz not null default now()
);
create index if not exists vehicles_driver_id_idx on public.vehicles(driver_id);

create table if not exists public.driver_documents (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references auth.users(id) on delete cascade,
  vehicle_id uuid references public.vehicles(id) on delete set null,
  kind text not null check (kind in ('licence','vehicle_particulars')),
  storage_path text not null,
  document_number text,
  name_on_document text,
  plate_on_document text,
  status text not null default 'collected' check (status in ('collected','driver_corrected')),
  created_at timestamptz not null default now()
);
create index if not exists driver_documents_driver_id_idx on public.driver_documents(driver_id);

create table if not exists public.ride_offers (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references auth.users(id) on delete cascade,
  vehicle_id uuid references public.vehicles(id) on delete set null,
  driver_name text not null,
  phone_e164 text not null check (phone_e164 ~ '^234[0-9]{10}$'),
  vehicle_summary text not null,
  from_city text not null,
  to_city text not null,
  travel_date date not null,
  departure_time time not null,
  pickup text not null,
  dropoff text not null,
  price_per_seat integer not null check (price_per_seat > 0 and price_per_seat <= 1000000),
  seats_available integer not null check (seats_available between 0 and 20),
  status text not null default 'published' check (status in ('published','full','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint different_cities check (lower(trim(from_city)) <> lower(trim(to_city)))
);
create index if not exists ride_offers_search_idx on public.ride_offers(travel_date,from_city,to_city)
  where status = 'published' and seats_available > 0;
create index if not exists ride_offers_driver_idx on public.ride_offers(driver_id,travel_date desc);

alter table public.driver_profiles enable row level security;
alter table public.vehicles enable row level security;
alter table public.driver_documents enable row level security;
alter table public.ride_offers enable row level security;

revoke all on public.driver_profiles, public.vehicles, public.driver_documents, public.ride_offers from anon, authenticated;
grant select, insert, update on public.driver_profiles, public.vehicles, public.driver_documents to authenticated;
grant select on public.ride_offers to anon, authenticated;
grant insert, update on public.ride_offers to authenticated;

create policy "driver reads own profile" on public.driver_profiles for select to authenticated using ((select auth.uid()) = user_id);
create policy "driver creates own profile" on public.driver_profiles for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "driver updates own profile" on public.driver_profiles for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "driver reads own vehicles" on public.vehicles for select to authenticated using ((select auth.uid()) = driver_id);
create policy "driver creates own vehicles" on public.vehicles for insert to authenticated with check ((select auth.uid()) = driver_id);
create policy "driver updates own vehicles" on public.vehicles for update to authenticated using ((select auth.uid()) = driver_id) with check ((select auth.uid()) = driver_id);
create policy "driver reads own documents" on public.driver_documents for select to authenticated using ((select auth.uid()) = driver_id);
create policy "driver creates own documents" on public.driver_documents for insert to authenticated with check ((select auth.uid()) = driver_id and (vehicle_id is null or exists (select 1 from public.vehicles v where v.id=vehicle_id and v.driver_id=(select auth.uid()))));
create policy "driver updates own documents" on public.driver_documents for update to authenticated using ((select auth.uid()) = driver_id) with check ((select auth.uid()) = driver_id);

create policy "guest sees available published rides" on public.ride_offers for select to anon
  using (status='published' and seats_available>0 and travel_date>=current_date);
create policy "driver sees available and own rides" on public.ride_offers for select to authenticated
  using ((status='published' and seats_available>0 and travel_date>=current_date) or driver_id=(select auth.uid()));
create policy "driver publishes own ride" on public.ride_offers for insert to authenticated
  with check (driver_id=(select auth.uid()) and status='published' and seats_available>0
    and travel_date>=current_date and exists(select 1 from public.driver_profiles p where p.user_id=(select auth.uid()))
    and (vehicle_id is null or exists(select 1 from public.vehicles v where v.id=vehicle_id and v.driver_id=(select auth.uid()))));
create policy "driver updates own ride" on public.ride_offers for update to authenticated
  using (driver_id=(select auth.uid()))
  with check (driver_id=(select auth.uid()) and (vehicle_id is null or exists(select 1 from public.vehicles v where v.id=vehicle_id and v.driver_id=(select auth.uid()))));

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('driver-documents','driver-documents',false,5242880,array['image/jpeg','image/png','application/pdf'])
on conflict (id) do nothing;
create policy "driver uploads own documents" on storage.objects for insert to authenticated
  with check (bucket_id='driver-documents' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy "driver reads own document files" on storage.objects for select to authenticated
  using (bucket_id='driver-documents' and (storage.foldername(name))[1]=(select auth.uid())::text);
