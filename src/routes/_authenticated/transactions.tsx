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
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { NouvelleActiviteLieeDialog, TYPE_LABELS, TYPE_COLORS, STATUT_LABELS, type Activite } from "@/components/activites-widgets";

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
  const [form, setForm] = useState({
    contact_id: "", bien_id: "", type_transaction: "mandat_vente", statut_opportunite: "nouveau", notes: "",
    exclusivite: "non_exclusif" as "" | "exclusif" | "non_exclusif",
    motif_perdu: "", motif_perdu_autre: "",
    date_debut_mandat: "", duree_indeterminee: true, date_fin_mandat: "",
  });
  const [search, setSearch] = useState("");
  const [fType, setFType] = useState("all");
  const [fStatut, setFStatut] = useState("all");
  const [detail, setDetail] = useState<Tx | null>(null);

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
  useEffect(() => { if (role && (ALLOWED as readonly string[]).includes(role)) load(); }, [role, load]);

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

  const resetForm = () => setForm({ contact_id: "", bien_id: "", type_transaction: "mandat", statut_opportunite: "nouveau", notes: "" });
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.contact_id) return toast.error("Le contact est obligatoire");
    setSaving(true);
    const { error } = await supabase.from("transactions_commerciales").insert({
      contact_id: form.contact_id, bien_id: form.bien_id || null,
      type_transaction: form.type_transaction, statut_opportunite: form.statut_opportunite,
      notes: form.notes.trim() || null,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Transaction enregistrée"); setOpen(false); resetForm(); load();
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
                  <DialogHeader><DialogTitle>Nouvelle transaction</DialogTitle><DialogDescription>Prospect, acheteur ou vendeur.</DialogDescription></DialogHeader>
                  <div className="grid gap-4 py-4">
                    <div className="grid gap-2"><Label>Contact *</Label>
                      <SearchableSelect
                        value={form.contact_id}
                        onChange={(v) => setForm({ ...form, contact_id: v })}
                        options={commercialContacts.map((c) => ({ value: c.id, label: `${c.nom}${c.prenom ? ` ${c.prenom}` : ""} (${c.type_contact})` }))}
                        placeholder={commercialContacts.length ? "Rechercher un contact..." : "Aucun prospect/acheteur/vendeur"}
                      />
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
          activites={activites.filter((a) => detail && a.transaction_id === detail.id)}
          onChanged={load}
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
  activites,
  onChanged,
}: {
  tx: Tx | null;
  onClose: () => void;
  contactName: (id: string) => string;
  bienTitre: (id: string | null) => string;
  activites: Activite[];
  onChanged: () => void;
}) {
  const [openNew, setOpenNew] = useState(false);
  const now = new Date();
  const visits = activites.filter((a) => a.type_activite === "visite" && a.date_debut);
  const past = visits.filter((a) => new Date(a.date_debut!) <= now).sort((a, b) => (b.date_debut! > a.date_debut! ? 1 : -1));
  const upcoming = visits.filter((a) => new Date(a.date_debut!) > now).sort((a, b) => (a.date_debut! > b.date_debut! ? 1 : -1));
  const last = past[0]?.date_debut ? new Date(past[0].date_debut) : null;
  const next = upcoming[0]?.date_debut ? new Date(upcoming[0].date_debut) : null;

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
                <div><div className="text-xs text-muted-foreground">Statut</div><div><Badge>{STATUT_LABEL[tx.statut_opportunite] ?? tx.statut_opportunite}</Badge></div></div>
                <div><div className="text-xs text-muted-foreground">Dernière visite</div><div>{last ? format(last, "d MMM yyyy 'à' HH:mm", { locale: fr }) : "—"}</div></div>
                <div><div className="text-xs text-muted-foreground">Prochaine visite</div><div>{next ? format(next, "d MMM yyyy 'à' HH:mm", { locale: fr }) : "—"}</div></div>
              </div>
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
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={onClose}>Fermer</Button>
            </DialogFooter>
            <NouvelleActiviteLieeDialog
              open={openNew}
              setOpen={setOpenNew}
              defaults={{ transactionId: tx.id }}
              onSaved={() => { setOpenNew(false); onChanged(); }}
            />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
