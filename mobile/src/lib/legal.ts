// DRAFT legal texts shown in the app (Terms + Privacy). Mirrored in docs/legal/*.md
// (generated from this file by mobile/scripts/legal-to-md.mjs). NOT reviewed by a lawyer yet: a Cameroonian
// lawyer must review them, fill the [placeholders] and confirm the article references to
// Law No. 2024/017 of 23 December 2024 on personal data protection before launch.
import type { Lang } from "./i18n";

export interface LegalSection { title: string; body: string }
export interface LegalDoc { title: string; updated: string; sections: LegalSection[] }

const UPDATED = "2026-11-22";

const termsFr: LegalDoc = {
  title: "Conditions générales d'utilisation (BROUILLON)",
  updated: UPDATED,
  sections: [
    { title: "1. Objet", body: "CamRide est une plateforme numérique exploitée par [raison sociale, forme, capital, RCCM, siège, NIU] (« CamRide ») qui met en relation des passagers avec des chauffeurs et moto-taxis indépendants, et des clients avec des restaurants et des livreurs au Cameroun. CamRide n'est pas un transporteur ni un restaurateur." },
    { title: "2. Compte", body: "L'inscription se fait avec un numéro de téléphone camerounais vérifié par SMS. Vous devez avoir 18 ans révolus. Vous êtes responsable de l'exactitude de vos informations et de la confidentialité de votre téléphone." },
    { title: "3. Prix", body: "Le prix d'une course est calculé par nos serveurs avant la commande, selon la distance et la durée estimées et la grille tarifaire de la ville. Les frais de livraison dépendent de la distance. Les codes promo sont soumis à leurs conditions (validité, montant minimum, une utilisation par personne sauf mention contraire)." },
    { title: "4. Paiement", body: "Le paiement se fait en espèces au chauffeur/livreur ou par MTN Mobile Money / Orange Money via un agrégateur agréé (CamPay, Notch Pay ou CinetPay). CamRide ne vous demande jamais votre code PIN : vous validez le paiement sur votre téléphone." },
    { title: "5. Annulation et remboursement", body: "Vous pouvez annuler une course tant qu'elle n'a pas commencé. Un remboursement total ou partiel peut être accordé par notre support en cas de problème avéré ; il est renvoyé sur le numéro mobile money ayant payé. [Frais d'annulation éventuels à définir.]" },
    { title: "6. Chauffeurs, livreurs et restaurants", body: "Les partenaires doivent détenir les autorisations requises (permis de conduire, carte grise, assurance, autorisations de transport le cas échéant, autorisations sanitaires pour les restaurants) et fournir des documents vérifiés par CamRide. Ils perçoivent leurs gains moins la commission de la plateforme, retirables sur mobile money après validation." },
    { title: "7. Sécurité", body: "L'application propose un bouton SOS (appel Police 117, Pompiers 118, SAMU 119 et alerte de l'équipe CamRide) et le partage de course en temps réel. En cas de danger, contactez d'abord les secours." },
    { title: "8. Comportement", body: "Sont interdits : la fraude, la violence, le harcèlement, la discrimination, le transport d'objets illicites et l'usage du service sous l'emprise de l'alcool ou de stupéfiants. CamRide peut suspendre un compte en cas de manquement." },
    { title: "9. Responsabilité", body: "Dans les limites permises par la loi applicable, la responsabilité de CamRide est limitée à son rôle d'intermédiaire technique. Rien dans ces conditions ne limite les droits que vous tenez des dispositions impératives du droit camerounais." },
    { title: "10. Données personnelles", body: "Le traitement de vos données est décrit dans la Politique de confidentialité, conforme à la loi n° 2024/017 du 23 décembre 2024 relative à la protection des données à caractère personnel au Cameroun." },
    { title: "11. Réclamations, droit applicable", body: "Contact : écran « Aide et support » ou [e-mail / téléphone / adresse]. Ces conditions sont régies par le droit camerounais ; à défaut d'accord amiable, les juridictions compétentes de [ville] sont saisies." },
  ],
};

const termsEn: LegalDoc = {
  title: "Terms of use (DRAFT)",
  updated: UPDATED,
  sections: [
    { title: "1. Purpose", body: "CamRide is a digital platform operated by [company name, legal form, share capital, RCCM, registered office, tax ID] (\"CamRide\") that connects riders with independent drivers and moto-taxi riders, and customers with restaurants and couriers in Cameroon. CamRide is not a carrier or a restaurant." },
    { title: "2. Account", body: "You sign up with a Cameroonian phone number verified by SMS. You must be at least 18. You are responsible for the accuracy of your information and for keeping your phone secure." },
    { title: "3. Prices", body: "Ride prices are calculated by our servers before you book, from the estimated distance and duration and the city's rate card. Delivery fees depend on distance. Promo codes are subject to their conditions (validity, minimum amount, one use per person unless stated)." },
    { title: "4. Payment", body: "Pay in cash to the driver/courier or with MTN Mobile Money / Orange Money through a licensed aggregator (CamPay, Notch Pay or CinetPay). CamRide never asks for your PIN: you approve the payment on your own phone." },
    { title: "5. Cancellation and refunds", body: "You can cancel a ride until it starts. Our support team may grant a full or partial refund for a verified problem; it is sent back to the mobile money number that paid. [Cancellation fees, if any, to be defined.]" },
    { title: "6. Drivers, couriers and restaurants", body: "Partners must hold the required authorisations (driving licence, vehicle registration, insurance, transport permits where applicable, health permits for restaurants) and provide documents verified by CamRide. They receive their earnings minus the platform commission, withdrawable to mobile money after approval." },
    { title: "7. Safety", body: "The app has an SOS button (call Police 117, Fire 118, SAMU 119 and alert the CamRide team) and live trip sharing. In danger, contact the emergency services first." },
    { title: "8. Conduct", body: "Fraud, violence, harassment, discrimination, carrying illegal items and using the service under the influence of alcohol or drugs are prohibited. CamRide may suspend accounts that break these rules." },
    { title: "9. Liability", body: "To the extent permitted by applicable law, CamRide's liability is limited to its role as a technical intermediary. Nothing in these terms limits rights you have under mandatory provisions of Cameroonian law." },
    { title: "10. Personal data", body: "How we process your data is described in the Privacy policy, which follows Law No. 2024/017 of 23 December 2024 on personal data protection in Cameroon." },
    { title: "11. Complaints, governing law", body: "Contact: \"Help & support\" screen or [email / phone / address]. These terms are governed by Cameroonian law; failing an amicable settlement, the competent courts of [city] have jurisdiction." },
  ],
};

const privacyFr: LegalDoc = {
  title: "Politique de confidentialité (BROUILLON)",
  updated: UPDATED,
  sections: [
    { title: "1. Responsable du traitement", body: "[Raison sociale, adresse, RCCM], joignable à [e-mail du délégué / contact données personnelles]. Cette politique applique la loi n° 2024/017 du 23 décembre 2024 relative à la protection des données à caractère personnel au Cameroun." },
    { title: "2. Données collectées", body: "Numéro de téléphone, nom, ville, langue ; position pendant l'utilisation (passagers) et, pour les chauffeurs/livreurs en ligne, position y compris en arrière-plan ; historique des courses et commandes ; références de paiement (jamais votre code PIN) ; pour les partenaires : pièce d'identité, permis, carte grise, assurance, photo ; jeton de notification de l'appareil ; messages au support, notes et alertes SOS." },
    { title: "3. Finalités", body: "Fournir le service (mise en relation, calcul des prix, suivi en temps réel, paiement, gains et retraits des partenaires), sécurité (vérification des partenaires, SOS, prévention de la fraude), support client, respect de nos obligations légales et comptables." },
    { title: "4. Base légale : votre consentement", body: "Conformément à la loi n° 2024/017 (consentement préalable de la personne concernée, art. 9 - à confirmer), nous traitons vos données avec votre consentement, recueilli à l'inscription. Vous pouvez le retirer à tout moment ; certaines fonctions ne seront alors plus disponibles." },
    { title: "5. Destinataires", body: "Le chauffeur ou passager concerné (prénom, véhicule, position pendant la course) ; le restaurant et le livreur de votre commande ; les agrégateurs de paiement (CamPay, Notch Pay ou CinetPay) et opérateurs MTN / Orange ; nos sous-traitants techniques : hébergement de la base de données (Supabase), notifications (Expo / Google Firebase), cartes (Google Maps), calcul d'itinéraires ; les autorités sur réquisition légale." },
    { title: "6. Transferts hors du Cameroun", body: "Nos serveurs et certains sous-traitants sont situés hors du Cameroun. Ces transferts nécessitent l'autorisation préalable de l'Autorité de protection des données (art. 32 - à confirmer) ; CamRide la sollicitera dès la mise en place de l'Autorité et appliquera des garanties contractuelles appropriées." },
    { title: "7. Durées de conservation (proposées)", body: "Compte : tant qu'il est actif, puis 12 mois. Courses, commandes et paiements : 10 ans (obligations comptables). Documents des partenaires : durée du partenariat + 12 mois. Positions brutes : 90 jours. Alertes SOS et support : 3 ans. [À valider par l'avocat.]" },
    { title: "8. Sécurité", body: "Chiffrement des échanges, contrôle d'accès par rôle (RLS), stockage privé des documents, clés de paiement uniquement côté serveur, journal des actions d'administration. En cas de violation de données, nous notifierons l'Autorité et, si nécessaire, les personnes concernées dans les délais légaux." },
    { title: "9. Vos droits", body: "Accès, rectification, effacement, opposition, limitation, retrait du consentement (art. 37 à 43 - à confirmer) : écran « Aide et support » ou [e-mail]. Réponse sous [délai légal]. Vous pouvez saisir l'Autorité de protection des données à caractère personnel." },
    { title: "10. Mineurs", body: "Le service est réservé aux personnes de 18 ans et plus. Les données d'un mineur ne peuvent être traitées qu'avec le consentement de son représentant légal." },
    { title: "11. Formalités", body: "Le traitement fera l'objet des formalités préalables exigées par la loi auprès de l'Autorité (déclaration / autorisation, art. 19 - à confirmer) et d'un registre des traitements. L'Autorité n'étant pas encore installée à la date de ce brouillon, CamRide accomplira ces formalités dès que possible." },
  ],
};

const privacyEn: LegalDoc = {
  title: "Privacy policy (DRAFT)",
  updated: UPDATED,
  sections: [
    { title: "1. Controller", body: "[Company name, address, RCCM], contact: [data protection email]. This policy applies Law No. 2024/017 of 23 December 2024 on personal data protection in Cameroon." },
    { title: "2. Data we collect", body: "Phone number, name, city, language; location while you use the app (riders) and, for online drivers/couriers, location including in the background; ride and order history; payment references (never your PIN); for partners: ID card, driving licence, vehicle registration, insurance, photo; device push token; support messages, ratings and SOS alerts." },
    { title: "3. Purposes", body: "Providing the service (matching, pricing, live tracking, payment, partner earnings and payouts), safety (partner verification, SOS, fraud prevention), customer support, and our legal and accounting obligations." },
    { title: "4. Legal basis: your consent", body: "Under Law No. 2024/017 (prior consent of the data subject, Art. 9 - to be confirmed) we process your data with the consent you give at sign-up. You can withdraw it at any time; some features will then stop working." },
    { title: "5. Recipients", body: "The driver or rider concerned (first name, vehicle, position during the trip); the restaurant and courier of your order; payment aggregators (CamPay, Notch Pay or CinetPay) and MTN / Orange; our technical processors: database hosting (Supabase), notifications (Expo / Google Firebase), maps (Google Maps), routing; authorities upon lawful request." },
    { title: "6. Transfers outside Cameroon", body: "Our servers and some processors are located outside Cameroon. Such transfers require the prior authorisation of the Data Protection Authority (Art. 32 - to be confirmed); CamRide will apply for it as soon as the Authority is set up and uses appropriate contractual safeguards." },
    { title: "7. Retention (proposed)", body: "Account: while active, then 12 months. Rides, orders and payments: 10 years (accounting). Partner documents: partnership + 12 months. Raw locations: 90 days. SOS alerts and support: 3 years. [To be validated by counsel.]" },
    { title: "8. Security", body: "Encrypted connections, role-based access control (RLS), private document storage, payment keys kept server-side only, audit log of admin actions. In case of a data breach we will notify the Authority and, where required, the people affected within the legal deadlines." },
    { title: "9. Your rights", body: "Access, rectification, erasure, objection, restriction and withdrawal of consent (Arts. 37-43 - to be confirmed): \"Help & support\" screen or [email]. We answer within [legal deadline]. You may complain to the Personal Data Protection Authority." },
    { title: "10. Minors", body: "The service is for people aged 18 and over. A minor's data may only be processed with the consent of their legal representative." },
    { title: "11. Formalities", body: "The processing will go through the prior formalities required by the law with the Authority (declaration / authorisation, Art. 19 - to be confirmed) and a register of processing activities. As the Authority was not yet in place when this draft was written, CamRide will complete them as soon as possible." },
  ],
};

export const LEGAL: Record<"terms" | "privacy", Record<Lang, LegalDoc>> = {
  terms: { fr: termsFr, en: termsEn },
  privacy: { fr: privacyFr, en: privacyEn },
};
