import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Plus, CalendarClock, ArrowRight, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { endOfWeek, format, isAfter, isBefore, isSameDay, startOfDay } from "date-fns";
import { fr } from "date-fns/locale";
import {
  STATUT_LABELS,
  TYPE_LABELS,
  TERRAIN_TYPES,
  ActiviteTypeBadge,
  type Activite,
} from "@/components/activites-widgets";
import { ActiviteDetailDialog } from "@/components/activite-detail-dialog";
import { MultiSelect } from "@/components/ui/multi-select";
import { fetchAssignesMap, fetchAssignesSupp, syncAssignes } from "@/lib/activite-liaisons";

export const Route = createFileRoute("/_authenticated/taches")({
  head: () => ({
    meta: [
      { title: "Tâches — GEM Immobilier" },
      { name: "description", content: "Suivi Kanban des tâches de l'équipe : à faire, en cours, terminées, annulées." },
      { property: "og:title", content: "Tâches — GEM Immobilier" },
      { property: "og:description", content: "Qu'est-ce qui doit être fait et où en est-on ?" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  validateSearch: (s: Record<string, unknown>) => ({
    open: typeof s.open === "string" ? s.open : undefined,
  }),
  component: TachesPage,
});

type Profile = { id: string; email: string | null; role: string };
type Statut = "a_faire" | "en_cours" | "terminee" | "annulee";

const COLUMNS: Array<{ key: Statut; title: string }> = [
  { key: "a_faire", title: "À faire" },
  { key: "en_cours", title: "En cours" },
  { key: "terminee", title: "Terminées" },
  { key: "annulee", title: "Annulées" },
];

const TASK_TYPES = Object.entries(TYPE_LABELS).filter(([k]) => !(TERRAIN_TYPES as readonly string[]).includes(k));

const shortName = (email: string | null | undefined) => (email ? email.split("@")[0] : "—");

const echeanceOf = (a: Activite) => a.date_fin ?? a.date_debut ?? null;

function contexteOf(a: Activite): { to: string; label: string; module: string } | null {
  if (a.contrat_id) return { to: `/contrats/${a.contrat_id}`, label: "Contrat", module: "contrats" };
  if (a.lot_id) return { to: `/lots/${a.lot_id}`, label: "Lot", module: "biens" };
  if (a.bien_id) return { to: `/biens/${a.bien_id}`, label: "Bien", module: "biens" };
  if (a.contact_id) return { to: `/contacts/${a.contact_id}`, label: "Contact", module: "contacts" };
  return null;
}

function TachesPage() {
  const search = Route.useSearch();
  const [me, setMe] = useState<Profile | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [items, setItems] = useState<Activite[]>([]);
  const [assignesMap, setAssignesMap] = useState<Record<string, string[]>>({});
  const [agentFilter, setAgentFilter] = useState("all");
  const [prioFilter, setPrioFilter] = useState("all");
  const [echFilter, setEchFilter] = useState("all");
  const [moduleFilter, setModuleFilter] = useState("all");
  const [openNew, setOpenNew] = useState(false);
  const [editing, setEditing] = useState<Activite | null>(null);
  const [detail, setDetail] = useState<Activite | null>(null);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const [{ data: prof }, { data: all }] = await Promise.all([
        supabase.from("profiles").select("id, email, role").eq("id", u.user.id).maybeSingle(),
        supabase.from("profiles").select("id, email, role").order("email"),
      ]);
      if (prof) {
        setMe(prof as Profile);
        setAgentFilter((prof as Profile).id);
      }
      setProfiles((all ?? []) as Profile[]);
    })();
  }, []);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("activites")
      .select("*")
      .not("type_activite", "in", `(${(TERRAIN_TYPES as readonly string[]).join(",")})`)
      .order("date_fin", { ascending: true, nullsFirst: false })
      .limit(1000);
    const rows = (data ?? []) as Activite[];
    setItems(rows);
    setAssignesMap(await fetchAssignesMap(rows.map((r) => r.id)));
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!search.open || items.length === 0) return;
    const found = items.find((a) => a.id === search.open);
    if (found) setDetail(found);
  }, [search.open, items]);

  const filtered = useMemo(() => {
    const today = startOfDay(new Date());
    const weekEnd = endOfWeek(today, { weekStartsOn: 1 });
    return items.filter((a) => {
      if (
        agentFilter !== "all" &&
        a.assigne_a !== agentFilter &&
        !(assignesMap[a.id] ?? []).includes(agentFilter)
      )
        return false;
      if (prioFilter !== "all" && a.priorite !== prioFilter) return false;
      if (moduleFilter !== "all") {
        const ctx = contexteOf(a);
        if (moduleFilter === "aucun" ? !!ctx : ctx?.module !== moduleFilter) return false;
      }
      if (echFilter !== "all") {
        const raw = echeanceOf(a);
        if (!raw) return false;
        const d = new Date(raw);
        if (echFilter === "retard" && !(isBefore(d, today) && a.statut !== "terminee")) return false;
        if (echFilter === "aujourdhui" && !isSameDay(d, today)) return false;
        if (echFilter === "semaine" && !(!isBefore(d, today) && !isAfter(d, weekEnd))) return false;
        if (echFilter === "avenir" && !isAfter(d, weekEnd)) return false;
      }
      return true;
    });
  }, [items, agentFilter, prioFilter, echFilter, moduleFilter, assignesMap]);

  const agentsOf = (a: Activite) => {
    const ids = Array.from(new Set([a.assigne_a, ...(assignesMap[a.id] ?? [])].filter(Boolean)));
    const names = ids.map((id) => shortName(profiles.find((p) => p.id === id)?.email));
    return names.length > 0 ? names.join(", ") : "—";
  };

  const move = async (a: Activite, statut: Statut) => {
    if (a.statut === statut) return;
    const { error } = await supabase.from("activites").update({ statut }).eq("id", a.id);
    if (error) return toast.error(error.message);
    toast.success(`Déplacée vers « ${STATUT_LABELS[statut]} »`);
    load();
  };

  const remove = async (a: Activite) => {
    if (!confirm(`Supprimer la tâche « ${a.titre} » ?`)) return;
    const { error } = await supabase.from("activites").delete().eq("id", a.id);
    if (error) return toast.error(error.message);
    toast.success("Tâche supprimée");
    load();
  };

  return (
    <div className="mx-auto max-w-[1400px] px-6 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl">Tâches</h1>
          <p className="mt-1 text-sm text-muted-foreground">Qu'est-ce qui doit être fait et où en est-on ?</p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to="/calendrier"><CalendarClock className="mr-2 h-4 w-4" /> Calendrier terrain</Link>
          </Button>
          <Button size="sm" onClick={() => { setEditing(null); setOpenNew(true); }}>
            <Plus className="mr-2 h-4 w-4" /> Nouvelle tâche
          </Button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Select value={agentFilter} onValueChange={setAgentFilter}>
          <SelectTrigger className="w-[200px]"><SelectValue placeholder="Agent" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les agents</SelectItem>
            {profiles.map((p) => <SelectItem key={p.id} value={p.id}>{shortName(p.email)}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={prioFilter} onValueChange={setPrioFilter}>
          <SelectTrigger className="w-[170px]"><SelectValue placeholder="Priorité" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes priorités</SelectItem>
            <SelectItem value="urgente">Urgente</SelectItem>
            <SelectItem value="normale">Normale</SelectItem>
          </SelectContent>
        </Select>
        <Select value={echFilter} onValueChange={setEchFilter}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Échéance" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes échéances</SelectItem>
            <SelectItem value="retard">En retard</SelectItem>
            <SelectItem value="aujourdhui">Aujourd'hui</SelectItem>
            <SelectItem value="semaine">Cette semaine</SelectItem>
            <SelectItem value="avenir">À venir</SelectItem>
          </SelectContent>
        </Select>
        <Select value={moduleFilter} onValueChange={setModuleFilter}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Contexte" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les contextes</SelectItem>
            <SelectItem value="biens">Biens / Lots</SelectItem>
            <SelectItem value="contacts">Contacts</SelectItem>
            <SelectItem value="contrats">Contrats</SelectItem>
            <SelectItem value="aucun">Sans contexte</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {COLUMNS.map((col) => {
          const list = filtered.filter((a) => a.statut === col.key);
          return (
            <div
              key={col.key}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                const id = e.dataTransfer.getData("text/plain");
                const a = items.find((x) => x.id === id);
                if (a) move(a, col.key);
              }}
              className="rounded-lg border bg-muted/20 p-2"
            >
              <div className="mb-2 flex items-center justify-between px-1">
                <span className="text-sm font-semibold">{col.title}</span>
                <Badge variant="secondary">{list.length}</Badge>
              </div>
              <div className="space-y-2">
                {list.length === 0 && (
                  <p className="py-6 text-center text-xs text-muted-foreground">Aucune tâche</p>
                )}
                {list.map((a) => {
                  const ctx = contexteOf(a);
                  const raw = echeanceOf(a);
                  const late = raw && isBefore(new Date(raw), startOfDay(new Date())) && a.statut !== "terminee";
                  return (
                    <Card
                      key={a.id}
                      draggable
                      onDragStart={(e) => e.dataTransfer.setData("text/plain", a.id)}
                      className="cursor-pointer transition hover:shadow-sm"
                      onClick={() => setDetail(a)}
                    >
                      <CardContent className="space-y-2 p-3">
                        <div className="flex items-start justify-between gap-2">
                          <span className={`text-sm font-medium ${a.statut === "terminee" ? "line-through text-muted-foreground" : ""}`}>
                            {a.titre}
                          </span>
                          <div className="flex shrink-0 gap-1">
                            <button
                              type="button"
                              className="text-muted-foreground hover:text-foreground"
                              onClick={(e) => { e.stopPropagation(); setEditing(a); setOpenNew(true); }}
                              aria-label="Modifier"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              className="text-muted-foreground hover:text-destructive"
                              onClick={(e) => { e.stopPropagation(); remove(a); }}
                              aria-label="Supprimer"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <ActiviteTypeBadge type={a.type_activite} />
                          {a.priorite === "urgente" && <Badge className="bg-red-500 text-white hover:bg-red-500">Urgente</Badge>}
                        </div>
                        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                          {raw && (
                            <span className={late ? "font-medium text-destructive" : ""}>
                              {format(new Date(raw), "d MMM yyyy", { locale: fr })}
                            </span>
                          )}
                          <span>{agentsOf(a)}</span>
                          {ctx && (
                            <Link
                              to={ctx.to}
                              onClick={(e) => e.stopPropagation()}
                              className="inline-flex items-center gap-1 text-primary hover:underline"
                            >
                              {ctx.label} <ArrowRight className="h-3 w-3" />
                            </Link>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <TacheDialog
        open={openNew}
        setOpen={setOpenNew}
        profiles={profiles}
        defaultAgent={me?.id ?? ""}
        tache={editing}
        onSaved={() => { setOpenNew(false); setEditing(null); load(); }}
      />

      <ActiviteDetailDialog
        open={!!detail}
        setOpen={(o) => { if (!o) setDetail(null); }}
        activite={detail}
        me={me}
        role={me?.role ?? ""}
        profiles={profiles}
        onEdit={(a) => { setDetail(null); setEditing(a); setOpenNew(true); }}
        onChanged={() => { setDetail(null); load(); }}
        onDeleted={() => { setDetail(null); load(); }}
      />
    </div>
  );
}

type Opt = { value: string; label: string };

function TacheDialog({
  open,
  setOpen,
  profiles,
  defaultAgent,
  tache,
  onSaved,
}: {
  open: boolean;
  setOpen: (b: boolean) => void;
  profiles: Profile[];
  defaultAgent: string;
  tache: Activite | null;
  onSaved: () => void;
}) {
  const [titre, setTitre] = useState("");
  const [type, setType] = useState("tache");
  const [priorite, setPriorite] = useState("normale");
  const [echeance, setEcheance] = useState("");
  const [agents, setAgents] = useState<string[]>(defaultAgent ? [defaultAgent] : []);
  const [notes, setNotes] = useState("");
  const [bienId, setBienId] = useState("");
  const [contactId, setContactId] = useState("");
  const [contratId, setContratId] = useState("");
  const [biens, setBiens] = useState<Opt[]>([]);
  const [contacts, setContacts] = useState<Opt[]>([]);
  const [contrats, setContrats] = useState<Opt[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitre(tache?.titre ?? "");
    setType(tache?.type_activite ?? "tache");
    setPriorite(tache?.priorite ?? "normale");
    setEcheance(tache?.date_fin ? format(new Date(tache.date_fin), "yyyy-MM-dd") : "");
    const principal = tache?.assigne_a ?? defaultAgent;
    setAgents(principal ? [principal] : []);
    if (tache) {
      fetchAssignesSupp(tache.id).then((ids) =>
        setAgents(Array.from(new Set([principal, ...ids].filter(Boolean)))),
      );
    }
    setNotes(tache?.notes ?? "");
    setBienId(tache?.bien_id ?? "");
    setContactId(tache?.contact_id ?? "");
    setContratId(tache?.contrat_id ?? "");
  }, [open, tache, defaultAgent]);

  useEffect(() => {
    if (!open) return;
    (async () => {
      const [b, c, ct] = await Promise.all([
        supabase.from("biens").select("id, titre, adresse").order("titre").limit(1000),
        supabase.from("contacts").select("id, nom, prenom").eq("archive", false).order("nom").limit(1000),
        supabase.from("contrats").select("id, date_debut, statut").order("date_debut", { ascending: false }).limit(500),
      ]);
      setBiens(((b.data ?? []) as Array<{ id: string; titre: string | null; adresse: string | null }>)
        .map((r) => ({ value: r.id, label: [r.titre, r.adresse].filter(Boolean).join(" · ") || r.id.slice(0, 8) })));
      setContacts(((c.data ?? []) as Array<{ id: string; nom: string | null; prenom: string | null }>)
        .map((r) => ({ value: r.id, label: `${r.nom ?? ""} ${r.prenom ?? ""}`.trim() || r.id.slice(0, 8) })));
      setContrats(((ct.data ?? []) as Array<{ id: string; date_debut: string | null; statut: string | null }>)
        .map((r) => ({ value: r.id, label: `${r.date_debut ?? "sans date"} · ${r.statut ?? ""}` })));
    })();
  }, [open]);

  const save = async () => {
    if (!titre.trim()) return toast.error("Le titre est obligatoire");
    if (agents.length === 0) return toast.error("Au moins un agent assigné est obligatoire");
    setSaving(true);
    const payload = {
      titre: titre.trim(),
      type_activite: type,
      priorite,
      date_fin: echeance ? new Date(`${echeance}T18:00`).toISOString() : null,
      assigne_a: agents[0],
      notes: notes.trim() || null,
      bien_id: bienId || null,
      contact_id: contactId || null,
      contrat_id: contratId || null,
    };
    let error;
    let savedId = tache?.id ?? null;
    if (tache) {
      ({ error } = await supabase.from("activites").update(payload).eq("id", tache.id));
    } else {
      const { data: u } = await supabase.auth.getUser();
      const res = await supabase
        .from("activites")
        .insert({ ...payload, created_by: u.user?.id ?? null, statut: "a_faire" })
        .select("id")
        .single();
      error = res.error ?? undefined;
      savedId = res.data?.id ?? null;
    }
    if (!error && savedId) await syncAssignes(savedId, agents);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(tache ? "Tâche mise à jour" : "Tâche créée");
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader><DialogTitle>{tache ? "Modifier la tâche" : "Nouvelle tâche"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Titre</Label>
            <Input value={titre} onChange={(e) => setTitre(e.target.value)} placeholder="Ex : Appeler Mme Kouassi" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Type</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TASK_TYPES.map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Priorité</Label>
              <Select value={priorite} onValueChange={setPriorite}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="normale">Normale</SelectItem>
                  <SelectItem value="urgente">Urgente</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Échéance (facultative)</Label>
            <Input type="date" value={echeance} onChange={(e) => setEcheance(e.target.value)} />
          </div>
          <div>
            <Label>Agents assignés</Label>
            <MultiSelect
              values={agents}
              onChange={setAgents}
              options={profiles.map((p) => ({ value: p.id, label: shortName(p.email) }))}
              placeholder="Ajouter un agent..."
              emptyLabel="Aucun agent assigné"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Le premier agent est le responsable ; les suivants sont co-assignés.
            </p>
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </div>
          <div className="space-y-3 rounded-md border bg-muted/20 p-3">
            <p className="text-xs font-medium text-muted-foreground">Contexte (facultatif)</p>
            <div>
              <Label>Bien</Label>
              <SearchableSelect value={bienId} onChange={setBienId} options={biens} placeholder="Rechercher un bien..." />
            </div>
            <div>
              <Label>Contact</Label>
              <SearchableSelect value={contactId} onChange={setContactId} options={contacts} placeholder="Rechercher un contact..." />
            </div>
            <div>
              <Label>Contrat</Label>
              <SearchableSelect value={contratId} onChange={setContratId} options={contrats} placeholder="Rechercher un contrat..." />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
          <Button onClick={save} disabled={saving}>{tache ? "Enregistrer" : "Créer"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
