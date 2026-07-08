import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
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

export const Route = createFileRoute("/_authenticated/etats-des-lieux")({
  head: () => ({ meta: [{ title: "États des lieux — Agence Immobilière" }] }),
  component: EDLPage,
});

const ALLOWED = ["admin", "juridique", "gestion_locative"] as const;
const CAN_WRITE = ["admin", "juridique"] as const;

type EDL = { id: string; contrat_id: string; type: string; date_realisation: string; observations: string | null };
type Contrat = { id: string; lot_id: string; locataire_id: string | null };
type Lot = { id: string; label: string; bien_id: string };
type Bien = { id: string; titre: string };
type Contact = { id: string; nom: string; prenom: string | null };

function EDLPage() {
  const navigate = useNavigate();
  const [role, setRole] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [items, setItems] = useState<EDL[]>([]);
  const [contrats, setContrats] = useState<Contrat[]>([]);
  const [lots, setLots] = useState<Lot[]>([]);
  const [biens, setBiens] = useState<Bien[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ contrat_id: "", type: "entree", date_realisation: "", observations: "" });

  const canWrite = role ? (CAN_WRITE as readonly string[]).includes(role) : false;

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
    const [{ data: eData, error }, { data: cData }, { data: lData }, { data: bData }, { data: coData }] = await Promise.all([
      supabase.from("etats_des_lieux").select("*").order("date_realisation", { ascending: false }),
      supabase.from("contrats").select("id, lot_id, locataire_id"),
      supabase.from("lots").select("id, label, bien_id"),
      supabase.from("biens").select("id, titre"),
      supabase.from("contacts").select("id, nom, prenom"),
    ]);
    if (error) toast.error(error.message);
    else setItems((eData ?? []) as EDL[]);
    setContrats((cData ?? []) as Contrat[]);
    setLots((lData ?? []) as Lot[]);
    setBiens((bData ?? []) as Bien[]);
    setContacts((coData ?? []) as Contact[]);
    setLoading(false);
  };
  useEffect(() => { if (role && (ALLOWED as readonly string[]).includes(role)) load(); }, [role]);

  const contratLabel = (id: string) => {
    const c = contrats.find((x) => x.id === id); if (!c) return "—";
    const lot = lots.find((l) => l.id === c.lot_id);
    const bienTitre = lot ? (biens.find((b) => b.id === lot.bien_id)?.titre ?? "—") : "—";
    const lotLabel = lot ? lot.label : "—";
    const loc = c.locataire_id ? contacts.find((x) => x.id === c.locataire_id) : null;
    const locStr = loc ? `${loc.nom}${loc.prenom ? ` ${loc.prenom}` : ""}` : "—";
    return `${bienTitre} — ${lotLabel} — ${locStr}`;
  };

  const resetForm = () => setForm({ contrat_id: "", type: "entree", date_realisation: "", observations: "" });
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.contrat_id || !form.date_realisation) return toast.error("Contrat et date obligatoires");
    setSaving(true);
    const { error } = await supabase.from("etats_des_lieux").insert({
      contrat_id: form.contrat_id, type: form.type,
      date_realisation: form.date_realisation, observations: form.observations.trim() || null,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("État des lieux enregistré"); setOpen(false); resetForm(); load();
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
      <main className="mx-auto max-w-6xl px-6 py-10">
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div><CardTitle>États des lieux</CardTitle><CardDescription>{canWrite ? "Entrées et sorties des locataires." : "Consultation (lecture seule)."}</CardDescription></div>
            {canWrite && (
              <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) resetForm(); }}>
                <DialogTrigger asChild><Button size="sm"><Plus className="mr-2 h-4 w-4" /> Nouveau</Button></DialogTrigger>
                <DialogContent>
                  <form onSubmit={handleCreate}>
                    <DialogHeader><DialogTitle>Nouvel état des lieux</DialogTitle><DialogDescription>Enregistrer un état des lieux lié à un contrat.</DialogDescription></DialogHeader>
                    <div className="grid gap-4 py-4">
                      <div className="grid gap-2"><Label>Contrat *</Label>
                        <Select value={form.contrat_id} onValueChange={(v) => setForm({ ...form, contrat_id: v })}>
                          <SelectTrigger><SelectValue placeholder="Sélectionner..." /></SelectTrigger>
                          <SelectContent>{contrats.map((c) => <SelectItem key={c.id} value={c.id}>{contratLabel(c.id)}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="grid gap-2"><Label>Type</Label>
                          <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent><SelectItem value="entree">Entrée</SelectItem><SelectItem value="sortie">Sortie</SelectItem></SelectContent>
                          </Select>
                        </div>
                        <div className="grid gap-2"><Label htmlFor="dr">Date *</Label><Input id="dr" type="date" required value={form.date_realisation} onChange={(e) => setForm({ ...form, date_realisation: e.target.value })} /></div>
                      </div>
                      <div className="grid gap-2"><Label htmlFor="obs">Observations</Label><Textarea id="obs" rows={4} value={form.observations} onChange={(e) => setForm({ ...form, observations: e.target.value })} /></div>
                    </div>
                    <DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>Annuler</Button><Button type="submit" disabled={saving}>{saving ? "..." : "Enregistrer"}</Button></DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            )}
          </CardHeader>
          <CardContent>
            {loading ? <p className="text-sm text-muted-foreground">Chargement...</p> : items.length === 0 ? <p className="text-sm text-muted-foreground">Aucun état des lieux.</p> : (
              <div className="overflow-x-auto"><Table>
                <TableHeader><TableRow><TableHead>Contrat</TableHead><TableHead>Type</TableHead><TableHead>Date</TableHead><TableHead>Observations</TableHead></TableRow></TableHeader>
                <TableBody>{items.map((e) => (
                  <TableRow key={e.id}><TableCell className="font-medium">{contratLabel(e.contrat_id)}</TableCell><TableCell><Badge variant={e.type === "entree" ? "default" : "secondary"}>{e.type === "entree" ? "Entrée" : "Sortie"}</Badge></TableCell><TableCell>{new Date(e.date_realisation).toLocaleDateString("fr-FR")}</TableCell><TableCell className="max-w-md truncate">{e.observations ?? "—"}</TableCell></TableRow>
                ))}</TableBody>
              </Table></div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
