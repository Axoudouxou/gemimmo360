import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useCallback } from "react";
import { FilterBar } from "@/components/filter-bar";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Building2, ArrowLeft, Plus, AlertCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { hasModuleAccess } from "@/lib/access-overrides";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { NouvelleActiviteLieeDialog, TYPE_LABELS, TYPE_COLORS, STATUT_LABELS, type Activite } from "@/components/activites-widgets";
import { NouveauContratDialog } from "@/components/nouveau-contrat-dialog";

export const Route = createFileRoute("/_authenticated/transactions")({
  head: () => ({ meta: [{ title: "Transactions — Agence Immobilière" }] }),
  component: TransactionsPage,
});

const TYPES = [
  { value: "mandat_location", label: "Mandat location" },
  { value: "mandat_gestion", label: "Mandat gestion" },
  { value: "mandat_vente", label: "Mandat vente" },
  { value: "offre", label: "Offre" },
] as const;
const STATUTS = [
  { value: "nouveau", label: "Nouveau" },
  { value: "en_cours", label: "En cours" },
  { value: "gagne", label: "Gagné" },
  { value: "perdu", label: "Perdu" },
] as const;
const MOTIFS_PERDU = [
  { value: "prix_trop_eleve", label: "Prix trop élevé" },
  { value: "bien_non_conforme", label: "Bien non conforme aux attentes" },
  { value: "financement_refuse", label: "Financement refusé" },
  { value: "delai_trop_long", label: "Délai trop long" },
  { value: "conclu_autre_agence", label: "Conclu par une autre agence" },
  { value: "client_desiste", label: "Client s'est désisté" },
  { value: "sans_reponse", label: "Sans réponse du client" },
  { value: "autre", label: "Autre" },
] as const;
const TYPE_LABEL: Record<string, string> = Object.fromEntries(TYPES.map((s) => [s.value, s.label]));
const STATUT_LABEL: Record<string, string> = Object.fromEntries(STATUTS.map((s) => [s.value, s.label]));
const MOTIF_LABEL: Record<string, string> = Object.fromEntries(MOTIFS_PERDU.map((s) => [s.value, s.label]));
const isMandat = (t: string) => t.startsWith("mandat_");
const defaultExclusivite = (t: string): "" | "exclusif" | "non_exclusif" => {
  if (t === "mandat_gestion") return "exclusif";
  if (t === "mandat_vente" || t === "mandat_location") return "non_exclusif";
  return "";
};
const ALLOWED = ["admin", "direction", "commercial"] as const;
const COMMERCIAL_TYPES = ["prospect", "acheteur", "vendeur"];

type Tx = {
  id: string; contact_id: string; bien_id: string | null; type_transaction: string;
  statut_opportunite: string; date_visite: string | null; notes: string | null;
  exclusivite: string | null; motif_perdu: string | null;
  date_debut_mandat: string | null; date_fin_mandat: string | null; duree_indeterminee: boolean;
  montant_estime: number | null; date_cloture_prevue: string | null;
  gestionnaire_id: string | null;
};
type Contact = { id: string; nom: string; prenom: string | null; type_contact: string | null };
type Bien = { id: string; titre: string };


function TransactionsPage() {
  const navigate = useNavigate();
  const [role, setRole] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [items, setItems] = useState<Tx[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [biens, setBiens] = useState<Bien[]>([]);
  const [activites, setActivites] = useState<Activite[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uid, setUid] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<{ id: string; email: string | null }[]>([]);
  const [form, setForm] = useState({
    contact_id: "", bien_id: "", type_transaction: "mandat_vente", statut_opportunite: "nouveau", notes: "",
    exclusivite: "non_exclusif" as "" | "exclusif" | "non_exclusif",
    motif_perdu: "", motif_perdu_autre: "",
    date_debut_mandat: "", duree_indeterminee: true, date_fin_mandat: "",
    montant_estime: "", date_cloture_prevue: "",
    gestionnaire_id: "",
  });
  const [search, setSearch] = useState("");
  const [fType, setFType] = useState("all");
  const [fStatut, setFStatut] = useState("all");
  const [detail, setDetail] = useState<Tx | null>(null);
  const [prospectOpen, setProspectOpen] = useState(false);
  const [prospectInitial, setProspectInitial] = useState("");

  useEffect(() => {
    (async () => {
      const { data: userRes } = await supabase.auth.getUser();
      const u = userRes.user?.id ?? null;
      setUid(u);
      if (!u) { setChecked(true); return; }
      const { data: p } = await supabase.from("profiles").select("role").eq("id", u).maybeSingle();
      const r = p?.role ?? null;
      setRole(r); setChecked(true);
      if (!hasModuleAccess(r, u, ALLOWED)) {
        toast.error("Accès refusé"); navigate({ to: "/dashboard", replace: true });
      }
      // Load profiles list for gestionnaire selection (admin/direction only need the picker)
      const { data: profs } = await supabase.from("profiles").select("id, email").order("email");
      setProfiles((profs ?? []) as { id: string; email: string | null }[]);
    })();
  }, [navigate]);


  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: tData, error }, { data: cData }, { data: bData }, { data: aData }] = await Promise.all([
      supabase.from("transactions_commerciales").select("*").order("created_at", { ascending: false }),
      supabase.from("contacts").select("id, nom, prenom, type_contact").eq("archive", false).order("nom"),
      supabase.from("biens").select("id, titre").order("titre"),
      supabase.from("activites").select("*").not("transaction_id", "is", null),
    ]);
    if (error) toast.error(error.message);
    else setItems((tData ?? []) as Tx[]);
    setContacts((cData ?? []) as Contact[]);
    setBiens((bData ?? []) as Bien[]);
    setActivites((aData ?? []) as Activite[]);
    setLoading(false);
  }, []);
  useEffect(() => { if (hasModuleAccess(role, uid, ALLOWED)) load(); }, [role, uid, load]);

  const commercialContacts = contacts.filter((c) => c.type_contact && COMMERCIAL_TYPES.includes(c.type_contact));

  const contactName = (id: string) => { const c = contacts.find((x) => x.id === id); return c ? `${c.nom}${c.prenom ? ` ${c.prenom}` : ""}` : "—"; };
  const bienTitre = (id: string | null) => id ? (biens.find((b) => b.id === id)?.titre ?? "—") : "—";

  // Compute last/next visit from linked activites of type visite
  const visitesByTx = useMemo(() => {
    const map = new Map<string, { last: Date | null; next: Date | null }>();
    const now = new Date();
    for (const a of activites) {
      if (!a.transaction_id || a.type_activite !== "visite" || !a.date_debut) continue;
      const d = new Date(a.date_debut);
      const entry = map.get(a.transaction_id) ?? { last: null, next: null };
      if (d <= now) {
        if (!entry.last || d > entry.last) entry.last = d;
      } else {
        if (!entry.next || d < entry.next) entry.next = d;
      }
      map.set(a.transaction_id, entry);
    }
    return map;
  }, [activites]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((t) => {
      if (fType !== "all" && t.type_transaction !== fType) return false;
      if (fStatut !== "all" && t.statut_opportunite !== fStatut) return false;
      if (q && !`${contactName(t.contact_id)} ${bienTitre(t.bien_id)}`.toLowerCase().includes(q)) return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, search, fType, fStatut, contacts, biens]);

  const stats = useMemo(() => {
    const prospectIds = new Set(contacts.filter((c) => c.type_contact === "prospect").map((c) => c.id));
    const nbProspectsActifs = items.filter((t) => prospectIds.has(t.contact_id) && ["nouveau", "en_cours"].includes(t.statut_opportunite)).length;
    const enCours = items.filter((t) => ["nouveau", "en_cours"].includes(t.statut_opportunite)).length;
    const gagne = items.filter((t) => t.statut_opportunite === "gagne").length;
    const total = items.length;
    const taux = total > 0 ? Math.round((gagne / total) * 100) : 0;
    return { nbProspectsActifs, enCours, taux };
  }, [items, contacts]);

  const resetForm = () => setForm({
    contact_id: "", bien_id: "", type_transaction: "mandat_vente", statut_opportunite: "nouveau", notes: "",
    exclusivite: "non_exclusif", motif_perdu: "", motif_perdu_autre: "",
    date_debut_mandat: "", duree_indeterminee: true, date_fin_mandat: "",
    montant_estime: "", date_cloture_prevue: "",
    gestionnaire_id: role === "commercial" ? (uid ?? "") : "",
  });

  // Prefill gestionnaire when the current user is commercial
  useEffect(() => {
    if (role === "commercial" && uid) {
      setForm((f) => (f.gestionnaire_id ? f : { ...f, gestionnaire_id: uid }));
    }
  }, [role, uid]);

  const canEditGestionnaire = role === "admin" || role === "direction";

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.contact_id) return toast.error("Le contact est obligatoire");
    if (!form.gestionnaire_id) return toast.error("Le gestionnaire est obligatoire");
    setSaving(true);
    const t = form.type_transaction;
    const motifFinal = form.statut_opportunite === "perdu"
      ? (form.motif_perdu === "autre" ? (form.motif_perdu_autre.trim() || null) : (form.motif_perdu || null))
      : null;
    const payload = {
      contact_id: form.contact_id, bien_id: form.bien_id || null,
      type_transaction: t, statut_opportunite: form.statut_opportunite,
      notes: form.notes.trim() || null,
      exclusivite: isMandat(t) ? (form.exclusivite || null) : null,
      motif_perdu: motifFinal,
      date_debut_mandat: t === "mandat_gestion" ? (form.date_debut_mandat || null) : null,
      duree_indeterminee: t === "mandat_gestion" ? form.duree_indeterminee : true,
      date_fin_mandat: t === "mandat_gestion" && !form.duree_indeterminee ? (form.date_fin_mandat || null) : null,
      montant_estime: form.montant_estime ? Number(form.montant_estime) : null,
      date_cloture_prevue: form.date_cloture_prevue || null,
      gestionnaire_id: form.gestionnaire_id,
    };
    const { error } = await supabase.from("transactions_commerciales").insert(payload);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Transaction enregistrée"); setOpen(false); resetForm(); load();
  };


  const setType = (v: string) => {
    setForm((f) => ({
      ...f,
      type_transaction: v,
      exclusivite: isMandat(v) ? defaultExclusivite(v) : "",
    }));
  };

  const fmt = (d: Date | null) => d ? format(d, "d MMM yyyy 'à' HH:mm", { locale: fr }) : "—";

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
                  <DialogHeader><DialogTitle>Nouvelle transaction</DialogTitle><DialogDescription>Prospect, bailleur, acheteur ou vendeur.</DialogDescription></DialogHeader>
                  <div className="grid gap-4 py-4">
                    <div className="grid gap-2"><Label>Contact *</Label>
                      <SearchableSelect
                        value={form.contact_id}
                        onChange={(v) => setForm({ ...form, contact_id: v })}
                        options={contacts.map((c) => ({ value: c.id, label: `${c.nom}${c.prenom ? ` ${c.prenom}` : ""}${c.type_contact ? ` (${c.type_contact})` : ""}` }))}
                        placeholder={contacts.length ? "Rechercher un contact (prospect, bailleur, acheteur ou vendeur)..." : "Aucun contact"}
                        onCreateOption={(q) => { setProspectInitial(q); setProspectOpen(true); }}
                        createLabel={(q) => `+ Créer "${q}" comme nouveau prospect`}
                      />
                      <p className="text-xs text-muted-foreground">Prospect, bailleur, acheteur ou vendeur</p>
                    </div>
                    <div className="grid gap-2"><Label>Bien concerné</Label>
                      <SearchableSelect
                        value={form.bien_id}
                        onChange={(v) => setForm({ ...form, bien_id: v })}
                        options={biens.map((b) => ({ value: b.id, label: b.titre }))}
                        placeholder="Optionnel..."
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="grid gap-2"><Label>Type</Label>
                        <Select value={form.type_transaction} onValueChange={setType}>
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
                    <div className="grid grid-cols-2 gap-4">
                      <div className="grid gap-2"><Label htmlFor="montant">Montant estimé (FCFA)</Label>
                        <Input id="montant" type="number" min="0" step="0.01" value={form.montant_estime}
                          onChange={(e) => setForm({ ...form, montant_estime: e.target.value })} />
                      </div>
                      <div className="grid gap-2"><Label>Date de clôture prévue</Label>
                        <Input type="date" value={form.date_cloture_prevue}
                          onChange={(e) => setForm({ ...form, date_cloture_prevue: e.target.value })} />
                      </div>
                    </div>

                    <div className="grid gap-2"><Label>Gestionnaire *</Label>
                      {canEditGestionnaire ? (
                        <SearchableSelect
                          value={form.gestionnaire_id}
                          onChange={(v) => setForm({ ...form, gestionnaire_id: v })}
                          options={profiles.map((p) => ({ value: p.id, label: p.email ?? p.id }))}
                          placeholder="Choisir un gestionnaire..."
                        />
                      ) : (
                        <Input value={profiles.find((p) => p.id === form.gestionnaire_id)?.email ?? "—"} disabled />
                      )}
                    </div>

                    {isMandat(form.type_transaction) && (
                      <div className="grid gap-2"><Label>Exclusivité</Label>
                        <Select
                          value={form.exclusivite || ""}
                          onValueChange={(v) => setForm({ ...form, exclusivite: v as "exclusif" | "non_exclusif" })}
                          disabled={form.type_transaction === "mandat_gestion"}
                        >
                          <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="exclusif">Exclusif</SelectItem>
                            <SelectItem value="non_exclusif">Non exclusif</SelectItem>
                          </SelectContent>
                        </Select>
                        {form.type_transaction === "mandat_gestion" && (
                          <p className="text-xs text-muted-foreground">Un mandat de gestion est toujours exclusif.</p>
                        )}
                      </div>
                    )}

                    {form.type_transaction === "mandat_gestion" && (
                      <>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="grid gap-2">
                            <Label>Date de début du mandat</Label>
                            <Input type="date" value={form.date_debut_mandat}
                              onChange={(e) => setForm({ ...form, date_debut_mandat: e.target.value })} />
                          </div>
                          <div className="grid gap-2">
                            <Label>Date de fin</Label>
                            <Input type="date" value={form.date_fin_mandat}
                              disabled={form.duree_indeterminee}
                              onChange={(e) => setForm({ ...form, date_fin_mandat: e.target.value })} />
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Checkbox
                            id="duree-indet"
                            checked={form.duree_indeterminee}
                            onCheckedChange={(v) => setForm({ ...form, duree_indeterminee: !!v, date_fin_mandat: v ? "" : form.date_fin_mandat })}
                          />
                          <Label htmlFor="duree-indet" className="cursor-pointer">Durée indéterminée</Label>
                        </div>
                        {!form.bien_id && (
                          <p className="text-xs text-amber-700 flex items-start gap-1">
                            <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                            Rattachez un bien pour activer le badge de mandat.
                          </p>
                        )}
                      </>
                    )}

                    {form.statut_opportunite === "perdu" && (
                      <>
                        <div className="grid gap-2"><Label>Motif de perte</Label>
                          <Select value={form.motif_perdu} onValueChange={(v) => setForm({ ...form, motif_perdu: v })}>
                            <SelectTrigger><SelectValue placeholder="Choisir un motif..." /></SelectTrigger>
                            <SelectContent>{MOTIFS_PERDU.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
                          </Select>
                        </div>
                        {form.motif_perdu === "autre" && (
                          <div className="grid gap-2"><Label>Précisez</Label>
                            <Textarea rows={2} value={form.motif_perdu_autre}
                              onChange={(e) => setForm({ ...form, motif_perdu_autre: e.target.value })} />
                          </div>
                        )}
                      </>
                    )}

                    <div className="grid gap-2"><Label htmlFor="notes">Notes</Label><Textarea id="notes" rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
                    <p className="text-xs text-muted-foreground">Les visites sont désormais des activités liées à la transaction (créées depuis la fiche détail).</p>
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
              searchPlaceholder="Contact ou bien..."
              selects={[
                { key: "type", label: "Type", value: fType, onChange: setFType, options: TYPES.map((s) => ({ value: s.value, label: s.label })) },
                { key: "statut", label: "Statut", value: fStatut, onChange: setFStatut, options: STATUTS.map((s) => ({ value: s.value, label: s.label })) },
              ]}
              onReset={() => { setSearch(""); setFType("all"); setFStatut("all"); }}
            />
            {loading ? <p className="text-sm text-muted-foreground">Chargement...</p> : filtered.length === 0 ? <p className="text-sm text-muted-foreground">Aucune transaction.</p> : (
              <div className="overflow-x-auto"><Table>
                <TableHeader><TableRow><TableHead>Contact</TableHead><TableHead>Bien</TableHead><TableHead>Type</TableHead><TableHead>Dernière visite</TableHead><TableHead>Prochaine visite</TableHead><TableHead>Statut</TableHead></TableRow></TableHeader>
                <TableBody>{filtered.map((t) => {
                  const v = visitesByTx.get(t.id);
                  return (
                    <TableRow key={t.id} className="cursor-pointer hover:bg-muted/40" onClick={() => setDetail(t)}>
                      <TableCell className="font-medium">{contactName(t.contact_id)}</TableCell>
                      <TableCell>{bienTitre(t.bien_id)}</TableCell>
                      <TableCell><Badge variant="outline">{TYPE_LABEL[t.type_transaction] ?? t.type_transaction}</Badge></TableCell>
                      <TableCell>{fmt(v?.last ?? null)}</TableCell>
                      <TableCell>{fmt(v?.next ?? null)}</TableCell>
                      <TableCell><Badge>{STATUT_LABEL[t.statut_opportunite] ?? t.statut_opportunite}</Badge></TableCell>
                    </TableRow>
                  );
                })}</TableBody>
              </Table></div>
            )}
          </CardContent>
        </Card>

        <TransactionDetailDialog
          tx={detail}
          onClose={() => setDetail(null)}
          contactName={contactName}
          bienTitre={bienTitre}
          contacts={contacts}
          activites={activites.filter((a) => detail && a.transaction_id === detail.id)}
          onChanged={load}
          profiles={profiles}
          canEditGestionnaire={role === "admin" || role === "direction"}
        />
        <NouveauProspectMiniDialog
          open={prospectOpen}
          onOpenChange={setProspectOpen}
          initialName={prospectInitial}
          gestionnaireId={form.gestionnaire_id || null}
          onCreated={async (id) => {
            await load();
            setForm((f) => ({ ...f, contact_id: id }));
            setProspectOpen(false);
          }}
        />
      </main>
    </div>
  );
}

function TransactionDetailDialog({
  tx,
  onClose,
  contactName,
  bienTitre,
  contacts,
  activites,
  onChanged,
  profiles,
  canEditGestionnaire,
}: {
  tx: Tx | null;
  onClose: () => void;
  contactName: (id: string) => string;
  bienTitre: (id: string | null) => string;
  contacts: Contact[];
  activites: Activite[];
  onChanged: () => void;
  profiles: { id: string; email: string | null }[];
  canEditGestionnaire: boolean;
}) {
  const navigate = useNavigate();
  const [openNew, setOpenNew] = useState(false);
  const [openContrat, setOpenContrat] = useState(false);
  const [openBien, setOpenBien] = useState(false);
  const [linkedContratId, setLinkedContratId] = useState<string | null>(null);
  const [bienStatut, setBienStatut] = useState<string | null>(null);
  const [lotCount, setLotCount] = useState<number>(0);
  const [saving, setSaving] = useState(false);
  const [edit, setEdit] = useState({
    statut_opportunite: "nouveau",
    exclusivite: "" as "" | "exclusif" | "non_exclusif",
    motif_perdu: "",
    motif_perdu_autre: "",
    date_debut_mandat: "",
    duree_indeterminee: true,
    date_fin_mandat: "",
    montant_estime: "",
    date_cloture_prevue: "",
    gestionnaire_id: "",
  });

  useEffect(() => {
    if (!tx) return;
    const m = tx.motif_perdu;
    const knownMotif = m && MOTIFS_PERDU.some((x) => x.value === m);
    setEdit({
      statut_opportunite: tx.statut_opportunite,
      exclusivite: (tx.exclusivite as "" | "exclusif" | "non_exclusif") ?? "",
      motif_perdu: knownMotif ? (m as string) : (m ? "autre" : ""),
      motif_perdu_autre: knownMotif ? "" : (m ?? ""),
      date_debut_mandat: tx.date_debut_mandat ?? "",
      duree_indeterminee: tx.duree_indeterminee ?? true,
      date_fin_mandat: tx.date_fin_mandat ?? "",
      montant_estime: tx.montant_estime != null ? String(tx.montant_estime) : "",
      date_cloture_prevue: tx.date_cloture_prevue ?? "",
      gestionnaire_id: tx.gestionnaire_id ?? "",
    });
  }, [tx]);

  // Fetch linked contract + bien statut for action buttons
  useEffect(() => {
    if (!tx) { setLinkedContratId(null); setBienStatut(null); setLotCount(0); return; }
    (async () => {
      const [{ data: contrat }, { data: bien }, lotsRes] = await Promise.all([
        supabase.from("contrats").select("id").eq("transaction_origine_id", tx.id).maybeSingle(),
        tx.bien_id ? supabase.from("biens").select("statut").eq("id", tx.bien_id).maybeSingle() : Promise.resolve({ data: null }),
        tx.bien_id ? supabase.from("lots").select("id", { count: "exact", head: true }).eq("bien_id", tx.bien_id) : Promise.resolve({ count: 0 as number | null }),
      ]);
      setLinkedContratId((contrat as { id: string } | null)?.id ?? null);
      setBienStatut((bien as { statut: string } | null)?.statut ?? null);
      setLotCount(((lotsRes as { count: number | null }).count) ?? 0);
    })();
  }, [tx]);

  const now = new Date();
  const visits = activites.filter((a) => a.type_activite === "visite" && a.date_debut);
  const past = visits.filter((a) => new Date(a.date_debut!) <= now).sort((a, b) => (b.date_debut! > a.date_debut! ? 1 : -1));
  const upcoming = visits.filter((a) => new Date(a.date_debut!) > now).sort((a, b) => (a.date_debut! > b.date_debut! ? 1 : -1));
  const last = past[0]?.date_debut ? new Date(past[0].date_debut) : null;
  const nextVisit = upcoming[0]?.date_debut ? new Date(upcoming[0].date_debut) : null;

  const handleSave = async () => {
    if (!tx) return;
    setSaving(true);
    const t = tx.type_transaction;
    const motifFinal = edit.statut_opportunite === "perdu"
      ? (edit.motif_perdu === "autre" ? (edit.motif_perdu_autre.trim() || null) : (edit.motif_perdu || null))
      : null;
    const payload = {
      statut_opportunite: edit.statut_opportunite,
      exclusivite: isMandat(t) ? (edit.exclusivite || null) : null,
      motif_perdu: motifFinal,
      date_debut_mandat: t === "mandat_gestion" ? (edit.date_debut_mandat || null) : null,
      duree_indeterminee: t === "mandat_gestion" ? edit.duree_indeterminee : true,
      date_fin_mandat: t === "mandat_gestion" && !edit.duree_indeterminee ? (edit.date_fin_mandat || null) : null,
      montant_estime: edit.montant_estime ? Number(edit.montant_estime) : null,
      date_cloture_prevue: edit.date_cloture_prevue || null,
      gestionnaire_id: edit.gestionnaire_id || null,
    };
    const { error } = await supabase.from("transactions_commerciales").update(payload).eq("id", tx.id);
    if (error) { setSaving(false); return toast.error(error.message); }
    // Auto-conversion prospect → bailleur pour mandat_gestion gagné
    if (edit.statut_opportunite === "gagne" && t === "mandat_gestion") {
      const c = contacts.find((x) => x.id === tx.contact_id);
      if (c && c.type_contact === "prospect") {
        await supabase.from("contacts").update({ type_contact: "bailleur" }).eq("id", c.id);
      }
    }
    setSaving(false);
    toast.success("Transaction mise à jour");
    onChanged();
    onClose();
  };

  const markBienSold = async () => {
    if (!tx?.bien_id) return;
    if (!confirm("Marquer ce bien et tous ses lots comme vendus ?")) return;
    const [{ error: e1 }, { error: e2 }] = await Promise.all([
      supabase.from("biens").update({ statut: "vendu" }).eq("id", tx.bien_id),
      supabase.from("lots").update({ statut: "vendu" }).eq("bien_id", tx.bien_id),
    ]);
    if (e1 || e2) return toast.error((e1 || e2)!.message);
    // Convert prospect → bailleur (vendeur)
    const c = contacts.find((x) => x.id === tx.contact_id);
    if (c?.type_contact === "prospect") {
      await supabase.from("contacts").update({ type_contact: "bailleur" }).eq("id", c.id);
    }
    setBienStatut("vendu");
    toast.success("Bien marqué comme vendu");
    onChanged();
  };

  const isGagne = tx?.statut_opportunite === "gagne";
  const showCreateBien = !!isGagne && !tx?.bien_id;
  const showCreateContrat = isGagne
    && !!tx?.bien_id
    && lotCount > 0
    && (tx?.type_transaction === "mandat_location" || tx?.type_transaction === "offre")
    && !linkedContratId;
  const showNoLotWarning = isGagne
    && !!tx?.bien_id
    && lotCount === 0
    && (tx?.type_transaction === "mandat_location" || tx?.type_transaction === "offre");
  const showViewContrat = !!linkedContratId;
  const showMarkSold = isGagne
    && tx?.type_transaction === "mandat_vente"
    && !!tx?.bien_id
    && bienStatut !== "vendu";

  return (
    <Dialog open={!!tx} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        {tx && (
          <>
            <DialogHeader>
              <DialogTitle>Transaction — {contactName(tx.contact_id)}</DialogTitle>
              <DialogDescription>{bienTitre(tx.bien_id)}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><div className="text-xs text-muted-foreground">Type</div><div><Badge variant="outline">{TYPE_LABEL[tx.type_transaction] ?? tx.type_transaction}</Badge></div></div>
                <div><div className="text-xs text-muted-foreground">Dernière visite</div><div>{last ? format(last, "d MMM yyyy 'à' HH:mm", { locale: fr }) : "—"}</div></div>
                <div><div className="text-xs text-muted-foreground">Prochaine visite</div><div>{nextVisit ? format(nextVisit, "d MMM yyyy 'à' HH:mm", { locale: fr }) : "—"}</div></div>
              </div>

              <div className="grid gap-2">
                <Label>Statut</Label>
                <Select value={edit.statut_opportunite} onValueChange={(v) => setEdit({ ...edit, statut_opportunite: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{STATUTS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2"><Label>Montant estimé (FCFA)</Label>
                  <Input type="number" min="0" step="0.01" value={edit.montant_estime}
                    onChange={(e) => setEdit({ ...edit, montant_estime: e.target.value })} />
                </div>
                <div className="grid gap-2"><Label>Date de clôture prévue</Label>
                  <Input type="date" value={edit.date_cloture_prevue}
                    onChange={(e) => setEdit({ ...edit, date_cloture_prevue: e.target.value })} />
                </div>
              </div>

              <div className="grid gap-2"><Label>Gestionnaire</Label>
                {canEditGestionnaire ? (
                  <SearchableSelect
                    value={edit.gestionnaire_id}
                    onChange={(v) => setEdit({ ...edit, gestionnaire_id: v })}
                    options={profiles.map((p) => ({ value: p.id, label: p.email ?? p.id }))}
                    placeholder="Choisir un gestionnaire..."
                  />
                ) : (
                  <Input value={profiles.find((p) => p.id === edit.gestionnaire_id)?.email ?? "—"} disabled />
                )}
              </div>

              {edit.statut_opportunite === "perdu" && (
                <>
                  <div className="grid gap-2"><Label>Motif de perte</Label>
                    <Select value={edit.motif_perdu} onValueChange={(v) => setEdit({ ...edit, motif_perdu: v })}>
                      <SelectTrigger><SelectValue placeholder="Choisir un motif..." /></SelectTrigger>
                      <SelectContent>{MOTIFS_PERDU.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  {edit.motif_perdu === "autre" && (
                    <div className="grid gap-2"><Label>Précisez</Label>
                      <Textarea rows={2} value={edit.motif_perdu_autre}
                        onChange={(e) => setEdit({ ...edit, motif_perdu_autre: e.target.value })} />
                    </div>
                  )}
                </>
              )}

              {isMandat(tx.type_transaction) && (
                <div className="grid gap-2">
                  <Label>Exclusivité</Label>
                  <Select
                    value={edit.exclusivite || ""}
                    onValueChange={(v) => setEdit({ ...edit, exclusivite: v as "exclusif" | "non_exclusif" })}
                    disabled={tx.type_transaction === "mandat_gestion"}
                  >
                    <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="exclusif">Exclusif</SelectItem>
                      <SelectItem value="non_exclusif">Non exclusif</SelectItem>
                    </SelectContent>
                  </Select>
                  {tx.type_transaction === "mandat_gestion" && (
                    <p className="text-xs text-muted-foreground">Un mandat de gestion est toujours exclusif.</p>
                  )}
                </div>
              )}

              {tx.type_transaction === "mandat_gestion" && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label>Date de début du mandat</Label>
                      <Input type="date" value={edit.date_debut_mandat}
                        onChange={(e) => setEdit({ ...edit, date_debut_mandat: e.target.value })} />
                    </div>
                    <div className="grid gap-2">
                      <Label>Date de fin</Label>
                      <Input type="date" value={edit.date_fin_mandat}
                        disabled={edit.duree_indeterminee}
                        onChange={(e) => setEdit({ ...edit, date_fin_mandat: e.target.value })} />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="edit-duree-indet"
                      checked={edit.duree_indeterminee}
                      onCheckedChange={(v) => setEdit({ ...edit, duree_indeterminee: !!v, date_fin_mandat: v ? "" : edit.date_fin_mandat })}
                    />
                    <Label htmlFor="edit-duree-indet" className="cursor-pointer">Durée indéterminée</Label>
                  </div>
                  {!tx.bien_id && (
                    <p className="text-xs text-amber-700 flex items-start gap-1">
                      <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                      Rattachez un bien pour activer le badge de mandat.
                    </p>
                  )}
                </>
              )}


              {tx.notes && (
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Notes</div>
                  <div className="rounded-md border bg-muted/30 p-3 text-sm whitespace-pre-wrap">{tx.notes}</div>
                </div>
              )}

              <div className="rounded-md border p-3">
                <div className="mb-2 flex items-center justify-between">
                  <div className="text-sm font-semibold">Activités liées</div>
                  <Button size="sm" variant="outline" onClick={() => setOpenNew(true)}>
                    <Plus className="mr-2 h-3.5 w-3.5" /> Nouvelle activité
                  </Button>
                </div>
                {activites.length === 0 ? (
                  <p className="py-3 text-center text-sm text-muted-foreground">Aucune activité liée.</p>
                ) : (
                  <ul className="space-y-2">
                    {activites
                      .slice()
                      .sort((a, b) => (a.date_debut ?? "").localeCompare(b.date_debut ?? ""))
                      .map((a) => (
                        <li key={a.id} className="flex items-start gap-2 rounded border p-2">
                          <span className={`mt-1 inline-block h-2 w-2 rounded-full ${TYPE_COLORS[a.type_activite] ?? "bg-gray-400"}`} />
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium">{a.titre}</div>
                            <div className="text-xs text-muted-foreground">
                              {TYPE_LABELS[a.type_activite] ?? a.type_activite}
                              {a.date_debut ? ` · ${format(new Date(a.date_debut), "d MMM yyyy HH:mm", { locale: fr })}` : ""}
                              {` · ${STATUT_LABELS[a.statut] ?? a.statut}`}
                            </div>
                          </div>
                        </li>
                      ))}
                  </ul>
                )}
              </div>

              {(showCreateBien || showCreateContrat || showViewContrat || showMarkSold || showNoLotWarning) && (
                <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 space-y-2">
                  <div className="text-sm font-semibold">Actions "Gagné"</div>
                  <div className="flex flex-wrap gap-2">
                    {showCreateBien && (
                      <Button size="sm" onClick={() => setOpenBien(true)}>
                        Créer le bien associé
                      </Button>
                    )}
                    {showCreateContrat && (
                      <Button size="sm" onClick={() => setOpenContrat(true)}>
                        Créer le contrat associé
                      </Button>
                    )}
                    {showViewContrat && (
                      <Button size="sm" variant="outline" onClick={() => navigate({ to: "/contrats/$contratId", params: { contratId: linkedContratId! } })}>
                        Voir le contrat
                      </Button>
                    )}
                    {showMarkSold && (
                      <Button size="sm" variant="destructive" onClick={markBienSold}>
                        Marquer le bien comme vendu
                      </Button>
                    )}
                  </div>
                  {showNoLotWarning && tx?.bien_id && (
                    <p className="text-xs text-amber-800 flex items-start gap-1">
                      <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                      <span>
                        Ce bien n'a pas encore de lot — <Link to="/biens/$bienId" params={{ bienId: tx.bien_id }} className="underline font-medium">créez-en un depuis sa fiche</Link> avant de pouvoir créer un contrat.
                      </span>
                    </p>
                  )}
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={onClose}>Fermer</Button>
              <Button onClick={handleSave} disabled={saving}>{saving ? "..." : "Enregistrer"}</Button>
            </DialogFooter>
            <NouvelleActiviteLieeDialog
              open={openNew}
              setOpen={setOpenNew}
              defaults={{ transactionId: tx.id }}
              onSaved={() => { setOpenNew(false); onChanged(); }}
            />
            <NouveauContratDialog
              open={openContrat}
              onOpenChange={setOpenContrat}
              fixedContactId={tx.contact_id}
              filterByBienId={tx.bien_id ?? undefined}
              prefillLoyer={tx.montant_estime ?? null}
              transactionOrigineId={tx.id}
              onCreated={(cid) => { setLinkedContratId(cid); onChanged(); }}
            />
            <NouveauBienMiniDialog
              open={openBien}
              onOpenChange={setOpenBien}
              bailleurId={(tx.type_transaction === "mandat_gestion" || tx.type_transaction === "mandat_vente") ? tx.contact_id : null}
              gestionnaireId={tx.gestionnaire_id}
              defaultOperation={tx.type_transaction === "mandat_vente" ? "vente" : "location"}
              onCreated={async (bienId) => {
                const { error } = await supabase.from("transactions_commerciales").update({ bien_id: bienId }).eq("id", tx.id);
                if (error) return toast.error(error.message);
                toast.success("Bien créé et lié à la transaction");
                setOpenBien(false);
                onChanged();
              }}
            />
          </>

        )}
      </DialogContent>
    </Dialog>
  );
}

function NouveauProspectMiniDialog({
  open,
  onOpenChange,
  initialName,
  gestionnaireId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initialName: string;
  gestionnaireId: string | null;
  onCreated: (id: string) => void | Promise<void>;
}) {
  const [typeEntite, setTypeEntite] = useState<"personne" | "entreprise">("personne");
  const [nom, setNom] = useState("");
  const [prenom, setPrenom] = useState("");
  const [telephone, setTelephone] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const q = (initialName || "").trim();
    // Heuristic split: "Nom Prénom…" → nom = first token, prenom = rest (personne).
    if (typeEntite === "personne") {
      const parts = q.split(/\s+/);
      setNom(parts[0] ?? "");
      setPrenom(parts.slice(1).join(" "));
    } else {
      setNom(q);
      setPrenom("");
    }
    setTelephone("");
    setEmail("");
  }, [open, initialName, typeEntite]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nom.trim()) return toast.error("Le nom est obligatoire");
    setSaving(true);
    const { data, error } = await supabase.from("contacts").insert({
      nom: nom.trim(),
      prenom: prenom.trim() || null,
      telephone: telephone.trim() || null,
      email: email.trim() || null,
      type_contact: "prospect",
      type_entite: typeEntite,
      gestionnaire_id: gestionnaireId,
      source: "saisie_directe",
    }).select("id").single();
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Prospect créé");
    await onCreated(data!.id);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <form onSubmit={handleSave}>
          <DialogHeader>
            <DialogTitle>Nouveau prospect</DialogTitle>
            <DialogDescription>Créé au sein de la transaction. Type verrouillé sur « Prospect ».</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label>Type</Label>
                <Select value={typeEntite} onValueChange={(v) => setTypeEntite(v as "personne" | "entreprise")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="personne">Personne</SelectItem>
                    <SelectItem value="entreprise">Entreprise</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Rôle</Label>
                <Input value="Prospect" disabled />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label>{typeEntite === "entreprise" ? "Raison sociale *" : "Nom *"}</Label>
                <Input value={nom} onChange={(e) => setNom(e.target.value)} required />
              </div>
              {typeEntite === "personne" && (
                <div className="grid gap-2">
                  <Label>Prénom</Label>
                  <Input value={prenom} onChange={(e) => setPrenom(e.target.value)} />
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label>Téléphone</Label>
                <Input value={telephone} onChange={(e) => setTelephone(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label>Email</Label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
            <Button type="submit" disabled={saving}>{saving ? "..." : "Créer le prospect"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

