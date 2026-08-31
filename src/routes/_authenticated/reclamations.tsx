import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { FilterBar } from "@/components/filter-bar";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Building2, ArrowLeft, Plus, Pencil, Trash2, FileText, Hammer, AlertTriangle, Zap, UserX, Clock } from "lucide-react";
import { CommentSection, computePerms } from "@/components/comment-section";
import { DocumentsSection } from "@/components/documents-section";
import { toast } from "sonner";
import { FULL_ACCESS_USER_IDS } from "@/lib/access-overrides";

export const Route = createFileRoute("/_authenticated/reclamations")({
  head: () => ({
    meta: [
      { title: "Réclamations — Immo360" },
      { name: "description", content: "Suivi, traitement et résolution des réclamations des locataires et occupants." },
      { property: "og:title", content: "Réclamations — Immo360" },
      { property: "og:description", content: "Pilotage opérationnel des réclamations : échéances, priorités et assignations." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  validateSearch: (s: Record<string, unknown>) => ({
    open: typeof s.open === "string" ? s.open : undefined,
  }),
  component: ReclamationsPage,
});

const STATUTS = [
  { value: "ouverte", label: "Ouverte" },
  { value: "en_cours", label: "En cours" },
  { value: "en_attente", label: "En attente" },
  { value: "resolue", label: "Résolue" },
  { value: "fermee", label: "Fermée" },
] as const;
// Valeurs sélectionnables sur les formulaires (« normale » est conservée en base sur les anciennes fiches)
const PRIORITES = [
  { value: "critique", label: "Critique" },
  { value: "haute", label: "Haute" },
  { value: "moyenne", label: "Moyenne" },
  { value: "basse", label: "Basse" },
] as const;
const CATEGORIES = [
  { value: "plomberie", label: "Plomberie" },
  { value: "electricite", label: "Électricité" },
  { value: "securite", label: "Sécurité" },
  { value: "proprete", label: "Propreté" },
  { value: "autre", label: "Autre" },
] as const;
const STATUT_LABEL: Record<string, string> = Object.fromEntries(STATUTS.map((s) => [s.value, s.label]));
const PRIO_LABEL: Record<string, string> = { ...Object.fromEntries(PRIORITES.map((s) => [s.value, s.label])), normale: "Normale" };
const CAT_LABEL: Record<string, string> = Object.fromEntries(CATEGORIES.map((c) => [c.value, c.label]));

const PRIO_DOT: Record<string, string> = {
  critique: "bg-red-500",
  haute: "bg-orange-500",
  moyenne: "bg-yellow-500",
  normale: "bg-yellow-500",
  basse: "bg-muted-foreground/40",
};
const PRIO_CLASS: Record<string, string> = {
  critique: "border-red-500/40 bg-red-500/10 text-red-700",
  haute: "border-orange-500/40 bg-orange-500/10 text-orange-700",
  moyenne: "border-yellow-500/40 bg-yellow-500/10 text-yellow-700",
  normale: "border-yellow-500/40 bg-yellow-500/10 text-yellow-700",
  basse: "border-border bg-muted text-muted-foreground",
};
const STATUT_CLASS: Record<string, string> = {
  ouverte: "border-primary/40 bg-primary/10 text-primary",
  en_cours: "border-blue-500/40 bg-blue-500/10 text-blue-700",
  en_attente: "border-amber-500/40 bg-amber-500/10 text-amber-700",
  resolue: "border-green-600/40 bg-green-600/10 text-green-700",
  fermee: "border-border bg-muted text-muted-foreground",
};
const PRIO_RANK: Record<string, number> = { critique: 0, haute: 1, moyenne: 2, normale: 2, basse: 3 };

type Reclamation = {
  id: string; reference: string | null;
  bien_id: string; locataire_id: string | null;
  titre: string; description: string | null;
  statut: string; priorite: string; categorie: string | null;
  created_by: string | null; assigne_a: string | null; prestataire_id: string | null;
  created_at: string;
  date_incident: string | null;
  date_limite: string | null;
  date_resolution: string | null;
  temps_traitement: number | null;
  solution: string | null;
  prestataire_contacte: boolean;
  overdue_flagged: boolean;
};
type Bien = { id: string; titre: string; adresse: string | null; bailleur_id: string | null };
type Contact = { id: string; nom: string; prenom: string | null; telephone?: string | null; email?: string | null };
type Profile = { id: string; email: string | null };
type Travail = { id: string; titre: string; statut: string };

const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const isClosed = (r: Reclamation) => r.statut === "resolue" || r.statut === "fermee";

/** Nombre de jours entre aujourd'hui et l'échéance (négatif = en retard). */
function daysToDue(r: Reclamation): number | null {
  if (!r.date_limite) return null;
  const due = new Date(r.date_limite); due.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - startOfToday().getTime()) / 86400000);
}
const isOverdue = (r: Reclamation) => !isClosed(r) && (daysToDue(r) ?? 1) < 0;
const isDueToday = (r: Reclamation) => !isClosed(r) && daysToDue(r) === 0;

function dueInfo(r: Reclamation): { label: string; tone: "ok" | "soon" | "late" | "none" } {
  const d = daysToDue(r);
  if (d === null) return { label: "—", tone: "none" };
  if (isClosed(r)) return { label: new Date(r.date_limite!).toLocaleDateString("fr-FR"), tone: "none" };
  if (d < 0) return { label: `En retard de ${-d} jour${-d > 1 ? "s" : ""}`, tone: "late" };
  if (d === 0) return { label: "Aujourd'hui", tone: "soon" };
  if (d === 1) return { label: "Demain", tone: "soon" };
  return { label: `Dans ${d} jours`, tone: d <= 2 ? "soon" : "ok" };
}
const DUE_CLASS: Record<string, string> = {
  ok: "text-green-700",
  soon: "text-orange-600 font-medium",
  late: "text-red-600 font-semibold",
  none: "text-muted-foreground",
};

/** Nom lisible d'un utilisateur à partir de son email (l'email reste visible en fiche). */
function userName(p?: Profile | null) {
  if (!p) return "Non assignée";
  const local = (p.email ?? "").split("@")[0];
  if (!local) return "Utilisateur";
  return local.split(/[._-]+/).filter(Boolean).map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join(" ");
}

function ReclamationsPage() {
  const navigate = useNavigate();
  const [uid, setUid] = useState<string>("");
  const [role, setRole] = useState<string>("");
  const [items, setItems] = useState<Reclamation[]>([]);
  const [biens, setBiens] = useState<Bien[]>([]);
  const [allContacts, setAllContacts] = useState<Contact[]>([]);
  const [locataires, setLocataires] = useState<Contact[]>([]);

  const [prestataires, setPrestataires] = useState<Contact[]>([]);
  const [bailleurs, setBailleurs] = useState<Contact[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  const [detail, setDetail] = useState<Reclamation | null>(null);
  const [editing, setEditing] = useState<Reclamation | null>(null);
  const [creating, setCreating] = useState(false);

  const [search, setSearch] = useState("");
  const [fStatut, setFStatut] = useState("all");
  const [fPrio, setFPrio] = useState("all");
  const [fBien, setFBien] = useState("all");
  const [fCat, setFCat] = useState("all");
  const [fAssigne, setFAssigne] = useState("all");
  const [fEcheance, setFEcheance] = useState("all");
  const [fResolvedMonth, setFResolvedMonth] = useState(false);
  const [todayView, setTodayView] = useState(false);
  const [sort, setSort] = useState("ops");

  const canWriteBase = (uid && FULL_ACCESS_USER_IDS.includes(uid)) || (role && role !== "recouvrement" && role !== "en_attente");

  useEffect(() => {
    (async () => {
      const { data: userRes } = await supabase.auth.getUser();
      const u = userRes.user?.id ?? "";
      setUid(u);
      if (u) {
        const { data: p } = await supabase.from("profiles").select("role").eq("id", u).maybeSingle();
        setRole(p?.role ?? "");
      }
      try { await (supabase as any).rpc("detect_overdue_reclamations"); } catch { /* silencieux */ }
    })();
  }, []);

  const load = async () => {
    setLoading(true);
    const [{ data: rData, error }, { data: bData }, { data: cData }, { data: pData }] = await Promise.all([
      (supabase.from("reclamations") as any).select("*").order("created_at", { ascending: false }),
      supabase.from("biens").select("id, titre, adresse, bailleur_id").order("titre"),
      supabase.from("contacts").select("id, nom, prenom, telephone, email, type_contact").order("nom"),
      supabase.from("profiles").select("id, email").order("email"),
    ]);
    if (error) toast.error(error.message);
    else setItems((rData ?? []) as Reclamation[]);
    setBiens((bData ?? []) as Bien[]);
    const all = (cData ?? []) as (Contact & { type_contact: string | null })[];
    setAllContacts(all);
    setLocataires(all.filter((c) => c.type_contact === "locataire"));
    setPrestataires(all.filter((c) => c.type_contact === "prestataire"));
    setBailleurs(all.filter((c) => c.type_contact === "bailleur"));
    setProfiles((pData ?? []) as Profile[]);

    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const routeSearch = Route.useSearch();
  useEffect(() => {
    if (!routeSearch.open || items.length === 0) return;
    const found = items.find((r) => r.id === routeSearch.open);
    if (found) setDetail(found);
  }, [routeSearch.open, items]);

  const bienOf = (id: string) => biens.find((b) => b.id === id);
  const bienTitre = (id: string) => bienOf(id)?.titre ?? "—";
  const locataireOf = (id: string | null) => (id ? allContacts.find((x) => x.id === id) ?? null : null);
  const locataireName = (id: string | null) => { const l = locataireOf(id); return l ? `${l.nom}${l.prenom ? ` ${l.prenom}` : ""}` : "—"; };
  const profileOf = (id: string | null) => (id ? profiles.find((p) => p.id === id) ?? null : null);

  const resetFilters = () => {
    setSearch(""); setFStatut("all"); setFPrio("all"); setFCat("all"); setFBien("all");
    setFAssigne("all"); setFEcheance("all"); setFResolvedMonth(false); setTodayView(false);
  };

  // Vue « À traiter aujourd'hui »
  const needsActionToday = (r: Reclamation) =>
    !isClosed(r) && (isOverdue(r) || isDueToday(r) || r.priorite === "critique" || r.priorite === "haute" || !r.assigne_a);

  const resolvedThisMonth = (r: Reclamation) => {
    if (r.statut !== "resolue") return false;
    const d = r.date_resolution ? new Date(r.date_resolution) : null;
    if (!d) return false;
    const now = new Date();
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  };

  const kpis = useMemo(() => ({
    ouvertes: items.filter((r) => r.statut === "ouverte").length,
    retard: items.filter(isOverdue).length,
    haute: items.filter((r) => r.priorite === "haute").length,
    aujourdhui: items.filter(needsActionToday).length,
    resolues: items.filter(resolvedThisMonth).length,
  }), [items]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const out = items.filter((r) => {
      if (todayView && !needsActionToday(r)) return false;
      if (fResolvedMonth && !resolvedThisMonth(r)) return false;
      if (fStatut !== "all" && r.statut !== fStatut) return false;
      if (fPrio !== "all" && r.priorite !== fPrio) return false;
      if (fBien !== "all" && r.bien_id !== fBien) return false;
      if (fCat !== "all" && (r.categorie ?? "") !== fCat) return false;
      if (fAssigne !== "all") {
        if (fAssigne === "none" ? !!r.assigne_a : r.assigne_a !== fAssigne) return false;
      }
      if (fEcheance === "today" && !isDueToday(r)) return false;
      if (fEcheance === "late" && !isOverdue(r)) return false;
      if (fEcheance === "upcoming" && !(!isClosed(r) && (daysToDue(r) ?? -1) > 0)) return false;
      if (q) {
        const b = bienOf(r.bien_id);
        const hay = `${r.reference ?? ""} ${r.titre} ${r.description ?? ""} ${b?.titre ?? ""} ${b?.adresse ?? ""} ${locataireName(r.locataire_id)}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    const byDue = (a: Reclamation, b: Reclamation) => {
      const da = daysToDue(a), db = daysToDue(b);
      if (da === null && db === null) return 0;
      if (da === null) return 1;
      if (db === null) return -1;
      return da - db;
    };
    const sorted = [...out];
    if (sort === "priorite") sorted.sort((a, b) => (PRIO_RANK[a.priorite] ?? 9) - (PRIO_RANK[b.priorite] ?? 9));
    else if (sort === "echeance") sorted.sort(byDue);
    else if (sort === "created") sorted.sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
    else if (sort === "statut") sorted.sort((a, b) => (STATUT_LABEL[a.statut] ?? a.statut).localeCompare(STATUT_LABEL[b.statut] ?? b.statut));
    else if (sort === "bien") sorted.sort((a, b) => bienTitre(a.bien_id).localeCompare(bienTitre(b.bien_id)));
    else if (sort === "assigne") sorted.sort((a, b) => userName(profileOf(a.assigne_a)).localeCompare(userName(profileOf(b.assigne_a))));
    else {
      // Tri opérationnel par défaut
      const score = (r: Reclamation) => {
        if (isClosed(r)) return 90;
        if (r.priorite === "critique") return 0;
        if (r.priorite === "haute") return 1;
        if (isOverdue(r)) return 2;
        if (isDueToday(r)) return 3;
        if ((daysToDue(r) ?? 999) > 0) return 4;
        return 5;
      };
      sorted.sort((a, b) => score(a) - score(b) || byDue(a, b));
    }
    return sorted;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, search, fStatut, fPrio, fBien, fCat, fAssigne, fEcheance, fResolvedMonth, todayView, sort, biens, locataires, profiles]);

  const kpiCards = [
    { key: "ouvertes", label: "Réclamations ouvertes", value: kpis.ouvertes, danger: false, onClick: () => { resetFilters(); setFStatut("ouverte"); } },
    { key: "retard", label: "En retard", value: kpis.retard, danger: kpis.retard > 0, onClick: () => { resetFilters(); setFEcheance("late"); } },
    { key: "haute", label: "Priorité haute", value: kpis.haute, danger: false, onClick: () => { resetFilters(); setFPrio("haute"); } },
    { key: "today", label: "À traiter aujourd'hui", value: kpis.aujourdhui, danger: false, onClick: () => { resetFilters(); setTodayView(true); } },
    { key: "resolues", label: "Résolues ce mois", value: kpis.resolues, danger: false, onClick: () => { resetFilters(); setFResolvedMonth(true); setFStatut("resolue"); } },
  ];

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2"><Building2 className="h-5 w-5" /><span className="font-semibold">Agence Immobilière</span></div>
          <Button variant="outline" size="sm" asChild><Link to="/dashboard"><ArrowLeft className="mr-2 h-4 w-4" /> Tableau de bord</Link></Button>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Réclamations</h1>
            <p className="text-sm text-muted-foreground">Suivi, traitement et résolution des réclamations des locataires et occupants.</p>
          </div>
          {canWriteBase && <Button onClick={() => setCreating(true)}><Plus className="mr-2 h-4 w-4" /> Nouvelle réclamation</Button>}
        </div>

        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
          {kpiCards.map((k) => (
            <button
              key={k.key}
              type="button"
              onClick={k.onClick}
              className="rounded-lg border bg-background p-3 text-left transition-colors hover:bg-accent"
            >
              <div className={`text-2xl font-semibold ${k.danger ? "text-red-600" : ""}`}>{k.value}</div>
              <div className="text-xs text-muted-foreground">{k.label}</div>
            </button>
          ))}
        </div>

        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle className="text-base">Liste des réclamations</CardTitle>
              <CardDescription>Cliquez sur une ligne pour ouvrir la fiche détail.</CardDescription>
            </div>
            <Button
              size="sm"
              variant={todayView ? "default" : "outline"}
              onClick={() => setTodayView((v) => !v)}
            >
              <Zap className="mr-2 h-4 w-4" /> À traiter aujourd'hui
            </Button>
          </CardHeader>
          <CardContent>
            <FilterBar
              search={search}
              onSearchChange={setSearch}
              searchPlaceholder="Rechercher une réclamation, un bien, un lot ou un occupant..."
              selects={[
                { key: "statut", label: "Statut", value: fStatut, onChange: setFStatut, options: STATUTS.map((s) => ({ value: s.value, label: s.label })) },
                { key: "prio", label: "Priorité", value: fPrio, onChange: setFPrio, options: PRIORITES.map((s) => ({ value: s.value, label: s.label })) },
                { key: "cat", label: "Catégorie", value: fCat, onChange: setFCat, options: CATEGORIES.map((c) => ({ value: c.value, label: c.label })) },
                { key: "bien", label: "Bien", value: fBien, onChange: setFBien, options: biens.map((b) => ({ value: b.id, label: b.titre })), width: "w-52" },
                { key: "assigne", label: "Assigné à", value: fAssigne, onChange: setFAssigne, options: [{ value: "none", label: "Non assignée" }, ...profiles.map((p) => ({ value: p.id, label: userName(p) }))], width: "w-48" },
                { key: "echeance", label: "Échéance", value: fEcheance, onChange: setFEcheance, options: [
                  { value: "today", label: "Aujourd'hui" },
                  { value: "upcoming", label: "À venir" },
                  { value: "late", label: "En retard" },
                ] },
              ]}
              onReset={resetFilters}
              extra={
                <div className="flex items-center gap-1">
                  <span className="text-xs text-muted-foreground">Trier par</span>
                  <Select value={sort} onValueChange={setSort}>
                    <SelectTrigger className="h-9 w-44"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ops">Priorité opérationnelle</SelectItem>
                      <SelectItem value="priorite">Priorité</SelectItem>
                      <SelectItem value="echeance">Échéance</SelectItem>
                      <SelectItem value="created">Date de création</SelectItem>
                      <SelectItem value="statut">Statut</SelectItem>
                      <SelectItem value="bien">Bien</SelectItem>
                      <SelectItem value="assigne">Assigné</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              }
            />
            {(todayView || fResolvedMonth) && (
              <div className="mb-3 flex flex-wrap gap-2">
                {todayView && <Badge variant="outline" className="gap-1"><Zap className="h-3 w-3" /> Vue « À traiter aujourd'hui »</Badge>}
                {fResolvedMonth && <Badge variant="outline">Résolues ce mois</Badge>}
                <button type="button" className="text-xs underline text-muted-foreground" onClick={resetFilters}>Réinitialiser les filtres</button>
              </div>
            )}

            {loading ? <p className="text-sm text-muted-foreground">Chargement...</p> : filtered.length === 0 ? <p className="text-sm text-muted-foreground">Aucune réclamation.</p> : (
              <>
                {/* Desktop / tablette */}
                <div className="hidden overflow-x-auto md:block">
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead>Réclamation</TableHead><TableHead>Bien / Lot</TableHead><TableHead>Occupant</TableHead>
                      <TableHead>Priorité</TableHead><TableHead>Échéance</TableHead><TableHead>Assigné à</TableHead><TableHead>Statut</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>{filtered.map((r) => {
                      const due = dueInfo(r);
                      const b = bienOf(r.bien_id);
                      const assigne = profileOf(r.assigne_a);
                      return (
                        <TableRow key={r.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setDetail(r)}>
                          <TableCell>
                            <div className="font-medium">{r.titre}</div>
                            <div className="font-mono text-[11px] text-muted-foreground">{r.reference ?? "—"}</div>
                          </TableCell>
                          <TableCell>
                            <div>{b?.titre ?? "—"}</div>
                            {b?.adresse && <div className="text-xs text-muted-foreground">{b.adresse}</div>}
                          </TableCell>
                          <TableCell>{locataireName(r.locataire_id)}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={`gap-1.5 ${PRIO_CLASS[r.priorite] ?? ""}`}>
                              <span className={`h-2 w-2 rounded-full ${PRIO_DOT[r.priorite] ?? "bg-muted-foreground"}`} />
                              {PRIO_LABEL[r.priorite] ?? r.priorite}
                            </Badge>
                          </TableCell>
                          <TableCell className={`text-xs ${DUE_CLASS[due.tone]}`}>{due.label}</TableCell>
                          <TableCell className="text-xs">
                            {assigne ? userName(assigne) : (
                              <span className="inline-flex items-center gap-1 text-orange-600"><UserX className="h-3 w-3" /> Non assignée</span>
                            )}
                          </TableCell>
                          <TableCell><Badge variant="outline" className={STATUT_CLASS[r.statut] ?? ""}>{STATUT_LABEL[r.statut] ?? r.statut}</Badge></TableCell>
                        </TableRow>
                      );
                    })}</TableBody>
                  </Table>
                </div>

                {/* Mobile : cartes compactes */}
                <ul className="space-y-2 md:hidden">
                  {filtered.map((r) => {
                    const due = dueInfo(r);
                    return (
                      <li key={r.id}>
                        <button type="button" onClick={() => setDetail(r)} className="w-full rounded-lg border bg-background p-3 text-left hover:bg-accent">
                          <div className="font-medium">{r.titre}</div>
                          <div className="font-mono text-[11px] text-muted-foreground">{r.reference ?? "—"}</div>
                          <div className="mt-1 text-sm">{bienTitre(r.bien_id)}</div>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <Badge variant="outline" className={`gap-1.5 ${PRIO_CLASS[r.priorite] ?? ""}`}>
                              <span className={`h-2 w-2 rounded-full ${PRIO_DOT[r.priorite] ?? "bg-muted-foreground"}`} />
                              {PRIO_LABEL[r.priorite] ?? r.priorite}
                            </Badge>
                            <Badge variant="outline" className={STATUT_CLASS[r.statut] ?? ""}>{STATUT_LABEL[r.statut] ?? r.statut}</Badge>
                            <span className={`text-xs ${DUE_CLASS[due.tone]}`}>{due.label}</span>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </CardContent>
        </Card>

        {detail && (
          <DetailDialog rec={detail} uid={uid} role={role} biens={biens} locataires={allContacts} profiles={profiles} prestataires={allContacts} bailleurs={allContacts}
            onClose={() => setDetail(null)}
            onEdit={() => { setEditing(detail); setDetail(null); }}
            onDeleted={() => { setDetail(null); load(); }}
            onChanged={() => { setDetail(null); load(); }}
            onCreateTravaux={() => {
              navigate({
                to: "/travaux",
                search: {
                  new: "1",
                  bien: detail.bien_id,
                  titre: `${detail.reference ?? ""} — ${detail.titre}`,
                  reclamation: detail.id,
                  origine: "reclamation",
                  open: undefined,
                } as any,
              });
            }}
          />
        )}

        {(creating || editing) && (
          <EditDialog initial={editing} uid={uid} role={role} biens={biens} locataires={allContacts} profiles={profiles} prestataires={allContacts}
            onClose={() => { setCreating(false); setEditing(null); }}
            onSaved={() => { setCreating(false); setEditing(null); load(); }}
          />
        )}
      </main>
    </div>
  );
}

type HistoryRow = {
  id: string;
  champ_modifie: string;
  ancienne_valeur: string | null;
  nouvelle_valeur: string | null;
  auteur: string | null;
  created_at: string;
};

const CHAMP_LABEL: Record<string, string> = {
  creation: "Création",
  statut: "Statut",
  assigne_a: "Assignation",
  solution: "Solution",
  retard: "Retard",
};

// Permissions réclamation : l'assigné a les mêmes droits que le profil technique
// (statut, priorité, assignation, prestataire, catégorie, solution).
function recPerms(role: string, createdBy: string | null, assigneA: string | null, uid: string) {
  const base = computePerms(role, createdBy, uid);
  const isAssignee = !!assigneA && assigneA === uid;
  if (!isAssignee) return base;
  // L'assigné a les pleins droits (comme le créateur).
  return { ...base, canRead: true, canComment: true, canEditFull: true, canEditLimited: false };
}


function DetailDialog({ rec, uid, role, biens, locataires, profiles, prestataires, bailleurs, onClose, onEdit, onDeleted, onChanged, onCreateTravaux }: {
  rec: Reclamation; uid: string; role: string;
  biens: Bien[]; locataires: Contact[]; profiles: Profile[]; prestataires: Contact[]; bailleurs: Contact[];
  onClose: () => void; onEdit: () => void; onDeleted: () => void; onChanged: () => void; onCreateTravaux: () => void;
}) {
  const perms = recPerms(role, rec.created_by, rec.assigne_a, uid);
  const canAct = perms.canEditFull || perms.canEditLimited;
  const canSeePersonal = role === "admin" || role === "direction" || role === "technique" || role === "gestion" || perms.canEditFull || FULL_ACCESS_USER_IDS.includes(uid);
  const [saving, setSaving] = useState(false);
  const [dueDraft, setDueDraft] = useState(rec.date_limite ?? "");

  const patch = async (values: Record<string, any>, msg: string) => {
    setSaving(true);
    const { error } = await (supabase.from("reclamations") as any).update(values).eq("id", rec.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(msg);
    onChanged();
  };

  const changeStatut = async (v: string) => {
    if (v === rec.statut) return;
    if (v === "resolue" && !(rec.solution ?? "").trim()) {
      toast.error("Renseignez la solution via « Modifier » pour clôturer la réclamation.");
      return;
    }
    await patch({ statut: v }, "Statut mis à jour");
  };

  const bien = biens.find((b) => b.id === rec.bien_id);
  const bailleur = bien?.bailleur_id ? bailleurs.find((b) => b.id === bien.bailleur_id) : null;
  const loc = rec.locataire_id ? locataires.find((l) => l.id === rec.locataire_id) : null;
  const assigne = rec.assigne_a ? profiles.find((p) => p.id === rec.assigne_a) : null;
  const prest = rec.prestataire_id ? prestataires.find((p) => p.id === rec.prestataire_id) : null;
  const overdue = isOverdue(rec);
  const due = dueInfo(rec);
  const canCreateTravaux = role === "technique" || role === "admin" || role === "direction" || FULL_ACCESS_USER_IDS.includes(uid);

  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [authors, setAuthors] = useState<Map<string, string>>(new Map());
  const [linkedTravaux, setLinkedTravaux] = useState<Travail[]>([]);

  const loadHistory = async () => {
    const { data } = await (supabase.from("reclamations_historique" as never) as any)
      .select("id, champ_modifie, ancienne_valeur, nouvelle_valeur, auteur, created_at")
      .eq("reclamation_id", rec.id)
      .order("created_at", { ascending: false });
    const rows = (data ?? []) as HistoryRow[];
    setHistory(rows);
    const ids = Array.from(new Set(rows.map((r) => r.auteur).filter((v): v is string => !!v)));
    if (ids.length) {
      const { data: profs } = await supabase.from("profiles").select("id, email").in("id", ids);
      setAuthors(new Map(((profs ?? []) as Profile[]).map((p) => [p.id, userName(p)])));
    }
  };
  const loadTravaux = async () => {
    const { data } = await (supabase.from("travaux") as any)
      .select("id, titre, statut")
      .eq("reclamation_id", rec.id)
      .order("created_at", { ascending: false });
    setLinkedTravaux((data ?? []) as Travail[]);
  };
  useEffect(() => { loadHistory(); loadTravaux(); /* eslint-disable-next-line */ }, [rec.id]);

  const handleDelete = async () => {
    if (!confirm("Supprimer cette réclamation ?")) return;
    const { error } = await supabase.from("reclamations").delete().eq("id", rec.id);
    if (error) return toast.error(error.message);
    toast.success("Supprimée"); onDeleted();
  };

  const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString("fr-FR") : "—";

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            {rec.reference && <span className="font-mono text-sm text-muted-foreground">{rec.reference}</span>}
            <span>{rec.titre}</span>
          </DialogTitle>
          <DialogDescription>Fiche réclamation.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className={STATUT_CLASS[rec.statut] ?? ""}>{STATUT_LABEL[rec.statut] ?? rec.statut}</Badge>
            <Badge variant="outline" className={`gap-1.5 ${PRIO_CLASS[rec.priorite] ?? ""}`}>
              <span className={`h-2 w-2 rounded-full ${PRIO_DOT[rec.priorite] ?? "bg-muted-foreground"}`} />
              {PRIO_LABEL[rec.priorite] ?? rec.priorite}
            </Badge>
            {rec.categorie && <Badge variant="outline">{CAT_LABEL[rec.categorie] ?? rec.categorie}</Badge>}
            {!isClosed(rec) && due.tone !== "none" && (
              <Badge variant="outline" className={due.tone === "late" ? "border-red-500/40 bg-red-500/10 text-red-700" : due.tone === "soon" ? "border-orange-500/40 bg-orange-500/10 text-orange-700" : "border-green-600/40 bg-green-600/10 text-green-700"}>
                <Clock className="mr-1 h-3 w-3" /> {due.label}
              </Badge>
            )}
            {!rec.assigne_a && <Badge variant="outline" className="border-orange-500/40 bg-orange-500/10 text-orange-700 gap-1"><UserX className="h-3 w-3" /> Non assignée</Badge>}
            {overdue && <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" /> En retard</Badge>}
          </div>

          <section>
            <h4 className="mb-2 font-semibold">Informations générales</h4>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div><span className="text-muted-foreground">Référence : </span>{rec.reference ?? "—"}</div>
              <div><span className="text-muted-foreground">Catégorie : </span>{rec.categorie ? CAT_LABEL[rec.categorie] ?? rec.categorie : "—"}</div>
              <div><span className="text-muted-foreground">Créée le : </span>{new Date(rec.created_at).toLocaleString("fr-FR")}</div>
              <div><span className="text-muted-foreground">Date d'incident : </span>{fmtDate(rec.date_incident)}</div>
              <div><span className="text-muted-foreground">Échéance : </span>{fmtDate(rec.date_limite)}</div>
              <div><span className="text-muted-foreground">Résolue le : </span>{rec.date_resolution ? new Date(rec.date_resolution).toLocaleDateString("fr-FR") : "—"}{rec.temps_traitement != null ? ` (${rec.temps_traitement} j)` : ""}</div>
            </div>
          </section>

          <section className="border-t pt-3">
            <h4 className="mb-2 font-semibold">Bien concerné</h4>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div><span className="text-muted-foreground">Bien : </span>{bien ? <Link to="/biens/$bienId" params={{ bienId: bien.id }} className="underline">{bien.titre}</Link> : "—"}</div>
              <div><span className="text-muted-foreground">Adresse : </span>{bien?.adresse ?? "—"}</div>
              <div><span className="text-muted-foreground">Propriétaire : </span>{bailleur ? `${bailleur.nom}${bailleur.prenom ? ` ${bailleur.prenom}` : ""}` : "—"}</div>
            </div>
          </section>

          <section className="border-t pt-3">
            <h4 className="mb-2 font-semibold">Occupant</h4>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div><span className="text-muted-foreground">Nom : </span>{loc ? <Link to="/contacts/$contactId" params={{ contactId: loc.id }} className="underline">{loc.nom}{loc.prenom ? ` ${loc.prenom}` : ""}</Link> : "—"}</div>
              {canSeePersonal && <div><span className="text-muted-foreground">Téléphone : </span>{loc?.telephone ?? "—"}</div>}
              {canSeePersonal && <div><span className="text-muted-foreground">Email : </span>{loc?.email ?? "—"}</div>}
            </div>
          </section>

          <section className="border-t pt-3">
            <h4 className="mb-2 font-semibold">Assignation</h4>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div><span className="text-muted-foreground">Responsable : </span>{assigne ? userName(assigne) : "Non assignée"}</div>
              {canSeePersonal && <div><span className="text-muted-foreground">Email : </span>{assigne?.email ?? "—"}</div>}
              <div><span className="text-muted-foreground">Prestataire : </span>{prest ? <Link to="/contacts/$contactId" params={{ contactId: prest.id }} className="underline">{prest.nom}{prest.prenom ? ` ${prest.prenom}` : ""}</Link> : "—"}</div>
            </div>
          </section>

          <section className="border-t pt-3">
            <h4 className="mb-2 font-semibold">Description</h4>
            <div className="whitespace-pre-wrap rounded bg-muted/40 p-2">{rec.description || "—"}</div>
          </section>

          {canAct && (
            <section className="border-t pt-3">
              <h4 className="mb-2 font-semibold">Actions</h4>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="grid gap-1">
                  <Label className="text-xs">Assigner</Label>
                  <Select value={rec.assigne_a ?? "none"} onValueChange={(v) => patch({ assigne_a: v === "none" ? null : v }, "Assignation mise à jour")} disabled={saving}>
                    <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Non assignée</SelectItem>
                      {profiles.map((p) => <SelectItem key={p.id} value={p.id}>{userName(p)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1">
                  <Label className="text-xs">Statut</Label>
                  <Select value={rec.statut} onValueChange={changeStatut} disabled={saving}>
                    <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                    <SelectContent>{STATUTS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1">
                  <Label className="text-xs">Priorité</Label>
                  <Select value={PRIORITES.some((p) => p.value === rec.priorite) ? rec.priorite : ""} onValueChange={(v) => patch({ priorite: v }, "Priorité mise à jour")} disabled={saving}>
                    <SelectTrigger className="h-8"><SelectValue placeholder={PRIO_LABEL[rec.priorite] ?? rec.priorite} /></SelectTrigger>
                    <SelectContent>{PRIORITES.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1">
                  <Label className="text-xs">Échéance</Label>
                  <div className="flex gap-2">
                    <Input type="date" className="h-8" value={dueDraft} onChange={(e) => setDueDraft(e.target.value)} />
                    <Button size="sm" variant="secondary" disabled={saving || dueDraft === (rec.date_limite ?? "")} onClick={() => patch({ date_limite: dueDraft || null }, "Échéance mise à jour")}>OK</Button>
                  </div>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {canCreateTravaux && (
                  <Button size="sm" variant="secondary" onClick={onCreateTravaux}><Hammer className="mr-2 h-4 w-4" /> Planifier une intervention (travaux)</Button>
                )}
                {rec.statut !== "resolue" && (
                  <Button size="sm" onClick={() => (rec.solution ?? "").trim() ? changeStatut("resolue") : (toast.error("Renseignez la solution via « Modifier » pour clôturer."), onEdit())}>
                    Résoudre la réclamation
                  </Button>
                )}
              </div>
            </section>
          )}

          {rec.statut === "resolue" && rec.solution && (
            <div className="rounded-md border border-green-500/30 bg-green-500/5 p-3">
              <div className="text-xs font-semibold text-green-700 mb-1">Solution apportée{rec.prestataire_contacte ? " (prestataire contacté)" : ""}</div>
              <div className="whitespace-pre-wrap">{rec.solution}</div>
            </div>
          )}

          {linkedTravaux.length > 0 && (
            <div className="border-t pt-3">
              <h4 className="font-semibold text-sm mb-2">Travaux liés</h4>
              <ul className="space-y-1">
                {linkedTravaux.map((t) => (
                  <li key={t.id}>
                    <Link to="/travaux" search={{ open: t.id } as any} className="text-sm underline">
                      {t.titre} <Badge variant="outline" className="ml-2">{t.statut}</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="border-t pt-3">
            <h4 className="font-semibold text-sm mb-2 flex items-center gap-2"><FileText className="h-4 w-4" /> Pièces jointes</h4>
            <DocumentsSection
              bucket="reclamations-documents"
              recordId={rec.id}
              canWrite={canAct}
              description="Photos, devis, factures, rapports — 10 Mo max par fichier."
              allowedExtensions={[".pdf", ".jpg", ".jpeg", ".png", ".docx", ".xlsx"]}
              allowedMimeTypes={[
                "application/pdf",
                "image/jpeg",
                "image/png",
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
              ]}
              maxSizeMb={10}
              buttonLabel="Ajouter une pièce jointe"
              hint="PDF, JPG, PNG, DOCX, XLSX — 10 Mo max."
            />
          </div>

          <div className="border-t pt-3">
            <h4 className="font-semibold text-sm mb-2">Historique</h4>
            {history.length === 0 ? (
              <p className="text-xs text-muted-foreground">Aucun événement.</p>
            ) : (
              <ul className="space-y-1.5">
                {history.map((h) => (
                  <li key={h.id} className="text-xs rounded-md border px-2 py-1.5 bg-muted/20 flex items-center justify-between gap-2">
                    <span>
                      <span className="font-medium">{CHAMP_LABEL[h.champ_modifie] ?? h.champ_modifie}</span>
                      {h.champ_modifie === "statut" ? (
                        <>{" : "}<span className="text-muted-foreground">{STATUT_LABEL[h.ancienne_valeur ?? ""] ?? h.ancienne_valeur ?? "—"}</span> → <span className="font-medium">{STATUT_LABEL[h.nouvelle_valeur ?? ""] ?? h.nouvelle_valeur}</span></>
                      ) : h.champ_modifie === "assigne_a" ? (
                        <>{" : "}{h.nouvelle_valeur ? userName(profiles.find((p) => p.id === h.nouvelle_valeur)) : "désassigné"}</>
                      ) : h.champ_modifie === "creation" ? null : (
                        <>{" : "}{h.nouvelle_valeur ?? "—"}</>
                      )}
                    </span>
                    <span className="text-muted-foreground whitespace-nowrap">{h.auteur ? authors.get(h.auteur) ?? "—" : "Système"} • {new Date(h.created_at).toLocaleString("fr-FR")}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="border-t pt-3">
            <CommentSection table="reclamations_commentaires" fkColumn="reclamation_id" recordId={rec.id} canComment={perms.canComment} entityType="reclamation" entityId={rec.id} link={`/reclamations?open=${rec.id}`} entityTitle={rec.titre} />
          </div>
        </div>
        <DialogFooter className="gap-2">
          {perms.canDelete && <Button variant="destructive" size="sm" onClick={handleDelete}><Trash2 className="mr-2 h-4 w-4" /> Supprimer</Button>}
          {canAct && <Button size="sm" onClick={onEdit}><Pencil className="mr-2 h-4 w-4" /> Modifier</Button>}
          <Button variant="outline" size="sm" onClick={onClose}>Fermer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditDialog({ initial, uid, role, biens, locataires, profiles, prestataires, onClose, onSaved }: {
  initial: Reclamation | null; uid: string; role: string;
  biens: Bien[]; locataires: Contact[]; profiles: Profile[]; prestataires: Contact[];
  onClose: () => void; onSaved: () => void;
}) {
  const isEdit = !!initial;
  const perms = recPerms(role, initial?.created_by ?? uid, initial?.assigne_a ?? null, uid);
  const limited = isEdit && perms.canEditLimited && !perms.canEditFull;
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(() => ({
    bien_id: initial?.bien_id ?? "",
    locataire_id: initial?.locataire_id ?? "",
    titre: initial?.titre ?? "",
    description: initial?.description ?? "",
    categorie: initial?.categorie ?? "",
    date_incident: initial?.date_incident ?? "",
    date_limite: initial?.date_limite ?? "",
    statut: initial?.statut ?? "ouverte",
    priorite: initial?.priorite ?? "moyenne",
    assigne_a: initial?.assigne_a ?? "",
    prestataire_id: initial?.prestataire_id ?? "",
    solution: initial?.solution ?? "",
    prestataire_contacte: initial?.prestataire_contacte ?? false,
  }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.bien_id || !form.titre) return toast.error("Bien et titre obligatoires");
    if (form.statut === "resolue" && !form.solution.trim()) {
      return toast.error("La description de la solution est obligatoire pour clôturer.");
    }
    setSaving(true);
    const commonWrite = {
      statut: form.statut,
      priorite: form.priorite,
      assigne_a: form.assigne_a || null,
      prestataire_id: form.prestataire_id || null,
      solution: form.solution.trim() || null,
      prestataire_contacte: form.prestataire_contacte,
    };
    const fullWrite = {
      bien_id: form.bien_id,
      locataire_id: form.locataire_id || null,
      titre: form.titre.trim(),
      description: form.description.trim() || null,
      categorie: form.categorie || null,
      date_incident: form.date_incident || null,
      date_limite: form.date_limite || null,
      ...commonWrite,
    };
    if (isEdit) {
      const patch: Record<string, any> = limited ? commonWrite : fullWrite;
      const { error } = await (supabase.from("reclamations") as any).update(patch).eq("id", initial!.id);
      setSaving(false);
      if (error) return toast.error(error.message);
      toast.success("Modifiée"); onSaved();
    } else {
      const { error } = await (supabase.from("reclamations") as any).insert({
        ...fullWrite,
        created_by: uid,
      });
      setSaving(false);
      if (error) return toast.error(error.message);
      toast.success("Créée"); onSaved();
    }
  };

  const prioOptions = PRIORITES.some((p) => p.value === form.priorite)
    ? PRIORITES.map((p) => ({ value: p.value, label: p.label }))
    : [{ value: form.priorite, label: `${PRIO_LABEL[form.priorite] ?? form.priorite} (valeur historique)` }, ...PRIORITES.map((p) => ({ value: p.value, label: p.label }))];

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>{isEdit ? "Modifier la réclamation" : "Nouvelle réclamation"}</DialogTitle>
            <DialogDescription>{limited ? "Droits limités : statut, priorité, assignation, prestataire et solution uniquement." : "Renseignez les informations."}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2"><Label>Bien *</Label>
              <Select value={form.bien_id} onValueChange={(v) => setForm({ ...form, bien_id: v })} disabled={limited}>
                <SelectTrigger><SelectValue placeholder="Sélectionner..." /></SelectTrigger>
                <SelectContent>{biens.map((b) => <SelectItem key={b.id} value={b.id}>{b.titre}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid gap-2"><Label>Occupant</Label>
              <Select value={form.locataire_id || "none"} onValueChange={(v) => setForm({ ...form, locataire_id: v === "none" ? "" : v })} disabled={limited}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="none">—</SelectItem>{locataires.map((l) => <SelectItem key={l.id} value={l.id}>{l.nom}{l.prenom ? ` ${l.prenom}` : ""}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid gap-2"><Label>Titre *</Label><Input required value={form.titre} onChange={(e) => setForm({ ...form, titre: e.target.value })} disabled={limited} /></div>
            <div className="grid gap-2"><Label>Description</Label><Textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} disabled={limited} /></div>

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2"><Label>Catégorie</Label>
                <Select value={form.categorie || "none"} onValueChange={(v) => setForm({ ...form, categorie: v === "none" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent><SelectItem value="none">—</SelectItem>{CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid gap-2"><Label>Date d'incident</Label>
                <Input type="date" value={form.date_incident} onChange={(e) => setForm({ ...form, date_incident: e.target.value })} disabled={limited} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2"><Label>Utilisateur assigné</Label>
                <Select value={form.assigne_a || "none"} onValueChange={(v) => setForm({ ...form, assigne_a: v === "none" ? "" : v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="none">—</SelectItem>{profiles.map((p) => <SelectItem key={p.id} value={p.id}>{userName(p)}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid gap-2"><Label>Prestataire</Label>
                <Select value={form.prestataire_id || "none"} onValueChange={(v) => setForm({ ...form, prestataire_id: v === "none" ? "" : v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="none">—</SelectItem>{prestataires.map((p) => <SelectItem key={p.id} value={p.id}>{p.nom}{p.prenom ? ` ${p.prenom}` : ""}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2"><Label>Statut</Label>
                <Select value={form.statut} onValueChange={(v) => setForm({ ...form, statut: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{STATUTS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid gap-2"><Label>Priorité</Label>
                <Select value={form.priorite} onValueChange={(v) => setForm({ ...form, priorite: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{prioOptions.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-2"><Label>Échéance</Label>
              <Input type="date" value={form.date_limite} onChange={(e) => setForm({ ...form, date_limite: e.target.value })} disabled={limited} />
              <p className="text-xs text-muted-foreground">Si vide : calculée automatiquement selon la priorité (Critique 24 h, Haute 48 h, Moyenne 72 h, Basse 7 jours).</p>
            </div>

            {form.statut === "resolue" && (
              <div className="rounded-md border p-3 bg-green-500/5 space-y-3">
                <div className="grid gap-2">
                  <Label>Solution apportée *</Label>
                  <Textarea rows={3} required value={form.solution} onChange={(e) => setForm({ ...form, solution: e.target.value })} placeholder="Décrivez ce qui a été fait pour résoudre le problème." />
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={form.prestataire_contacte} onCheckedChange={(v) => setForm({ ...form, prestataire_contacte: !!v })} />
                  Prestataire contacté
                </label>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Annuler</Button>
            <Button type="submit" disabled={saving}>{saving ? "..." : "Enregistrer"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
