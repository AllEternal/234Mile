-- Publish only the vehicle plate attached to a journey.
-- All source documents and other vehicle-particular fields remain protected by their existing RLS policies.

alter table public.ride_offers
  add column if not exists vehicle_plate text;

update public.ride_offers offer
set vehicle_plate = vehicle.plate_number
from public.vehicles vehicle
where offer.vehicle_id = vehicle.id
  and nullif(trim(offer.vehicle_plate),'') is null;

comment on column public.ride_offers.vehicle_plate is
  'Public identification plate for the vehicle assigned to this journey. No other particulars are exposed here.';
