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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Building2, ArrowLeft, Plus, FileText, Pencil, Trash2 } from "lucide-react";
import { DocumentsSection } from "@/components/documents-section";
import { CommentSection, computePerms } from "@/components/comment-section";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/travaux")({
  head: () => ({ meta: [{ title: "Travaux — Agence Immobilière" }] }),
  validateSearch: (s: Record<string, unknown>) => ({
    open: typeof s.open === "string" ? s.open : undefined,
  }),
  component: TravauxPage,
});

const STATUTS = [
  { value: "planifie", label: "Planifié" },
  { value: "en_cours", label: "En cours" },
  { value: "termine", label: "Terminé" },
] as const;
const STATUT_LABEL: Record<string, string> = Object.fromEntries(STATUTS.map((s) => [s.value, s.label]));

type Travail = {
  id: string; bien_id: string; titre: string; description: string | null;
  budget_prevu: number | null; budget_depense: number; statut: string;
  date_debut: string | null; date_fin: string | null;
  origine: string | null; charge_financiere: string | null;
  notes: string | null;
  created_by: string | null; assigne_a: string | null; prestataire_id: string | null;
};
type Bien = { id: string; titre: string };
type Profile = { id: string; email: string | null };
type Contact = { id: string; nom: string; prenom: string | null };

const fmtMoney = (n: number | null) => n == null ? "—" : Number(n).toLocaleString("fr-FR") + " FCFA";
const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString("fr-FR") : "—";

function TravauxPage() {
  const [uid, setUid] = useState<string>("");
  const [role, setRole] = useState<string>("");
  const [travaux, setTravaux] = useState<Travail[]>([]);
  const [biens, setBiens] = useState<Bien[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [prestataires, setPrestataires] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);

  const [detail, setDetail] = useState<Travail | null>(null);
  const [editing, setEditing] = useState<Travail | null>(null);
  const [creating, setCreating] = useState(false);

  const [search, setSearch] = useState("");
  const [fStatut, setFStatut] = useState("all");
  const [fBien, setFBien] = useState("all");
  const [dFrom, setDFrom] = useState("");
  const [dTo, setDTo] = useState("");

  useEffect(() => {
    (async () => {
      const { data: userRes } = await supabase.auth.getUser();
      const u = userRes.user?.id ?? "";
      setUid(u);
      if (u) {
        const { data: p } = await supabase.from("profiles").select("role").eq("id", u).maybeSingle();
        setRole(p?.role ?? "");
      }
    })();
  }, []);

  const load = async () => {
    setLoading(true);
    const [{ data: tData, error }, { data: bData }, { data: pData }, { data: prData }] = await Promise.all([
      supabase.from("travaux").select("*").order("created_at", { ascending: false }),
      supabase.from("biens").select("id, titre").order("titre"),
      supabase.from("profiles").select("id, email").order("email"),
      supabase.from("contacts").select("id, nom, prenom").eq("type_contact", "prestataire").eq("archive", false).order("nom"),
    ]);
    if (error) toast.error(error.message);
    else setTravaux((tData ?? []) as Travail[]);
    setBiens((bData ?? []) as Bien[]);
    setProfiles((pData ?? []) as Profile[]);
    setPrestataires((prData ?? []) as Contact[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  // Auto-open detail from ?open=<id>
  const routeSearch = Route.useSearch();
  useEffect(() => {
    if (!routeSearch.open || items.length === 0) return;
    const found = items.find((t) => t.id === routeSearch.open);
    if (found) setDetail(found);
  }, [routeSearch.open, items]);

  const bienTitre = (id: string) => biens.find((b) => b.id === id)?.titre ?? "—";
  const profEmail = (id: string | null) => id ? profiles.find((p) => p.id === id)?.email ?? "—" : "—";
  const prestataire = (id: string | null) => id ? prestataires.find((p) => p.id === id) : null;

  const canWriteBase = role && role !== "recouvrement" && role !== "en_attente";

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return travaux.filter((t) => {
      if (fStatut !== "all" && t.statut !== fStatut) return false;
      if (fBien !== "all" && t.bien_id !== fBien) return false;
      if (dFrom && (!t.date_debut || t.date_debut < dFrom)) return false;
      if (dTo && (!t.date_debut || t.date_debut > dTo)) return false;
      if (q && !`${t.titre} ${bienTitre(t.bien_id)}`.toLowerCase().includes(q)) return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [travaux, search, fStatut, fBien, dFrom, dTo, biens]);

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
            <div><CardTitle>Travaux</CardTitle><CardDescription>Cliquez sur une ligne pour ouvrir la fiche détail.</CardDescription></div>
            {canWriteBase && <Button size="sm" onClick={() => setCreating(true)}><Plus className="mr-2 h-4 w-4" /> Nouveau</Button>}
          </CardHeader>
          <CardContent>
            <FilterBar
              search={search}
              onSearchChange={setSearch}
              searchPlaceholder="Titre ou bien..."
              selects={[
                { key: "statut", label: "Statut", value: fStatut, onChange: setFStatut, options: STATUTS.map((s) => ({ value: s.value, label: s.label })) },
                { key: "bien", label: "Bien", value: fBien, onChange: setFBien, options: biens.map((b) => ({ value: b.id, label: b.titre })), width: "w-52" },
              ]}
              dateRange={{ label: "Début", from: dFrom, to: dTo, onFromChange: setDFrom, onToChange: setDTo }}
              onReset={() => { setSearch(""); setFStatut("all"); setFBien("all"); setDFrom(""); setDTo(""); }}
            />
            {loading ? <p className="text-sm text-muted-foreground">Chargement...</p> : filtered.length === 0 ? <p className="text-sm text-muted-foreground">Aucun chantier.</p> : (
              <div className="overflow-x-auto"><Table>
                <TableHeader><TableRow><TableHead>Bien</TableHead><TableHead>Titre</TableHead><TableHead>Assigné</TableHead><TableHead>Prestataire</TableHead><TableHead>Statut</TableHead></TableRow></TableHeader>
                <TableBody>
                  {filtered.map((t) => (
                    <TableRow key={t.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setDetail(t)}>
                      <TableCell className="font-medium">{bienTitre(t.bien_id)}</TableCell>
                      <TableCell>{t.titre}</TableCell>
                      <TableCell className="text-xs">{profEmail(t.assigne_a)}</TableCell>
                      <TableCell className="text-xs">{prestataire(t.prestataire_id)?.nom ?? "—"}</TableCell>
                      <TableCell><Badge>{STATUT_LABEL[t.statut] ?? t.statut}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table></div>
            )}
          </CardContent>
        </Card>

        {detail && (
          <DetailDialog
            travail={detail}
            uid={uid}
            role={role}
            biens={biens}
            profiles={profiles}
            prestataires={prestataires}
            onClose={() => setDetail(null)}
            onEdit={() => { setEditing(detail); setDetail(null); }}
            onDeleted={() => { setDetail(null); load(); }}
          />
        )}

        {(creating || editing) && (
          <EditDialog
            initial={editing}
            uid={uid}
            role={role}
            biens={biens}
            profiles={profiles}
            prestataires={prestataires}
            onClose={() => { setCreating(false); setEditing(null); }}
            onSaved={() => { setCreating(false); setEditing(null); load(); }}
          />
        )}
      </main>
    </div>
  );
}

function DetailDialog({ travail, uid, role, biens, profiles, prestataires, onClose, onEdit, onDeleted }: {
  travail: Travail; uid: string; role: string;
  biens: Bien[]; profiles: Profile[]; prestataires: Contact[];
  onClose: () => void; onEdit: () => void; onDeleted: () => void;
}) {
  const perms = computePerms(role, travail.created_by, uid);
  const bien = biens.find((b) => b.id === travail.bien_id);
  const assigne = travail.assigne_a ? profiles.find((p) => p.id === travail.assigne_a) : null;
  const prest = travail.prestataire_id ? prestataires.find((p) => p.id === travail.prestataire_id) : null;

  const handleDelete = async () => {
    if (!confirm("Supprimer ces travaux ?")) return;
    const { error } = await supabase.from("travaux").delete().eq("id", travail.id);
    if (error) return toast.error(error.message);
    toast.success("Supprimé"); onDeleted();
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{travail.titre}</DialogTitle>
          <DialogDescription>Fiche travaux en lecture.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <div className="flex items-center gap-2 flex-wrap"><Badge>{STATUT_LABEL[travail.statut] ?? travail.statut}</Badge>
            {travail.origine && <Badge variant="outline">Origine : {travail.origine}</Badge>}
            {travail.charge_financiere && <Badge variant="outline">Charge : {travail.charge_financiere}</Badge>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><span className="text-muted-foreground">Bien : </span>{bien?.titre ?? "—"}</div>
            <div><span className="text-muted-foreground">Assigné à : </span>{assigne?.email ?? "—"}</div>
            <div><span className="text-muted-foreground">Prestataire : </span>{prest ? <Link to="/contacts/$contactId" params={{ contactId: prest.id }} className="underline">{prest.nom}{prest.prenom ? ` ${prest.prenom}` : ""}</Link> : "—"}</div>
            <div><span className="text-muted-foreground">Budget prévu : </span>{fmtMoney(travail.budget_prevu)}</div>
            <div><span className="text-muted-foreground">Budget dépensé : </span>{fmtMoney(travail.budget_depense)}</div>
            <div><span className="text-muted-foreground">Début : </span>{fmtDate(travail.date_debut)}</div>
            <div><span className="text-muted-foreground">Fin : </span>{fmtDate(travail.date_fin)}</div>
          </div>
          {travail.description && <div><span className="text-muted-foreground">Description : </span>{travail.description}</div>}
          {travail.notes && <div className="text-xs bg-muted/40 rounded p-2 whitespace-pre-wrap">{travail.notes}</div>}

          <div className="border-t pt-3">
            <h4 className="font-semibold text-sm mb-2 flex items-center gap-2"><FileText className="h-4 w-4" /> Documents</h4>
            <DocumentsSection bucket="travaux-documents" recordId={travail.id} canWrite={perms.canEditFull || perms.canEditLimited} description="Devis, factures et pièces jointes (PDF)." />
          </div>

          <div className="border-t pt-3">
            <CommentSection table="travaux_commentaires" fkColumn="travaux_id" recordId={travail.id} canComment={perms.canComment} />
          </div>
        </div>
        <DialogFooter className="gap-2">
          {perms.canDelete && <Button variant="destructive" size="sm" onClick={handleDelete}><Trash2 className="mr-2 h-4 w-4" /> Supprimer</Button>}
          {(perms.canEditFull || perms.canEditLimited) && <Button size="sm" onClick={onEdit}><Pencil className="mr-2 h-4 w-4" /> Modifier</Button>}
          <Button variant="outline" size="sm" onClick={onClose}>Fermer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditDialog({ initial, uid, role, biens, profiles, prestataires, onClose, onSaved }: {
  initial: Travail | null; uid: string; role: string;
  biens: Bien[]; profiles: Profile[]; prestataires: Contact[];
  onClose: () => void; onSaved: () => void;
}) {
  const isEdit = !!initial;
  const perms = computePerms(role, initial?.created_by ?? uid, uid);
  const limited = isEdit && perms.canEditLimited && !perms.canEditFull;
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(() => ({
    bien_id: initial?.bien_id ?? "",
    titre: initial?.titre ?? "",
    description: initial?.description ?? "",
    budget_prevu: initial?.budget_prevu != null ? String(initial.budget_prevu) : "",
    budget_depense: initial ? String(initial.budget_depense ?? 0) : "0",
    statut: initial?.statut ?? "planifie",
    date_debut: initial?.date_debut ?? "",
    date_fin: initial?.date_fin ?? "",
    assigne_a: initial?.assigne_a ?? "",
    prestataire_id: initial?.prestataire_id ?? "",
  }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.bien_id || !form.titre) return toast.error("Bien et titre obligatoires");
    setSaving(true);
    if (isEdit) {
      const patch: Record<string, any> = limited
        ? {
            statut: form.statut,
            assigne_a: form.assigne_a || null,
            prestataire_id: form.prestataire_id || null,
            date_debut: form.date_debut || null,
            date_fin: form.date_fin || null,
            budget_prevu: form.budget_prevu ? Number(form.budget_prevu) : null,
            budget_depense: form.budget_depense ? Number(form.budget_depense) : 0,
          }
        : {
            bien_id: form.bien_id,
            titre: form.titre.trim(),
            description: form.description.trim() || null,
            statut: form.statut,
            assigne_a: form.assigne_a || null,
            prestataire_id: form.prestataire_id || null,
            date_debut: form.date_debut || null,
            date_fin: form.date_fin || null,
            budget_prevu: form.budget_prevu ? Number(form.budget_prevu) : null,
            budget_depense: form.budget_depense ? Number(form.budget_depense) : 0,
          };
      const { error } = await (supabase.from("travaux") as any).update(patch).eq("id", initial!.id);
      setSaving(false);
      if (error) return toast.error(error.message);
      toast.success("Modifié"); onSaved();
    } else {
      const { error } = await supabase.from("travaux").insert({
        bien_id: form.bien_id,
        titre: form.titre.trim(),
        description: form.description.trim() || null,
        statut: form.statut,
        assigne_a: form.assigne_a || null,
        prestataire_id: form.prestataire_id || null,
        date_debut: form.date_debut || null,
        date_fin: form.date_fin || null,
        budget_prevu: form.budget_prevu ? Number(form.budget_prevu) : null,
        budget_depense: form.budget_depense ? Number(form.budget_depense) : 0,
        created_by: uid,
      });
      setSaving(false);
      if (error) return toast.error(error.message);
      toast.success("Créé"); onSaved();
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>{isEdit ? "Modifier les travaux" : "Nouveaux travaux"}</DialogTitle>
            <DialogDescription>{limited ? "En tant que profil technique : statut, assignation, prestataire, dates et budget uniquement." : "Renseignez les informations."}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2"><Label>Bien *</Label>
              <Select value={form.bien_id} onValueChange={(v) => setForm({ ...form, bien_id: v })} disabled={limited}>
                <SelectTrigger><SelectValue placeholder="Sélectionner..." /></SelectTrigger>
                <SelectContent>{biens.map((b) => <SelectItem key={b.id} value={b.id}>{b.titre}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid gap-2"><Label>Titre *</Label><Input required value={form.titre} onChange={(e) => setForm({ ...form, titre: e.target.value })} disabled={limited} /></div>
            <div className="grid gap-2"><Label>Description</Label><Textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} disabled={limited} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2"><Label>Assigné à</Label>
                <Select value={form.assigne_a || "none"} onValueChange={(v) => setForm({ ...form, assigne_a: v === "none" ? "" : v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="none">—</SelectItem>{profiles.map((p) => <SelectItem key={p.id} value={p.id}>{p.email ?? p.id}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid gap-2"><Label>Prestataire</Label>
                <Select value={form.prestataire_id || "none"} onValueChange={(v) => setForm({ ...form, prestataire_id: v === "none" ? "" : v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="none">—</SelectItem>{prestataires.map((p) => <SelectItem key={p.id} value={p.id}>{p.nom}{p.prenom ? ` ${p.prenom}` : ""}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2"><Label>Budget prévu</Label><Input type="number" min="0" step="0.01" value={form.budget_prevu} onChange={(e) => setForm({ ...form, budget_prevu: e.target.value })} /></div>
              <div className="grid gap-2"><Label>Budget dépensé</Label><Input type="number" min="0" step="0.01" value={form.budget_depense} onChange={(e) => setForm({ ...form, budget_depense: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2"><Label>Début</Label><Input type="date" value={form.date_debut} onChange={(e) => setForm({ ...form, date_debut: e.target.value })} /></div>
              <div className="grid gap-2"><Label>Fin</Label><Input type="date" value={form.date_fin} onChange={(e) => setForm({ ...form, date_fin: e.target.value })} /></div>
            </div>
            <div className="grid gap-2"><Label>Statut</Label>
              <Select value={form.statut} onValueChange={(v) => setForm({ ...form, statut: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{STATUTS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Annuler</Button>
            <Button type="submit" disabled={saving}>{saving ? "..." : "Enregistrer"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
