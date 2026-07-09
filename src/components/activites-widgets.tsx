import { useEffect, useState, useCallback } from "react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CalendarClock, ListTodo, CheckCircle2, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { format, startOfWeek, endOfWeek } from "date-fns";
import { fr } from "date-fns/locale";

export type Activite = {
  id: string;
  titre: string;
  type_activite: string;
  date_debut: string | null;
  date_fin: string | null;
  statut: string;
  priorite: string;
  lieu: string | null;
  notes: string | null;
  assigne_a: string;
  created_by: string | null;
  bien_id: string | null;
  lot_id: string | null;
  contrat_id: string | null;
  contact_id: string | null;
};

export const TYPE_LABELS: Record<string, string> = {
  visite: "Visite",
  etat_des_lieux: "État des lieux",
  rendez_vous: "Rendez-vous",
  relance: "Relance",
  tache: "Tâche",
  autre: "Autre",
};

export const TYPE_COLORS: Record<string, string> = {
  visite: "bg-blue-500",
  etat_des_lieux: "bg-purple-500",
  rendez_vous: "bg-emerald-500",
  relance: "bg-orange-500",
  tache: "bg-slate-500",
  autre: "bg-gray-400",
};

export const STATUT_LABELS: Record<string, string> = {
  a_faire: "À faire",
  en_cours: "En cours",
  fait: "Fait",
  planifiee: "Planifiée",
  realisee: "Réalisée",
  annulee: "Annulée",
};

function linkFor(a: Activite): { to: string; label: string } | null {
  if (a.contrat_id) return { to: `/contrats/${a.contrat_id}`, label: "Contrat" };
  if (a.lot_id) return { to: `/lots/${a.lot_id}`, label: "Lot" };
  if (a.bien_id) return { to: `/biens/${a.bien_id}`, label: "Bien" };
  if (a.contact_id) return { to: `/contacts/${a.contact_id}`, label: "Contact" };
  return null;
}

function PrioBadge({ p }: { p: string }) {
  if (p === "urgente")
    return <Badge className="bg-red-500 text-white hover:bg-red-500">Urgente</Badge>;
  return <Badge variant="outline">Normale</Badge>;
}

function ActiviteRow({
  a,
  onToggle,
  showDate = false,
}: {
  a: Activite;
  onToggle: (id: string) => void;
  showDate?: boolean;
}) {
  const link = linkFor(a);
  const done = a.statut === "fait" || a.statut === "realisee";
  return (
    <div className="flex items-start gap-3 rounded-md border p-3 hover:bg-muted/40">
      <Checkbox
        checked={done}
        onCheckedChange={() => onToggle(a.id)}
        className="mt-0.5"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`inline-block h-2 w-2 rounded-full ${TYPE_COLORS[a.type_activite] ?? "bg-gray-400"}`} />
          <span className={`text-sm font-medium ${done ? "line-through text-muted-foreground" : ""}`}>
            {a.titre}
          </span>
          <PrioBadge p={a.priorite} />
          <Badge variant="secondary" className="text-[10px]">{TYPE_LABELS[a.type_activite] ?? a.type_activite}</Badge>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          {showDate && a.date_debut && (
            <span>{format(new Date(a.date_debut), "EEE d MMM HH:mm", { locale: fr })}</span>
          )}
          {a.lieu && <span>📍 {a.lieu}</span>}
          {link && (
            <Link to={link.to} className="inline-flex items-center gap-1 text-primary hover:underline">
              {link.label} <ArrowRight className="h-3 w-3" />
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

async function markDone(id: string) {
  const { error } = await supabase.from("activites").update({ statut: "fait" }).eq("id", id);
  if (error) toast.error(error.message);
  else toast.success("Marqué comme fait");
}

export function MesTachesSemaine({ userId }: { userId: string | null }) {
  const [items, setItems] = useState<Activite[]>([]);

  const load = useCallback(async () => {
    if (!userId) return;
    const start = startOfWeek(new Date(), { weekStartsOn: 1 });
    const end = endOfWeek(new Date(), { weekStartsOn: 1 });
    const { data } = await supabase
      .from("activites")
      .select("*")
      .eq("assigne_a", userId)
      .neq("statut", "fait")
      .neq("statut", "realisee")
      .neq("statut", "annulee")
      .or(`date_debut.gte.${start.toISOString()},date_debut.is.null`)
      .lte("date_debut", end.toISOString())
      .order("priorite", { ascending: false })
      .order("date_debut", { ascending: true, nullsFirst: false });
    // Filter locally to include nulls only if they were created recently (this week)
    const filtered = (data ?? []).filter((a: Activite) => {
      if (!a.date_debut) return false;
      const d = new Date(a.date_debut);
      return d >= start && d <= end;
    });
    // Sort: urgente first, then by date
    filtered.sort((a, b) => {
      if (a.priorite !== b.priorite) return a.priorite === "urgente" ? -1 : 1;
      return (a.date_debut ?? "").localeCompare(b.date_debut ?? "");
    });
    setItems(filtered);
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleToggle = async (id: string) => {
    await markDone(id);
    load();
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-primary" />
          Mes tâches de la semaine
        </CardTitle>
        <Button asChild variant="ghost" size="sm">
          <Link to="/calendrier">Voir tout</Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Aucune tâche cette semaine.</p>
        ) : (
          items.map((a) => <ActiviteRow key={a.id} a={a} onToggle={handleToggle} showDate />)
        )}
      </CardContent>
    </Card>
  );
}

export function MesActivitesEnCours({ userId }: { userId: string | null }) {
  const [items, setItems] = useState<Activite[]>([]);

  const load = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase
      .from("activites")
      .select("*")
      .eq("assigne_a", userId)
      .eq("statut", "en_cours")
      .order("priorite", { ascending: false })
      .order("date_debut", { ascending: true, nullsFirst: false });
    const sorted = (data ?? []).slice().sort((a: Activite, b: Activite) => {
      if (a.priorite !== b.priorite) return a.priorite === "urgente" ? -1 : 1;
      return 0;
    });
    setItems(sorted as Activite[]);
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleToggle = async (id: string) => {
    await markDone(id);
    load();
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <ListTodo className="h-4 w-4 text-primary" />
          Mes activités en cours
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Aucune activité en cours.</p>
        ) : (
          items.map((a) => <ActiviteRow key={a.id} a={a} onToggle={handleToggle} />)
        )}
      </CardContent>
    </Card>
  );
}

type LinkedProps = {
  bienId?: string;
  lotId?: string;
  contratId?: string;
  contactId?: string;
};

export function ActivitesLiees(props: LinkedProps) {
  const [items, setItems] = useState<Activite[]>([]);

  const load = useCallback(async () => {
    let q = supabase.from("activites").select("*").order("date_debut", { ascending: false, nullsFirst: false }).limit(20);
    if (props.bienId) q = q.eq("bien_id", props.bienId);
    else if (props.lotId) q = q.eq("lot_id", props.lotId);
    else if (props.contratId) q = q.eq("contrat_id", props.contratId);
    else if (props.contactId) q = q.eq("contact_id", props.contactId);
    else return;
    const { data } = await q;
    setItems((data ?? []) as Activite[]);
  }, [props.bienId, props.lotId, props.contratId, props.contactId]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <Card>
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-primary" />
          Activités liées
        </CardTitle>
        <Button asChild size="sm" variant="outline">
          <Link
            to="/calendrier"
            search={{
              bien_id: props.bienId,
              lot_id: props.lotId,
              contrat_id: props.contratId,
              contact_id: props.contactId,
            } as never}
          >
            Nouvelle activité
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Aucune activité liée.</p>
        ) : (
          items.map((a) => (
            <ActiviteRow key={a.id} a={a} onToggle={async (id) => { await markDone(id); load(); }} showDate />
          ))
        )}
      </CardContent>
    </Card>
  );
}
