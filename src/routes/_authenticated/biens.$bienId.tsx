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
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Building2, ArrowLeft, Plus, Pencil } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/biens/$bienId")({
  head: () => ({ meta: [{ title: "Fiche bien — Agence Immobilière" }] }),
  component: BienDetailPage,
});

const TYPES_BIEN = [
  { value: "immeuble", label: "Immeuble" },
  { value: "appartement", label: "Appartement" },
  { value: "maison", label: "Maison" },
  { value: "local_commercial", label: "Local commercial" },
  { value: "terrain", label: "Terrain" },
] as const;

const STATUTS_BIEN = [
  { value: "vacant", label: "Vacant" },
  { value: "loue", label: "Loué" },
  { value: "en_travaux", label: "En travaux" },
] as const;

const STATUTS_LOT = [
  { value: "vacant", label: "Vacant" },
  { value: "loue", label: "Loué" },
  { value: "en_travaux", label: "En travaux" },
] as const;
const STATUT_LABEL: Record<string, string> = Object.fromEntries(STATUTS_LOT.map((s) => [s.value, s.label]));

type Bien = {
  id: string; titre: string; adresse: string | null; type_bien: string | null; statut: string;
  surface: number | null; notes: string | null; bailleur_id: string | null; gestionnaire_id: string | null;
};
type Bailleur = { id: string; nom: string; prenom: string | null };
type Lot = { id: string; bien_id: string; label: string; type_lot: string | null; statut: string; surface: number | null; notes: string | null };
type Contact = { id: string; nom: string; prenom: string | null; type_entite: string | null; interlocuteur: string | null };
type Contrat = { id: string; lot_id: string; loyer_mensuel: number | null; statut: string };
type Travail = { id: string; titre: string; statut: string; date_debut: string | null; date_fin: string | null; budget_prevu: number | null };
type Reclamation = { id: string; titre: string; statut: string; priorite: string; created_at: string };

const fmtMoney = (n: number | null) => (n == null ? "—" : Number(n).toLocaleString("fr-FR") + " F");
const contactName = (c: Contact) => c.type_entite === "entreprise" ? c.nom : `${c.nom}${c.prenom ? ` ${c.prenom}` : ""}`;

function BienDetailPage() {
  const { bienId } = Route.useParams();
  const navigate = useNavigate();
  const [bien, setBien] = useState<Bien | null>(null);
  const [bailleur, setBailleur] = useState<Contact | null>(null);
  const [gestionnaireEmail, setGestionnaireEmail] = useState<string | null>(null);
  const [lots, setLots] = useState<Lot[]>([]);
  const [activeContrats, setActiveContrats] = useState<Contrat[]>([]);
  const [travaux, setTravaux] = useState<Travail[]>([]);
  const [reclamations, setReclamations] = useState<Reclamation[]>([]);
  const [bailleurs, setBailleurs] = useState<Bailleur[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ label: "", type_lot: "", statut: "vacant", surface: "", notes: "" });

  const [editOpen, setEditOpen] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editForm, setEditForm] = useState({
    titre: "", adresse: "", type_bien: "", statut: "vacant", surface: "", bailleur_id: "", notes: "",
  });

  const load = async () => {
    setLoading(true);
    const [{ data: bData, error: bErr }, { data: lData }, { data: tData }, { data: rData }] = await Promise.all([
      supabase.from("biens").select("id, titre, adresse, type_bien, statut, surface, notes, bailleur_id, gestionnaire_id").eq("id", bienId).maybeSingle(),
      supabase.from("lots").select("*").eq("bien_id", bienId).order("label"),
      supabase.from("travaux").select("id, titre, statut, date_debut, date_fin, budget_prevu").eq("bien_id", bienId).order("date_debut", { ascending: false }),
      supabase.from("reclamations").select("id, titre, statut, priorite, created_at").eq("bien_id", bienId).order("created_at", { ascending: false }),
    ]);
    if (bErr) toast.error(bErr.message);
    const b = (bData ?? null) as Bien | null;
    setBien(b);
    const lotsList = (lData ?? []) as Lot[];
    setLots(lotsList);
    setTravaux((tData ?? []) as Travail[]);
    setReclamations((rData ?? []) as Reclamation[]);

    if (b?.bailleur_id) {
      const { data } = await supabase.from("contacts").select("id, nom, prenom, type_entite, interlocuteur").eq("id", b.bailleur_id).maybeSingle();
      setBailleur((data ?? null) as Contact | null);
    } else setBailleur(null);
    if (b?.gestionnaire_id) {
      const { data } = await supabase.from("profiles").select("email").eq("id", b.gestionnaire_id).maybeSingle();
      setGestionnaireEmail((data as any)?.email ?? null);
    } else setGestionnaireEmail(null);

    if (lotsList.length) {
      const { data: cData } = await supabase
        .from("contrats").select("id, lot_id, loyer_mensuel, statut")
        .in("lot_id", lotsList.map((l) => l.id)).eq("statut", "actif");
      setActiveContrats((cData ?? []) as Contrat[]);
    } else setActiveContrats([]);

    setLoading(false);
  };
  useEffect(() => { load(); }, [bienId]);

  const resetForm = () => setForm({ label: "", type_lot: "", statut: "vacant", surface: "", notes: "" });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.label.trim()) return toast.error("Le label est obligatoire");
    setSaving(true);
    const { error } = await supabase.from("lots").insert({
      bien_id: bienId,
      label: form.label.trim(),
      type_lot: form.type_lot.trim() || null,
      statut: form.statut || "vacant",
      surface: form.surface ? Number(form.surface) : null,
      notes: form.notes.trim() || null,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Lot ajouté");
    setOpen(false);
    resetForm();
    load();
  };

  const rentByLot = new Map(activeContrats.map((c) => [c.lot_id, Number(c.loyer_mensuel ?? 0)]));
  const nbLoues = lots.filter((l) => rentByLot.has(l.id)).length;
  const nbVacants = lots.length - nbLoues;
  const revenu = Array.from(rentByLot.values()).reduce((a, b) => a + b, 0);

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            <span className="font-semibold">Agence Immobilière</span>
          </div>
          <Button variant="outline" size="sm" onClick={() => navigate({ to: "/biens" })}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Retour aux biens
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-10 space-y-6">
        {loading ? (
          <p className="text-sm text-muted-foreground">Chargement...</p>
        ) : !bien ? (
          <p className="text-sm text-muted-foreground">Bien introuvable.</p>
        ) : (
          <>
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3 flex-wrap">
                  <CardTitle>{bien.titre}</CardTitle>
                  <Badge variant="secondary">Immeuble</Badge>
                </div>
                <CardDescription>{bien.adresse ?? "Adresse non renseignée"}</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-2 sm:grid-cols-3 text-sm">
                <div>
                  <span className="text-muted-foreground">Bailleur : </span>
                  {bailleur ? (
                    <Link to="/contacts/$contactId" params={{ contactId: bailleur.id }} className="underline">
                      {contactName(bailleur)}
                    </Link>
                  ) : "—"}
                </div>
                <div><span className="text-muted-foreground">Gestionnaire : </span>{gestionnaireEmail ?? "—"}</div>
                <div><span className="text-muted-foreground">Surface : </span>{bien.surface ?? "—"}</div>
                {bien.notes && <div className="sm:col-span-3"><span className="text-muted-foreground">Notes : </span>{bien.notes}</div>}
              </CardContent>
            </Card>

            <div className="grid gap-4 sm:grid-cols-4">
              <Card><CardHeader><CardDescription>Nombre de lots</CardDescription><CardTitle className="text-2xl">{lots.length}</CardTitle></CardHeader></Card>
              <Card><CardHeader><CardDescription>Loués</CardDescription><CardTitle className="text-2xl">{nbLoues}</CardTitle></CardHeader></Card>
              <Card><CardHeader><CardDescription>Vacants</CardDescription><CardTitle className="text-2xl">{nbVacants}</CardTitle></CardHeader></Card>
              <Card><CardHeader><CardDescription>Revenu mensuel</CardDescription><CardTitle className="text-2xl">{fmtMoney(revenu)}</CardTitle></CardHeader></Card>
            </div>

            <Card>
              <CardHeader className="flex flex-row items-start justify-between gap-4">
                <div>
                  <CardTitle>Lots</CardTitle>
                  <CardDescription>Unités louables rattachées à ce bien.</CardDescription>
                </div>
                <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) resetForm(); }}>
                  <DialogTrigger asChild>
                    <Button size="sm"><Plus className="mr-2 h-4 w-4" /> Nouveau lot</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <form onSubmit={handleCreate}>
                      <DialogHeader>
                        <DialogTitle>Nouveau lot</DialogTitle>
                        <DialogDescription>Ajouter un lot au bien {bien.titre}.</DialogDescription>
                      </DialogHeader>
                      <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                          <Label htmlFor="label">Label *</Label>
                          <Input id="label" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="1er étage N°7" required />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="grid gap-2">
                            <Label htmlFor="type_lot">Type de lot</Label>
                            <Input id="type_lot" value={form.type_lot} onChange={(e) => setForm({ ...form, type_lot: e.target.value })} placeholder="appartement, studio, magasin..." />
                          </div>
                          <div className="grid gap-2">
                            <Label>Statut</Label>
                            <Select value={form.statut} onValueChange={(v) => setForm({ ...form, statut: v })}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {STATUTS_LOT.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="surface">Surface (m²)</Label>
                          <Input id="surface" type="number" min="0" step="0.01" value={form.surface} onChange={(e) => setForm({ ...form, surface: e.target.value })} />
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="notes">Notes</Label>
                          <Textarea id="notes" rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                        </div>
                      </div>
                      <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
                        <Button type="submit" disabled={saving}>{saving ? "..." : "Enregistrer"}</Button>
                      </DialogFooter>
                    </form>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent>
                {lots.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Aucun lot pour ce bien.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Label</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Statut</TableHead>
                          <TableHead>Loyer actuel</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {lots.map((l) => (
                          <TableRow key={l.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate({ to: "/lots/$lotId", params: { lotId: l.id } })}>
                            <TableCell className="font-medium">{l.label}</TableCell>
                            <TableCell>{l.type_lot ?? "—"}</TableCell>
                            <TableCell><Badge>{STATUT_LABEL[l.statut] ?? l.statut}</Badge></TableCell>
                            <TableCell>{rentByLot.has(l.id) ? fmtMoney(rentByLot.get(l.id)!) : "—"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Travaux</CardTitle>
                <CardDescription>Travaux planifiés ou réalisés sur ce bien.</CardDescription>
              </CardHeader>
              <CardContent>
                {travaux.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Aucun travail.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Titre</TableHead>
                          <TableHead>Statut</TableHead>
                          <TableHead>Début</TableHead>
                          <TableHead>Fin</TableHead>
                          <TableHead>Budget prévu</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {travaux.map((t) => (
                          <TableRow key={t.id}>
                            <TableCell className="font-medium">{t.titre}</TableCell>
                            <TableCell><Badge>{t.statut}</Badge></TableCell>
                            <TableCell>{t.date_debut ? new Date(t.date_debut).toLocaleDateString("fr-FR") : "—"}</TableCell>
                            <TableCell>{t.date_fin ? new Date(t.date_fin).toLocaleDateString("fr-FR") : "—"}</TableCell>
                            <TableCell>{fmtMoney(t.budget_prevu)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Réclamations</CardTitle>
                <CardDescription>Réclamations liées à ce bien.</CardDescription>
              </CardHeader>
              <CardContent>
                {reclamations.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Aucune réclamation.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Titre</TableHead>
                          <TableHead>Priorité</TableHead>
                          <TableHead>Statut</TableHead>
                          <TableHead>Créée le</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {reclamations.map((r) => (
                          <TableRow key={r.id}>
                            <TableCell className="font-medium">{r.titre}</TableCell>
                            <TableCell><Badge variant="outline">{r.priorite}</Badge></TableCell>
                            <TableCell><Badge>{r.statut}</Badge></TableCell>
                            <TableCell>{new Date(r.created_at).toLocaleDateString("fr-FR")}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </main>
    </div>
  );
}
