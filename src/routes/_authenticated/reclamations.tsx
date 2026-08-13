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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Building2, ArrowLeft, Plus, Pencil, Trash2, FileText, Hammer, AlertTriangle } from "lucide-react";
import { CommentSection, computePerms } from "@/components/comment-section";
import { DocumentsSection } from "@/components/documents-section";
import { toast } from "sonner";
import { FULL_ACCESS_USER_IDS } from "@/lib/access-overrides";

export const Route = createFileRoute("/_authenticated/reclamations")({
  head: () => ({ meta: [{ title: "Réclamations — Agence Immobilière" }] }),
  validateSearch: (s: Record<string, unknown>) => ({
    open: typeof s.open === "string" ? s.open : undefined,
  }),
  component: ReclamationsPage,
});

const STATUTS = [
  { value: "ouverte", label: "Ouverte" },
  { value: "en_cours", label: "En cours" },
  { value: "en_attente", label: "En attente" },
  { value: "resolue", label: "Résolue" },
  { value: "fermee", label: "Fermée" },
] as const;
// Valeurs sélectionnables dans les formulaires
const PRIORITES = [
  { value: "critique", label: "Critique" },
  { value: "haute", label: "Haute" },
  { value: "moyenne", label: "Moyenne" },
  { value: "basse", label: "Basse" },
] as const;
// "normale" reste affichable (anciennes réclamations) mais non resélectionnable
const PRIORITES_LEGACY = [{ value: "normale", label: "Normale" }] as const;
const CATEGORIES = [
  { value: "plomberie", label: "Plomberie" },
  { value: "electricite", label: "Électricité" },
  { value: "securite", label: "Sécurité" },
  { value: "proprete", label: "Propreté" },
  { value: "autre", label: "Autre" },
] as const;
const STATUT_LABEL: Record<string, string> = Object.fromEntries(STATUTS.map((s) => [s.value, s.label]));
const PRIO_LABEL: Record<string, string> = Object.fromEntries(
  [...PRIORITES, ...PRIORITES_LEGACY].map((s) => [s.value, s.label]),
);

const CAT_LABEL: Record<string, string> = Object.fromEntries(CATEGORIES.map((c) => [c.value, c.label]));

type Reclamation = {
  id: string; reference: string | null;
  bien_id: string; locataire_id: string | null;
  titre: string; description: string | null;
  statut: string; priorite: string; categorie: string | null;
  created_by: string | null; assigne_a: string | null; prestataire_id: string | null;
  created_at: string;
  date_incident: string | null;
  date_limite: string | null;
  date_resolution: string | null;
  temps_traitement: number | null;
  solution: string | null;
  prestataire_contacte: boolean;
  overdue_flagged: boolean;
};
type Bien = { id: string; titre: string; bailleur_id: string | null };
type Contact = { id: string; nom: string; prenom: string | null };
type Profile = { id: string; email: string | null };
type Travail = { id: string; titre: string; statut: string };

const isOverdue = (r: Reclamation) => {
  if (r.statut === "resolue" || !r.date_limite) return false;
  const today = new Date(); today.setHours(0,0,0,0);
  return new Date(r.date_limite) < today;
};

function ReclamationsPage() {
  const navigate = useNavigate();
  const [uid, setUid] = useState<string>("");
  const [role, setRole] = useState<string>("");
  const [items, setItems] = useState<Reclamation[]>([]);
  const [biens, setBiens] = useState<Bien[]>([]);
  const [locataires, setLocataires] = useState<Contact[]>([]);
  const [prestataires, setPrestataires] = useState<Contact[]>([]);
  const [bailleurs, setBailleurs] = useState<Contact[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  const [detail, setDetail] = useState<Reclamation | null>(null);
  const [editing, setEditing] = useState<Reclamation | null>(null);
  const [creating, setCreating] = useState(false);

  const [search, setSearch] = useState("");
  const [fStatut, setFStatut] = useState("all");
  const [fPrio, setFPrio] = useState("all");
  const [fBien, setFBien] = useState("all");
  const [fCat, setFCat] = useState("all");

  const canWriteBase = (uid && FULL_ACCESS_USER_IDS.includes(uid)) || (role && role !== "recouvrement" && role !== "en_attente");

  useEffect(() => {
    (async () => {
      const { data: userRes } = await supabase.auth.getUser();
      const u = userRes.user?.id ?? "";
      setUid(u);
      if (u) {
        const { data: p } = await supabase.from("profiles").select("role").eq("id", u).maybeSingle();
        setRole(p?.role ?? "");
      }
      // Détection de retard côté serveur
      try { await (supabase as any).rpc("detect_overdue_reclamations"); } catch { /* silencieux */ }
    })();
  }, []);

  const load = async () => {
    setLoading(true);
    const [{ data: rData, error }, { data: bData }, { data: lData }, { data: prData }, { data: baData }, { data: pData }] = await Promise.all([
      (supabase.from("reclamations") as any).select("*").order("created_at", { ascending: false }),
      supabase.from("biens").select("id, titre, bailleur_id").order("titre"),
      supabase.from("contacts").select("id, nom, prenom").eq("type_contact", "locataire").eq("archive", false).order("nom"),
      supabase.from("contacts").select("id, nom, prenom").eq("type_contact", "prestataire").eq("archive", false).order("nom"),
      supabase.from("contacts").select("id, nom, prenom").eq("type_contact", "bailleur").eq("archive", false).order("nom"),
      supabase.from("profiles").select("id, email").order("email"),
    ]);
    if (error) toast.error(error.message);
    else setItems((rData ?? []) as Reclamation[]);
    setBiens((bData ?? []) as Bien[]);
    setLocataires((lData ?? []) as Contact[]);
    setPrestataires((prData ?? []) as Contact[]);
    setBailleurs((baData ?? []) as Contact[]);
    setProfiles((pData ?? []) as Profile[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const routeSearch = Route.useSearch();
  useEffect(() => {
    if (!routeSearch.open || items.length === 0) return;
    const found = items.find((r) => r.id === routeSearch.open);
    if (found) setDetail(found);
  }, [routeSearch.open, items]);

  const bienTitre = (id: string) => biens.find((b) => b.id === id)?.titre ?? "—";
  const locataireName = (id: string | null) => { if (!id) return "—"; const l = locataires.find((x) => x.id === id); return l ? `${l.nom}${l.prenom ? ` ${l.prenom}` : ""}` : "—"; };
  const profEmail = (id: string | null) => id ? profiles.find((p) => p.id === id)?.email ?? "—" : "—";
  const prioVariant = (p: string): "default" | "secondary" | "destructive" => p === "haute" ? "destructive" : p === "basse" ? "secondary" : "default";

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((r) => {
      if (fStatut !== "all" && r.statut !== fStatut) return false;
      if (fPrio !== "all" && r.priorite !== fPrio) return false;
      if (fBien !== "all" && r.bien_id !== fBien) return false;
      if (fCat !== "all" && (r.categorie ?? "") !== fCat) return false;
      if (q) {
        const hay = `${r.reference ?? ""} ${r.titre} ${bienTitre(r.bien_id)} ${locataireName(r.locataire_id)}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, search, fStatut, fPrio, fBien, fCat, biens, locataires]);

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
              searchPlaceholder="Référence, titre, bien ou occupant..."
              selects={[
                { key: "statut", label: "Statut", value: fStatut, onChange: setFStatut, options: STATUTS.map((s) => ({ value: s.value, label: s.label })) },
                { key: "prio", label: "Priorité", value: fPrio, onChange: setFPrio, options: PRIORITES.map((s) => ({ value: s.value, label: s.label })) },
                { key: "cat", label: "Catégorie", value: fCat, onChange: setFCat, options: CATEGORIES.map((c) => ({ value: c.value, label: c.label })) },
                { key: "bien", label: "Bien", value: fBien, onChange: setFBien, options: biens.map((b) => ({ value: b.id, label: b.titre })), width: "w-52" },
              ]}
              onReset={() => { setSearch(""); setFStatut("all"); setFPrio("all"); setFCat("all"); setFBien("all"); }}
            />
            {loading ? <p className="text-sm text-muted-foreground">Chargement...</p> : filtered.length === 0 ? <p className="text-sm text-muted-foreground">Aucune réclamation.</p> : (
              <div className="overflow-x-auto"><Table>
                <TableHeader><TableRow>
                  <TableHead>Référence</TableHead><TableHead>Bien</TableHead><TableHead>Titre</TableHead>
                  <TableHead>Occupant</TableHead><TableHead>Assigné</TableHead>
                  <TableHead>Priorité</TableHead><TableHead>Statut</TableHead>
                </TableRow></TableHeader>
                <TableBody>{filtered.map((r) => {
                  const overdue = isOverdue(r);
                  return (
                    <TableRow key={r.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setDetail(r)}>
                      <TableCell className="font-mono text-xs">{r.reference ?? "—"}</TableCell>
                      <TableCell className="font-medium">{bienTitre(r.bien_id)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span>{r.titre}</span>
                          {overdue && <Badge variant="destructive" className="text-[10px]">En retard</Badge>}
                        </div>
                      </TableCell>
                      <TableCell>{locataireName(r.locataire_id)}</TableCell>
                      <TableCell className="text-xs">{profEmail(r.assigne_a)}</TableCell>
                      <TableCell><Badge variant={prioVariant(r.priorite)}>{PRIO_LABEL[r.priorite] ?? r.priorite}</Badge></TableCell>
                      <TableCell><Badge>{STATUT_LABEL[r.statut] ?? r.statut}</Badge></TableCell>
                    </TableRow>
                  );
                })}</TableBody>
              </Table></div>
            )}
          </CardContent>
        </Card>

        {detail && (
          <DetailDialog rec={detail} uid={uid} role={role} biens={biens} locataires={locataires} profiles={profiles} prestataires={prestataires} bailleurs={bailleurs}
            onClose={() => setDetail(null)}
            onEdit={() => { setEditing(detail); setDetail(null); }}
            onDeleted={() => { setDetail(null); load(); }}
            onChanged={() => { setDetail(null); load(); }}
            onCreateTravaux={() => {
              const b = biens.find((x) => x.id === detail.bien_id);
              navigate({
                to: "/travaux",
                search: {
                  new: "1",
                  bien: detail.bien_id,
                  titre: `${detail.reference ?? ""} — ${detail.titre}`,
                  reclamation: detail.id,
                  origine: "reclamation",
                  open: undefined,
                } as any,
              });
              void b;
            }}
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

type HistoryRow = {
  id: string;
  champ_modifie: string;
  ancienne_valeur: string | null;
  nouvelle_valeur: string | null;
  auteur: string | null;
  created_at: string;
};

const CHAMP_LABEL: Record<string, string> = {
  creation: "Création",
  statut: "Statut",
  assigne_a: "Assignation",
  solution: "Solution",
  retard: "Retard",
};

// Permissions réclamation : l'assigné a les mêmes droits que le profil technique
// (statut, priorité, assignation, prestataire, catégorie, solution).
function recPerms(role: string, createdBy: string | null, assigneA: string | null, uid: string) {
  const base = computePerms(role, createdBy, uid);
  const isAssignee = !!assigneA && assigneA === uid;
  if (!isAssignee || base.canEditFull) return base;
  return { ...base, canRead: true, canComment: true, canEditLimited: true };
}


function DetailDialog({ rec, uid, role, biens, locataires, profiles, prestataires, bailleurs, onClose, onEdit, onDeleted, onChanged, onCreateTravaux }: {
  rec: Reclamation; uid: string; role: string;
  biens: Bien[]; locataires: Contact[]; profiles: Profile[]; prestataires: Contact[]; bailleurs: Contact[];
  onClose: () => void; onEdit: () => void; onDeleted: () => void; onChanged: () => void; onCreateTravaux: () => void;
}) {
  const perms = recPerms(role, rec.created_by, rec.assigne_a, uid);
  const [statutSaving, setStatutSaving] = useState(false);

  const changeStatut = async (v: string) => {
    if (v === rec.statut) return;
    if (v === "resolue" && !(rec.solution ?? "").trim()) {
      toast.error("Renseignez la solution via « Modifier » pour clôturer la réclamation.");
      return;
    }
    setStatutSaving(true);
    const { error } = await supabase.from("reclamations").update({ statut: v }).eq("id", rec.id);
    setStatutSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Statut mis à jour");
    onChanged();
  };
  const bien = biens.find((b) => b.id === rec.bien_id);
  const bailleur = bien?.bailleur_id ? bailleurs.find((b) => b.id === bien.bailleur_id) : null;
  const loc = rec.locataire_id ? locataires.find((l) => l.id === rec.locataire_id) : null;
  const assigne = rec.assigne_a ? profiles.find((p) => p.id === rec.assigne_a) : null;
  const prest = rec.prestataire_id ? prestataires.find((p) => p.id === rec.prestataire_id) : null;
  const overdue = isOverdue(rec);
  const canCreateTravaux = role === "technique" || role === "admin" || role === "direction" || FULL_ACCESS_USER_IDS.includes(uid);

  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [authors, setAuthors] = useState<Map<string, string>>(new Map());
  const [linkedTravaux, setLinkedTravaux] = useState<Travail[]>([]);

  const loadHistory = async () => {
    const { data } = await (supabase.from("reclamations_historique" as never) as any)
      .select("id, champ_modifie, ancienne_valeur, nouvelle_valeur, auteur, created_at")
      .eq("reclamation_id", rec.id)
      .order("created_at", { ascending: false });
    const rows = (data ?? []) as HistoryRow[];
    setHistory(rows);
    const ids = Array.from(new Set(rows.map((r) => r.auteur).filter((v): v is string => !!v)));
    if (ids.length) {
      const { data: profs } = await supabase.from("profiles").select("id, email").in("id", ids);
      setAuthors(new Map(((profs ?? []) as { id: string; email: string | null }[]).map((p) => [p.id, p.email ?? "—"])));
    }
  };
  const loadTravaux = async () => {
    const { data } = await (supabase.from("travaux") as any)
      .select("id, titre, statut")
      .eq("reclamation_id", rec.id)
      .order("created_at", { ascending: false });
    setLinkedTravaux((data ?? []) as Travail[]);
  };
  useEffect(() => { loadHistory(); loadTravaux(); /* eslint-disable-next-line */ }, [rec.id]);

  const handleDelete = async () => {
    if (!confirm("Supprimer cette réclamation ?")) return;
    const { error } = await supabase.from("reclamations").delete().eq("id", rec.id);
    if (error) return toast.error(error.message);
    toast.success("Supprimée"); onDeleted();
  };

  const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString("fr-FR") : "—";

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            {rec.reference && <span className="font-mono text-sm text-muted-foreground">{rec.reference}</span>}
            <span>{rec.titre}</span>
          </DialogTitle>
          <DialogDescription>Fiche réclamation.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge>{STATUT_LABEL[rec.statut] ?? rec.statut}</Badge>
            <Badge variant={rec.priorite === "haute" ? "destructive" : rec.priorite === "basse" ? "secondary" : "default"}>{PRIO_LABEL[rec.priorite] ?? rec.priorite}</Badge>
            {rec.categorie && <Badge variant="outline">{CAT_LABEL[rec.categorie] ?? rec.categorie}</Badge>}
            {overdue && <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" /> En retard</Badge>}
          </div>

          {(perms.canEditFull || perms.canEditLimited) && (
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Changer le statut :</span>
              <Select value={rec.statut} onValueChange={changeStatut} disabled={statutSaving}>
                <SelectTrigger className="w-[180px] h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUTS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div><span className="text-muted-foreground">Bien : </span>{bien?.titre ?? "—"}</div>
            <div><span className="text-muted-foreground">Propriétaire : </span>{bailleur ? `${bailleur.nom}${bailleur.prenom ? ` ${bailleur.prenom}` : ""}` : "—"}</div>
            <div><span className="text-muted-foreground">Occupant : </span>{loc ? `${loc.nom}${loc.prenom ? ` ${loc.prenom}` : ""}` : "—"}</div>
            <div><span className="text-muted-foreground">Utilisateur assigné : </span>{assigne?.email ?? "—"}</div>
            <div><span className="text-muted-foreground">Prestataire : </span>{prest ? <Link to="/contacts/$contactId" params={{ contactId: prest.id }} className="underline">{prest.nom}{prest.prenom ? ` ${prest.prenom}` : ""}</Link> : "—"}</div>
            <div><span className="text-muted-foreground">Date d'incident : </span>{fmtDate(rec.date_incident)}</div>
            <div><span className="text-muted-foreground">Date limite : </span>{fmtDate(rec.date_limite)}</div>
            <div><span className="text-muted-foreground">Résolue le : </span>{rec.date_resolution ? new Date(rec.date_resolution).toLocaleDateString("fr-FR") : "—"}{rec.temps_traitement != null ? ` (${rec.temps_traitement} j)` : ""}</div>
          </div>

          {rec.description && <div className="bg-muted/40 rounded p-2 whitespace-pre-wrap">{rec.description}</div>}

          {rec.statut === "resolue" && rec.solution && (
            <div className="rounded-md border border-green-500/30 bg-green-500/5 p-3">
              <div className="text-xs font-semibold text-green-700 mb-1">Solution apportée{rec.prestataire_contacte ? " (prestataire contacté)" : ""}</div>
              <div className="whitespace-pre-wrap">{rec.solution}</div>
            </div>
          )}

          {canCreateTravaux && (
            <div>
              <Button size="sm" variant="secondary" onClick={onCreateTravaux}><Hammer className="mr-2 h-4 w-4" /> Créer un travaux associé</Button>
            </div>
          )}

          {linkedTravaux.length > 0 && (
            <div className="border-t pt-3">
              <h4 className="font-semibold text-sm mb-2">Travaux liés</h4>
              <ul className="space-y-1">
                {linkedTravaux.map((t) => (
                  <li key={t.id}>
                    <Link to="/travaux" search={{ open: t.id } as any} className="text-sm underline">
                      {t.titre} <Badge variant="outline" className="ml-2">{t.statut}</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="border-t pt-3">
            <h4 className="font-semibold text-sm mb-2 flex items-center gap-2"><FileText className="h-4 w-4" /> Documents</h4>
            <DocumentsSection
              bucket="reclamations-documents"
              recordId={rec.id}
              canWrite={perms.canEditFull || perms.canEditLimited}
              description="PDF, images, Word, Excel — 10 Mo max par fichier."
              allowedExtensions={[".pdf", ".jpg", ".jpeg", ".png", ".docx", ".xlsx"]}
              allowedMimeTypes={[
                "application/pdf",
                "image/jpeg",
                "image/png",
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
              ]}
              maxSizeMb={10}
              buttonLabel="Ajouter une pièce jointe"
              hint="PDF, JPG, PNG, DOCX, XLSX — 10 Mo max."
            />
          </div>

          <div className="border-t pt-3">
            <h4 className="font-semibold text-sm mb-2">Historique</h4>
            {history.length === 0 ? (
              <p className="text-xs text-muted-foreground">Aucun événement.</p>
            ) : (
              <ul className="space-y-1.5">
                {history.map((h) => (
                  <li key={h.id} className="text-xs rounded-md border px-2 py-1.5 bg-muted/20 flex items-center justify-between gap-2">
                    <span>
                      <span className="font-medium">{CHAMP_LABEL[h.champ_modifie] ?? h.champ_modifie}</span>
                      {h.champ_modifie === "statut" ? (
                        <>{" : "}<span className="text-muted-foreground">{STATUT_LABEL[h.ancienne_valeur ?? ""] ?? h.ancienne_valeur ?? "—"}</span> → <span className="font-medium">{STATUT_LABEL[h.nouvelle_valeur ?? ""] ?? h.nouvelle_valeur}</span></>
                      ) : h.champ_modifie === "assigne_a" ? (
                        <>{" : "}{h.nouvelle_valeur ? (profiles.find((p) => p.id === h.nouvelle_valeur)?.email ?? "—") : "désassigné"}</>
                      ) : h.champ_modifie === "creation" ? null : (
                        <>{" : "}{h.nouvelle_valeur ?? "—"}</>
                      )}
                    </span>
                    <span className="text-muted-foreground whitespace-nowrap">{h.auteur ? authors.get(h.auteur) ?? "—" : "—"} • {new Date(h.created_at).toLocaleString("fr-FR")}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="border-t pt-3">
            <CommentSection table="reclamations_commentaires" fkColumn="reclamation_id" recordId={rec.id} canComment={perms.canComment} entityType="reclamation" entityId={rec.id} link={`/reclamations?open=${rec.id}`} entityTitle={rec.titre} />
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
  const perms = recPerms(role, initial?.created_by ?? uid, initial?.assigne_a ?? null, uid);
  const limited = isEdit && perms.canEditLimited && !perms.canEditFull;
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(() => ({
    bien_id: initial?.bien_id ?? "",
    locataire_id: initial?.locataire_id ?? "",
    titre: initial?.titre ?? "",
    description: initial?.description ?? "",
    categorie: initial?.categorie ?? "",
    date_incident: initial?.date_incident ?? "",
    date_limite: initial?.date_limite ?? "",
    statut: initial?.statut ?? "ouverte",
    priorite: initial?.priorite ?? "normale",
    assigne_a: initial?.assigne_a ?? "",
    prestataire_id: initial?.prestataire_id ?? "",
    solution: initial?.solution ?? "",
    prestataire_contacte: initial?.prestataire_contacte ?? false,
  }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.bien_id || !form.titre) return toast.error("Bien et titre obligatoires");
    if (form.statut === "resolue" && !form.solution.trim()) {
      return toast.error("La description de la solution est obligatoire pour clôturer.");
    }
    setSaving(true);
    const commonWrite = {
      statut: form.statut,
      priorite: form.priorite,
      assigne_a: form.assigne_a || null,
      prestataire_id: form.prestataire_id || null,
      solution: form.solution.trim() || null,
      prestataire_contacte: form.prestataire_contacte,
    };
    const fullWrite = {
      bien_id: form.bien_id,
      locataire_id: form.locataire_id || null,
      titre: form.titre.trim(),
      description: form.description.trim() || null,
      categorie: form.categorie || null,
      date_incident: form.date_incident || null,
      date_limite: form.date_limite || null,
      ...commonWrite,
    };
    if (isEdit) {
      const patch: Record<string, any> = limited ? commonWrite : fullWrite;
      const { error } = await (supabase.from("reclamations") as any).update(patch).eq("id", initial!.id);
      setSaving(false);
      if (error) return toast.error(error.message);
      toast.success("Modifiée"); onSaved();
    } else {
      const { error } = await (supabase.from("reclamations") as any).insert({
        ...fullWrite,
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
            <DialogDescription>{limited ? "En tant que profil technique : statut, priorité, assignation, prestataire et solution uniquement." : "Renseignez les informations."}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2"><Label>Bien *</Label>
              <Select value={form.bien_id} onValueChange={(v) => setForm({ ...form, bien_id: v })} disabled={limited}>
                <SelectTrigger><SelectValue placeholder="Sélectionner..." /></SelectTrigger>
                <SelectContent>{biens.map((b) => <SelectItem key={b.id} value={b.id}>{b.titre}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid gap-2"><Label>Occupant</Label>
              <Select value={form.locataire_id || "none"} onValueChange={(v) => setForm({ ...form, locataire_id: v === "none" ? "" : v })} disabled={limited}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="none">—</SelectItem>{locataires.map((l) => <SelectItem key={l.id} value={l.id}>{l.nom}{l.prenom ? ` ${l.prenom}` : ""}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid gap-2"><Label>Titre *</Label><Input required value={form.titre} onChange={(e) => setForm({ ...form, titre: e.target.value })} disabled={limited} /></div>
            <div className="grid gap-2"><Label>Description</Label><Textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} disabled={limited} /></div>

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2"><Label>Catégorie</Label>
                <Select value={form.categorie || "none"} onValueChange={(v) => setForm({ ...form, categorie: v === "none" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent><SelectItem value="none">—</SelectItem>{CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid gap-2"><Label>Date d'incident</Label>
                <Input type="date" value={form.date_incident} onChange={(e) => setForm({ ...form, date_incident: e.target.value })} disabled={limited} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2"><Label>Utilisateur assigné</Label>
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

            <div className="grid gap-2"><Label>Date limite</Label>
              <Input type="date" value={form.date_limite} onChange={(e) => setForm({ ...form, date_limite: e.target.value })} disabled={limited} />
              <p className="text-xs text-muted-foreground">Calculée automatiquement à la création selon la priorité, modifiable.</p>
            </div>

            {form.statut === "resolue" && (
              <div className="rounded-md border p-3 bg-green-500/5 space-y-3">
                <div className="grid gap-2">
                  <Label>Solution apportée *</Label>
                  <Textarea rows={3} required value={form.solution} onChange={(e) => setForm({ ...form, solution: e.target.value })} placeholder="Décrivez ce qui a été fait pour résoudre le problème." />
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={form.prestataire_contacte} onCheckedChange={(v) => setForm({ ...form, prestataire_contacte: !!v })} />
                  Prestataire contacté
                </label>
              </div>
            )}
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
