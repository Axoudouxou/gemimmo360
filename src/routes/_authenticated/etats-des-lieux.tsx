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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Building2, ArrowLeft, Plus, Trash2, FileText, Pencil } from "lucide-react";
import { DocumentsSection } from "@/components/documents-section";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/etats-des-lieux")({
  head: () => ({ meta: [{ title: "États des lieux — Agence Immobilière" }] }),
  component: EDLPage,
});

const NO_ACCESS = ["recouvrement", "en_attente"] as const;

const RESPONSABLES = [
  { value: "bailleur", label: "Bailleur" },
  { value: "locataire", label: "Locataire" },
  { value: "usure_normale", label: "Usure normale" },
] as const;

type EDL = { id: string; contrat_id: string; type: string; date_realisation: string; observations: string | null };
type Contrat = { id: string; lot_id: string; locataire_id: string | null };
type Lot = { id: string; label: string; bien_id: string };
type Bien = { id: string; titre: string };
type Contact = { id: string; nom: string; prenom: string | null };

type Anomalie = {
  description: string;
  zone: string;
  responsable: "bailleur" | "locataire" | "usure_normale" | "";
  necessite_travaux: boolean;
};

const newAnomalie = (): Anomalie => ({ description: "", zone: "", responsable: "", necessite_travaux: true });

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
  const [editing, setEditing] = useState<EDL | null>(null);
  const [anomalies, setAnomalies] = useState<Anomalie[]>([newAnomalie()]);
  const [summary, setSummary] = useState<{ count: number; travaux: { id: string; titre: string }[] } | null>(null);
  const [search, setSearch] = useState("");
  const [fType, setFType] = useState("all");
  const [dFrom, setDFrom] = useState("");
  const [dTo, setDTo] = useState("");

  const canWrite = role ? !(NO_ACCESS as readonly string[]).includes(role) : false;

  useEffect(() => {
    (async () => {
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes.user?.id;
      if (!uid) { setChecked(true); return; }
      const { data: p } = await supabase.from("profiles").select("role").eq("id", uid).maybeSingle();
      const r = p?.role ?? null;
      setRole(r); setChecked(true);
      if (!r || (NO_ACCESS as readonly string[]).includes(r)) {
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
  useEffect(() => { if (role && !(NO_ACCESS as readonly string[]).includes(role)) load(); }, [role]);

  const contratLabel = (id: string) => {
    const c = contrats.find((x) => x.id === id); if (!c) return "—";
    const lot = lots.find((l) => l.id === c.lot_id);
    const bienTitre = lot ? (biens.find((b) => b.id === lot.bien_id)?.titre ?? "—") : "—";
    const lotLabel = lot ? lot.label : "—";
    const loc = c.locataire_id ? contacts.find((x) => x.id === c.locataire_id) : null;
    const locStr = loc ? `${loc.nom}${loc.prenom ? ` ${loc.prenom}` : ""}` : "—";
    return `${bienTitre} — ${lotLabel} — ${locStr}`;
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((e) => {
      if (fType !== "all" && e.type !== fType) return false;
      if (dFrom && e.date_realisation < dFrom) return false;
      if (dTo && e.date_realisation > dTo) return false;
      if (q && !contratLabel(e.contrat_id).toLowerCase().includes(q)) return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, search, fType, dFrom, dTo, contrats, lots, biens, contacts]);

  const resetForm = () => {
    setForm({ contrat_id: "", type: "entree", date_realisation: "", observations: "" });
    setAnomalies([newAnomalie()]);
  };

  const updateAno = (i: number, patch: Partial<Anomalie>) => {
    setAnomalies((prev) => prev.map((a, idx) => {
      if (idx !== i) return a;
      const next = { ...a, ...patch };
      if (patch.responsable === "usure_normale") next.necessite_travaux = false;
      return next;
    }));
  };
  const addAno = () => setAnomalies((p) => [...p, newAnomalie()]);
  const removeAno = (i: number) => setAnomalies((p) => p.length === 1 ? [newAnomalie()] : p.filter((_, idx) => idx !== i));

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.contrat_id || !form.date_realisation) return toast.error("Contrat et date obligatoires");

    // Validate anomalies (only rows with any content)
    const filled = anomalies.filter((a) => a.description.trim() || a.zone.trim() || a.responsable);
    for (const a of filled) {
      if (!a.description.trim()) return toast.error("Description d'anomalie obligatoire");
      if (!a.responsable) return toast.error("Responsable d'anomalie obligatoire");
    }

    setSaving(true);
    const { data: edl, error } = await supabase.from("etats_des_lieux").insert({
      contrat_id: form.contrat_id, type: form.type,
      date_realisation: form.date_realisation, observations: form.observations.trim() || null,
    }).select("id, date_realisation").single();

    if (error || !edl) { setSaving(false); return toast.error(error?.message ?? "Erreur"); }

    // Build travaux to create
    const contrat = contrats.find((c) => c.id === form.contrat_id);
    const lot = contrat ? lots.find((l) => l.id === contrat.lot_id) : null;
    const bienId = lot?.bien_id;

    const toCreate = filled.filter((a) => a.necessite_travaux && a.responsable !== "usure_normale");
    let created: { id: string; titre: string }[] = [];

    if (toCreate.length && bienId) {
      const dateStr = new Date(edl.date_realisation).toLocaleDateString("fr-FR");
      const rows = toCreate.map((a) => ({
        bien_id: bienId,
        titre: a.description.trim(),
        description: a.zone.trim() ? `Zone: ${a.zone.trim()}` : null,
        statut: "planifie",
        budget_depense: 0,
        origine: "etat_des_lieux",
        charge_financiere: a.responsable,
        etat_des_lieux_id: edl.id,
        notes: `Créé automatiquement depuis l'état des lieux du ${dateStr}`,
      }));
      const { data: tData, error: tErr } = await supabase.from("travaux").insert(rows).select("id, titre");
      if (tErr) toast.error("EDL enregistré, mais erreur création travaux: " + tErr.message);
      else created = (tData ?? []) as { id: string; titre: string }[];
    } else if (toCreate.length && !bienId) {
      toast.error("Bien introuvable pour ce contrat, travaux non créés");
    }

    setSaving(false);
    setOpen(false);
    resetForm();
    load();
    setSummary({ count: created.length, travaux: created });
    toast.success(`État des lieux enregistré, ${created.length} travaux créés`);
  };

  const openEdit = (e: EDL) => {
    setEditing(e);
    setForm({ contrat_id: e.contrat_id, type: e.type, date_realisation: e.date_realisation, observations: e.observations ?? "" });
    setAnomalies([newAnomalie()]);
    setOpen(true);
  };
  const handleUpdate = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!editing) return;
    if (!form.contrat_id || !form.date_realisation) return toast.error("Contrat et date obligatoires");
    setSaving(true);
    const { error } = await supabase.from("etats_des_lieux").update({
      contrat_id: form.contrat_id, type: form.type,
      date_realisation: form.date_realisation, observations: form.observations.trim() || null,
    }).eq("id", editing.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("État des lieux modifié"); setOpen(false); setEditing(null); resetForm(); load();
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
                <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
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
                      <div className="grid gap-2"><Label htmlFor="obs">Observations</Label><Textarea id="obs" rows={3} value={form.observations} onChange={(e) => setForm({ ...form, observations: e.target.value })} /></div>

                      <div className="border-t pt-4">
                        <div className="flex items-center justify-between mb-3">
                          <div>
                            <Label className="text-base">Anomalies constatées</Label>
                            <p className="text-xs text-muted-foreground">Les anomalies cochées créeront automatiquement des travaux.</p>
                          </div>
                          <Button type="button" size="sm" variant="outline" onClick={addAno}><Plus className="mr-1 h-3 w-3" /> Ajouter</Button>
                        </div>
                        <div className="space-y-3">
                          {anomalies.map((a, i) => (
                            <div key={i} className="rounded-md border p-3 space-y-2 bg-muted/20">
                              <div className="flex items-start justify-between gap-2">
                                <span className="text-xs font-medium text-muted-foreground">Anomalie #{i + 1}</span>
                                <Button type="button" size="sm" variant="ghost" onClick={() => removeAno(i)}><Trash2 className="h-3 w-3" /></Button>
                              </div>
                              <div className="grid gap-2">
                                <Label className="text-xs">Description *</Label>
                                <Input value={a.description} onChange={(e) => updateAno(i, { description: e.target.value })} placeholder="Ex: Robinet cassé" />
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <div className="grid gap-2">
                                  <Label className="text-xs">Pièce / zone</Label>
                                  <Input value={a.zone} onChange={(e) => updateAno(i, { zone: e.target.value })} placeholder="Ex: Cuisine" />
                                </div>
                                <div className="grid gap-2">
                                  <Label className="text-xs">Responsable *</Label>
                                  <Select value={a.responsable} onValueChange={(v) => updateAno(i, { responsable: v as Anomalie["responsable"] })}>
                                    <SelectTrigger><SelectValue placeholder="Sélectionner..." /></SelectTrigger>
                                    <SelectContent>{RESPONSABLES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
                                  </Select>
                                </div>
                              </div>
                              <div className="flex items-center gap-2 pt-1">
                                <Checkbox
                                  id={`nt-${i}`}
                                  checked={a.necessite_travaux}
                                  disabled={a.responsable === "usure_normale"}
                                  onCheckedChange={(v) => updateAno(i, { necessite_travaux: !!v })}
                                />
                                <Label htmlFor={`nt-${i}`} className="text-xs cursor-pointer">Nécessite des travaux</Label>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button type="button" variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
                      <Button type="submit" disabled={saving}>{saving ? "..." : "Enregistrer et créer les travaux"}</Button>
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
              searchPlaceholder="Bien, lot ou locataire..."
              selects={[
                { key: "type", label: "Type", value: fType, onChange: setFType, options: [{ value: "entree", label: "Entrée" }, { value: "sortie", label: "Sortie" }] },
              ]}
              dateRange={{ label: "Date", from: dFrom, to: dTo, onFromChange: setDFrom, onToChange: setDTo }}
              onReset={() => { setSearch(""); setFType("all"); setDFrom(""); setDTo(""); }}
            />
            {loading ? <p className="text-sm text-muted-foreground">Chargement...</p> : filtered.length === 0 ? <p className="text-sm text-muted-foreground">Aucun état des lieux.</p> : (
              <div className="overflow-x-auto"><Table>
                <TableHeader><TableRow><TableHead>Contrat</TableHead><TableHead>Type</TableHead><TableHead>Date</TableHead><TableHead>Observations</TableHead><TableHead className="w-[110px]">Documents</TableHead></TableRow></TableHeader>
                <TableBody>{filtered.map((e) => (
                  <TableRow key={e.id}><TableCell className="font-medium">{contratLabel(e.contrat_id)}</TableCell><TableCell><Badge variant={e.type === "entree" ? "default" : "secondary"}>{e.type === "entree" ? "Entrée" : "Sortie"}</Badge></TableCell><TableCell>{new Date(e.date_realisation).toLocaleDateString("fr-FR")}</TableCell><TableCell className="max-w-md truncate">{e.observations ?? "—"}</TableCell><TableCell><DocsButton edlId={e.id} canWrite={canWrite} /></TableCell></TableRow>
                ))}</TableBody>
              </Table></div>
            )}
          </CardContent>
        </Card>


        <Dialog open={!!summary} onOpenChange={(o) => { if (!o) setSummary(null); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>État des lieux enregistré</DialogTitle>
              <DialogDescription>{summary?.count ?? 0} travaux créés automatiquement.</DialogDescription>
            </DialogHeader>
            {summary && summary.travaux.length > 0 && (
              <ul className="space-y-2 py-2">
                {summary.travaux.map((t) => (
                  <li key={t.id}>
                    <Link to="/travaux" className="text-sm text-primary hover:underline">• {t.titre}</Link>
                  </li>
                ))}
              </ul>
            )}
            <DialogFooter>
              <Button onClick={() => setSummary(null)}>Fermer</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}

function DocsButton({ edlId, canWrite }: { edlId: string; canWrite: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline"><FileText className="mr-1 h-3 w-3" /> Documents</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Documents de l'état des lieux</DialogTitle></DialogHeader>
        <DocumentsSection bucket="edl-documents" recordId={edlId} canWrite={canWrite} description="Rapport Kizeo et pièces jointes (PDF)." />
      </DialogContent>
    </Dialog>
  );
}

