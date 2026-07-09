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
import { Building2, ArrowLeft, Plus } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/reclamations")({
  head: () => ({ meta: [{ title: "Réclamations — Agence Immobilière" }] }),
  component: ReclamationsPage,
});

const STATUTS = [
  { value: "ouverte", label: "Ouverte" },
  { value: "en_cours", label: "En cours" },
  { value: "resolue", label: "Résolue" },
] as const;
const PRIORITES = [
  { value: "basse", label: "Basse" },
  { value: "normale", label: "Normale" },
  { value: "haute", label: "Haute" },
] as const;
const STATUT_LABEL: Record<string, string> = Object.fromEntries(STATUTS.map((s) => [s.value, s.label]));
const PRIO_LABEL: Record<string, string> = Object.fromEntries(PRIORITES.map((s) => [s.value, s.label]));
const CAN_WRITE = ["admin", "technique"] as const;

type Reclamation = { id: string; bien_id: string; locataire_id: string | null; titre: string; description: string | null; statut: string; priorite: string };
type Bien = { id: string; titre: string };
type Contact = { id: string; nom: string; prenom: string | null };

function ReclamationsPage() {
  const [role, setRole] = useState<string | null>(null);
  const [items, setItems] = useState<Reclamation[]>([]);
  const [biens, setBiens] = useState<Bien[]>([]);
  const [locataires, setLocataires] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ bien_id: "", locataire_id: "", titre: "", description: "", statut: "ouverte", priorite: "normale" });

  const canWrite = role ? (CAN_WRITE as readonly string[]).includes(role) : false;

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
    const [{ data: rData, error }, { data: bData }, { data: lData }] = await Promise.all([
      supabase.from("reclamations").select("*").order("created_at", { ascending: false }),
      supabase.from("biens").select("id, titre").order("titre"),
      supabase.from("contacts").select("id, nom, prenom").eq("type_contact", "locataire").eq("archive", false).order("nom"),
    ]);
    if (error) toast.error(error.message);
    else setItems((rData ?? []) as Reclamation[]);
    setBiens((bData ?? []) as Bien[]);
    setLocataires((lData ?? []) as Contact[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const resetForm = () => setForm({ bien_id: "", locataire_id: "", titre: "", description: "", statut: "ouverte", priorite: "normale" });
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.bien_id || !form.titre) return toast.error("Bien et titre obligatoires");
    setSaving(true);
    const { error } = await supabase.from("reclamations").insert({
      bien_id: form.bien_id, locataire_id: form.locataire_id || null,
      titre: form.titre.trim(), description: form.description.trim() || null,
      statut: form.statut, priorite: form.priorite,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Réclamation ajoutée"); setOpen(false); resetForm(); load();
  };

  const bienTitre = (id: string) => biens.find((b) => b.id === id)?.titre ?? "—";
  const locataireName = (id: string | null) => { if (!id) return "—"; const l = locataires.find((x) => x.id === id); return l ? `${l.nom}${l.prenom ? ` ${l.prenom}` : ""}` : "—"; };
  const prioVariant = (p: string) => p === "haute" ? "destructive" : p === "basse" ? "secondary" : "default";

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
            <div><CardTitle>Réclamations</CardTitle><CardDescription>{canWrite ? "Gestion des réclamations." : "Consultation (lecture seule)."}</CardDescription></div>
            {canWrite && (
              <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) resetForm(); }}>
                <DialogTrigger asChild><Button size="sm"><Plus className="mr-2 h-4 w-4" /> Nouvelle</Button></DialogTrigger>
                <DialogContent>
                  <form onSubmit={handleCreate}>
                    <DialogHeader><DialogTitle>Nouvelle réclamation</DialogTitle><DialogDescription>Enregistrer une réclamation sur un bien.</DialogDescription></DialogHeader>
                    <div className="grid gap-4 py-4">
                      <div className="grid gap-2"><Label>Bien *</Label>
                        <Select value={form.bien_id} onValueChange={(v) => setForm({ ...form, bien_id: v })}>
                          <SelectTrigger><SelectValue placeholder="Sélectionner..." /></SelectTrigger>
                          <SelectContent>{biens.map((b) => <SelectItem key={b.id} value={b.id}>{b.titre}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div className="grid gap-2"><Label>Locataire</Label>
                        <Select value={form.locataire_id} onValueChange={(v) => setForm({ ...form, locataire_id: v })}>
                          <SelectTrigger><SelectValue placeholder="Optionnel..." /></SelectTrigger>
                          <SelectContent>{locataires.map((l) => <SelectItem key={l.id} value={l.id}>{l.nom}{l.prenom ? ` ${l.prenom}` : ""}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div className="grid gap-2"><Label htmlFor="titre">Titre *</Label><Input id="titre" required value={form.titre} onChange={(e) => setForm({ ...form, titre: e.target.value })} /></div>
                      <div className="grid gap-2"><Label htmlFor="desc">Description</Label><Textarea id="desc" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="grid gap-2"><Label>Statut</Label>
                          <Select value={form.statut} onValueChange={(v) => setForm({ ...form, statut: v })}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>{STATUTS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                          </Select>
                        </div>
                        <div className="grid gap-2"><Label>Priorité</Label>
                          <Select value={form.priorite} onValueChange={(v) => setForm({ ...form, priorite: v })}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>{PRIORITES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>
                    <DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>Annuler</Button><Button type="submit" disabled={saving}>{saving ? "..." : "Enregistrer"}</Button></DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            )}
          </CardHeader>
          <CardContent>
            {loading ? <p className="text-sm text-muted-foreground">Chargement...</p> : items.length === 0 ? <p className="text-sm text-muted-foreground">Aucune réclamation.</p> : (
              <div className="overflow-x-auto"><Table>
                <TableHeader><TableRow><TableHead>Bien</TableHead><TableHead>Titre</TableHead><TableHead>Locataire</TableHead><TableHead>Priorité</TableHead><TableHead>Statut</TableHead></TableRow></TableHeader>
                <TableBody>{items.map((r) => (
                  <TableRow key={r.id}><TableCell className="font-medium">{bienTitre(r.bien_id)}</TableCell><TableCell>{r.titre}</TableCell><TableCell>{locataireName(r.locataire_id)}</TableCell><TableCell><Badge variant={prioVariant(r.priorite)}>{PRIO_LABEL[r.priorite] ?? r.priorite}</Badge></TableCell><TableCell><Badge>{STATUT_LABEL[r.statut] ?? r.statut}</Badge></TableCell></TableRow>
                ))}</TableBody>
              </Table></div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
