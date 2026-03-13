export type SpellbookEntry = {
  id: string;
  label: string;
  subtitle?: string;
  leftTitle: string;
  leftText: string[];
  rightTitle: string;
  rightText: string[];
  price?: string;
  comingSoon?: boolean;
};

export const spellbookEntries: SpellbookEntry[] = [
  {
    id: "selen-review",
    label: "Selen Review",
    subtitle: "Audit blanc Qualiopi",
    leftTitle: "Selen Review",
    leftText: [
      "Audit blanc Qualiopi.",
      "Permet de simuler un audit afin d’identifier les écarts avant le passage de l’auditeur.",
      "Idéal pour préparer un audit initial, un audit de surveillance ou vérifier sa conformité.",
    ],
    rightTitle: "Fonctionnement",
    rightText: [
      "Analyse des documents",
      "Vérification des indicateurs",
      "Identification des écarts",
      "Recommandations",
    ],
    price: "397 €",
  },
  {
    id: "selen-prepa",
    label: "Selen Prepa",
    subtitle: "Préparation à l’audit Qualiopi",
    leftTitle: "Selen Prepa",
    leftText: [
      "Système administratif conforme clé en main pour les organismes de formation.",
      "Permet de disposer immédiatement d’une structure administrative conforme au référentiel Qualiopi.",
      "Inclut également un accompagnement à la constitution du dossier.",
    ],
    rightTitle: "Contenu",
    rightText: [
      "Système administratif prêt à être utilisé",
      "Documents structurés et conformes",
      "Accompagnement à la constitution du dossier",
      "Préparation à l’audit",
    ],
    price: "900 € audit initial • 1200€ audit de surveillance ou de renouvellement",
  },
  {
    id: "selen-daily",
    label: "Selen Daily",
    subtitle: "Gestion administrative quotidienne",
    leftTitle: "Selen Daily",
    leftText: [
      "Gestion administrative quotidienne des formations.",
      "Solution idéale pour les organismes souhaitant déléguer la gestion administrative.",
      "Le gros plus : un vrai agent administratif est dédié à l’organisme de formation.",
    ],
    rightTitle: "Prestations",
    rightText: [
      "Création des documents de suivi",
      "Envoi des documents",
      "Relance en cas de non réponse",
      "Suivi administratif des formations",
      "Classement des documents",
      "Agent administratif dédié",
    ],
    price:
      "160 € / mois (≤25 apprenants) • 320 € / mois (≤50) • 560 € / mois (>50)",
  },
  {
    id: "selen-news",
    label: "Selen News",
    subtitle: "Outil de veille",
    leftTitle: "Selen News",
    leftText: [
      "Outil de veille dédié aux formateurs.",
      "Permet de suivre les évolutions importantes du secteur.",
      "Contenus courts, utiles et faciles à consulter.",
    ],
    rightTitle: "Fonctionnement",
    rightText: [
      "Veille réglementaire",
      "Informations utiles",
      "Contenus courts et accessibles",
    ],
    price: "7€/mois - À venir",
    comingSoon: true,
  },
  {
    id: "selen-studio",
    label: "Selen Studio",
    subtitle: "Plateforme complète",
    leftTitle: "Selen Studio",
    leftText: [
      "Plateforme complète de gestion pour les formateurs.",
      "Centralise la gestion quotidienne, la préparation à l’audit, l’audit blanc et la veille.",
      "Inclut Selen News.",
    ],
    rightTitle: "Fonctionnalités",
    rightText: [
      "Automatisation de la gestion quotidienne",
      "Préparation à l’audit",
      "Audit blanc intégré",
      "Selen News inclus",
    ],
    price: "59€/mois - À venir",
    comingSoon: true,
  },
  {
    id: "selen-tools",
    label: "Selen Tools",
    subtitle: "Modules séparés",
    leftTitle: "Selen Tools",
    leftText: [
      "Bibliothèque de modules d’automatisation vendus séparément.",
      "Permet d’acheter uniquement les briques dont l’organisme a besoin.",
    ],
    rightTitle: "Exemples",
    rightText: [
      "Génération de documents",
      "Outils administratifs ciblés",
      "Automatisations spécifiques",
    ],
    price: "À venir",
    comingSoon: true,
  },
];
