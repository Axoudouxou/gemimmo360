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
import { Building2, ArrowLeft, Plus, Pencil, Trash2 } from "lucide-react";
import { CommentSection, computePerms } from "@/components/comment-section";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/reclamations")({
  head: () => ({ meta: [{ title: "Réclamations — Agence Immobilière" }] }),
  component: ReclamationsPage,
});

const STATUTS = [
  { value: "ouverte", label: "Ouverte" },
  { value: "en_cours", label: "En cours" },
  { value: "resolue", label: "Résolue" },
] as const;
const PRIORITES = [
  { value: "basse", label: "Basse" },
  { value: "normale", label: "Normale" },
  { value: "haute", label: "Haute" },
] as const;
const STATUT_LABEL: Record<string, string> = Object.fromEntries(STATUTS.map((s) => [s.value, s.label]));
const PRIO_LABEL: Record<string, string> = Object.fromEntries(PRIORITES.map((s) => [s.value, s.label]));

type Reclamation = {
  id: string; bien_id: string; locataire_id: string | null;
  titre: string; description: string | null; statut: string; priorite: string;
  created_by: string | null; assigne_a: string | null; prestataire_id: string | null;
};
type Bien = { id: string; titre: string };
type Contact = { id: string; nom: string; prenom: string | null };
type Profile = { id: string; email: string | null };

function ReclamationsPage() {
  const [uid, setUid] = useState<string>("");
  const [role, setRole] = useState<string>("");
  const [items, setItems] = useState<Reclamation[]>([]);
  const [biens, setBiens] = useState<Bien[]>([]);
  const [locataires, setLocataires] = useState<Contact[]>([]);
  const [prestataires, setPrestataires] = useState<Contact[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  const [detail, setDetail] = useState<Reclamation | null>(null);
  const [editing, setEditing] = useState<Reclamation | null>(null);
  const [creating, setCreating] = useState(false);

  const [search, setSearch] = useState("");
  const [fStatut, setFStatut] = useState("all");
  const [fPrio, setFPrio] = useState("all");
  const [fBien, setFBien] = useState("all");

  const canWriteBase = role && role !== "recouvrement" && role !== "en_attente";

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
    const [{ data: rData, error }, { data: bData }, { data: lData }, { data: prData }, { data: pData }] = await Promise.all([
      supabase.from("reclamations").select("*").order("created_at", { ascending: false }),
      supabase.from("biens").select("id, titre").order("titre"),
      supabase.from("contacts").select("id, nom, prenom").eq("type_contact", "locataire").eq("archive", false).order("nom"),
      supabase.from("contacts").select("id, nom, prenom").eq("type_contact", "prestataire").eq("archive", false).order("nom"),
      supabase.from("profiles").select("id, email").order("email"),
    ]);
    if (error) toast.error(error.message);
    else setItems((rData ?? []) as Reclamation[]);
    setBiens((bData ?? []) as Bien[]);
    setLocataires((lData ?? []) as Contact[]);
    setPrestataires((prData ?? []) as Contact[]);
    setProfiles((pData ?? []) as Profile[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const bienTitre = (id: string) => biens.find((b) => b.id === id)?.titre ?? "—";
  const locataireName = (id: string | null) => { if (!id) return "—"; const l = locataires.find((x) => x.id === id); return l ? `${l.nom}${l.prenom ? ` ${l.prenom}` : ""}` : "—"; };
  const profEmail = (id: string | null) => id ? profiles.find((p) => p.id === id)?.email ?? "—" : "—";
  const prioVariant = (p: string) => p === "haute" ? "destructive" : p === "basse" ? "secondary" : "default";

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((r) => {
      if (fStatut !== "all" && r.statut !== fStatut) return false;
      if (fPrio !== "all" && r.priorite !== fPrio) return false;
      if (fBien !== "all" && r.bien_id !== fBien) return false;
      if (q && !`${r.titre} ${bienTitre(r.bien_id)} ${locataireName(r.locataire_id)}`.toLowerCase().includes(q)) return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, search, fStatut, fPrio, fBien, biens, locataires]);

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
            <div><CardTitle>Réclamations</CardTitle><CardDescription>Cliquez sur une ligne pour ouvrir la fiche détail.</CardDescription></div>
            {canWriteBase && <Button size="sm" onClick={() => setCreating(true)}><Plus className="mr-2 h-4 w-4" /> Nouvelle</Button>}
          </CardHeader>
          <CardContent>
            <FilterBar
              search={search}
              onSearchChange={setSearch}
              searchPlaceholder="Titre, bien ou locataire..."
              selects={[
                { key: "statut", label: "Statut", value: fStatut, onChange: setFStatut, options: STATUTS.map((s) => ({ value: s.value, label: s.label })) },
                { key: "prio", label: "Priorité", value: fPrio, onChange: setFPrio, options: PRIORITES.map((s) => ({ value: s.value, label: s.label })) },
                { key: "bien", label: "Bien", value: fBien, onChange: setFBien, options: biens.map((b) => ({ value: b.id, label: b.titre })), width: "w-52" },
              ]}
              onReset={() => { setSearch(""); setFStatut("all"); setFPrio("all"); setFBien("all"); }}
            />
            {loading ? <p className="text-sm text-muted-foreground">Chargement...</p> : filtered.length === 0 ? <p className="text-sm text-muted-foreground">Aucune réclamation.</p> : (
              <div className="overflow-x-auto"><Table>
                <TableHeader><TableRow><TableHead>Bien</TableHead><TableHead>Titre</TableHead><TableHead>Locataire</TableHead><TableHead>Assigné</TableHead><TableHead>Priorité</TableHead><TableHead>Statut</TableHead></TableRow></TableHeader>
                <TableBody>{filtered.map((r) => (
                  <TableRow key={r.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setDetail(r)}>
                    <TableCell className="font-medium">{bienTitre(r.bien_id)}</TableCell>
                    <TableCell>{r.titre}</TableCell>
                    <TableCell>{locataireName(r.locataire_id)}</TableCell>
                    <TableCell className="text-xs">{profEmail(r.assigne_a)}</TableCell>
                    <TableCell><Badge variant={prioVariant(r.priorite)}>{PRIO_LABEL[r.priorite] ?? r.priorite}</Badge></TableCell>
                    <TableCell><Badge>{STATUT_LABEL[r.statut] ?? r.statut}</Badge></TableCell>
                  </TableRow>
                ))}</TableBody>
              </Table></div>
            )}
          </CardContent>
        </Card>

        {detail && (
          <DetailDialog rec={detail} uid={uid} role={role} biens={biens} locataires={locataires} profiles={profiles} prestataires={prestataires}
            onClose={() => setDetail(null)}
            onEdit={() => { setEditing(detail); setDetail(null); }}
            onDeleted={() => { setDetail(null); load(); }}
          />
        )}

        {(creating || editing) && (
          <EditDialog initial={editing} uid={uid} role={role} biens={biens} locataires={locataires} profiles={profiles} prestataires={prestataires}
            onClose={() => { setCreating(false); setEditing(null); }}
            onSaved={() => { setCreating(false); setEditing(null); load(); }}
          />
        )}
      </main>
    </div>
  );
}

function DetailDialog({ rec, uid, role, biens, locataires, profiles, prestataires, onClose, onEdit, onDeleted }: {
  rec: Reclamation; uid: string; role: string;
  biens: Bien[]; locataires: Contact[]; profiles: Profile[]; prestataires: Contact[];
  onClose: () => void; onEdit: () => void; onDeleted: () => void;
}) {
  const perms = computePerms(role, rec.created_by, uid);
  const bien = biens.find((b) => b.id === rec.bien_id);
  const loc = rec.locataire_id ? locataires.find((l) => l.id === rec.locataire_id) : null;
  const assigne = rec.assigne_a ? profiles.find((p) => p.id === rec.assigne_a) : null;
  const prest = rec.prestataire_id ? prestataires.find((p) => p.id === rec.prestataire_id) : null;

  const handleDelete = async () => {
    if (!confirm("Supprimer cette réclamation ?")) return;
    const { error } = await supabase.from("reclamations").delete().eq("id", rec.id);
    if (error) return toast.error(error.message);
    toast.success("Supprimée"); onDeleted();
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{rec.titre}</DialogTitle>
          <DialogDescription>Fiche réclamation en lecture.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge>{STATUT_LABEL[rec.statut] ?? rec.statut}</Badge>
            <Badge variant={rec.priorite === "haute" ? "destructive" : rec.priorite === "basse" ? "secondary" : "default"}>{PRIO_LABEL[rec.priorite] ?? rec.priorite}</Badge>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><span className="text-muted-foreground">Bien : </span>{bien?.titre ?? "—"}</div>
            <div><span className="text-muted-foreground">Locataire : </span>{loc ? `${loc.nom}${loc.prenom ? ` ${loc.prenom}` : ""}` : "—"}</div>
            <div><span className="text-muted-foreground">Assigné à : </span>{assigne?.email ?? "—"}</div>
            <div><span className="text-muted-foreground">Prestataire : </span>{prest ? <Link to="/contacts/$contactId" params={{ contactId: prest.id }} className="underline">{prest.nom}{prest.prenom ? ` ${prest.prenom}` : ""}</Link> : "—"}</div>
          </div>
          {rec.description && <div className="bg-muted/40 rounded p-2 whitespace-pre-wrap">{rec.description}</div>}

          <div className="border-t pt-3">
            <CommentSection table="reclamations_commentaires" fkColumn="reclamation_id" recordId={rec.id} canComment={perms.canComment} />
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

function EditDialog({ initial, uid, role, biens, locataires, profiles, prestataires, onClose, onSaved }: {
  initial: Reclamation | null; uid: string; role: string;
  biens: Bien[]; locataires: Contact[]; profiles: Profile[]; prestataires: Contact[];
  onClose: () => void; onSaved: () => void;
}) {
  const isEdit = !!initial;
  const perms = computePerms(role, initial?.created_by ?? uid, uid);
  const limited = isEdit && perms.canEditLimited && !perms.canEditFull;
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(() => ({
    bien_id: initial?.bien_id ?? "",
    locataire_id: initial?.locataire_id ?? "",
    titre: initial?.titre ?? "",
    description: initial?.description ?? "",
    statut: initial?.statut ?? "ouverte",
    priorite: initial?.priorite ?? "normale",
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
            priorite: form.priorite,
            assigne_a: form.assigne_a || null,
            prestataire_id: form.prestataire_id || null,
          }
        : {
            bien_id: form.bien_id,
            locataire_id: form.locataire_id || null,
            titre: form.titre.trim(),
            description: form.description.trim() || null,
            statut: form.statut,
            priorite: form.priorite,
            assigne_a: form.assigne_a || null,
            prestataire_id: form.prestataire_id || null,
          };
      const { error } = await (supabase.from("reclamations") as any).update(patch).eq("id", initial!.id);
      setSaving(false);
      if (error) return toast.error(error.message);
      toast.success("Modifiée"); onSaved();
    } else {
      const { error } = await supabase.from("reclamations").insert({
        bien_id: form.bien_id,
        locataire_id: form.locataire_id || null,
        titre: form.titre.trim(),
        description: form.description.trim() || null,
        statut: form.statut,
        priorite: form.priorite,
        assigne_a: form.assigne_a || null,
        prestataire_id: form.prestataire_id || null,
        created_by: uid,
      });
      setSaving(false);
      if (error) return toast.error(error.message);
      toast.success("Créée"); onSaved();
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>{isEdit ? "Modifier la réclamation" : "Nouvelle réclamation"}</DialogTitle>
            <DialogDescription>{limited ? "En tant que profil technique : statut, priorité, assignation et prestataire uniquement." : "Renseignez les informations."}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2"><Label>Bien *</Label>
              <Select value={form.bien_id} onValueChange={(v) => setForm({ ...form, bien_id: v })} disabled={limited}>
                <SelectTrigger><SelectValue placeholder="Sélectionner..." /></SelectTrigger>
                <SelectContent>{biens.map((b) => <SelectItem key={b.id} value={b.id}>{b.titre}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid gap-2"><Label>Locataire</Label>
              <Select value={form.locataire_id || "none"} onValueChange={(v) => setForm({ ...form, locataire_id: v === "none" ? "" : v })} disabled={limited}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="none">—</SelectItem>{locataires.map((l) => <SelectItem key={l.id} value={l.id}>{l.nom}{l.prenom ? ` ${l.prenom}` : ""}</SelectItem>)}</SelectContent>
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
              <div className="grid gap-2"><Label>Statut</Label>
                <Select value={form.statut} onValueChange={(v) => setForm({ ...form, statut: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{STATUTS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid gap-2"><Label>Priorité</Label>
                <Select value={form.priorite} onValueChange={(v) => setForm({ ...form, priorite: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{PRIORITES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
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
