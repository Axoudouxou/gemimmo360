import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Home,
  FileText,
  AlertTriangle,
  Contact as ContactIcon,
  Percent,
  DoorOpen,
  CalendarClock,
  Hammer,
  MessageSquareWarning,
  Users2,
  ClipboardCheck,
  Plus,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Tableau de bord — GEM Immobilier" },
      { name: "description", content: "Vue d'ensemble de l'activité de l'agence." },
    ],
  }),
  component: Dashboard,
});

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrateur",
  gestion_locative: "Gestion locative",
  recouvrement: "Recouvrement",
  technique: "Technique",
  juridique: "Juridique",
  commercial: "Commercial",
};

type StatCard = {
  key: string;
  label: string;
  value: number | string;
  icon: React.ComponentType<{ className?: string }>;
  to?: string;
  search?: Record<string, string>;
  emphasis?: "danger" | "warning" | "normal";
  large?: boolean;
};

function Dashboard() {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("");
  const [stats, setStats] = useState({
    biens: 0,
    contacts: 0,
    contratsActifs: 0,
    impayesRetard: 0,
    lotsTotal: 0,
    lotsLoues: 0,
    lotsVacants: 0,
    contratsEcheance: 0,
    travauxEnCours: 0,
    reclamationsOuvertes: 0,
    doublons: 0,
    aVerifier: 0,
  });

  useEffect(() => {
    (async () => {
      const { data: userRes } = await supabase.auth.getUser();
      const user = userRes.user;
      if (!user) return;
      setEmail(user.email ?? "");
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();
      const userRole = profile?.role ?? "";
      setRole(userRole);

      const in60 = new Date();
      in60.setDate(in60.getDate() + 60);
      const today = new Date().toISOString().slice(0, 10);
      const in60Str = in60.toISOString().slice(0, 10);
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
      const sixMonthsAgoStr = sixMonthsAgo.toISOString();

      const [
        biens,
        contacts,
        contratsActifs,
        impayes,
        lotsTotal,
        lotsLoues,
        lotsVacants,
        contratsEch,
        travaux,
        reclamations,
      ] = await Promise.all([
        supabase.from("biens").select("id", { count: "exact", head: true }),
        supabase.from("contacts").select("id", { count: "exact", head: true }).eq("archive", false),
        supabase.from("contrats").select("id", { count: "exact", head: true }).eq("statut", "actif"),
        supabase.from("impayes").select("id", { count: "exact", head: true }).eq("statut", "en_retard"),
        supabase.from("lots").select("id", { count: "exact", head: true }),
        supabase.from("lots").select("id", { count: "exact", head: true }).eq("statut", "loue"),
        supabase.from("lots").select("id", { count: "exact", head: true }).eq("statut", "vacant"),
        supabase
          .from("contrats")
          .select("id", { count: "exact", head: true })
          .eq("statut", "actif")
          .gte("date_fin", today)
          .lte("date_fin", in60Str),
        supabase.from("travaux").select("id", { count: "exact", head: true }).in("statut", ["en_cours", "planifie"]),
        supabase.from("reclamations").select("id", { count: "exact", head: true }).in("statut", ["ouverte", "en_cours"]),
      ]);

      let doublonsCount = 0;
      let aVerifierCount = 0;
      if (userRole === "admin") {
        // Doublons: fetch active contacts and count pairs sharing phone or (nom, prenom), minus ignored
        const [{ data: allContacts }, { data: ignored }] = await Promise.all([
          supabase.from("contacts").select("id, nom, prenom, telephone").eq("archive", false),
          supabase.from("contact_doublons_ignores").select("contact_a_id, contact_b_id"),
        ]);
        const ignoredSet = new Set(
          (ignored ?? []).map((p: { contact_a_id: string; contact_b_id: string }) => {
            const [a, b] = [p.contact_a_id, p.contact_b_id].sort();
            return `${a}|${b}`;
          }),
        );
        const pairs = new Set<string>();
        const byPhone = new Map<string, string[]>();
        const byName = new Map<string, string[]>();
        for (const c of (allContacts ?? []) as Array<{ id: string; nom: string | null; prenom: string | null; telephone: string | null }>) {
          if (c.telephone) {
            const k = c.telephone.trim();
            if (k) (byPhone.get(k) ?? byPhone.set(k, []).get(k)!).push(c.id);
          }
          const nk = `${(c.nom ?? "").trim().toLowerCase()}|${(c.prenom ?? "").trim().toLowerCase()}`;
          if (nk !== "|") (byName.get(nk) ?? byName.set(nk, []).get(nk)!).push(c.id);
        }
        const addPairs = (groups: Map<string, string[]>) => {
          for (const ids of groups.values()) {
            if (ids.length < 2) continue;
            for (let i = 0; i < ids.length; i++)
              for (let j = i + 1; j < ids.length; j++) {
                const [a, b] = [ids[i], ids[j]].sort();
                const key = `${a}|${b}`;
                if (!ignoredSet.has(key)) pairs.add(key);
              }
          }
        };
        addPairs(byPhone);
        addPairs(byName);
        doublonsCount = pairs.size;

        const [b6, l6, c6] = await Promise.all([
          supabase.from("biens").select("id", { count: "exact", head: true }).lt("updated_at", sixMonthsAgoStr),
          supabase.from("lots").select("id", { count: "exact", head: true }).lt("updated_at", sixMonthsAgoStr),
          supabase.from("contrats").select("id", { count: "exact", head: true }).lt("updated_at", sixMonthsAgoStr),
        ]);
        aVerifierCount = (b6.count ?? 0) + (l6.count ?? 0) + (c6.count ?? 0);
      }

      setStats({
        biens: biens.count ?? 0,
        contacts: contacts.count ?? 0,
        contratsActifs: contratsActifs.count ?? 0,
        impayesRetard: impayes.count ?? 0,
        lotsTotal: lotsTotal.count ?? 0,
        lotsLoues: lotsLoues.count ?? 0,
        lotsVacants: lotsVacants.count ?? 0,
        contratsEcheance: contratsEch.count ?? 0,
        travauxEnCours: travaux.count ?? 0,
        reclamationsOuvertes: reclamations.count ?? 0,
        doublons: doublonsCount,
        aVerifier: aVerifierCount,
      });
    })();
  }, []);

  const tauxOccupation =
    stats.lotsTotal > 0 ? Math.round((stats.lotsLoues / stats.lotsTotal) * 100) : 0;

  // Quick actions permissions
  const canCreateContact = ["admin", "commercial", "gestion_locative"].includes(role);
  const canCreateBien = ["admin", "commercial", "gestion_locative"].includes(role);
  const canCreateContrat = ["admin", "juridique", "gestion_locative"].includes(role);

  const base: StatCard[] = [
    { key: "biens", label: "Biens", value: stats.biens, icon: Home, to: "/biens" },
    { key: "contrats", label: "Contrats actifs", value: stats.contratsActifs, icon: FileText, to: "/contrats" },
    {
      key: "impayes",
      label: "Impayés en retard",
      value: stats.impayesRetard,
      icon: AlertTriangle,
      to: "/impayes",
      emphasis: stats.impayesRetard > 0 ? "danger" : "normal",
    },
    { key: "contacts", label: "Contacts", value: stats.contacts, icon: ContactIcon, to: "/contacts" },
    { key: "taux", label: "Taux d'occupation", value: `${tauxOccupation}%`, icon: Percent },
    { key: "vacants", label: "Lots vacants", value: stats.lotsVacants, icon: DoorOpen, to: "/biens" },
    {
      key: "echeance",
      label: "Contrats à échéance (60j)",
      value: stats.contratsEcheance,
      icon: CalendarClock,
      to: "/contrats",
      emphasis: stats.contratsEcheance > 0 ? "warning" : "normal",
    },
    { key: "travaux", label: "Travaux en cours", value: stats.travauxEnCours, icon: Hammer, to: "/travaux" },
    {
      key: "reclamations",
      label: "Réclamations ouvertes",
      value: stats.reclamationsOuvertes,
      icon: MessageSquareWarning,
      to: "/reclamations",
    },
  ];

  const adminExtras: StatCard[] =
    role === "admin"
      ? [
          { key: "doublons", label: "Doublons détectés", value: stats.doublons, icon: Users2, to: "/doublons" },
          { key: "averifier", label: "Fiches à vérifier", value: stats.aVerifier, icon: ClipboardCheck },
        ]
      : [];

  let cards = [...base, ...adminExtras];

  // Reorder by role
  if (role === "recouvrement") {
    const imp = cards.find((c) => c.key === "impayes");
    if (imp) {
      imp.large = true;
      cards = [imp, ...cards.filter((c) => c.key !== "impayes")];
    }
  } else if (role === "technique") {
    const priority = ["travaux", "reclamations"];
    cards = [
      ...priority.map((k) => cards.find((c) => c.key === k)).filter(Boolean) as StatCard[],
      ...cards.filter((c) => !priority.includes(c.key)),
    ];
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-6">
        <h1 className="text-3xl">Tableau de bord</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {email ? `Connecté en tant que ${email}` : "Bienvenue"}
          {role ? ` — ${ROLE_LABELS[role] ?? role}` : ""}
        </p>
      </div>

      {(canCreateContact || canCreateBien || canCreateContrat) && (
        <div className="mb-6 flex flex-wrap gap-2">
          {canCreateContact && (
            <Button asChild size="sm" variant="outline">
              <Link to="/contacts"><Plus className="mr-2 h-4 w-4" /> Nouveau contact</Link>
            </Button>
          )}
          {canCreateBien && (
            <Button asChild size="sm" variant="outline">
              <Link to="/biens"><Plus className="mr-2 h-4 w-4" /> Nouveau bien</Link>
            </Button>
          )}
          {canCreateContrat && (
            <Button asChild size="sm" variant="outline">
              <Link to="/contrats"><Plus className="mr-2 h-4 w-4" /> Nouveau contrat</Link>
            </Button>
          )}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => {
          const emphasisCls =
            c.emphasis === "danger"
              ? "border-destructive/40 bg-destructive/5"
              : c.emphasis === "warning"
              ? "border-amber-400/40 bg-amber-50 dark:bg-amber-950/20"
              : "";
          const valueCls =
            c.emphasis === "danger"
              ? "text-destructive"
              : c.emphasis === "warning"
              ? "text-amber-600 dark:text-amber-400"
              : "text-primary";
          const iconCls =
            c.emphasis === "danger"
              ? "text-destructive"
              : c.emphasis === "warning"
              ? "text-amber-600 dark:text-amber-400"
              : "text-primary";
          const inner = (
            <Card className={`${emphasisCls} ${c.to ? "cursor-pointer transition-colors hover:bg-muted/50" : ""} ${c.large ? "sm:col-span-2 lg:col-span-2" : ""}`}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-semibold text-foreground">{c.label}</CardTitle>
                <c.icon className={`h-4 w-4 ${iconCls}`} />
              </CardHeader>
              <CardContent>
                <div className={`${c.large ? "text-5xl" : "text-4xl"} font-bold ${valueCls}`}>{c.value}</div>
              </CardContent>
            </Card>
          );
          return c.to ? (
            <Link key={c.key} to={c.to} className={c.large ? "sm:col-span-2 lg:col-span-2" : ""}>
              {inner}
            </Link>
          ) : (
            <div key={c.key} className={c.large ? "sm:col-span-2 lg:col-span-2" : ""}>
              {inner}
            </div>
          );
        })}
      </div>
    </div>
  );
}
