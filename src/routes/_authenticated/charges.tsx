import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { FilterBar } from "@/components/filter-bar";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Building2, ArrowLeft, Plus } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/charges")({
  head: () => ({ meta: [{ title: "Charges — Agence Immobilière" }] }),
  component: ChargesPage,
});

const ALLOWED = ["admin", "direction", "gestion_locative"] as const;

type Charge = { id: string; bien_id: string; libelle: string; montant: number; date: string; recurrente: boolean };
type Bien = { id: string; titre: string };

function ChargesPage() {
  const navigate = useNavigate();
  const [role, setRole] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [charges, setCharges] = useState<Charge[]>([]);
  const [biens, setBiens] = useState<Bien[]>([]);
  const [filterBien, setFilterBien] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [fRec, setFRec] = useState("all");
  const [dFrom, setDFrom] = useState("");
  const [dTo, setDTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ bien_id: "", libelle: "", montant: "", date: "", recurrente: false });

  useEffect(() => {
    (async () => {
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes.user?.id;
      if (!uid) { setChecked(true); return; }
      const { data: p } = await supabase.from("profiles").select("role").eq("id", uid).maybeSingle();
      const r = p?.role ?? null;
      setRole(r);
      setChecked(true);
      if (!r || !(ALLOWED as readonly string[]).includes(r)) {
        toast.error("Accès refusé"); navigate({ to: "/dashboard", replace: true });
      }
    })();
  }, [navigate]);

  const load = async () => {
    setLoading(true);
    const [{ data: cData, error }, { data: bData }] = await Promise.all([
      supabase.from("charges").select("*").order("date", { ascending: false }),
      supabase.from("biens").select("id, titre").order("titre"),
    ]);
    if (error) toast.error(error.message);
    else setCharges((cData ?? []) as Charge[]);
    setBiens((bData ?? []) as Bien[]);
    setLoading(false);
  };
  useEffect(() => { if (role && (ALLOWED as readonly string[]).includes(role)) load(); }, [role]);

  const resetForm = () => setForm({ bien_id: "", libelle: "", montant: "", date: "", recurrente: false });
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.bien_id || !form.libelle || !form.montant || !form.date) return toast.error("Champs obligatoires manquants");
    setSaving(true);
    const { error } = await supabase.from("charges").insert({
      bien_id: form.bien_id, libelle: form.libelle.trim(), montant: Number(form.montant),
      date: form.date, recurrente: form.recurrente,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Charge ajoutée"); setOpen(false); resetForm(); load();
  };

  const bienTitre = (id: string) => biens.find((b) => b.id === id)?.titre ?? "—";
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return charges.filter((c) => {
      if (filterBien !== "all" && c.bien_id !== filterBien) return false;
      if (fRec === "oui" && !c.recurrente) return false;
      if (fRec === "non" && c.recurrente) return false;
      if (dFrom && c.date < dFrom) return false;
      if (dTo && c.date > dTo) return false;
      if (q && !`${c.libelle} ${bienTitre(c.bien_id)}`.toLowerCase().includes(q)) return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [charges, filterBien, fRec, dFrom, dTo, search, biens]);
  const fmtMoney = (n: number) => Number(n).toLocaleString("fr-FR") + " FCFA";
  const fmtDate = (d: string) => new Date(d).toLocaleDateString("fr-FR");

  if (!checked) return null;

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
            <div><CardTitle>Charges</CardTitle><CardDescription>Charges liées aux biens.</CardDescription></div>
            <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) resetForm(); }}>
              <DialogTrigger asChild><Button size="sm"><Plus className="mr-2 h-4 w-4" /> Nouvelle charge</Button></DialogTrigger>
              <DialogContent>
                <form onSubmit={handleCreate}>
                  <DialogHeader><DialogTitle>Nouvelle charge</DialogTitle><DialogDescription>Ajouter une charge sur un bien.</DialogDescription></DialogHeader>
                  <div className="grid gap-4 py-4">
                    <div className="grid gap-2"><Label>Bien *</Label>
                      <Select value={form.bien_id} onValueChange={(v) => setForm({ ...form, bien_id: v })}>
                        <SelectTrigger><SelectValue placeholder="Sélectionner un bien..." /></SelectTrigger>
                        <SelectContent>{biens.map((b) => <SelectItem key={b.id} value={b.id}>{b.titre}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2"><Label htmlFor="libelle">Libellé *</Label><Input id="libelle" value={form.libelle} onChange={(e) => setForm({ ...form, libelle: e.target.value })} required /></div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="grid gap-2"><Label htmlFor="montant">Montant *</Label><Input id="montant" type="number" min="0" step="0.01" required value={form.montant} onChange={(e) => setForm({ ...form, montant: e.target.value })} /></div>
                      <div className="grid gap-2"><Label htmlFor="date">Date *</Label><Input id="date" type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
                    </div>
                    <div className="flex items-center gap-2"><Checkbox id="recurrente" checked={form.recurrente} onCheckedChange={(v) => setForm({ ...form, recurrente: v === true })} /><Label htmlFor="recurrente">Charge récurrente</Label></div>
                  </div>
                  <DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>Annuler</Button><Button type="submit" disabled={saving}>{saving ? "..." : "Enregistrer"}</Button></DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </CardHeader>
          <CardContent>
            <FilterBar
              search={search}
              onSearchChange={setSearch}
              searchPlaceholder="Libellé ou bien..."
              selects={[
                { key: "bien", label: "Bien", value: filterBien, onChange: setFilterBien, options: biens.map((b) => ({ value: b.id, label: b.titre })), width: "w-52" },
                { key: "rec", label: "Récurrente", value: fRec, onChange: setFRec, options: [{ value: "oui", label: "Oui" }, { value: "non", label: "Non" }] },
              ]}
              dateRange={{ label: "Date", from: dFrom, to: dTo, onFromChange: setDFrom, onToChange: setDTo }}
              onReset={() => { setSearch(""); setFilterBien("all"); setFRec("all"); setDFrom(""); setDTo(""); }}
            />
            {loading ? <p className="text-sm text-muted-foreground">Chargement...</p> : filtered.length === 0 ? <p className="text-sm text-muted-foreground">Aucune charge.</p> : (
              <div className="overflow-x-auto"><Table>
                <TableHeader><TableRow><TableHead>Bien</TableHead><TableHead>Libellé</TableHead><TableHead>Montant</TableHead><TableHead>Date</TableHead><TableHead>Récurrente</TableHead></TableRow></TableHeader>
                <TableBody>{filtered.map((c) => (
                  <TableRow key={c.id}><TableCell className="font-medium">{bienTitre(c.bien_id)}</TableCell><TableCell>{c.libelle}</TableCell><TableCell>{fmtMoney(c.montant)}</TableCell><TableCell>{fmtDate(c.date)}</TableCell><TableCell>{c.recurrente ? "Oui" : "Non"}</TableCell></TableRow>
                ))}</TableBody>
              </Table></div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
