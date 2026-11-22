-- Reference data: all 10 regions of Cameroon (capital = map centre) + extra major cities,
-- demo rate cards (FCFA) and a few clearly labelled demo restaurants.
insert into public.regions (id, name_en, name_fr, capital_city_id) values -- capitals linked after cities exist
  ('adamawa', 'Adamawa', 'Adamaoua', null),
  ('centre', 'Centre', 'Centre', null),
  ('east', 'East', 'Est', null),
  ('far_north', 'Far North', 'Extrême-Nord', null),
  ('littoral', 'Littoral', 'Littoral', null),
  ('north', 'North', 'Nord', null),
  ('northwest', 'Northwest', 'Nord-Ouest', null),
  ('west', 'West', 'Ouest', null),
  ('south', 'South', 'Sud', null),
  ('southwest', 'Southwest', 'Sud-Ouest', null)
on conflict (id) do nothing;

insert into public.cities (id, region_id, name, is_capital, location) values
  ('ngaoundere', 'adamawa', 'Ngaoundéré', true, public.make_point(7.3277, 13.5847)),
  ('yaounde', 'centre', 'Yaoundé', true, public.make_point(3.8480, 11.5021)),
  ('bertoua', 'east', 'Bertoua', true, public.make_point(4.5772, 13.6846)),
  ('maroua', 'far_north', 'Maroua', true, public.make_point(10.5956, 14.3247)),
  ('douala', 'littoral', 'Douala', true, public.make_point(4.0511, 9.7679)),
  ('garoua', 'north', 'Garoua', true, public.make_point(9.3017, 13.3921)),
  ('bamenda', 'northwest', 'Bamenda', true, public.make_point(5.9631, 10.1591)),
  ('bafoussam', 'west', 'Bafoussam', true, public.make_point(5.4781, 10.4176)),
  ('ebolowa', 'south', 'Ebolowa', true, public.make_point(2.9000, 11.1500)),
  ('buea', 'southwest', 'Buea', true, public.make_point(4.1527, 9.2410)),
  ('limbe', 'southwest', 'Limbe', false, public.make_point(4.0167, 9.2000)),
  ('kumba', 'southwest', 'Kumba', false, public.make_point(4.6363, 9.4469)),
  ('kribi', 'south', 'Kribi', false, public.make_point(2.9395, 9.9100)),
  ('dschang', 'west', 'Dschang', false, public.make_point(5.4500, 10.0667)),
  ('nkongsamba', 'littoral', 'Nkongsamba', false, public.make_point(4.9547, 9.9404))
on conflict (id) do nothing;

update public.regions r set capital_city_id = v.city from (values ('adamawa', 'ngaoundere'), ('centre', 'yaounde'), ('east', 'bertoua'), ('far_north', 'maroua'), ('littoral', 'douala'), ('north', 'garoua'), ('northwest', 'bamenda'), ('west', 'bafoussam'), ('south', 'ebolowa'), ('southwest', 'buea')) as v(region, city) where r.id = v.region;


-- Demo rate cards. Set real prices before launch.
insert into public.rate_cards (key, base_xaf, per_km_xaf, per_min_xaf, minimum_xaf, max_distance_km) values
  ('moto', 150, 100, 10, 300, 30),
  ('car', 500, 250, 20, 1000, 80),
  ('comfort', 1000, 400, 30, 2000, 80),
  ('delivery', 300, 150, 0, 500, 25)
on conflict (key) do update set base_xaf = excluded.base_xaf, per_km_xaf = excluded.per_km_xaf,
  per_min_xaf = excluded.per_min_xaf, minimum_xaf = excluded.minimum_xaf, max_distance_km = excluded.max_distance_km;

-- Demo restaurants (fictional; no owner). Delete before launch.
with r as (
  insert into public.restaurants (name, city_id, location, tags, emoji) values
    ('[DEMO] Chez Tantine Ndolé', 'douala', public.make_point(4.0591, 9.7739), 'Sawa · Littoral', '🥬'),
    ('[DEMO] Mama Okok Kitchen', 'yaounde', public.make_point(3.8540, 11.4941), 'Beti · Centre', '🍃'),
    ('[DEMO] Achu Palace', 'bamenda', public.make_point(5.9701, 10.1641), 'Grassfields · Northwest', '🟡'),
    ('[DEMO] Mountain Eru Spot', 'buea', public.make_point(4.1587, 9.2450), 'Southwest', '🌿'),
    ('[DEMO] Taro Sauce Jaune', 'bafoussam', public.make_point(5.4841, 10.4236), 'Bamiléké · West', '🥘'),
    ('[DEMO] Kilichi de l''Adamaoua', 'ngaoundere', public.make_point(7.3337, 13.5797), 'Adamawa', '🥩'),
    ('[DEMO] Bénoué Couscous', 'garoua', public.make_point(9.2957, 13.3981), 'North', '🌾'),
    ('[DEMO] Diamaré Kitchen', 'maroua', public.make_point(10.6006, 14.3297), 'Far North', '🍚'),
    ('[DEMO] Lom-et-Djérem Table', 'bertoua', public.make_point(4.5832, 13.6786), 'East', '🍠'),
    ('[DEMO] Mvila Saveurs', 'ebolowa', public.make_point(2.8950, 11.1550), 'South', '🍃')
  returning id, name
)
insert into public.menu_items (restaurant_id, name, name_fr, description, description_fr, price_xaf)
select r.id, m.name, m.name_fr, m.description, m.description_fr, m.price
from r join (values
  ('[DEMO] Chez Tantine Ndolé', 'Ndolé with ripe plantains', 'Ndolé et plantains mûrs', 'Bitterleaf, peanuts, beef, shrimp', 'Feuilles amères, arachides, bœuf, crevettes', 2500),
  ('[DEMO] Chez Tantine Ndolé', 'Poulet DG', 'Poulet DG', 'Chicken, plantains, vegetables', 'Poulet, plantains, légumes', 4500),
  ('[DEMO] Mama Okok Kitchen', 'Okok with bobolo', 'Okok et bâton de manioc', 'Gnetum leaves, peanut', 'Feuilles de gnetum, arachide', 2000),
  ('[DEMO] Mama Okok Kitchen', 'Beef soya (10 sticks)', 'Soya de bœuf (10 brochettes)', 'Spiced grilled beef', 'Bœuf grillé épicé', 1000),
  ('[DEMO] Achu Palace', 'Achu and yellow soup', 'Achu et sauce jaune', 'Pounded cocoyam, yellow soup', 'Taro pilé, sauce jaune', 2500),
  ('[DEMO] Achu Palace', 'Njama njama with corn fufu', 'Njama njama et couscous maïs', 'Huckleberry leaves', 'Légumes njama njama', 1500),
  ('[DEMO] Mountain Eru Spot', 'Eru and water fufu', 'Eru et water fufu', 'Okazi leaves, smoked fish', 'Feuilles d''okok, poisson fumé', 2000),
  ('[DEMO] Mountain Eru Spot', 'Ekwang', 'Ekwang', 'Grated cocoyam in leaves', 'Macabo râpé roulé', 2000),
  ('[DEMO] Taro Sauce Jaune', 'Taro with yellow sauce', 'Taro sauce jaune', 'Pounded taro', 'Taro pilé', 2500),
  ('[DEMO] Taro Sauce Jaune', 'Koki and plantains', 'Koki et plantains', 'Steamed bean cake', 'Gâteau de cornille', 1500),
  ('[DEMO] Kilichi de l''Adamaoua', 'Kilichi', 'Kilichi', 'Dried spiced beef', 'Bœuf séché épicé', 1500),
  ('[DEMO] Bénoué Couscous', 'Millet couscous, okra sauce', 'Couscous de mil sauce gombo', 'Northern staple', 'Classique du Nord', 1500),
  ('[DEMO] Diamaré Kitchen', 'Millet couscous, folléré sauce', 'Couscous de mil sauce folléré', 'Sorrel leaf sauce', 'Sauce oseille', 1500),
  ('[DEMO] Lom-et-Djérem Table', 'Kpem with cassava', 'Kpem et manioc', 'Pounded cassava leaves', 'Feuilles de manioc pilées', 1800),
  ('[DEMO] Mvila Saveurs', 'Sweet okok', 'Okok sucré', 'With cassava stick', 'Avec bâton de manioc', 2000)
) as m(rname, name, name_fr, description, description_fr, price) on m.rname = r.name;
