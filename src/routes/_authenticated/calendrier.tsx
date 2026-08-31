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
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Plus, ChevronLeft, ChevronRight, Pencil, Trash2, Circle } from "lucide-react";
import { toast } from "sonner";
import {
  addDays,
  addMonths,
  addWeeks,
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
import { TYPE_LABELS, TYPE_COLORS, TYPE_ICONS, TYPE_BADGE_CLASSES, ActiviteTypeBadge, STATUT_LABELS, RECURRENCE_LABELS, type Activite } from "@/components/activites-widgets";
import { ActiviteDetailDialog, computeActivitePerms } from "@/components/activite-detail-dialog";

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
    transaction_id: typeof s.transaction_id === "string" ? s.transaction_id : undefined,
    open: typeof s.open === "string" ? s.open : undefined,
  }),
  component: CalendrierPage,
});

type Profile = { id: string; email: string | null; role: string };
type Range = "today" | "week" | "month" | "custom";

const LIE_TYPES = [
  { value: "none", label: "Aucun" },
  { value: "bien", label: "Bien" },
  { value: "lot", label: "Lot" },
  { value: "contrat", label: "Contrat" },
  { value: "contact", label: "Contact" },
  { value: "transaction", label: "Transaction" },
] as const;

type LinkOpt = { id: string; label: string };

function nextRecurrenceDate(current: Date, recurrence: string): Date | null {
  if (recurrence === "quotidienne") return addDays(current, 1);
  if (recurrence === "hebdomadaire") return addWeeks(current, 1);
  if (recurrence === "mensuelle") return addMonths(current, 1);
  return null;
}

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
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [openNew, setOpenNew] = useState(false);
  const [editing, setEditing] = useState<Activite | null>(null);
  const [detail, setDetail] = useState<Activite | null>(null);
  const [dayDetail, setDayDetail] = useState<Date | null>(null);
  const [quickTitle, setQuickTitle] = useState("");

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
    // Tâches dont l'utilisateur est le responsable principal OU un co-assigné
    const coIds = await fetchActiviteIdsForUser(viewingUserId);
    const filter = coIds.length > 0
      ? `assigne_a.eq.${viewingUserId},id.in.(${coIds.join(",")})`
      : `assigne_a.eq.${viewingUserId}`;
    const { data } = await supabase
      .from("activites")
      .select("*")
      .or(filter)
      .order("date_debut", { ascending: true, nullsFirst: false });
    setItems((data ?? []) as Activite[]);
  }, [viewingUserId]);


  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!search.open || items.length === 0) return;
    const found = items.find((a) => a.id === search.open);
    if (found) setDetail(found);
  }, [search.open, items]);

  const filteredItems = useMemo(() => {
    return items.filter((a) => {
      if (typeFilter !== "all" && a.type_activite !== typeFilter) return false;
      if (!a.date_debut) return range === "month" || range === "custom";
      const d = new Date(a.date_debut);
      return d >= rangeStart && d <= rangeEnd;
    });
  }, [items, rangeStart, rangeEnd, range, typeFilter]);

  const days = useMemo(() => {
    const gridStart = startOfWeek(startOfMonth(monthCursor), { weekStartsOn: 1 });
    const gridEnd = endOfWeek(endOfMonth(monthCursor), { weekStartsOn: 1 });
    return eachDayOfInterval({ start: gridStart, end: gridEnd });
  }, [monthCursor]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, Activite[]>();
    const seen = new Set<string>();
    for (const a of items) {
      if (!a.date_debut) continue;
      if (seen.has(a.id)) continue;
      seen.add(a.id);
      if (typeFilter !== "all" && a.type_activite !== typeFilter) continue;
      const key = format(new Date(a.date_debut), "yyyy-MM-dd");
      const arr = map.get(key) ?? [];
      arr.push(a);
      map.set(key, arr);
    }
    return map;
  }, [items, typeFilter]);

  const tasksAFaire = filteredItems.filter((a) => a.statut === "a_faire");
  const tasksPlanifiee = filteredItems.filter((a) => a.statut === "planifiee");
  const tasksEnCours = filteredItems.filter((a) => a.statut === "en_cours");
  const tasksFait = filteredItems.filter((a) => a.statut === "terminee");
  const tasksAnnulee = filteredItems.filter((a) => a.statut === "annulee");

  const setStatut = async (a: Activite, newStatut: string) => {
    const perms = computeActivitePerms(a, me?.id ?? null, me?.role ?? "");
    if (!perms.canChangeStatut) {
      toast.error("Vous ne pouvez pas modifier cette tâche.");
      return;
    }
    const { error } = await supabase.from("activites").update({ statut: newStatut }).eq("id", a.id);
    if (error) { toast.error(error.message); return; }

    // Recurrence: mark done → create next occurrence
    const isDone = newStatut === "terminee";
    const wasDone = a.statut === "terminee";
    if (isDone && !wasDone && a.recurrence && a.recurrence !== "aucune" && a.date_debut) {
      const next = nextRecurrenceDate(new Date(a.date_debut), a.recurrence);
      if (next) {
        const nextFin = a.date_fin ? nextRecurrenceDate(new Date(a.date_fin), a.recurrence) : null;
        await supabase.from("activites").insert({
          titre: a.titre,
          type_activite: a.type_activite,
          date_debut: next.toISOString(),
          date_fin: nextFin ? nextFin.toISOString() : null,
          assigne_a: a.assigne_a,
          created_by: me?.id ?? null,
          lieu: a.lieu,
          priorite: a.priorite,
          notes: a.notes,
          bien_id: a.bien_id,
          lot_id: a.lot_id,
          contrat_id: a.contrat_id,
          contact_id: a.contact_id,
          transaction_id: a.transaction_id ?? null,
          recurrence: a.recurrence,
          statut: a.type_activite === "tache" ? "a_faire" : "planifiee",
        });
        toast.success("Prochaine occurrence créée");
      }
    }
    load();
  };

  const handleToggle = async (a: Activite, done: boolean) => {
    await setStatut(a, done ? "terminee" : "a_faire");
  };

  const handleDelete = async (a: Activite) => {
    const perms = computeActivitePerms(a, me?.id ?? null, me?.role ?? "");
    if (!perms.canDelete) return;
    if (!confirm("Supprimer cette tâche ?")) return;
    const { error } = await supabase.from("activites").delete().eq("id", a.id);
    if (error) return toast.error(error.message);
    toast.success("Tâche supprimée");
    load();
  };

  const handleQuickAdd = async () => {
    const t = quickTitle.trim();
    if (!t || !me) return;
    const { error } = await supabase.from("activites").insert({
      titre: t,
      type_activite: "tache",
      assigne_a: me.id,
      created_by: me.id,
      priorite: "normale",
      statut: "a_faire",
    });
    if (error) return toast.error(error.message);
    setQuickTitle("");
    load();
  };

  const handleDrop = async (a: Activite, target: "a_faire" | "planifiee" | "en_cours" | "terminee" | "annulee") => {
    if (a.statut === target) return;
    await setStatut(a, target);
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
            <SelectTrigger className="w-[240px]"><SelectValue placeholder="Voir le calendrier de" /></SelectTrigger>
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
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les types</SelectItem>
            {Object.entries(TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
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
                      onClick={() => events.length > 0 && setDayDetail(d)}
                      className={`min-h-[96px] rounded border p-1 text-xs transition-colors ${
                        inMonth ? "bg-background" : "bg-muted/20"
                      } ${isToday ? "border-primary/60 bg-primary/10" : ""} ${
                        events.length > 0 ? "cursor-pointer hover:bg-muted/50" : ""
                      }`}
                    >
                      <div className="mb-1 flex items-center justify-between">
                        <span
                          className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 font-medium ${
                            isToday
                              ? "bg-primary text-primary-foreground"
                              : inMonth
                                ? "text-foreground"
                                : "text-muted-foreground/50"
                          }`}
                        >
                          {format(d, "d")}
                        </span>
                        {events.length > 0 && (
                          <span className="flex items-center gap-0.5">
                            {Array.from(new Set(events.map((e) => e.type_activite)))
                              .slice(0, 3)
                              .map((t) => (
                                <span key={t} className={`h-1.5 w-1.5 rounded-full ${TYPE_COLORS[t] ?? "bg-gray-400"}`} />
                              ))}
                          </span>
                        )}
                      </div>
                      <div className="space-y-0.5">
                        {events.slice(0, 2).map((e) => {
                          const Icon = TYPE_ICONS[e.type_activite] ?? Circle;
                          return (
                            <button
                              type="button"
                              key={e.id}
                              onClick={(ev) => { ev.stopPropagation(); setDetail(e); }}
                              className={`flex w-full items-center gap-1 rounded border px-1 py-0.5 text-left hover:opacity-80 ${TYPE_BADGE_CLASSES[e.type_activite] ?? TYPE_BADGE_CLASSES.autre}`}
                              title={e.titre}
                            >
                              <Icon className="h-3 w-3 shrink-0" />
                              <span className="truncate">
                                {e.date_debut ? format(new Date(e.date_debut), "HH:mm") + " " : ""}
                                {e.titre}
                              </span>
                            </button>
                          );
                        })}
                        {events.length > 2 && (
                          <button
                            type="button"
                            onClick={(ev) => { ev.stopPropagation(); setDayDetail(d); }}
                            className="w-full text-left text-[10px] font-medium text-primary hover:underline"
                          >
                            +{events.length - 2} autre(s)
                          </button>
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
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <TaskColumn
              title="À faire"
              targetStatut="a_faire"
              items={tasksAFaire}
              me={me}
              onOpen={setDetail}
              onToggle={handleToggle}
              onEdit={setEditing}
              onDelete={handleDelete}
              onDrop={handleDrop}
              quickAdd={
                <div className="mb-2 flex gap-2">
                  <Input
                    value={quickTitle}
                    onChange={(e) => setQuickTitle(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleQuickAdd(); }}
                    placeholder="Ajouter une tâche..."
                    className="h-8 text-sm"
                  />
                </div>
              }
            />
            <TaskColumn title="Planifiée" targetStatut="planifiee" items={tasksPlanifiee} me={me} onOpen={setDetail} onToggle={handleToggle} onEdit={setEditing} onDelete={handleDelete} onDrop={handleDrop} />
            <TaskColumn title="En cours" targetStatut="en_cours" items={tasksEnCours} me={me} onOpen={setDetail} onToggle={handleToggle} onEdit={setEditing} onDelete={handleDelete} onDrop={handleDrop} />
            <TaskColumn title="Terminée" targetStatut="terminee" items={tasksFait} me={me} onOpen={setDetail} onToggle={handleToggle} onEdit={setEditing} onDelete={handleDelete} onDrop={handleDrop} done />
            <TaskColumn title="Annulée" targetStatut="annulee" items={tasksAnnulee} me={me} onOpen={setDetail} onToggle={handleToggle} onEdit={setEditing} onDelete={handleDelete} onDrop={handleDrop} />
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

      <ActiviteDetailDialog
        open={!!detail}
        setOpen={(o) => { if (!o) setDetail(null); }}
        activite={detail}
        me={me}
        role={me?.role ?? ""}
        profiles={profiles}
        onEdit={(a) => setEditing(a)}
        onChanged={() => { setDetail(null); load(); }}
        onDeleted={() => { setDetail(null); load(); }}
      />

      <Dialog open={!!dayDetail} onOpenChange={(o) => { if (!o) setDayDetail(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="capitalize">
              {dayDetail ? format(dayDetail, "EEEE d MMMM yyyy", { locale: fr }) : ""}
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] space-y-2 overflow-y-auto">
            {(dayDetail ? (eventsByDay.get(format(dayDetail, "yyyy-MM-dd")) ?? []) : []).map((e) => {
              const Icon = TYPE_ICONS[e.type_activite] ?? Circle;
              const assignee = profiles.find((p) => p.id === e.assigne_a);
              return (
                <button
                  type="button"
                  key={e.id}
                  onClick={() => { setDayDetail(null); setDetail(e); }}
                  className="flex w-full items-start gap-3 rounded-md border p-2 text-left transition-colors hover:bg-muted/50"
                >
                  <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white ${TYPE_COLORS[e.type_activite] ?? "bg-gray-400"}`}>
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{e.titre}</span>
                      <ActiviteTypeBadge type={e.type_activite} />
                      {e.priorite === "urgente" && (
                        <Badge className="bg-red-500 text-white hover:bg-red-500 text-[10px]">Urgente</Badge>
                      )}
                    </span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {e.date_debut ? format(new Date(e.date_debut), "HH:mm") : "Toute la journée"}
                      {assignee?.email ? ` · ${assignee.email.split("@")[0]}` : ""}
                      {e.lieu ? ` · ${e.lieu}` : ""}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </div>

  );
}

function TaskColumn({
  title,
  targetStatut,
  items,
  me,
  onOpen,
  onToggle,
  onEdit,
  onDelete,
  onDrop,
  done = false,
  quickAdd,
}: {
  title: string;
  targetStatut: "a_faire" | "planifiee" | "en_cours" | "terminee" | "annulee";
  items: Activite[];
  me: Profile | null;
  onOpen: (a: Activite) => void;
  onToggle: (a: Activite, done: boolean) => void;
  onEdit: (a: Activite) => void;
  onDelete: (a: Activite) => void;
  onDrop: (a: Activite, target: "a_faire" | "planifiee" | "en_cours" | "terminee" | "annulee") => void;
  done?: boolean;
  quickAdd?: React.ReactNode;
}) {
  const [dragOver, setDragOver] = useState(false);
  return (
    <Card
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const id = e.dataTransfer.getData("text/plain");
        const a = items.find((x) => x.id === id);
        // The dropped card may not exist in this column; caller lookup via parent items is unavailable, so rely on data
        const dropped: Activite | undefined = a ?? (window as unknown as { __draggedActivite?: Activite }).__draggedActivite;
        if (dropped) onDrop(dropped, targetStatut);
      }}
      className={dragOver ? "ring-2 ring-primary" : ""}
    >
      <CardHeader className="pb-2"><CardTitle className="text-base">{title} ({items.length})</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {quickAdd}
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Aucune tâche.</p>
        ) : items.map((a) => {
          const perms = computeActivitePerms(a, me?.id ?? null, me?.role ?? "");
          const isDoneCard = a.statut === "terminee";
          return (
            <div
              key={a.id}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData("text/plain", a.id);
                (window as unknown as { __draggedActivite?: Activite }).__draggedActivite = a;
              }}
              className={`flex items-start gap-2 rounded border p-2 cursor-pointer hover:bg-muted/40 ${a.priorite === "urgente" && !isDoneCard ? "border-red-400 bg-red-50 dark:bg-red-950/20" : ""}`}
              onClick={() => onOpen(a)}
            >
              <div onClick={(e) => e.stopPropagation()}>
                <Checkbox
                  checked={done}
                  disabled={!perms.canChangeStatut}
                  onCheckedChange={(v) => onToggle(a, !!v)}
                  className="mt-0.5"
                />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <ActiviteTypeBadge type={a.type_activite} />
                  <span className={`text-sm font-medium ${done ? "line-through text-muted-foreground" : ""}`}>{a.titre}</span>
                  {a.priorite === "urgente" && <Badge className="bg-red-500 text-white hover:bg-red-500 text-[10px]">Urgente</Badge>}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {a.date_debut ? `${format(new Date(a.date_debut), "d MMM HH:mm", { locale: fr })} · ` : ""}
                  {a.lieu ? `${a.lieu} · ` : ""}
                  {STATUT_LABELS[a.statut] ?? a.statut}
                  {a.recurrence && a.recurrence !== "aucune" ? ` · ↻ ${RECURRENCE_LABELS[a.recurrence]}` : ""}
                </div>
              </div>

              <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                {perms.canEditAll && (
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(a)} aria-label="Modifier">
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                )}
                {perms.canDelete && (
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => onDelete(a)} aria-label="Supprimer">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function NewActiviteDialog(props: Omit<React.ComponentProps<typeof ActiviteDialog>, "initial">) {
  return <ActiviteDialog {...props} />;
}

function ActiviteDialog({
  open,
  setOpen,
  defaultAssignee,
  defaults,
  profiles,
  onSaved,
  initial,
}: {
  open: boolean;
  setOpen: (b: boolean) => void;
  defaultAssignee: string;
  defaults: { bien_id?: string; lot_id?: string; contrat_id?: string; contact_id?: string; transaction_id?: string };
  profiles: Profile[];
  onSaved: () => void;
  initial?: Activite;
}) {
  const isEdit = !!initial;
  const toLocal = (iso: string | null) => (iso ? format(new Date(iso), "yyyy-MM-dd'T'HH:mm") : "");
  const [titre, setTitre] = useState(initial?.titre ?? "");
  const [type, setType] = useState(initial?.type_activite ?? "tache");
  const [dateDebut, setDateDebut] = useState(toLocal(initial?.date_debut ?? null));
  const [dateFin, setDateFin] = useState(toLocal(initial?.date_fin ?? null));
  const [assigne, setAssigne] = useState(initial?.assigne_a ?? defaultAssignee);
  const [lieu, setLieu] = useState(initial?.lieu ?? "");
  const [priorite, setPriorite] = useState(initial?.priorite ?? "normale");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [statut, setStatut] = useState(initial?.statut ?? "a_faire");
  const [recurrence, setRecurrence] = useState<string>(initial?.recurrence ?? "aucune");
  const [saving, setSaving] = useState(false);

  // Lié à
  const initialLieType: string = initial?.bien_id ? "bien"
    : initial?.lot_id ? "lot"
    : initial?.contrat_id ? "contrat"
    : initial?.contact_id ? "contact"
    : initial?.transaction_id ? "transaction"
    : defaults.bien_id ? "bien"
    : defaults.lot_id ? "lot"
    : defaults.contrat_id ? "contrat"
    : defaults.contact_id ? "contact"
    : defaults.transaction_id ? "transaction"
    : "none";
  const initialLieId: string = initial?.bien_id ?? initial?.lot_id ?? initial?.contrat_id ?? initial?.contact_id ?? initial?.transaction_id
    ?? defaults.bien_id ?? defaults.lot_id ?? defaults.contrat_id ?? defaults.contact_id ?? defaults.transaction_id ?? "";
  const [lieType, setLieType] = useState<string>(initialLieType);
  const [lieId, setLieId] = useState<string>(initialLieId);
  const [linkOpts, setLinkOpts] = useState<LinkOpt[]>([]);

  useEffect(() => { if (open && !isEdit) setAssigne(defaultAssignee); }, [open, defaultAssignee, isEdit]);

  // Load link options for the selected "Lié à" type
  useEffect(() => {
    if (!open || lieType === "none") { setLinkOpts([]); return; }
    (async () => {
      if (lieType === "bien") {
        const { data } = await supabase.from("biens").select("id, titre").order("titre").limit(500);
        setLinkOpts((data ?? []).map((r) => ({ id: r.id, label: r.titre ?? r.id.slice(0, 8) })));
      } else if (lieType === "lot") {
        const { data } = await supabase.from("lots").select("id, label").order("label").limit(1000);
        setLinkOpts((data ?? []).map((r) => ({ id: r.id, label: r.label ?? r.id.slice(0, 8) })));
      } else if (lieType === "contrat") {
        const { data } = await supabase.from("contrats").select("id, date_debut, statut").order("date_debut", { ascending: false }).limit(500);
        setLinkOpts((data ?? []).map((r) => ({ id: r.id, label: `${r.date_debut ?? "sans date"} · ${r.statut ?? ""}` })));
      } else if (lieType === "contact") {
        const { data } = await supabase.from("contacts").select("id, nom, prenom").eq("archive", false).order("nom").limit(1000);
        setLinkOpts((data ?? []).map((r) => ({ id: r.id, label: `${r.nom ?? ""} ${r.prenom ?? ""}`.trim() || r.id.slice(0, 8) })));
      } else if (lieType === "transaction") {
        const { data } = await supabase.from("transactions_commerciales").select("id, type_transaction, statut_opportunite").order("created_at", { ascending: false }).limit(500);
        setLinkOpts((data ?? []).map((r) => ({ id: r.id, label: `${r.type_transaction ?? ""} · ${r.statut_opportunite ?? ""}` })));
      }
    })();
  }, [open, lieType]);

  const applyDateShortcut = (which: "today" | "tomorrow" | "week") => {
    const now = new Date();
    let target: Date;
    if (which === "today") target = now;
    else if (which === "tomorrow") target = addDays(now, 1);
    else target = endOfWeek(now, { weekStartsOn: 1 });
    target.setHours(9, 0, 0, 0);
    setDateDebut(format(target, "yyyy-MM-dd'T'HH:mm"));
  };

  const save = async () => {
    if (!titre.trim() || !assigne) {
      toast.error("Titre et assigné requis");
      return;
    }
    setSaving(true);
    const link = {
      bien_id: lieType === "bien" ? lieId || null : null,
      lot_id: lieType === "lot" ? lieId || null : null,
      contrat_id: lieType === "contrat" ? lieId || null : null,
      contact_id: lieType === "contact" ? lieId || null : null,
      transaction_id: lieType === "transaction" ? lieId || null : null,
    };
    const payload = {
      titre: titre.trim(),
      type_activite: type,
      date_debut: dateDebut ? new Date(dateDebut).toISOString() : null,
      date_fin: dateFin ? new Date(dateFin).toISOString() : null,
      assigne_a: assigne,
      lieu: lieu.trim() || null,
      priorite,
      notes: notes.trim() || null,
      recurrence,
    };
    let error;
    if (isEdit && initial) {
      ({ error } = await supabase.from("activites").update({ ...payload, ...link, statut }).eq("id", initial.id));
    } else {
      const { data: u } = await supabase.auth.getUser();
      ({ error } = await supabase.from("activites").insert({
        ...payload,
        ...link,
        created_by: u.user?.id ?? null,
        statut: type === "tache" ? "a_faire" : "planifiee",
      }));
    }
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(isEdit ? "Tâche mise à jour" : "Activité créée");
    if (!isEdit) {
      setTitre(""); setDateDebut(""); setDateFin(""); setLieu(""); setNotes(""); setPriorite("normale"); setType("tache"); setRecurrence("aucune");
      setLieType("none"); setLieId("");
    }
    setOpen(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!isEdit && (
        <DialogTrigger asChild>
          <Button size="sm"><Plus className="mr-2 h-4 w-4" /> Nouvelle activité</Button>
        </DialogTrigger>
      )}
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{isEdit ? "Modifier la tâche" : "Nouvelle activité / tâche"}</DialogTitle></DialogHeader>
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
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => applyDateShortcut("today")}>Aujourd'hui</Button>
            <Button type="button" size="sm" variant="outline" onClick={() => applyDateShortcut("tomorrow")}>Demain</Button>
            <Button type="button" size="sm" variant="outline" onClick={() => applyDateShortcut("week")}>Cette semaine</Button>
          </div>
          <div className="grid grid-cols-2 gap-3">
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
              <Label>Récurrence</Label>
              <Select value={recurrence} onValueChange={setRecurrence}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(RECURRENCE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          {isEdit && (
            <div>
              <Label>Statut</Label>
              <Select value={statut} onValueChange={setStatut}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(STATUT_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <Label>Lieu</Label>
            <Input value={lieu} onChange={(e) => setLieu(e.target.value)} />
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </div>

          <div className="rounded-md border p-3 space-y-2 bg-muted/20">
            <Label className="text-xs font-medium text-muted-foreground">Lié à</Label>
            <div className="grid grid-cols-2 gap-2">
              <Select value={lieType} onValueChange={(v) => { setLieType(v); setLieId(""); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LIE_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
              {lieType !== "none" && (
                <SearchableSelect
                  value={lieId}
                  onChange={setLieId}
                  options={linkOpts.map((o) => ({ value: o.id, label: o.label }))}
                  placeholder="Rechercher..."
                />
              )}
            </div>
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
