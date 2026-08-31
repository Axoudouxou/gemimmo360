import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Building2, ArrowLeft, Plus, FileText, Pencil, Trash2, Search, X, Wrench, Zap,
  LayoutList, LayoutGrid, CalendarClock, User, Coins,
} from "lucide-react";
import { DocumentsSection } from "@/components/documents-section";
import { CommentSection, computePerms } from "@/components/comment-section";
import { toast } from "sonner";
import { FULL_ACCESS_USER_IDS } from "@/lib/access-overrides";
import {
  TRAVAUX_STATUTS, STATUT_LABEL, STATUT_CLASS, PRIORITES, PRIORITE_LABEL, PRIORITE_CLASS,
  CHARGES, CHARGE_LABEL, MOTIFS_REFUS, STATUTS_CLOS, fmtMoney, fmtDate, echeanceInfo,
  echeanceDate, isLate, needsAction, sortWeight, displayName, todayISO, daysUntil,
} from "@/lib/travaux-utils";

const CHRISTELLE_EMAIL = "christelle.kouassi@gem-immobilier.org";

export const Route = createFileRoute("/_authenticated/travaux")({
  head: () => ({
    meta: [
      { title: "Travaux — Suivi des interventions | Immo360" },
      { name: "description", content: "Pilotez les demandes de travaux, interventions et réparations sur vos biens." },
      { property: "og:title", content: "Travaux — Suivi des interventions | Immo360" },
      { property: "og:description", content: "Pilotez les demandes de travaux, interventions et réparations sur vos biens." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  validateSearch: (s: Record<string, unknown>) => ({
    open: typeof s.open === "string" ? s.open : undefined,
    new: typeof s.new === "string" ? s.new : undefined,
    bien: typeof s.bien === "string" ? s.bien : undefined,
    titre: typeof s.titre === "string" ? s.titre : undefined,
    reclamation: typeof s.reclamation === "string" ? s.reclamation : undefined,
    origine: typeof s.origine === "string" ? s.origine : undefined,
  }),
  component: TravauxPage,
});

type Prefill = { bien_id?: string; titre?: string; reclamation_id?: string; origine?: string };

type Travail = {
  id: string; reference: string | null; bien_id: string; lot_id: string | null;
  titre: string; description: string | null; categorie: string | null;
  budget_prevu: number | null; budget_depense: number; statut: string; priorite: string;
  date_debut: string | null; date_fin: string | null; date_echeance: string | null;
  date_intervention_prevue: string | null; heure_intervention: string | null;
  date_intervention_reelle: string | null; commentaire_intervention: string | null;
  origine: string | null; charge_financiere: string | null;
  notes: string | null; motif_refus: string | null; reference_cheque: string | null;
  reclamation_id: string | null; etat_des_lieux_id: string | null;
  created_by: string | null; assigne_a: string | null; created_at: string;
};
type Bien = { id: string; titre: string; adresse: string | null };
type Lot = { id: string; label: string; bien_id: string };
type Profile = { id: string; email: string | null };
type Reclam = { id: string; reference: string | null; titre: string; bien_id: string };
type Edl = { id: string; type: string; date_realisation: string; lot_id: string };

const KANBAN_COLS = ["a_qualifier", "a_valider", "valide", "planifie", "en_cours", "termine"];

function TravauxPage() {
  const [uid, setUid] = useState("");
  const [role, setRole] = useState("");
  const [email, setEmail] = useState("");
  const [travaux, setTravaux] = useState<Travail[]>([]);
  const [biens, setBiens] = useState<Bien[]>([]);
  const [lots, setLots] = useState<Lot[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [reclams, setReclams] = useState<Reclam[]>([]);
  const [edls, setEdls] = useState<Edl[]>([]);
  const [occupants, setOccupants] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const [detail, setDetail] = useState<Travail | null>(null);
  const [editing, setEditing] = useState<Travail | null>(null);
  const [creating, setCreating] = useState<false | Prefill>(false);

  const [search, setSearch] = useState("");
  const [fStatut, setFStatut] = useState("all");
  const [fPriorite, setFPriorite] = useState("all");
  const [fBien, setFBien] = useState("all");
  const [fCharge, setFCharge] = useState("all");
  const [fAssigne, setFAssigne] = useState("all");
  const [fEcheance, setFEcheance] = useState("all");
  const [aTraiter, setATraiter] = useState(false);
  const [view, setView] = useState<"liste" | "kanban">("liste");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 50;

  useEffect(() => {
    (async () => {
      const { data: userRes } = await supabase.auth.getUser();
      const u = userRes.user?.id ?? "";
      setUid(u);
      setEmail(userRes.user?.email ?? "");
      if (u) {
        const { data: p } = await supabase.from("profiles").select("role").eq("id", u).maybeSingle();
        setRole(p?.role ?? "");
      }
    })();
  }, []);

  const load = async () => {
    setLoading(true);
    const [{ data: tData, error }, { data: bData }, { data: lData }, { data: pData }, { data: rData }, { data: eData }, { data: cData }] =
      await Promise.all([
        supabase.from("travaux").select("*").order("created_at", { ascending: false }),
        supabase.from("biens").select("id, titre, adresse").order("titre"),
        supabase.from("lots").select("id, label, bien_id").order("label"),
        supabase.from("profiles").select("id, email").order("email"),
        supabase.from("reclamations").select("id, reference, titre, bien_id").order("created_at", { ascending: false }).limit(500),
        supabase.from("etats_des_lieux").select("id, type, date_realisation, lot_id").order("date_realisation", { ascending: false }).limit(500),
        supabase.from("contrats").select("lot_id, statut, contacts:locataire_id(nom, prenom)").eq("statut", "actif"),
      ]);
    if (error) toast.error(error.message);
    else setTravaux((tData ?? []) as unknown as Travail[]);
    setBiens((bData ?? []) as Bien[]);
    setLots((lData ?? []) as Lot[]);
    setProfiles((pData ?? []) as Profile[]);
    setReclams((rData ?? []) as unknown as Reclam[]);
    setEdls((eData ?? []) as unknown as Edl[]);
    const occ: Record<string, string> = {};
    for (const c of (cData ?? []) as any[]) {
      if (c.lot_id && c.contacts) occ[c.lot_id] = `${c.contacts.nom ?? ""} ${c.contacts.prenom ?? ""}`.trim();
    }
    setOccupants(occ);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const routeSearch = Route.useSearch();
  useEffect(() => {
    if (!routeSearch.open || travaux.length === 0) return;
    const found = travaux.find((t) => t.id === routeSearch.open);
    if (found) setDetail(found);
  }, [routeSearch.open, travaux]);
  useEffect(() => {
    if (routeSearch.new === "1") {
      setCreating({
        bien_id: routeSearch.bien, titre: routeSearch.titre,
        reclamation_id: routeSearch.reclamation, origine: routeSearch.origine,
      });
    }
  }, [routeSearch.new, routeSearch.bien, routeSearch.titre, routeSearch.reclamation, routeSearch.origine]);

  const bienById = useMemo(() => new Map(biens.map((b) => [b.id, b])), [biens]);
  const lotById = useMemo(() => new Map(lots.map((l) => [l.id, l])), [lots]);
  const profById = useMemo(() => new Map(profiles.map((p) => [p.id, p])), [profiles]);
  const responsable = (id: string | null) => (id ? displayName(profById.get(id)?.email) : "Non assigné");

  const canWriteBase = (uid && FULL_ACCESS_USER_IDS.includes(uid)) || (role && role !== "recouvrement" && role !== "en_attente");

  const kpis = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    return {
      aTraiter: travaux.filter(needsAction).length,
      enCours: travaux.filter((t) => t.statut === "en_cours").length,
      retard: travaux.filter(isLate).length,
      aValider: travaux.filter((t) => t.statut === "a_valider").length,
      termines: travaux.filter((t) => t.statut === "termine" && (t.date_fin ?? t.date_intervention_reelle ?? t.created_at.slice(0, 10)) >= monthStart).length,
    };
  }, [travaux]);

  const resetFilters = () => {
    setSearch(""); setFStatut("all"); setFPriorite("all"); setFBien("all");
    setFCharge("all"); setFAssigne("all"); setFEcheance("all"); setATraiter(false); setPage(1);
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = travaux.filter((t) => {
      if (aTraiter && !needsAction(t)) return false;
      if (fStatut !== "all" && t.statut !== fStatut) return false;
      if (fPriorite !== "all" && t.priorite !== fPriorite) return false;
      if (fBien !== "all" && t.bien_id !== fBien) return false;
      if (fCharge !== "all" && t.charge_financiere !== fCharge) return false;
      if (fAssigne !== "all" && (fAssigne === "none" ? !!t.assigne_a : t.assigne_a !== fAssigne)) return false;
      if (fEcheance !== "all") {
        const d = echeanceDate(t);
        if (fEcheance === "retard" && !isLate(t)) return false;
        if (fEcheance === "today" && (!d || daysUntil(d) !== 0)) return false;
        if (fEcheance === "avenir" && (!d || daysUntil(d) <= 0)) return false;
      }
      if (q) {
        const hay = [
          t.reference, t.titre, t.description, t.categorie,
          bienById.get(t.bien_id)?.titre, t.lot_id ? lotById.get(t.lot_id)?.label : "",
          responsable(t.assigne_a), t.lot_id ? occupants[t.lot_id] : "",
        ].filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    return rows.sort((a, b) => {
      const w = sortWeight(a) - sortWeight(b);
      if (w !== 0) return w;
      const da = echeanceDate(a), db = echeanceDate(b);
      if (da && db && da !== db) return da < db ? -1 : 1;
      if (da && !db) return -1;
      if (!da && db) return 1;
      return b.created_at.localeCompare(a.created_at);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [travaux, search, fStatut, fPriorite, fBien, fCharge, fAssigne, fEcheance, aTraiter, biens, lots, profiles, occupants]);

  const pageRows = view === "liste" ? filtered.slice(0, page * PAGE_SIZE) : filtered;

  const kpiCard = (label: string, value: number, onClick: () => void, danger = false, icon?: React.ReactNode) => (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg border bg-background p-3 text-left transition hover:border-primary/50 hover:shadow-sm"
    >
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">{icon}{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${danger && value > 0 ? "text-destructive" : ""}`}>{value}</div>
    </button>
  );

  const bienLot = (t: Travail) => {
    const b = bienById.get(t.bien_id);
    const l = t.lot_id ? lotById.get(t.lot_id) : null;
    return { bien: b?.titre ?? "—", lot: l?.label ?? null, adresse: b?.adresse ?? null };
  };

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2"><Building2 className="h-5 w-5" /><span className="font-semibold">Agence Immobilière</span></div>
          <Button variant="outline" size="sm" asChild><Link to="/dashboard"><ArrowLeft className="mr-2 h-4 w-4" /> Tableau de bord</Link></Button>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle>Travaux</CardTitle>
              <CardDescription>Suivi des demandes, interventions et réparations sur les biens.</CardDescription>
            </div>
            {canWriteBase && <Button size="sm" onClick={() => setCreating({})}><Plus className="mr-2 h-4 w-4" /> Nouveau</Button>}
          </CardHeader>
          <CardContent>
            {/* KPI */}
            <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
              {kpiCard("À traiter", kpis.aTraiter, () => { resetFilters(); setATraiter(true); }, false, <Zap className="h-3.5 w-3.5" />)}
              {kpiCard("En cours", kpis.enCours, () => { resetFilters(); setFStatut("en_cours"); })}
              {kpiCard("En retard", kpis.retard, () => { resetFilters(); setFEcheance("retard"); }, true)}
              {kpiCard("À valider", kpis.aValider, () => { resetFilters(); setFStatut("a_valider"); })}
              {kpiCard("Terminés ce mois", kpis.termines, () => { resetFilters(); setFStatut("termine"); })}
            </div>

            {/* Recherche + filtres */}
            <div className="mb-4 space-y-2 rounded-md border bg-muted/20 p-3">
              <div className="relative w-full sm:max-w-md">
                <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="h-9 pl-8"
                  placeholder="Rechercher un travail, un bien, un lot ou un responsable..."
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Select value={fStatut} onValueChange={(v) => { setFStatut(v); setPage(1); }}>
                  <SelectTrigger className="h-9 w-40"><SelectValue placeholder="Statut" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Statut : tous</SelectItem>
                    {TRAVAUX_STATUTS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={fPriorite} onValueChange={(v) => { setFPriorite(v); setPage(1); }}>
                  <SelectTrigger className="h-9 w-40"><SelectValue placeholder="Priorité" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Priorité : toutes</SelectItem>
                    {PRIORITES.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={fBien} onValueChange={(v) => { setFBien(v); setPage(1); }}>
                  <SelectTrigger className="h-9 w-52"><SelectValue placeholder="Bien" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Bien : tous</SelectItem>
                    {biens.map((b) => <SelectItem key={b.id} value={b.id}>{b.titre}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={fCharge} onValueChange={(v) => { setFCharge(v); setPage(1); }}>
                  <SelectTrigger className="h-9 w-44"><SelectValue placeholder="À la charge de" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">À la charge de : tous</SelectItem>
                    {CHARGES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={fAssigne} onValueChange={(v) => { setFAssigne(v); setPage(1); }}>
                  <SelectTrigger className="h-9 w-48"><SelectValue placeholder="Assigné à" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Assigné à : tous</SelectItem>
                    <SelectItem value="none">Non assigné</SelectItem>
                    {profiles.map((p) => <SelectItem key={p.id} value={p.id}>{displayName(p.email)}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={fEcheance} onValueChange={(v) => { setFEcheance(v); setPage(1); }}>
                  <SelectTrigger className="h-9 w-40"><SelectValue placeholder="Échéance" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Échéance : toutes</SelectItem>
                    <SelectItem value="today">Aujourd'hui</SelectItem>
                    <SelectItem value="avenir">À venir</SelectItem>
                    <SelectItem value="retard">En retard</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="ghost" size="sm" className="h-9" onClick={resetFilters}>
                  <X className="mr-1 h-4 w-4" /> Réinitialiser les filtres
                </Button>
              </div>
            </div>

            {/* Vues */}
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <Button size="sm" variant={aTraiter ? "default" : "outline"} onClick={() => { setATraiter((v) => !v); setPage(1); }}>
                <Zap className="mr-2 h-4 w-4" /> À traiter
              </Button>
              <div className="flex items-center gap-1 rounded-md border p-0.5">
                <Button size="sm" variant={view === "liste" ? "secondary" : "ghost"} className="h-8" onClick={() => setView("liste")}>
                  <LayoutList className="mr-1.5 h-4 w-4" /> Liste
                </Button>
                <Button size="sm" variant={view === "kanban" ? "secondary" : "ghost"} className="h-8" onClick={() => setView("kanban")}>
                  <LayoutGrid className="mr-1.5 h-4 w-4" /> Kanban
                </Button>
              </div>
            </div>

            {loading ? (
              <p className="text-sm text-muted-foreground">Chargement...</p>
            ) : filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun travail ne correspond à ces critères.</p>
            ) : view === "kanban" ? (
              <KanbanView rows={filtered} bienLot={bienLot} responsable={responsable} onOpen={setDetail} />
            ) : (
              <>
                {/* Table desktop */}
                <div className="hidden overflow-x-auto md:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Travail</TableHead>
                        <TableHead>Bien / Lot</TableHead>
                        <TableHead>Priorité</TableHead>
                        <TableHead>Échéance</TableHead>
                        <TableHead>Responsable</TableHead>
                        <TableHead>À la charge de</TableHead>
                        <TableHead>Statut</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pageRows.map((t) => {
                        const bl = bienLot(t);
                        const ech = echeanceInfo(echeanceDate(t));
                        return (
                          <TableRow key={t.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setDetail(t)}>
                            <TableCell>
                              <div className="font-medium">{t.titre}</div>
                              <div className="text-xs text-muted-foreground">{t.reference ?? "—"}</div>
                            </TableCell>
                            <TableCell>
                              <div className="text-sm">{bl.bien}</div>
                              {bl.lot && <div className="text-xs text-muted-foreground">{bl.lot}</div>}
                            </TableCell>
                            <TableCell><Badge className={PRIORITE_CLASS[t.priorite] ?? ""}>{PRIORITE_LABEL[t.priorite] ?? t.priorite}</Badge></TableCell>
                            <TableCell className="text-sm">
                              {ech ? (
                                <span className={ech.late ? "font-medium text-destructive" : ech.today ? "font-medium text-orange-600" : ""}>{ech.label}</span>
                              ) : <span className="text-muted-foreground">—</span>}
                            </TableCell>
                            <TableCell className="text-sm">{responsable(t.assigne_a)}</TableCell>
                            <TableCell className="text-sm">{t.charge_financiere ? CHARGE_LABEL[t.charge_financiere] ?? t.charge_financiere : "—"}</TableCell>
                            <TableCell><Badge className={STATUT_CLASS[t.statut] ?? ""}>{STATUT_LABEL[t.statut] ?? t.statut}</Badge></TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
                {/* Cartes mobile */}
                <div className="space-y-2 md:hidden">
                  {pageRows.map((t) => {
                    const bl = bienLot(t);
                    const ech = echeanceInfo(echeanceDate(t));
                    return (
                      <button key={t.id} type="button" onClick={() => setDetail(t)} className="w-full rounded-lg border bg-background p-3 text-left">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="font-medium">{t.titre}</div>
                            <div className="text-xs text-muted-foreground">{t.reference ?? ""} · {bl.bien}{bl.lot ? ` — ${bl.lot}` : ""}</div>
                          </div>
                          <Badge className={PRIORITE_CLASS[t.priorite] ?? ""}>{PRIORITE_LABEL[t.priorite] ?? t.priorite}</Badge>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                          <Badge className={STATUT_CLASS[t.statut] ?? ""}>{STATUT_LABEL[t.statut] ?? t.statut}</Badge>
                          {ech && <span className={ech.late ? "text-destructive font-medium" : ""}>{ech.label}</span>}
                          <span className="text-muted-foreground">{responsable(t.assigne_a)}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
                {pageRows.length < filtered.length && (
                  <div className="mt-3 flex justify-center">
                    <Button variant="outline" size="sm" onClick={() => setPage((p) => p + 1)}>
                      Afficher plus ({filtered.length - pageRows.length} restants)
                    </Button>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {detail && (
          <DetailDialog
            travail={detail}
            uid={uid} role={role} email={email}
            biens={biens} lots={lots} profiles={profiles} reclams={reclams} edls={edls}
            occupant={detail.lot_id ? occupants[detail.lot_id] ?? null : null}
            onClose={() => setDetail(null)}
            onEdit={() => { setEditing(detail); setDetail(null); }}
            onDeleted={() => { setDetail(null); load(); }}
            onStatusChanged={(updated) => { setDetail(updated); setTravaux((prev) => prev.map((x) => (x.id === updated.id ? updated : x))); }}
          />
        )}

        {(creating || editing) && (
          <EditDialog
            initial={editing} prefill={creating || undefined}
            uid={uid} role={role} biens={biens} lots={lots} profiles={profiles} reclams={reclams}
            onClose={() => { setCreating(false); setEditing(null); }}
            onSaved={() => { setCreating(false); setEditing(null); load(); }}
          />
        )}
      </main>
    </div>
  );
}

/* ---------------- Kanban ---------------- */

function KanbanView({ rows, bienLot, responsable, onOpen }: {
  rows: Travail[];
  bienLot: (t: Travail) => { bien: string; lot: string | null; adresse: string | null };
  responsable: (id: string | null) => string;
  onOpen: (t: Travail) => void;
}) {
  const others = rows.filter((t) => !KANBAN_COLS.includes(t.statut));
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {KANBAN_COLS.map((col) => {
          const list = rows.filter((t) => t.statut === col);
          return (
            <div key={col} className="rounded-lg border bg-muted/20 p-2">
              <div className="mb-2 flex items-center justify-between px-1">
                <span className="text-xs font-semibold">{STATUT_LABEL[col]}</span>
                <span className="text-xs text-muted-foreground">{list.length}</span>
              </div>
              <div className="space-y-2">
                {list.map((t) => <KanbanCard key={t.id} t={t} bienLot={bienLot} responsable={responsable} onOpen={onOpen} />)}
                {list.length === 0 && <p className="px-1 py-2 text-xs text-muted-foreground">—</p>}
              </div>
            </div>
          );
        })}
      </div>
      {others.length > 0 && (
        <div>
          <div className="mb-2 text-xs font-semibold text-muted-foreground">Refusés / Annulés ({others.length})</div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {others.map((t) => <KanbanCard key={t.id} t={t} bienLot={bienLot} responsable={responsable} onOpen={onOpen} />)}
          </div>
        </div>
      )}
    </div>
  );
}

function KanbanCard({ t, bienLot, responsable, onOpen }: {
  t: Travail;
  bienLot: (t: Travail) => { bien: string; lot: string | null; adresse: string | null };
  responsable: (id: string | null) => string;
  onOpen: (t: Travail) => void;
}) {
  const bl = bienLot(t);
  const ech = echeanceInfo(echeanceDate(t));
  return (
    <button type="button" onClick={() => onOpen(t)} className="w-full rounded-md border bg-background p-2.5 text-left transition hover:border-primary/50 hover:shadow-sm">
      <Badge className={`${PRIORITE_CLASS[t.priorite] ?? ""} mb-1.5`}>{PRIORITE_LABEL[t.priorite] ?? t.priorite}</Badge>
      <div className="text-sm font-medium leading-tight">{t.titre}</div>
      <div className="mt-0.5 text-[11px] text-muted-foreground">{t.reference ?? ""}</div>
      <div className="mt-1 text-xs">{bl.bien}{bl.lot ? ` — ${bl.lot}` : ""}</div>
      <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><User className="h-3 w-3" />{responsable(t.assigne_a)}</div>
      {ech && (
        <div className={`mt-0.5 flex items-center gap-1 text-xs ${ech.late ? "font-medium text-destructive" : "text-muted-foreground"}`}>
          <CalendarClock className="h-3 w-3" />{ech.label}
        </div>
      )}
      {t.charge_financiere && (
        <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground"><Coins className="h-3 w-3" />{CHARGE_LABEL[t.charge_financiere] ?? t.charge_financiere}</div>
      )}
    </button>
  );
}

/* ---------------- Fiche détail ---------------- */

type HistoryRow = {
  id: string; champ_modifie: string; ancienne_valeur: string | null;
  nouvelle_valeur: string | null; auteur: string | null; created_at: string;
};

const CHAMP_TRAVAUX_LABEL: Record<string, string> = {
  creation: "Création",
  statut: "Statut",
  motif_refus: "Motif de refus",
  priorite: "Priorité",
  assigne_a: "Responsable",
  date_echeance: "Échéance",
};

function DetailDialog({ travail, uid, role, email, biens, lots, profiles, reclams, edls, occupant, onClose, onEdit, onDeleted, onStatusChanged }: {
  travail: Travail; uid: string; role: string; email: string;
  biens: Bien[]; lots: Lot[]; profiles: Profile[]; reclams: Reclam[]; edls: Edl[];
  occupant: string | null;
  onClose: () => void; onEdit: () => void; onDeleted: () => void;
  onStatusChanged: (updated: Travail) => void;
}) {
  const isChristelle = email.toLowerCase() === CHRISTELLE_EMAIL;
  const basePerms = computePerms(role, travail.created_by, uid);
  const isAssignee = !!uid && travail.assigne_a === uid;
  const perms = isChristelle || isAssignee
    ? { ...basePerms, canRead: true, canComment: true, canEditFull: true, canEditLimited: false, canDelete: isChristelle || basePerms.canDelete }
    : basePerms;
  const canAct = perms.canEditFull || perms.canEditLimited;

  const bien = biens.find((b) => b.id === travail.bien_id);
  const lot = travail.lot_id ? lots.find((l) => l.id === travail.lot_id) : null;
  const assigne = travail.assigne_a ? profiles.find((p) => p.id === travail.assigne_a) : null;
  const reclam = travail.reclamation_id ? reclams.find((r) => r.id === travail.reclamation_id) : null;
  const edl = travail.etat_des_lieux_id ? edls.find((e) => e.id === travail.etat_des_lieux_id) : null;
  const ech = echeanceInfo(echeanceDate(travail));

  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [authors, setAuthors] = useState<Map<string, string>>(new Map());
  const [busy, setBusy] = useState(false);
  const [refuseOpen, setRefuseOpen] = useState(false);
  const [motif, setMotif] = useState("");
  const [motifAutre, setMotifAutre] = useState("");
  const [refCheque, setRefCheque] = useState(travail.reference_cheque ?? "");
  const [savingRef, setSavingRef] = useState(false);
  const [linkRec, setLinkRec] = useState(travail.reclamation_id ?? "");

  useEffect(() => { setRefCheque(travail.reference_cheque ?? ""); setLinkRec(travail.reclamation_id ?? ""); }, [travail.id, travail.reference_cheque, travail.reclamation_id]);

  const canSubmit =
    (travail.statut === "a_qualifier" || travail.statut === "planifie") &&
    travail.budget_prevu != null &&
    (role === "technique" || role === "technico_commercial" || role === "admin" || role === "direction");
  const canDecide = travail.statut === "a_valider" && role === "direction";

  const loadHistory = async () => {
    const { data } = await supabase
      .from("travaux_historique" as never)
      .select("id, champ_modifie, ancienne_valeur, nouvelle_valeur, auteur, created_at")
      .eq("travaux_id", travail.id)
      .order("created_at", { ascending: false });
    const rows = (data ?? []) as unknown as HistoryRow[];
    setHistory(rows);
    const ids = Array.from(new Set([...rows.map((r) => r.auteur), ...rows.map((r) => r.nouvelle_valeur), ...rows.map((r) => r.ancienne_valeur)]
      .filter((v): v is string => !!v && /^[0-9a-f-]{36}$/i.test(v))));
    if (ids.length) {
      const { data: profs } = await supabase.from("profiles").select("id, email").in("id", ids);
      setAuthors(new Map(((profs ?? []) as { id: string; email: string | null }[]).map((p) => [p.id, displayName(p.email)])));
    } else setAuthors(new Map());
  };
  useEffect(() => { loadHistory(); }, [travail.id]);

  const patchTravail = async (patch: Record<string, unknown>, successMsg: string) => {
    setBusy(true);
    const { data, error } = await (supabase.from("travaux") as any).update(patch).eq("id", travail.id).select().maybeSingle();
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(successMsg);
    if (data) onStatusChanged(data as Travail);
    await loadHistory();
  };

  const handleDelete = async () => {
    if (!confirm("Supprimer ces travaux ?")) return;
    const { error } = await supabase.from("travaux").delete().eq("id", travail.id);
    if (error) return toast.error(error.message);
    toast.success("Supprimé"); onDeleted();
  };

  const saveRefCheque = async () => {
    setSavingRef(true);
    const { data, error } = await (supabase.from("travaux") as any)
      .update({ reference_cheque: refCheque.trim() || null }).eq("id", travail.id).select().maybeSingle();
    setSavingRef(false);
    if (error) return toast.error(error.message);
    toast.success("Référence chèque enregistrée");
    if (data) onStatusChanged(data as Travail);
  };

  const handleSubmit = async () => {
    if (!travail.budget_prevu) return toast.error("Budget prévu requis");
    const { data: directions } = await supabase.from("profiles").select("id").eq("role", "direction").limit(1);
    const assignee = (directions ?? [])[0]?.id ?? null;
    await patchTravail({ statut: "a_valider" }, "Soumis pour validation");
    const { data: userRes } = await supabase.auth.getUser();
    await supabase.from("activites").insert({
      titre: `Validation devis – ${travail.titre} – ${bien?.titre ?? "—"} – ${fmtMoney(travail.budget_prevu)}`,
      type_activite: "tache",
      date_debut: new Date().toISOString(),
      priorite: "urgente",
      statut: "a_faire",
      assigne_a: assignee,
      created_by: userRes.user?.id ?? null,
      travaux_id: travail.id,
    } as never);
  };

  const changeStatut = async (v: string) => {
    if (v === "refuse") { setRefuseOpen(true); return; }
    await patchTravail({ statut: v, ...(v === "termine" && !travail.date_fin ? { date_fin: todayISO() } : {}) }, "Statut mis à jour");
  };

  const confirmRefus = async () => {
    const finalMotif = motif === "Autre" ? motifAutre.trim() : motif;
    if (!finalMotif) return toast.error("Le motif du refus est obligatoire");
    await patchTravail({ statut: "refuse", motif_refus: finalMotif }, "Travail refusé");
    setRefuseOpen(false); setMotif(""); setMotifAutre("");
  };

  const histValue = (v: string | null) => (v && authors.get(v)) || (v ? STATUT_LABEL[v] ?? PRIORITE_LABEL[v] ?? v : "—");

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Wrench className="h-5 w-5" /> {travail.titre}</DialogTitle>
          <DialogDescription>{travail.reference ?? "—"}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className={PRIORITE_CLASS[travail.priorite] ?? ""}>{PRIORITE_LABEL[travail.priorite] ?? travail.priorite}</Badge>
            <Badge className={STATUT_CLASS[travail.statut] ?? ""}>{STATUT_LABEL[travail.statut] ?? travail.statut}</Badge>
            {ech && <Badge variant="outline" className={ech.late ? "border-destructive text-destructive" : ""}>{ech.label}</Badge>}
            {travail.origine && <Badge variant="outline">Origine : {travail.origine}</Badge>}
          </div>

          {/* Actions rapides */}
          {canAct && (
            <div className="grid gap-2 rounded-md border bg-muted/10 p-3 sm:grid-cols-3">
              <div className="grid gap-1">
                <Label className="text-xs text-muted-foreground">Statut</Label>
                <Select value={travail.statut} onValueChange={changeStatut} disabled={busy}>
                  <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>{TRAVAUX_STATUTS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid gap-1">
                <Label className="text-xs text-muted-foreground">Priorité</Label>
                <Select value={travail.priorite} onValueChange={(v) => patchTravail({ priorite: v }, "Priorité mise à jour")} disabled={busy}>
                  <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>{PRIORITES.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid gap-1">
                <Label className="text-xs text-muted-foreground">Assigner</Label>
                <Select value={travail.assigne_a ?? "none"} onValueChange={(v) => patchTravail({ assigne_a: v === "none" ? null : v }, "Assignation mise à jour")} disabled={busy}>
                  <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Non assigné</SelectItem>
                    {profiles.map((p) => <SelectItem key={p.id} value={p.id}>{displayName(p.email)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1">
                <Label className="text-xs text-muted-foreground">Échéance</Label>
                <Input type="date" className="h-8" defaultValue={travail.date_echeance ?? ""}
                  onChange={(e) => patchTravail({ date_echeance: e.target.value || null }, "Échéance mise à jour")} />
              </div>
              <div className="grid gap-1">
                <Label className="text-xs text-muted-foreground">Planifier (intervention)</Label>
                <Input type="date" className="h-8" defaultValue={travail.date_intervention_prevue ?? ""}
                  onChange={(e) => patchTravail({ date_intervention_prevue: e.target.value || null, statut: travail.statut === "valide" ? "planifie" : travail.statut }, "Intervention planifiée")} />
              </div>
              {travail.statut !== "termine" && (
                <div className="flex items-end">
                  <Button size="sm" className="w-full" disabled={busy} onClick={() => changeStatut("termine")}>Terminer</Button>
                </div>
              )}
            </div>
          )}

          {refuseOpen && (
            <div className="space-y-2 rounded-md border border-destructive/30 bg-destructive/5 p-3">
              <Label>Motif du refus *</Label>
              <Select value={motif} onValueChange={setMotif}>
                <SelectTrigger><SelectValue placeholder="Sélectionner un motif..." /></SelectTrigger>
                <SelectContent>{MOTIFS_REFUS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
              </Select>
              {motif === "Autre" && <Textarea rows={2} value={motifAutre} onChange={(e) => setMotifAutre(e.target.value)} placeholder="Précisez le motif" />}
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="outline" onClick={() => { setRefuseOpen(false); setMotif(""); setMotifAutre(""); }}>Annuler</Button>
                <Button size="sm" variant="destructive" onClick={confirmRefus} disabled={busy}>Confirmer le refus</Button>
              </div>
            </div>
          )}

          {/* Informations générales */}
          <section className="rounded-md border p-3">
            <h4 className="mb-2 text-sm font-semibold">Informations générales</h4>
            <div className="grid grid-cols-2 gap-2">
              <div><span className="text-muted-foreground">Référence : </span>{travail.reference ?? "—"}</div>
              <div><span className="text-muted-foreground">Catégorie : </span>{travail.categorie || "—"}</div>
              <div><span className="text-muted-foreground">Créé le : </span>{fmtDate(travail.created_at.slice(0, 10))}</div>
              <div><span className="text-muted-foreground">Échéance : </span>{fmtDate(travail.date_echeance)}</div>
              <div><span className="text-muted-foreground">Début : </span>{fmtDate(travail.date_debut)}</div>
              <div><span className="text-muted-foreground">Date de fin : </span>{fmtDate(travail.date_fin)}</div>
            </div>
          </section>

          {/* Bien concerné */}
          <section className="rounded-md border p-3">
            <h4 className="mb-2 text-sm font-semibold">Bien concerné</h4>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className="text-muted-foreground">Bien : </span>
                {bien ? <Link to="/biens/$bienId" params={{ bienId: bien.id }} className="text-primary underline-offset-2 hover:underline">{bien.titre}</Link> : "—"}
              </div>
              <div><span className="text-muted-foreground">Lot : </span>{lot?.label ?? "—"}</div>
              <div className="col-span-2"><span className="text-muted-foreground">Adresse : </span>{bien?.adresse || "—"}</div>
            </div>
          </section>

          {/* Responsabilité */}
          <section className="rounded-md border p-3">
            <h4 className="mb-2 text-sm font-semibold">Responsabilité</h4>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className="text-muted-foreground">Responsable : </span>{displayName(assigne?.email)}
                {assigne?.email && <div className="text-xs text-muted-foreground">{assigne.email}</div>}
              </div>
              <div><span className="text-muted-foreground">À la charge de : </span>{travail.charge_financiere ? CHARGE_LABEL[travail.charge_financiere] ?? travail.charge_financiere : "—"}</div>
              <div><span className="text-muted-foreground">Occupant concerné : </span>{occupant || "—"}</div>
            </div>
          </section>

          {/* Description */}
          {travail.description && (
            <section className="rounded-md border p-3">
              <h4 className="mb-1 text-sm font-semibold">Description</h4>
              <p className="whitespace-pre-wrap">{travail.description}</p>
            </section>
          )}

          {/* Intervention */}
          <section className="rounded-md border p-3">
            <h4 className="mb-2 text-sm font-semibold">Intervention</h4>
            <div className="grid grid-cols-2 gap-2">
              <div><span className="text-muted-foreground">Date prévue : </span>{fmtDate(travail.date_intervention_prevue)}</div>
              <div><span className="text-muted-foreground">Heure : </span>{travail.heure_intervention || "—"}</div>
              <div><span className="text-muted-foreground">Date réelle : </span>{fmtDate(travail.date_intervention_reelle)}</div>
              <div><span className="text-muted-foreground">Coût estimé : </span>{fmtMoney(travail.budget_prevu)}</div>
              <div><span className="text-muted-foreground">Coût réel : </span>{fmtMoney(travail.budget_depense)}</div>
            </div>
            {travail.commentaire_intervention && <p className="mt-2 whitespace-pre-wrap text-sm">{travail.commentaire_intervention}</p>}
            <div className="mt-3 space-y-2 border-t pt-2">
              <Label className="text-xs text-muted-foreground">Référence chèque</Label>
              {canAct ? (
                <div className="flex gap-2">
                  <Input value={refCheque} onChange={(e) => setRefCheque(e.target.value)} placeholder="N° ou référence du chèque" />
                  <Button size="sm" onClick={saveRefCheque} disabled={savingRef || refCheque === (travail.reference_cheque ?? "")}>
                    {savingRef ? "..." : "Enregistrer"}
                  </Button>
                </div>
              ) : <div>{travail.reference_cheque || "—"}</div>}
            </div>
          </section>

          {travail.statut === "refuse" && travail.motif_refus && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
              <div className="mb-1 text-xs font-semibold text-destructive">Motif de refus</div>
              <div className="whitespace-pre-wrap">{travail.motif_refus}</div>
            </div>
          )}
          {travail.notes && <div className="whitespace-pre-wrap rounded bg-muted/40 p-2 text-xs">{travail.notes}</div>}

          {/* Liens */}
          <section className="rounded-md border p-3">
            <h4 className="mb-2 text-sm font-semibold">Réclamation associée</h4>
            {reclam ? (
              <Link to="/reclamations" search={{ open: reclam.id }} className="text-primary underline-offset-2 hover:underline">
                {reclam.reference ? `${reclam.reference} — ` : ""}{reclam.titre}
              </Link>
            ) : <p className="text-xs text-muted-foreground">Aucune réclamation liée.</p>}
            {canAct && (
              <div className="mt-2 flex gap-2">
                <Select value={linkRec || "none"} onValueChange={setLinkRec}>
                  <SelectTrigger className="h-8"><SelectValue placeholder="Associer une réclamation..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Aucune</SelectItem>
                    {reclams.filter((r) => r.bien_id === travail.bien_id).map((r) => (
                      <SelectItem key={r.id} value={r.id}>{r.reference ? `${r.reference} — ` : ""}{r.titre}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button size="sm" disabled={busy || (linkRec || "none") === (travail.reclamation_id ?? "none")}
                  onClick={() => patchTravail({ reclamation_id: linkRec === "none" ? null : linkRec }, "Réclamation associée")}>
                  Associer
                </Button>
              </div>
            )}
            {edl && (
              <div className="mt-3 border-t pt-2">
                <h4 className="mb-1 text-sm font-semibold">État des lieux associé</h4>
                <Link to="/etats-des-lieux" className="text-primary underline-offset-2 hover:underline">
                  État des lieux {edl.type} — {fmtDate(edl.date_realisation)}
                </Link>
              </div>
            )}
          </section>

          {/* Documents */}
          <div className="border-t pt-3">
            <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold"><FileText className="h-4 w-4" /> Documents</h4>
            <DocumentsSection
              bucket="travaux-documents" recordId={travail.id} canWrite={canAct}
              description="Devis, factures, photos avant/après, rapports (PDF)."
            />
          </div>

          {/* Historique */}
          <div className="border-t pt-3">
            <h4 className="mb-2 text-sm font-semibold">Historique</h4>
            {history.length === 0 ? (
              <p className="text-xs text-muted-foreground">Aucun changement enregistré.</p>
            ) : (
              <ol className="relative space-y-2 border-l pl-4">
                {history.map((h) => (
                  <li key={h.id} className="text-xs">
                    <span className="absolute -left-[5px] mt-1.5 h-2 w-2 rounded-full bg-primary" />
                    <div className="text-muted-foreground">
                      {new Date(h.created_at).toLocaleString("fr-FR")} — {h.auteur ? authors.get(h.auteur) ?? "—" : "—"}
                    </div>
                    <div>
                      <span className="font-medium">{CHAMP_TRAVAUX_LABEL[h.champ_modifie] ?? h.champ_modifie}</span>
                      {h.champ_modifie === "creation" ? (
                        <>{" : "}{STATUT_LABEL[h.nouvelle_valeur ?? ""] ?? h.nouvelle_valeur}</>
                      ) : (
                        <>{" : "}<span className="text-muted-foreground">{histValue(h.ancienne_valeur)}</span> → <span className="font-medium">{histValue(h.nouvelle_valeur)}</span></>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>

          <div className="border-t pt-3">
            <CommentSection
              table="travaux_commentaires" fkColumn="travaux_id" recordId={travail.id}
              canComment={perms.canComment || isChristelle} entityType="travaux" entityId={travail.id}
              link={`/travaux?open=${travail.id}`} entityTitle={travail.titre}
            />
          </div>
        </div>
        <DialogFooter className="gap-2">
          {canSubmit && <Button size="sm" variant="secondary" onClick={handleSubmit} disabled={busy}>Soumettre pour validation</Button>}
          {canDecide && <Button size="sm" onClick={() => patchTravail({ statut: "valide", motif_refus: null }, "Devis validé")} disabled={busy}>Valider</Button>}
          {canDecide && <Button size="sm" variant="destructive" onClick={() => setRefuseOpen(true)} disabled={busy}>Refuser</Button>}
          {perms.canDelete && <Button variant="destructive" size="sm" onClick={handleDelete}><Trash2 className="mr-2 h-4 w-4" /> Supprimer</Button>}
          {canAct && <Button size="sm" onClick={onEdit}><Pencil className="mr-2 h-4 w-4" /> Modifier</Button>}
          <Button variant="outline" size="sm" onClick={onClose}>Fermer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- Création / édition ---------------- */

function EditDialog({ initial, prefill, uid, role, biens, lots, profiles, reclams, onClose, onSaved }: {
  initial: Travail | null; prefill?: Prefill; uid: string; role: string;
  biens: Bien[]; lots: Lot[]; profiles: Profile[]; reclams: Reclam[];
  onClose: () => void; onSaved: () => void;
}) {
  const isEdit = !!initial;
  const basePerms = computePerms(role, initial?.created_by ?? uid, uid);
  const perms = initial && uid && initial.assigne_a === uid
    ? { ...basePerms, canEditFull: true, canEditLimited: false }
    : basePerms;
  const limited = isEdit && perms.canEditLimited && !perms.canEditFull;
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(() => ({
    bien_id: initial?.bien_id ?? prefill?.bien_id ?? "",
    lot_id: initial?.lot_id ?? "",
    titre: initial?.titre ?? prefill?.titre ?? "",
    description: initial?.description ?? "",
    categorie: initial?.categorie ?? "",
    priorite: initial?.priorite ?? "normale",
    budget_prevu: initial?.budget_prevu != null ? String(initial.budget_prevu) : "",
    budget_depense: initial ? String(initial.budget_depense ?? 0) : "0",
    statut: initial?.statut ?? "a_qualifier",
    date_debut: initial?.date_debut ?? "",
    date_fin: initial?.date_fin ?? "",
    date_echeance: initial?.date_echeance ?? "",
    date_intervention_prevue: initial?.date_intervention_prevue ?? "",
    heure_intervention: initial?.heure_intervention ?? "",
    date_intervention_reelle: initial?.date_intervention_reelle ?? "",
    commentaire_intervention: initial?.commentaire_intervention ?? "",
    assigne_a: initial?.assigne_a ?? "",
    charge_financiere: initial?.charge_financiere ?? "",
    reference_cheque: initial?.reference_cheque ?? "",
    reclamation_id: initial?.reclamation_id ?? prefill?.reclamation_id ?? "",
    motif_refus: initial?.motif_refus ?? "",
  }));

  const lotsDuBien = lots.filter((l) => l.bien_id === form.bien_id);
  const recsDuBien = reclams.filter((r) => r.bien_id === form.bien_id);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.bien_id || !form.titre) return toast.error("Bien et titre obligatoires");
    if (!form.charge_financiere) return toast.error("Le champ « À la charge de » est obligatoire");
    if (form.statut === "refuse" && !form.motif_refus.trim()) return toast.error("Le motif du refus est obligatoire");
    setSaving(true);
    const full = {
      bien_id: form.bien_id,
      lot_id: form.lot_id || null,
      titre: form.titre.trim(),
      description: form.description.trim() || null,
      categorie: form.categorie.trim() || null,
      priorite: form.priorite,
      statut: form.statut,
      assigne_a: form.assigne_a || null,
      charge_financiere: form.charge_financiere,
      date_debut: form.date_debut || null,
      date_fin: form.date_fin || null,
      date_echeance: form.date_echeance || null,
      date_intervention_prevue: form.date_intervention_prevue || null,
      heure_intervention: form.heure_intervention.trim() || null,
      date_intervention_reelle: form.date_intervention_reelle || null,
      commentaire_intervention: form.commentaire_intervention.trim() || null,
      budget_prevu: form.budget_prevu ? Number(form.budget_prevu) : null,
      budget_depense: form.budget_depense ? Number(form.budget_depense) : 0,
      reference_cheque: form.reference_cheque.trim() || null,
      reclamation_id: form.reclamation_id || null,
      motif_refus: form.statut === "refuse" ? form.motif_refus.trim() : (initial?.motif_refus ?? null),
    };
    if (isEdit) {
      const patch: Record<string, any> = limited
        ? {
            statut: full.statut, priorite: full.priorite, assigne_a: full.assigne_a,
            charge_financiere: full.charge_financiere, date_debut: full.date_debut, date_fin: full.date_fin,
            date_echeance: full.date_echeance, date_intervention_prevue: full.date_intervention_prevue,
            heure_intervention: full.heure_intervention, date_intervention_reelle: full.date_intervention_reelle,
            commentaire_intervention: full.commentaire_intervention,
            budget_prevu: full.budget_prevu, budget_depense: full.budget_depense,
            reference_cheque: full.reference_cheque, motif_refus: full.motif_refus,
          }
        : full;
      const { error } = await (supabase.from("travaux") as any).update(patch).eq("id", initial!.id);
      setSaving(false);
      if (error) return toast.error(error.message);
      toast.success("Modifié"); onSaved();
    } else {
      const { error } = await (supabase.from("travaux") as any).insert({
        ...full, origine: prefill?.origine || null, created_by: uid,
      });
      setSaving(false);
      if (error) return toast.error(error.message);
      toast.success("Créé"); onSaved();
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>{isEdit ? "Modifier le travail" : "Nouveau travail"}</DialogTitle>
            <DialogDescription>{limited ? "Profil technique : statut, priorité, assignation, dates, intervention et budget uniquement." : "Renseignez les informations de l'intervention."}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-2"><Label>Bien *</Label>
                <Select value={form.bien_id} onValueChange={(v) => setForm({ ...form, bien_id: v, lot_id: "" })} disabled={limited}>
                  <SelectTrigger><SelectValue placeholder="Sélectionner..." /></SelectTrigger>
                  <SelectContent>{biens.map((b) => <SelectItem key={b.id} value={b.id}>{b.titre}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid gap-2"><Label>Lot</Label>
                <Select value={form.lot_id || "none"} onValueChange={(v) => setForm({ ...form, lot_id: v === "none" ? "" : v })} disabled={limited || !form.bien_id}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">—</SelectItem>
                    {lotsDuBien.map((l) => <SelectItem key={l.id} value={l.id}>{l.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-2"><Label>Titre *</Label><Input required value={form.titre} onChange={(e) => setForm({ ...form, titre: e.target.value })} disabled={limited} /></div>
            <div className="grid gap-2"><Label>Description</Label><Textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} disabled={limited} /></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-2"><Label>Catégorie</Label><Input value={form.categorie} onChange={(e) => setForm({ ...form, categorie: e.target.value })} placeholder="Plomberie, électricité..." disabled={limited} /></div>
              <div className="grid gap-2"><Label>Priorité</Label>
                <Select value={form.priorite} onValueChange={(v) => setForm({ ...form, priorite: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{PRIORITES.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-2"><Label>Assigné à</Label>
                <Select value={form.assigne_a || "none"} onValueChange={(v) => setForm({ ...form, assigne_a: v === "none" ? "" : v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="none">Non assigné</SelectItem>{profiles.map((p) => <SelectItem key={p.id} value={p.id}>{displayName(p.email)}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid gap-2"><Label>À la charge de *</Label>
                <Select value={form.charge_financiere} onValueChange={(v) => setForm({ ...form, charge_financiere: v })}>
                  <SelectTrigger><SelectValue placeholder="Sélectionner..." /></SelectTrigger>
                  <SelectContent>{CHARGES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="grid gap-2"><Label>Échéance</Label><Input type="date" value={form.date_echeance} onChange={(e) => setForm({ ...form, date_echeance: e.target.value })} /></div>
              <div className="grid gap-2"><Label>Début</Label><Input type="date" value={form.date_debut} onChange={(e) => setForm({ ...form, date_debut: e.target.value })} /></div>
              <div className="grid gap-2"><Label>Date de fin</Label><Input type="date" value={form.date_fin} onChange={(e) => setForm({ ...form, date_fin: e.target.value })} /></div>
            </div>
            <div className="rounded-md border p-3">
              <div className="mb-2 text-sm font-semibold">Intervention</div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="grid gap-2"><Label>Date prévue</Label><Input type="date" value={form.date_intervention_prevue} onChange={(e) => setForm({ ...form, date_intervention_prevue: e.target.value })} /></div>
                <div className="grid gap-2"><Label>Heure</Label><Input type="time" value={form.heure_intervention} onChange={(e) => setForm({ ...form, heure_intervention: e.target.value })} /></div>
                <div className="grid gap-2"><Label>Date réelle</Label><Input type="date" value={form.date_intervention_reelle} onChange={(e) => setForm({ ...form, date_intervention_reelle: e.target.value })} /></div>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className="grid gap-2"><Label>Coût estimé (budget prévu)</Label><Input type="number" min="0" step="0.01" value={form.budget_prevu} onChange={(e) => setForm({ ...form, budget_prevu: e.target.value })} /></div>
                <div className="grid gap-2"><Label>Coût réel (budget dépensé)</Label><Input type="number" min="0" step="0.01" value={form.budget_depense} onChange={(e) => setForm({ ...form, budget_depense: e.target.value })} /></div>
              </div>
              <div className="mt-3 grid gap-2"><Label>Commentaire d'intervention</Label><Textarea rows={2} value={form.commentaire_intervention} onChange={(e) => setForm({ ...form, commentaire_intervention: e.target.value })} /></div>
              <div className="mt-3 grid gap-2"><Label>Référence chèque</Label><Input value={form.reference_cheque} onChange={(e) => setForm({ ...form, reference_cheque: e.target.value })} placeholder="N° ou référence du chèque" /></div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-2"><Label>Statut</Label>
                <Select value={form.statut} onValueChange={(v) => setForm({ ...form, statut: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{TRAVAUX_STATUTS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid gap-2"><Label>Réclamation associée</Label>
                <Select value={form.reclamation_id || "none"} onValueChange={(v) => setForm({ ...form, reclamation_id: v === "none" ? "" : v })} disabled={limited}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Aucune</SelectItem>
                    {recsDuBien.map((r) => <SelectItem key={r.id} value={r.id}>{r.reference ? `${r.reference} — ` : ""}{r.titre}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {form.statut === "refuse" && (
              <div className="grid gap-2"><Label>Motif du refus *</Label>
                <Select value={MOTIFS_REFUS.includes(form.motif_refus) ? form.motif_refus : (form.motif_refus ? "Autre" : "")} onValueChange={(v) => setForm({ ...form, motif_refus: v === "Autre" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="Sélectionner un motif..." /></SelectTrigger>
                  <SelectContent>{MOTIFS_REFUS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                </Select>
                <Textarea rows={2} value={form.motif_refus} onChange={(e) => setForm({ ...form, motif_refus: e.target.value })} placeholder="Motif détaillé" />
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
