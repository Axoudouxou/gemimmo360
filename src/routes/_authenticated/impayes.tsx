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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { ImpayeDetailDialog } from "@/components/impaye-detail-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Building2, ArrowLeft, Plus } from "lucide-react";
import { toast } from "sonner";
import { Progress } from "@/components/ui/progress";
import { computeImpayeStatut, impayeProgress } from "@/lib/impaye-statut";


export const Route = createFileRoute("/_authenticated/impayes")({
  head: () => ({
    meta: [
      { title: "Impayés — Agence Immobilière" },
      { name: "description", content: "Suivi des impayés et relances." },
    ],
  }),
  validateSearch: (s: Record<string, unknown>) => ({
    open: typeof s.open === "string" ? s.open : undefined,
  }),
  component: ImpayesPage,
});

const STATUTS = [
  { value: "a_jour", label: "À jour" },
  { value: "en_retard", label: "En retard" },
  { value: "relance_envoyee", label: "Relance envoyée" },
  { value: "solde", label: "Soldés (résolus)" },
] as const;
const STATUT_LABEL: Record<string, string> = {
  a_jour: "À jour",
  en_retard: "En retard",
  relance_envoyee: "Relance envoyée",
};

const READ_BLOCKED = ["en_attente"] as const;
const WRITE_ROLES = ["admin", "direction", "recouvrement", "commercial", "gestion_locative", "juridique"] as const;

type Impaye = {
  id: string;
  contrat_id: string;
  montant_du: number;
  montant_paye: number;
  date_echeance: string;
  statut: string;
  date_derniere_relance: string | null;
  notes: string | null;
  service_en_charge?: string | null;
  etape_traitement?: string | null;
  date_mise_en_demeure?: string | null;
  date_acte_commissaire?: string | null;
  date_assignation?: string | null;
};
type Contrat = { id: string; lot_id: string; locataire_id: string | null; statut: string };
type Lot = { id: string; label: string; bien_id: string };
type Bien = { id: string; titre: string; gestionnaire_id?: string | null };
type Contact = { id: string; nom: string; prenom: string | null };
type Profile = { id: string; email: string | null };
type Histo = {
  id: string;
  impaye_id: string;
  champ_modifie: string;
  ancienne_valeur: string | null;
  nouvelle_valeur: string | null;
  created_at: string;
};


type SortKey =
  | "priorite"
  | "bien"
  | "locataire"
  | "date_echeance"
  | "montant_du"
  | "montant_paye"
  | "reste"
  | "progression"
  | "statut"
  | "date_derniere_relance"
  | "gestionnaire";

function ImpayesPage() {
  const navigate = useNavigate();
  const [role, setRole] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [impayes, setImpayes] = useState<Impaye[]>([]);
  const [contrats, setContrats] = useState<Contrat[]>([]);
  const [lots, setLots] = useState<Lot[]>([]);
  const [biens, setBiens] = useState<Bien[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [histo, setHisto] = useState<Histo[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<Impaye | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [fStatut, setFStatut] = useState("en_retard");
  const [dFrom, setDFrom] = useState("");
  const [dTo, setDTo] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("priorite");
  const [sortAsc, setSortAsc] = useState(true);

  const [fService, setFService] = useState("all");

  const [form, setForm] = useState({
    contrat_id: "",
    montant_du: "",
    montant_paye: "0",
    date_echeance: "",
    statut: "a_jour",
    date_derniere_relance: "",
    notes: "",
  });


  useEffect(() => {
    (async () => {
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes.user?.id;
      if (!uid) { setChecked(true); return; }
      const { data: profile } = await supabase.from("profiles").select("role").eq("id", uid).maybeSingle();
      const r = profile?.role ?? null;
      setRole(r);
      setChecked(true);
      if (!r || (READ_BLOCKED as readonly string[]).includes(r)) {
        toast.error("Accès refusé");
        navigate({ to: "/dashboard", replace: true });
      }
    })();
  }, [navigate]);

  const canWrite = !!role && (WRITE_ROLES as readonly string[]).includes(role);

  const load = async () => {
    setLoading(true);
    const [
      { data: iData, error },
      { data: cData },
      { data: lData },
      { data: bData },
      { data: coData },
      { data: pData },
      { data: hData },
    ] = await Promise.all([
      supabase.from("impayes").select("*").order("date_echeance", { ascending: false }),
      supabase.from("contrats").select("id, lot_id, locataire_id, statut"),
      supabase.from("lots").select("id, label, bien_id"),
      supabase.from("biens").select("id, titre, gestionnaire_id"),
      supabase.from("contacts").select("id, nom, prenom"),
      supabase.from("profiles").select("id, email"),
      supabase
        .from("impayes_historique")
        .select("id, impaye_id, champ_modifie, ancienne_valeur, nouvelle_valeur, created_at")
        .in("champ_modifie", ["montant_paye", "date_derniere_relance"])
        .order("created_at", { ascending: false })
        .limit(2000),
    ]);
    if (error) toast.error(error.message);
    else setImpayes((iData ?? []) as Impaye[]);
    setContrats((cData ?? []) as Contrat[]);
    setLots((lData ?? []) as Lot[]);
    setBiens((bData ?? []) as Bien[]);
    setContacts((coData ?? []) as Contact[]);
    setProfiles((pData ?? []) as Profile[]);
    setHisto((hData ?? []) as Histo[]);
    setLoading(false);
  };

  useEffect(() => {
    if (role && !(READ_BLOCKED as readonly string[]).includes(role)) load();
  }, [role]);

  // Auto-open detail from ?open=<id>
  const routeSearch = Route.useSearch();
  useEffect(() => {
    if (!routeSearch.open || impayes.length === 0) return;
    const found = impayes.find((i) => i.id === routeSearch.open);
    if (found) { setSelected(found); setDetailOpen(true); }
  }, [routeSearch.open, impayes]);

  const contratLabel = (id: string) => {
    const c = contrats.find((x) => x.id === id);
    if (!c) return { bien: "—", locataire: "—", gestionnaire: "—" };
    const lot = lots.find((l) => l.id === c.lot_id);
    const bienRow = lot ? biens.find((b) => b.id === lot.bien_id) : undefined;
    const bienTitre = bienRow?.titre ?? "—";
    const bien = lot ? `${bienTitre} — ${lot.label}` : bienTitre;
    const loc = c.locataire_id ? contacts.find((x) => x.id === c.locataire_id) : null;
    const locataire = loc ? `${loc.nom}${loc.prenom ? ` ${loc.prenom}` : ""}` : "—";
    const gp = bienRow?.gestionnaire_id ? profiles.find((p) => p.id === bienRow.gestionnaire_id) : null;
    const gestionnaire = gp?.email ? gp.email.split("@")[0] : "—";
    return { bien, locataire, gestionnaire };
  };

  const stats = useMemo(() => {
    const nonSolde = impayes.filter((i) => computeImpayeStatut(i).key !== "solde");
    const totalRestant = nonSolde.reduce(
      (s, i) => s + Math.max(0, Number(i.montant_du) - Number(i.montant_paye)),
      0,
    );
    let nbRetard = 0, nbPartiel = 0, nbJuridique = 0;
    for (const i of impayes) {
      const k = computeImpayeStatut(i).key;
      if (k === "retard") nbRetard++;
      else if (k === "partiel") nbPartiel++;
      else if (k === "juridique") nbJuridique++;
    }

    const today = new Date().toISOString().slice(0, 10);
    const relancesJour = histo.filter(
      (h) => h.champ_modifie === "date_derniere_relance" && h.created_at.slice(0, 10) === today,
    ).length;

    const ym = new Date().toISOString().slice(0, 7);
    const recouvreMois = histo.reduce((s, h) => {
      if (h.champ_modifie !== "montant_paye") return s;
      if (h.created_at.slice(0, 7) !== ym) return s;
      const diff = Number(h.nouvelle_valeur ?? 0) - Number(h.ancienne_valeur ?? 0);
      return diff > 0 ? s + diff : s;
    }, 0);

    return { totalRestant, nbRetard, nbPartiel, nbJuridique, relancesJour, recouvreMois };
  }, [impayes, histo]);

  const contratsActifs = contrats.filter((c) => c.statut === "actif");

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortAsc((v) => !v);
    else { setSortKey(k); setSortAsc(true); }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = impayes.filter((i) => {
      const isResolved = i.etape_traitement === "resolu";
      if (fStatut === "solde") {
        if (!isResolved) return false;
      } else if (fStatut === "all") {
        // include everything
      } else {
        if (isResolved) return false;
        if (i.statut !== fStatut) return false;
      }
      if (fService !== "all" && (i.service_en_charge ?? "recouvrement") !== fService) return false;
      if (dFrom && i.date_echeance < dFrom) return false;
      if (dTo && i.date_echeance > dTo) return false;
      if (q) {
        const { bien, locataire } = contratLabel(i.contrat_id);
        if (!`${bien} ${locataire}`.toLowerCase().includes(q)) return false;
      }
      return true;
    });

    const val = (i: Impaye): string | number => {
      const l = contratLabel(i.contrat_id);
      switch (sortKey) {
        case "bien": return l.bien.toLowerCase();
        case "locataire": return l.locataire.toLowerCase();
        case "gestionnaire": return l.gestionnaire.toLowerCase();
        case "montant_du": return Number(i.montant_du);
        case "montant_paye": return Number(i.montant_paye);
        case "reste": return Number(i.montant_du) - Number(i.montant_paye);
        case "progression": return impayeProgress(i.montant_du, i.montant_paye);
        case "statut": return computeImpayeStatut(i).label;
        case "date_derniere_relance": return i.date_derniere_relance ?? "";
        default: return i.date_echeance ?? "";
      }
    };

    const sorted = [...rows];
    if (sortKey === "priorite") {
      sorted.sort((a, b) => {
        const pa = a.etape_traitement && !["recouvrement", "resolu"].includes(a.etape_traitement) ? 0 : 1;
        const pb = b.etape_traitement && !["recouvrement", "resolu"].includes(b.etape_traitement) ? 0 : 1;
        if (pa !== pb) return pa - pb;
        return (a.date_echeance ?? "").localeCompare(b.date_echeance ?? "");
      });
      if (!sortAsc) sorted.reverse();
    } else {
      sorted.sort((a, b) => {
        const va = val(a), vb = val(b);
        const c = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb));
        return sortAsc ? c : -c;
      });
    }
    return sorted;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [impayes, search, fStatut, fService, dFrom, dTo, contrats, lots, biens, contacts, profiles, sortKey, sortAsc]);


  const resetForm = () =>
    setForm({ contrat_id: "", montant_du: "", montant_paye: "0", date_echeance: "", statut: "a_jour", date_derniere_relance: "", notes: "" });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.contrat_id) return toast.error("Le contrat est obligatoire");
    if (!form.montant_du) return toast.error("Le montant dû est obligatoire");
    if (!form.date_echeance) return toast.error("L'échéance est obligatoire");
    setSaving(true);
    const { error } = await supabase.from("impayes").insert({
      contrat_id: form.contrat_id,
      montant_du: Number(form.montant_du),
      montant_paye: form.montant_paye ? Number(form.montant_paye) : 0,
      date_echeance: form.date_echeance,
      statut: form.statut || "a_jour",
      date_derniere_relance: form.date_derniere_relance || null,
      notes: form.notes.trim() || null,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Impayé enregistré");
    setOpen(false);
    resetForm();
    load();
  };

  const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString("fr-FR") : "—");
  const fmtMoney = (n: number | null) => (n == null ? "—" : Number(n).toLocaleString("fr-FR") + " FCFA");

  const SortHead = ({ k, children }: { k: SortKey; children: React.ReactNode }) => (
    <TableHead
      className="cursor-pointer select-none whitespace-nowrap"
      onClick={() => toggleSort(k)}
    >
      {children}
      {sortKey === k ? <span className="ml-1 text-xs">{sortAsc ? "▲" : "▼"}</span> : null}
    </TableHead>
  );

  const kpis = [
    { label: "Total restant à recouvrer", value: fmtMoney(stats.totalRestant) },
    { label: "🔴 Dossiers en retard", value: stats.nbRetard },
    { label: "🟡 Paiements partiels", value: stats.nbPartiel },
    { label: "⚖️ Dossiers au juridique", value: stats.nbJuridique },
    { label: "Relances du jour", value: stats.relancesJour },
    { label: "Recouvré ce mois", value: fmtMoney(stats.recouvreMois) },
  ];

  if (!checked) return null;

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            <span className="font-semibold">Agence Immobilière</span>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link to="/dashboard">
              <ArrowLeft className="mr-2 h-4 w-4" /> Tableau de bord
            </Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-6 py-10">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {kpis.map((k) => (
            <Card key={k.label}>
              <CardHeader className="pb-2"><CardDescription>{k.label}</CardDescription></CardHeader>
              <CardContent><p className="text-2xl font-semibold">{k.value}</p></CardContent>
            </Card>
          ))}
        </div>


        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle>Impayés</CardTitle>
              <CardDescription>Suivi des échéances et relances.</CardDescription>
            </div>
            {canWrite && (
            <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) resetForm(); }}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="mr-2 h-4 w-4" /> Nouvel impayé
                </Button>
              </DialogTrigger>
              <DialogContent>
                <form onSubmit={handleCreate}>
                  <DialogHeader>
                    <DialogTitle>Nouvel impayé</DialogTitle>
                    <DialogDescription>Enregistrer un impayé sur un contrat actif.</DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                      <Label>Contrat *</Label>
                      <SearchableSelect
                        value={form.contrat_id}
                        onChange={(v) => setForm({ ...form, contrat_id: v })}
                        options={contratsActifs.map((c) => {
                          const { bien, locataire } = contratLabel(c.id);
                          return { value: c.id, label: `${bien} — ${locataire}` };
                        })}
                        placeholder={contratsActifs.length ? "Rechercher un contrat actif..." : "Aucun contrat actif"}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="grid gap-2">
                        <Label htmlFor="montant_du">Montant dû *</Label>
                        <Input id="montant_du" type="number" min="0" step="0.01" required value={form.montant_du} onChange={(e) => setForm({ ...form, montant_du: e.target.value })} />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="montant_paye">Montant payé</Label>
                        <Input id="montant_paye" type="number" min="0" step="0.01" value={form.montant_paye} onChange={(e) => setForm({ ...form, montant_paye: e.target.value })} />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="grid gap-2">
                        <Label htmlFor="date_echeance">Date d'échéance *</Label>
                        <Input id="date_echeance" type="date" required value={form.date_echeance} onChange={(e) => setForm({ ...form, date_echeance: e.target.value })} />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="date_derniere_relance">Dernière relance</Label>
                        <Input id="date_derniere_relance" type="date" value={form.date_derniere_relance} onChange={(e) => setForm({ ...form, date_derniere_relance: e.target.value })} />
                      </div>
                    </div>
                    <div className="grid gap-2">
                      <Label>Statut</Label>
                      <Select value={form.statut} onValueChange={(v) => setForm({ ...form, statut: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {STATUTS.map((s) => (
                            <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="notes">Notes</Label>
                      <Textarea id="notes" rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
                    <Button type="submit" disabled={saving}>{saving ? "Enregistrement..." : "Enregistrer"}</Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
            )}
          </CardHeader>
          <CardContent>
            <FilterBar
              search={search}
              onSearchChange={setSearch}
              searchPlaceholder="Bien ou locataire..."
              selects={[
                { key: "statut", label: "Statut", value: fStatut, onChange: setFStatut, options: STATUTS.map((s) => ({ value: s.value, label: s.label })) },
                { key: "service", label: "Service en charge", value: fService, onChange: setFService, options: [{ value: "recouvrement", label: "Recouvrement" }, { value: "juridique", label: "Juridique" }] },
              ]}
              dateRange={{ label: "Échéance", from: dFrom, to: dTo, onFromChange: setDFrom, onToChange: setDTo }}
              onReset={() => { setSearch(""); setFStatut("en_retard"); setFService("all"); setDFrom(""); setDTo(""); }}
            />
            {loading ? (
              <p className="text-sm text-muted-foreground">Chargement...</p>
            ) : filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun impayé.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <SortHead k="bien">Bien</SortHead>
                      <SortHead k="locataire">Locataire</SortHead>
                      <SortHead k="date_echeance">Échéance</SortHead>
                      <SortHead k="montant_du">Montant dû</SortHead>
                      <SortHead k="montant_paye">Montant payé</SortHead>
                      <SortHead k="reste">Reste à payer</SortHead>
                      <SortHead k="progression">Progression</SortHead>
                      <SortHead k="statut">Statut</SortHead>
                      <SortHead k="date_derniere_relance">Dernière relance</SortHead>
                      <SortHead k="gestionnaire">Gestionnaire</SortHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((i) => {
                      const { bien, locataire, gestionnaire } = contratLabel(i.contrat_id);
                      const reste = Math.max(0, Number(i.montant_du) - Number(i.montant_paye));
                      const pct = impayeProgress(i.montant_du, i.montant_paye);
                      const st = computeImpayeStatut(i);
                      return (
                        <TableRow
                          key={i.id}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => { setSelected(i); setDetailOpen(true); }}
                        >
                          <TableCell className="font-medium">{bien}</TableCell>
                          <TableCell>{locataire}</TableCell>
                          <TableCell>{fmtDate(i.date_echeance)}</TableCell>
                          <TableCell>{fmtMoney(i.montant_du)}</TableCell>
                          <TableCell>{fmtMoney(i.montant_paye)}</TableCell>
                          <TableCell className={reste > 0 ? "text-destructive font-medium" : "text-emerald-600 font-medium"}>
                            {fmtMoney(reste)}
                          </TableCell>
                          <TableCell className="min-w-[120px]">
                            <div className="flex items-center gap-2">
                              <Progress value={pct} className="h-2 w-16" />
                              <span className="text-xs text-muted-foreground">{pct}%</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge className={st.className}>{st.emoji} {st.label}</Badge>
                          </TableCell>
                          <TableCell>{fmtDate(i.date_derniere_relance)}</TableCell>
                          <TableCell>{gestionnaire}</TableCell>
                        </TableRow>
                      );
                    })}

                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <ImpayeDetailDialog
          impaye={selected}
          open={detailOpen}
          onOpenChange={setDetailOpen}
          role={role ?? undefined}
          onUpdated={(u) => {
            setSelected(u);
            setImpayes((prev) => prev.map((x) => (x.id === u.id ? u : x)));
          }}
          onDeleted={(id) => {
            setImpayes((prev) => prev.filter((x) => x.id !== id));
            setSelected(null);
          }}
        />
      </main>
    </div>
  );
}
