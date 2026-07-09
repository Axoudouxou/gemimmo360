import { createFileRoute, Link } from "@tanstack/react-router";
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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Building2, ArrowLeft, Plus, FileText, Pencil } from "lucide-react";
import { DocumentsSection } from "@/components/documents-section";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/travaux")({
  head: () => ({ meta: [{ title: "Travaux — Agence Immobilière" }] }),
  component: TravauxPage,
});

const STATUTS = [
  { value: "planifie", label: "Planifié" },
  { value: "en_cours", label: "En cours" },
  { value: "termine", label: "Terminé" },
] as const;
const STATUT_LABEL: Record<string, string> = Object.fromEntries(STATUTS.map((s) => [s.value, s.label]));
const NO_WRITE = ["recouvrement", "en_attente"] as const;

type Travail = {
  id: string; bien_id: string; titre: string; description: string | null;
  budget_prevu: number | null; budget_depense: number; statut: string;
  date_debut: string | null; date_fin: string | null;
};
type Bien = { id: string; titre: string };

function TravauxPage() {
  const [role, setRole] = useState<string | null>(null);
  const [travaux, setTravaux] = useState<Travail[]>([]);
  const [biens, setBiens] = useState<Bien[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ bien_id: "", titre: "", description: "", budget_prevu: "", budget_depense: "0", statut: "planifie", date_debut: "", date_fin: "" });
  const [search, setSearch] = useState("");
  const [fStatut, setFStatut] = useState("all");
  const [fBien, setFBien] = useState("all");
  const [dFrom, setDFrom] = useState("");
  const [dTo, setDTo] = useState("");

  const canWrite = role ? !(NO_WRITE as readonly string[]).includes(role) : false;

  useEffect(() => {
    (async () => {
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes.user?.id;
      if (!uid) return;
      const { data: p } = await supabase.from("profiles").select("role").eq("id", uid).maybeSingle();
      setRole(p?.role ?? null);
    })();
  }, []);

  const load = async () => {
    setLoading(true);
    const [{ data: tData, error }, { data: bData }] = await Promise.all([
      supabase.from("travaux").select("*").order("created_at", { ascending: false }),
      supabase.from("biens").select("id, titre").order("titre"),
    ]);
    if (error) toast.error(error.message);
    else setTravaux((tData ?? []) as Travail[]);
    setBiens((bData ?? []) as Bien[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const resetForm = () => setForm({ bien_id: "", titre: "", description: "", budget_prevu: "", budget_depense: "0", statut: "planifie", date_debut: "", date_fin: "" });
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.bien_id || !form.titre) return toast.error("Bien et titre obligatoires");
    setSaving(true);
    const { error } = await supabase.from("travaux").insert({
      bien_id: form.bien_id, titre: form.titre.trim(), description: form.description.trim() || null,
      budget_prevu: form.budget_prevu ? Number(form.budget_prevu) : null,
      budget_depense: form.budget_depense ? Number(form.budget_depense) : 0,
      statut: form.statut, date_debut: form.date_debut || null, date_fin: form.date_fin || null,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Travaux ajoutés"); setOpen(false); resetForm(); load();
  };

  const bienTitre = (id: string) => biens.find((b) => b.id === id)?.titre ?? "—";
  const fmtMoney = (n: number | null) => n == null ? "—" : Number(n).toLocaleString("fr-FR") + " FCFA";
  const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString("fr-FR") : "—";

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return travaux.filter((t) => {
      if (fStatut !== "all" && t.statut !== fStatut) return false;
      if (fBien !== "all" && t.bien_id !== fBien) return false;
      if (dFrom && (!t.date_debut || t.date_debut < dFrom)) return false;
      if (dTo && (!t.date_debut || t.date_debut > dTo)) return false;
      if (q && !`${t.titre} ${bienTitre(t.bien_id)}`.toLowerCase().includes(q)) return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [travaux, search, fStatut, fBien, dFrom, dTo, biens]);

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2"><Building2 className="h-5 w-5" /><span className="font-semibold">Agence Immobilière</span></div>
          <Button variant="outline" size="sm" asChild><Link to="/dashboard"><ArrowLeft className="mr-2 h-4 w-4" /> Tableau de bord</Link></Button>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-10">
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div><CardTitle>Travaux</CardTitle><CardDescription>{canWrite ? "Suivi des travaux sur les biens." : "Consultation des travaux (lecture seule)."}</CardDescription></div>
            {canWrite && (
              <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) resetForm(); }}>
                <DialogTrigger asChild><Button size="sm"><Plus className="mr-2 h-4 w-4" /> Nouveau</Button></DialogTrigger>
                <DialogContent>
                  <form onSubmit={handleCreate}>
                    <DialogHeader><DialogTitle>Nouveaux travaux</DialogTitle><DialogDescription>Planifier des travaux sur un bien.</DialogDescription></DialogHeader>
                    <div className="grid gap-4 py-4">
                      <div className="grid gap-2"><Label>Bien *</Label>
                        <Select value={form.bien_id} onValueChange={(v) => setForm({ ...form, bien_id: v })}>
                          <SelectTrigger><SelectValue placeholder="Sélectionner..." /></SelectTrigger>
                          <SelectContent>{biens.map((b) => <SelectItem key={b.id} value={b.id}>{b.titre}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div className="grid gap-2"><Label htmlFor="titre">Titre *</Label><Input id="titre" required value={form.titre} onChange={(e) => setForm({ ...form, titre: e.target.value })} /></div>
                      <div className="grid gap-2"><Label htmlFor="description">Description</Label><Textarea id="description" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="grid gap-2"><Label htmlFor="bp">Budget prévu</Label><Input id="bp" type="number" min="0" step="0.01" value={form.budget_prevu} onChange={(e) => setForm({ ...form, budget_prevu: e.target.value })} /></div>
                        <div className="grid gap-2"><Label htmlFor="bd">Budget dépensé</Label><Input id="bd" type="number" min="0" step="0.01" value={form.budget_depense} onChange={(e) => setForm({ ...form, budget_depense: e.target.value })} /></div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="grid gap-2"><Label htmlFor="dd">Date de début</Label><Input id="dd" type="date" value={form.date_debut} onChange={(e) => setForm({ ...form, date_debut: e.target.value })} /></div>
                        <div className="grid gap-2"><Label htmlFor="df">Date de fin</Label><Input id="df" type="date" value={form.date_fin} onChange={(e) => setForm({ ...form, date_fin: e.target.value })} /></div>
                      </div>
                      <div className="grid gap-2"><Label>Statut</Label>
                        <Select value={form.statut} onValueChange={(v) => setForm({ ...form, statut: v })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>{STATUTS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                    </div>
                    <DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>Annuler</Button><Button type="submit" disabled={saving}>{saving ? "..." : "Enregistrer"}</Button></DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            )}
          </CardHeader>
          <CardContent>
            <FilterBar
              search={search}
              onSearchChange={setSearch}
              searchPlaceholder="Titre ou bien..."
              selects={[
                { key: "statut", label: "Statut", value: fStatut, onChange: setFStatut, options: STATUTS.map((s) => ({ value: s.value, label: s.label })) },
                { key: "bien", label: "Bien", value: fBien, onChange: setFBien, options: biens.map((b) => ({ value: b.id, label: b.titre })), width: "w-52" },
              ]}
              dateRange={{ label: "Début", from: dFrom, to: dTo, onFromChange: setDFrom, onToChange: setDTo }}
              onReset={() => { setSearch(""); setFStatut("all"); setFBien("all"); setDFrom(""); setDTo(""); }}
            />
            {loading ? <p className="text-sm text-muted-foreground">Chargement...</p> : filtered.length === 0 ? <p className="text-sm text-muted-foreground">Aucun chantier.</p> : (
              <div className="overflow-x-auto"><Table>
                <TableHeader><TableRow><TableHead>Bien</TableHead><TableHead>Titre</TableHead><TableHead>Budget prévu</TableHead><TableHead>Dépensé</TableHead><TableHead>Début</TableHead><TableHead>Fin</TableHead><TableHead>Statut</TableHead><TableHead className="w-[110px]">Documents</TableHead></TableRow></TableHeader>
                <TableBody>{filtered.map((t) => (
                  <TableRow key={t.id}><TableCell className="font-medium">{bienTitre(t.bien_id)}</TableCell><TableCell>{t.titre}</TableCell><TableCell>{fmtMoney(t.budget_prevu)}</TableCell><TableCell>{fmtMoney(t.budget_depense)}</TableCell><TableCell>{fmtDate(t.date_debut)}</TableCell><TableCell>{fmtDate(t.date_fin)}</TableCell><TableCell><Badge>{STATUT_LABEL[t.statut] ?? t.statut}</Badge></TableCell><TableCell><DocsButton travailId={t.id} canWrite={canWrite} /></TableCell></TableRow>
                ))}</TableBody>
              </Table></div>

            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

function DocsButton({ travailId, canWrite }: { travailId: string; canWrite: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline"><FileText className="mr-1 h-3 w-3" /> Documents</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Documents des travaux</DialogTitle></DialogHeader>
        <DocumentsSection bucket="travaux-documents" recordId={travailId} canWrite={canWrite} description="Devis, factures et pièces jointes (PDF)." />
      </DialogContent>
    </Dialog>
  );
}

