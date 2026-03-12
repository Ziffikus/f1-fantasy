-- ============================================================
-- F1 FANTASY – SUPABASE SCHEMA
-- Ausführen im Supabase SQL Editor (in dieser Reihenfolge)
-- ============================================================

-- ─── EXTENSIONS ─────────────────────────────────────────────
create extension if not exists "uuid-ossp";

-- ─── PROFILES (erweitert auth.users) ────────────────────────
create table public.profiles (
  id          uuid        references auth.users on delete cascade primary key,
  username    text        unique not null,
  display_name text,
  avatar_url  text,
  is_admin    boolean     default false,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- Trigger: Profil automatisch anlegen wenn User sich registriert
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, username, display_name)
  values (new.id, new.email, new.raw_user_meta_data->>'display_name');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ─── SEASONS ────────────────────────────────────────────────
create table public.seasons (
  id         serial      primary key,
  year       int         unique not null,
  is_active  boolean     default false
);

-- Nur eine Saison aktiv gleichzeitig
create unique index only_one_active_season
  on public.seasons (is_active)
  where is_active = true;

-- ─── CONSTRUCTORS (Teams) ────────────────────────────────────
create table public.constructors (
  id              serial  primary key,
  season_id       int     references public.seasons(id) on delete cascade,
  name            text    not null,
  short_name      text,
  color           text    default '#FFFFFF',
  openf1_id       int,
  created_at      timestamptz default now()
);

-- ─── DRIVERS (Fahrer) ────────────────────────────────────────
create table public.drivers (
  id                  serial  primary key,
  season_id           int     references public.seasons(id) on delete cascade,
  first_name          text    not null,
  last_name           text    not null,
  number              int,
  abbreviation        text,
  constructor_id      int     references public.constructors(id),
  openf1_driver_number int,
  is_active           boolean default true,
  created_at          timestamptz default now()
);

-- ─── RACE WEEKENDS ───────────────────────────────────────────
create table public.race_weekends (
  id                    serial      primary key,
  season_id             int         references public.seasons(id) on delete cascade,
  round                 int         not null,
  name                  text        not null,
  circuit               text,
  country               text,
  city                  text,
  flag_emoji            text,
  circuit_image_url     text,
  is_sprint_weekend     boolean     default false,
  openf1_meeting_key    int,
  -- Session-Zeiten (UTC)
  fp1_start             timestamptz,
  fp2_start             timestamptz,   -- null bei Sprint-Wochenende
  fp3_start             timestamptz,   -- null bei Sprint-Wochenende
  sprint_quali_start    timestamptz,   -- nur Sprint-Wochenende
  sprint_start          timestamptz,   -- nur Sprint-Wochenende
  qualifying_start      timestamptz,
  race_start            timestamptz,
  created_at            timestamptz    default now(),
  unique(season_id, round)
);

-- ─── DRAFT ORDER ─────────────────────────────────────────────
create table public.draft_orders (
  id                  serial  primary key,
  race_weekend_id     int     references public.race_weekends(id) on delete cascade,
  profile_id          uuid    references public.profiles(id) on delete cascade,
  pick_order          int     not null,  -- 1 = darf zuerst picken
  is_manual_override  boolean default false,
  created_at          timestamptz default now(),
  unique(race_weekend_id, profile_id),
  unique(race_weekend_id, pick_order)
);

-- ─── PICKS (Draft-Auswahl pro Spieler pro Rennen) ────────────
create table public.picks (
  id              serial  primary key,
  race_weekend_id int     references public.race_weekends(id) on delete cascade,
  profile_id      uuid    references public.profiles(id) on delete cascade,
  -- Entweder driver_id ODER constructor_id (nicht beides)
  driver_id       int     references public.drivers(id),
  constructor_id  int     references public.constructors(id),
  pick_type       text    check (pick_type in ('driver', 'constructor')),
  pick_number     int     not null,  -- Fahrer: 1-4, Teams: 1-2
  created_at      timestamptz default now(),
  updated_at      timestamptz default now(),
  -- Ein Fahrer nur 1x pro Rennen pickbar
  unique(race_weekend_id, driver_id),
  -- Pro Spieler: pick_type + pick_number eindeutig
  unique(race_weekend_id, profile_id, pick_type, pick_number),
  -- Entweder driver oder constructor, nie beides
  constraint pick_type_check check (
    (driver_id is not null and constructor_id is null and pick_type = 'driver') or
    (constructor_id is not null and driver_id is null and pick_type = 'constructor')
  )
);

-- ─── RACE RESULTS ────────────────────────────────────────────
create table public.race_results (
  id                  serial  primary key,
  race_weekend_id     int     references public.race_weekends(id) on delete cascade,
  driver_id           int     references public.drivers(id) on delete cascade,
  session_type        text    check (session_type in ('race', 'sprint')),
  position            int     not null,
  is_manual_override  boolean default false,
  created_at          timestamptz default now(),
  updated_at          timestamptz default now(),
  unique(race_weekend_id, driver_id, session_type)
);

-- ─── PLAYER RACE POINTS (Gecachte Punkte) ────────────────────
create table public.player_race_points (
  id                serial  primary key,
  race_weekend_id   int     references public.race_weekends(id) on delete cascade,
  profile_id        uuid    references public.profiles(id) on delete cascade,
  race_points       int     default 0,
  sprint_points     int     default 0,   -- bereits halbiert gespeichert
  total_points      int     default 0,   -- race + sprint
  weekend_rank      int,                 -- Platz in diesem Wochenende (1=gewonnen)
  created_at        timestamptz default now(),
  updated_at        timestamptz default now(),
  unique(race_weekend_id, profile_id)
);

-- ─── GESAMTWERTUNG VIEW ──────────────────────────────────────
create or replace view public.overall_standings as
select
  p.id           as profile_id,
  p.display_name,
  p.avatar_url,
  p.username,
  coalesce(sum(prp.total_points), 0) as total_points,
  -- Tiebreaker: Anzahl Siege (weekend_rank = 1)
  count(case when prp.weekend_rank = 1 then 1 end) as wins,
  count(case when prp.weekend_rank = 2 then 1 end) as second_places,
  count(case when prp.weekend_rank = 3 then 1 end) as third_places,
  count(prp.id) as races_played
from public.profiles p
left join public.player_race_points prp on prp.profile_id = p.id
group by p.id, p.display_name, p.avatar_url, p.username
order by
  total_points asc,          -- weniger = besser
  wins desc,
  second_places desc,
  third_places desc;

-- ─── ROW LEVEL SECURITY (RLS) ────────────────────────────────

-- Aktiviere RLS für alle Tabellen
alter table public.profiles           enable row level security;
alter table public.seasons            enable row level security;
alter table public.constructors       enable row level security;
alter table public.drivers            enable row level security;
alter table public.race_weekends      enable row level security;
alter table public.draft_orders       enable row level security;
alter table public.picks              enable row level security;
alter table public.race_results       enable row level security;
alter table public.player_race_points enable row level security;

-- Hilfsfunktion: Ist der aktuelle User Admin?
create or replace function public.is_admin()
returns boolean language sql security definer as $$
  select coalesce(
    (select is_admin from public.profiles where id = auth.uid()),
    false
  );
$$;

-- ── PROFILES ──
create policy "Profile lesen: alle eingeloggten" on public.profiles
  for select using (auth.role() = 'authenticated');

create policy "Eigenes Profil bearbeiten" on public.profiles
  for update using (auth.uid() = id);

create policy "Admin: alle Profile bearbeiten" on public.profiles
  for all using (public.is_admin());

-- ── SEASONS, CONSTRUCTORS, DRIVERS, RACE WEEKENDS ──
-- Lesen: alle eingeloggten
-- Schreiben: nur Admin

create policy "Seasons lesen" on public.seasons
  for select using (auth.role() = 'authenticated');
create policy "Seasons Admin" on public.seasons
  for all using (public.is_admin());

create policy "Constructors lesen" on public.constructors
  for select using (auth.role() = 'authenticated');
create policy "Constructors Admin" on public.constructors
  for all using (public.is_admin());

create policy "Drivers lesen" on public.drivers
  for select using (auth.role() = 'authenticated');
create policy "Drivers Admin" on public.drivers
  for all using (public.is_admin());

create policy "Race Weekends lesen" on public.race_weekends
  for select using (auth.role() = 'authenticated');
create policy "Race Weekends Admin" on public.race_weekends
  for all using (public.is_admin());

-- ── DRAFT ORDERS ──
create policy "Draft Order lesen" on public.draft_orders
  for select using (auth.role() = 'authenticated');
create policy "Draft Order Admin" on public.draft_orders
  for all using (public.is_admin());

-- ── PICKS ──
create policy "Picks lesen" on public.picks
  for select using (auth.role() = 'authenticated');

create policy "Eigene Picks eintragen" on public.picks
  for insert with check (auth.uid() = profile_id);

create policy "Eigene Picks bearbeiten" on public.picks
  for update using (auth.uid() = profile_id);

create policy "Admin: alle Picks" on public.picks
  for all using (public.is_admin());

-- ── RACE RESULTS ──
create policy "Ergebnisse lesen" on public.race_results
  for select using (auth.role() = 'authenticated');
create policy "Ergebnisse Admin" on public.race_results
  for all using (public.is_admin());

-- ── PLAYER RACE POINTS ──
create policy "Punkte lesen" on public.player_race_points
  for select using (auth.role() = 'authenticated');
create policy "Punkte Admin" on public.player_race_points
  for all using (public.is_admin());

-- ─── STORAGE BUCKET für Profilbilder ─────────────────────────
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true);

create policy "Avatar lesen: öffentlich" on storage.objects
  for select using (bucket_id = 'avatars');

create policy "Avatar hochladen: eigener Ordner" on storage.objects
  for insert with check (
    bucket_id = 'avatars' and
    auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Avatar löschen: eigener Ordner" on storage.objects
  for delete using (
    bucket_id = 'avatars' and
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- ─── INITIAL DATA: Saison 2025 ───────────────────────────────
insert into public.seasons (year, is_active) values (2026, true);
