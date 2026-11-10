-- Keep ended journeys for records while removing them from every live passenger path.
-- Journey times are interpreted in Nigeria's Africa/Lagos timezone.

drop policy if exists "guest sees available published rides" on public.ride_offers;
create policy "guest sees available published rides" on public.ride_offers for select to anon
  using (
    status = 'published'
    and seats_available > 0
    and (travel_date + departure_time) >= (now() at time zone 'Africa/Lagos')
  );

drop policy if exists "driver sees available and own rides" on public.ride_offers;
create policy "driver sees available and own rides" on public.ride_offers for select to authenticated
  using (
    (
      status = 'published'
      and seats_available > 0
      and (travel_date + departure_time) >= (now() at time zone 'Africa/Lagos')
    )
    or driver_id = (select auth.uid())
  );

create or replace function public.get_shared_offer(p_offer_id uuid, p_share_code uuid)
returns setof public.ride_offers language sql security definer set search_path = public, pg_temp as $$
  select o.* from public.ride_offers o
  where o.id = p_offer_id and o.share_code = p_share_code
    and o.status <> 'cancelled'
    and (o.travel_date + o.departure_time) >= (now() at time zone 'Africa/Lagos');
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
  if not found or o.status = 'cancelled'
    or (o.travel_date + o.departure_time) < (now() at time zone 'Africa/Lagos') then
    raise exception 'This journey is no longer available';
  end if;
  if o.status = 'full' then
    if p_share_code is distinct from o.share_code or p_seats > o.external_seats then
      raise exception 'This full journey needs a valid driver link and outside-app seats';
    end if;
  elsif p_seats > o.seats_available
    and (p_share_code is distinct from o.share_code or p_seats > o.external_seats) then
    raise exception 'Not enough seats for this request';
  end if;
  insert into public.seat_requests(offer_id,passenger_id,passenger_name,phone_e164,requested_seats)
  values (p_offer_id,auth.uid(),trim(p_name),p_phone,p_seats) returning id into result;
  return result;
exception when unique_violation then
  raise exception 'You already have an active request for this journey';
end $$;

