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
import { Building2, ArrowLeft, Plus, AlertCircle, Pencil, FileText } from "lucide-react";
import { DeleteZone } from "@/components/delete-zone";
import { ActivitesLiees } from "@/components/activites-widgets";
import { NouveauContratDialog } from "@/components/nouveau-contrat-dialog";
import { NouvelEdlDialog } from "@/components/nouvel-edl-dialog";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/lots/$lotId")({
  head: () => ({ meta: [{ title: "Fiche lot — Agence Immobilière" }] }),
  component: LotDetailPage,
});

type Lot = { id: string; bien_id: string; label: string; type_lot: string | null; statut: string; surface: number | null; notes: string | null; updated_at: string | null };
type Bien = { id: string; titre: string; adresse: string | null };
type Contrat = { id: string; locataire_id: string | null; date_debut: string | null; date_fin: string | null; loyer_mensuel: number | null; statut: string };
type Locataire = { id: string; nom: string; prenom: string | null; type_entite: string | null; interlocuteur: string | null };
type Edl = { id: string; type: string; date_realisation: string; observations: string | null; contrat_id: string | null };

const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString("fr-FR") : "—");
const fmtMoney = (n: number | null) => (n == null ? "—" : Number(n).toLocaleString("fr-FR") + " FCFA");
const locName = (l: Locataire) => l.type_entite === "entreprise" ? l.nom : `${l.nom}${l.prenom ? ` ${l.prenom}` : ""}`;
const isStale = (d?: string | null) => !!d && Date.now() - new Date(d).getTime() > 1000 * 60 * 60 * 24 * 30 * 6;

function LotDetailPage() {
  const { lotId } = Route.useParams();
  const navigate = useNavigate();
  const [lot, setLot] = useState<Lot | null>(null);
  const [bien, setBien] = useState<Bien | null>(null);
  const [contrats, setContrats] = useState<Contrat[]>([]);
  const [edls, setEdls] = useState<Edl[]>([]);
  const [locataires, setLocataires] = useState<Map<string, Locataire>>(new Map());
  const [loading, setLoading] = useState(true);
  const [myRole, setMyRole] = useState<string>("");

  const [contratOpen, setContratOpen] = useState(false);
  const [edlOpen, setEdlOpen] = useState(false);

  const canCreateContrat = myRole === "admin" || myRole === "juridique";
  const canCreateEdl = !!myRole && myRole !== "recouvrement" && myRole !== "en_attente";
  const canEditLot = ["admin", "juridique", "gestion_locative", "commercial", "technico_commercial"].includes(myRole);

  const [editOpen, setEditOpen] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editForm, setEditForm] = useState({ label: "", type_lot: "", surface: "", statut: "vacant", notes: "" });

  useEffect(() => {
    if (!lot) return;
    setEditForm({
      label: lot.label ?? "",
      type_lot: lot.type_lot ?? "",
      surface: lot.surface?.toString() ?? "",
      statut: lot.statut ?? "vacant",
      notes: lot.notes ?? "",
    });
  }, [lot]);

  const handleEditLot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lot) return;
    if (!editForm.label.trim()) return toast.error("Le libellé est obligatoire");
    setEditSaving(true);
    const { error } = await supabase.from("lots").update({
      label: editForm.label.trim(),
      type_lot: editForm.type_lot.trim() || null,
      surface: editForm.surface ? Number(editForm.surface) : null,
      statut: editForm.statut,
      notes: editForm.notes.trim() || null,
    }).eq("id", lot.id);
    setEditSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Lot mis à jour");
    setEditOpen(false);
    load();
  };

  const load = async () => {
    setLoading(true);
    const { data: userRes } = await supabase.auth.getUser();
    if (userRes.user) {
      const { data: p } = await supabase.from("profiles").select("role").eq("id", userRes.user.id).maybeSingle();
      setMyRole(p?.role ?? "");
    }
    const { data: lData, error: lErr } = await supabase.from("lots").select("*").eq("id", lotId).maybeSingle();
    if (lErr) toast.error(lErr.message);
    const lotData = (lData ?? null) as Lot | null;
    setLot(lotData);
    if (lotData) {
      const [{ data: bData }, { data: cData }, { data: eData }] = await Promise.all([
        supabase.from("biens").select("id, titre, adresse").eq("id", lotData.bien_id).maybeSingle(),
        supabase.from("contrats").select("id, locataire_id, date_debut, date_fin, loyer_mensuel, statut").eq("lot_id", lotId).order("date_debut", { ascending: false }),
        supabase.from("etats_des_lieux").select("id, type, date_realisation, observations, contrat_id").eq("lot_id", lotId).order("date_realisation", { ascending: false }),
      ]);
      setBien((bData ?? null) as Bien | null);
      const ctsList = (cData ?? []) as Contrat[];
      setContrats(ctsList);
      setEdls((eData ?? []) as Edl[]);
      const locIds = Array.from(new Set(ctsList.map((c) => c.locataire_id).filter((x): x is string => !!x)));
      if (locIds.length) {
        const { data: locsData } = await supabase.from("contacts").select("id, nom, prenom, type_entite, interlocuteur").in("id", locIds);
        setLocataires(new Map(((locsData ?? []) as Locataire[]).map((x) => [x.id, x])));
      } else setLocataires(new Map());
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [lotId]);

  const actif = contrats.find((c) => c.statut === "actif") ?? null;
  const passes = contrats.filter((c) => c.id !== actif?.id);

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
        ) : !lot ? (
          <p className="text-sm text-muted-foreground">Lot introuvable.</p>
        ) : (
          <>
            <Card>
              <CardHeader>
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <div className="flex items-center gap-3 flex-wrap">
                      <CardTitle>{lot.label}</CardTitle>
                      <Badge>{lot.statut}</Badge>
                      {isStale(lot.updated_at) && (
                        <Badge variant="outline" className="border-amber-500 text-amber-700">
                          <AlertCircle className="mr-1 h-3 w-3" /> À vérifier
                        </Badge>
                      )}
                    </div>
                    <CardDescription>
                      {bien ? (
                        <>Rattaché à <Link to="/biens/$bienId" params={{ bienId: bien.id }} className="underline">{bien.titre}</Link></>
                      ) : "Bien parent inconnu"}
                    </CardDescription>
                  </div>
                  {canEditLot && (
                    <Dialog open={editOpen} onOpenChange={setEditOpen}>
                      <DialogTrigger asChild>
                        <Button variant="outline" size="sm"><Pencil className="mr-2 h-4 w-4" /> Modifier</Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-lg">
                        <form onSubmit={handleEditLot}>
                          <DialogHeader>
                            <DialogTitle>Modifier le lot</DialogTitle>
                            <DialogDescription>Mettre à jour les informations du lot.</DialogDescription>
                          </DialogHeader>
                          <div className="grid gap-4 py-4">
                            <div className="grid gap-2">
                              <Label htmlFor="lot-label">Libellé *</Label>
                              <Input id="lot-label" value={editForm.label} onChange={(e) => setEditForm({ ...editForm, label: e.target.value })} required />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                              <div className="grid gap-2">
                                <Label htmlFor="lot-type">Type</Label>
                                <Input id="lot-type" value={editForm.type_lot} onChange={(e) => setEditForm({ ...editForm, type_lot: e.target.value })} />
                              </div>
                              <div className="grid gap-2">
                                <Label htmlFor="lot-surface">Surface (m²)</Label>
                                <Input id="lot-surface" type="number" min="0" step="0.01" value={editForm.surface} onChange={(e) => setEditForm({ ...editForm, surface: e.target.value })} />
                              </div>
                            </div>
                            <div className="grid gap-2">
                              <Label>Statut</Label>
                              <Select value={editForm.statut} onValueChange={(v) => setEditForm({ ...editForm, statut: v })}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="vacant">Vacant</SelectItem>
                                  <SelectItem value="loue">Loué</SelectItem>
                                  <SelectItem value="indisponible">Indisponible</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="grid gap-2">
                              <Label htmlFor="lot-notes">Notes</Label>
                              <Textarea id="lot-notes" rows={3} value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} />
                            </div>
                          </div>
                          <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>Annuler</Button>
                            <Button type="submit" disabled={editSaving}>{editSaving ? "..." : "Enregistrer"}</Button>
                          </DialogFooter>
                        </form>
                      </DialogContent>
                    </Dialog>
                  )}
                </div>
              </CardHeader>
              <CardContent className="grid gap-2 sm:grid-cols-3 text-sm">
                <div><span className="text-muted-foreground">Type : </span>{lot.type_lot ?? "—"}</div>
                <div><span className="text-muted-foreground">Surface : </span>{lot.surface ?? "—"}</div>
                {lot.notes && <div className="sm:col-span-3"><span className="text-muted-foreground">Notes : </span>{lot.notes}</div>}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-start justify-between gap-4">
                <div>
                  <CardTitle>Contrat en cours</CardTitle>
                  <CardDescription>Contrat actif rattaché à ce lot, s'il existe.</CardDescription>
                </div>
                {canCreateContrat && (
                  <Button size="sm" onClick={() => setContratOpen(true)}>
                    <Plus className="mr-2 h-4 w-4" /> Nouveau contrat
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                {!actif ? (
                  <p className="text-sm text-muted-foreground">Aucun contrat actif pour ce lot.</p>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2 text-sm">
                    <div>
                      <span className="text-muted-foreground">Locataire : </span>
                      {actif.locataire_id && locataires.get(actif.locataire_id) ? (
                        <Link to="/contacts/$contactId" params={{ contactId: actif.locataire_id }} className="underline">
                          {locName(locataires.get(actif.locataire_id)!)}
                        </Link>
                      ) : "—"}
                    </div>
                    <div><span className="text-muted-foreground">Loyer : </span>{fmtMoney(actif.loyer_mensuel)}</div>
                    <div><span className="text-muted-foreground">Début : </span>{fmtDate(actif.date_debut)}</div>
                    <div><span className="text-muted-foreground">Fin : </span>{fmtDate(actif.date_fin)}</div>
                    <div className="sm:col-span-2">
                      <Button variant="outline" size="sm" asChild>
                        <Link to="/contrats/$contratId" params={{ contratId: actif.id }}>Ouvrir le contrat</Link>
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Historique des contrats</CardTitle>
                <CardDescription>Anciens contrats sur ce lot.</CardDescription>
              </CardHeader>
              <CardContent>
                {passes.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Aucun contrat précédent.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Locataire</TableHead>
                          <TableHead>Début</TableHead>
                          <TableHead>Fin</TableHead>
                          <TableHead>Loyer</TableHead>
                          <TableHead>Statut</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {passes.map((c) => (
                          <TableRow key={c.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate({ to: "/contrats/$contratId", params: { contratId: c.id } })}>
                            <TableCell>{c.locataire_id && locataires.get(c.locataire_id) ? locName(locataires.get(c.locataire_id)!) : "—"}</TableCell>
                            <TableCell>{fmtDate(c.date_debut)}</TableCell>
                            <TableCell>{fmtDate(c.date_fin)}</TableCell>
                            <TableCell>{fmtMoney(c.loyer_mensuel)}</TableCell>
                            <TableCell><Badge>{c.statut}</Badge></TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-start justify-between gap-4">
                <div>
                  <CardTitle>États des lieux</CardTitle>
                  <CardDescription>Tous les états des lieux enregistrés sur ce lot, avec ou sans contrat.</CardDescription>
                </div>
                {canCreateEdl && (
                  <Button size="sm" onClick={() => setEdlOpen(true)}>
                    <Plus className="mr-2 h-4 w-4" /> Nouvel état des lieux
                  </Button>
                )}
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
                          <TableHead>Contrat lié</TableHead>
                          <TableHead>Observations</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {edls.map((e) => (
                          <TableRow key={e.id}>
                            <TableCell><Badge variant="outline"><FileText className="mr-1 h-3 w-3" />{e.type === "entree" ? "Entrée" : "Sortie"}</Badge></TableCell>
                            <TableCell>{fmtDate(e.date_realisation)}</TableCell>
                            <TableCell>{e.contrat_id ? <Link to="/contrats/$contratId" params={{ contratId: e.contrat_id }} className="underline text-sm">Voir</Link> : <span className="text-xs text-muted-foreground">—</span>}</TableCell>
                            <TableCell className="max-w-md truncate">{e.observations ?? "—"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>

            <ActivitesLiees lotId={lotId} />

            {myRole === "admin" && lot && (
              <DeleteZone
                entityLabel="ce lot"
                checkReferences={async () => {
                  const { count } = await supabase.from("contrats").select("id", { count: "exact", head: true }).eq("lot_id", lotId);
                  if ((count ?? 0) > 0) return { blocked: true, message: `Ce lot a ${count} contrat(s) lié(s) — supprimez d'abord les contrats.` };
                  return { blocked: false, message: "Aucun contrat rattaché. Cette suppression est définitive." };
                }}
                onDelete={async () => {
                  const { error } = await supabase.from("lots").delete().eq("id", lotId);
                  if (error) throw new Error(error.message);
                  toast.success("Lot supprimé");
                  navigate({ to: "/biens/$bienId", params: { bienId: lot.bien_id } });
                }}
              />
            )}

            <NouveauContratDialog open={contratOpen} onOpenChange={setContratOpen} fixedLotId={lotId} onCreated={() => load()} />
            <NouvelEdlDialog open={edlOpen} onOpenChange={setEdlOpen} lotId={lotId} onCreated={() => load()} />
          </>
        )}
      </main>
    </div>
  );
}
