-- =====================================================================
-- BIKE HIRE: database setup for Supabase
-- Paste this WHOLE file into Supabase > SQL Editor > New query > Run.
--
-- BEFORE YOU RUN IT: change CHANGE-THIS-SETUP-CODE (near the bottom of
-- section 2) to your own secret code. You will type that code once on
-- the setup page to create the master admin. Anyone without it cannot
-- create an admin account.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------
-- 1. TABLES
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        text not null,
  display_name text not null,
  phone        text not null default '',
  stand_name   text not null default '',
  role         text not null check (role in ('admin', 'operator')),
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);

create table if not exists public.app_secrets (k text primary key, v text not null);

create table if not exists public.invites (
  code         text primary key,
  email        text not null,
  display_name text not null,
  phone        text not null default '',
  stand_name   text not null default '',
  created_by   uuid,
  expires_at   timestamptz not null,
  used_at      timestamptz
);

create table if not exists public.site_settings (k text primary key, v text not null default '');

create table if not exists public.posts (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  body        text not null default '',
  image       text not null default '',
  button_text text not null default '',
  button_link text not null default '',
  published   boolean not null default true,
  created_at  timestamptz not null default now()
);

create table if not exists public.logos (
  id         uuid primary key default gen_random_uuid(),
  path       text not null,
  label      text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.bikes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id),
  number     text not null,
  note       text not null default '',
  active     boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index if not exists bikes_unique_number on public.bikes (user_id, lower(number));

create table if not exists public.bookings (
  id           uuid primary key default gen_random_uuid(),
  code         text not null unique,
  stand_id     uuid not null references public.profiles(id),
  renter_name  text not null,
  reg_no       text not null,
  phone        text not null,
  want_date    date not null,
  want_time    text not null default '',
  minutes      int  not null,
  note         text not null default '',
  status       text not null default 'pending'
               check (status in ('pending', 'approved', 'declined', 'cancelled', 'done')),
  staff_message text not null default '',
  bike_number  text not null default '',
  rental_id    uuid,
  decided_at   timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists bookings_by_stand on public.bookings (stand_id, status, want_date);

create table if not exists public.rentals (
  id          uuid primary key,
  bike_id     uuid not null references public.bikes(id),
  user_id     uuid not null references public.profiles(id),
  renter_name text not null,
  reg_no      text not null,
  phone       text not null default '',
  photo       text not null default '',
  start_at    timestamptz not null,
  due_at      timestamptz not null,
  minutes     int  not null,
  rate        int  not null,
  grace_min   int  not null default 5,
  returned_at timestamptz,
  amount      int,
  booking_id  uuid,
  created_at  timestamptz not null default now()
);
create unique index if not exists one_active_rental on public.rentals (bike_id) where returned_at is null;
create index if not exists rentals_by_user on public.rentals (user_id, start_at desc);

-- ---------------------------------------------------------------------
-- 2. SETTINGS DEFAULTS AND SETUP CODE
-- ---------------------------------------------------------------------
insert into public.site_settings (k, v) values
  ('business_name', 'Campus Bike Hire'),
  ('currency', 'KSh'),
  ('rate', '50'),
  ('grace_minutes', '5'),
  ('timezone', 'Africa/Nairobi'),
  ('contact_phone', ''),
  ('whatsapp', ''),
  ('location', ''),
  ('location_note', ''),
  ('map_link', ''),
  ('map_embed', ''),
  ('booking_enabled', '1'),
  ('booking_intro', 'Reserve a bike for a day and time. You do not need an account. You will get a code to check if your request was approved.'),
  ('hero_title', E'Grab a bike.\nRide by the hour.'),
  ('hero_text', 'Quick bicycle hire for students. Pick a bike, ride, and bring it back on time.'),
  ('how_title', 'How it works'),
  ('step1_title', 'Choose a bike'),
  ('step1_text', 'Pick any free bike from the stand and tell the attendant how long you want it.'),
  ('step2_title', 'Give your details'),
  ('step2_text', 'The attendant notes your name and registration number and takes a quick photo. That is how every bike stays accounted for.'),
  ('step3_title', 'Ride and return on time'),
  ('step3_text', 'Your time starts when you leave. Bring the bike back by the time written down and pay for the hours you used.'),
  ('price_title', 'Price'),
  ('price_text', E'You pay by the hour, rounded up.\nIf you keep the bike past your time, each extra hour costs the same.\nBring your student registration number each time you hire.'),
  ('news_title', 'News and offers'),
  ('footer_text', ''),
  ('logo_path', ''),
  ('color_primary', ''),
  ('color_accent', ''),
  ('color_header', ''),
  ('color_page', '')
on conflict (k) do nothing;

-- >>> CHANGE THE CODE BETWEEN THE QUOTES BELOW BEFORE YOU RUN THIS FILE <<<
insert into public.app_secrets (k, v) values ('setup_code', 'Handel-2026-bike')
on conflict (k) do nothing;

-- ---------------------------------------------------------------------
-- 3. HELPER FUNCTIONS (used by the rules below)
-- ---------------------------------------------------------------------
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin' and active)
$$;

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and active)
$$;

create or replace function public.is_operator() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'operator' and active)
$$;

create or replace function public.epoch(t timestamptz) returns bigint
language sql immutable as $$ select floor(extract(epoch from t))::bigint $$;

create or replace function public.setting(p_key text, p_default text default '') returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select v from public.site_settings where k = p_key), p_default)
$$;

create or replace function public.biz_tz() returns text
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select name from pg_timezone_names where name = (select v from public.site_settings where k = 'timezone') limit 1),
    'Africa/Nairobi')
$$;

create or replace function public.biz_today() returns date
language sql stable security definer set search_path = public as $$
  select (now() at time zone public.biz_tz())::date
$$;

create or replace function public.biz_day_start() returns timestamptz
language sql stable security definer set search_path = public as $$
  select (date_trunc('day', now() at time zone public.biz_tz())) at time zone public.biz_tz()
$$;

create or replace function public.billable_hours(p_start timestamptz, p_end timestamptz, p_grace int) returns int
language sql immutable as $$
  select greatest(1, ceil(greatest(0, greatest(0, extract(epoch from (p_end - p_start))) - p_grace * 60) / 3600.0))::int
$$;

create or replace function public.rental_json(r public.rentals, p_bike text, p_op text, p_op_phone text) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'id', r.id, 'bike_id', r.bike_id, 'bike', p_bike,
    'name', r.renter_name, 'reg', r.reg_no, 'phone', r.phone,
    'photo', r.photo, 'has_photo', r.photo <> '',
    'start', public.epoch(r.start_at), 'due', public.epoch(r.due_at),
    'returned', case when r.returned_at is null then null else public.epoch(r.returned_at) end,
    'minutes', r.minutes, 'rate', r.rate, 'grace', r.grace_min, 'amount', r.amount,
    'operator', p_op, 'operator_phone', p_op_phone, 'booking_id', r.booking_id)
$$;

create or replace function public.booking_json(b public.bookings, p_stand text) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'id', b.id, 'code', b.code, 'name', b.renter_name, 'reg', b.reg_no, 'phone', b.phone,
    'date', to_char(b.want_date, 'YYYY-MM-DD'), 'time', b.want_time, 'minutes', b.minutes,
    'note', b.note, 'status', b.status, 'message', b.staff_message, 'bike', b.bike_number,
    'created', public.epoch(b.created_at), 'stand_id', b.stand_id, 'stand', p_stand)
$$;

-- ---------------------------------------------------------------------
-- 4. SIGN-UP GATE: only the setup code (first admin) or an admin's invite
--    can create an account. Everyone else is refused.
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  sc   text;
  inv  public.invites%rowtype;
begin
  if not exists (select 1 from public.profiles where role = 'admin') then
    select v into sc from public.app_secrets where k = 'setup_code';
    if sc is null or sc = '' or (meta ->> 'setup_code') is distinct from sc then
      raise exception 'Wrong setup code.';
    end if;
    insert into public.profiles (id, email, display_name, role)
    values (new.id, lower(new.email), coalesce(nullif(trim(meta ->> 'display_name'), ''), 'Admin'), 'admin');
    if nullif(trim(meta ->> 'business_name'), '') is not null then
      insert into public.site_settings (k, v) values ('business_name', left(trim(meta ->> 'business_name'), 60))
      on conflict (k) do update set v = excluded.v;
    end if;
    return new;
  end if;

  select * into inv from public.invites
   where code = (meta ->> 'invite') and used_at is null and expires_at > now()
     and lower(email) = lower(new.email)
   for update;
  if not found then
    raise exception 'Sign-ups are closed. Ask the admin to register you.';
  end if;
  update public.invites set used_at = now() where code = inv.code;
  insert into public.profiles (id, email, display_name, phone, stand_name, role)
  values (new.id, lower(new.email), inv.display_name, inv.phone, inv.stand_name, 'operator');
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- 5. WHO MAY SEE WHAT (row level security)
-- ---------------------------------------------------------------------
alter table public.profiles      enable row level security;
alter table public.app_secrets   enable row level security;
alter table public.invites       enable row level security;
alter table public.site_settings enable row level security;
alter table public.posts         enable row level security;
alter table public.logos         enable row level security;
alter table public.bikes         enable row level security;
alter table public.rentals       enable row level security;
alter table public.bookings      enable row level security;

drop policy if exists profiles_read  on public.profiles;
create policy profiles_read on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());

drop policy if exists settings_read  on public.site_settings;
drop policy if exists settings_admin on public.site_settings;
create policy settings_read  on public.site_settings for select to anon, authenticated using (true);
create policy settings_admin on public.site_settings for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists posts_read  on public.posts;
drop policy if exists posts_admin on public.posts;
create policy posts_read  on public.posts for select to anon, authenticated using (published or public.is_admin());
create policy posts_admin on public.posts for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists logos_read  on public.logos;
drop policy if exists logos_admin on public.logos;
create policy logos_read  on public.logos for select to anon, authenticated using (true);
create policy logos_admin on public.logos for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists bikes_read    on public.bikes;
drop policy if exists rentals_read  on public.rentals;
drop policy if exists bookings_read on public.bookings;
create policy bikes_read    on public.bikes    for select to authenticated using (user_id  = auth.uid() or public.is_admin());
create policy rentals_read  on public.rentals  for select to authenticated using (user_id  = auth.uid() or public.is_admin());
create policy bookings_read on public.bookings for select to authenticated using (stand_id = auth.uid() or public.is_admin());

-- Nobody can write straight into these tables from the browser; all changes
-- go through the checked functions in section 6.
revoke insert, update, delete on public.profiles, public.bikes, public.rentals, public.bookings,
  public.app_secrets, public.invites from anon, authenticated;
revoke all on public.app_secrets, public.invites from anon, authenticated;
revoke insert, update, delete on public.site_settings, public.posts, public.logos from anon;

-- ---------------------------------------------------------------------
-- 6. THE ACTIONS (each one checks who is asking)
-- ---------------------------------------------------------------------

-- ---- operator: live view -------------------------------------------
create or replace function public.operator_state() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  ds  timestamptz := public.biz_day_start();
  res jsonb;
begin
  if not public.is_operator() then raise exception 'You are not allowed to do that.'; end if;
  select jsonb_build_object(
    'now', public.epoch(now()),
    'bikes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', b.id, 'number', b.number, 'note', b.note,
        'rental', (select public.rental_json(r, b.number, p.display_name, p.phone)
                     from public.rentals r join public.profiles p on p.id = r.user_id
                    where r.bike_id = b.id and r.returned_at is null)))
      from public.bikes b where b.user_id = uid and b.active), '[]'::jsonb),
    'today', jsonb_build_object(
      'leases',   (select count(*) from public.rentals where user_id = uid and start_at >= ds),
      'returned', (select count(*) from public.rentals where user_id = uid and returned_at >= ds),
      'earned',   (select coalesce(sum(amount), 0) from public.rentals where user_id = uid and returned_at >= ds)),
    'requests', coalesce((
      select jsonb_agg(public.booking_json(k, '') order by k.want_date, k.want_time, k.created_at)
        from public.bookings k
       where k.stand_id = uid and k.status in ('pending', 'approved')
         and k.want_date >= public.biz_today() - 1), '[]'::jsonb)
  ) into res;
  return res;
end $$;

-- ---- operator: bikes -------------------------------------------------
create or replace function public.add_bikes(p_numbers text[]) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid(); n text; ex public.bikes%rowtype; added int := 0; skipped int := 0; seen text[] := '{}';
begin
  if not public.is_operator() then raise exception 'You are not allowed to do that.'; end if;
  if p_numbers is null or coalesce(array_length(p_numbers, 1), 0) = 0 then
    raise exception 'Type a bike number, a range like 1-10, or a list like 3, 5, 8.';
  end if;
  if array_length(p_numbers, 1) > 100 then raise exception 'Add at most 100 bikes at a time.'; end if;
  foreach n in array p_numbers loop
    n := trim(n);
    if n !~ '^[A-Za-z0-9 _-]{1,20}$' then
      raise exception 'Bike numbers can use letters, digits, spaces and dashes (max 20 characters).';
    end if;
    if lower(n) = any (seen) then continue; end if;
    seen := seen || lower(n);
    select * into ex from public.bikes where user_id = uid and lower(number) = lower(n);
    if found and ex.active then skipped := skipped + 1;
    elsif found then update public.bikes set active = true where id = ex.id; added := added + 1;
    else insert into public.bikes (user_id, number) values (uid, n); added := added + 1;
    end if;
  end loop;
  return jsonb_build_object('ok', true, 'added', added, 'skipped', skipped);
end $$;

create or replace function public.remove_bike(p_bike uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_operator() then raise exception 'You are not allowed to do that.'; end if;
  if not exists (select 1 from public.bikes where id = p_bike and user_id = auth.uid() and active) then
    raise exception 'That bike was not found.';
  end if;
  if exists (select 1 from public.rentals where bike_id = p_bike and returned_at is null) then
    raise exception 'This bike is out. Return it before removing it.';
  end if;
  update public.bikes set active = false where id = p_bike;
  return jsonb_build_object('ok', true);
end $$;

-- ---- operator: lease / return / add time ---------------------------------
create or replace function public.lease_bike(
  p_id uuid, p_bike uuid, p_name text, p_reg text, p_phone text,
  p_start timestamptz, p_minutes int, p_photo text,
  p_booking uuid default null, p_force boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  bike public.bikes%rowtype;
  nm text := trim(coalesce(p_name, ''));
  rg text := trim(coalesce(p_reg, ''));
  ph text := trim(coalesce(p_phone, ''));
  st timestamptz;
  other text;
  prev public.rentals%rowtype;
begin
  if not public.is_operator() then raise exception 'You are not allowed to do that.'; end if;

  -- same request sent twice (for example after coming back online): do nothing new
  select * into prev from public.rentals where id = p_id;
  if found then
    if prev.user_id <> uid then raise exception 'You are not allowed to do that.'; end if;
    return jsonb_build_object('ok', true, 'id', p_id, 'repeat', true,
      'bike', (select number from public.bikes where id = prev.bike_id));
  end if;

  if char_length(nm) < 2 or char_length(nm) > 80 then raise exception 'Enter the renter''s full name.'; end if;
  if char_length(rg) < 2 or char_length(rg) > 40 then raise exception 'Enter the renter''s registration number.'; end if;
  if ph <> '' and ph !~ '^[0-9+() -]{5,20}$' then raise exception 'That phone number does not look right.'; end if;
  if p_minutes is null or p_minutes < 15 or p_minutes > 1440 then raise exception 'Choose between 15 minutes and 24 hours.'; end if;
  if coalesce(p_photo, '') = '' or p_photo not like uid::text || '/%' then
    raise exception 'Take the renter''s photo first.';
  end if;

  select * into bike from public.bikes where id = p_bike and user_id = uid and active;
  if not found then raise exception 'That bike was not found.'; end if;
  if exists (select 1 from public.rentals where bike_id = p_bike and returned_at is null) then
    raise exception 'Bike % is already out.', bike.number;
  end if;

  if not coalesce(p_force, false) then
    select b.number into other from public.rentals r join public.bikes b on b.id = r.bike_id
     where r.user_id = uid and r.returned_at is null and lower(r.reg_no) = lower(rg) limit 1;
    if other is not null then
      raise exception 'REG_ACTIVE:Registration number % already has bike % out.', rg, other;
    end if;
  end if;

  st := coalesce(p_start, now());
  if st > now() + interval '5 minutes' or st < now() - interval '3 days' then st := now(); end if;

  begin
    insert into public.rentals (id, bike_id, user_id, renter_name, reg_no, phone, photo,
                                start_at, due_at, minutes, rate, grace_min, booking_id)
    values (p_id, p_bike, uid, nm, rg, ph, p_photo, st, st + make_interval(mins => p_minutes), p_minutes,
            public.setting('rate', '50')::int, public.setting('grace_minutes', '5')::int, p_booking);
  exception when unique_violation then
    raise exception 'Bike % was just leased on another device.', bike.number;
  end;

  if p_booking is not null then
    update public.bookings set status = 'done', rental_id = p_id
     where id = p_booking and stand_id = uid and status in ('pending', 'approved');
  end if;
  return jsonb_build_object('ok', true, 'id', p_id, 'bike', bike.number);
end $$;

create or replace function public.return_bike(p_rental uuid, p_returned timestamptz default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r public.rentals%rowtype; bnum text; ret timestamptz; hrs int; amt int;
begin
  if not public.is_operator() then raise exception 'You are not allowed to do that.'; end if;
  select * into r from public.rentals where id = p_rental and user_id = auth.uid() for update;
  if not found then raise exception 'That rental was not found.'; end if;
  select number into bnum from public.bikes where id = r.bike_id;
  if r.returned_at is not null then
    return jsonb_build_object('ok', true, 'repeat', true, 'amount', r.amount, 'bike', bnum, 'name', r.renter_name,
      'hours', public.billable_hours(r.start_at, r.returned_at, r.grace_min),
      'late', greatest(0, public.epoch(r.returned_at) - public.epoch(r.due_at)));
  end if;
  ret := coalesce(p_returned, now());
  if ret > now() then ret := now(); end if;
  if ret < r.start_at then ret := r.start_at; end if;
  hrs := public.billable_hours(r.start_at, ret, r.grace_min);
  amt := hrs * r.rate;
  update public.rentals set returned_at = ret, amount = amt where id = r.id;
  return jsonb_build_object('ok', true, 'amount', amt, 'hours', hrs, 'bike', bnum, 'name', r.renter_name,
    'late', greatest(0, public.epoch(ret) - public.epoch(r.due_at)));
end $$;

create or replace function public.extend_rental(p_rental uuid, p_new_due timestamptz) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r public.rentals%rowtype; diff int;
begin
  if not public.is_operator() then raise exception 'You are not allowed to do that.'; end if;
  select * into r from public.rentals where id = p_rental and user_id = auth.uid() for update;
  if not found then raise exception 'That rental was not found.'; end if;
  if r.returned_at is not null then raise exception 'This bike was already returned.'; end if;
  if p_new_due is null then raise exception 'Choose how much time to add.'; end if;
  if p_new_due <= r.due_at then return jsonb_build_object('ok', true, 'repeat', true); end if;
  if p_new_due > r.due_at + interval '24 hours' then raise exception 'You can add at most 24 hours at a time.'; end if;
  diff := floor(extract(epoch from (p_new_due - r.due_at)) / 60)::int;
  update public.rentals set due_at = p_new_due, minutes = minutes + diff where id = r.id;
  return jsonb_build_object('ok', true);
end $$;

-- ---- history (operator: own, admin: everyone) ---------------------------------
create or replace function public.history_search(p_q text default '', p_status text default 'all',
                                                p_limit int default 30, p_offset int default 0) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_lim int := least(5000, greatest(1, coalesce(p_limit, 30)));
  v_off int := greatest(0, coalesce(p_offset, 0));
  v_q text := trim(coalesce(p_q, ''));
  v_like text;
  v_admin boolean := public.is_admin();
  v_list jsonb; v_more boolean;
begin
  if not public.is_staff() then raise exception 'You are not allowed to do that.'; end if;
  v_like := '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  with f as (
    select r as rr, b.number as bnum, p.display_name as opn, p.phone as opp,
           row_number() over (order by r.start_at desc, r.id) as rn
      from public.rentals r
      join public.bikes b on b.id = r.bike_id
      join public.profiles p on p.id = r.user_id
     where (v_admin or r.user_id = auth.uid())
       and (v_q = '' or r.renter_name ilike v_like or r.reg_no ilike v_like or r.phone ilike v_like or b.number ilike v_like)
       and (coalesce(p_status, 'all') = 'all'
            or (p_status = 'returned' and r.returned_at is not null)
            or (p_status = 'out' and r.returned_at is null)
            or (p_status = 'overdue' and r.returned_at is null and r.due_at < now()))
     order by r.start_at desc, r.id
     limit v_lim + 1 offset v_off)
  select coalesce(jsonb_agg(public.rental_json(f.rr, f.bnum, f.opn, f.opp) order by f.rn) filter (where f.rn - v_off <= v_lim), '[]'::jsonb),
         coalesce(count(*) > v_lim, false)
    into v_list, v_more
    from f;
  return jsonb_build_object('now', public.epoch(now()), 'more', v_more, 'rentals', v_list);
end $$;

-- ---- admin: overview and operators -------------------------------------------------
create or replace function public.admin_overview() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare ds timestamptz := public.biz_day_start();
begin
  if not public.is_admin() then raise exception 'You are not allowed to do that.'; end if;
  return jsonb_build_object(
    'now', public.epoch(now()),
    'operators', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'email', p.email, 'name', p.display_name, 'phone', p.phone, 'stand', p.stand_name,
        'active', p.active,
        'bikes',   (select count(*) from public.bikes b where b.user_id = p.id and b.active),
        'out',     (select count(*) from public.rentals r where r.user_id = p.id and r.returned_at is null),
        'overdue', (select count(*) from public.rentals r where r.user_id = p.id and r.returned_at is null and r.due_at < now()),
        'pending', (select count(*) from public.bookings k where k.stand_id = p.id and k.status = 'pending'))
        order by lower(p.display_name))
      from public.profiles p where p.role = 'operator'), '[]'::jsonb),
    'live', coalesce((
      select jsonb_agg(public.rental_json(r, b.number, p.display_name, p.phone) order by r.due_at)
        from public.rentals r join public.bikes b on b.id = r.bike_id join public.profiles p on p.id = r.user_id
       where r.returned_at is null), '[]'::jsonb),
    'today', jsonb_build_object(
      'leases',   (select count(*) from public.rentals where start_at >= ds),
      'returned', (select count(*) from public.rentals where returned_at >= ds),
      'earned',   (select coalesce(sum(amount), 0) from public.rentals where returned_at >= ds)),
    'requests', coalesce((
      select jsonb_agg(public.booking_json(k, coalesce(nullif(p.stand_name, ''), p.display_name))
                       order by k.want_date, k.want_time, k.created_at)
        from public.bookings k join public.profiles p on p.id = k.stand_id
       where k.status in ('pending', 'approved') and k.want_date >= public.biz_today() - 1), '[]'::jsonb));
end $$;

create or replace function public.create_invite(p_email text, p_name text, p_phone text default '', p_stand text default '') returns text
language plpgsql security definer set search_path = public, extensions as $$
declare c text := encode(extensions.gen_random_bytes(16), 'hex'); em text := lower(trim(coalesce(p_email, '')));
begin
  if not public.is_admin() then raise exception 'You are not allowed to do that.'; end if;
  if em !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Enter a valid email address.'; end if;
  if char_length(trim(coalesce(p_name, ''))) < 2 then raise exception 'Enter the operator''s name.'; end if;
  if exists (select 1 from public.profiles where lower(email) = em) then
    raise exception 'That email is already registered.';
  end if;
  delete from public.invites where expires_at < now() - interval '1 day';
  insert into public.invites (code, email, display_name, phone, stand_name, created_by, expires_at)
  values (c, em, left(trim(p_name), 60), left(trim(coalesce(p_phone, '')), 20), left(trim(coalesce(p_stand, '')), 60),
          auth.uid(), now() + interval '15 minutes');
  return c;
end $$;

create or replace function public.admin_update_operator(p_user uuid, p_name text, p_phone text, p_stand text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'You are not allowed to do that.'; end if;
  if char_length(trim(coalesce(p_name, ''))) < 2 then raise exception 'Enter the operator''s name.'; end if;
  update public.profiles
     set display_name = left(trim(p_name), 60), phone = left(trim(coalesce(p_phone, '')), 20),
         stand_name = left(trim(coalesce(p_stand, '')), 60)
   where id = p_user and role = 'operator';
  if not found then raise exception 'Operator not found.'; end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.admin_toggle_operator(p_user uuid, p_active boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'You are not allowed to do that.'; end if;
  update public.profiles set active = p_active where id = p_user and role = 'operator';
  if not found then raise exception 'Operator not found.'; end if;
  update auth.users set banned_until = case when p_active then null else 'infinity'::timestamptz end where id = p_user;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.admin_set_password(p_user uuid, p_password text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.is_admin() then raise exception 'You are not allowed to do that.'; end if;
  if char_length(coalesce(p_password, '')) < 8 then raise exception 'Password must be at least 8 characters.'; end if;
  if not exists (select 1 from public.profiles where id = p_user and role = 'operator') then
    raise exception 'Operator not found.';
  end if;
  update auth.users set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf', 10)), updated_at = now()
   where id = p_user;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.needs_setup() returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (select 1 from public.profiles where role = 'admin')
$$;

-- ---- students: book a bike without an account ------------------------------------
create or replace function public.public_stands() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'label', coalesce(nullif(p.stand_name, ''), p.display_name))
                            order by lower(coalesce(nullif(p.stand_name, ''), p.display_name))), '[]'::jsonb)
    from public.profiles p
   where p.role = 'operator' and p.active
     and exists (select 1 from public.bikes b where b.user_id = p.id and b.active)
$$;

create or replace function public.create_booking(
  p_stand uuid, p_name text, p_reg text, p_phone text, p_date date, p_time text,
  p_minutes int, p_note text default '', p_hp text default '') returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  nm text := trim(coalesce(p_name, '')); rg text := trim(coalesce(p_reg, '')); ph text := trim(coalesce(p_phone, ''));
  tm text := trim(coalesce(p_time, '')); alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; c text; i int; tries int := 0;
begin
  if coalesce(p_hp, '') <> '' then return jsonb_build_object('ok', true, 'code', 'XXXXXXXX'); end if;  -- spam trap
  if public.setting('booking_enabled', '1') <> '1' then raise exception 'Online booking is closed right now. Please call us.'; end if;
  if char_length(nm) < 2 or char_length(nm) > 80 then raise exception 'Enter your full name.'; end if;
  if char_length(rg) < 2 or char_length(rg) > 40 then raise exception 'Enter your registration number.'; end if;
  if ph !~ '^[0-9+() -]{7,20}$' then raise exception 'Enter a phone number we can reach you on.'; end if;
  if p_date is null or p_date < public.biz_today() then raise exception 'Choose today or a day in the future.'; end if;
  if p_date > public.biz_today() + 30 then raise exception 'You can book up to 30 days ahead.'; end if;
  if tm <> '' and tm !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'That time does not look right.'; end if;
  if p_minutes is null or p_minutes < 15 or p_minutes > 720 then raise exception 'Choose between 15 minutes and 12 hours.'; end if;
  if not exists (select 1 from public.profiles where id = p_stand and role = 'operator' and active) then
    raise exception 'Choose where you will pick up the bike.';
  end if;
  if (select count(*) from public.bookings where lower(reg_no) = lower(rg) and status in ('pending', 'approved')
         and want_date >= public.biz_today()) >= 3 then
    raise exception 'You already have 3 open requests. Wait for a reply or cancel one.';
  end if;
  if (select count(*) from public.bookings where stand_id = p_stand and status = 'pending') >= 200 then
    raise exception 'Too many requests are waiting. Please call us.';
  end if;
  loop
    c := '';
    for i in 1..8 loop
      c := c || substr(alphabet, 1 + (get_byte(extensions.gen_random_bytes(1), 0) % length(alphabet)), 1);
    end loop;
    exit when not exists (select 1 from public.bookings where code = c);
    tries := tries + 1;
    if tries > 20 then raise exception 'Please try again.'; end if;
  end loop;
  insert into public.bookings (code, stand_id, renter_name, reg_no, phone, want_date, want_time, minutes, note)
  values (c, p_stand, nm, rg, ph, p_date, tm, p_minutes, left(trim(coalesce(p_note, '')), 300));
  return jsonb_build_object('ok', true, 'code', c);
end $$;

create or replace function public.booking_status(p_code text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'status', b.status, 'name', b.renter_name, 'date', to_char(b.want_date, 'YYYY-MM-DD'), 'time', b.want_time,
    'minutes', b.minutes, 'message', b.staff_message, 'bike', b.bike_number,
    'stand', coalesce(nullif(p.stand_name, ''), p.display_name), 'stand_phone', p.phone,
    'location', public.setting('location'), 'location_note', public.setting('location_note'),
    'map_link', public.setting('map_link'), 'code', b.code)
  from public.bookings b join public.profiles p on p.id = b.stand_id
  where b.code = upper(trim(coalesce(p_code, '')))
$$;

create or replace function public.cancel_booking(p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  update public.bookings set status = 'cancelled', decided_at = now()
   where code = upper(trim(coalesce(p_code, ''))) and status in ('pending', 'approved');
  if not found then raise exception 'That request cannot be cancelled.'; end if;
  return jsonb_build_object('ok', true);
end $$;

-- ---- staff: answer a booking ----------------------------------------------------------
create or replace function public.decide_booking(p_id uuid, p_decision text, p_message text default '', p_bike text default '') returns jsonb
language plpgsql security definer set search_path = public as $$
declare b public.bookings%rowtype;
begin
  if not public.is_staff() then raise exception 'You are not allowed to do that.'; end if;
  if p_decision not in ('approved', 'declined') then raise exception 'Choose approve or decline.'; end if;
  select * into b from public.bookings where id = p_id for update;
  if not found then raise exception 'That request was not found.'; end if;
  if b.stand_id <> auth.uid() and not public.is_admin() then raise exception 'You are not allowed to do that.'; end if;
  if b.status not in ('pending', 'approved') then raise exception 'This request is already closed.'; end if;
  update public.bookings
     set status = p_decision, staff_message = left(trim(coalesce(p_message, '')), 300),
         bike_number = case when p_decision = 'approved' then left(trim(coalesce(p_bike, '')), 20) else '' end,
         decided_at = now()
   where id = p_id;
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------------
-- 7. WHO MAY CALL WHAT
--    (is_admin / is_staff / is_operator must stay callable: the security rules use them.
--     They only ever tell you about yourself.)
-- ---------------------------------------------------------------------
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig, p.proname
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('is_admin','is_staff','is_operator','epoch','setting','biz_tz','biz_today','biz_day_start',
         'billable_hours','rental_json','booking_json','handle_new_user','operator_state','add_bikes','remove_bike',
         'lease_bike','return_bike','extend_rental','history_search','admin_overview','create_invite',
         'admin_update_operator','admin_toggle_operator','admin_set_password','public_stands','create_booking',
         'booking_status','cancel_booking','decide_booking','needs_setup')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    if f.proname in ('operator_state','add_bikes','remove_bike','lease_bike','return_bike','extend_rental',
                     'history_search','admin_overview','create_invite','admin_update_operator',
                     'admin_toggle_operator','admin_set_password','decide_booking') then
      execute format('grant execute on function %s to authenticated', f.sig);
    elsif f.proname in ('is_admin','is_staff','is_operator','needs_setup','public_stands','create_booking','booking_status','cancel_booking') then
      execute format('grant execute on function %s to anon, authenticated', f.sig);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 8. PHOTO STORAGE
--    renter-photos : private. Each operator can only open their own folder;
--                    the admin can open all of them.
--    site-media    : public pictures for the website (posts and logos).
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public) values ('renter-photos', 'renter-photos', false)
on conflict (id) do update set public = false;
insert into storage.buckets (id, name, public) values ('site-media', 'site-media', true)
on conflict (id) do update set public = true;

drop policy if exists "renter photos read"   on storage.objects;
drop policy if exists "renter photos add"    on storage.objects;
drop policy if exists "renter photos change" on storage.objects;
create policy "renter photos read" on storage.objects for select to authenticated
  using (bucket_id = 'renter-photos' and (public.is_admin() or (storage.foldername(name))[1] = auth.uid()::text));
create policy "renter photos add" on storage.objects for insert to authenticated
  with check (bucket_id = 'renter-photos' and public.is_operator() and (storage.foldername(name))[1] = auth.uid()::text);
create policy "renter photos change" on storage.objects for update to authenticated
  using (bucket_id = 'renter-photos' and public.is_operator() and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'renter-photos' and public.is_operator() and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "site media read"   on storage.objects;
drop policy if exists "site media admin"  on storage.objects;
create policy "site media read" on storage.objects for select to anon, authenticated using (bucket_id = 'site-media');
create policy "site media admin" on storage.objects for all to authenticated
  using (bucket_id = 'site-media' and public.is_admin()) with check (bucket_id = 'site-media' and public.is_admin());

-- Done. Next: Authentication settings (see the guide), then open /setup.html on your site.
