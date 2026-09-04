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
import { Building2, ArrowLeft, Pencil, UserCog } from "lucide-react";
import { DeleteZone } from "@/components/delete-zone";
import { SituationLocative } from "@/components/situation-locative";

import { ActivitesLiees } from "@/components/activites-widgets";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/contacts/$contactId")({
  head: () => ({ meta: [{ title: "Fiche contact — Agence Immobilière" }] }),
  component: ContactDetailPage,
});

type Contact = {
  id: string;
  nom: string;
  prenom: string | null;
  telephone: string | null;
  email: string | null;
  type_contact: string | null;
  type_entite: string | null;
  interlocuteur: string | null;
  notes: string | null;
  gestionnaire_id: string | null;
  updated_at: string | null;
};
type Bien = { id: string; titre: string; adresse: string | null; type_bien: string | null };
type Lot = { id: string; label: string; bien_id: string; statut: string };
type Contrat = { id: string; lot_id: string; loyer_mensuel: number | null; date_debut: string | null; date_fin: string | null; statut: string };
type Gestionnaire = { id: string; email: string | null; role: string };

const TYPE_LABEL: Record<string, string> = { bailleur: "Bailleur", locataire: "Locataire", prospect: "Prospect", prestataire: "Prestataire" };
const TYPES_CONTACT = [
  { value: "bailleur", label: "Bailleur" },
  { value: "locataire", label: "Locataire" },
  { value: "prospect", label: "Prospect" },
  { value: "prestataire", label: "Prestataire" },
] as const;

const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString("fr-FR") : "—");
const fmtMoney = (n: number | null) => (n == null ? "—" : Number(n).toLocaleString("fr-FR") + " FCFA");
const isStale = (d?: string | null) => !!d && Date.now() - new Date(d).getTime() > 1000 * 60 * 60 * 24 * 30 * 6;

type BienSummary = Bien & { nbLots: number; nbLoues: number; nbVacants: number; revenu: number };

function ContactDetailPage() {
  const { contactId } = Route.useParams();
  const navigate = useNavigate();
  const [contact, setContact] = useState<Contact | null>(null);
  const [biens, setBiens] = useState<BienSummary[]>([]);
  const [contrats, setContrats] = useState<(Contrat & { lot: Lot | null; bien: Bien | null })[]>([]);
  const [loading, setLoading] = useState(true);
  const [myRole, setMyRole] = useState<string>("");
  const [gestionnaireEmail, setGestionnaireEmail] = useState<string | null>(null);
  const [gestionnaires, setGestionnaires] = useState<Gestionnaire[]>([]);

  const [editOpen, setEditOpen] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editForm, setEditForm] = useState({
    nom: "", prenom: "", telephone: "", email: "", type_contact: "", type_entite: "personne", interlocuteur: "", notes: "",
  });

  const [gestOpen, setGestOpen] = useState(false);
  const [gestSaving, setGestSaving] = useState(false);
  const [gestId, setGestId] = useState<string>("");

  const load = async () => {
    setLoading(true);
    const { data: userRes } = await supabase.auth.getUser();
    if (userRes.user) {
      const { data: p } = await supabase.from("profiles").select("role").eq("id", userRes.user.id).maybeSingle();
      setMyRole(p?.role ?? "");
    }

    const { data: c, error } = await supabase.from("contacts").select("*").eq("id", contactId).maybeSingle();
    if (error) toast.error(error.message);
    const contactData = (c ?? null) as Contact | null;
    setContact(contactData);

    if (contactData?.gestionnaire_id) {
      const { data: g } = await supabase.from("profiles").select("email").eq("id", contactData.gestionnaire_id).maybeSingle();
      setGestionnaireEmail((g as any)?.email ?? null);
    } else setGestionnaireEmail(null);

    if (contactData?.type_contact === "bailleur") {
      const { data: bData } = await supabase.from("biens").select("id, titre, adresse, type_bien").eq("bailleur_id", contactId).order("titre");
      const bienList = (bData ?? []) as Bien[];
      if (bienList.length) {
        const ids = bienList.map((b) => b.id);
        const { data: lots } = await supabase.from("lots").select("id, label, bien_id, statut").in("bien_id", ids);
        const lotsList = (lots ?? []) as Lot[];
        const lotIds = lotsList.map((l) => l.id);
        const { data: cts } = lotIds.length
          ? await supabase.from("contrats").select("lot_id, loyer_mensuel, statut").in("lot_id", lotIds).eq("statut", "actif")
          : { data: [] as { lot_id: string; loyer_mensuel: number | null; statut: string }[] };
        const activeByLot = new Map<string, number>();
        (cts ?? []).forEach((x: any) => activeByLot.set(x.lot_id, Number(x.loyer_mensuel ?? 0)));
        setBiens(bienList.map((b) => {
          const bLots = lotsList.filter((l) => l.bien_id === b.id);
          const nbLoues = bLots.filter((l) => activeByLot.has(l.id)).length;
          return { ...b, nbLots: bLots.length, nbLoues, nbVacants: bLots.length - nbLoues, revenu: bLots.reduce((s, l) => s + (activeByLot.get(l.id) ?? 0), 0) };
        }));
      } else setBiens([]);
    }

    if (contactData?.type_contact === "locataire") {
      const { data: cts } = await supabase.from("contrats").select("*").eq("locataire_id", contactId).order("date_debut", { ascending: false });
      const ctsList = (cts ?? []) as Contrat[];
      if (ctsList.length) {
        const lotIds = Array.from(new Set(ctsList.map((c) => c.lot_id)));
        const { data: lots } = await supabase.from("lots").select("id, label, bien_id, statut").in("id", lotIds);
        const lotsList = (lots ?? []) as Lot[];
        const bienIds = Array.from(new Set(lotsList.map((l) => l.bien_id)));
        const { data: bs } = bienIds.length
          ? await supabase.from("biens").select("id, titre, adresse, type_bien").in("id", bienIds)
          : { data: [] as Bien[] };
        const lotMap = new Map(lotsList.map((l) => [l.id, l]));
        const bienMap = new Map((bs ?? []).map((b: any) => [b.id, b as Bien]));
        setContrats(ctsList.map((c) => {
          const lot = lotMap.get(c.lot_id) ?? null;
          const bien = lot ? bienMap.get(lot.bien_id) ?? null : null;
          return { ...c, lot, bien };
        }));
      } else setContrats([]);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [contactId]);

  useEffect(() => {
    if (!contact) return;
    setEditForm({
      nom: contact.nom,
      prenom: contact.prenom ?? "",
      telephone: contact.telephone ?? "",
      email: contact.email ?? "",
      type_contact: contact.type_contact ?? "",
      type_entite: contact.type_entite ?? "personne",
      interlocuteur: contact.interlocuteur ?? "",
      notes: contact.notes ?? "",
    });
    setGestId(contact.gestionnaire_id ?? "");
  }, [contact]);

  const openGestionnaire = async () => {
    setGestOpen(true);
    if (gestionnaires.length === 0) {
      const { data } = await supabase.from("profiles").select("id, email, role").in("role", ["gestion_locative", "commercial", "technico_commercial", "admin", "direction"]).order("email");
      setGestionnaires((data ?? []) as Gestionnaire[]);
    }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editForm.nom.trim()) return toast.error("Le nom est obligatoire");
    setEditSaving(true);
    const { error } = await supabase.from("contacts").update({
      nom: editForm.nom.trim(),
      prenom: editForm.prenom.trim() || null,
      telephone: editForm.telephone.trim() || null,
      email: editForm.email.trim() || null,
      type_contact: editForm.type_contact || null,
      type_entite: editForm.type_entite || "personne",
      interlocuteur: editForm.interlocuteur.trim() || null,
      notes: editForm.notes.trim() || null,
    }).eq("id", contactId);
    setEditSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Contact mis à jour");
    setEditOpen(false);
    load();
  };

  const handleGestionnaireSave = async () => {
    setGestSaving(true);
    const { error } = await supabase.from("contacts").update({ gestionnaire_id: gestId || null }).eq("id", contactId);
    setGestSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Gestionnaire mis à jour");
    setGestOpen(false);
    load();
  };

  const displayName = contact
    ? contact.type_entite === "entreprise"
      ? `${contact.nom}${contact.interlocuteur ? ` — ${contact.interlocuteur}` : ""}`
      : `${contact.nom}${contact.prenom ? ` ${contact.prenom}` : ""}`
    : "";

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            <span className="font-semibold">Agence Immobilière</span>
          </div>
          <Button variant="outline" size="sm" onClick={() => navigate({ to: "/contacts" })}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Retour aux contacts
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-10 space-y-6">
        {loading ? (
          <p className="text-sm text-muted-foreground">Chargement...</p>
        ) : !contact ? (
          <p className="text-sm text-muted-foreground">Contact introuvable.</p>
        ) : (
          <>
            <Card>
              <CardHeader className="flex flex-row items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <CardTitle>{displayName}</CardTitle>
                    {contact.type_contact && <Badge variant="outline">{TYPE_LABEL[contact.type_contact] ?? contact.type_contact}</Badge>}
                    <Badge variant="secondary">{contact.type_entite === "entreprise" ? "Entreprise" : "Personne"}</Badge>
                  </div>
                  <CardDescription>Coordonnées et informations du contact.</CardDescription>
                </div>
                <div className="flex gap-2 flex-wrap justify-end">
                  <ActivitesLiees contactId={contactId} />
                  {myRole === "admin" && (
                    <Dialog open={gestOpen} onOpenChange={(o) => (o ? openGestionnaire() : setGestOpen(false))}>
                      <DialogTrigger asChild>
                        <Button variant="outline" size="sm"><UserCog className="mr-2 h-4 w-4" /> Gestionnaire</Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Modifier le gestionnaire</DialogTitle>
                          <DialogDescription>Réassigner ce contact à un autre gestionnaire.</DialogDescription>
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
                  <Dialog open={editOpen} onOpenChange={setEditOpen}>
                    <DialogTrigger asChild>
                      <Button variant="outline" size="sm"><Pencil className="mr-2 h-4 w-4" /> Modifier</Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-lg">
                      <form onSubmit={handleEdit}>
                        <DialogHeader>
                          <DialogTitle>Modifier contact</DialogTitle>
                          <DialogDescription>Mettre à jour les informations du contact.</DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                          <div className="grid grid-cols-2 gap-4">
                            <div className="grid gap-2">
                              <Label>Type d'entité</Label>
                              <Select value={editForm.type_entite} onValueChange={(v) => setEditForm({ ...editForm, type_entite: v })}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="personne">Personne</SelectItem>
                                  <SelectItem value="entreprise">Entreprise</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="grid gap-2">
                              <Label>Type de contact</Label>
                              <Select value={editForm.type_contact} onValueChange={(v) => setEditForm({ ...editForm, type_contact: v })}>
                                <SelectTrigger><SelectValue placeholder="Sélectionner..." /></SelectTrigger>
                                <SelectContent>
                                  {TYPES_CONTACT.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="grid gap-2">
                              <Label htmlFor="edit-c-nom">{editForm.type_entite === "entreprise" ? "Raison sociale *" : "Nom *"}</Label>
                              <Input id="edit-c-nom" value={editForm.nom} onChange={(e) => setEditForm({ ...editForm, nom: e.target.value })} required />
                            </div>
                            {editForm.type_entite === "entreprise" ? (
                              <div className="grid gap-2">
                                <Label htmlFor="edit-c-interlo">Interlocuteur</Label>
                                <Input id="edit-c-interlo" value={editForm.interlocuteur} onChange={(e) => setEditForm({ ...editForm, interlocuteur: e.target.value })} />
                              </div>
                            ) : (
                              <div className="grid gap-2">
                                <Label htmlFor="edit-c-prenom">Prénom</Label>
                                <Input id="edit-c-prenom" value={editForm.prenom} onChange={(e) => setEditForm({ ...editForm, prenom: e.target.value })} />
                              </div>
                            )}
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="grid gap-2">
                              <Label htmlFor="edit-c-tel">Téléphone</Label>
                              <Input id="edit-c-tel" value={editForm.telephone} onChange={(e) => setEditForm({ ...editForm, telephone: e.target.value })} />
                            </div>
                            <div className="grid gap-2">
                              <Label htmlFor="edit-c-email">Email</Label>
                              <Input id="edit-c-email" type="email" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} />
                            </div>
                          </div>
                          <div className="grid gap-2">
                            <Label htmlFor="edit-c-notes">Notes</Label>
                            <Textarea id="edit-c-notes" rows={3} value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} />
                          </div>
                        </div>
                        <DialogFooter>
                          <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>Annuler</Button>
                          <Button type="submit" disabled={editSaving}>{editSaving ? "..." : "Enregistrer"}</Button>
                        </DialogFooter>
                      </form>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardHeader>
              <CardContent className="grid gap-2 sm:grid-cols-2 text-sm">
                <div><span className="text-muted-foreground">Téléphone : </span>{contact.telephone ?? "—"}</div>
                <div><span className="text-muted-foreground">Email : </span>{contact.email ?? "—"}</div>
                <div><span className="text-muted-foreground">Gestionnaire : </span>{gestionnaireEmail ?? "—"}</div>
                {contact.notes && <div className="sm:col-span-2"><span className="text-muted-foreground">Notes : </span>{contact.notes}</div>}
              </CardContent>
            </Card>

            {contact.type_contact === "bailleur" && (
              <Card>
                <CardHeader>
                  <CardTitle>Biens du bailleur</CardTitle>
                  <CardDescription>Immeubles dont ce contact est bailleur.</CardDescription>
                </CardHeader>
                <CardContent>
                  {biens.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Aucun bien.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Titre</TableHead>
                            <TableHead>Adresse</TableHead>
                            <TableHead>Lots</TableHead>
                            <TableHead>Loués</TableHead>
                            <TableHead>Vacants</TableHead>
                            <TableHead>Revenu mensuel</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {biens.map((b) => (
                            <TableRow key={b.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate({ to: "/biens/$bienId", params: { bienId: b.id } })}>
                              <TableCell className="font-medium">{b.titre}</TableCell>
                              <TableCell>{b.adresse ?? "—"}</TableCell>
                              <TableCell>{b.nbLots}</TableCell>
                              <TableCell>{b.nbLoues}</TableCell>
                              <TableCell>{b.nbVacants}</TableCell>
                              <TableCell>{fmtMoney(b.revenu)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {contact.type_contact === "locataire" && (
              <Card>
                <CardHeader>
                  <CardTitle>Contrats du locataire</CardTitle>
                  <CardDescription>Contrats liés à ce locataire.</CardDescription>
                </CardHeader>
                <CardContent>
                  {contrats.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Aucun contrat.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Bien — Lot</TableHead>
                            <TableHead>Loyer</TableHead>
                            <TableHead>Début</TableHead>
                            <TableHead>Fin</TableHead>
                            <TableHead>Statut</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {contrats.map((c) => (
                            <TableRow key={c.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate({ to: "/contrats/$contratId", params: { contratId: c.id } })}>
                              <TableCell className="font-medium">{c.bien?.titre ?? "—"} — {c.lot?.label ?? "—"}</TableCell>
                              <TableCell>{fmtMoney(c.loyer_mensuel)}</TableCell>
                              <TableCell>{fmtDate(c.date_debut)}</TableCell>
                              <TableCell>{fmtDate(c.date_fin)}</TableCell>
                              <TableCell><Badge>{c.statut}</Badge></TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {contact.type_contact === "locataire" &&
              contrats.map((c) => (
                <SituationLocative
                  key={c.id}
                  contratId={c.id}
                  canWrite={!!myRole}
                  isAdmin={myRole === "admin"}
                  title={`Situation locative — ${c.bien?.titre ?? "—"} — ${c.lot?.label ?? "—"}`}
                />
              ))}

            {myRole === "admin" && contact && (
              <DeleteZone
                entityLabel="ce contact"
                checkReferences={async () => {
                  const [b, cAsLoc, tx] = await Promise.all([
                    supabase.from("biens").select("id", { count: "exact", head: true }).eq("bailleur_id", contactId),
                    supabase.from("contrats").select("id", { count: "exact", head: true }).eq("locataire_id", contactId),
                    supabase.from("transactions_commerciales").select("id", { count: "exact", head: true }).eq("contact_id", contactId),
                  ]);
                  const blockers: string[] = [];
                  if ((b.count ?? 0) > 0) blockers.push(`bailleur de ${b.count} bien(s)`);
                  if ((cAsLoc.count ?? 0) > 0) blockers.push(`locataire sur ${cAsLoc.count} contrat(s)`);
                  if ((tx.count ?? 0) > 0) blockers.push(`lié à ${tx.count} transaction(s) commerciale(s)`);
                  if (blockers.length) return { blocked: true, message: `Ce contact est ${blockers.join(", ")} — impossible à supprimer. Utilisez la fusion ou archivez-le à la place.` };
                  return { blocked: false, message: "Aucune référence détectée. Cette suppression est définitive." };
                }}
                onDelete={async () => {
                  const { error } = await supabase.from("contacts").delete().eq("id", contactId);
                  if (error) throw new Error(error.message);
                  toast.success("Contact supprimé");
                  navigate({ to: "/contacts" });
                }}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}
