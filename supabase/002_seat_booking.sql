-- Run after schema.sql. Existing remaining-seat counts are preserved as outside-app bookings.
alter table public.ride_offers add column if not exists seat_capacity integer not null default 4;
alter table public.ride_offers add column if not exists external_seats integer not null default 0;
alter table public.ride_offers add column if not exists confirmed_seats integer not null default 0;
alter table public.ride_offers add column if not exists share_code uuid not null default gen_random_uuid();
create unique index if not exists ride_offers_share_code_idx on public.ride_offers(share_code);

update public.ride_offers
set seat_capacity = greatest(4, seats_available),
    external_seats = greatest(4, seats_available) - seats_available,
    confirmed_seats = 0
where confirmed_seats = 0 and external_seats = 0
  and (seat_capacity <> greatest(4, seats_available) or seats_available <> seat_capacity);

alter table public.ride_offers add constraint ride_seat_capacity_check check (seat_capacity between 1 and 20);
alter table public.ride_offers add constraint ride_seat_counts_check check (
  external_seats >= 0 and confirmed_seats >= 0 and
  external_seats + confirmed_seats <= seat_capacity and
  seats_available = seat_capacity - external_seats - confirmed_seats
);

create or replace function public.sync_ride_seats() returns trigger language plpgsql as $$
begin
  if new.seat_capacity not between 1 and 20 or new.external_seats < 0 or new.confirmed_seats < 0
    or new.external_seats + new.confirmed_seats > new.seat_capacity then
    raise exception 'Seat count exceeds capacity';
  end if;
  new.seats_available := new.seat_capacity - new.external_seats - new.confirmed_seats;
  if new.status <> 'cancelled' then
    new.status := case when new.seats_available = 0 then 'full' else 'published' end;
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists sync_ride_seats_trigger on public.ride_offers;
create trigger sync_ride_seats_trigger before insert or update on public.ride_offers
for each row execute function public.sync_ride_seats();

create table if not exists public.seat_requests (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.ride_offers(id) on delete cascade,
  passenger_id uuid not null references auth.users(id) on delete cascade,
  passenger_name text not null check (char_length(trim(passenger_name)) between 2 and 80),
  phone_e164 text not null check (phone_e164 ~ '^234[0-9]{10}$'),
  requested_seats integer not null check (requested_seats between 1 and 20),
  confirmed_seats integer not null default 0 check (confirmed_seats between 0 and 20),
  status text not null default 'pending' check (status in ('pending','booked','declined','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint confirmed_request_count check (
    (status = 'booked' and confirmed_seats between 1 and requested_seats)
    or (status <> 'booked' and confirmed_seats = 0)
  )
);
create unique index if not exists seat_requests_one_active_idx on public.seat_requests(offer_id, passenger_id)
  where status in ('pending','booked');
create index if not exists seat_requests_offer_idx on public.seat_requests(offer_id, created_at desc);
create index if not exists seat_requests_passenger_idx on public.seat_requests(passenger_id, created_at desc);
alter table public.seat_requests enable row level security;
revoke all on public.seat_requests from anon, authenticated;
grant select on public.seat_requests to authenticated;
create policy "passenger or driver reads seat request" on public.seat_requests for select to authenticated
  using (passenger_id = (select auth.uid()) or exists (
    select 1 from public.ride_offers o where o.id = offer_id and o.driver_id = (select auth.uid())
  ));

create or replace function public.get_my_seat_requests()
returns table (id uuid, offer_id uuid, passenger_name text, requested_seats integer,
  confirmed_seats integer, status text, created_at timestamptz,
  from_city text, to_city text, travel_date date)
language sql security definer set search_path = public, pg_temp as $$
  select r.id,r.offer_id,r.passenger_name,r.requested_seats,r.confirmed_seats,r.status,r.created_at,
    o.from_city,o.to_city,o.travel_date
  from public.seat_requests r join public.ride_offers o on o.id=r.offer_id
  where r.passenger_id=auth.uid() order by r.created_at desc limit 100;
$$;

-- An anonymous passenger has the authenticated database role. It must not acquire driver writes.
drop policy if exists "driver creates own profile" on public.driver_profiles;
create policy "driver creates own profile" on public.driver_profiles for insert to authenticated
  with check (user_id = (select auth.uid()) and coalesce((auth.jwt()->>'is_anonymous')::boolean,false) = false);
drop policy if exists "driver updates own profile" on public.driver_profiles;
create policy "driver updates own profile" on public.driver_profiles for update to authenticated
  using (user_id = (select auth.uid()) and coalesce((auth.jwt()->>'is_anonymous')::boolean,false) = false)
  with check (user_id = (select auth.uid()) and coalesce((auth.jwt()->>'is_anonymous')::boolean,false) = false);
drop policy if exists "driver creates own vehicles" on public.vehicles;
create policy "driver creates own vehicles" on public.vehicles for insert to authenticated
  with check (driver_id = (select auth.uid()) and coalesce((auth.jwt()->>'is_anonymous')::boolean,false) = false);
drop policy if exists "driver updates own vehicles" on public.vehicles;
create policy "driver updates own vehicles" on public.vehicles for update to authenticated
  using (driver_id = (select auth.uid()) and coalesce((auth.jwt()->>'is_anonymous')::boolean,false) = false)
  with check (driver_id = (select auth.uid()) and coalesce((auth.jwt()->>'is_anonymous')::boolean,false) = false);
drop policy if exists "driver creates own documents" on public.driver_documents;
create policy "driver creates own documents" on public.driver_documents for insert to authenticated
  with check (driver_id = (select auth.uid()) and coalesce((auth.jwt()->>'is_anonymous')::boolean,false) = false
    and (vehicle_id is null or exists (select 1 from public.vehicles v where v.id=vehicle_id and v.driver_id=(select auth.uid()))));
drop policy if exists "driver updates own documents" on public.driver_documents;
create policy "driver updates own documents" on public.driver_documents for update to authenticated
  using (driver_id = (select auth.uid()) and coalesce((auth.jwt()->>'is_anonymous')::boolean,false) = false)
  with check (driver_id = (select auth.uid()) and coalesce((auth.jwt()->>'is_anonymous')::boolean,false) = false);
drop policy if exists "driver uploads own documents" on storage.objects;
create policy "driver uploads own documents" on storage.objects for insert to authenticated
  with check (bucket_id='driver-documents' and (storage.foldername(name))[1]=(select auth.uid())::text
    and coalesce((auth.jwt()->>'is_anonymous')::boolean,false) = false);
drop policy if exists "driver publishes own ride" on public.ride_offers;
create policy "driver publishes own ride" on public.ride_offers for insert to authenticated
  with check (driver_id=(select auth.uid()) and coalesce((auth.jwt()->>'is_anonymous')::boolean,false) = false
    and status='published' and seats_available=seat_capacity and external_seats=0 and confirmed_seats=0
    and travel_date>=current_date
    and exists(select 1 from public.driver_profiles p where p.user_id=(select auth.uid()))
    and (vehicle_id is null or exists(select 1 from public.vehicles v where v.id=vehicle_id and v.driver_id=(select auth.uid()))));
revoke update on public.ride_offers from authenticated;

create or replace function public.get_shared_offer(p_offer_id uuid, p_share_code uuid)
returns setof public.ride_offers language sql security definer set search_path = public, pg_temp as $$
  select o.* from public.ride_offers o
  where o.id = p_offer_id and o.share_code = p_share_code
    and o.status <> 'cancelled' and o.travel_date >= current_date;
$$;

create or replace function public.submit_seat_request(
  p_offer_id uuid, p_share_code uuid, p_name text, p_phone text, p_seats integer
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare o public.ride_offers%rowtype; result uuid;
begin
  if auth.uid() is null then raise exception 'Passenger session required'; end if;
  if length(trim(coalesce(p_name,''))) not between 2 and 80 or p_phone !~ '^234[0-9]{10}$'
    or p_seats is null or p_seats not between 1 and 20 then
    raise exception 'Check passenger details and seat quantity';
  end if;
  select * into o from public.ride_offers where id = p_offer_id for update;
  if not found or o.status = 'cancelled' or o.travel_date < current_date then
    raise exception 'This journey is no longer available';
  end if;
  if o.status = 'full' then
    if p_share_code is distinct from o.share_code or p_seats > o.external_seats then
      raise exception 'This full journey needs a valid driver link and outside-app seats';
    end if;
  elsif p_seats > o.seats_available and (p_share_code is distinct from o.share_code or p_seats > o.external_seats) then
    raise exception 'Not enough seats for this request';
  end if;
  insert into public.seat_requests(offer_id,passenger_id,passenger_name,phone_e164,requested_seats)
  values (p_offer_id,auth.uid(),trim(p_name),p_phone,p_seats) returning id into result;
  return result;
exception when unique_violation then
  raise exception 'You already have an active request for this journey';
end $$;

create or replace function public.confirm_seat_request(p_request_id uuid, p_seats integer, p_from_external boolean)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare o public.ride_offers%rowtype; r public.seat_requests%rowtype; offer_key uuid;
begin
  select offer_id into offer_key from public.seat_requests where id=p_request_id;
  if offer_key is null then raise exception 'Request not found'; end if;
  select * into o from public.ride_offers where id=offer_key for update;
  if o.driver_id is distinct from auth.uid() or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then
    raise exception 'Only this driver can confirm seats';
  end if;
  select * into r from public.seat_requests where id=p_request_id for update;
  if r.status <> 'pending' or o.status = 'cancelled' then raise exception 'Request is no longer pending'; end if;
  if p_seats is null or p_seats < 1 or p_seats > r.requested_seats then raise exception 'Invalid confirmed seat count'; end if;
  if coalesce(p_from_external,false) then
    if o.external_seats < p_seats then raise exception 'Not enough outside-app seats to transfer'; end if;
    update public.ride_offers set external_seats=external_seats-p_seats,confirmed_seats=confirmed_seats+p_seats where id=o.id;
  else
    if o.seats_available < p_seats then raise exception 'Not enough seats remain; confirm fewer or transfer outside-app seats'; end if;
    update public.ride_offers set confirmed_seats=confirmed_seats+p_seats where id=o.id;
  end if;
  update public.seat_requests set status='booked',confirmed_seats=p_seats,updated_at=now() where id=r.id;
end $$;

create or replace function public.decline_seat_request(p_request_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare offer_key uuid; o public.ride_offers%rowtype; r public.seat_requests%rowtype;
begin
  select offer_id into offer_key from public.seat_requests where id=p_request_id;
  select * into o from public.ride_offers where id=offer_key for update;
  if o.driver_id is distinct from auth.uid() or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then
    raise exception 'Only this driver can decline requests';
  end if;
  select * into r from public.seat_requests where id=p_request_id for update;
  if r.status <> 'pending' then raise exception 'Request is no longer pending'; end if;
  update public.seat_requests set status='declined',updated_at=now() where id=r.id;
end $$;

create or replace function public.cancel_seat_booking(p_request_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare offer_key uuid; o public.ride_offers%rowtype; r public.seat_requests%rowtype;
begin
  select offer_id into offer_key from public.seat_requests where id=p_request_id;
  select * into o from public.ride_offers where id=offer_key for update;
  if o.driver_id is distinct from auth.uid() or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then
    raise exception 'Only this driver can cancel booked seats';
  end if;
  select * into r from public.seat_requests where id=p_request_id for update;
  if r.status <> 'booked' then raise exception 'Booking is no longer active'; end if;
  update public.ride_offers set confirmed_seats=confirmed_seats-r.confirmed_seats where id=o.id;
  update public.seat_requests set status='cancelled',confirmed_seats=0,updated_at=now() where id=r.id;
end $$;

create or replace function public.set_ride_inventory(p_offer_id uuid, p_capacity integer, p_external integer)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare o public.ride_offers%rowtype;
begin
  select * into o from public.ride_offers where id=p_offer_id for update;
  if o.driver_id is distinct from auth.uid() or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then
    raise exception 'Only this driver can change seats';
  end if;
  if o.status='cancelled' then raise exception 'Cancelled journeys cannot be changed'; end if;
  if p_capacity is null or p_capacity not between 1 and 20 or p_external is null or p_external < 0
    or p_external + o.confirmed_seats > p_capacity then raise exception 'Seat count exceeds capacity'; end if;
  update public.ride_offers set seat_capacity=p_capacity,external_seats=p_external where id=p_offer_id;
end $$;

create or replace function public.cancel_ride(p_offer_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare o public.ride_offers%rowtype;
begin
  select * into o from public.ride_offers where id=p_offer_id for update;
  if o.driver_id is distinct from auth.uid() or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then
    raise exception 'Only this driver can cancel the journey';
  end if;
  update public.ride_offers set status='cancelled' where id=p_offer_id;
  update public.seat_requests set status='cancelled',confirmed_seats=0,updated_at=now()
    where offer_id=p_offer_id and status in ('pending','booked');
end $$;

revoke all on function public.get_shared_offer(uuid,uuid), public.submit_seat_request(uuid,uuid,text,text,integer),
  public.confirm_seat_request(uuid,integer,boolean), public.decline_seat_request(uuid),
  public.cancel_seat_booking(uuid), public.set_ride_inventory(uuid,integer,integer), public.cancel_ride(uuid)
  from public, anon, authenticated;
revoke all on function public.get_my_seat_requests() from public, anon, authenticated;
grant execute on function public.get_my_seat_requests() to authenticated;
grant execute on function public.get_shared_offer(uuid,uuid) to anon, authenticated;
grant execute on function public.submit_seat_request(uuid,uuid,text,text,integer),
  public.confirm_seat_request(uuid,integer,boolean), public.decline_seat_request(uuid),
  public.cancel_seat_booking(uuid), public.set_ride_inventory(uuid,integer,integer), public.cancel_ride(uuid)
  to authenticated;
