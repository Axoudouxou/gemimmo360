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
  Wallet,
  TrendingUp,
  Timer,
} from "lucide-react";
import { MesTachesSemaine, MesActivitesEnCours } from "@/components/activites-widgets";
import {
  OccupationGauge,
  PipelineFunnel,
  EncaissementsChart,
  TravauxDonut,
  ReclamationsBars,
  LotsParStatut,
  NouveauxContrats12Mois,
  OccupationParImmeuble,
  ListeEcheances,
  ListeARelancer,
  ListeATraiter,
  SuiviEquipe,
  ActiviteEntreprise30j,
  TachesEntrepriseDonut,
  ContratsParStatut,
  ModificationsEnAttente,
  MesActivites7j,
  FilActualiteEquipe,
} from "@/components/dashboard-widgets";

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
  direction: "Direction",
  gestion_locative: "Gestion locative",
  recouvrement: "Recouvrement",
  technique: "Technique",
  juridique: "Juridique",
  commercial: "Commercial",
};

function fmtMoney(n: number | null | undefined) {
  return `${Number(n ?? 0).toLocaleString("fr-FR")} FCFA`;
}

type StatCard = {
  key: string;
  label: string;
  value: number | string;
  icon: React.ComponentType<{ className?: string }>;
  to?: string;
  emphasis?: "danger" | "warning" | "info" | "normal";
  large?: boolean;
};

function StatCardGrid({ cards }: { cards: StatCard[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((c) => {
        const emphasisCls =
          c.emphasis === "danger" ? "border-destructive/40 bg-destructive/5" :
          c.emphasis === "warning" ? "border-amber-400/40 bg-amber-50 dark:bg-amber-950/20" :
          c.emphasis === "info" ? "border-blue-400/40 bg-blue-50 dark:bg-blue-950/20" : "";
        const valueCls =
          c.emphasis === "danger" ? "text-destructive" :
          c.emphasis === "warning" ? "text-amber-600 dark:text-amber-400" :
          c.emphasis === "info" ? "text-blue-600 dark:text-blue-400" : "text-primary";
        const iconCls = valueCls;
        const spanCls = c.large ? "sm:col-span-2 lg:col-span-2" : "";
        const inner = (
          <Card className={`${emphasisCls} ${c.to ? "cursor-pointer transition-colors hover:bg-muted/50" : ""} ${spanCls}`}>
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
          <Link key={c.key} to={c.to} className={spanCls}>{inner}</Link>
        ) : (
          <div key={c.key} className={spanCls}>{inner}</div>
        );
      })}
    </div>
  );
}

function Dashboard() {
  const [email, setEmail] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [role, setRole] = useState("");

  const [common, setCommon] = useState({
    biens: 0, contacts: 0, contratsActifs: 0, impayesRetard: 0,
    lotsTotal: 0, lotsLoues: 0, lotsVacants: 0,
    contratsEcheance: 0, travauxEnCours: 0, reclamationsOuvertes: 0,
  });
  const [admin, setAdmin] = useState({ doublons: 0, aVerifier: 0 });
  const [rec, setRec] = useState({ montantRetard: 0, contratsSuivis: 0, relancesMois: 0, tauxRecouvrement: 0 });
  const [tech, setTech] = useState({ delaiMoyenJ: 0, budgetMois: 0 });
  const [jur, setJur] = useState({ modifs: 0, bailleurs: 0 });
  const [porto, setPorto] = useState({ mesBiens: 0, mesContrats: 0, mesLotsVacants: 0, mesLotsTotal: 0, mesLotsLoues: 0 });

  useEffect(() => {
    (async () => {
      const { data: userRes } = await supabase.auth.getUser();
      const user = userRes.user;
      if (!user) return;
      setEmail(user.email ?? "");
      setUserId(user.id);
      const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
      const userRole = profile?.role ?? "";
      setRole(userRole);

      const today = new Date().toISOString().slice(0, 10);
      const in60 = new Date(); in60.setDate(in60.getDate() + 60);
      const in60Str = in60.toISOString().slice(0, 10);
      const startMonth = new Date(); startMonth.setDate(1);
      const startMonthStr = startMonth.toISOString().slice(0, 10);
      const sixMonthsAgoStr = (() => { const d = new Date(); d.setMonth(d.getMonth() - 6); return d.toISOString(); })();

      const [
        biens, contacts, contratsActifs, impayes, lotsTotal, lotsLoues, lotsVacants,
        contratsEch, travaux, reclamations,
      ] = await Promise.all([
        supabase.from("biens").select("id", { count: "exact", head: true }),
        supabase.from("contacts").select("id", { count: "exact", head: true }).eq("archive", false),
        supabase.from("contrats").select("id", { count: "exact", head: true }).eq("statut", "actif"),
        supabase.from("impayes").select("id", { count: "exact", head: true }).eq("statut", "en_retard"),
        supabase.from("lots").select("id", { count: "exact", head: true }),
        supabase.from("lots").select("id", { count: "exact", head: true }).eq("statut", "loue"),
        supabase.from("lots").select("id", { count: "exact", head: true }).eq("statut", "vacant"),
        supabase.from("contrats").select("id", { count: "exact", head: true })
          .eq("statut", "actif").gte("date_fin", today).lte("date_fin", in60Str),
        supabase.from("travaux").select("id", { count: "exact", head: true }).in("statut", ["en_cours", "planifie"]),
        supabase.from("reclamations").select("id", { count: "exact", head: true }).in("statut", ["ouverte", "en_cours"]),
      ]);

      setCommon({
        biens: biens.count ?? 0, contacts: contacts.count ?? 0,
        contratsActifs: contratsActifs.count ?? 0, impayesRetard: impayes.count ?? 0,
        lotsTotal: lotsTotal.count ?? 0, lotsLoues: lotsLoues.count ?? 0, lotsVacants: lotsVacants.count ?? 0,
        contratsEcheance: contratsEch.count ?? 0,
        travauxEnCours: travaux.count ?? 0, reclamationsOuvertes: reclamations.count ?? 0,
      });

      // Admin extras
      if (userRole === "admin") {
        const [{ data: allContacts }, { data: ignored }] = await Promise.all([
          supabase.from("contacts").select("id, nom, prenom, telephone").eq("archive", false),
          supabase.from("contact_doublons_ignores").select("contact_a_id, contact_b_id"),
        ]);
        const ignoredSet = new Set((ignored ?? []).map((p: { contact_a_id: string; contact_b_id: string }) => {
          const [a, b] = [p.contact_a_id, p.contact_b_id].sort(); return `${a}|${b}`;
        }));
        const pairs = new Set<string>();
        const byPhone = new Map<string, string[]>();
        const byName = new Map<string, string[]>();
        for (const c of (allContacts ?? []) as Array<{ id: string; nom: string | null; prenom: string | null; telephone: string | null }>) {
          if (c.telephone) { const k = c.telephone.trim(); if (k) (byPhone.get(k) ?? byPhone.set(k, []).get(k)!).push(c.id); }
          const nk = `${(c.nom ?? "").trim().toLowerCase()}|${(c.prenom ?? "").trim().toLowerCase()}`;
          if (nk !== "|") (byName.get(nk) ?? byName.set(nk, []).get(nk)!).push(c.id);
        }
        const addPairs = (groups: Map<string, string[]>) => {
          for (const ids of groups.values()) {
            if (ids.length < 2) continue;
            for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
              const [a, b] = [ids[i], ids[j]].sort(); const key = `${a}|${b}`;
              if (!ignoredSet.has(key)) pairs.add(key);
            }
          }
        };
        addPairs(byPhone); addPairs(byName);
        const [b6, l6, c6] = await Promise.all([
          supabase.from("biens").select("id", { count: "exact", head: true }).lt("updated_at", sixMonthsAgoStr),
          supabase.from("lots").select("id", { count: "exact", head: true }).lt("updated_at", sixMonthsAgoStr),
          supabase.from("contrats").select("id", { count: "exact", head: true }).lt("updated_at", sixMonthsAgoStr),
        ]);
        setAdmin({ doublons: pairs.size, aVerifier: (b6.count ?? 0) + (l6.count ?? 0) + (c6.count ?? 0) });
      }

      // Recouvrement stats
      if (userRole === "recouvrement" || userRole === "admin" || userRole === "direction") {
        const { data: retard } = await supabase.from("impayes").select("montant_du, montant_paye").eq("statut", "en_retard");
        const total = (retard ?? []).reduce((s: number, r: { montant_du: number | null; montant_paye: number | null }) =>
          s + (Number(r.montant_du ?? 0) - Number(r.montant_paye ?? 0)), 0);
        const { count: cs } = await supabase.from("contrats").select("id", { count: "exact", head: true }).eq("statut", "actif");
        const { count: rm } = await supabase.from("impayes").select("id", { count: "exact", head: true }).gte("date_derniere_relance", startMonthStr);
        const { data: all } = await supabase.from("impayes").select("statut");
        const paid = (all ?? []).filter((r: { statut: string }) => r.statut === "regle").length;
        const tot = (all ?? []).length;
        setRec({ montantRetard: total, contratsSuivis: cs ?? 0, relancesMois: rm ?? 0, tauxRecouvrement: tot ? Math.round((paid / tot) * 100) : 0 });
      }

      // Technique stats
      if (userRole === "technique" || userRole === "admin" || userRole === "direction") {
        const { data: trs } = await supabase.from("travaux").select("date_debut, date_fin, budget_depense").gte("date_debut", startMonthStr);
        const budgetMois = (trs ?? []).reduce((s: number, r: { budget_depense: number | null }) => s + Number(r.budget_depense ?? 0), 0);
        const { data: closed } = await supabase.from("travaux").select("date_debut, date_fin").eq("statut", "termine").not("date_fin", "is", null).limit(200);
        const delays = (closed ?? []).map((r: { date_debut: string | null; date_fin: string | null }) => {
          if (!r.date_debut || !r.date_fin) return 0;
          return (new Date(r.date_fin).getTime() - new Date(r.date_debut).getTime()) / (1000 * 60 * 60 * 24);
        }).filter((n: number) => n > 0);
        const delai = delays.length ? Math.round(delays.reduce((a: number, b: number) => a + b, 0) / delays.length) : 0;
        setTech({ delaiMoyenJ: delai, budgetMois });
      }

      // Juridique stats
      if (userRole === "juridique" || userRole === "admin" || userRole === "direction") {
        const { count: modifs } = await supabase.from("contrat_modifications_proposees").select("id", { count: "exact", head: true }).eq("statut", "en_attente");
        const { count: bailleurs } = await supabase.from("contacts").select("id", { count: "exact", head: true }).eq("type_contact", "bailleur").eq("archive", false);
        setJur({ modifs: modifs ?? 0, bailleurs: bailleurs ?? 0 });
      }

      // Portfolio for gestion_locative / commercial
      if (userRole === "gestion_locative" || userRole === "commercial") {
        const { data: myBiens } = await supabase.from("biens").select("id").eq("gestionnaire_id", user.id);
        const ids = (myBiens ?? []).map((b: { id: string }) => b.id);
        const mesBiens = ids.length;
        let mesContrats = 0, mesLotsTotal = 0, mesLotsLoues = 0, mesLotsVacants = 0;
        if (ids.length > 0) {
          const [{ data: lots }, contratsRes] = await Promise.all([
            supabase.from("lots").select("id, statut").in("bien_id", ids),
            supabase.from("contrats").select("id, lot_id").eq("statut", "actif"),
          ]);
          mesLotsTotal = (lots ?? []).length;
          mesLotsLoues = (lots ?? []).filter((l: { statut: string | null }) => l.statut === "loue").length;
          mesLotsVacants = (lots ?? []).filter((l: { statut: string | null }) => l.statut === "vacant").length;
          const lotIds = new Set((lots ?? []).map((l: { id: string }) => l.id));
          mesContrats = ((contratsRes.data ?? []) as Array<{ lot_id: string | null }>).filter((c) => c.lot_id && lotIds.has(c.lot_id)).length;
        }
        setPorto({ mesBiens, mesContrats, mesLotsVacants, mesLotsTotal, mesLotsLoues });
      }
    })();
  }, []);

  const tauxOccupation = common.lotsTotal > 0 ? Math.round((common.lotsLoues / common.lotsTotal) * 100) : 0;
  const tauxPorto = porto.mesLotsTotal > 0 ? Math.round((porto.mesLotsLoues / porto.mesLotsTotal) * 100) : 0;

  const canCreateContact = ["admin", "direction", "commercial", "gestion_locative"].includes(role);
  const canCreateBien = ["admin", "direction", "commercial", "gestion_locative"].includes(role);
  const canCreateContrat = ["admin", "direction", "juridique", "gestion_locative"].includes(role);

  const isAdminLike = role === "admin" || role === "direction";

  return (
    <div className="mx-auto max-w-7xl px-6 py-10 space-y-6">
      <div>
        <h1 className="text-3xl">Tableau de bord</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {email ? `Connecté en tant que ${email}` : "Bienvenue"}
          {role ? ` — ${ROLE_LABELS[role] ?? role}` : ""}
        </p>
      </div>

      {(canCreateContact || canCreateBien || canCreateContrat) && (
        <div className="flex flex-wrap gap-2">
          {canCreateContact && <Button asChild size="sm" variant="outline"><Link to="/contacts"><Plus className="mr-2 h-4 w-4" /> Nouveau contact</Link></Button>}
          {canCreateBien && <Button asChild size="sm" variant="outline"><Link to="/biens"><Plus className="mr-2 h-4 w-4" /> Nouveau bien</Link></Button>}
          {canCreateContrat && <Button asChild size="sm" variant="outline"><Link to="/contrats"><Plus className="mr-2 h-4 w-4" /> Nouveau contrat</Link></Button>}
        </div>
      )}

      <FilActualiteEquipe userId={userId} role={role} />


      {/* ADMIN & DIRECTION */}
      {isAdminLike && (
        <>
          <StatCardGrid cards={[
            { key: "biens", label: "Biens", value: common.biens, icon: Home, to: "/biens" },
            { key: "contrats", label: "Contrats actifs", value: common.contratsActifs, icon: FileText, to: "/contrats" },
            { key: "impayes", label: "Impayés en retard", value: common.impayesRetard, icon: AlertTriangle, to: "/impayes", emphasis: common.impayesRetard > 0 ? "danger" : "normal" },
            { key: "contacts", label: "Contacts", value: common.contacts, icon: ContactIcon, to: "/contacts" },
            { key: "taux", label: "Taux d'occupation", value: `${tauxOccupation}%`, icon: Percent },
            { key: "vacants", label: "Lots vacants", value: common.lotsVacants, icon: DoorOpen, to: "/biens" },
            { key: "ech", label: "Contrats à échéance (60j)", value: common.contratsEcheance, icon: CalendarClock, to: "/contrats", emphasis: common.contratsEcheance > 0 ? "warning" : "normal" },
            { key: "travaux", label: "Travaux en cours", value: common.travauxEnCours, icon: Hammer, to: "/travaux" },
            { key: "reclamations", label: "Réclamations ouvertes", value: common.reclamationsOuvertes, icon: MessageSquareWarning, to: "/reclamations" },
            ...(role === "admin" ? [
              { key: "doublons", label: "Doublons détectés", value: admin.doublons, icon: Users2 as StatCard["icon"], to: "/doublons" },
              { key: "averifier", label: "Fiches à vérifier", value: admin.aVerifier, icon: ClipboardCheck as StatCard["icon"] },
            ] : []),
          ]} />

          <div className="grid gap-4 lg:grid-cols-3">
            <OccupationGauge />
            <PipelineFunnel />
            <LotsParStatut />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <OccupationParImmeuble />
            <NouveauxContrats12Mois />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <ListeEcheances />
            <ListeARelancer />
          </div>
          <SuiviEquipe />
          <div className="grid gap-4 lg:grid-cols-2">
            <ActiviteEntreprise30j />
            <TachesEntrepriseDonut />
          </div>
        </>
      )}

      {/* GESTION LOCATIVE & COMMERCIAL */}
      {(role === "gestion_locative" || role === "commercial") && (
        <>
          <StatCardGrid cards={[
            { key: "mb", label: "Mes biens", value: porto.mesBiens, icon: Home, to: "/biens" },
            { key: "mc", label: "Mes contrats actifs", value: porto.mesContrats, icon: FileText, to: "/contrats" },
            { key: "mv", label: "Mes lots vacants", value: porto.mesLotsVacants, icon: DoorOpen, to: "/biens" },
            { key: "mt", label: "Taux d'occupation portefeuille", value: `${tauxPorto}%`, icon: Percent },
          ]} />

          <div className="grid gap-4 lg:grid-cols-2">
            <OccupationParImmeuble scope={{ gestionnaire_id: userId ?? undefined }} />
            <ListeEcheances scope={{ gestionnaire_id: userId ?? undefined }} />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <MesActivites7j userId={userId} />
            {role === "commercial" && <PipelineFunnel />}
          </div>
        </>
      )}

      {/* RECOUVREMENT */}
      {role === "recouvrement" && (
        <>
          <StatCardGrid cards={[
            { key: "mr", label: "Montant total en retard", value: fmtMoney(rec.montantRetard), icon: Wallet, emphasis: rec.montantRetard > 0 ? "danger" : "normal", large: true },
            { key: "cs", label: "Contrats suivis", value: rec.contratsSuivis, icon: FileText },
            { key: "rm", label: "Relances ce mois", value: rec.relancesMois, icon: MessageSquareWarning },
            { key: "tr", label: "Taux de recouvrement", value: `${rec.tauxRecouvrement}%`, icon: TrendingUp },
          ]} />

          <div className="grid gap-4 lg:grid-cols-2">
            <EncaissementsChart />
            <ListeARelancer />
          </div>
        </>
      )}

      {/* TECHNIQUE */}
      {role === "technique" && (
        <>
          <StatCardGrid cards={[
            { key: "tec", label: "Travaux en cours", value: common.travauxEnCours, icon: Hammer, to: "/travaux" },
            { key: "rec", label: "Réclamations ouvertes", value: common.reclamationsOuvertes, icon: MessageSquareWarning, to: "/reclamations", emphasis: "danger" },
            { key: "dm", label: "Délai moyen (j)", value: tech.delaiMoyenJ, icon: Timer },
            { key: "bm", label: "Budget travaux du mois", value: fmtMoney(tech.budgetMois), icon: Wallet },
          ]} />

          <div className="grid gap-4 lg:grid-cols-2">
            <TravauxDonut />
            <ReclamationsBars />
          </div>
          <ListeATraiter />
        </>
      )}

      {/* JURIDIQUE */}
      {role === "juridique" && (
        <>
          <StatCardGrid cards={[
            { key: "ca", label: "Contrats actifs", value: common.contratsActifs, icon: FileText, to: "/contrats" },
            { key: "ec", label: "Échéances (60j)", value: common.contratsEcheance, icon: CalendarClock, to: "/contrats", emphasis: "warning" },
            { key: "mo", label: "Modifications en attente", value: jur.modifs, icon: ClipboardCheck, emphasis: "info" },
            { key: "ba", label: "Bailleurs actifs", value: jur.bailleurs, icon: ContactIcon, to: "/contacts" },
          ]} />

          <ModificationsEnAttente />
          <div className="grid gap-4 lg:grid-cols-2">
            <ContratsParStatut />
            <ListeEcheances limit={8} />
          </div>
        </>
      )}

      {/* WIDGETS COMMUNS À TOUS LES RÔLES */}
      <div className="grid gap-4 lg:grid-cols-2">
        <MesTachesSemaine userId={userId} />
        <MesActivitesEnCours userId={userId} />
      </div>
    </div>
  );
}
