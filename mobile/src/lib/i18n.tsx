import AsyncStorage from "@react-native-async-storage/async-storage";
import { getLocales } from "expo-localization";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type Lang = "fr" | "en";

const en = {
  appName: "CamRide",
  // auth
  signInTitle: "Sign in with your phone",
  phone: "Phone number",
  sendCode: "Send code",
  code: "6-digit code",
  verify: "Verify",
  codeSent: "We sent a code by SMS to {phone}.",
  badPhone: "Enter a Cameroon mobile number: +237 6XX XXX XXX",
  notConfigured: "Supabase is not configured. Copy mobile/.env.example to mobile/.env and fill it in.",
  // onboarding
  welcome: "Welcome to CamRide",
  fullName: "Full name",
  iWantTo: "I want to",
  roleRider: "Ride and order food",
  roleDriver: "Drive (car or moto-taxi)",
  roleCourier: "Deliver food",
  roleRestaurant: "Sell food (restaurant)",
  city: "City",
  vehicleType: "Vehicle",
  makeModel: "Make and model",
  plate: "Plate number",
  continue: "Continue",
  save: "Save",
  // rider
  whereTo: "Where to?",
  searchPlace: "Search a place",
  search: "Search",
  pickup: "Pickup",
  destination: "Destination",
  tapMap: "Tap the map to choose your destination.",
  getPrices: "See prices",
  chooseRide: "Choose a ride",
  payWith: "Pay with",
  cash: "Cash",
  request: "Request",
  moto: "CamRide Moto",
  car: "CamRide Car",
  comfort: "CamRide Comfort",
  motoNote: "1 passenger. Helmet required. Moto-taxis are banned or limited in some districts (e.g. Bonanjo in Douala).",
  locationDenied: "Location permission denied. Using {city}.",
  outside: "You are outside Cameroon. Using {city}.",
  // trip
  st_requested: "Looking for a driver…",
  st_offered: "Waiting for a driver to accept…",
  st_accepted: "Driver on the way",
  st_arrived: "Your driver has arrived",
  st_in_progress: "On the trip",
  st_completed: "Trip completed",
  st_cancelled: "Cancelled",
  st_no_drivers: "No drivers available right now",
  retry: "Try again",
  cancel: "Cancel",
  rateDriver: "Rate your driver",
  thanks: "Thank you!",
  total: "Total",
  // food
  food: "Food",
  ride: "Ride",
  activity: "Activity",
  account: "Account",
  restaurantsNear: "Restaurants near you",
  noRestaurants: "No restaurants deliver here yet.",
  closed: "Closed",
  deliveryFee: "Delivery",
  subtotal: "Subtotal",
  add: "Add",
  viewCart: "View cart ({n})",
  checkout: "Checkout",
  deliverTo: "Deliver to",
  currentLocation: "Your current location",
  placeOrder: "Place order",
  os_pending_payment: "Waiting for payment",
  os_placed: "Order placed",
  os_accepted: "Accepted by the restaurant",
  os_preparing: "Preparing",
  os_ready: "Ready for pickup",
  os_picked_up: "On the way",
  os_delivered: "Delivered",
  os_cancelled: "Cancelled",
  courier: "Courier",
  // payments
  payTitle: "Pay with mobile money",
  payPhone: "Mobile money number",
  payNow: "Pay {amount}",
  approveOnPhone: "Approve the payment on your phone. If no prompt appears, dial {ussd}. Never share your PIN.",
  paid: "Paid",
  payFailed: "Payment failed. You were not charged.",
  wrongOperator: "This number looks like {op}. Choose {op} or another number.",
  // driver
  goOnline: "Go online",
  goOffline: "Go offline",
  online: "Online",
  offline: "Offline",
  notVerified: "Your documents are being verified. You can go online once approved.",
  newRequest: "New request",
  accept: "Accept",
  decline: "Decline",
  arrived: "I have arrived",
  startTrip: "Start trip",
  completeTrip: "Complete trip",
  collectCash: "Collect {amount} in cash",
  pickedUp: "Picked up",
  delivered: "Delivered",
  noJob: "Waiting for requests…",
  // partner
  myRestaurant: "My restaurant",
  createRestaurant: "Create my restaurant",
  restaurantName: "Restaurant name",
  usesLocation: "Uses your current location as the restaurant address.",
  incomingOrders: "Orders",
  markPreparing: "Preparing",
  markReady: "Ready",
  addItem: "Add menu item",
  itemName: "Dish name",
  price: "Price (FCFA)",
  // account
  language: "Language",
  switchRole: "Change role",
  signOut: "Sign out",
  none: "Nothing yet.",
  error: "Something went wrong: {msg}",
  locationNeeded: "Location permission is needed to go online.",
  driverConsole: "Driver console",
  courierConsole: "Courier console",
  notRegistered: "You are not registered as a driver or courier yet.",
  awaitingVerification: "Your documents are awaiting verification. You can go online once an admin approves them.",
  newRide: "New ride request",
  newDelivery: "New delivery",
  waitingRequests: "Waiting for requests…",
  open: "Open",
  menu: "Menu",
  priceXaf: "Price (FCFA)",
};

type Dict = typeof en;
export type TKey = keyof Dict;

const fr: Dict = {
  appName: "CamRide",
  signInTitle: "Connexion par téléphone",
  phone: "Numéro de téléphone",
  sendCode: "Envoyer le code",
  code: "Code à 6 chiffres",
  verify: "Vérifier",
  codeSent: "Code envoyé par SMS au {phone}.",
  badPhone: "Entrez un numéro mobile camerounais : +237 6XX XXX XXX",
  notConfigured: "Supabase n’est pas configuré. Copiez mobile/.env.example vers mobile/.env et remplissez-le.",
  welcome: "Bienvenue sur CamRide",
  fullName: "Nom complet",
  iWantTo: "Je veux",
  roleRider: "Voyager et commander à manger",
  roleDriver: "Conduire (voiture ou moto-taxi)",
  roleCourier: "Livrer des repas",
  roleRestaurant: "Vendre (restaurant)",
  city: "Ville",
  vehicleType: "Véhicule",
  makeModel: "Marque et modèle",
  plate: "Immatriculation",
  continue: "Continuer",
  save: "Enregistrer",
  whereTo: "Où allez-vous ?",
  searchPlace: "Chercher un lieu",
  search: "Chercher",
  pickup: "Départ",
  destination: "Destination",
  tapMap: "Touchez la carte pour choisir la destination.",
  getPrices: "Voir les prix",
  chooseRide: "Choisissez une course",
  payWith: "Payer avec",
  cash: "Espèces",
  request: "Commander",
  moto: "CamRide Moto",
  car: "CamRide Voiture",
  comfort: "CamRide Confort",
  motoNote: "1 passager. Casque obligatoire. Les motos-taxis sont interdites ou limitées dans certains quartiers (ex. Bonanjo à Douala).",
  locationDenied: "Localisation refusée. Ville utilisée : {city}.",
  outside: "Vous êtes hors du Cameroun. Ville utilisée : {city}.",
  st_requested: "Recherche d’un chauffeur…",
  st_offered: "En attente d’acceptation…",
  st_accepted: "Chauffeur en route",
  st_arrived: "Votre chauffeur est arrivé",
  st_in_progress: "Course en cours",
  st_completed: "Course terminée",
  st_cancelled: "Annulée",
  st_no_drivers: "Aucun chauffeur disponible pour le moment",
  retry: "Réessayer",
  cancel: "Annuler",
  rateDriver: "Notez votre chauffeur",
  thanks: "Merci !",
  total: "Total",
  food: "Repas",
  ride: "Course",
  activity: "Activité",
  account: "Compte",
  restaurantsNear: "Restaurants près de vous",
  noRestaurants: "Aucun restaurant ne livre ici pour l’instant.",
  closed: "Fermé",
  deliveryFee: "Livraison",
  subtotal: "Sous-total",
  add: "Ajouter",
  viewCart: "Voir le panier ({n})",
  checkout: "Paiement",
  deliverTo: "Livrer à",
  currentLocation: "Votre position actuelle",
  placeOrder: "Commander",
  os_pending_payment: "En attente de paiement",
  os_placed: "Commande passée",
  os_accepted: "Acceptée par le restaurant",
  os_preparing: "En préparation",
  os_ready: "Prête",
  os_picked_up: "En route",
  os_delivered: "Livrée",
  os_cancelled: "Annulée",
  courier: "Livreur",
  payTitle: "Payer par mobile money",
  payPhone: "Numéro mobile money",
  payNow: "Payer {amount}",
  approveOnPhone: "Validez le paiement sur votre téléphone. Sans notification, composez {ussd}. Ne partagez jamais votre code secret.",
  paid: "Payé",
  payFailed: "Paiement échoué. Rien n’a été débité.",
  wrongOperator: "Ce numéro semble être {op}. Choisissez {op} ou un autre numéro.",
  goOnline: "Passer en ligne",
  goOffline: "Passer hors ligne",
  online: "En ligne",
  offline: "Hors ligne",
  notVerified: "Vos documents sont en cours de vérification. Vous pourrez passer en ligne après validation.",
  newRequest: "Nouvelle demande",
  accept: "Accepter",
  decline: "Refuser",
  arrived: "Je suis arrivé",
  startTrip: "Démarrer la course",
  completeTrip: "Terminer la course",
  collectCash: "Encaisser {amount} en espèces",
  pickedUp: "Récupérée",
  delivered: "Livrée",
  noJob: "En attente de demandes…",
  myRestaurant: "Mon restaurant",
  createRestaurant: "Créer mon restaurant",
  restaurantName: "Nom du restaurant",
  usesLocation: "Votre position actuelle sert d’adresse au restaurant.",
  incomingOrders: "Commandes",
  markPreparing: "En préparation",
  markReady: "Prête",
  addItem: "Ajouter un plat",
  itemName: "Nom du plat",
  price: "Prix (FCFA)",
  language: "Langue",
  switchRole: "Changer de rôle",
  signOut: "Se déconnecter",
  none: "Rien pour le moment.",
  error: "Une erreur est survenue : {msg}",
  locationNeeded: "L'autorisation de localisation est nécessaire pour être en ligne.",
  driverConsole: "Espace chauffeur",
  courierConsole: "Espace livreur",
  notRegistered: "Vous n'êtes pas encore inscrit comme chauffeur ou livreur.",
  awaitingVerification: "Vos documents sont en cours de vérification. Vous pourrez vous connecter après validation par un administrateur.",
  newRide: "Nouvelle course",
  newDelivery: "Nouvelle livraison",
  waitingRequests: "En attente de demandes…",
  open: "Ouvert",
  menu: "Menu",
  priceXaf: "Prix (FCFA)",
};

const DICTS: Record<Lang, Dict> = { en, fr };

export function translate(lang: Lang, key: TKey, vars?: Record<string, string | number>): string {
  let s = DICTS[lang][key] ?? en[key] ?? String(key);
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

interface I18nValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: TKey, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nValue | null>(null);
const STORAGE_KEY = "camride.lang";

export function I18nProvider({ children }: { children: ReactNode }) {
  const deviceLang: Lang = getLocales()[0]?.languageCode === "en" ? "en" : "fr";
  const [lang, setLangState] = useState<Lang>(deviceLang);
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((v) => {
      if (v === "fr" || v === "en") setLangState(v);
    });
  }, []);
  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    AsyncStorage.setItem(STORAGE_KEY, l);
  }, []);
  const value = useMemo<I18nValue>(() => ({ lang, setLang, t: (k, v) => translate(lang, k, v) }), [lang, setLang]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside I18nProvider");
  return ctx;
}
