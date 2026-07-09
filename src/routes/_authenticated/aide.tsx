import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Building2, ArrowLeft, Search, HelpCircle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/aide")({
  head: () => ({ meta: [{ title: "Aide — GEM Immobilier" }] }),
  component: AidePage,
});

type Process = { title: string; steps: string[] };
type Section = { role: string; label: string; processes: Process[] };

const COMMON: Process[] = [
  {
    title: "Recherche globale",
    steps: [
      "Cliquez sur la barre de recherche en haut de l'écran.",
      "Tapez un nom de bien, contact, lot ou contrat.",
      "Cliquez sur un résultat pour ouvrir la fiche correspondante.",
    ],
  },
  {
    title: "Calendrier",
    steps: [
      "Ouvrez « Calendrier » dans le menu Aperçu.",
      "Naviguez entre les mois avec les flèches.",
      "Cliquez sur une date pour voir les tâches et activités du jour.",
    ],
  },
  {
    title: "Tâches et activités",
    steps: [
      "Depuis une fiche (bien, contact, contrat), utilisez la section « Activités liées ».",
      "Cliquez sur « Nouvelle activité » pour créer une tâche.",
      "Renseignez le titre, la date, et éventuellement un responsable.",
      "Cochez la tâche comme terminée une fois réalisée.",
    ],
  },
];

const SECTIONS: Section[] = [
  {
    role: "admin",
    label: "Administrateur",
    processes: [
      {
        title: "Activer un nouveau compte utilisateur",
        steps: [
          "Ouvrez « Utilisateurs » dans le menu Administration.",
          "Repérez le compte marqué « Compte en attente d'activation ».",
          "Cliquez sur le sélecteur de rôle et attribuez le rôle adapté.",
          "L'utilisateur pourra se connecter avec ses droits dès sa prochaine tentative.",
        ],
      },
      {
        title: "Importer des données CSV",
        steps: [
          "Ouvrez « Import CSV » dans le menu Administration.",
          "Choisissez le type de données à importer (biens, contacts, etc.).",
          "Téléchargez le modèle CSV, remplissez-le, puis téléversez le fichier.",
          "Contrôlez le rapport d'import affiché en fin de traitement.",
        ],
      },
      {
        title: "Fusionner des contacts en doublon",
        steps: [
          "Ouvrez « Doublons » dans le menu Administration.",
          "Vérifiez les paires détectées automatiquement.",
          "Cliquez sur « Fusionner » pour ne conserver qu'une fiche, ou « Ignorer » pour écarter la suggestion.",
        ],
      },
    ],
  },
  {
    role: "direction",
    label: "Direction",
    processes: [
      {
        title: "Consulter le tableau de bord global",
        steps: [
          "Ouvrez « Tableau de bord » dans le menu Aperçu.",
          "Consultez les indicateurs clés (impayés, taux d'occupation, activités).",
          "Cliquez sur un indicateur pour ouvrir la liste détaillée.",
        ],
      },
      {
        title: "Filtrer les biens par gestionnaire",
        steps: [
          "Ouvrez « Biens » dans le menu Gestion.",
          "Utilisez le filtre « Gestionnaire » en haut de la liste.",
          "Sélectionnez un gestionnaire pour ne voir que son portefeuille.",
        ],
      },
    ],
  },
  {
    role: "gestion_locative",
    label: "Gestion locative",
    processes: [
      {
        title: "Créer un nouveau contrat de location",
        steps: [
          "Ouvrez « Contrats » dans le menu Gestion.",
          "Cliquez sur « Nouveau contrat ».",
          "Sélectionnez le lot, le locataire et renseignez les dates et le loyer.",
          "Enregistrez : le lot passe automatiquement en « occupé ».",
        ],
      },
      {
        title: "Enregistrer un état des lieux",
        steps: [
          "Ouvrez « États des lieux » dans le menu Gestion.",
          "Cliquez sur « Nouveau ».",
          "Sélectionnez le contrat, le type (Entrée / Sortie), la date.",
          "Ajoutez les anomalies constatées — celles cochées créeront automatiquement des travaux.",
          "Cliquez sur « Enregistrer et créer les travaux ».",
          "Depuis la fiche, joignez le rapport PDF via « Ajouter un PDF » dans la section Documents.",
        ],
      },
      {
        title: "Mettre fin à un contrat",
        steps: [
          "Ouvrez la fiche du contrat depuis « Contrats ».",
          "Cliquez sur « Mettre fin ».",
          "Confirmez la date de fin — le lot repassera en « vacant » automatiquement.",
        ],
      },
      {
        title: "Enregistrer une charge",
        steps: [
          "Ouvrez « Charges » dans le menu Finance.",
          "Cliquez sur « Nouveau ».",
          "Renseignez le bien, la nature, le montant et la date.",
        ],
      },
    ],
  },
  {
    role: "recouvrement",
    label: "Recouvrement",
    processes: [
      {
        title: "Suivre les impayés",
        steps: [
          "Ouvrez « Impayés » dans le menu Finance.",
          "Filtrez par statut ou par période.",
          "Ouvrez un impayé pour renseigner un paiement partiel ou total.",
        ],
      },
      {
        title: "Enregistrer un paiement",
        steps: [
          "Depuis la fiche d'un impayé, mettez à jour le champ « Montant payé ».",
          "Ajustez le statut si nécessaire.",
          "Enregistrez.",
        ],
      },
    ],
  },
  {
    role: "technique",
    label: "Technique",
    processes: [
      {
        title: "Planifier des travaux",
        steps: [
          "Ouvrez « Travaux » dans le menu Opérations.",
          "Cliquez sur « Nouveau ».",
          "Sélectionnez le bien, renseignez le titre, le budget et les dates.",
          "Choisissez le statut « Planifié ».",
          "Depuis la fiche, joignez devis et factures via « Ajouter un PDF ».",
        ],
      },
      {
        title: "Traiter une réclamation",
        steps: [
          "Ouvrez « Réclamations » dans le menu Opérations.",
          "Sélectionnez la réclamation à traiter.",
          "Mettez à jour son statut au fil de son avancement.",
        ],
      },
    ],
  },
  {
    role: "juridique",
    label: "Juridique",
    processes: [
      {
        title: "Joindre un contrat de bail signé",
        steps: [
          "Ouvrez la fiche du contrat depuis « Contrats ».",
          "Dans la section « Documents », cliquez sur « Ajouter un PDF ».",
          "Sélectionnez le bail signé (et les avenants éventuels).",
        ],
      },
      {
        title: "Proposer une modification de contrat",
        steps: [
          "Ouvrez la fiche du contrat.",
          "Dans « Propositions », cliquez sur « Nouvelle proposition ».",
          "Renseignez les champs à modifier et la justification.",
          "La modification est appliquée après approbation.",
        ],
      },
    ],
  },
  {
    role: "commercial",
    label: "Commercial",
    processes: [
      {
        title: "Enregistrer une transaction commerciale",
        steps: [
          "Ouvrez « Transactions » dans le menu Finance.",
          "Cliquez sur « Nouveau ».",
          "Renseignez le bien, le type (vente / location), le montant et le contact.",
        ],
      },
      {
        title: "Créer un nouveau bien",
        steps: [
          "Ouvrez « Biens » dans le menu Gestion.",
          "Cliquez sur « Nouveau ».",
          "Renseignez le titre, l'adresse et le gestionnaire.",
          "Ajoutez ensuite les lots depuis la fiche du bien.",
        ],
      },
    ],
  },
];

function AidePage() {
  const [role, setRole] = useState<string>("");
  const [q, setQ] = useState("");

  useEffect(() => {
    (async () => {
      const { data: userRes } = await supabase.auth.getUser();
      if (!userRes.user) return;
      const { data: p } = await supabase.from("profiles").select("role").eq("id", userRes.user.id).maybeSingle();
      if (p?.role) setRole(p.role);
    })();
  }, []);

  const roleSection = useMemo(() => SECTIONS.find((s) => s.role === role) ?? null, [role]);

  const filterProcs = (procs: Process[]) => {
    const needle = q.trim().toLowerCase();
    if (!needle) return procs;
    return procs.filter((p) =>
      p.title.toLowerCase().includes(needle) ||
      p.steps.some((s) => s.toLowerCase().includes(needle))
    );
  };

  const commonFiltered = filterProcs(COMMON);
  const roleFiltered = roleSection ? filterProcs(roleSection.processes) : [];

  const renderProcesses = (procs: Process[]) => (
    <div className="space-y-4">
      {procs.map((p) => (
        <div key={p.title} className="rounded-md border bg-card p-4">
          <h3 className="font-medium mb-2">{p.title}</h3>
          <ol className="list-decimal ml-5 space-y-1 text-sm text-muted-foreground">
            {p.steps.map((s, i) => <li key={i}>{s}</li>)}
          </ol>
        </div>
      ))}
    </div>
  );

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2"><Building2 className="h-5 w-5" /><span className="font-semibold">GEM Immobilier</span></div>
          <Button variant="outline" size="sm" asChild><Link to="/dashboard"><ArrowLeft className="mr-2 h-4 w-4" /> Tableau de bord</Link></Button>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-6 py-10 space-y-6">
        <div className="flex items-center gap-2">
          <HelpCircle className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-semibold">Aide</h1>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Rechercher un processus (ex: contrat, impayé, PDF...)"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Fonctionnalités communes</CardTitle>
            <CardDescription>Accessibles à tous les utilisateurs.</CardDescription>
          </CardHeader>
          <CardContent>
            {commonFiltered.length === 0
              ? <p className="text-sm text-muted-foreground">Aucun résultat.</p>
              : renderProcesses(commonFiltered)}
          </CardContent>
        </Card>

        {roleSection && (
          <Card>
            <CardHeader>
              <CardTitle>Processus — {roleSection.label}</CardTitle>
              <CardDescription>Adaptés à votre rôle.</CardDescription>
            </CardHeader>
            <CardContent>
              {roleFiltered.length === 0
                ? <p className="text-sm text-muted-foreground">Aucun résultat.</p>
                : renderProcesses(roleFiltered)}
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
