/* CamRide demo data. Every driver, restaurant and price here is fictional demo content. */
window.CR_DATA = (function () {
  // All ten regions (capital = map centre) plus a few extra major cities.
  const PLACES = [
    { id: 'douala', name: 'Douala', region: 'Littoral', regionFr: 'Littoral', lat: 4.0511, lng: 9.7679, capital: true },
    { id: 'yaounde', name: 'Yaoundé', region: 'Centre', regionFr: 'Centre', lat: 3.8480, lng: 11.5021, capital: true },
    { id: 'ngaoundere', name: 'Ngaoundéré', region: 'Adamawa', regionFr: 'Adamaoua', lat: 7.3277, lng: 13.5847, capital: true },
    { id: 'bertoua', name: 'Bertoua', region: 'East', regionFr: 'Est', lat: 4.5772, lng: 13.6846, capital: true },
    { id: 'maroua', name: 'Maroua', region: 'Far North', regionFr: 'Extrême-Nord', lat: 10.5956, lng: 14.3247, capital: true },
    { id: 'garoua', name: 'Garoua', region: 'North', regionFr: 'Nord', lat: 9.3017, lng: 13.3921, capital: true },
    { id: 'bamenda', name: 'Bamenda', region: 'Northwest', regionFr: 'Nord-Ouest', lat: 5.9631, lng: 10.1591, capital: true },
    { id: 'bafoussam', name: 'Bafoussam', region: 'West', regionFr: 'Ouest', lat: 5.4781, lng: 10.4176, capital: true },
    { id: 'ebolowa', name: 'Ebolowa', region: 'South', regionFr: 'Sud', lat: 2.9000, lng: 11.1500, capital: true },
    { id: 'buea', name: 'Buea', region: 'Southwest', regionFr: 'Sud-Ouest', lat: 4.1527, lng: 9.2410, capital: true },
    { id: 'limbe', name: 'Limbe', region: 'Southwest', regionFr: 'Sud-Ouest', lat: 4.0167, lng: 9.2000 },
    { id: 'kumba', name: 'Kumba', region: 'Southwest', regionFr: 'Sud-Ouest', lat: 4.6363, lng: 9.4469 },
    { id: 'kribi', name: 'Kribi', region: 'South', regionFr: 'Sud', lat: 2.9395, lng: 9.9100 },
    { id: 'dschang', name: 'Dschang', region: 'West', regionFr: 'Ouest', lat: 5.4500, lng: 10.0667 },
    { id: 'nkongsamba', name: 'Nkongsamba', region: 'Littoral', regionFr: 'Littoral', lat: 4.9547, lng: 9.9404 }
  ];

  // Demo rate cards in FCFA (XAF). Not real prices.
  const RIDES = [
    { id: 'moto', icon: '🏍️', name: 'CamRide Moto', base: 150, perKm: 100, perMin: 10, min: 300, seats: 1, speed: 28 },
    { id: 'car', icon: '🚗', name: 'CamRide Car', base: 500, perKm: 250, perMin: 20, min: 1000, seats: 4, speed: 24 },
    { id: 'comfort', icon: '🚙', name: 'CamRide Comfort', base: 1000, perKm: 400, perMin: 30, min: 2000, seats: 4, speed: 24 }
  ];
  const DELIVERY = { base: 300, perKm: 150, min: 500, maxKm: 25 };

  const D = (id, name, nameFr, price, desc, descFr) => ({ id, name, nameFr, price, desc, descFr });
  // Fictional restaurants spread across all regions, with regionally fitting dishes.
  const RESTAURANTS = [
    { id: 'r1', city: 'douala', dlat: 0.008, dlng: 0.006, name: 'Chez Tantine Ndolé', emoji: '🥬', tags: 'Sawa · Littoral', menu: [
      D('d1', 'Ndolé with ripe plantains', 'Ndolé et plantains mûrs', 2500, 'Bitterleaf, peanuts, beef and shrimp', 'Feuilles amères, arachides, bœuf et crevettes'),
      D('d2', 'Mbongo tchobi fish', 'Mbongo tchobi de poisson', 3000, 'Black spice stew, with plantains', 'Sauce noire épicée, avec plantains'),
      D('d3', 'Grilled fish (poisson braisé)', 'Poisson braisé', 3500, 'Bar fish, miondo and pepper', 'Bar, miondo et piment'),
      D('d4', 'Foléré juice', 'Jus de foléré', 500, 'Hibiscus, ginger, fresh', 'Bissap, gingembre, frais') ] },
    { id: 'r2', city: 'douala', dlat: -0.012, dlng: -0.004, name: 'Carrefour Beignets', emoji: '🍩', tags: 'Street food', menu: [
      D('d5', 'Beignets-haricots-bouillie', 'Beignets-haricots-bouillie', 700, 'Puff-puff, beans and corn porridge', 'Beignets, haricots et bouillie de maïs'),
      D('d6', 'Poulet DG', 'Poulet DG', 4500, 'Chicken, plantains and vegetables', 'Poulet, plantains et légumes'),
      D('d7', 'Ginger juice', 'Jus de gingembre', 500, 'House-made', 'Fait maison') ] },
    { id: 'r3', city: 'yaounde', dlat: 0.006, dlng: -0.008, name: 'Mama Okok Kitchen', emoji: '🍃', tags: 'Beti · Centre', menu: [
      D('d8', 'Okok with bobolo', 'Okok et bâton de manioc', 2000, 'Gnetum leaves, peanut, cassava stick', 'Feuilles de gnetum, arachide, bâton'),
      D('d9', 'Sanga', 'Sanga', 1500, 'Fresh corn, cassava leaves, palm nut', 'Maïs frais, feuilles de manioc, noix de palme'),
      D('d10', 'Poulet DG', 'Poulet DG', 4500, 'The classic', 'Le classique') ] },
    { id: 'r4', city: 'yaounde', dlat: -0.01, dlng: 0.01, name: 'Soya du Carrefour', emoji: '🍢', tags: 'Grill', menu: [
      D('d11', 'Beef soya (10 sticks)', 'Soya de bœuf (10 brochettes)', 1000, 'Spiced grilled beef', 'Bœuf grillé épicé'),
      D('d12', 'Braised chicken and miondo', 'Poulet braisé et miondo', 3000, 'Half chicken', 'Demi-poulet') ] },
    { id: 'r5', city: 'bamenda', dlat: 0.007, dlng: 0.005, name: 'Achu Palace', emoji: '🟡', tags: 'Grassfields · Northwest', menu: [
      D('d13', 'Achu and yellow soup', 'Achu et sauce jaune', 2500, 'Pounded cocoyam, kanwa yellow soup, cow skin', 'Taro pilé, sauce jaune, peau de bœuf'),
      D('d14', 'Njama njama with corn fufu', 'Njama njama et couscous maïs', 1500, 'Huckleberry leaves', 'Légumes njama njama'),
      D('d15', 'Kati kati chicken', 'Poulet kati kati', 3500, 'Grilled chicken, red oil, corn fufu', 'Poulet grillé, huile rouge, couscous') ] },
    { id: 'r6', city: 'bamenda', dlat: -0.009, dlng: -0.006, name: 'Up-Station Corner', emoji: '🍲', tags: 'Northwest', menu: [
      D('d16', 'Fufu corn and vegetable', 'Couscous maïs et légumes', 1500, 'Daily favourite', 'Le favori du jour'),
      D('d17', 'Beef soya', 'Soya de bœuf', 1000, 'Spiced grilled beef', 'Bœuf grillé épicé') ] },
    { id: 'r7', city: 'buea', dlat: 0.006, dlng: 0.004, name: 'Mountain Eru Spot', emoji: '🌿', tags: 'Southwest', menu: [
      D('d18', 'Eru and water fufu', 'Eru et water fufu', 2000, 'Okazi leaves, waterleaf, smoked fish', 'Feuilles d’okok, poisson fumé'),
      D('d19', 'Ekwang', 'Ekwang', 2000, 'Grated cocoyam wrapped in leaves', 'Macabo râpé roulé dans les feuilles'),
      D('d20', 'Pepper soup', 'Pepper soup', 2500, 'Goat meat, spicy', 'Viande de chèvre, épicée') ] },
    { id: 'r8', city: 'limbe', dlat: 0.004, dlng: 0.008, name: 'Down Beach Fish', emoji: '🐟', tags: 'Seaside', menu: [
      D('d21', 'Grilled fish and plantains', 'Poisson braisé et plantains', 3500, 'Fresh catch, pepper sauce', 'Pêche du jour, sauce piment'),
      D('d22', 'Bobolo and fried fish', 'Bobolo et poisson frit', 2500, 'Cassava stick', 'Bâton de manioc') ] },
    { id: 'r9', city: 'kumba', dlat: 0.005, dlng: -0.005, name: 'Kumba Market Kitchen', emoji: '🍛', tags: 'Southwest', menu: [
      D('d23', 'Eru and garri', 'Eru et garri', 1800, 'Classic Kumba plate', 'Plat classique de Kumba'),
      D('d24', 'Rice and stew', 'Riz sauce tomate', 1500, 'With chicken', 'Avec poulet') ] },
    { id: 'r10', city: 'bafoussam', dlat: 0.006, dlng: 0.006, name: 'Taro Sauce Jaune', emoji: '🥘', tags: 'Bamiléké · West', menu: [
      D('d25', 'Taro with yellow sauce', 'Taro sauce jaune', 2500, 'Pounded taro, kanwa sauce', 'Taro pilé, sauce jaune'),
      D('d26', 'Koki and plantains', 'Koki et plantains', 1500, 'Steamed black-eyed pea cake', 'Gâteau de cornille à la vapeur'),
      D('d27', 'Kondre', 'Kondré', 3000, 'Unripe plantain and goat stew', 'Plantain vert et chèvre') ] },
    { id: 'r11', city: 'dschang', dlat: -0.004, dlng: 0.005, name: 'Menoua Grill', emoji: '🔥', tags: 'West', menu: [
      D('d28', 'Pork soya', 'Soya de porc', 1500, 'Grilled with pepper', 'Grillé au piment'),
      D('d29', 'Nkui with fufu corn', 'Nkui et couscous maïs', 2000, 'Traditional West soup', 'Sauce traditionnelle de l’Ouest') ] },
    { id: 'r12', city: 'ngaoundere', dlat: 0.006, dlng: -0.005, name: 'Kilichi de l’Adamaoua', emoji: '🥩', tags: 'Adamawa', menu: [
      D('d30', 'Kilichi (dried spiced beef)', 'Kilichi', 1500, 'Sun-dried beef with spices', 'Bœuf séché épicé'),
      D('d31', 'Beef soya', 'Soya de bœuf', 1000, 'From local cattle', 'Bœuf local'),
      D('d32', 'Kossam (fresh milk)', 'Kossam (lait frais)', 500, 'Fermented milk', 'Lait caillé') ] },
    { id: 'r13', city: 'garoua', dlat: -0.006, dlng: 0.006, name: 'Bénoué Couscous', emoji: '🌾', tags: 'North', menu: [
      D('d33', 'Millet couscous with okra sauce', 'Couscous de mil sauce gombo', 1500, 'Northern staple', 'Classique du Nord'),
      D('d34', 'Grilled capitaine fish', 'Capitaine braisé', 3500, 'From the Bénoué', 'De la Bénoué'),
      D('d35', 'Foléré juice', 'Jus de foléré', 500, 'Hibiscus', 'Bissap') ] },
    { id: 'r14', city: 'maroua', dlat: 0.005, dlng: 0.005, name: 'Diamaré Kitchen', emoji: '🍚', tags: 'Far North', menu: [
      D('d36', 'Millet couscous with folléré sauce', 'Couscous de mil sauce folléré', 1500, 'Sorrel leaf sauce', 'Sauce feuilles d’oseille'),
      D('d37', 'Beef soya', 'Soya de bœuf', 1000, 'Spiced grilled beef', 'Bœuf grillé épicé'),
      D('d38', 'Bouillie de mil', 'Bouillie de mil', 400, 'Warm millet porridge', 'Bouillie chaude') ] },
    { id: 'r15', city: 'bertoua', dlat: 0.006, dlng: -0.006, name: 'Lom-et-Djérem Table', emoji: '🍠', tags: 'East', menu: [
      D('d39', 'Kpem with cassava', 'Kpem et manioc', 1800, 'Pounded cassava leaves', 'Feuilles de manioc pilées'),
      D('d40', 'Smoked fish stew', 'Sauce de poisson fumé', 2500, 'With bobolo', 'Avec bobolo') ] },
    { id: 'r16', city: 'ebolowa', dlat: -0.005, dlng: 0.005, name: 'Mvila Saveurs', emoji: '🍃', tags: 'South', menu: [
      D('d41', 'Sweet okok', 'Okok sucré', 2000, 'With cassava stick', 'Avec bâton de manioc'),
      D('d42', 'Fish ndomba', 'Ndomba de poisson', 2500, 'Steamed in leaves', 'Cuit à l’étouffée dans les feuilles') ] },
    { id: 'r17', city: 'kribi', dlat: 0.004, dlng: 0.006, name: 'Kribi Plage Grill', emoji: '🦐', tags: 'Seaside · South', menu: [
      D('d43', 'Grilled prawns', 'Crevettes grillées', 5000, 'With plantains', 'Avec plantains'),
      D('d44', 'Grilled fish and miondo', 'Poisson braisé et miondo', 3500, 'Fresh from the beach', 'Frais de la plage') ] },
    { id: 'r18', city: 'nkongsamba', dlat: 0.005, dlng: 0.004, name: 'Moungo Délices', emoji: '🍌', tags: 'Littoral', menu: [
      D('d45', 'Koki and ripe plantains', 'Koki et plantains mûrs', 1500, 'Classic', 'Classique'),
      D('d46', 'Poulet DG', 'Poulet DG', 4500, 'The classic', 'Le classique') ] }
  ];

  const FIRST = ['Jean-Paul', 'Mireille', 'Emmanuel', 'Brenda', 'Ibrahim', 'Clarisse', 'Ngwa', 'Aïcha', 'Patrick', 'Esther', 'Moussa', 'Divine'];
  const LAST = ['N.', 'T.', 'F.', 'A.', 'M.', 'B.', 'K.', 'E.'];
  const CARS = ['Toyota Corolla', 'Toyota Yaris', 'Hyundai Accent', 'Suzuki Dzire', 'Toyota Camry', 'Kia Rio'];
  const MOTOS = ['Nanfang 125', 'Haojue 125', 'Sanili 125', 'TVS HLX 125'];
  const PLATE_PREFIX = { douala: 'LT', nkongsamba: 'LT', yaounde: 'CE', ngaoundere: 'AD', bertoua: 'ES', maroua: 'EN', garoua: 'NO', bamenda: 'NW', bafoussam: 'OU', dschang: 'OU', ebolowa: 'SU', kribi: 'SU', buea: 'SW', limbe: 'SW', kumba: 'SW' };

  const I18N = {
    en: {
      demoPill: 'DEMO', cityLabel: 'Region / city', tabRide: 'Ride', tabFood: 'Food', tabActivity: 'Activity', tabJoin: 'Join', tabAdmin: 'Dashboard',
      footer: 'Demo prototype. Payments are simulated: no real money moves. Drivers, restaurants and dishes are fictional.', goLive: 'Go-live notes',
      whereTo: 'Where to?', searchPh: 'Search a place in Cameroon…', search: 'Search', pickup: 'Pickup', destination: 'Destination',
      tapHint: 'Tap the map to set your destination. Drag the green pin to adjust pickup.', yourLocation: 'Your location', locating: 'Finding your location…',
      outsideCm: 'You appear to be outside Cameroon, so the demo is centred on {city}.', useMine: 'Use my location anyway', geoDenied: 'Location unavailable. Using {city} centre.',
      chooseRide: 'Choose a ride', route: 'Route', approx: 'straight-line estimate ×1.3', roadRoute: 'road route', min: 'min', km: 'km',
      payWith: 'Pay with', cash: 'Cash', request: 'Request {ride}', back: 'Back', cancel: 'Cancel',
      motoNote: 'Moto: 1 passenger, helmet for passenger. Moto-taxis are banned or time-restricted in some districts (e.g. Bonanjo in Douala).',
      searching: 'Finding a nearby driver…', matched: 'Driver on the way', arriving: 'Arriving in {n} min', arrived: 'Your driver has arrived',
      startTrip: 'Start trip', onTrip: 'On the trip', remaining: '{n} min to destination', tripDone: 'You have arrived!', payNow: 'Pay {amt}',
      rate: 'Rate your driver', submitRating: 'Submit', skip: 'Skip', thanks: 'Thanks for riding with CamRide (demo).', rating: 'rating',
      searchNone: 'No results. Try another name.', searchErr: 'Search is unavailable right now. Tap the map instead.', tooShort: 'Type at least 3 letters.',
      noDest: 'Pick a destination first.', busy: 'Finish the current trip or delivery first.',
      foodTitle: 'Food delivery', foodNote: 'Fictional demo restaurants with real Cameroonian dishes. Delivery to your pickup point.',
      nearYou: 'Near you', farAway: 'Other regions (too far to deliver)', deliveryFee: 'Delivery', subtotal: 'Subtotal', total: 'Total', add: 'Add',
      viewCart: 'View cart · {n} items', checkout: 'Checkout', deliverTo: 'Deliver to', placeOrder: 'Place order', emptyCart: 'Your cart is empty.',
      tooFar: 'Too far to deliver', away: '{d} km away', otherResto: 'Your cart has items from another restaurant. Start a new cart?',
      st0: 'Order received', st1: 'Preparing', st2: 'Courier picked up', st3: 'On the way', st4: 'Delivered',
      trackTitle: 'Order tracking', courier: 'Courier', delivered: 'Enjoy your meal!', done: 'Done',
      payTitle: 'Mobile money payment', demoMode: 'DEMO MODE: no real money moves.', phoneLabel: 'Mobile money number',
      payBtn: 'Send payment prompt', badPhone: 'Enter a 9-digit Cameroon mobile number starting with 6.',
      wrongOp: 'This number looks like {op}. Choose {op} or use another number.', unknownOp: 'This prefix is not recognised as MTN or Orange in this demo.',
      approveTitle: 'Approve on your phone', approveText: 'In real life, a prompt appears on {phone}. You confirm with your PIN on your phone, or dial {ussd}. Never type your PIN on a website.',
      phoneScreen: 'Pay {amt} to CamRide? Ref {ref}', approve: 'Approve (demo)', decline: 'Decline', waiting: 'Waiting for approval…',
      declined: 'Payment declined. Nothing was charged.', paidTitle: 'Payment successful (demo)', receipt: 'Receipt', method: 'Method', ref: 'Reference', date: 'Date', amount: 'Amount',
      cashNote: 'Pay the driver or courier in cash on arrival.', close: 'Close', continue: 'Continue',
      activityTitle: 'Your activity', activityNote: 'Trips and orders you make in this demo are saved only in this browser.', none: 'Nothing yet.',
      trip: 'Trip', order: 'Order', paid: 'Paid', cashDue: 'Cash',
      joinTitle: 'Join CamRide', joinNote: 'Demo form. Nothing is sent anywhere: your answers stay in this browser (localStorage).',
      fRole: 'I want to', roleRider: 'Ride / order food', roleCar: 'Drive a car (VTC)', roleMoto: 'Ride a moto-taxi (benskin)', roleCourier: 'Deliver food (courier)', roleResto: 'List my restaurant',
      fName: 'Full name', fPhone: 'Phone (+237)', fCity: 'City', fPlate: 'Plate number', fDocs: 'I have a valid licence, carte grise, insurance and technical inspection',
      fSubmit: 'Save sign-up (demo)', mySignups: 'Sign-ups saved in this browser', saved: 'Saved in this browser only.', needName: 'Enter your name.', del: 'Delete',
      adminTitle: 'Operator dashboard', adminNote: 'Built only from the demo trips, orders and sign-ups in this browser. No real data.',
      kTrips: 'Trips', kOrders: 'Orders', kSignups: 'Sign-ups', kGmv: 'Demo volume', byRegion: 'By region', recent: 'Recent', clearAll: 'Clear demo data', cleared: 'Demo data cleared.',
      confirmClear: 'Delete all demo trips, orders and sign-ups in this browser?', type: 'Type', status: 'Status', city: 'City', who: 'Name', when: 'When'
    },
    fr: {
      demoPill: 'DÉMO', cityLabel: 'Région / ville', tabRide: 'Course', tabFood: 'Repas', tabActivity: 'Activité', tabJoin: 'Rejoindre', tabAdmin: 'Tableau',
      footer: 'Prototype de démonstration. Paiements simulés : aucun argent réel. Chauffeurs, restaurants et plats fictifs.', goLive: 'Notes de lancement',
      whereTo: 'Où allez-vous ?', searchPh: 'Chercher un lieu au Cameroun…', search: 'Chercher', pickup: 'Départ', destination: 'Destination',
      tapHint: 'Touchez la carte pour choisir la destination. Faites glisser l’épingle verte pour ajuster le départ.', yourLocation: 'Votre position', locating: 'Recherche de votre position…',
      outsideCm: 'Vous semblez être hors du Cameroun : la démo est centrée sur {city}.', useMine: 'Utiliser ma position quand même', geoDenied: 'Position indisponible. Centre de {city} utilisé.',
      chooseRide: 'Choisissez une course', route: 'Trajet', approx: 'estimation à vol d’oiseau ×1,3', roadRoute: 'itinéraire routier', min: 'min', km: 'km',
      payWith: 'Payer avec', cash: 'Espèces', request: 'Commander {ride}', back: 'Retour', cancel: 'Annuler',
      motoNote: 'Moto : 1 passager, casque passager. Les motos-taxis sont interdites ou limitées en horaires dans certains quartiers (ex. Bonanjo à Douala).',
      searching: 'Recherche d’un chauffeur proche…', matched: 'Chauffeur en route', arriving: 'Arrivée dans {n} min', arrived: 'Votre chauffeur est arrivé',
      startTrip: 'Démarrer la course', onTrip: 'Course en cours', remaining: '{n} min avant l’arrivée', tripDone: 'Vous êtes arrivé !', payNow: 'Payer {amt}',
      rate: 'Notez votre chauffeur', submitRating: 'Envoyer', skip: 'Passer', thanks: 'Merci d’avoir roulé avec CamRide (démo).', rating: 'note',
      searchNone: 'Aucun résultat. Essayez un autre nom.', searchErr: 'Recherche indisponible. Touchez la carte.', tooShort: 'Tapez au moins 3 lettres.',
      noDest: 'Choisissez d’abord une destination.', busy: 'Terminez d’abord la course ou la livraison en cours.',
      foodTitle: 'Livraison de repas', foodNote: 'Restaurants de démo fictifs, vrais plats camerounais. Livraison à votre point de départ.',
      nearYou: 'Près de vous', farAway: 'Autres régions (trop loin pour livrer)', deliveryFee: 'Livraison', subtotal: 'Sous-total', total: 'Total', add: 'Ajouter',
      viewCart: 'Voir le panier · {n} articles', checkout: 'Paiement', deliverTo: 'Livrer à', placeOrder: 'Commander', emptyCart: 'Votre panier est vide.',
      tooFar: 'Trop loin pour livrer', away: 'à {d} km', otherResto: 'Votre panier contient des articles d’un autre restaurant. Nouveau panier ?',
      st0: 'Commande reçue', st1: 'En préparation', st2: 'Récupérée par le livreur', st3: 'En route', st4: 'Livrée',
      trackTitle: 'Suivi de commande', courier: 'Livreur', delivered: 'Bon appétit !', done: 'Terminé',
      payTitle: 'Paiement mobile money', demoMode: 'MODE DÉMO : aucun argent réel.', phoneLabel: 'Numéro mobile money',
      payBtn: 'Envoyer la demande de paiement', badPhone: 'Entrez un numéro camerounais à 9 chiffres commençant par 6.',
      wrongOp: 'Ce numéro semble être {op}. Choisissez {op} ou un autre numéro.', unknownOp: 'Ce préfixe n’est pas reconnu comme MTN ou Orange dans cette démo.',
      approveTitle: 'Validez sur votre téléphone', approveText: 'En vrai, une demande s’affiche sur {phone}. Vous confirmez avec votre code secret sur le téléphone, ou en composant {ussd}. Ne tapez jamais votre code sur un site web.',
      phoneScreen: 'Payer {amt} à CamRide ? Réf {ref}', approve: 'Valider (démo)', decline: 'Refuser', waiting: 'En attente de validation…',
      declined: 'Paiement refusé. Rien n’a été débité.', paidTitle: 'Paiement réussi (démo)', receipt: 'Reçu', method: 'Moyen', ref: 'Référence', date: 'Date', amount: 'Montant',
      cashNote: 'Payez le chauffeur ou le livreur en espèces à l’arrivée.', close: 'Fermer', continue: 'Continuer',
      activityTitle: 'Votre activité', activityNote: 'Les courses et commandes de cette démo restent uniquement dans ce navigateur.', none: 'Rien pour le moment.',
      trip: 'Course', order: 'Commande', paid: 'Payé', cashDue: 'Espèces',
      joinTitle: 'Rejoindre CamRide', joinNote: 'Formulaire de démo. Rien n’est envoyé : vos réponses restent dans ce navigateur (localStorage).',
      fRole: 'Je veux', roleRider: 'Voyager / commander', roleCar: 'Conduire une voiture (VTC)', roleMoto: 'Conduire une moto-taxi (benskin)', roleCourier: 'Livrer des repas', roleResto: 'Inscrire mon restaurant',
      fName: 'Nom complet', fPhone: 'Téléphone (+237)', fCity: 'Ville', fPlate: 'Immatriculation', fDocs: 'J’ai un permis, une carte grise, une assurance et une visite technique valides',
      fSubmit: 'Enregistrer (démo)', mySignups: 'Inscriptions enregistrées dans ce navigateur', saved: 'Enregistré dans ce navigateur uniquement.', needName: 'Entrez votre nom.', del: 'Supprimer',
      adminTitle: 'Tableau de bord opérateur', adminNote: 'Construit uniquement à partir des courses, commandes et inscriptions de démo de ce navigateur. Aucune donnée réelle.',
      kTrips: 'Courses', kOrders: 'Commandes', kSignups: 'Inscriptions', kGmv: 'Volume démo', byRegion: 'Par région', recent: 'Récent', clearAll: 'Effacer les données démo', cleared: 'Données démo effacées.',
      confirmClear: 'Supprimer toutes les courses, commandes et inscriptions de démo de ce navigateur ?', type: 'Type', status: 'Statut', city: 'Ville', who: 'Nom', when: 'Quand'
    }
  };

  return { PLACES, RIDES, DELIVERY, RESTAURANTS, FIRST, LAST, CARS, MOTOS, PLATE_PREFIX, I18N };
})();
