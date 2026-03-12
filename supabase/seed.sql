-- ============================================================
-- F1 FANTASY – SEED DATA (F1 Saison 2026)
-- Ausführen NACH schema.sql
-- ============================================================

-- ─── CONSTRUCTORS 2026 (11 Teams) ────────────────────────────
insert into public.constructors (season_id, name, short_name, color, openf1_id)
select s.id, c.name, c.short_name, c.color, c.openf1_id
from public.seasons s,
(values
  ('McLaren',           'McLaren',      '#FF8000', 9),
  ('Mercedes',          'Mercedes',     '#27F4D2', 4),
  ('Red Bull Racing',   'Red Bull',     '#3671C6', 1),
  ('Ferrari',           'Ferrari',      '#E8002D', 6),
  ('Williams',          'Williams',     '#64C4FF', 8),
  ('Racing Bulls',      'RB',           '#6692FF', 12),
  ('Aston Martin',      'Aston Martin', '#229971', 5),
  ('Haas',              'Haas',         '#B6BABD', 14),
  ('Alpine',            'Alpine',       '#FF87BC', 11),
  ('Audi',              'Audi',         '#C0C0C0', 10),
  ('Cadillac',          'Cadillac',     '#1E3A5F', 15)
) as c(name, short_name, color, openf1_id)
where s.year = 2026;

-- ─── DRIVERS 2026 (22 Fahrer) ────────────────────────────────
insert into public.drivers (season_id, first_name, last_name, number, abbreviation, constructor_id, openf1_driver_number, is_active)
select
  s.id,
  d.first_name, d.last_name, d.number, d.abbreviation,
  (select id from public.constructors where season_id = s.id and short_name = d.team),
  d.number,
  true
from public.seasons s,
(values
  ('Lando',     'Norris',       4,  'NOR', 'McLaren'),
  ('Oscar',     'Piastri',     81,  'PIA', 'McLaren'),
  ('George',    'Russell',     63,  'RUS', 'Mercedes'),
  ('Andrea',    'Antonelli',   12,  'ANT', 'Mercedes'),
  ('Max',       'Verstappen',   1,  'VER', 'Red Bull'),
  ('Isack',     'Hadjar',       6,  'HAD', 'Red Bull'),
  ('Charles',   'Leclerc',     16,  'LEC', 'Ferrari'),
  ('Lewis',     'Hamilton',    44,  'HAM', 'Ferrari'),
  ('Alexander', 'Albon',       23,  'ALB', 'Williams'),
  ('Carlos',    'Sainz',       55,  'SAI', 'Williams'),
  ('Liam',      'Lawson',      30,  'LAW', 'RB'),
  ('Arvid',     'Lindblad',    45,  'LIN', 'RB'),
  ('Fernando',  'Alonso',      14,  'ALO', 'Aston Martin'),
  ('Lance',     'Stroll',      18,  'STR', 'Aston Martin'),
  ('Esteban',   'Ocon',        31,  'OCO', 'Haas'),
  ('Oliver',    'Bearman',     87,  'BEA', 'Haas'),
  ('Pierre',    'Gasly',       10,  'GAS', 'Alpine'),
  ('Franco',    'Colapinto',   43,  'COL', 'Alpine'),
  ('Nico',      'Hülkenberg',  27,  'HUL', 'Audi'),
  ('Gabriel',   'Bortoleto',    5,  'BOR', 'Audi'),
  ('Sergio',    'Pérez',       11,  'PER', 'Cadillac'),
  ('Valtteri',  'Bottas',      77,  'BOT', 'Cadillac')
) as d(first_name, last_name, number, abbreviation, team)
where s.year = 2026;

-- ─── RACE CALENDAR 2026 ──────────────────────────────────────
do $$
declare
  sid int;
begin
  select id into sid from public.seasons where year = 2026;

  insert into public.race_weekends (season_id, round, name, circuit, country, city, flag_emoji, is_sprint_weekend, fp1_start, fp2_start, fp3_start, sprint_quali_start, sprint_start, qualifying_start, race_start, openf1_meeting_key) values

  (sid,1,'Australian Grand Prix','Albert Park Circuit','Australia','Melbourne','🇦🇺',false,
   '2026-03-06 01:30:00'::timestamptz,'2026-03-06 05:00:00'::timestamptz,'2026-03-07 01:30:00'::timestamptz,
   null,null,'2026-03-07 05:00:00'::timestamptz,'2026-03-08 05:00:00'::timestamptz,1261),

  (sid,2,'Chinese Grand Prix','Shanghai International Circuit','China','Shanghai','🇨🇳',true,
   '2026-03-13 03:30:00'::timestamptz,null,null,
   '2026-03-14 03:30:00'::timestamptz,'2026-03-14 07:00:00'::timestamptz,
   '2026-03-13 07:00:00'::timestamptz,'2026-03-15 07:00:00'::timestamptz,1262),

  (sid,3,'Japanese Grand Prix','Suzuka International Racing Course','Japan','Suzuka','🇯🇵',false,
   '2026-03-27 02:30:00'::timestamptz,'2026-03-27 06:00:00'::timestamptz,'2026-03-28 02:30:00'::timestamptz,
   null,null,'2026-03-28 06:00:00'::timestamptz,'2026-03-29 05:00:00'::timestamptz,1263),

  (sid,4,'Bahrain Grand Prix','Bahrain International Circuit','Bahrain','Sakhir','🇧🇭',false,
   '2026-04-10 11:30:00'::timestamptz,'2026-04-10 15:00:00'::timestamptz,'2026-04-11 11:30:00'::timestamptz,
   null,null,'2026-04-11 15:00:00'::timestamptz,'2026-04-12 15:00:00'::timestamptz,1264),

  (sid,5,'Saudi Arabian Grand Prix','Jeddah Corniche Circuit','Saudi Arabia','Jeddah','🇸🇦',false,
   '2026-04-17 13:30:00'::timestamptz,'2026-04-17 17:00:00'::timestamptz,'2026-04-18 13:30:00'::timestamptz,
   null,null,'2026-04-18 17:00:00'::timestamptz,'2026-04-19 17:00:00'::timestamptz,1265),

  (sid,6,'Miami Grand Prix','Miami International Autodrome','USA','Miami','🇺🇸',true,
   '2026-05-01 16:30:00'::timestamptz,null,null,
   '2026-05-02 16:30:00'::timestamptz,'2026-05-02 20:00:00'::timestamptz,
   '2026-05-01 20:00:00'::timestamptz,'2026-05-03 19:00:00'::timestamptz,1266),

  (sid,7,'Canadian Grand Prix','Circuit Gilles Villeneuve','Canada','Montréal','🇨🇦',true,
   '2026-05-22 17:30:00'::timestamptz,null,null,
   '2026-05-23 17:30:00'::timestamptz,'2026-05-23 21:00:00'::timestamptz,
   '2026-05-22 21:00:00'::timestamptz,'2026-05-24 18:00:00'::timestamptz,1267),

  (sid,8,'Monaco Grand Prix','Circuit de Monaco','Monaco','Monte Carlo','🇲🇨',false,
   '2026-06-05 11:30:00'::timestamptz,'2026-06-05 15:00:00'::timestamptz,'2026-06-06 10:30:00'::timestamptz,
   null,null,'2026-06-06 14:00:00'::timestamptz,'2026-06-07 13:00:00'::timestamptz,1268),

  (sid,9,'Barcelona-Catalunya Grand Prix','Circuit de Barcelona-Catalunya','Spain','Barcelona','🇪🇸',false,
   '2026-06-12 11:30:00'::timestamptz,'2026-06-12 15:00:00'::timestamptz,'2026-06-13 10:30:00'::timestamptz,
   null,null,'2026-06-13 14:00:00'::timestamptz,'2026-06-14 13:00:00'::timestamptz,1269),

  (sid,10,'Austrian Grand Prix','Red Bull Ring','Austria','Spielberg','🇦🇹',false,
   '2026-06-26 10:30:00'::timestamptz,'2026-06-26 14:00:00'::timestamptz,'2026-06-27 09:30:00'::timestamptz,
   null,null,'2026-06-27 13:00:00'::timestamptz,'2026-06-28 13:00:00'::timestamptz,1270),

  (sid,11,'British Grand Prix','Silverstone Circuit','United Kingdom','Silverstone','🇬🇧',true,
   '2026-07-03 11:30:00'::timestamptz,null,null,
   '2026-07-04 11:30:00'::timestamptz,'2026-07-04 15:00:00'::timestamptz,
   '2026-07-03 15:00:00'::timestamptz,'2026-07-05 14:00:00'::timestamptz,1271),

  (sid,12,'Belgian Grand Prix','Circuit de Spa-Francorchamps','Belgium','Spa','🇧🇪',false,
   '2026-07-17 11:30:00'::timestamptz,'2026-07-17 15:00:00'::timestamptz,'2026-07-18 10:30:00'::timestamptz,
   null,null,'2026-07-18 14:00:00'::timestamptz,'2026-07-19 13:00:00'::timestamptz,1272),

  (sid,13,'Hungarian Grand Prix','Hungaroring','Hungary','Budapest','🇭🇺',false,
   '2026-07-24 11:30:00'::timestamptz,'2026-07-24 15:00:00'::timestamptz,'2026-07-25 10:30:00'::timestamptz,
   null,null,'2026-07-25 14:00:00'::timestamptz,'2026-07-26 13:00:00'::timestamptz,1273),

  (sid,14,'Dutch Grand Prix','Circuit Zandvoort','Netherlands','Zandvoort','🇳🇱',true,
   '2026-08-21 10:30:00'::timestamptz,null,null,
   '2026-08-22 10:30:00'::timestamptz,'2026-08-22 14:00:00'::timestamptz,
   '2026-08-21 14:00:00'::timestamptz,'2026-08-23 13:00:00'::timestamptz,1274),

  (sid,15,'Italian Grand Prix','Autodromo Nazionale Monza','Italy','Monza','🇮🇹',false,
   '2026-09-04 11:30:00'::timestamptz,'2026-09-04 15:00:00'::timestamptz,'2026-09-05 10:30:00'::timestamptz,
   null,null,'2026-09-05 14:00:00'::timestamptz,'2026-09-06 13:00:00'::timestamptz,1275),

  (sid,16,'Madrid Grand Prix','Madrid Street Circuit','Spain','Madrid','🇪🇸',false,
   '2026-09-11 11:30:00'::timestamptz,'2026-09-11 15:00:00'::timestamptz,'2026-09-12 10:30:00'::timestamptz,
   null,null,'2026-09-12 14:00:00'::timestamptz,'2026-09-13 13:00:00'::timestamptz,1276),

  (sid,17,'Azerbaijan Grand Prix','Baku City Circuit','Azerbaijan','Baku','🇦🇿',false,
   '2026-09-25 09:30:00'::timestamptz,'2026-09-25 13:00:00'::timestamptz,null,
   null,null,'2026-09-25 16:00:00'::timestamptz,'2026-09-26 13:00:00'::timestamptz,1277),

  (sid,18,'Singapore Grand Prix','Marina Bay Street Circuit','Singapore','Singapore','🇸🇬',true,
   '2026-10-09 09:30:00'::timestamptz,null,null,
   '2026-10-10 09:30:00'::timestamptz,'2026-10-10 13:00:00'::timestamptz,
   '2026-10-09 13:00:00'::timestamptz,'2026-10-11 12:00:00'::timestamptz,1278),

  (sid,19,'United States Grand Prix','Circuit of the Americas','USA','Austin','🇺🇸',false,
   '2026-10-23 18:30:00'::timestamptz,'2026-10-23 22:00:00'::timestamptz,'2026-10-24 17:30:00'::timestamptz,
   null,null,'2026-10-24 21:00:00'::timestamptz,'2026-10-25 19:00:00'::timestamptz,1279),

  (sid,20,'Mexico City Grand Prix','Autodromo Hermanos Rodriguez','Mexico','Mexico City','🇲🇽',false,
   '2026-10-30 18:30:00'::timestamptz,'2026-10-30 22:00:00'::timestamptz,'2026-10-31 17:30:00'::timestamptz,
   null,null,'2026-10-31 21:00:00'::timestamptz,'2026-11-01 20:00:00'::timestamptz,1280),

  (sid,21,'São Paulo Grand Prix','Autodromo José Carlos Pace','Brazil','São Paulo','🇧🇷',false,
   '2026-11-06 14:30:00'::timestamptz,'2026-11-06 18:00:00'::timestamptz,'2026-11-07 13:30:00'::timestamptz,
   null,null,'2026-11-07 17:00:00'::timestamptz,'2026-11-08 17:00:00'::timestamptz,1281),

  (sid,22,'Las Vegas Grand Prix','Las Vegas Strip Circuit','USA','Las Vegas','🇺🇸',false,
   '2026-11-19 22:30:00'::timestamptz,'2026-11-20 02:00:00'::timestamptz,null,
   null,null,'2026-11-20 06:00:00'::timestamptz,'2026-11-21 06:00:00'::timestamptz,1282),

  (sid,23,'Qatar Grand Prix','Lusail International Circuit','Qatar','Lusail','🇶🇦',false,
   '2026-11-27 12:30:00'::timestamptz,'2026-11-27 16:00:00'::timestamptz,'2026-11-28 11:30:00'::timestamptz,
   null,null,'2026-11-28 15:00:00'::timestamptz,'2026-11-29 14:00:00'::timestamptz,1283),

  (sid,24,'Abu Dhabi Grand Prix','Yas Marina Circuit','UAE','Abu Dhabi','🇦🇪',false,
   '2026-12-04 09:30:00'::timestamptz,'2026-12-04 13:00:00'::timestamptz,'2026-12-05 09:30:00'::timestamptz,
   null,null,'2026-12-05 13:00:00'::timestamptz,'2026-12-06 13:00:00'::timestamptz,1284);

end $$;
