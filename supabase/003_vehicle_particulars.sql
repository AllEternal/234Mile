-- Optional vehicle-particular records with driver-reviewed photo extraction.
-- Run after 002_seat_booking.sql.

alter table public.driver_documents
  alter column storage_path drop not null;

alter table public.driver_documents
  add column if not exists chassis_number text,
  add column if not exists engine_number text,
  add column if not exists expiry_date date,
  add column if not exists extracted_fields jsonb not null default '{}'::jsonb,
  add column if not exists extracted_text text,
  add column if not exists entry_method text not null default 'photo_manual';

alter table public.driver_documents
  drop constraint if exists driver_documents_entry_method_check;

alter table public.driver_documents
  add constraint driver_documents_entry_method_check
  check (entry_method in ('manual','photo_manual','photo_extracted'));

alter table public.driver_documents
  drop constraint if exists driver_documents_has_content_check;

alter table public.driver_documents
  add constraint driver_documents_has_content_check check (
    storage_path is not null
    or nullif(trim(document_number),'') is not null
    or nullif(trim(name_on_document),'') is not null
    or nullif(trim(plate_on_document),'') is not null
    or nullif(trim(chassis_number),'') is not null
    or nullif(trim(engine_number),'') is not null
  );

comment on column public.driver_documents.extracted_text is
  'Raw OCR suggestion retained privately for the owning driver; not authenticity verification.';
