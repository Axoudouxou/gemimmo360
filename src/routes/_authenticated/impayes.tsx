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
type Bien = { id: string; titre: string };
type Contact = { id: string; nom: string; prenom: string | null };

function ImpayesPage() {
  const navigate = useNavigate();
  const [role, setRole] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [impayes, setImpayes] = useState<Impaye[]>([]);
  const [contrats, setContrats] = useState<Contrat[]>([]);
  const [lots, setLots] = useState<Lot[]>([]);
  const [biens, setBiens] = useState<Bien[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<Impaye | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [fStatut, setFStatut] = useState("en_retard");
  const [dFrom, setDFrom] = useState("");
  const [dTo, setDTo] = useState("");

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
    const [{ data: iData, error }, { data: cData }, { data: lData }, { data: bData }, { data: coData }] = await Promise.all([
      supabase.from("impayes").select("*").order("date_echeance", { ascending: false }),
      supabase.from("contrats").select("id, lot_id, locataire_id, statut"),
      supabase.from("lots").select("id, label, bien_id"),
      supabase.from("biens").select("id, titre"),
      supabase.from("contacts").select("id, nom, prenom"),
    ]);
    if (error) toast.error(error.message);
    else setImpayes((iData ?? []) as Impaye[]);
    setContrats((cData ?? []) as Contrat[]);
    setLots((lData ?? []) as Lot[]);
    setBiens((bData ?? []) as Bien[]);
    setContacts((coData ?? []) as Contact[]);
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
    if (!c) return { bien: "—", locataire: "—" };
    const lot = lots.find((l) => l.id === c.lot_id);
    const bienTitre = lot ? (biens.find((b) => b.id === lot.bien_id)?.titre ?? "—") : "—";
    const bien = lot ? `${bienTitre} — ${lot.label}` : bienTitre;
    const loc = c.locataire_id ? contacts.find((x) => x.id === c.locataire_id) : null;
    const locataire = loc ? `${loc.nom}${loc.prenom ? ` ${loc.prenom}` : ""}` : "—";
    return { bien, locataire };
  };

  const stats = useMemo(() => {
    const enRetard = impayes.filter((i) => i.statut === "en_retard");
    const nbEnRetard = enRetard.length;
    const montantEnRetard = enRetard.reduce((s, i) => s + (Number(i.montant_du) - Number(i.montant_paye)), 0);
    const now = new Date();
    const m = now.getMonth();
    const y = now.getFullYear();
    const relancesMois = impayes.filter((i) => {
      if (!i.date_derniere_relance) return false;
      const d = new Date(i.date_derniere_relance);
      return d.getMonth() === m && d.getFullYear() === y;
    }).length;
    return { nbEnRetard, montantEnRetard, relancesMois };
  }, [impayes]);

  const contratsActifs = contrats.filter((c) => c.statut === "actif");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return impayes.filter((i) => {
      if (fStatut !== "all" && i.statut !== fStatut) return false;
      if (fService !== "all" && (i.service_en_charge ?? "recouvrement") !== fService) return false;
      if (dFrom && i.date_echeance < dFrom) return false;
      if (dTo && i.date_echeance > dTo) return false;
      if (q) {
        const { bien, locataire } = contratLabel(i.contrat_id);
        if (!`${bien} ${locataire}`.toLowerCase().includes(q)) return false;
      }
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [impayes, search, fStatut, fService, dFrom, dTo, contrats, lots, biens, contacts]);

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
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2"><CardDescription>Impayés en retard</CardDescription></CardHeader>
            <CardContent><p className="text-3xl font-semibold">{stats.nbEnRetard}</p></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardDescription>Montant total dû en retard</CardDescription></CardHeader>
            <CardContent><p className="text-3xl font-semibold">{fmtMoney(stats.montantEnRetard)}</p></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardDescription>Relances envoyées ce mois</CardDescription></CardHeader>
            <CardContent><p className="text-3xl font-semibold">{stats.relancesMois}</p></CardContent>
          </Card>
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
              onReset={() => { setSearch(""); setFStatut("all"); setFService("all"); setDFrom(""); setDTo(""); }}
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
                      <TableHead>Bien</TableHead>
                      <TableHead>Locataire</TableHead>
                      <TableHead>Montant dû</TableHead>
                      <TableHead>Montant payé</TableHead>
                      <TableHead>Échéance</TableHead>
                      <TableHead>Statut</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((i) => {
                      const { bien, locataire } = contratLabel(i.contrat_id);
                      return (
                        <TableRow
                          key={i.id}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => { setSelected(i); setDetailOpen(true); }}
                        >
                          <TableCell className="font-medium">{bien}</TableCell>
                          <TableCell>{locataire}</TableCell>
                          <TableCell>{fmtMoney(i.montant_du)}</TableCell>
                          <TableCell>{fmtMoney(i.montant_paye)}</TableCell>
                          <TableCell>{fmtDate(i.date_echeance)}</TableCell>
                          <TableCell>
                            <Badge variant={i.statut === "en_retard" ? "destructive" : "default"}>
                              {STATUT_LABEL[i.statut] ?? i.statut}
                            </Badge>
                          </TableCell>
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
        />
      </main>
    </div>
  );
}
