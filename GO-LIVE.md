# CamRide: what a real launch in Cameroon needs

This repo is a **demo prototype**. Payments are simulated, drivers and restaurants are fictional, and nothing is stored outside the visitor's browser. This page lists what going live would take. It is research, not legal advice: confirm each point with the Ministry of Transport (MINT), the city councils, a Cameroonian lawyer and the payment providers before you spend money. Sources were checked in November 2026.

## 1. Register the company

- **Create a company (e.g. a SARL) through the CFCE one-stop shop (Centre de Formalités de Création d'Entreprises), online at mybusiness.cm.** The official eRegulations page for an online SARL with private statutes lists **69,625 FCFA** in fees (RCCM registration 21,500, registration duty 20,000, legal notice in Cameroon Tribune 13,125, stamp duty 15,000). It estimates **1 to 3 days**, and you can pay at the CFCE desk or by MTN/Orange Mobile Money.
  Source: https://yaounde.eregulations.org/procedure/print/185/140/step/0?l=fr · MINFI business-creation page: https://minfi.gov.cm/espace-de-creation-dentreprise-en-republique-du-cameroun/
- You will need the **RCCM** number and the **NIU** tax ID. Payment aggregators ask for both before they let you take live payments (see CamPay below).

## 2. Transport licensing (cars / VTC)

- **Every passenger vehicle needs**, per the Ministry of Transport (as summarised by Yango's Cameroon driver guide): carte grise, **transport licence** (S5 for an owner-driver, S1 or S9 for fleets), **carte bleue** (renewed every year), insurance, and a technical inspection certificate. The transport licence lasts 5 years and needs a stamped application, a certified ID copy, the fee receipt and a criminal record extract (bulletin n°3).
  Source: https://pro.yango.com/cm-fr/yaounde/knowledge-base/taxi/documents-for-cooperation/etre-en-regle-en-tant-que-chauffeur-vtc
- **The platform itself needs an operating licence from MINT.** For example, Yango had its licence extended for five years by the Ministry of Transport in 2025. It operates in Yaoundé and Douala and planned to expand to Bafoussam.
  Source: https://techgriot.co/francais/tech-kmer/2025/03/mobilite-urbaine-au-cameroun-yango-obtient-une-nouvelle-licence-pour-cinq-ans/
- Press reports say Decree No. 2022/8801/PM (10 Oct 2022) created new road-transport licence categories, including one for platform-based taxi/VTC services. **Get the exact category and fee from MINT's Direction des Transports Routiers.**
  Source (reported): https://ecomatin.net/transport-routier-le-cameroun-institue-de-nouvelles-licences-pour-regir-le-secteur-cmr

## 3. Moto-taxi (benskin) rules: restricted in some city centres

- **National framework:** Decree No. 2008/3447/PM of 31 Dec 2008 sets the conditions for commercial motorcycle transport. As summarised by transport sources:
  - The driver must be at least 18, with a category A licence.
  - The moto must be registered, insured, inspected and carry a council identification number.
  - The driver must wear a helmet and the council's reflective vest, and must provide a passenger helmet.
  Sources: https://library.pssfp.org/documents/decret-n-2008-3447-pm-du-31-decembre-2008-fixant-les-conditions-et-les-modalites-dexploitation-des-motocycles-a-titre-onereux · https://www.logistiqueconseil.org/Articles/Transport-routier/Moto-taxi.html
- **Douala, permanent zone bans:**
  - Since a Wouri prefectoral order of 13 Aug 2024, moto-taxis are **banned at all times in Bonanjo**, and banned from **18:00 to 06:00 in Bonapriso and Bali**. Offenders' motos are impounded.
    Sources: https://fr.journalducameroun.com/cameroun-le-prefet-interdit-la-circulation-des-mototaxis-dans-certains-quartiers-de-douala/ · https://actucameroun.com/2024/08/14/wouri-le-prefet-interdit-la-circulation-de-motos-dans-plusieurs-quartiers-apres-un-meurtre/
  - Some outlets described the Bonapriso/Bali ban as permanent after the October 2025 orders.
- **Douala, temporary bans:** in October 2025, after the presidential election, prefects temporarily banned moto-taxis at night in about 20 Douala districts, and also restricted them in Garoua and Dschang.
  Sources: https://www.lebledparle.com/le-prefet-du-wouri-impose-un-couvre-feu-nocturne-aux-mototaxis-dans-20-quartiers-de-douala/ · https://www.stopblablacam.com/politique/2210-15193-tensions-post-electorales-circulation-des-motos-taxis-restreinte-a-douala-garoua-et-dschang
- **Douala, registration:** from 2 April 2026, Douala City Council bars **unidentified** moto-taxis from Akwa, Bali and Bonapriso. Drivers need a council enrolment certificate and an approved vest.
  Source: https://cameroontoday.net/akwa-bali-bonapriso-circulation-interdite-aux-mototaxis-non-identifiees/
- **What this means for the product:**
  - Geofence the banned zones and hours.
  - Onboard only council-registered moto drivers.
  - Check the documents above.
  - Watch for temporary prefectoral orders in every city you serve.

## 4. Mobile money payments (real providers, verified)

| Option | Cameroon / XAF? | Notes | Source |
|---|---|---|---|
| **MTN MoMo API (direct)** | Yes: target environment `mtncameroon`, currency XAF | You need KYC onboarding with MTN. Production credentials come from MTN's partner portal, and the Cameroon developer portal is developer-eu.momo.africa. The Cameroon Collections product page lists a fee of about 1% per transaction, negotiable, and no per-call cost. | https://momodevelopercommunity.mtn.com/how-to-59/momo-api-production-configuration-v2-542 · https://momoapi.mtn.com/Cameroon_Collection_productDetails |
| **Orange Money Web Payment / M Payment (direct)** | Yes: Cameroon is listed, and the endpoint `.../orange-money-webpay/cm/v1/webpayment` uses XAF | Only for officially registered, KYC-compliant Orange Money merchants. You apply through Orange Developer and your local Orange operator, and the customer confirms with an OTP generated via USSD. | https://developer.orange.com/apis/om-webpay · https://developer.orange.com/products/payment/apply-orange-money/ |
| **CinetPay** (aggregator) | Yes: Orange Money CM (`OMCM`), MTN CM (`MTNCM`), Express Union and cards, in XAF | Payments from 100 to 1,500,000 XAF in Cameroon. A Cameroon account can only charge in XAF. | https://docs.cinetpay.com/api/1.0-fr/checkout/tableau · https://cinetpay.com/products/payments |
| **CamPay** (aggregator) | Yes: MTN and Orange, Cameroon only | Published pricing: 2% on collections, 1.5% on withdrawals to mobile money (one guide lists 1%), 5,000 FCFA per bank transfer. Payout by the next business day. Has a sandbox, and going live needs RCCM and NIU. | https://www.campay.net/en/ · https://documenter.getpostman.com/view/2391374/T1LV8PVA · https://vadevise.com/en/guides/payment-gateways-cameroon/ |
| **Notch Pay** (aggregator) | Yes: `cm.mtn` and `cm.orange` channels, XAF | Collection fee reported at 1% (Sept 2026 comparison). | https://developer.notchpay.co/accept-payments/mobile-money · https://notchpay.co/ · https://blesskimbi.com/blog/mobile-money-payment-gateway-cameroon/ |
| **Flutterwave** | Yes: "Francophone mobile money" charge with `country=CM`, `currency=XAF` and network MTN or ORANGEMONEY | Check your account's country eligibility with Flutterwave. | https://developer.flutterwave.com/api/charge/francophone-mobile-money |

- **Tax:** Cameroon's mobile-money transfer tax is reported at 0.2% plus 4 FCFA per transaction under the 2025 Finance Law. It comes on top of provider fees. Source: https://blesskimbi.com/blog/mobile-money-payment-gateway-cameroon/
- **Suggested path:** start with one aggregator (CamPay, Notch Pay or CinetPay) for a single integration covering MTN and Orange. Move to direct MTN/Orange contracts once volume justifies negotiating fees.
- **Security:** payment keys live only on a backend server, never in the app or website. Customers confirm on their own phone with their PIN. The app must never ask for it.

## 5. Personal data

- Law No. 2024/017 of 23 Dec 2024 on personal data protection applies to apps that process location, phone numbers and payment data of people in Cameroon. It covers lawful basis and consent, privacy policy, security, processing records, and authorisation for some processing and cross-border transfers.
  Sources: https://www.prc.cm/en/news/the-acts/laws/7602 · https://www.enonchongchambers.com/insights/cameroon-data-protection-law-2024-017/

## 6. Build the real product

- **Apps:** three apps (rider, driver/courier, restaurant) plus an operator web dashboard. Use **React Native (Expo)** or **Flutter**, one codebase for Android and iOS. Android matters most in Cameroon, so ship Android first. CinetPay even ships a Flutter SDK: https://github.com/cinetpay/cinetpay-flutter
- **Backend:**
  - **Supabase** (Postgres with PostGIS for "nearest driver" queries, realtime for live tracking, auth by phone OTP) or **Firebase** (Firestore plus Cloud Functions).
  - Payment webhooks from the aggregator update order status.
  - Driver apps send GPS every few seconds while online.
- **Maps:**
  - The demo uses free OpenStreetMap tiles, the Nominatim search and the OSRM demo router. Their usage policies **do not allow production traffic** on the public servers.
  - For launch, self-host OSM tiles, Nominatim and OSRM, or pay a provider (Mapbox, Google Maps Platform, etc.).
  - Policies: https://operations.osmfoundation.org/policies/tiles/ · https://operations.osmfoundation.org/policies/nominatim/
- **Operations:** driver document checks, background checks, insurance, 24/7 support (WhatsApp is common), dispute and refund handling, and geofences for moto bans.

## 7. Cost items with published prices (sourced only)

| Item | Price | Source |
|---|---|---|
| SARL creation via CFCE (online, private statutes) | 69,625 FCFA official fees | https://yaounde.eregulations.org/procedure/print/185/140/step/0?l=fr |
| Google Play developer account | US$25 one-time | https://support.google.com/googleplay/android-developer/answer/6112435?hl=en |
| Apple Developer Program | US$99 per year | https://developer.apple.com/programs/enroll/ |
| Supabase Pro | US$25/month per organisation (includes $10 compute credit) | https://supabase.com/pricing |
| Firebase Blaze | Pay as you go above free quotas, no base fee | https://firebase.google.com/pricing |
| Payment fees | about 1% (MTN direct, negotiable), 2% (CamPay collections), 1% reported (Notch Pay) | see table in section 4 |

Not priced here because no reliable public figure was found: MINT platform licence fees, transport licence category fees, insurance, legal fees and development costs. Get written quotes.
