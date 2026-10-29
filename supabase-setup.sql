-- =====================================================================
-- BIKE HIRE: database setup AND upgrade for Supabase (version 2)
--
-- Paste this WHOLE file into Supabase > SQL Editor > New query > Run.
--
--  * NEW SITE: change CHANGE-THIS-SETUP-CODE (in section 2) to your own
--    secret code first. You type it once on the setup page to create the
--    master admin.
--
--  * ALREADY RUNNING THE OLD VERSION: just run this file again. It only
--    ADDS things. All your rentals, bookings, photos, operators and website
--    words stay exactly as they are. Your existing setup code is kept.
--    (Everything runs as one block: if anything fails, nothing changes.)
-- =====================================================================
begin;

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------
-- 1. TABLES
-- ---------------------------------------------------------------------
create table if not exists public.stands (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  rate       int check (rate is null or rate between 1 and 100000),
  lat        double precision,
  lng        double precision,
  address    text not null default '',
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

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
alter table public.profiles add column if not exists stand_id uuid references public.stands(id);

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
alter table public.invites add column if not exists stand_id uuid;

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
alter table public.posts add column if not exists kind text not null default 'news';

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
alter table public.bikes add column if not exists stand_id uuid references public.stands(id);
alter table public.bikes add column if not exists out_of_service boolean not null default false;
alter table public.bikes add column if not exists service_note text not null default '';

create table if not exists public.bookings (
  id           uuid primary key default gen_random_uuid(),
  code         text not null unique,
  stand_id     uuid not null,
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
alter table public.rentals add column if not exists stand_id uuid references public.stands(id);
-- Old rentals keep the old way of billing ('v1'); new ones use 'v2' (booked time + overtime).
alter table public.rentals add column if not exists billing text not null default 'v1';
alter table public.rentals alter column billing set default 'v2';

create table if not exists public.flags (
  id         uuid primary key default gen_random_uuid(),
  reg_key    text not null,
  reg_no     text not null,
  note       text not null,
  created_by uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.audit_log (
  id     bigint generated always as identity primary key,
  at     timestamptz not null default now(),
  actor  uuid,
  action text not null,
  detail text not null default ''
);

-- ---------------------------------------------------------------------
-- 1b. UPGRADE STEPS (do nothing on a new site; move old data safely)
-- ---------------------------------------------------------------------
-- Every operator gets a pick-up point (stand) of their own, named like before.
do $$
declare p record; sid uuid;
begin
  for p in select id, display_name, stand_name from public.profiles where role = 'operator' and stand_id is null loop
    insert into public.stands (name) values (left(coalesce(nullif(trim(p.stand_name), ''), p.display_name), 60)) returning id into sid;
    update public.profiles set stand_id = sid where id = p.id;
  end loop;
end $$;

-- Bikes and rentals follow their operator's stand.
update public.bikes b set stand_id = p.stand_id
  from public.profiles p where p.id = b.user_id and b.stand_id is null and p.stand_id is not null;
update public.rentals r set stand_id = b.stand_id
  from public.bikes b where b.id = r.bike_id and r.stand_id is null and b.stand_id is not null;

drop index if exists public.bikes_unique_number;
create unique index if not exists bikes_unique_number_stand on public.bikes (stand_id, lower(number));
create unique index if not exists one_active_rental on public.rentals (bike_id) where returned_at is null;
create index if not exists rentals_by_stand on public.rentals (stand_id, start_at desc);
create index if not exists rentals_by_user on public.rentals (user_id, start_at desc);
create index if not exists bookings_by_stand on public.bookings (stand_id, status, want_date);
create index if not exists flags_by_reg on public.flags (reg_key);

do $$
begin
  if not exists (select 1 from public.bikes where stand_id is null) then
    alter table public.bikes alter column stand_id set not null;
  end if;
  if not exists (select 1 from public.rentals where stand_id is null) then
    alter table public.rentals alter column stand_id set not null;
  end if;
end $$;

-- Booking requests used to point at the operator; now they point at the stand.
do $$
declare refrel regclass;
begin
  select confrelid::regclass into refrel from pg_constraint
   where conname = 'bookings_stand_id_fkey' and conrelid = 'public.bookings'::regclass;
  if refrel is not null and refrel = 'public.profiles'::regclass then
    alter table public.bookings drop constraint bookings_stand_id_fkey;
    update public.bookings k set stand_id = p.stand_id
      from public.profiles p where p.id = k.stand_id and p.stand_id is not null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'bookings_stand_id_fkey' and conrelid = 'public.bookings'::regclass) then
    alter table public.bookings add constraint bookings_stand_id_fkey foreign key (stand_id) references public.stands(id);
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 2. SETTINGS DEFAULTS AND SETUP CODE
--    (existing values are never overwritten)
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
  ('step3_text', 'Your time starts when you leave. Bring the bike back by the time written down and pay for the time you booked.'),
  ('price_title', 'Price'),
  ('price_text', E'You pay for the time you book, at the hourly price.\nIf you keep the bike past your time and the grace period, the extra time is charged at the same hourly rate.\nBring your student registration number each time you hire.'),
  ('news_title', 'News and offers'),
  ('footer_text', ''),
  ('logo_path', ''),
  ('color_primary', ''),
  ('color_accent', ''),
  ('color_header', ''),
  ('color_page', ''),
  -- new in version 2
  ('header_note', ''),
  ('header_note_link', ''),
  ('footer_about', ''),
  ('flink1_text', ''), ('flink1_url', ''),
  ('flink2_text', ''), ('flink2_url', ''),
  ('flink3_text', ''), ('flink3_url', ''),
  ('social_instagram', ''), ('social_facebook', ''), ('social_tiktok', ''), ('social_youtube', ''),
  ('hero_art', 'default'),
  ('hero_image', ''),
  ('finder_title', 'Find bikes near you'),
  ('finder_on', '1'),
  ('services_title', 'Other things we offer'),
  ('services_intro', ''),
  ('popup_on', '0'),
  ('popup_title', ''),
  ('popup_body', ''),
  ('popup_image', ''),
  ('popup_video', ''),
  ('popup_video_file', ''),
  ('popup_btn_text', ''),
  ('popup_btn_link', ''),
  ('popup_start', ''),
  ('popup_end', ''),
  ('popup_freq', 'daily'),
  ('popup_delay', '2'),
  ('popup_rev', '')
on conflict (k) do nothing;

-- Wording that described the old way of billing: update it only if you never changed it.
update public.site_settings set v = 'You pay for the time you book, at the hourly price.
If you keep the bike past your time and the grace period, the extra time is charged at the same hourly rate.
Bring your student registration number each time you hire.'
 where k = 'price_text' and v = 'You pay by the hour, rounded up.
If you keep the bike past your time, each extra hour costs the same.
Bring your student registration number each time you hire.';
update public.site_settings set v = 'Your time starts when you leave. Bring the bike back by the time written down and pay for the time you booked.'
 where k = 'step3_text' and v = 'Your time starts when you leave. Bring the bike back by the time written down and pay for the hours you used.';

-- >>> CHANGE THE CODE BETWEEN THE QUOTES BELOW BEFORE YOU RUN THIS FILE (new sites only) <<<
insert into public.app_secrets (k, v) values ('setup_code', 'CHANGE-THIS-SETUP-CODE')
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

-- the pick-up point (stand) of the signed-in operator
create or replace function public.my_stand() returns uuid
language sql stable security definer set search_path = public as $$
  select stand_id from public.profiles where id = auth.uid() and role = 'operator' and active
$$;

-- may the signed-in person open a renter photo stored under this path?
create or replace function public.photo_visible(p_name text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare folder text := split_part(coalesce(p_name, ''), '/', 1);
begin
  if public.is_admin() then return true; end if;
  if folder = auth.uid()::text then return true; end if;
  if folder !~ '^[0-9a-fA-F-]{36}$' then return false; end if;
  return exists (
    select 1 from public.profiles me join public.profiles o on o.stand_id = me.stand_id
     where me.id = auth.uid() and me.active and me.role = 'operator' and me.stand_id is not null
       and o.id = folder::uuid);
end $$;

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

-- the price per hour that applies at a stand (its own price, or the website's default)
create or replace function public.stand_rate(p_stand uuid) returns int
language sql stable security definer set search_path = public as $$
  select coalesce((select rate from public.stands where id = p_stand), nullif(public.setting('rate', '50'), '')::int, 50)
$$;

-- Old way (rentals made before version 2): paid hours, rounded up.
create or replace function public.billable_hours(p_start timestamptz, p_end timestamptz, p_grace int) returns int
language sql immutable as $$
  select greatest(1, ceil(greatest(0, greatest(0, extract(epoch from (p_end - p_start))) - p_grace * 60) / 3600.0))::int
$$;

-- What a rental costs. 'v2' = the full time booked (at the hourly rate), plus the time kept past
-- the due time once the grace period is over. Rounded to the nearest whole shilling.
-- (Same maths as the website, in whole seconds, so the screen and the final amount always agree.)
create or replace function public.rental_amount(p_billing text, p_start timestamptz, p_due timestamptz,
                                                p_end timestamptz, p_rate int, p_grace int) returns int
language sql immutable as $$
  select case when p_billing = 'v2' then
    ((p_rate::bigint
       * (greatest(0, public.epoch(p_due) - public.epoch(p_start))
          + case when public.epoch(p_end) > public.epoch(p_due) + p_grace * 60
                 then public.epoch(p_end) - public.epoch(p_due) else 0 end) * 2 + 3600) / 7200)::int
  else public.billable_hours(p_start, p_end, p_grace) * p_rate end
$$;

drop function if exists public.rental_json(public.rentals, text, text, text);
create or replace function public.rental_json(r public.rentals, p_bike text, p_op text, p_op_phone text, p_stand text default '') returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'id', r.id, 'bike_id', r.bike_id, 'bike', p_bike,
    'name', r.renter_name, 'reg', r.reg_no, 'phone', r.phone,
    'photo', r.photo, 'has_photo', r.photo <> '',
    'start', public.epoch(r.start_at), 'due', public.epoch(r.due_at),
    'returned', case when r.returned_at is null then null else public.epoch(r.returned_at) end,
    'minutes', r.minutes, 'rate', r.rate, 'grace', r.grace_min, 'amount', r.amount, 'billing', r.billing,
    'operator', p_op, 'operator_phone', p_op_phone, 'booking_id', r.booking_id,
    'stand', p_stand, 'stand_id', r.stand_id)
$$;

create or replace function public.flag_note(p_reg text) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(string_agg(note, ' | ' order by created_at), '') from public.flags where reg_key = lower(trim(coalesce(p_reg, '')))
$$;

create or replace function public.booking_json(b public.bookings, p_stand text) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'id', b.id, 'code', b.code, 'name', b.renter_name, 'reg', b.reg_no, 'phone', b.phone,
    'date', to_char(b.want_date, 'YYYY-MM-DD'), 'time', b.want_time, 'minutes', b.minutes,
    'note', b.note, 'status', b.status, 'message', b.staff_message, 'bike', b.bike_number,
    'created', public.epoch(b.created_at), 'stand_id', b.stand_id, 'stand', p_stand,
    'flag', public.flag_note(b.reg_no))
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
  insert into public.profiles (id, email, display_name, phone, stand_name, stand_id, role)
  values (new.id, lower(new.email), inv.display_name, inv.phone, inv.stand_name, inv.stand_id, 'operator');
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
alter table public.stands        enable row level security;
alter table public.bikes         enable row level security;
alter table public.rentals       enable row level security;
alter table public.bookings      enable row level security;
alter table public.flags         enable row level security;
alter table public.audit_log     enable row level security;

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

drop policy if exists stands_read    on public.stands;
drop policy if exists bikes_read     on public.bikes;
drop policy if exists rentals_read   on public.rentals;
drop policy if exists bookings_read  on public.bookings;
drop policy if exists flags_read     on public.flags;
drop policy if exists audit_read     on public.audit_log;
create policy stands_read   on public.stands   for select to authenticated using (id = public.my_stand() or public.is_admin());
create policy bikes_read    on public.bikes    for select to authenticated using (stand_id = public.my_stand() or public.is_admin());
create policy rentals_read  on public.rentals  for select to authenticated using (stand_id = public.my_stand() or public.is_admin());
create policy bookings_read on public.bookings for select to authenticated using (stand_id = public.my_stand() or public.is_admin());
create policy flags_read    on public.flags    for select to authenticated using (public.is_admin());
create policy audit_read    on public.audit_log for select to authenticated using (public.is_admin());

-- Nobody can write straight into these tables from the browser; all changes
-- go through the checked functions in section 6.
revoke insert, update, delete on public.profiles, public.bikes, public.rentals, public.bookings,
  public.app_secrets, public.invites, public.stands, public.flags, public.audit_log from anon, authenticated;
revoke all on public.app_secrets, public.invites from anon, authenticated;
revoke all on public.stands, public.flags, public.audit_log from anon;
revoke insert, update, delete on public.site_settings, public.posts, public.logos from anon;

-- ---------------------------------------------------------------------
-- 6. THE ACTIONS (each one checks who is asking)
-- ---------------------------------------------------------------------

-- ---- operator: live view (everything at their stand) -----------------------------
create or replace function public.operator_state() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  sid uuid := public.my_stand();
  ds  timestamptz := public.biz_day_start();
  st  public.stands%rowtype;
  res jsonb;
begin
  if not public.is_operator() then raise exception 'You are not allowed to do that.'; end if;
  if sid is null then raise exception 'Your account has no pick-up point yet. Ask the admin to set it.'; end if;
  select * into st from public.stands where id = sid;
  select jsonb_build_object(
    'now', public.epoch(now()),
    'me', (select jsonb_build_object('id', p.id, 'name', p.display_name) from public.profiles p where p.id = uid),
    'stand', jsonb_build_object('id', st.id, 'name', st.name, 'rate', public.stand_rate(st.id), 'rate_own', st.rate,
                                'default_rate', nullif(public.setting('rate', '50'), '')::int,
                                'lat', st.lat, 'lng', st.lng, 'address', st.address),
    'team', coalesce((select jsonb_agg(p.display_name order by lower(p.display_name))
                        from public.profiles p where p.stand_id = sid and p.role = 'operator' and p.active), '[]'::jsonb),
    'bikes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', b.id, 'number', b.number, 'note', b.note,
        'out_of_service', b.out_of_service, 'service_note', b.service_note,
        'rental', (select public.rental_json(r, b.number, p.display_name, p.phone, st.name)
                     from public.rentals r join public.profiles p on p.id = r.user_id
                    where r.bike_id = b.id and r.returned_at is null)))
      from public.bikes b where b.stand_id = sid and b.active), '[]'::jsonb),
    'today', jsonb_build_object(
      'leases',   (select count(*) from public.rentals where stand_id = sid and start_at >= ds),
      'returned', (select count(*) from public.rentals where stand_id = sid and returned_at >= ds),
      'earned',   (select coalesce(sum(amount), 0) from public.rentals where stand_id = sid and returned_at >= ds)),
    'requests', coalesce((
      select jsonb_agg(public.booking_json(k, st.name) order by k.want_date, k.want_time, k.created_at)
        from public.bookings k
       where k.stand_id = sid and k.status in ('pending', 'approved')
         and k.want_date >= public.biz_today() - 1), '[]'::jsonb)
  ) into res;
  return res;
end $$;

-- ---- operator: their pick-up point (name, price, location) -------------------------------
create or replace function public.update_my_stand(p_name text, p_rate int, p_lat double precision,
                                                  p_lng double precision, p_address text default '') returns jsonb
language plpgsql security definer set search_path = public as $$
declare sid uuid := public.my_stand(); nm text := trim(coalesce(p_name, ''));
begin
  if not public.is_operator() or sid is null then raise exception 'You are not allowed to do that.'; end if;
  if char_length(nm) < 2 or char_length(nm) > 60 then raise exception 'Enter a name for your pick-up point.'; end if;
  if p_rate is not null and (p_rate < 1 or p_rate > 100000) then raise exception 'The price must be between 1 and 100000.'; end if;
  if (p_lat is null) <> (p_lng is null) then raise exception 'Location needs both latitude and longitude.'; end if;
  if p_lat is not null and (p_lat < -90 or p_lat > 90 or p_lng < -180 or p_lng > 180) then raise exception 'That location is not valid.'; end if;
  update public.stands set name = nm, rate = p_rate, lat = p_lat, lng = p_lng, address = left(trim(coalesce(p_address, '')), 160)
   where id = sid;
  return jsonb_build_object('ok', true);
end $$;

-- ---- operator: bikes -------------------------------------------------
create or replace function public.add_bikes(p_numbers text[]) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid(); sid uuid := public.my_stand();
  n text; ex public.bikes%rowtype; added int := 0; skipped int := 0; seen text[] := '{}';
begin
  if not public.is_operator() or sid is null then raise exception 'You are not allowed to do that.'; end if;
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
    select * into ex from public.bikes where stand_id = sid and lower(number) = lower(n);
    if found and ex.active then skipped := skipped + 1;
    elsif found then update public.bikes set active = true where id = ex.id; added := added + 1;
    else insert into public.bikes (user_id, stand_id, number) values (uid, sid, n); added := added + 1;
    end if;
  end loop;
  return jsonb_build_object('ok', true, 'added', added, 'skipped', skipped);
end $$;

create or replace function public.remove_bike(p_bike uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_operator() then raise exception 'You are not allowed to do that.'; end if;
  if not exists (select 1 from public.bikes where id = p_bike and stand_id = public.my_stand() and active) then
    raise exception 'That bike was not found.';
  end if;
  if exists (select 1 from public.rentals where bike_id = p_bike and returned_at is null) then
    raise exception 'This bike is out. Return it before removing it.';
  end if;
  update public.bikes set active = false where id = p_bike;
  return jsonb_build_object('ok', true);
end $$;

-- mark a bike as broken (cannot be leased or booked) or back in service
create or replace function public.set_bike_service(p_bike uuid, p_out boolean, p_note text default '') returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_operator() then raise exception 'You are not allowed to do that.'; end if;
  if not exists (select 1 from public.bikes where id = p_bike and stand_id = public.my_stand() and active) then
    raise exception 'That bike was not found.';
  end if;
  if coalesce(p_out, false) and exists (select 1 from public.rentals where bike_id = p_bike and returned_at is null) then
    raise exception 'This bike is out. Return it first.';
  end if;
  update public.bikes set out_of_service = coalesce(p_out, false),
         service_note = case when coalesce(p_out, false) then left(trim(coalesce(p_note, '')), 120) else '' end
   where id = p_bike;
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
  sid uuid := public.my_stand();
  bike public.bikes%rowtype;
  nm text := trim(coalesce(p_name, ''));
  rg text := trim(coalesce(p_reg, ''));
  ph text := trim(coalesce(p_phone, ''));
  st timestamptz;
  other text;
  who text;
  prev public.rentals%rowtype;
begin
  if not public.is_operator() or sid is null then raise exception 'You are not allowed to do that.'; end if;

  -- same request sent twice (for example after coming back online): do nothing new
  select * into prev from public.rentals where id = p_id;
  if found then
    if prev.stand_id is distinct from sid then raise exception 'You are not allowed to do that.'; end if;
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

  select * into bike from public.bikes where id = p_bike and stand_id = sid and active;
  if not found then raise exception 'That bike was not found.'; end if;
  if bike.out_of_service then raise exception 'Bike % is marked out of service.', bike.number; end if;
  select p.display_name into who from public.rentals r join public.profiles p on p.id = r.user_id
   where r.bike_id = p_bike and r.returned_at is null;
  if found then
    raise exception 'BIKE_BUSY:Bike % is already out (leased by % on another phone).', bike.number, who;
  end if;

  if not coalesce(p_force, false) then
    select b.number into other from public.rentals r join public.bikes b on b.id = r.bike_id
     where r.stand_id = sid and r.returned_at is null and lower(r.reg_no) = lower(rg) limit 1;
    if other is not null then
      raise exception 'REG_ACTIVE:Registration number % already has bike % out.', rg, other;
    end if;
  end if;

  st := coalesce(p_start, now());
  if st > now() + interval '5 minutes' or st < now() - interval '3 days' then st := now(); end if;

  begin
    insert into public.rentals (id, bike_id, user_id, stand_id, renter_name, reg_no, phone, photo,
                                start_at, due_at, minutes, rate, grace_min, booking_id, billing)
    values (p_id, p_bike, uid, sid, nm, rg, ph, p_photo, st, st + make_interval(mins => p_minutes), p_minutes,
            public.stand_rate(sid), nullif(public.setting('grace_minutes', '5'), '')::int, p_booking, 'v2');
  exception when unique_violation then
    raise exception 'BIKE_BUSY:Bike % was just leased on another phone.', bike.number;
  end;

  if p_booking is not null then
    update public.bookings set status = 'done', rental_id = p_id
     where id = p_booking and stand_id = sid and status in ('pending', 'approved');
  end if;
  return jsonb_build_object('ok', true, 'id', p_id, 'bike', bike.number);
end $$;

create or replace function public.return_bike(p_rental uuid, p_returned timestamptz default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r public.rentals%rowtype; bnum text; ret timestamptz; amt int; base int; over int;
begin
  if not public.is_operator() then raise exception 'You are not allowed to do that.'; end if;
  select * into r from public.rentals where id = p_rental and stand_id = public.my_stand() for update;
  if not found then raise exception 'That rental was not found.'; end if;
  select number into bnum from public.bikes where id = r.bike_id;
  if r.returned_at is not null then
    base := public.rental_amount(r.billing, r.start_at, r.due_at, r.due_at, r.rate, r.grace_min);
    return jsonb_build_object('ok', true, 'repeat', true, 'amount', r.amount, 'bike', bnum, 'name', r.renter_name,
      'billing', r.billing, 'base', base, 'extra', greatest(0, r.amount - base),
      'hours', public.billable_hours(r.start_at, r.returned_at, r.grace_min),
      'booked_min', r.minutes,
      'late', greatest(0, public.epoch(r.returned_at) - public.epoch(r.due_at)));
  end if;
  ret := coalesce(p_returned, now());
  if ret > now() then ret := now(); end if;
  if ret < r.start_at then ret := r.start_at; end if;
  amt := public.rental_amount(r.billing, r.start_at, r.due_at, ret, r.rate, r.grace_min);
  base := public.rental_amount(r.billing, r.start_at, r.due_at, r.due_at, r.rate, r.grace_min);
  update public.rentals set returned_at = ret, amount = amt where id = r.id;
  return jsonb_build_object('ok', true, 'amount', amt, 'bike', bnum, 'name', r.renter_name,
    'billing', r.billing, 'base', base, 'extra', greatest(0, amt - base),
    'hours', public.billable_hours(r.start_at, ret, r.grace_min), 'booked_min', r.minutes,
    'late', greatest(0, public.epoch(ret) - public.epoch(r.due_at)));
end $$;

create or replace function public.extend_rental(p_rental uuid, p_new_due timestamptz) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r public.rentals%rowtype; diff int;
begin
  if not public.is_operator() then raise exception 'You are not allowed to do that.'; end if;
  select * into r from public.rentals where id = p_rental and stand_id = public.my_stand() for update;
  if not found then raise exception 'That rental was not found.'; end if;
  if r.returned_at is not null then raise exception 'This bike was already returned.'; end if;
  if p_new_due is null then raise exception 'Choose how much time to add.'; end if;
  if p_new_due <= r.due_at then return jsonb_build_object('ok', true, 'repeat', true); end if;
  if p_new_due > r.due_at + interval '24 hours' then raise exception 'You can add at most 24 hours at a time.'; end if;
  diff := floor(extract(epoch from (p_new_due - r.due_at)) / 60)::int;
  update public.rentals set due_at = p_new_due, minutes = minutes + diff where id = r.id;
  return jsonb_build_object('ok', true);
end $$;

-- ---- history (operator: their stand, admin: everyone) ---------------------------------
drop function if exists public.history_search(text, text, int, int);
create or replace function public.history_search(p_q text default '', p_status text default 'all',
                                                p_limit int default 30, p_offset int default 0,
                                                p_from timestamptz default null, p_to timestamptz default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_lim int := least(5000, greatest(1, coalesce(p_limit, 30)));
  v_off int := greatest(0, coalesce(p_offset, 0));
  v_q text := trim(coalesce(p_q, ''));
  v_like text;
  v_admin boolean := public.is_admin();
  v_stand uuid := public.my_stand();
  v_list jsonb; v_more boolean;
begin
  if not public.is_staff() then raise exception 'You are not allowed to do that.'; end if;
  v_like := '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  with f as (
    select r as rr, b.number as bnum, p.display_name as opn, p.phone as opp, s.name as sname,
           row_number() over (order by r.start_at desc, r.id) as rn
      from public.rentals r
      join public.bikes b on b.id = r.bike_id
      join public.profiles p on p.id = r.user_id
      left join public.stands s on s.id = r.stand_id
     where (v_admin or r.stand_id = v_stand)
       and (v_q = '' or r.renter_name ilike v_like or r.reg_no ilike v_like or r.phone ilike v_like or b.number ilike v_like)
       and (p_from is null or r.start_at >= p_from)
       and (p_to is null or r.start_at < p_to)
       and (coalesce(p_status, 'all') = 'all'
            or (p_status = 'returned' and r.returned_at is not null)
            or (p_status = 'out' and r.returned_at is null)
            or (p_status = 'overdue' and r.returned_at is null and r.due_at < now()))
     order by r.start_at desc, r.id
     limit v_lim + 1 offset v_off)
  select coalesce(jsonb_agg(public.rental_json(f.rr, f.bnum, f.opn, f.opp, f.sname) order by f.rn) filter (where f.rn - v_off <= v_lim), '[]'::jsonb),
         coalesce(count(*) > v_lim, false)
    into v_list, v_more
    from f;
  return jsonb_build_object('now', public.epoch(now()), 'more', v_more, 'rentals', v_list);
end $$;

-- ---- admin: overview, stands and operators -------------------------------------------------
create or replace function public.admin_overview() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare ds timestamptz := public.biz_day_start();
begin
  if not public.is_admin() then raise exception 'You are not allowed to do that.'; end if;
  return jsonb_build_object(
    'now', public.epoch(now()),
    'default_rate', nullif(public.setting('rate', '50'), '')::int,
    'stands', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'name', s.name, 'rate_own', s.rate, 'rate', public.stand_rate(s.id),
        'lat', s.lat, 'lng', s.lng, 'address', s.address, 'active', s.active,
        'bikes',   (select count(*) from public.bikes b where b.stand_id = s.id and b.active),
        'broken',  (select count(*) from public.bikes b where b.stand_id = s.id and b.active and b.out_of_service),
        'out',     (select count(*) from public.rentals r where r.stand_id = s.id and r.returned_at is null),
        'overdue', (select count(*) from public.rentals r where r.stand_id = s.id and r.returned_at is null and r.due_at < now()),
        'pending', (select count(*) from public.bookings k where k.stand_id = s.id and k.status = 'pending'),
        'members', (select coalesce(jsonb_agg(p.display_name order by lower(p.display_name)), '[]'::jsonb)
                      from public.profiles p where p.stand_id = s.id and p.role = 'operator' and p.active))
        order by lower(s.name))
      from public.stands s), '[]'::jsonb),
    'operators', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'email', p.email, 'name', p.display_name, 'phone', p.phone,
        'stand_id', p.stand_id, 'stand', coalesce(s.name, ''), 'active', p.active)
        order by lower(p.display_name))
      from public.profiles p left join public.stands s on s.id = p.stand_id where p.role = 'operator'), '[]'::jsonb),
    'live', coalesce((
      select jsonb_agg(public.rental_json(r, b.number, p.display_name, p.phone, s.name) order by r.due_at)
        from public.rentals r join public.bikes b on b.id = r.bike_id join public.profiles p on p.id = r.user_id
        left join public.stands s on s.id = r.stand_id
       where r.returned_at is null), '[]'::jsonb),
    'today', jsonb_build_object(
      'leases',   (select count(*) from public.rentals where start_at >= ds),
      'returned', (select count(*) from public.rentals where returned_at >= ds),
      'earned',   (select coalesce(sum(amount), 0) from public.rentals where returned_at >= ds)),
    'requests', coalesce((
      select jsonb_agg(public.booking_json(k, s.name) order by k.want_date, k.want_time, k.created_at)
        from public.bookings k join public.stands s on s.id = k.stand_id
       where k.status in ('pending', 'approved') and k.want_date >= public.biz_today() - 1), '[]'::jsonb));
end $$;

create or replace function public.admin_save_stand(p_id uuid, p_name text, p_rate int, p_lat double precision,
                                                   p_lng double precision, p_address text default '',
                                                   p_active boolean default true) returns jsonb
language plpgsql security definer set search_path = public as $$
declare nm text := trim(coalesce(p_name, '')); sid uuid := p_id;
begin
  if not public.is_admin() then raise exception 'You are not allowed to do that.'; end if;
  if char_length(nm) < 2 or char_length(nm) > 60 then raise exception 'Enter a name for the pick-up point.'; end if;
  if p_rate is not null and (p_rate < 1 or p_rate > 100000) then raise exception 'The price must be between 1 and 100000.'; end if;
  if (p_lat is null) <> (p_lng is null) then raise exception 'Location needs both latitude and longitude.'; end if;
  if p_lat is not null and (p_lat < -90 or p_lat > 90 or p_lng < -180 or p_lng > 180) then raise exception 'That location is not valid.'; end if;
  if sid is null then
    insert into public.stands (name, rate, lat, lng, address, active)
    values (nm, p_rate, p_lat, p_lng, left(trim(coalesce(p_address, '')), 160), coalesce(p_active, true)) returning id into sid;
  else
    update public.stands set name = nm, rate = p_rate, lat = p_lat, lng = p_lng,
           address = left(trim(coalesce(p_address, '')), 160), active = coalesce(p_active, true)
     where id = sid;
    if not found then raise exception 'Pick-up point not found.'; end if;
  end if;
  return jsonb_build_object('ok', true, 'id', sid);
end $$;

drop function if exists public.create_invite(text, text, text, text);
create or replace function public.create_invite(p_email text, p_name text, p_phone text default '',
                                                p_stand_id uuid default null, p_new_stand text default '') returns text
language plpgsql security definer set search_path = public, extensions as $$
declare
  c text := encode(extensions.gen_random_bytes(16), 'hex'); em text := lower(trim(coalesce(p_email, '')));
  sid uuid := p_stand_id; sname text;
begin
  if not public.is_admin() then raise exception 'You are not allowed to do that.'; end if;
  if em !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Enter a valid email address.'; end if;
  if char_length(trim(coalesce(p_name, ''))) < 2 then raise exception 'Enter the operator''s name.'; end if;
  if exists (select 1 from public.profiles where lower(email) = em) then
    raise exception 'That email is already registered.';
  end if;
  if sid is not null then
    select name into sname from public.stands where id = sid;
    if not found then raise exception 'That pick-up point was not found.'; end if;
  else
    sname := left(coalesce(nullif(trim(coalesce(p_new_stand, '')), ''), trim(p_name)), 60);
    insert into public.stands (name) values (sname) returning id into sid;
  end if;
  delete from public.invites where expires_at < now() - interval '1 day';
  insert into public.invites (code, email, display_name, phone, stand_name, stand_id, created_by, expires_at)
  values (c, em, left(trim(p_name), 60), left(trim(coalesce(p_phone, '')), 20), sname, sid,
          auth.uid(), now() + interval '15 minutes');
  return c;
end $$;

drop function if exists public.admin_update_operator(uuid, text, text, text);
create or replace function public.admin_update_operator(p_user uuid, p_name text, p_phone text, p_stand_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'You are not allowed to do that.'; end if;
  if char_length(trim(coalesce(p_name, ''))) < 2 then raise exception 'Enter the operator''s name.'; end if;
  if p_stand_id is null or not exists (select 1 from public.stands where id = p_stand_id) then
    raise exception 'Choose a pick-up point.';
  end if;
  update public.profiles
     set display_name = left(trim(p_name), 60), phone = left(trim(coalesce(p_phone, '')), 20), stand_id = p_stand_id
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
  insert into public.audit_log (actor, action, detail)
  values (auth.uid(), case when p_active then 'operator enabled' else 'operator disabled' end, p_user::text);
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
  insert into public.audit_log (actor, action, detail) values (auth.uid(), 'password reset', p_user::text);
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.needs_setup() returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (select 1 from public.profiles where role = 'admin')
$$;

-- ---- admin: warning list, takings report, clearing old records -----------------------------
create or replace function public.reg_flag(p_reg text) returns text
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'You are not allowed to do that.'; end if;
  return public.flag_note(p_reg);
end $$;

create or replace function public.admin_flags() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'You are not allowed to do that.'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', id, 'reg', reg_no, 'note', note, 'created', public.epoch(created_at))
                                    order by created_at desc) from public.flags), '[]'::jsonb);
end $$;

create or replace function public.admin_add_flag(p_reg text, p_note text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare rg text := trim(coalesce(p_reg, '')); nt text := trim(coalesce(p_note, ''));
begin
  if not public.is_admin() then raise exception 'You are not allowed to do that.'; end if;
  if char_length(rg) < 2 or char_length(rg) > 40 then raise exception 'Enter the registration number.'; end if;
  if char_length(nt) < 2 or char_length(nt) > 200 then raise exception 'Write a short note (2 to 200 characters).'; end if;
  insert into public.flags (reg_key, reg_no, note, created_by) values (lower(rg), rg, nt, auth.uid());
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.admin_remove_flag(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'You are not allowed to do that.'; end if;
  delete from public.flags where id = p_id;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.admin_report(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare tz text := public.biz_tz(); f date := coalesce(p_from, public.biz_today()); t date := coalesce(p_to, public.biz_today());
begin
  if not public.is_admin() then raise exception 'You are not allowed to do that.'; end if;
  if t < f then raise exception 'The end date is before the start date.'; end if;
  if t - f > 400 then raise exception 'Choose a range of at most 400 days.'; end if;
  return jsonb_build_object(
    'from', to_char(f, 'YYYY-MM-DD'), 'to', to_char(t, 'YYYY-MM-DD'),
    'total', (select coalesce(sum(amount), 0) from public.rentals
               where returned_at is not null and (returned_at at time zone tz)::date between f and t),
    'count', (select count(*) from public.rentals
               where returned_at is not null and (returned_at at time zone tz)::date between f and t),
    'late', (select count(*) from public.rentals
              where returned_at is not null and (returned_at at time zone tz)::date between f and t
                and returned_at > due_at + make_interval(mins => grace_min)),
    'by_stand', coalesce((
      select jsonb_agg(x order by (x ->> 'collected')::int desc) from (
        select jsonb_build_object('stand', coalesce(s.name, '(none)'), 'count', count(*), 'collected', coalesce(sum(r.amount), 0)) as x
          from public.rentals r left join public.stands s on s.id = r.stand_id
         where r.returned_at is not null and (r.returned_at at time zone tz)::date between f and t
         group by s.name) q), '[]'::jsonb),
    'by_day', coalesce((
      select jsonb_agg(x order by x ->> 'day') from (
        select jsonb_build_object('day', to_char((r.returned_at at time zone tz)::date, 'YYYY-MM-DD'),
                                  'count', count(*), 'collected', coalesce(sum(r.amount), 0)) as x
          from public.rentals r
         where r.returned_at is not null and (r.returned_at at time zone tz)::date between f and t
         group by (r.returned_at at time zone tz)::date) q), '[]'::jsonb));
end $$;

create or replace function public.admin_purge_preview(p_before date, p_mode text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare cut timestamptz; r int; ph int; bk int;
begin
  if not public.is_admin() then raise exception 'You are not allowed to do that.'; end if;
  if p_mode not in ('photos', 'all') then raise exception 'Choose what to clear.'; end if;
  if p_before is null or p_before > public.biz_today() - 7 then raise exception 'Choose a date at least 7 days ago.'; end if;
  cut := (p_before::timestamp) at time zone public.biz_tz();
  select count(*), count(*) filter (where photo <> '') into r, ph
    from public.rentals where returned_at is not null and returned_at < cut;
  select count(*) into bk from public.bookings where want_date < p_before and status not in ('pending', 'approved');
  return jsonb_build_object('rentals', case when p_mode = 'all' then r else 0 end, 'photos', ph,
                            'bookings', case when p_mode = 'all' then bk else 0 end);
end $$;

create or replace function public.admin_purge(p_before date, p_mode text, p_confirm text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare cut timestamptz; paths text[]; nr int := 0; nb int := 0;
begin
  if not public.is_admin() then raise exception 'You are not allowed to do that.'; end if;
  if p_confirm is distinct from 'DELETE' then raise exception 'Type DELETE to confirm.'; end if;
  if p_mode not in ('photos', 'all') then raise exception 'Choose what to clear.'; end if;
  if p_before is null or p_before > public.biz_today() - 7 then raise exception 'Choose a date at least 7 days ago.'; end if;
  cut := (p_before::timestamp) at time zone public.biz_tz();
  select coalesce(array_agg(photo), '{}') into paths
    from public.rentals where returned_at is not null and returned_at < cut and photo <> '';
  if p_mode = 'photos' then
    update public.rentals set photo = '' where returned_at is not null and returned_at < cut and photo <> '';
  else
    delete from public.rentals where returned_at is not null and returned_at < cut;
    get diagnostics nr = row_count;
    delete from public.bookings where want_date < p_before and status not in ('pending', 'approved');
    get diagnostics nb = row_count;
  end if;
  insert into public.audit_log (actor, action, detail)
  values (auth.uid(), 'cleared old records', format('mode=%s before=%s rentals=%s bookings=%s photos=%s',
          p_mode, p_before, nr, nb, coalesce(array_length(paths, 1), 0)));
  return jsonb_build_object('ok', true, 'rentals', nr, 'bookings', nb, 'photos', to_jsonb(paths));
end $$;

create or replace function public.admin_audit() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'You are not allowed to do that.'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('at', public.epoch(at), 'action', action, 'detail', detail) order by at desc)
                     from (select * from public.audit_log order by at desc limit 30) a), '[]'::jsonb);
end $$;

-- ---- students: find a pick-up point and book a bike without an account ---------------------
create or replace function public.public_stands() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', s.id, 'label', s.name, 'lat', s.lat, 'lng', s.lng, 'address', s.address,
           'rate', public.stand_rate(s.id),
           'total', (select count(*) from public.bikes b where b.stand_id = s.id and b.active and not b.out_of_service),
           'free',  (select count(*) from public.bikes b where b.stand_id = s.id and b.active and not b.out_of_service
                        and not exists (select 1 from public.rentals r where r.bike_id = b.id and r.returned_at is null)),
           'phone', (select p.phone from public.profiles p where p.stand_id = s.id and p.role = 'operator' and p.active and p.phone <> ''
                      order by p.created_at limit 1))
         order by lower(s.name)), '[]'::jsonb)
    from public.stands s
   where s.active
     and exists (select 1 from public.profiles p where p.stand_id = s.id and p.role = 'operator' and p.active)
     and exists (select 1 from public.bikes b where b.stand_id = s.id and b.active and not b.out_of_service)
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
  if not exists (select 1 from public.stands s where s.id = p_stand and s.active
                  and exists (select 1 from public.profiles o where o.stand_id = s.id and o.role = 'operator' and o.active)) then
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
    'stand', s.name,
    'stand_phone', (select p.phone from public.profiles p where p.stand_id = s.id and p.role = 'operator' and p.active and p.phone <> ''
                     order by p.created_at limit 1),
    'rate', public.stand_rate(s.id), 'lat', s.lat, 'lng', s.lng, 'address', s.address,
    'location', coalesce(nullif(s.address, ''), public.setting('location')), 'location_note', public.setting('location_note'),
    'map_link', public.setting('map_link'), 'code', b.code)
  from public.bookings b join public.stands s on s.id = b.stand_id
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
  if b.stand_id is distinct from public.my_stand() and not public.is_admin() then raise exception 'You are not allowed to do that.'; end if;
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
--    (is_admin / is_staff / is_operator / my_stand / photo_visible must stay callable:
--     the security rules use them. They only ever tell you about yourself.)
-- ---------------------------------------------------------------------
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig, p.proname
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('is_admin','is_staff','is_operator','my_stand','photo_visible','epoch','setting','biz_tz','biz_today',
         'biz_day_start','stand_rate','billable_hours','rental_amount','rental_json','flag_note','booking_json','handle_new_user',
         'operator_state','update_my_stand','add_bikes','remove_bike','set_bike_service','lease_bike','return_bike','extend_rental',
         'history_search','admin_overview','admin_save_stand','create_invite','admin_update_operator','admin_toggle_operator',
         'admin_set_password','reg_flag','admin_flags','admin_add_flag','admin_remove_flag','admin_report','admin_purge_preview',
         'admin_purge','admin_audit','public_stands','create_booking','booking_status','cancel_booking','decide_booking','needs_setup')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    if f.proname in ('operator_state','update_my_stand','add_bikes','remove_bike','set_bike_service','lease_bike','return_bike',
                     'extend_rental','history_search','admin_overview','admin_save_stand','create_invite','admin_update_operator',
                     'admin_toggle_operator','admin_set_password','reg_flag','admin_flags','admin_add_flag','admin_remove_flag',
                     'admin_report','admin_purge_preview','admin_purge','admin_audit','decide_booking','my_stand','photo_visible') then
      execute format('grant execute on function %s to authenticated', f.sig);
    elsif f.proname in ('is_admin','is_staff','is_operator','needs_setup','public_stands','create_booking','booking_status','cancel_booking') then
      execute format('grant execute on function %s to anon, authenticated', f.sig);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 8. PHOTO STORAGE
--    renter-photos : private. Operators open photos taken at their own stand;
--                    the admin can open and delete all of them.
--    site-media    : public pictures for the website (posts, logos, pop-up, videos).
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public) values ('renter-photos', 'renter-photos', false)
on conflict (id) do update set public = false;
insert into storage.buckets (id, name, public) values ('site-media', 'site-media', true)
on conflict (id) do update set public = true;

drop policy if exists "renter photos read"   on storage.objects;
drop policy if exists "renter photos add"    on storage.objects;
drop policy if exists "renter photos change" on storage.objects;
drop policy if exists "renter photos delete" on storage.objects;
create policy "renter photos read" on storage.objects for select to authenticated
  using (bucket_id = 'renter-photos' and public.photo_visible(name));
create policy "renter photos add" on storage.objects for insert to authenticated
  with check (bucket_id = 'renter-photos' and public.is_operator() and (storage.foldername(name))[1] = auth.uid()::text);
create policy "renter photos change" on storage.objects for update to authenticated
  using (bucket_id = 'renter-photos' and public.is_operator() and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'renter-photos' and public.is_operator() and (storage.foldername(name))[1] = auth.uid()::text);
create policy "renter photos delete" on storage.objects for delete to authenticated
  using (bucket_id = 'renter-photos' and public.is_admin());

drop policy if exists "site media read"   on storage.objects;
drop policy if exists "site media admin"  on storage.objects;
create policy "site media read" on storage.objects for select to anon, authenticated using (bucket_id = 'site-media');
create policy "site media admin" on storage.objects for all to authenticated
  using (bucket_id = 'site-media' and public.is_admin()) with check (bucket_id = 'site-media' and public.is_admin());

commit;
-- Done. New site: Authentication settings (see the guide), then open /setup.html on your site.
-- Upgrade: replace the website files on GitHub (keep your config.js) and you are finished.
