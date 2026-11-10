alter table public.bookings
  add column booking_access_token_hash text
    check (
      booking_access_token_hash is null
      or booking_access_token_hash ~ '^[a-f0-9]{64}$'
    );

alter table public.payments
  add column reconciliation_status text not null default 'none'
    check (reconciliation_status in ('none', 'refund_required', 'resolved'));

update public.payments p
set reconciliation_status = 'refund_required'
from public.bookings b
where b.id = p.booking_id
  and b.status = 'cancelled'
  and p.status = 'successful';

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
  if coalesce(p_booking->>'access_token_hash', '') !~ '^[a-f0-9]{64}$' then
    raise exception 'A valid booking access token hash is required.';
  end if;

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
    reference, booking_access_token_hash, customer_id, area_id,
    appointment_date, departure_time, reserved_minutes, service_minutes,
    total_service_price, reservation_fee, remaining_balance, payment_deadline
  ) values (
    p_booking->>'reference',
    p_booking->>'access_token_hash',
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
  v_booking public.bookings%rowtype;
  v_payment public.payments%rowtype;
begin
  select * into v_booking
  from public.bookings
  where reference = p_reference
  for update;

  if not found then
    return 'not_found';
  end if;

  select * into v_payment
  from public.payments
  where booking_id = v_booking.id
    and provider_ref = p_provider_ref
  for update;

  if not found then
    return 'not_found';
  end if;

  if p_amount is null or p_amount <> v_payment.amount then
    return 'amount_mismatch';
  end if;

  if v_payment.status = 'successful' then
    if v_payment.reconciliation_status = 'refund_required' then
      return 'late_payment_refund_required';
    end if;
    return 'idempotent';
  end if;

  update public.payments
  set status = 'successful',
      raw_payload = left(p_raw_payload, 8000)
  where id = v_payment.id;

  if v_booking.status in ('pending_payment', 'cancelled') then
    begin
      update public.bookings
      set status = 'paid',
          payment_deadline = null
      where id = v_booking.id;

      update public.payments
      set reconciliation_status = 'none'
      where id = v_payment.id;

      return case
        when v_booking.status = 'cancelled' then 'late_payment_reinstated'
        else 'paid'
      end;
    exception
      when exclusion_violation then
        update public.payments
        set reconciliation_status = 'refund_required'
        where id = v_payment.id;
        return 'late_payment_refund_required';
    end;
  end if;

  if v_booking.status in ('paid', 'completed') then
    return 'idempotent';
  end if;

  update public.payments
  set reconciliation_status = 'refund_required'
  where id = v_payment.id;
  return 'late_payment_refund_required';
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
  v_has_successful_payment boolean;
begin
  select * into v_booking
  from public.bookings
  where id = p_booking_id
  for update;

  if not found then
    return jsonb_build_object('result', 'not_found');
  end if;

  perform id
  from public.payments
  where booking_id = v_booking.id
  for update;

  if v_booking.status = 'completed' then
    return jsonb_build_object('result', 'completed');
  end if;

  if v_booking.status = 'cancelled' then
    return jsonb_build_object('result', 'already_cancelled');
  end if;

  select exists (
    select 1
    from public.payments
    where booking_id = v_booking.id and status = 'successful'
  ) into v_has_successful_payment;

  if v_booking.status = 'pending_payment' and v_has_successful_payment then
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

  if v_has_successful_payment then
    update public.payments
    set reconciliation_status = 'refund_required'
    where booking_id = v_booking.id and status = 'successful';
  end if;

  return jsonb_build_object(
    'result', 'cancelled',
    'refund_required', v_has_successful_payment
  );
end;
$$;
