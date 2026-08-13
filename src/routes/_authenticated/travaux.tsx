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
import { FULL_ACCESS_USER_IDS } from "@/lib/access-overrides";

const CHRISTELLE_EMAIL = "christelle.kouassi@gem-immobilier.org";

export const Route = createFileRoute("/_authenticated/travaux")({
  head: () => ({ meta: [{ title: "Travaux — Agence Immobilière" }] }),
  validateSearch: (s: Record<string, unknown>) => ({
    open: typeof s.open === "string" ? s.open : undefined,
    new: typeof s.new === "string" ? s.new : undefined,
    bien: typeof s.bien === "string" ? s.bien : undefined,
    titre: typeof s.titre === "string" ? s.titre : undefined,
    reclamation: typeof s.reclamation === "string" ? s.reclamation : undefined,
    origine: typeof s.origine === "string" ? s.origine : undefined,
  }),
  component: TravauxPage,
});

type Prefill = { bien_id?: string; titre?: string; reclamation_id?: string; origine?: string };

const STATUTS = [
  { value: "a_qualifier", label: "À qualifier" },
  { value: "a_valider", label: "À valider" },
  { value: "valide", label: "Validé" },
  { value: "planifie", label: "Planifié" },
  { value: "en_cours", label: "En cours" },
  { value: "termine", label: "Terminé" },
  { value: "refuse", label: "Refusé" },
  { value: "annule", label: "Annulé" },
] as const;
const STATUT_LABEL: Record<string, string> = Object.fromEntries(STATUTS.map((s) => [s.value, s.label]));

const STATUT_CLASS: Record<string, string> = {
  a_qualifier: "bg-muted text-muted-foreground hover:bg-muted",
  a_valider: "bg-orange-500 text-white hover:bg-orange-500",
  valide: "bg-blue-500 text-white hover:bg-blue-500",
  planifie: "bg-blue-500 text-white hover:bg-blue-500",
  en_cours: "bg-blue-600 text-white hover:bg-blue-600",
  termine: "bg-green-600 text-white hover:bg-green-600",
  refuse: "bg-red-600 text-white hover:bg-red-600",
  annule: "bg-slate-700 text-white hover:bg-slate-700",
};

const CHARGES = [
  { value: "bailleur", label: "Bailleur" },
  { value: "locataire", label: "Locataire" },
  { value: "gem", label: "GEM" },
] as const;
const CHARGE_LABEL: Record<string, string> = Object.fromEntries(CHARGES.map((c) => [c.value, c.label]));

type Travail = {
  id: string; bien_id: string; titre: string; description: string | null;
  budget_prevu: number | null; budget_depense: number; statut: string;
  date_debut: string | null; date_fin: string | null;
  origine: string | null; charge_financiere: string | null;
  notes: string | null; motif_refus: string | null;
  reference_cheque: string | null;
  created_by: string | null; assigne_a: string | null;
};
type Bien = { id: string; titre: string };
type Profile = { id: string; email: string | null };

const fmtMoney = (n: number | null) => n == null ? "—" : Number(n).toLocaleString("fr-FR") + " FCFA";
const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString("fr-FR") : "—";

function TravauxPage() {
  const [uid, setUid] = useState<string>("");
  const [role, setRole] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [travaux, setTravaux] = useState<Travail[]>([]);
  const [biens, setBiens] = useState<Bien[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  const [detail, setDetail] = useState<Travail | null>(null);
  const [editing, setEditing] = useState<Travail | null>(null);
  const [creating, setCreating] = useState<false | Prefill>(false);

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
      setEmail(userRes.user?.email ?? "");
      if (u) {
        const { data: p } = await supabase.from("profiles").select("role").eq("id", u).maybeSingle();
        setRole(p?.role ?? "");
      }
    })();
  }, []);

  const load = async () => {
    setLoading(true);
    const [{ data: tData, error }, { data: bData }, { data: pData }] = await Promise.all([
      supabase.from("travaux").select("*").order("created_at", { ascending: false }),
      supabase.from("biens").select("id, titre").order("titre"),
      supabase.from("profiles").select("id, email").order("email"),
    ]);
    if (error) toast.error(error.message);
    else setTravaux((tData ?? []) as unknown as Travail[]);
    setBiens((bData ?? []) as Bien[]);
    setProfiles((pData ?? []) as Profile[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  // Auto-open detail from ?open=<id> ou création préremplie
  const routeSearch = Route.useSearch();
  useEffect(() => {
    if (!routeSearch.open || travaux.length === 0) return;
    const found = travaux.find((t: Travail) => t.id === routeSearch.open);
    if (found) setDetail(found);
  }, [routeSearch.open, travaux]);
  useEffect(() => {
    if (routeSearch.new === "1") {
      setCreating({
        bien_id: routeSearch.bien,
        titre: routeSearch.titre,
        reclamation_id: routeSearch.reclamation,
        origine: routeSearch.origine,
      });
    }
  }, [routeSearch.new, routeSearch.bien, routeSearch.titre, routeSearch.reclamation, routeSearch.origine]);

  const bienTitre = (id: string) => biens.find((b) => b.id === id)?.titre ?? "—";
  const profEmail = (id: string | null) => id ? profiles.find((p) => p.id === id)?.email ?? "—" : "—";

  const canWriteBase = (uid && FULL_ACCESS_USER_IDS.includes(uid)) || (role && role !== "recouvrement" && role !== "en_attente");

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
            {canWriteBase && <Button size="sm" onClick={() => setCreating({})}><Plus className="mr-2 h-4 w-4" /> Nouveau</Button>}
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
                <TableHeader><TableRow><TableHead>Bien</TableHead><TableHead>Titre</TableHead><TableHead>Assigné</TableHead><TableHead>À la charge de</TableHead><TableHead>Statut</TableHead></TableRow></TableHeader>
                <TableBody>
                  {filtered.map((t) => (
                    <TableRow key={t.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setDetail(t)}>
                      <TableCell className="font-medium">{bienTitre(t.bien_id)}</TableCell>
                      <TableCell>{t.titre}</TableCell>
                      <TableCell className="text-xs">{profEmail(t.assigne_a)}</TableCell>
                      <TableCell className="text-xs">{t.charge_financiere ? CHARGE_LABEL[t.charge_financiere] ?? t.charge_financiere : "—"}</TableCell>
                      <TableCell><Badge className={STATUT_CLASS[t.statut] ?? ""}>{STATUT_LABEL[t.statut] ?? t.statut}</Badge></TableCell>
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
            email={email}
            biens={biens}
            profiles={profiles}
            onClose={() => setDetail(null)}
            onEdit={() => { setEditing(detail); setDetail(null); }}
            onDeleted={() => { setDetail(null); load(); }}
            onStatusChanged={(updated) => { setDetail(updated); setTravaux((prev) => prev.map((x) => x.id === updated.id ? updated : x)); }}
          />
        )}

        {(creating || editing) && (
          <EditDialog
            initial={editing}
            prefill={creating || undefined}
            uid={uid}
            role={role}
            biens={biens}
            profiles={profiles}
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

const CHAMP_TRAVAUX_LABEL: Record<string, string> = {
  creation: "Création",
  statut: "Statut",
  motif_refus: "Motif de refus",
};

function DetailDialog({ travail, uid, role, email, biens, profiles, onClose, onEdit, onDeleted, onStatusChanged }: {
  travail: Travail; uid: string; role: string; email: string;
  biens: Bien[]; profiles: Profile[];
  onClose: () => void; onEdit: () => void; onDeleted: () => void;
  onStatusChanged: (updated: Travail) => void;
}) {
  const isChristelle = email.toLowerCase() === CHRISTELLE_EMAIL;
  const basePerms = computePerms(role, travail.created_by, uid);
  const isAssignee = !!uid && travail.assigne_a === uid;
  const perms = isChristelle || isAssignee
    ? { ...basePerms, canRead: true, canComment: true, canEditFull: true, canEditLimited: false, canDelete: isChristelle || basePerms.canDelete }
    : basePerms;
  const bien = biens.find((b) => b.id === travail.bien_id);
  const assigne = travail.assigne_a ? profiles.find((p) => p.id === travail.assigne_a) : null;

  const canEditRefCheque = perms.canEditFull || perms.canEditLimited;

  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [authors, setAuthors] = useState<Map<string, string>>(new Map());
  const [busy, setBusy] = useState(false);
  const [refuseOpen, setRefuseOpen] = useState(false);
  const [motif, setMotif] = useState("");
  const [refCheque, setRefCheque] = useState(travail.reference_cheque ?? "");
  const [savingRef, setSavingRef] = useState(false);

  useEffect(() => { setRefCheque(travail.reference_cheque ?? ""); }, [travail.id, travail.reference_cheque]);

  const canSubmit =
    (travail.statut === "a_qualifier" || travail.statut === "planifie") &&
    travail.budget_prevu != null &&
    (role === "technique" || role === "admin" || role === "direction");
  const canDecide = travail.statut === "a_valider" && role === "direction";

  const loadHistory = async () => {
    const { data } = await supabase
      .from("travaux_historique" as never)
      .select("id, champ_modifie, ancienne_valeur, nouvelle_valeur, auteur, created_at")
      .eq("travaux_id", travail.id)
      .order("created_at", { ascending: false });
    const rows = (data ?? []) as unknown as HistoryRow[];
    setHistory(rows);
    const ids = Array.from(new Set(rows.map((r) => r.auteur).filter((v): v is string => !!v)));
    if (ids.length) {
      const { data: profs } = await supabase.from("profiles").select("id, email").in("id", ids);
      setAuthors(new Map(((profs ?? []) as { id: string; email: string | null }[]).map((p) => [p.id, p.email ?? "—"])));
    } else {
      setAuthors(new Map());
    }
  };
  useEffect(() => { loadHistory(); }, [travail.id]);

  const handleDelete = async () => {
    if (!confirm("Supprimer ces travaux ?")) return;
    const { error } = await supabase.from("travaux").delete().eq("id", travail.id);
    if (error) return toast.error(error.message);
    toast.success("Supprimé"); onDeleted();
  };

  const updateStatut = async (patch: Record<string, unknown>, successMsg: string) => {
    setBusy(true);
    const { data, error } = await (supabase.from("travaux") as any)
      .update(patch).eq("id", travail.id).select().maybeSingle();
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(successMsg);
    if (data) onStatusChanged(data as Travail);
    await loadHistory();
  };

  const saveRefCheque = async () => {
    setSavingRef(true);
    const { data, error } = await (supabase.from("travaux") as any)
      .update({ reference_cheque: refCheque.trim() || null })
      .eq("id", travail.id).select().maybeSingle();
    setSavingRef(false);
    if (error) return toast.error(error.message);
    toast.success("Référence chèque enregistrée");
    if (data) onStatusChanged(data as Travail);
  };

  const handleSubmit = async () => {
    if (!travail.budget_prevu) return toast.error("Budget prévu requis");
    const { data: directions } = await supabase.from("profiles").select("id").eq("role", "direction").limit(1);
    const assignee = (directions ?? [])[0]?.id ?? null;
    await updateStatut({ statut: "a_valider" }, "Soumis pour validation");
    const { data: userRes } = await supabase.auth.getUser();
    await supabase.from("activites").insert({
      titre: `Validation devis – ${travail.titre} – ${bien?.titre ?? "—"} – ${fmtMoney(travail.budget_prevu)}`,
      type_activite: "tache",
      date_debut: new Date().toISOString(),
      priorite: "urgente",
      statut: "a_faire",
      assigne_a: assignee,
      created_by: userRes.user?.id ?? null,
      travaux_id: travail.id,
    } as never);
  };

  const handleValider = () => updateStatut({ statut: "valide", motif_refus: null }, "Devis validé");
  const handleRefuser = async () => {
    await updateStatut({ statut: "refuse", motif_refus: motif.trim() || null }, "Devis refusé");
    setRefuseOpen(false); setMotif("");
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{travail.titre}</DialogTitle>
          <DialogDescription>Fiche travaux en lecture.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge className={STATUT_CLASS[travail.statut] ?? ""}>{STATUT_LABEL[travail.statut] ?? travail.statut}</Badge>
            {travail.origine && <Badge variant="outline">Origine : {travail.origine}</Badge>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><span className="text-muted-foreground">Bien : </span>{bien?.titre ?? "—"}</div>
            <div><span className="text-muted-foreground">Assigné à : </span>{assigne?.email ?? "—"}</div>
            <div><span className="text-muted-foreground">À la charge de : </span>{travail.charge_financiere ? CHARGE_LABEL[travail.charge_financiere] ?? travail.charge_financiere : "—"}</div>
            <div><span className="text-muted-foreground">Budget prévu : </span>{fmtMoney(travail.budget_prevu)}</div>
            <div><span className="text-muted-foreground">Budget dépensé : </span>{fmtMoney(travail.budget_depense)}</div>
            <div><span className="text-muted-foreground">Début : </span>{fmtDate(travail.date_debut)}</div>
            <div><span className="text-muted-foreground">Fin : </span>{fmtDate(travail.date_fin)}</div>
          </div>

          <div className="rounded-md border p-3 bg-muted/10 space-y-2">
            <Label className="text-xs text-muted-foreground">Référence chèque</Label>
            {canEditRefCheque ? (
              <div className="flex gap-2">
                <Input value={refCheque} onChange={(e) => setRefCheque(e.target.value)} placeholder="N° ou référence du chèque" />
                <Button size="sm" onClick={saveRefCheque} disabled={savingRef || refCheque === (travail.reference_cheque ?? "")}>
                  {savingRef ? "..." : "Enregistrer"}
                </Button>
              </div>
            ) : (
              <div className="text-sm">{travail.reference_cheque || "—"}</div>
            )}
          </div>

          {travail.description && <div><span className="text-muted-foreground">Description : </span>{travail.description}</div>}
          {travail.statut === "refuse" && travail.motif_refus && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
              <div className="text-xs font-semibold text-destructive mb-1">Motif de refus</div>
              <div className="whitespace-pre-wrap">{travail.motif_refus}</div>
            </div>
          )}
          {travail.notes && <div className="text-xs bg-muted/40 rounded p-2 whitespace-pre-wrap">{travail.notes}</div>}

          {canDecide && !refuseOpen && (
            <div className="flex gap-2">
              <Button size="sm" onClick={handleValider} disabled={busy}>Valider</Button>
              <Button size="sm" variant="destructive" onClick={() => setRefuseOpen(true)} disabled={busy}>Refuser</Button>
            </div>
          )}
          {canDecide && refuseOpen && (
            <div className="border rounded-md p-3 space-y-2 bg-muted/10">
              <Label>Motif du refus (optionnel)</Label>
              <Textarea rows={3} value={motif} onChange={(e) => setMotif(e.target.value)} />
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="outline" onClick={() => { setRefuseOpen(false); setMotif(""); }}>Annuler</Button>
                <Button size="sm" variant="destructive" onClick={handleRefuser} disabled={busy}>Confirmer le refus</Button>
              </div>
            </div>
          )}

          <div className="border-t pt-3">
            <h4 className="font-semibold text-sm mb-2 flex items-center gap-2"><FileText className="h-4 w-4" /> Documents</h4>
            <DocumentsSection bucket="travaux-documents" recordId={travail.id} canWrite={perms.canEditFull || perms.canEditLimited} description="Devis, factures et pièces jointes (PDF)." />
          </div>

          <div className="border-t pt-3">
            <h4 className="font-semibold text-sm mb-2">Historique</h4>
            {history.length === 0 ? (
              <p className="text-xs text-muted-foreground">Aucun changement enregistré.</p>
            ) : (
              <ul className="space-y-1.5">
                {history.map((h) => (
                  <li key={h.id} className="text-xs rounded-md border px-2 py-1.5 bg-muted/20 flex items-center justify-between gap-2">
                    <span>
                      <span className="font-medium">{CHAMP_TRAVAUX_LABEL[h.champ_modifie] ?? h.champ_modifie}</span>
                      {h.champ_modifie === "creation" ? (
                        <>{" : "}{STATUT_LABEL[h.nouvelle_valeur ?? ""] ?? h.nouvelle_valeur}</>
                      ) : h.champ_modifie === "statut" ? (
                        <>{" : "}<span className="text-muted-foreground">{STATUT_LABEL[h.ancienne_valeur ?? ""] ?? h.ancienne_valeur ?? "—"}</span> → <span className="font-medium">{STATUT_LABEL[h.nouvelle_valeur ?? ""] ?? h.nouvelle_valeur}</span></>
                      ) : (
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
            <CommentSection table="travaux_commentaires" fkColumn="travaux_id" recordId={travail.id} canComment={perms.canComment || isChristelle} entityType="travaux" entityId={travail.id} link={`/travaux?open=${travail.id}`} entityTitle={travail.titre} />
          </div>
        </div>
        <DialogFooter className="gap-2">
          {canSubmit && <Button size="sm" variant="secondary" onClick={handleSubmit} disabled={busy}>Soumettre pour validation</Button>}
          {perms.canDelete && <Button variant="destructive" size="sm" onClick={handleDelete}><Trash2 className="mr-2 h-4 w-4" /> Supprimer</Button>}
          {(perms.canEditFull || perms.canEditLimited) && <Button size="sm" onClick={onEdit}><Pencil className="mr-2 h-4 w-4" /> Modifier</Button>}
          <Button variant="outline" size="sm" onClick={onClose}>Fermer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditDialog({ initial, prefill, uid, role, biens, profiles, onClose, onSaved }: {
  initial: Travail | null; prefill?: Prefill; uid: string; role: string;
  biens: Bien[]; profiles: Profile[];
  onClose: () => void; onSaved: () => void;
}) {
  const isEdit = !!initial;
  const basePerms = computePerms(role, initial?.created_by ?? uid, uid);
  const perms = initial && uid && initial.assigne_a === uid
    ? { ...basePerms, canEditFull: true, canEditLimited: false }
    : basePerms;
  const limited = isEdit && perms.canEditLimited && !perms.canEditFull;
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(() => ({
    bien_id: initial?.bien_id ?? prefill?.bien_id ?? "",
    titre: initial?.titre ?? prefill?.titre ?? "",
    description: initial?.description ?? "",
    budget_prevu: initial?.budget_prevu != null ? String(initial.budget_prevu) : "",
    budget_depense: initial ? String(initial.budget_depense ?? 0) : "0",
    statut: initial?.statut ?? "a_qualifier",
    date_debut: initial?.date_debut ?? "",
    date_fin: initial?.date_fin ?? "",
    assigne_a: initial?.assigne_a ?? "",
    charge_financiere: initial?.charge_financiere ?? "",
    reference_cheque: initial?.reference_cheque ?? "",
  }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.bien_id || !form.titre) return toast.error("Bien et titre obligatoires");
    if (!form.charge_financiere) return toast.error("Le champ « À la charge de » est obligatoire");
    setSaving(true);
    if (isEdit) {
      const patch: Record<string, any> = limited
        ? {
            statut: form.statut,
            assigne_a: form.assigne_a || null,
            charge_financiere: form.charge_financiere,
            date_debut: form.date_debut || null,
            date_fin: form.date_fin || null,
            budget_prevu: form.budget_prevu ? Number(form.budget_prevu) : null,
            budget_depense: form.budget_depense ? Number(form.budget_depense) : 0,
            reference_cheque: form.reference_cheque.trim() || null,
          }
        : {
            bien_id: form.bien_id,
            titre: form.titre.trim(),
            description: form.description.trim() || null,
            statut: form.statut,
            assigne_a: form.assigne_a || null,
            charge_financiere: form.charge_financiere,
            date_debut: form.date_debut || null,
            date_fin: form.date_fin || null,
            budget_prevu: form.budget_prevu ? Number(form.budget_prevu) : null,
            budget_depense: form.budget_depense ? Number(form.budget_depense) : 0,
            reference_cheque: form.reference_cheque.trim() || null,
          };
      const { error } = await (supabase.from("travaux") as any).update(patch).eq("id", initial!.id);
      setSaving(false);
      if (error) return toast.error(error.message);
      toast.success("Modifié"); onSaved();
    } else {
      const { error } = await (supabase.from("travaux") as any).insert({
        bien_id: form.bien_id,
        titre: form.titre.trim(),
        description: form.description.trim() || null,
        statut: form.statut,
        assigne_a: form.assigne_a || null,
        charge_financiere: form.charge_financiere,
        date_debut: form.date_debut || null,
        date_fin: form.date_fin || null,
        budget_prevu: form.budget_prevu ? Number(form.budget_prevu) : null,
        budget_depense: form.budget_depense ? Number(form.budget_depense) : 0,
        reference_cheque: form.reference_cheque.trim() || null,
        reclamation_id: prefill?.reclamation_id || null,
        origine: prefill?.origine || null,
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
            <DialogDescription>{limited ? "En tant que profil technique : statut, assignation, charge financière, dates et budget uniquement." : "Renseignez les informations."}</DialogDescription>
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
              <div className="grid gap-2"><Label>À la charge de *</Label>
                <Select value={form.charge_financiere} onValueChange={(v) => setForm({ ...form, charge_financiere: v })}>
                  <SelectTrigger><SelectValue placeholder="Sélectionner..." /></SelectTrigger>
                  <SelectContent>{CHARGES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-2"><Label>Référence chèque</Label>
              <Input value={form.reference_cheque} onChange={(e) => setForm({ ...form, reference_cheque: e.target.value })} placeholder="N° ou référence du chèque" />
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
