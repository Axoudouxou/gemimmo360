import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Plus, ChevronLeft, ChevronRight, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { fr } from "date-fns/locale";
import { TYPE_LABELS, TYPE_COLORS, STATUT_LABELS, type Activite } from "@/components/activites-widgets";

export const Route = createFileRoute("/_authenticated/calendrier")({
  head: () => ({
    meta: [
      { title: "Calendrier — GEM Immobilier" },
      { name: "description", content: "Calendrier et tâches de l'équipe." },
    ],
  }),
  validateSearch: (s: Record<string, unknown>) => ({
    bien_id: typeof s.bien_id === "string" ? s.bien_id : undefined,
    lot_id: typeof s.lot_id === "string" ? s.lot_id : undefined,
    contrat_id: typeof s.contrat_id === "string" ? s.contrat_id : undefined,
    contact_id: typeof s.contact_id === "string" ? s.contact_id : undefined,
  }),
  component: CalendrierPage,
});

type Profile = { id: string; email: string | null; role: string };

type Range = "today" | "week" | "month" | "custom";

function CalendrierPage() {
  const search = Route.useSearch();
  const [me, setMe] = useState<Profile | null>(null);
  const [viewingUserId, setViewingUserId] = useState<string>("");
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [items, setItems] = useState<Activite[]>([]);
  const [monthCursor, setMonthCursor] = useState<Date>(startOfMonth(new Date()));
  const [range, setRange] = useState<Range>("month");
  const [customStart, setCustomStart] = useState<string>("");
  const [customEnd, setCustomEnd] = useState<string>("");
  const [openNew, setOpenNew] = useState(false);
  const [editing, setEditing] = useState<Activite | null>(null);

  // Load me + profiles
  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const { data: prof } = await supabase.from("profiles").select("id, email, role").eq("id", u.user.id).maybeSingle();
      if (prof) {
        setMe(prof as Profile);
        setViewingUserId(prof.id);
      }
      const { data: all } = await supabase.from("profiles").select("id, email, role").order("email");
      setProfiles((all ?? []) as Profile[]);
    })();
  }, []);

  const isReadOnly = viewingUserId && me && viewingUserId !== me.id;

  const [rangeStart, rangeEnd] = useMemo<[Date, Date]>(() => {
    const today = startOfDay(new Date());
    if (range === "today") return [today, endOfWeek(today, { weekStartsOn: 1 })];
    if (range === "week")
      return [startOfWeek(today, { weekStartsOn: 1 }), endOfWeek(today, { weekStartsOn: 1 })];
    if (range === "custom" && customStart && customEnd) return [new Date(customStart), new Date(customEnd)];
    return [startOfMonth(monthCursor), endOfMonth(monthCursor)];
  }, [range, monthCursor, customStart, customEnd]);

  const load = useCallback(async () => {
    if (!viewingUserId) return;
    const { data } = await supabase
      .from("activites")
      .select("*")
      .eq("assigne_a", viewingUserId)
      .order("date_debut", { ascending: true, nullsFirst: false });
    setItems((data ?? []) as Activite[]);
  }, [viewingUserId]);

  useEffect(() => {
    load();
  }, [load]);

  // Filter items by range
  const filteredItems = useMemo(() => {
    return items.filter((a) => {
      if (!a.date_debut) return range === "month" || range === "custom";
      const d = new Date(a.date_debut);
      return d >= rangeStart && d <= rangeEnd;
    });
  }, [items, rangeStart, rangeEnd, range]);

  // Calendar grid days
  const days = useMemo(() => {
    const gridStart = startOfWeek(startOfMonth(monthCursor), { weekStartsOn: 1 });
    const gridEnd = endOfWeek(endOfMonth(monthCursor), { weekStartsOn: 1 });
    return eachDayOfInterval({ start: gridStart, end: gridEnd });
  }, [monthCursor]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, Activite[]>();
    for (const a of items) {
      if (!a.date_debut) continue;
      const key = format(new Date(a.date_debut), "yyyy-MM-dd");
      const arr = map.get(key) ?? [];
      arr.push(a);
      map.set(key, arr);
    }
    return map;
  }, [items]);

  // Tasks grouped
  const tasksAFaire = filteredItems.filter((a) => a.statut === "a_faire");
  const tasksEnCours = filteredItems.filter((a) => a.statut === "en_cours");
  const tasksFait = filteredItems.filter((a) => a.statut === "fait" || a.statut === "realisee");

  const handleToggle = async (id: string, done: boolean) => {
    if (isReadOnly) return;
    const { error } = await supabase.from("activites").update({ statut: done ? "fait" : "a_faire" }).eq("id", id);
    if (error) toast.error(error.message);
    load();
  };

  const handleDelete = async (id: string) => {
    if (isReadOnly) return;
    if (!confirm("Supprimer cette tâche ?")) return;
    const { error } = await supabase.from("activites").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Tâche supprimée");
    load();
  };

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl">Calendrier</h1>
          <p className="mt-1 text-sm text-muted-foreground">Vos activités et tâches.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={viewingUserId} onValueChange={setViewingUserId}>
            <SelectTrigger className="w-[240px]">
              <SelectValue placeholder="Voir le calendrier de" />
            </SelectTrigger>
            <SelectContent>
              {profiles.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.email ?? p.id} {me?.id === p.id ? "(moi)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <NewActiviteDialog
            open={openNew}
            setOpen={setOpenNew}
            defaultAssignee={me?.id ?? ""}
            defaults={search}
            profiles={profiles}
            onSaved={load}
          />
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Select value={range} onValueChange={(v) => setRange(v as Range)}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="today">Aujourd'hui</SelectItem>
            <SelectItem value="week">Cette semaine</SelectItem>
            <SelectItem value="month">Ce mois</SelectItem>
            <SelectItem value="custom">Personnalisé</SelectItem>
          </SelectContent>
        </Select>
        {range === "custom" && (
          <>
            <Input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="w-[160px]" />
            <Input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="w-[160px]" />
          </>
        )}
      </div>

      <Tabs defaultValue="calendar">
        <TabsList>
          <TabsTrigger value="calendar">Vue calendrier</TabsTrigger>
          <TabsTrigger value="tasks">Liste des tâches</TabsTrigger>
        </TabsList>

        <TabsContent value="calendar" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="capitalize">{format(monthCursor, "MMMM yyyy", { locale: fr })}</CardTitle>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="icon" onClick={() => setMonthCursor((d) => addMonths(d, -1))}><ChevronLeft className="h-4 w-4" /></Button>
                <Button variant="outline" size="sm" onClick={() => setMonthCursor(startOfMonth(new Date()))}>Aujourd'hui</Button>
                <Button variant="outline" size="icon" onClick={() => setMonthCursor((d) => addMonths(d, 1))}><ChevronRight className="h-4 w-4" /></Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-7 gap-1 text-xs font-medium text-muted-foreground mb-1">
                {["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map((d) => (
                  <div key={d} className="p-1 text-center">{d}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {days.map((d) => {
                  const key = format(d, "yyyy-MM-dd");
                  const events = eventsByDay.get(key) ?? [];
                  const isToday = isSameDay(d, new Date());
                  const inMonth = isSameMonth(d, monthCursor);
                  return (
                    <div
                      key={key}
                      className={`min-h-[90px] rounded border p-1 text-xs ${inMonth ? "bg-background" : "bg-muted/30 text-muted-foreground"} ${isToday ? "ring-2 ring-primary" : ""}`}
                    >
                      <div className="font-medium mb-1">{format(d, "d")}</div>
                      <div className="space-y-0.5">
                        {events.slice(0, 3).map((e) => (
                          <div
                            key={e.id}
                            className={`truncate rounded px-1 py-0.5 text-white ${TYPE_COLORS[e.type_activite] ?? "bg-gray-400"}`}
                            title={e.titre}
                          >
                            {e.date_debut ? format(new Date(e.date_debut), "HH:mm") + " " : ""}
                            {e.titre}
                          </div>
                        ))}
                        {events.length > 3 && (
                          <div className="text-[10px] text-muted-foreground">+{events.length - 3} autre(s)</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tasks" className="mt-4">
          <div className="grid gap-4 md:grid-cols-3">
            <TaskColumn title="À faire" items={tasksAFaire} readonly={!!isReadOnly} onToggle={handleToggle} onEdit={setEditing} onDelete={handleDelete} />
            <TaskColumn title="En cours" items={tasksEnCours} readonly={!!isReadOnly} onToggle={handleToggle} onEdit={setEditing} onDelete={handleDelete} />
            <TaskColumn title="Fait" items={tasksFait} readonly={!!isReadOnly} onToggle={handleToggle} onEdit={setEditing} onDelete={handleDelete} done />
          </div>
        </TabsContent>
      </Tabs>

      {editing && (
        <ActiviteDialog
          open={!!editing}
          setOpen={(o) => { if (!o) setEditing(null); }}
          profiles={profiles}
          defaultAssignee={editing.assigne_a}
          defaults={{}}
          initial={editing}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </div>
  );
}

function TaskColumn({
  title,
  items,
  readonly,
  onToggle,
  onEdit,
  onDelete,
  done = false,
}: {
  title: string;
  items: Activite[];
  readonly: boolean;
  onToggle: (id: string, done: boolean) => void;
  onEdit: (a: Activite) => void;
  onDelete: (id: string) => void;
  done?: boolean;
}) {
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-base">{title} ({items.length})</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Aucune tâche.</p>
        ) : items.map((a) => (
          <div key={a.id} className={`flex items-start gap-2 rounded border p-2 ${a.priorite === "urgente" ? "border-red-400 bg-red-50 dark:bg-red-950/20" : ""}`}>
            <Checkbox
              checked={done}
              disabled={readonly}
              onCheckedChange={(v) => onToggle(a.id, !!v)}
              className="mt-0.5"
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`inline-block h-2 w-2 rounded-full ${TYPE_COLORS[a.type_activite] ?? "bg-gray-400"}`} />
                <span className={`text-sm font-medium ${done ? "line-through text-muted-foreground" : ""}`}>{a.titre}</span>
                {a.priorite === "urgente" && <Badge className="bg-red-500 text-white hover:bg-red-500 text-[10px]">Urgente</Badge>}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {TYPE_LABELS[a.type_activite] ?? a.type_activite}
                {a.date_debut ? ` · ${format(new Date(a.date_debut), "d MMM HH:mm", { locale: fr })}` : ""}
                {a.lieu ? ` · ${a.lieu}` : ""}
                {` · ${STATUT_LABELS[a.statut] ?? a.statut}`}
              </div>
            </div>
            {!readonly && (
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(a)} aria-label="Modifier">
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => onDelete(a.id)} aria-label="Supprimer">
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function NewActiviteDialog({
  open,
  setOpen,
  defaultAssignee,
  defaults,
  profiles,
  onSaved,
}: {
  open: boolean;
  setOpen: (b: boolean) => void;
  defaultAssignee: string;
  defaults: { bien_id?: string; lot_id?: string; contrat_id?: string; contact_id?: string };
  profiles: Profile[];
  onSaved: () => void;
}) {
  const [titre, setTitre] = useState("");
  const [type, setType] = useState("tache");
  const [dateDebut, setDateDebut] = useState("");
  const [dateFin, setDateFin] = useState("");
  const [assigne, setAssigne] = useState(defaultAssignee);
  const [lieu, setLieu] = useState("");
  const [priorite, setPriorite] = useState("normale");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (open) setAssigne(defaultAssignee); }, [open, defaultAssignee]);

  const save = async () => {
    if (!titre.trim() || !assigne) {
      toast.error("Titre et assigné requis");
      return;
    }
    setSaving(true);
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("activites").insert({
      titre: titre.trim(),
      type_activite: type,
      date_debut: dateDebut ? new Date(dateDebut).toISOString() : null,
      date_fin: dateFin ? new Date(dateFin).toISOString() : null,
      assigne_a: assigne,
      lieu: lieu.trim() || null,
      priorite,
      notes: notes.trim() || null,
      created_by: u.user?.id ?? null,
      bien_id: defaults.bien_id ?? null,
      lot_id: defaults.lot_id ?? null,
      contrat_id: defaults.contrat_id ?? null,
      contact_id: defaults.contact_id ?? null,
      statut: type === "tache" ? "a_faire" : "planifiee",
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Activité créée");
    setTitre(""); setDateDebut(""); setDateFin(""); setLieu(""); setNotes(""); setPriorite("normale"); setType("tache");
    setOpen(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus className="mr-2 h-4 w-4" /> Nouvelle activité</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Nouvelle activité / tâche</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Titre</Label>
            <Input value={titre} onChange={(e) => setTitre(e.target.value)} placeholder="Ex : Visite appartement" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Type</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
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
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Début</Label>
              <Input type="datetime-local" value={dateDebut} onChange={(e) => setDateDebut(e.target.value)} />
            </div>
            <div>
              <Label>Fin</Label>
              <Input type="datetime-local" value={dateFin} onChange={(e) => setDateFin(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Assigné à</Label>
            <Select value={assigne} onValueChange={setAssigne}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {profiles.map((p) => <SelectItem key={p.id} value={p.id}>{p.email ?? p.id}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Lieu</Label>
            <Input value={lieu} onChange={(e) => setLieu(e.target.value)} />
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
          <Button onClick={save} disabled={saving}>Enregistrer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
