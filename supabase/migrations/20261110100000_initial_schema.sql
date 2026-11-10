create extension if not exists btree_gist;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.services (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  category text not null check (category in ('haircut', 'major')),
  service_group text not null,
  base_price integer not null check (base_price >= 0),
  base_duration integer not null check (base_duration > 0),
  note text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index services_category_idx on public.services(category);
create index services_group_order_idx on public.services(service_group, sort_order);
create trigger services_set_updated_at
  before update on public.services
  for each row execute function public.set_updated_at();

create table public.service_variants (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services(id) on delete cascade,
  name text not null,
  price integer not null check (price >= 0),
  duration integer not null check (duration > 0),
  created_at timestamptz not null default now(),
  unique (service_id, name)
);
create index service_variants_service_idx on public.service_variants(service_id);

create table public.service_areas (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  travel_minutes integer not null check (travel_minutes >= 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index service_areas_order_idx on public.service_areas(sort_order);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text not null,
  email text,
  address text not null,
  barangay text not null,
  city text not null,
  province text not null,
  landmark text,
  created_at timestamptz not null default now()
);
create index customers_phone_idx on public.customers(phone);

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  customer_id uuid not null references public.customers(id),
  area_id uuid not null references public.service_areas(id),
  appointment_date date not null,
  departure_time integer not null check (departure_time between 480 and 1080),
  reserved_minutes integer not null check (reserved_minutes > 0),
  service_minutes integer not null check (service_minutes > 0),
  total_service_price integer not null check (total_service_price >= 0),
  reservation_fee integer not null check (reservation_fee >= 0),
  remaining_balance integer not null check (remaining_balance >= 0),
  status text not null default 'pending_payment'
    check (status in ('pending_payment', 'paid', 'completed', 'cancelled')),
  cancellation_reason text
    check (cancellation_reason is null or cancellation_reason in ('payment_timeout', 'admin_cancellation')),
  payment_deadline timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (departure_time + reserved_minutes <= 1080),
  check (
    (status = 'pending_payment' and payment_deadline is not null)
    or (status <> 'pending_payment' and payment_deadline is null)
  ),
  constraint bookings_no_overlapping_active_slots
    exclude using gist (
      appointment_date with =,
      int4range(departure_time, departure_time + reserved_minutes, '[)') with &&
    )
    where (status in ('pending_payment', 'paid', 'completed'))
);
create index bookings_date_status_idx on public.bookings(appointment_date, status);
create index bookings_appointment_order_idx
  on public.bookings(appointment_date, departure_time);
create index bookings_customer_idx on public.bookings(customer_id);
create index bookings_area_idx on public.bookings(area_id);
create index bookings_payment_deadline_idx
  on public.bookings(payment_deadline)
  where status = 'pending_payment';
create trigger bookings_set_updated_at
  before update on public.bookings
  for each row execute function public.set_updated_at();

create table public.booking_items (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  service_id uuid references public.services(id) on delete set null,
  service_name text not null,
  variant_name text,
  unit_price integer not null check (unit_price >= 0),
  unit_duration integer not null check (unit_duration > 0),
  quantity integer not null check (quantity > 0),
  unit_category text not null check (unit_category in ('haircut', 'major')),
  created_at timestamptz not null default now()
);
create index booking_items_booking_idx on public.booking_items(booking_id);
create index booking_items_service_idx on public.booking_items(service_id);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  provider_ref text not null unique,
  provider_type text not null default 'checkout'
    check (provider_type in ('checkout', 'payment')),
  amount integer not null check (amount >= 0),
  currency text not null default 'PHP' check (currency = 'PHP'),
  status text not null default 'pending'
    check (status in ('pending', 'successful', 'failed')),
  raw_payload text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index payments_booking_idx on public.payments(booking_id);
create index payments_status_idx on public.payments(status);
create trigger payments_set_updated_at
  before update on public.payments
  for each row execute function public.set_updated_at();

create table public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.services enable row level security;
alter table public.service_variants enable row level security;
alter table public.service_areas enable row level security;
alter table public.customers enable row level security;
alter table public.bookings enable row level security;
alter table public.booking_items enable row level security;
alter table public.payments enable row level security;
alter table public.admin_users enable row level security;

create policy "Public can read services"
  on public.services for select to anon, authenticated using (true);
create policy "Public can read service variants"
  on public.service_variants for select to anon, authenticated using (true);
create policy "Public can read service areas"
  on public.service_areas for select to anon, authenticated using (true);
create policy "Admins can read their own allowlist entry"
  on public.admin_users for select to authenticated using (user_id = auth.uid());

revoke all on public.services, public.service_variants, public.service_areas,
  public.customers, public.bookings, public.booking_items, public.payments,
  public.admin_users from anon, authenticated;
grant select on public.services, public.service_variants, public.service_areas to anon, authenticated;
grant select on public.admin_users to authenticated;
grant all on public.services, public.service_variants, public.service_areas,
  public.customers, public.bookings, public.booking_items, public.payments,
  public.admin_users to service_role;

create or replace function public.release_expired_pending_bookings()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_released integer;
begin
  with expired as (
    update public.bookings b
    set status = case
          when exists (
            select 1 from public.payments p
            where p.booking_id = b.id and p.status = 'successful'
          ) then 'paid'
          else 'cancelled'
        end,
        cancellation_reason = case
          when exists (
            select 1 from public.payments p
            where p.booking_id = b.id and p.status = 'successful'
          ) then null
          else 'payment_timeout'
        end,
        payment_deadline = null
    where b.status = 'pending_payment'
      and b.payment_deadline < now()
    returning status
  )
  select count(*) filter (where status = 'cancelled')::integer
    into v_released
  from expired;

  return coalesce(v_released, 0);
end;
$$;

create or replace function public.create_booking(
  p_customer jsonb,
  p_booking jsonb,
  p_items jsonb,
  p_payment jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_customer_id uuid;
  v_booking_id uuid;
begin
  perform public.release_expired_pending_bookings();

  insert into public.customers (
    full_name, phone, email, address, barangay, city, province, landmark
  ) values (
    p_customer->>'full_name',
    p_customer->>'phone',
    nullif(p_customer->>'email', ''),
    p_customer->>'address',
    p_customer->>'barangay',
    p_customer->>'city',
    p_customer->>'province',
    nullif(p_customer->>'landmark', '')
  ) returning id into v_customer_id;

  insert into public.bookings (
    reference, customer_id, area_id, appointment_date, departure_time,
    reserved_minutes, service_minutes, total_service_price, reservation_fee,
    remaining_balance, payment_deadline
  ) values (
    p_booking->>'reference',
    v_customer_id,
    (p_booking->>'area_id')::uuid,
    (p_booking->>'appointment_date')::date,
    (p_booking->>'departure_time')::integer,
    (p_booking->>'reserved_minutes')::integer,
    (p_booking->>'service_minutes')::integer,
    (p_booking->>'total_service_price')::integer,
    (p_booking->>'reservation_fee')::integer,
    (p_booking->>'remaining_balance')::integer,
    (p_booking->>'payment_deadline')::timestamptz
  ) returning id into v_booking_id;

  insert into public.booking_items (
    booking_id, service_id, service_name, variant_name, unit_price,
    unit_duration, quantity, unit_category
  )
  select
    v_booking_id,
    nullif(item->>'service_id', '')::uuid,
    item->>'service_name',
    nullif(item->>'variant_name', ''),
    (item->>'unit_price')::integer,
    (item->>'unit_duration')::integer,
    (item->>'quantity')::integer,
    item->>'unit_category'
  from jsonb_array_elements(p_items) as items(item);

  insert into public.payments (
    booking_id, provider_ref, provider_type, amount, currency, status
  ) values (
    v_booking_id,
    p_payment->>'provider_ref',
    'checkout',
    (p_payment->>'amount')::integer,
    'PHP',
    'pending'
  );

  return jsonb_build_object(
    'id', v_booking_id,
    'reference', p_booking->>'reference'
  );
end;
$$;

create or replace function public.record_payment_success(
  p_reference text,
  p_provider_ref text,
  p_amount integer,
  p_raw_payload text
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_payment public.payments%rowtype;
  v_booking public.bookings%rowtype;
begin
  select p.* into v_payment
  from public.payments p
  join public.bookings b on b.id = p.booking_id
  where b.reference = p_reference and p.provider_ref = p_provider_ref
  for update of p;

  if not found then
    return 'not_found';
  end if;

  select * into v_booking
  from public.bookings
  where id = v_payment.booking_id
  for update;

  if v_payment.status = 'successful' then
    return 'idempotent';
  end if;

  if p_amount is not null and p_amount <> v_payment.amount then
    update public.payments
    set status = 'failed', raw_payload = left(p_raw_payload, 8000)
    where id = v_payment.id;
    return 'amount_mismatch';
  end if;

  update public.payments
  set status = 'successful', raw_payload = left(p_raw_payload, 8000)
  where id = v_payment.id;

  if v_booking.status = 'pending_payment' then
    update public.bookings
    set status = 'paid', payment_deadline = null, cancellation_reason = null
    where id = v_booking.id;
    return 'paid';
  end if;

  return case when v_booking.status = 'paid' then 'idempotent' else 'late_payment' end;
end;
$$;

create or replace function public.admin_cancel_booking(p_booking_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_booking public.bookings%rowtype;
begin
  select * into v_booking
  from public.bookings
  where id = p_booking_id
  for update;

  if not found then
    return jsonb_build_object('result', 'not_found');
  end if;

  if v_booking.status = 'completed' then
    return jsonb_build_object('result', 'completed');
  end if;

  if v_booking.status = 'cancelled' then
    return jsonb_build_object('result', 'already_cancelled');
  end if;

  if v_booking.status = 'pending_payment' and exists (
    select 1 from public.payments p
    where p.booking_id = v_booking.id and p.status = 'successful'
  ) then
    update public.bookings
    set status = 'paid', payment_deadline = null
    where id = v_booking.id;
    return jsonb_build_object('result', 'payment_conflict');
  end if;

  update public.bookings
  set status = 'cancelled',
      cancellation_reason = 'admin_cancellation',
      payment_deadline = null
  where id = v_booking.id;

  return jsonb_build_object('result', 'cancelled');
end;
$$;

create or replace function public.admin_complete_booking(p_booking_id uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_status text;
begin
  select status into v_status
  from public.bookings
  where id = p_booking_id
  for update;

  if not found then
    return 'not_found';
  end if;
  if v_status <> 'paid' then
    return 'invalid_status';
  end if;

  update public.bookings set status = 'completed' where id = p_booking_id;
  return 'completed';
end;
$$;

revoke all on function public.release_expired_pending_bookings() from public, anon, authenticated;
revoke all on function public.create_booking(jsonb, jsonb, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.record_payment_success(text, text, integer, text) from public, anon, authenticated;
revoke all on function public.admin_cancel_booking(uuid) from public, anon, authenticated;
revoke all on function public.admin_complete_booking(uuid) from public, anon, authenticated;
grant execute on function public.release_expired_pending_bookings() to service_role;
grant execute on function public.create_booking(jsonb, jsonb, jsonb, jsonb) to service_role;
grant execute on function public.record_payment_success(text, text, integer, text) to service_role;
grant execute on function public.admin_cancel_booking(uuid) to service_role;
grant execute on function public.admin_complete_booking(uuid) to service_role;
