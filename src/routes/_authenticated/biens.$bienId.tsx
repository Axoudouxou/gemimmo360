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
import { Building2, ArrowLeft, Plus, Pencil, UserCog, AlertCircle } from "lucide-react";
import { DeleteZone } from "@/components/delete-zone";
import { ActivitesLiees } from "@/components/activites-widgets";
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
  updated_at: string | null;
};
type Bailleur = { id: string; nom: string; prenom: string | null };
type Lot = { id: string; bien_id: string; label: string; type_lot: string | null; statut: string; surface: number | null; notes: string | null };
type Contact = { id: string; nom: string; prenom: string | null; type_entite: string | null; interlocuteur: string | null };
type Contrat = { id: string; lot_id: string; loyer_mensuel: number | null; statut: string };
type Travail = { id: string; titre: string; statut: string; date_debut: string | null; date_fin: string | null; budget_prevu: number | null };
type Reclamation = { id: string; titre: string; statut: string; priorite: string; created_at: string };
type Gestionnaire = { id: string; email: string | null; role: string };
type Charge = { id: string; montant: number | null; date: string | null; recurrente: boolean | null; created_at: string };

const fmtMoney = (n: number | null) => (n == null ? "—" : Number(n).toLocaleString("fr-FR") + " FCFA");
const contactName = (c: Contact) => c.type_entite === "entreprise" ? c.nom : `${c.nom}${c.prenom ? ` ${c.prenom}` : ""}`;
const isStale = (d?: string | null) => !!d && Date.now() - new Date(d).getTime() > 1000 * 60 * 60 * 24 * 30 * 6;

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
  const [charges, setCharges] = useState<Charge[]>([]);
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

  const [myRole, setMyRole] = useState<string>("");
  const [gestOpen, setGestOpen] = useState(false);
  const [gestSaving, setGestSaving] = useState(false);
  const [gestionnaires, setGestionnaires] = useState<Gestionnaire[]>([]);
  const [gestId, setGestId] = useState("");

  const load = async () => {
    setLoading(true);
    const { data: userRes } = await supabase.auth.getUser();
    if (userRes.user) {
      const { data: p } = await supabase.from("profiles").select("role").eq("id", userRes.user.id).maybeSingle();
      setMyRole(p?.role ?? "");
    }
    const [{ data: bData, error: bErr }, { data: lData }, { data: tData }, { data: rData }, { data: bDataList, error: bListErr }, { data: chData }] = await Promise.all([
      supabase.from("biens").select("id, titre, adresse, type_bien, statut, surface, notes, bailleur_id, gestionnaire_id, updated_at").eq("id", bienId).maybeSingle(),
      supabase.from("lots").select("*").eq("bien_id", bienId).order("label"),
      supabase.from("travaux").select("id, titre, statut, date_debut, date_fin, budget_prevu").eq("bien_id", bienId).order("date_debut", { ascending: false }),
      supabase.from("reclamations").select("id, titre, statut, priorite, created_at").eq("bien_id", bienId).order("created_at", { ascending: false }),
      supabase.from("contacts").select("id, nom, prenom").eq("type_contact", "bailleur").eq("archive", false).order("nom"),
      supabase.from("charges").select("id, montant, date, recurrente, created_at").eq("bien_id", bienId),
    ]);
    if (bErr) toast.error(bErr.message);
    if (bListErr) toast.error(bListErr.message);
    const b = (bData ?? null) as Bien | null;
    setBien(b);
    setBailleurs((bDataList ?? []) as Bailleur[]);
    const lotsList = (lData ?? []) as Lot[];
    setLots(lotsList);
    setTravaux((tData ?? []) as Travail[]);
    setReclamations((rData ?? []) as Reclamation[]);
    setCharges((chData ?? []) as Charge[]);

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

  const resetEditForm = () => {
    if (!bien) return;
    setEditForm({
      titre: bien.titre,
      adresse: bien.adresse ?? "",
      type_bien: bien.type_bien ?? "",
      statut: bien.statut,
      surface: bien.surface?.toString() ?? "",
      bailleur_id: bien.bailleur_id ?? "",
      notes: bien.notes ?? "",
    });
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editForm.titre.trim()) return toast.error("Le titre est obligatoire");
    setEditSaving(true);
    const { error } = await supabase.from("biens").update({
      titre: editForm.titre.trim(),
      adresse: editForm.adresse.trim() || null,
      type_bien: editForm.type_bien || null,
      statut: editForm.statut,
      surface: editForm.surface ? Number(editForm.surface) : null,
      bailleur_id: editForm.bailleur_id || null,
      notes: editForm.notes.trim() || null,
    }).eq("id", bienId);
    setEditSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Bien mis à jour");
    setEditOpen(false);
    load();
  };

  useEffect(() => { resetEditForm(); setGestId(bien?.gestionnaire_id ?? ""); }, [bien]);

  const openGestionnaire = async () => {
    setGestOpen(true);
    if (gestionnaires.length === 0) {
      const { data } = await supabase.from("profiles").select("id, email, role").in("role", ["gestion_locative", "commercial", "admin", "direction"]).order("email");
      setGestionnaires((data ?? []) as Gestionnaire[]);
    }
  };

  const handleGestionnaireSave = async () => {
    setGestSaving(true);
    const { error } = await supabase.from("biens").update({ gestionnaire_id: gestId || null }).eq("id", bienId);
    setGestSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Gestionnaire mis à jour");
    setGestOpen(false);
    load();
  };

  const rentByLot = new Map(activeContrats.map((c) => [c.lot_id, Number(c.loyer_mensuel ?? 0)]));
  const nbLoues = lots.filter((l) => rentByLot.has(l.id)).length;
  const nbVacants = lots.length - nbLoues;
  const revenu = Array.from(rentByLot.values()).reduce((a, b) => a + b, 0);

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const totalCharges = charges.reduce((sum, c) => {
    const montant = Number(c.montant ?? 0);
    if (c.recurrente) return sum + montant;
    const ref = c.date ? new Date(c.date) : new Date(c.created_at);
    if (ref >= monthStart && ref < new Date(now.getFullYear(), now.getMonth() + 1, 1)) return sum + montant;
    return sum;
  }, 0);
  const rentabilite = revenu - totalCharges;

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
              <CardHeader className="flex flex-row items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <CardTitle>{bien.titre}</CardTitle>
                    <Badge variant="secondary">Immeuble</Badge>
                    {isStale(bien.updated_at) && (
                      <Badge variant="outline" className="border-amber-500 text-amber-700">
                        <AlertCircle className="mr-1 h-3 w-3" /> À vérifier
                      </Badge>
                    )}
                  </div>
                  <CardDescription>{bien.adresse ?? "Adresse non renseignée"}</CardDescription>
                </div>
                <div className="flex gap-2 flex-wrap justify-end">
                  <ActivitesLiees bienId={bienId} />
                  {myRole === "admin" && (
                    <Dialog open={gestOpen} onOpenChange={(o) => (o ? openGestionnaire() : setGestOpen(false))}>
                      <DialogTrigger asChild>
                        <Button variant="outline" size="sm"><UserCog className="mr-2 h-4 w-4" /> Gestionnaire</Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Modifier le gestionnaire</DialogTitle>
                          <DialogDescription>Réassigner ce bien à un autre gestionnaire.</DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-2 py-4">
                          <Label>Gestionnaire</Label>
                          <Select value={gestId} onValueChange={setGestId}>
                            <SelectTrigger><SelectValue placeholder="Sélectionner..." /></SelectTrigger>
                            <SelectContent>
                              {gestionnaires.map((g) => <SelectItem key={g.id} value={g.id}>{g.email ?? g.id} ({g.role})</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <DialogFooter>
                          <Button variant="outline" onClick={() => setGestOpen(false)}>Annuler</Button>
                          <Button onClick={handleGestionnaireSave} disabled={gestSaving}>{gestSaving ? "..." : "Enregistrer"}</Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  )}
                  <Dialog open={editOpen} onOpenChange={(o) => { setEditOpen(o); if (o) resetEditForm(); }}>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm"><Pencil className="mr-2 h-4 w-4" /> Modifier</Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-lg">
                    <form onSubmit={handleUpdate}>
                      <DialogHeader>
                        <DialogTitle>Modifier bien</DialogTitle>
                        <DialogDescription>Modifier les informations de {bien.titre}.</DialogDescription>
                      </DialogHeader>
                      <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                          <Label htmlFor="edit-titre">Titre *</Label>
                          <Input id="edit-titre" value={editForm.titre} onChange={(e) => setEditForm({ ...editForm, titre: e.target.value })} required />
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="edit-adresse">Adresse</Label>
                          <Input id="edit-adresse" value={editForm.adresse} onChange={(e) => setEditForm({ ...editForm, adresse: e.target.value })} />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="grid gap-2">
                            <Label>Type de bien</Label>
                            <Select value={editForm.type_bien} onValueChange={(v) => setEditForm({ ...editForm, type_bien: v })}>
                              <SelectTrigger><SelectValue placeholder="Sélectionner..." /></SelectTrigger>
                              <SelectContent>
                                {TYPES_BIEN.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="grid gap-2">
                            <Label>Statut</Label>
                            <Select value={editForm.statut} onValueChange={(v) => setEditForm({ ...editForm, statut: v })}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {STATUTS_BIEN.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="grid gap-2">
                            <Label htmlFor="edit-surface">Surface (m²)</Label>
                            <Input id="edit-surface" type="number" min="0" step="0.01" value={editForm.surface} onChange={(e) => setEditForm({ ...editForm, surface: e.target.value })} />
                          </div>
                          <div className="grid gap-2">
                            <Label>Bailleur</Label>
                            <Select value={editForm.bailleur_id} onValueChange={(v) => setEditForm({ ...editForm, bailleur_id: v })}>
                              <SelectTrigger>
                                <SelectValue placeholder={bailleurs.length ? "Sélectionner un bailleur..." : "Aucun bailleur disponible"} />
                              </SelectTrigger>
                              <SelectContent>
                                {bailleurs.map((b) => (
                                  <SelectItem key={b.id} value={b.id}>
                                    {b.nom}{b.prenom ? ` ${b.prenom}` : ""}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="edit-notes">Notes</Label>
                          <Textarea id="edit-notes" rows={3} value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} />
                        </div>
                      </div>
                      <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>Annuler</Button>
                        <Button type="submit" disabled={editSaving}>{editSaving ? "Enregistrement..." : "Enregistrer"}</Button>
                      </DialogFooter>
                    </form>
                  </DialogContent>
                </Dialog>
                </div>
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
            {myRole === "admin" && bien && (
              <DeleteZone
                entityLabel="ce bien"
                checkReferences={async () => {
                  const { count } = await supabase.from("lots").select("id", { count: "exact", head: true }).eq("bien_id", bienId);
                  if ((count ?? 0) > 0) return { blocked: true, message: `Ce bien a ${count} lot(s) rattaché(s) — supprimez ou déplacez d'abord les lots.` };
                  return { blocked: false, message: "Aucun lot rattaché. Cette suppression est définitive." };
                }}
                onDelete={async () => {
                  const { error } = await supabase.from("biens").delete().eq("id", bienId);
                  if (error) throw new Error(error.message);
                  toast.success("Bien supprimé");
                  navigate({ to: "/biens" });
                }}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}
