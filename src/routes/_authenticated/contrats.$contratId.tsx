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
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Building2, ArrowLeft, Pencil, Ban, AlertCircle } from "lucide-react";
import { DeleteZone } from "@/components/delete-zone";
import { ActivitesLiees } from "@/components/activites-widgets";
import { ContratPropositions } from "@/components/contrat-propositions";
import { DocumentsSection } from "@/components/documents-section";
import { ImpayeDetailDialog } from "@/components/impaye-detail-dialog";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/contrats/$contratId")({
  head: () => ({ meta: [{ title: "Fiche contrat — Agence Immobilière" }] }),
  component: ContratDetailPage,
});

type Contrat = {
  id: string; lot_id: string; locataire_id: string | null;
  date_debut: string | null; date_fin: string | null;
  loyer_mensuel: number | null; depot_garantie: number | null;
  statut: string; notes: string | null; updated_at: string | null;
};
type Lot = { id: string; label: string; bien_id: string };
type Bien = { id: string; titre: string };
type Locataire = { id: string; nom: string; prenom: string | null; type_entite: string | null; interlocuteur: string | null };
type Impaye = { id: string; montant_du: number; montant_paye: number; date_echeance: string; statut: string };
type Edl = { id: string; type: string; date_realisation: string; observations: string | null };

const STATUTS = [
  { value: "actif", label: "Actif" },
  { value: "termine", label: "Terminé" },
  { value: "resilié", label: "Résilié" },
  { value: "brouillon", label: "Brouillon" },
] as const;

const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString("fr-FR") : "—");
const fmtMoney = (n: number | null) => (n == null ? "—" : Number(n).toLocaleString("fr-FR") + " FCFA");
const isStale = (d?: string | null) => !!d && Date.now() - new Date(d).getTime() > 1000 * 60 * 60 * 24 * 30 * 6;

function ContratDetailPage() {
  const { contratId } = Route.useParams();
  const navigate = useNavigate();
  const [contrat, setContrat] = useState<Contrat | null>(null);
  const [lot, setLot] = useState<Lot | null>(null);
  const [bien, setBien] = useState<Bien | null>(null);
  const [locataire, setLocataire] = useState<Locataire | null>(null);
  const [impayes, setImpayes] = useState<Impaye[]>([]);
  const [edls, setEdls] = useState<Edl[]>([]);
  const [loading, setLoading] = useState(true);
  const [myRole, setMyRole] = useState<string>("");

  const [editOpen, setEditOpen] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editForm, setEditForm] = useState({
    loyer_mensuel: "", depot_garantie: "", date_debut: "", date_fin: "", statut: "actif", notes: "", locataire_id: "",
  });
  const [locataireList, setLocataireList] = useState<Locataire[]>([]);

  const [endOpen, setEndOpen] = useState(false);
  const [endSaving, setEndSaving] = useState(false);
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10));

  const canEdit = !!myRole;

  const load = async () => {
    setLoading(true);
    const { data: userRes } = await supabase.auth.getUser();
    if (userRes.user) {
      const { data: p } = await supabase.from("profiles").select("role").eq("id", userRes.user.id).maybeSingle();
      setMyRole(p?.role ?? "");
    }
    const { data: c, error } = await supabase.from("contrats").select("*").eq("id", contratId).maybeSingle();
    if (error) toast.error(error.message);
    setContrat((c ?? null) as Contrat | null);
    if (c) {
      const [{ data: l }, { data: iData }, { data: eData }] = await Promise.all([
        supabase.from("lots").select("id, label, bien_id").eq("id", c.lot_id).maybeSingle(),
        supabase.from("impayes").select("id, montant_du, montant_paye, date_echeance, statut").eq("contrat_id", contratId).order("date_echeance", { ascending: false }),
        supabase.from("etats_des_lieux").select("id, type, date_realisation, observations").eq("contrat_id", contratId).order("date_realisation", { ascending: false }),
      ]);
      setLot((l ?? null) as Lot | null);
      setImpayes((iData ?? []) as Impaye[]);
      setEdls((eData ?? []) as Edl[]);
      if (l) {
        const { data: b } = await supabase.from("biens").select("id, titre").eq("id", l.bien_id).maybeSingle();
        setBien((b ?? null) as Bien | null);
      }
      if (c.locataire_id) {
        const { data: loc } = await supabase.from("contacts").select("id, nom, prenom, type_entite, interlocuteur").eq("id", c.locataire_id).maybeSingle();
        setLocataire((loc ?? null) as Locataire | null);
      }
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [contratId]);

  useEffect(() => {
    if (!contrat) return;
    setEditForm({
      loyer_mensuel: contrat.loyer_mensuel?.toString() ?? "",
      depot_garantie: contrat.depot_garantie?.toString() ?? "",
      date_debut: contrat.date_debut ?? "",
      date_fin: contrat.date_fin ?? "",
      statut: contrat.statut,
      notes: contrat.notes ?? "",
      locataire_id: contrat.locataire_id ?? "",
    });
  }, [contrat]);

  const openEdit = async () => {
    setEditOpen(true);
    if (locataireList.length === 0) {
      const { data } = await supabase.from("contacts").select("id, nom, prenom, type_entite, interlocuteur").eq("type_contact", "locataire").eq("archive", false).order("nom");
      setLocataireList((data ?? []) as Locataire[]);
    }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEditSaving(true);
    const { error } = await supabase.from("contrats").update({
      loyer_mensuel: editForm.loyer_mensuel ? Number(editForm.loyer_mensuel) : null,
      depot_garantie: editForm.depot_garantie ? Number(editForm.depot_garantie) : null,
      date_debut: editForm.date_debut || null,
      date_fin: editForm.date_fin || null,
      statut: editForm.statut,
      notes: editForm.notes.trim() || null,
      locataire_id: editForm.locataire_id || null,
    }).eq("id", contratId);
    setEditSaving(false);
    if (error) {
      if ((error as any).code === "23505") return toast.error("Ce lot a déjà un contrat actif en cours — mettez-y fin avant d'en créer un nouveau.");
      return toast.error(error.message);
    }
    toast.success("Contrat mis à jour");
    setEditOpen(false);
    load();
  };

  const handleEnd = async () => {
    if (!contrat || !lot) return;
    setEndSaving(true);
    const { error } = await supabase.from("contrats").update({ statut: "termine", date_fin: endDate }).eq("id", contratId);
    if (!error) await supabase.from("lots").update({ statut: "vacant" }).eq("id", lot.id);
    setEndSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Contrat terminé, lot repassé en vacant");
    setEndOpen(false);
    load();
  };

  const locName = (l: Locataire) => l.type_entite === "entreprise" ? l.nom : `${l.nom}${l.prenom ? ` ${l.prenom}` : ""}`;

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            <span className="font-semibold">Agence Immobilière</span>
          </div>
          <Button variant="outline" size="sm" onClick={() => navigate({ to: "/contrats" })}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Retour aux contrats
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-10 space-y-6">
        {loading ? (
          <p className="text-sm text-muted-foreground">Chargement...</p>
        ) : !contrat ? (
          <p className="text-sm text-muted-foreground">Contrat introuvable.</p>
        ) : (
          <>
            <Card>
              <CardHeader>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <CardTitle>Contrat</CardTitle>
                      <Badge>{contrat.statut}</Badge>
                      {isStale(contrat.updated_at) && (
                        <Badge variant="outline" className="border-amber-500 text-amber-700">
                          <AlertCircle className="mr-1 h-3 w-3" /> À vérifier
                        </Badge>
                      )}
                    </div>
                    <CardDescription>
                      {lot && bien ? (
                        <>Lot <Link to="/lots/$lotId" params={{ lotId: lot.id }} className="underline">{lot.label}</Link>
                          {" "}dans{" "}
                          <Link to="/biens/$bienId" params={{ bienId: bien.id }} className="underline">{bien.titre}</Link>
                        </>
                      ) : "—"}
                    </CardDescription>
                  </div>
                  {canEdit && (
                    <div className="flex gap-2 flex-wrap justify-end">
                      {contrat.statut === "actif" && (
                        <Dialog open={endOpen} onOpenChange={setEndOpen}>
                          <DialogTrigger asChild>
                            <Button variant="outline" size="sm"><Ban className="mr-2 h-4 w-4" /> Mettre fin</Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Mettre fin au contrat</DialogTitle>
                              <DialogDescription>
                                Confirmer la fin du contrat. Le lot associé repassera automatiquement en "vacant".
                              </DialogDescription>
                            </DialogHeader>
                            <div className="grid gap-2 py-4">
                              <Label htmlFor="end-date">Date de fin</Label>
                              <Input id="end-date" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                            </div>
                            <DialogFooter>
                              <Button variant="outline" onClick={() => setEndOpen(false)}>Annuler</Button>
                              <Button onClick={handleEnd} disabled={endSaving}>{endSaving ? "..." : "Confirmer"}</Button>
                            </DialogFooter>
                          </DialogContent>
                        </Dialog>
                      )}
                      <Dialog open={editOpen} onOpenChange={(o) => (o ? openEdit() : setEditOpen(false))}>
                        <DialogTrigger asChild>
                          <Button variant="outline" size="sm"><Pencil className="mr-2 h-4 w-4" /> Modifier</Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-lg">
                          <form onSubmit={handleEdit}>
                            <DialogHeader>
                              <DialogTitle>Modifier contrat</DialogTitle>
                              <DialogDescription>
                                Vous pouvez réattribuer le locataire ci-dessous. Le lot n'est pas modifiable ici.
                              </DialogDescription>
                            </DialogHeader>
                            <div className="grid gap-4 py-4">
                              <div className="grid gap-2 text-sm p-3 rounded-md bg-muted/50">
                                <div><span className="text-muted-foreground">Lot : </span>{lot?.label ?? "—"} ({bien?.titre ?? "—"})</div>
                              </div>
                              <div className="grid gap-2">
                                <Label>Locataire</Label>
                                <Select value={editForm.locataire_id} onValueChange={(v) => setEditForm({ ...editForm, locataire_id: v })}>
                                  <SelectTrigger>
                                    <SelectValue placeholder={locataireList.length ? "Sélectionner un locataire..." : "Chargement..."} />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {locataireList.map((l) => (
                                      <SelectItem key={l.id} value={l.id}>{locName(l)}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="grid grid-cols-2 gap-4">
                                <div className="grid gap-2">
                                  <Label>Loyer mensuel</Label>
                                  <Input type="number" min="0" step="0.01" value={editForm.loyer_mensuel} onChange={(e) => setEditForm({ ...editForm, loyer_mensuel: e.target.value })} />
                                </div>
                                <div className="grid gap-2">
                                  <Label>Dépôt de garantie</Label>
                                  <Input type="number" min="0" step="0.01" value={editForm.depot_garantie} onChange={(e) => setEditForm({ ...editForm, depot_garantie: e.target.value })} />
                                </div>
                              </div>
                              <div className="grid grid-cols-2 gap-4">
                                <div className="grid gap-2">
                                  <Label>Date début</Label>
                                  <Input type="date" value={editForm.date_debut} onChange={(e) => setEditForm({ ...editForm, date_debut: e.target.value })} />
                                </div>
                                <div className="grid gap-2">
                                  <Label>Date fin</Label>
                                  <Input type="date" value={editForm.date_fin} onChange={(e) => setEditForm({ ...editForm, date_fin: e.target.value })} />
                                </div>
                              </div>
                              <div className="grid gap-2">
                                <Label>Statut</Label>
                                <Select value={editForm.statut} onValueChange={(v) => setEditForm({ ...editForm, statut: v })}>
                                  <SelectTrigger><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    {STATUTS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="grid gap-2">
                                <Label>Notes</Label>
                                <Textarea rows={3} value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} />
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
                  )}
                </div>
              </CardHeader>
              <CardContent className="grid gap-2 sm:grid-cols-2 text-sm">
                <div>
                  <span className="text-muted-foreground">Locataire : </span>
                  {locataire ? (
                    <Link to="/contacts/$contactId" params={{ contactId: locataire.id }} className="underline">
                      {locName(locataire)}
                    </Link>
                  ) : "—"}
                </div>
                <div><span className="text-muted-foreground">Loyer mensuel : </span>{fmtMoney(contrat.loyer_mensuel)}</div>
                <div><span className="text-muted-foreground">Dépôt de garantie : </span>{fmtMoney(contrat.depot_garantie)}</div>
                <div><span className="text-muted-foreground">Début : </span>{fmtDate(contrat.date_debut)}</div>
                <div><span className="text-muted-foreground">Fin : </span>{fmtDate(contrat.date_fin)}</div>
                {contrat.notes && <div className="sm:col-span-2"><span className="text-muted-foreground">Notes : </span>{contrat.notes}</div>}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Impayés</CardTitle>
                <CardDescription>Historique des impayés liés à ce contrat.</CardDescription>
              </CardHeader>
              <CardContent>
                {impayes.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Aucun impayé.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Échéance</TableHead>
                          <TableHead>Montant dû</TableHead>
                          <TableHead>Payé</TableHead>
                          <TableHead>Statut</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {impayes.map((i) => (
                          <TableRow key={i.id}>
                            <TableCell>{fmtDate(i.date_echeance)}</TableCell>
                            <TableCell>{fmtMoney(i.montant_du)}</TableCell>
                            <TableCell>{fmtMoney(i.montant_paye)}</TableCell>
                            <TableCell><Badge>{i.statut}</Badge></TableCell>
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
                <CardTitle>États des lieux</CardTitle>
                <CardDescription>Entrée et sortie du logement.</CardDescription>
              </CardHeader>
              <CardContent>
                {edls.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Aucun état des lieux.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Type</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead>Observations</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {edls.map((e) => (
                          <TableRow key={e.id}>
                            <TableCell><Badge variant="outline">{e.type === "entree" ? "Entrée" : "Sortie"}</Badge></TableCell>
                            <TableCell>{fmtDate(e.date_realisation)}</TableCell>
                            <TableCell>{e.observations ?? "—"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>

            <DocumentsSection
              bucket="contrats-documents"
              recordId={contratId}
              canWrite={canEdit}
              description="Bail signé et avenants éventuels (PDF)."
            />


            {contrat && (
              <ContratPropositions
                contratId={contratId}
                contrat={contrat as unknown as Record<string, any>}
                myRole={myRole}
                onApproved={load}
              />
            )}

            <ActivitesLiees contratId={contratId} />
            {myRole === "admin" && contrat && (
              <DeleteZone
                entityLabel="ce contrat"
                checkReferences={async () => {
                  const [i, e] = await Promise.all([
                    supabase.from("impayes").select("id", { count: "exact", head: true }).eq("contrat_id", contratId),
                    supabase.from("etats_des_lieux").select("id", { count: "exact", head: true }).eq("contrat_id", contratId),
                  ]);
                  const parts: string[] = [];
                  if ((i.count ?? 0) > 0) parts.push(`${i.count} impayé(s)`);
                  if ((e.count ?? 0) > 0) parts.push(`${e.count} état(s) des lieux`);
                  const msg = parts.length
                    ? `⚠️ Ce contrat a ${parts.join(" et ")} lié(s). Ils seront supprimés en cascade.`
                    : "Aucun impayé ni état des lieux lié.";
                  return { blocked: false, message: msg, requireTypeToConfirm: parts.length > 0 };
                }}
                onDelete={async () => {
                  const wasActive = contrat.statut === "actif";
                  const lotId = contrat.lot_id;
                  const { error } = await supabase.from("contrats").delete().eq("id", contratId);
                  if (error) throw new Error(error.message);
                  if (wasActive && lotId) {
                    await supabase.from("lots").update({ statut: "vacant" }).eq("id", lotId);
                  }
                  toast.success("Contrat supprimé");
                  navigate({ to: "/contrats" });
                }}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}
