import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Plus, ChevronLeft, ChevronRight, Circle, ListTodo } from "lucide-react";
import { toast } from "sonner";
import {
  addDays,
  addMinutes,
  addMonths,
  addWeeks,
  differenceInMinutes,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { fr } from "date-fns/locale";
import {
  TYPE_COLORS,
  TYPE_ICONS,
  TYPE_BADGE_CLASSES,
  TERRAIN_TYPES,
  TERRAIN_TYPE_LABELS,
  ActiviteTypeBadge,
  type Activite,
} from "@/components/activites-widgets";
import { ActiviteDetailDialog } from "@/components/activite-detail-dialog";
import { fetchAssignesMap, syncAssignes, syncBiensLies } from "@/lib/activite-liaisons";
import { MultiSelect } from "@/components/ui/multi-select";

export const Route = createFileRoute("/_authenticated/calendrier")({
  head: () => ({
    meta: [
      { title: "Calendrier terrain — GEM Immobilier" },
      { name: "description", content: "Planning des visites, états des lieux et recouvrements terrain de l'équipe." },
      { property: "og:title", content: "Calendrier terrain — GEM Immobilier" },
      { property: "og:description", content: "Qui est où et quand : planning semaine des activités terrain." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  validateSearch: (s: Record<string, unknown>) => ({
    bien_id: typeof s.bien_id === "string" ? s.bien_id : undefined,
    open: typeof s.open === "string" ? s.open : undefined,
  }),
  component: CalendrierPage,
});

type Profile = { id: string; email: string | null; role: string };
type Vue = "semaine" | "mois";

const HOUR_START = 7;
const HOUR_END = 20;
const PX_PER_HOUR = 56;

const DUREES = [
  { value: "30", label: "30 min" },
  { value: "60", label: "1 h" },
  { value: "90", label: "1 h 30" },
  { value: "120", label: "2 h" },
  { value: "180", label: "3 h" },
  { value: "240", label: "4 h" },
];

const shortName = (email: string | null | undefined) => (email ? email.split("@")[0] : "—");

function CalendrierPage() {
  const search = Route.useSearch();
  const [me, setMe] = useState<Profile | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [items, setItems] = useState<Activite[]>([]);
  const [assignesMap, setAssignesMap] = useState<Record<string, string[]>>({});
  const [biensMap, setBiensMap] = useState<Record<string, string>>({});
  const [vue, setVue] = useState<Vue>("semaine");
  const [cursor, setCursor] = useState<Date>(new Date());
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [agentFilter, setAgentFilter] = useState<string>("all");
  const [openNew, setOpenNew] = useState(false);
  const [detail, setDetail] = useState<Activite | null>(null);
  const [dayDetail, setDayDetail] = useState<Date | null>(null);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const { data: prof } = await supabase.from("profiles").select("id, email, role").eq("id", u.user.id).maybeSingle();
      if (prof) setMe(prof as Profile);
      const [{ data: all }, { data: biens }] = await Promise.all([
        supabase.from("profiles").select("id, email, role").order("email"),
        supabase.from("biens").select("id, titre").order("titre").limit(1000),
      ]);
      setProfiles((all ?? []) as Profile[]);
      const map: Record<string, string> = {};
      for (const b of (biens ?? []) as Array<{ id: string; titre: string | null }>) map[b.id] = b.titre ?? "";
      setBiensMap(map);
    })();
  }, []);

  const [rangeStart, rangeEnd] = useMemo<[Date, Date]>(() => {
    if (vue === "semaine")
      return [startOfWeek(cursor, { weekStartsOn: 1 }), endOfWeek(cursor, { weekStartsOn: 1 })];
    return [
      startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 }),
      endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 }),
    ];
  }, [vue, cursor]);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("activites")
      .select("*")
      .in("type_activite", TERRAIN_TYPES as unknown as string[])
      .neq("statut", "annulee")
      .gte("date_debut", rangeStart.toISOString())
      .lte("date_debut", addDays(rangeEnd, 1).toISOString())
      .order("date_debut", { ascending: true });
    const rows = (data ?? []) as Activite[];
    setItems(rows);
    setAssignesMap(await fetchAssignesMap(rows.map((r) => r.id)));
  }, [rangeStart, rangeEnd]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const id = search.open;
    if (!id) return;
    const found = items.find((a) => a.id === id);
    if (found) { setDetail(found); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("activites")
        .select("id, type_activite, date_debut")
        .eq("id", id)
        .maybeSingle();
      if (cancelled || !data) return;
      const isTerrain = (TERRAIN_TYPES as readonly string[]).includes(data.type_activite);
      if (!isTerrain) {
        navigate({ to: "/taches", search: { open: id } });
      } else if (data.date_debut) {
        setCursor(new Date(data.date_debut));
      }
    })();
    return () => { cancelled = true; };
  }, [search.open, items, navigate]);


  const filtered = useMemo(
    () =>
      items.filter((a) => {
        if (typeFilter !== "all" && a.type_activite !== typeFilter) return false;
        if (
          agentFilter !== "all" &&
          a.assigne_a !== agentFilter &&
          !(assignesMap[a.id] ?? []).includes(agentFilter)
        )
          return false;
        return !!a.date_debut;
      }),
    [items, typeFilter, agentFilter, assignesMap],
  );

  const weekDays = useMemo(
    () => eachDayOfInterval({ start: startOfWeek(cursor, { weekStartsOn: 1 }), end: endOfWeek(cursor, { weekStartsOn: 1 }) }),
    [cursor],
  );
  const monthDays = useMemo(
    () => eachDayOfInterval({ start: rangeStart, end: rangeEnd }),
    [rangeStart, rangeEnd],
  );

  const byDay = useMemo(() => {
    const map = new Map<string, Activite[]>();
    for (const a of filtered) {
      const key = format(new Date(a.date_debut!), "yyyy-MM-dd");
      const arr = map.get(key) ?? [];
      arr.push(a);
      map.set(key, arr);
    }
    return map;
  }, [filtered]);

  const hours = useMemo(
    () => Array.from({ length: HOUR_END - HOUR_START + 1 }, (_, i) => HOUR_START + i),
    [],
  );

  const lieuOf = (a: Activite) => (a.bien_id ? biensMap[a.bien_id] || "" : a.lieu || "");
  const agentOf = (a: Activite) => {
    const ids = Array.from(new Set([a.assigne_a, ...(assignesMap[a.id] ?? [])].filter(Boolean)));
    const names = ids.map((id) => shortName(profiles.find((p) => p.id === id)?.email));
    return names.length > 0 ? names.join(", ") : "—";
  };

  const step = (dir: 1 | -1) =>
    setCursor((d) => (vue === "semaine" ? addWeeks(d, dir) : addMonths(d, dir)));

  const periodLabel =
    vue === "semaine"
      ? `${format(weekDays[0], "d MMM", { locale: fr })} – ${format(weekDays[6], "d MMM yyyy", { locale: fr })}`
      : format(cursor, "MMMM yyyy", { locale: fr });

  return (
    <div className="mx-auto max-w-[1400px] px-6 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl">Calendrier terrain</h1>
          <p className="mt-1 text-sm text-muted-foreground">Qui est où et quand : visites, états des lieux et recouvrements terrain.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to="/taches"><ListTodo className="mr-2 h-4 w-4" /> Tâches</Link>
          </Button>
          <Button size="sm" onClick={() => setOpenNew(true)}>
            <Plus className="mr-2 h-4 w-4" /> Nouvelle activité terrain
          </Button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" onClick={() => step(-1)} aria-label="Précédent"><ChevronLeft className="h-4 w-4" /></Button>
          <Button variant="outline" size="sm" onClick={() => setCursor(new Date())}>Aujourd'hui</Button>
          <Button variant="outline" size="icon" onClick={() => step(1)} aria-label="Suivant"><ChevronRight className="h-4 w-4" /></Button>
        </div>
        <span className="text-sm font-medium capitalize">{periodLabel}</span>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[200px]"><SelectValue placeholder="Type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les types</SelectItem>
              {Object.entries(TERRAIN_TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={agentFilter} onValueChange={setAgentFilter}>
            <SelectTrigger className="w-[220px]"><SelectValue placeholder="Agent" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les agents</SelectItem>
              {me && <SelectItem value={me.id}>Moi ({shortName(me.email)})</SelectItem>}
              {profiles.filter((p) => p.id !== me?.id).map((p) => (
                <SelectItem key={p.id} value={p.id}>{shortName(p.email)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex rounded-md border p-0.5">
            <Button size="sm" variant={vue === "semaine" ? "default" : "ghost"} onClick={() => setVue("semaine")}>Semaine</Button>
            <Button size="sm" variant={vue === "mois" ? "default" : "ghost"} onClick={() => setVue("mois")}>Mois</Button>
          </div>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        {Object.entries(TERRAIN_TYPE_LABELS).map(([k, v]) => (
          <span key={k} className="inline-flex items-center gap-1.5">
            <span className={`h-2.5 w-2.5 rounded-sm ${TYPE_COLORS[k]}`} /> {v}
          </span>
        ))}
      </div>

      <Card>
        <CardContent className="p-3">
          {vue === "semaine" ? (
            <div className="overflow-x-auto">
              <div className="min-w-[900px]">
                <div className="grid" style={{ gridTemplateColumns: "56px repeat(7, minmax(0,1fr))" }}>
                  <div />
                  {weekDays.map((d) => (
                    <div
                      key={d.toISOString()}
                      className={`border-b p-2 text-center text-xs font-medium capitalize ${isSameDay(d, new Date()) ? "bg-primary/10 text-primary" : "text-muted-foreground"}`}
                    >
                      {format(d, "EEE d", { locale: fr })}
                    </div>
                  ))}
                </div>
                <div className="grid" style={{ gridTemplateColumns: "56px repeat(7, minmax(0,1fr))" }}>
                  <div>
                    {hours.map((h) => (
                      <div key={h} className="relative text-[10px] text-muted-foreground" style={{ height: PX_PER_HOUR }}>
                        <span className="absolute -top-1.5 right-2">{h}h</span>
                      </div>
                    ))}
                  </div>
                  {weekDays.map((d) => {
                    const events = byDay.get(format(d, "yyyy-MM-dd")) ?? [];
                    return (
                      <div
                        key={d.toISOString()}
                        className={`relative border-l ${isSameDay(d, new Date()) ? "bg-primary/5" : ""}`}
                        style={{ height: (HOUR_END - HOUR_START + 1) * PX_PER_HOUR }}
                      >
                        {hours.map((h) => (
                          <div key={h} className="border-b border-dashed border-muted" style={{ height: PX_PER_HOUR }} />
                        ))}
                        {events.map((e) => {
                          const start = new Date(e.date_debut!);
                          const end = e.date_fin ? new Date(e.date_fin) : addMinutes(start, 60);
                          const mins = Math.max(30, differenceInMinutes(end, start));
                          const top = ((start.getHours() + start.getMinutes() / 60) - HOUR_START) * PX_PER_HOUR;
                          const height = (mins / 60) * PX_PER_HOUR;
                          return (
                            <button
                              key={e.id}
                              type="button"
                              onClick={() => setDetail(e)}
                              className={`absolute left-1 right-1 overflow-hidden rounded-md border-l-4 px-1.5 py-1 text-left text-[11px] leading-tight shadow-sm transition hover:opacity-90 ${TYPE_BADGE_CLASSES[e.type_activite]}`}
                              style={{
                                top: Math.max(0, top),
                                height: Math.max(30, height),
                                borderLeftColor: "currentColor",
                              }}
                              title={e.titre}
                            >
                              <div className="truncate font-semibold">{TERRAIN_TYPE_LABELS[e.type_activite] ?? e.titre}</div>
                              <div className="truncate">{lieuOf(e) || e.titre}</div>
                              <div className="truncate opacity-80">Agents : {agentOf(e)}</div>
                              <div className="truncate opacity-80">
                                {format(start, "HH:mm")} — {format(end, "HH:mm")}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="mb-1 grid grid-cols-7 gap-1 text-xs font-medium text-muted-foreground">
                {["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map((d) => (
                  <div key={d} className="p-1 text-center">{d}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {monthDays.map((d) => {
                  const key = format(d, "yyyy-MM-dd");
                  const events = byDay.get(key) ?? [];
                  const isToday = isSameDay(d, new Date());
                  const inMonth = isSameMonth(d, cursor);
                  return (
                    <div
                      key={key}
                      onClick={() => events.length > 0 && setDayDetail(d)}
                      className={`min-h-[96px] rounded border p-1 text-xs ${inMonth ? "bg-background" : "bg-muted/20"} ${isToday ? "border-primary/60 bg-primary/10" : ""} ${events.length > 0 ? "cursor-pointer hover:bg-muted/50" : ""}`}
                    >
                      <div className="mb-1 font-medium">{format(d, "d")}</div>
                      <div className="space-y-0.5">
                        {events.slice(0, 3).map((e) => {
                          const Icon = TYPE_ICONS[e.type_activite] ?? Circle;
                          return (
                            <button
                              key={e.id}
                              type="button"
                              onClick={(ev) => { ev.stopPropagation(); setDetail(e); }}
                              className={`flex w-full items-center gap-1 rounded border px-1 py-0.5 text-left hover:opacity-80 ${TYPE_BADGE_CLASSES[e.type_activite]}`}
                            >
                              <Icon className="h-3 w-3 shrink-0" />
                              <span className="truncate">
                                {format(new Date(e.date_debut!), "HH:mm")} {lieuOf(e) || e.titre}
                              </span>
                            </button>
                          );
                        })}
                        {events.length > 3 && (
                          <button
                            type="button"
                            onClick={(ev) => { ev.stopPropagation(); setDayDetail(d); }}
                            className="w-full text-left text-[10px] font-medium text-primary hover:underline"
                          >
                            +{events.length - 3} autre(s)
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <NouvelleActiviteTerrainDialog
        open={openNew}
        setOpen={setOpenNew}
        profiles={profiles}
        defaultAgent={me?.id ?? ""}
        defaultBien={search.bien_id}
        onSaved={() => { setOpenNew(false); load(); }}
      />

      <ActiviteDetailDialog
        open={!!detail}
        setOpen={(o) => { if (!o) setDetail(null); }}
        activite={detail}
        me={me}
        role={me?.role ?? ""}
        profiles={profiles}
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
            {(dayDetail ? byDay.get(format(dayDetail, "yyyy-MM-dd")) ?? [] : []).map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={() => { setDayDetail(null); setDetail(e); }}
                className="flex w-full flex-col items-start gap-1 rounded-md border p-2 text-left hover:bg-muted/50"
              >
                <span className="flex flex-wrap items-center gap-2">
                  <ActiviteTypeBadge type={e.type_activite} />
                  <span className="text-sm font-medium">{lieuOf(e) || e.titre}</span>
                </span>
                <span className="text-xs text-muted-foreground">
                  {format(new Date(e.date_debut!), "HH:mm")}
                  {e.date_fin ? ` — ${format(new Date(e.date_fin), "HH:mm")}` : ""} · Agents : {agentOf(e)}
                </span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function NouvelleActiviteTerrainDialog({
  open,
  setOpen,
  profiles,
  defaultAgent,
  defaultBien,
  onSaved,
}: {
  open: boolean;
  setOpen: (b: boolean) => void;
  profiles: Profile[];
  defaultAgent: string;
  defaultBien?: string;
  onSaved: () => void;
}) {
  const [type, setType] = useState("visite");
  const [bienId, setBienId] = useState(defaultBien ?? "");
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [heure, setHeure] = useState("09:00");
  const [duree, setDuree] = useState("60");
  const [agents, setAgents] = useState<string[]>(defaultAgent ? [defaultAgent] : []);
  const [notes, setNotes] = useState("");
  const [biens, setBiens] = useState<Array<{ id: string; titre: string }>>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setAgents((prev) => (prev.length > 0 ? prev : defaultAgent ? [defaultAgent] : []));
  }, [open, defaultAgent]);

  useEffect(() => {
    if (!open) return;
    (async () => {
      const { data } = await supabase.from("biens").select("id, titre, adresse").order("titre").limit(1000);
      setBiens(((data ?? []) as Array<{ id: string; titre: string | null; adresse: string | null }>).map((b) => ({
        id: b.id,
        titre: [b.titre, b.adresse].filter(Boolean).join(" · ") || b.id.slice(0, 8),
      })));
    })();
  }, [open]);

  const save = async () => {
    if (!bienId) return toast.error("Le bien concerné est obligatoire");
    if (agents.length === 0) return toast.error("Au moins un agent assigné est obligatoire");
    setSaving(true);
    const start = new Date(`${date}T${heure}`);
    const end = addMinutes(start, Number(duree));
    const bienLabel = biens.find((b) => b.id === bienId)?.titre ?? "";
    const { data: u } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from("activites")
      .insert({
        titre: `${TERRAIN_TYPE_LABELS[type]} — ${bienLabel.split(" · ")[0]}`,
        type_activite: type,
        date_debut: start.toISOString(),
        date_fin: end.toISOString(),
        assigne_a: agents[0],
        created_by: u.user?.id ?? null,
        bien_id: bienId,
        notes: notes.trim() || null,
        priorite: "normale",
        statut: "a_faire",
      })
      .select("id")
      .single();
    if (!error && data?.id) {
      await Promise.all([syncAssignes(data.id, agents), syncBiensLies(data.id, [bienId])]);
    }
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Activité terrain planifiée");
    setNotes("");
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Nouvelle activité terrain</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Type d'activité</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(TERRAIN_TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Bien concerné</Label>
            <SearchableSelect
              value={bienId}
              onChange={setBienId}
              options={biens.map((b) => ({ value: b.id, label: b.titre }))}
              placeholder="Rechercher un bien..."
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <Label>Heure de début</Label>
              <Input type="time" value={heure} onChange={(e) => setHeure(e.target.value)} />
            </div>
            <div>
              <Label>Durée</Label>
              <Select value={duree} onValueChange={setDuree}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DUREES.map((d) => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
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
            <Label>Notes (facultatif)</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
          <Button onClick={save} disabled={saving}>Planifier</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Conserve l'import de Card pour la structure de page.
void CardHeader; void CardTitle;
