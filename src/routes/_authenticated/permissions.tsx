import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Check, Minus, Eye } from "lucide-react";

export const Route = createFileRoute("/_authenticated/permissions")({
  head: () => ({
    meta: [
      { title: "Matrice des accès par profil — Agence Immobilière" },
      {
        name: "description",
        content:
          "Vue de synthèse des actions autorisées pour chaque rôle interne : impayés, paiements, documents, travaux, réclamations et administration.",
      },
      { property: "og:title", content: "Matrice des accès par profil" },
      {
        property: "og:description",
        content: "Confirmez en un coup d'œil ce que chaque rôle peut consulter, créer ou modifier.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  beforeLoad: async () => {
    const { data: userRes } = await supabase.auth.getUser();
    const user = userRes.user;
    if (!user) throw redirect({ to: "/auth" });
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    if (profile?.role !== "admin") throw redirect({ to: "/dashboard" });
  },
  component: PermissionsPage,
});

const ROLES = [
  { key: "admin", label: "Admin" },
  { key: "direction", label: "Direction" },
  { key: "recouvrement", label: "Recouvrement" },
  { key: "gestion_locative", label: "Gestion loc." },
  { key: "commercial", label: "Commercial" },
  { key: "technico_commercial", label: "Technico-com." },
  { key: "technique", label: "Technique" },
  { key: "juridique", label: "Juridique" },
] as const;

type RoleKey = (typeof ROLES)[number]["key"];
type Level = "full" | "read" | "none";

const ALL: RoleKey[] = ROLES.map((r) => r.key);

function perms(full: RoleKey[], read: RoleKey[] = []): Record<RoleKey, Level> {
  return Object.fromEntries(
    ALL.map((r) => [r, full.includes(r) ? "full" : read.includes(r) ? "read" : "none"]),
  ) as Record<RoleKey, Level>;
}

const FINANCE_WRITE: RoleKey[] = ["admin", "direction", "recouvrement", "gestion_locative"];
const NON_RECOUVREMENT: RoleKey[] = [
  "admin",
  "direction",
  "juridique",
  "gestion_locative",
  "technique",
  "commercial",
  "technico_commercial",
];

type Section = {
  title: string;
  rows: { action: string; note?: string; access: Record<RoleKey, Level> }[];
};

const SECTIONS: Section[] = [
  {
    title: "Impayés & paiements",
    rows: [
      {
        action: "Consulter les impayés et la situation locative",
        access: perms([], ALL),
      },
      {
        action: "Saisir / modifier un impayé",
        note: "Période obligatoire, doublon contrat + mois refusé",
        access: perms(FINANCE_WRITE),
      },
      {
        action: "Enregistrer un paiement et l'affecter",
        note: "Affectation manuelle ligne par ligne",
        access: perms(FINANCE_WRITE),
      },
      {
        action: "Réaffecter un paiement déjà enregistré",
        note: "Tracé dans l'historique des affectations",
        access: perms(["admin", "direction"]),
      },
      {
        action: "Supprimer un impayé",
        note: "Interdit si des paiements y sont affectés",
        access: perms(["admin", "direction"]),
      },
      {
        action: "Impayés (archive, ancien module)",
        access: perms([], ["admin", "direction", "recouvrement", "juridique"]),
      },
    ],
  },
  {
    title: "Gestion locative",
    rows: [
      { action: "Biens, lots, contacts, contrats", access: perms(ALL) },
      {
        action: "États des lieux (+ documents PDF)",
        access: perms(NON_RECOUVREMENT),
      },
      {
        action: "Charges et décomptes",
        access: perms([
          "admin",
          "direction",
          "gestion_locative",
          "commercial",
          "technico_commercial",
          "technique",
          "juridique",
        ]),
      },
      {
        action: "Transactions commerciales",
        access: perms(["admin", "direction", "commercial", "technico_commercial"]),
      },
      { action: "Fiscalité (impôt foncier, honoraires)", access: perms(["admin", "direction", "juridique"]) },
    ],
  },
  {
    title: "Travaux & réclamations",
    rows: [
      { action: "Consulter travaux et réclamations", access: perms([], ALL) },
      {
        action: "Créer / modifier des travaux",
        note: "Technique : statut, assignation, dates, budget, commentaires uniquement",
        access: perms(["admin", "direction", "juridique", "gestion_locative"], ["technique", "technico_commercial", "commercial"]),
      },
      {
        action: "Créer / modifier une réclamation",
        note: "Technique : statut, priorité, assignation, solution, documents",
        access: perms(["admin", "direction", "gestion_locative"], ["technique", "technico_commercial", "commercial", "juridique"]),
      },
      {
        action: "Joindre / supprimer des documents (travaux, réclamations, contrats)",
        access: perms([
          "admin",
          "direction",
          "juridique",
          "gestion_locative",
          "technique",
          "technico_commercial",
          "commercial",
        ]),
      },
    ],
  },
  {
    title: "Activités & administration",
    rows: [
      { action: "Calendrier, tâches, commentaires, mentions", access: perms(ALL) },
      { action: "Import CSV", access: perms(["admin"]) },
      { action: "Fusion de doublons", access: perms(["admin"]) },
      { action: "Gestion des utilisateurs et des rôles", access: perms(["admin"]) },
    ],
  },
];

function Cell({ level }: { level: Level }) {
  if (level === "full")
    return (
      <span className="inline-flex items-center gap-1 text-emerald-600" title="Création et modification">
        <Check className="h-4 w-4" />
      </span>
    );
  if (level === "read")
    return (
      <span className="inline-flex items-center gap-1 text-amber-600" title="Consultation seule">
        <Eye className="h-4 w-4" />
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 text-muted-foreground/50" title="Aucun accès">
      <Minus className="h-4 w-4" />
    </span>
  );
}

function PermissionsPage() {
  return (
    <div className="p-6">
      <div className="mb-6 flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/dashboard">
            <ArrowLeft className="mr-2 h-4 w-4" /> Retour
          </Link>
        </Button>
      </div>

      <h1 className="text-2xl font-semibold tracking-tight">Matrice des accès par profil</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Synthèse des actions autorisées pour chaque rôle interne, telles qu'appliquées côté écrans et
        côté base de données.
      </p>

      <div className="mt-4 flex flex-wrap gap-4 text-sm">
        <span className="inline-flex items-center gap-2">
          <Check className="h-4 w-4 text-emerald-600" /> Création et modification
        </span>
        <span className="inline-flex items-center gap-2">
          <Eye className="h-4 w-4 text-amber-600" /> Consultation seule
        </span>
        <span className="inline-flex items-center gap-2">
          <Minus className="h-4 w-4 text-muted-foreground/50" /> Aucun accès
        </span>
      </div>

      <div className="mt-6 space-y-6">
        {SECTIONS.map((section) => (
          <Card key={section.title}>
            <CardHeader>
              <CardTitle>{section.title}</CardTitle>
              <CardDescription>{section.rows.length} actions</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[280px]">Action</TableHead>
                    {ROLES.map((r) => (
                      <TableHead key={r.key} className="text-center whitespace-nowrap">
                        {r.label}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {section.rows.map((row) => (
                    <TableRow key={row.action}>
                      <TableCell>
                        <div className="font-medium">{row.action}</div>
                        {row.note && (
                          <div className="text-xs text-muted-foreground">{row.note}</div>
                        )}
                      </TableCell>
                      {ROLES.map((r) => (
                        <TableCell key={r.key} className="text-center">
                          <Cell level={row.access[r.key]} />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ))}
      </div>

      <p className="mt-6 text-xs text-muted-foreground">
        Le profil « Inactif » n'a aucun accès. Le profil « En attente » ne voit rien tant qu'un rôle ne
        lui a pas été attribué depuis la page Utilisateurs.
      </p>
    </div>
  );
}
