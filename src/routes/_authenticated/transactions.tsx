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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Building2, ArrowLeft, Plus } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/transactions")({
  head: () => ({ meta: [{ title: "Transactions — Agence Immobilière" }] }),
  component: TransactionsPage,
});

const TYPES = [
  { value: "mandat", label: "Mandat" },
  { value: "visite", label: "Visite" },
  { value: "offre", label: "Offre" },
] as const;
const STATUTS = [
  { value: "nouveau", label: "Nouveau" },
  { value: "en_cours", label: "En cours" },
  { value: "gagne", label: "Gagné" },
  { value: "perdu", label: "Perdu" },
] as const;
const TYPE_LABEL: Record<string, string> = Object.fromEntries(TYPES.map((s) => [s.value, s.label]));
const STATUT_LABEL: Record<string, string> = Object.fromEntries(STATUTS.map((s) => [s.value, s.label]));
const ALLOWED = ["admin", "commercial"] as const;
const COMMERCIAL_TYPES = ["prospect", "acheteur", "vendeur"];

type Tx = { id: string; contact_id: string; bien_id: string | null; type_transaction: string; statut_opportunite: string; date_visite: string | null; notes: string | null };
type Contact = { id: string; nom: string; prenom: string | null; type_contact: string | null };
type Bien = { id: string; titre: string };

function TransactionsPage() {
  const navigate = useNavigate();
  const [role, setRole] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [items, setItems] = useState<Tx[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [biens, setBiens] = useState<Bien[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ contact_id: "", bien_id: "", type_transaction: "mandat", statut_opportunite: "nouveau", date_visite: "", notes: "" });
  const [search, setSearch] = useState("");
  const [fType, setFType] = useState("all");
  const [fStatut, setFStatut] = useState("all");
  const [dFrom, setDFrom] = useState("");
  const [dTo, setDTo] = useState("");

  useEffect(() => {
    (async () => {
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes.user?.id;
      if (!uid) { setChecked(true); return; }
      const { data: p } = await supabase.from("profiles").select("role").eq("id", uid).maybeSingle();
      const r = p?.role ?? null;
      setRole(r); setChecked(true);
      if (!r || !(ALLOWED as readonly string[]).includes(r)) {
        toast.error("Accès refusé"); navigate({ to: "/dashboard", replace: true });
      }
    })();
  }, [navigate]);

  const load = async () => {
    setLoading(true);
    const [{ data: tData, error }, { data: cData }, { data: bData }] = await Promise.all([
      supabase.from("transactions_commerciales").select("*").order("created_at", { ascending: false }),
      supabase.from("contacts").select("id, nom, prenom, type_contact").eq("archive", false).order("nom"),
      supabase.from("biens").select("id, titre").order("titre"),
    ]);
    if (error) toast.error(error.message);
    else setItems((tData ?? []) as Tx[]);
    setContacts((cData ?? []) as Contact[]);
    setBiens((bData ?? []) as Bien[]);
    setLoading(false);
  };
  useEffect(() => { if (role && (ALLOWED as readonly string[]).includes(role)) load(); }, [role]);

  const commercialContacts = contacts.filter((c) => c.type_contact && COMMERCIAL_TYPES.includes(c.type_contact));

  const contactName = (id: string) => { const c = contacts.find((x) => x.id === id); return c ? `${c.nom}${c.prenom ? ` ${c.prenom}` : ""}` : "—"; };
  const bienTitre = (id: string | null) => id ? (biens.find((b) => b.id === id)?.titre ?? "—") : "—";

  const stats = useMemo(() => {
    const prospectIds = new Set(contacts.filter((c) => c.type_contact === "prospect").map((c) => c.id));
    const nbProspectsActifs = items.filter((t) => prospectIds.has(t.contact_id) && ["nouveau", "en_cours"].includes(t.statut_opportunite)).length;
    const enCours = items.filter((t) => ["nouveau", "en_cours"].includes(t.statut_opportunite)).length;
    const gagne = items.filter((t) => t.statut_opportunite === "gagne").length;
    const total = items.length;
    const taux = total > 0 ? Math.round((gagne / total) * 100) : 0;
    return { nbProspectsActifs, enCours, taux };
  }, [items, contacts]);

  const resetForm = () => setForm({ contact_id: "", bien_id: "", type_transaction: "mandat", statut_opportunite: "nouveau", date_visite: "", notes: "" });
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.contact_id) return toast.error("Le contact est obligatoire");
    setSaving(true);
    const { error } = await supabase.from("transactions_commerciales").insert({
      contact_id: form.contact_id, bien_id: form.bien_id || null,
      type_transaction: form.type_transaction, statut_opportunite: form.statut_opportunite,
      date_visite: form.date_visite || null, notes: form.notes.trim() || null,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Transaction enregistrée"); setOpen(false); resetForm(); load();
  };

  if (!checked) return null;

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2"><Building2 className="h-5 w-5" /><span className="font-semibold">Agence Immobilière</span></div>
          <Button variant="outline" size="sm" asChild><Link to="/dashboard"><ArrowLeft className="mr-2 h-4 w-4" /> Tableau de bord</Link></Button>
        </div>
      </header>
      <main className="mx-auto max-w-6xl space-y-6 px-6 py-10">
        <div className="grid gap-4 md:grid-cols-3">
          <Card><CardHeader className="pb-2"><CardDescription>Prospects actifs</CardDescription></CardHeader><CardContent><p className="text-3xl font-semibold">{stats.nbProspectsActifs}</p></CardContent></Card>
          <Card><CardHeader className="pb-2"><CardDescription>Opportunités en cours</CardDescription></CardHeader><CardContent><p className="text-3xl font-semibold">{stats.enCours}</p></CardContent></Card>
          <Card><CardHeader className="pb-2"><CardDescription>Taux de conversion</CardDescription></CardHeader><CardContent><p className="text-3xl font-semibold">{stats.taux}%</p></CardContent></Card>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div><CardTitle>Transactions commerciales</CardTitle><CardDescription>Suivi des opportunités.</CardDescription></div>
            <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) resetForm(); }}>
              <DialogTrigger asChild><Button size="sm"><Plus className="mr-2 h-4 w-4" /> Nouvelle</Button></DialogTrigger>
              <DialogContent>
                <form onSubmit={handleCreate}>
                  <DialogHeader><DialogTitle>Nouvelle transaction</DialogTitle><DialogDescription>Prospect, acheteur ou vendeur.</DialogDescription></DialogHeader>
                  <div className="grid gap-4 py-4">
                    <div className="grid gap-2"><Label>Contact *</Label>
                      <Select value={form.contact_id} onValueChange={(v) => setForm({ ...form, contact_id: v })}>
                        <SelectTrigger><SelectValue placeholder={commercialContacts.length ? "Sélectionner..." : "Aucun prospect/acheteur/vendeur"} /></SelectTrigger>
                        <SelectContent>{commercialContacts.map((c) => <SelectItem key={c.id} value={c.id}>{c.nom}{c.prenom ? ` ${c.prenom}` : ""} ({c.type_contact})</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2"><Label>Bien concerné</Label>
                      <Select value={form.bien_id} onValueChange={(v) => setForm({ ...form, bien_id: v })}>
                        <SelectTrigger><SelectValue placeholder="Optionnel..." /></SelectTrigger>
                        <SelectContent>{biens.map((b) => <SelectItem key={b.id} value={b.id}>{b.titre}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="grid gap-2"><Label>Type</Label>
                        <Select value={form.type_transaction} onValueChange={(v) => setForm({ ...form, type_transaction: v })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>{TYPES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div className="grid gap-2"><Label>Statut</Label>
                        <Select value={form.statut_opportunite} onValueChange={(v) => setForm({ ...form, statut_opportunite: v })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>{STATUTS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="grid gap-2"><Label htmlFor="dv">Date de visite</Label><Input id="dv" type="date" value={form.date_visite} onChange={(e) => setForm({ ...form, date_visite: e.target.value })} /></div>
                    <div className="grid gap-2"><Label htmlFor="notes">Notes</Label><Textarea id="notes" rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
                  </div>
                  <DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>Annuler</Button><Button type="submit" disabled={saving}>{saving ? "..." : "Enregistrer"}</Button></DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </CardHeader>
          <CardContent>
            {loading ? <p className="text-sm text-muted-foreground">Chargement...</p> : items.length === 0 ? <p className="text-sm text-muted-foreground">Aucune transaction.</p> : (
              <div className="overflow-x-auto"><Table>
                <TableHeader><TableRow><TableHead>Contact</TableHead><TableHead>Bien</TableHead><TableHead>Type</TableHead><TableHead>Date visite</TableHead><TableHead>Statut</TableHead></TableRow></TableHeader>
                <TableBody>{items.map((t) => (
                  <TableRow key={t.id}><TableCell className="font-medium">{contactName(t.contact_id)}</TableCell><TableCell>{bienTitre(t.bien_id)}</TableCell><TableCell><Badge variant="outline">{TYPE_LABEL[t.type_transaction] ?? t.type_transaction}</Badge></TableCell><TableCell>{t.date_visite ? new Date(t.date_visite).toLocaleDateString("fr-FR") : "—"}</TableCell><TableCell><Badge>{STATUT_LABEL[t.statut_opportunite] ?? t.statut_opportunite}</Badge></TableCell></TableRow>
                ))}</TableBody>
              </Table></div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
