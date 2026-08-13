import { useEffect, useState, useCallback } from "react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { CalendarClock, ListTodo, CheckCircle2, ArrowRight, Plus, MapPin, ClipboardCheck, BellRing, Circle, type LucideIcon } from "lucide-react";
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
  transaction_id?: string | null;
  recurrence?: string | null;
};

export const RECURRENCE_LABELS: Record<string, string> = {
  aucune: "Aucune",
  quotidienne: "Quotidienne",
  hebdomadaire: "Hebdomadaire",
  mensuelle: "Mensuelle",
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
  tache: "bg-slate-600",
  autre: "bg-gray-400",
};

/** Icône par type d'activité (cohérent calendrier + liste des tâches). */
export const TYPE_ICONS: Record<string, LucideIcon> = {
  visite: MapPin,
  etat_des_lieux: ClipboardCheck,
  rendez_vous: CalendarClock,
  relance: BellRing,
  tache: ListTodo,
  autre: Circle,
};

/** Classes de badge doux (fond teinté) par type d'activité. */
export const TYPE_BADGE_CLASSES: Record<string, string> = {
  visite: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-900",
  etat_des_lieux: "bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-950/50 dark:text-purple-300 dark:border-purple-900",
  rendez_vous: "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-900",
  relance: "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-950/50 dark:text-orange-300 dark:border-orange-900",
  tache: "bg-slate-200 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700",
  autre: "bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-900 dark:text-gray-300 dark:border-gray-800",
};

export function ActiviteTypeBadge({ type, className = "" }: { type: string; className?: string }) {
  const Icon = TYPE_ICONS[type] ?? Circle;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${TYPE_BADGE_CLASSES[type] ?? TYPE_BADGE_CLASSES.autre} ${className}`}
    >
      <Icon className="h-3 w-3" />
      {TYPE_LABELS[type] ?? type}
    </span>
  );
}


export const STATUT_LABELS: Record<string, string> = {
  a_faire: "À faire",
  planifiee: "Planifiée",
  en_cours: "En cours",
  terminee: "Terminée",
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
  const done = a.statut === "terminee";
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
          <ActiviteTypeBadge type={a.type_activite} />
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
  const { error } = await supabase.from("activites").update({ statut: "terminee" }).eq("id", id);
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
      .neq("statut", "terminee")
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
  transactionId?: string;
};

export function ActivitesLiees(props: LinkedProps) {
  const [items, setItems] = useState<Activite[]>([]);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    let q = supabase.from("activites").select("*").order("date_debut", { ascending: false, nullsFirst: false }).limit(20);
    if (props.bienId) q = q.eq("bien_id", props.bienId);
    else if (props.lotId) q = q.eq("lot_id", props.lotId);
    else if (props.contratId) q = q.eq("contrat_id", props.contratId);
    else if (props.contactId) q = q.eq("contact_id", props.contactId);
    else if (props.transactionId) q = q.eq("transaction_id", props.transactionId);
    else return;
    const { data } = await q;
    setItems((data ?? []) as Activite[]);
  }, [props.bienId, props.lotId, props.contratId, props.contactId, props.transactionId]);

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
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          <Plus className="mr-2 h-3.5 w-3.5" /> Nouvelle activité
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
      <NouvelleActiviteLieeDialog
        open={open}
        setOpen={setOpen}
        defaults={props}
        onSaved={() => { setOpen(false); load(); }}
      />
    </Card>
  );
}

type OptionRow = { id: string; label: string };

export function NouvelleActiviteLieeDialog({
  open,
  setOpen,
  defaults,
  onSaved,
}: {
  open: boolean;
  setOpen: (b: boolean) => void;
  defaults: LinkedProps;
  onSaved: () => void;
}) {
  const [titre, setTitre] = useState("");
  const [type, setType] = useState("tache");
  const [priorite, setPriorite] = useState("normale");
  const [dateDebut, setDateDebut] = useState("");
  const [dateFin, setDateFin] = useState("");
  const [lieu, setLieu] = useState("");
  const [notes, setNotes] = useState("");
  const [assigne, setAssigne] = useState<string>("");
  const [profiles, setProfiles] = useState<OptionRow[]>([]);

  const [bienId, setBienId] = useState<string>(defaults.bienId ?? "");
  const [lotId, setLotId] = useState<string>(defaults.lotId ?? "");
  const [contratId, setContratId] = useState<string>(defaults.contratId ?? "");
  const [contactId, setContactId] = useState<string>(defaults.contactId ?? "");
  const [transactionId, setTransactionId] = useState<string>(defaults.transactionId ?? "");

  const [biens, setBiens] = useState<OptionRow[]>([]);
  const [lots, setLots] = useState<OptionRow[]>([]);
  const [contrats, setContrats] = useState<OptionRow[]>([]);
  const [contacts, setContacts] = useState<OptionRow[]>([]);
  const [transactions, setTransactions] = useState<OptionRow[]>([]);

  const [saving, setSaving] = useState(false);

  // Reset prefilled values whenever the dialog opens
  useEffect(() => {
    if (!open) return;
    setBienId(defaults.bienId ?? "");
    setLotId(defaults.lotId ?? "");
    setContratId(defaults.contratId ?? "");
    setContactId(defaults.contactId ?? "");
    setTransactionId(defaults.transactionId ?? "");
  }, [open, defaults.bienId, defaults.lotId, defaults.contratId, defaults.contactId, defaults.transactionId]);

  useEffect(() => {
    if (!open) return;
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (u.user) setAssigne((prev) => prev || u.user!.id);
      const [p, b, l, ct, c, tx] = await Promise.all([
        supabase.from("profiles").select("id, email").order("email"),
        supabase.from("biens").select("id, titre").order("titre").limit(300),
        supabase.from("lots").select("id, label, bien_id").order("label").limit(500),
        supabase.from("contrats").select("id, lot_id, date_debut, statut").order("date_debut", { ascending: false }).limit(300),
        supabase.from("contacts").select("id, nom, prenom").eq("archive", false).order("nom").limit(500),
        supabase.from("transactions_commerciales").select("id, contact_id, bien_id, type_transaction, statut_opportunite").order("created_at", { ascending: false }).limit(300),
      ]);
      setProfiles(((p.data ?? []) as Array<{ id: string; email: string | null }>)
        .map((r) => ({ id: r.id, label: r.email ?? r.id.slice(0, 8) })));
      setBiens(((b.data ?? []) as Array<{ id: string; titre: string | null }>)
        .map((r) => ({ id: r.id, label: r.titre ?? r.id.slice(0, 8) })));
      setLots(((l.data ?? []) as Array<{ id: string; label: string | null }>)
        .map((r) => ({ id: r.id, label: r.label ?? r.id.slice(0, 8) })));
      setContrats(((ct.data ?? []) as Array<{ id: string; date_debut: string | null; statut: string | null }>)
        .map((r) => ({ id: r.id, label: `${r.date_debut ?? "sans date"} · ${r.statut ?? ""}` })));
      setContacts(((c.data ?? []) as Array<{ id: string; nom: string | null; prenom: string | null }>)
        .map((r) => ({ id: r.id, label: `${r.nom ?? ""} ${r.prenom ?? ""}`.trim() || r.id.slice(0, 8) })));
      setTransactions(((tx.data ?? []) as Array<{ id: string; type_transaction: string | null; statut_opportunite: string | null }>)
        .map((r) => ({ id: r.id, label: `${r.type_transaction ?? ""} · ${r.statut_opportunite ?? ""}` })));
    })();
  }, [open]);

  const save = async () => {
    if (!titre.trim() || !assigne) return toast.error("Titre et assigné requis");
    setSaving(true);
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("activites").insert({
      titre: titre.trim(),
      type_activite: type,
      priorite,
      date_debut: dateDebut ? new Date(dateDebut).toISOString() : null,
      date_fin: dateFin ? new Date(dateFin).toISOString() : null,
      lieu: lieu.trim() || null,
      notes: notes.trim() || null,
      assigne_a: assigne,
      created_by: u.user?.id ?? null,
      bien_id: bienId || null,
      lot_id: lotId || null,
      contrat_id: contratId || null,
      contact_id: contactId || null,
      transaction_id: transactionId || null,
      statut: type === "tache" ? "a_faire" : "planifiee",
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Activité créée");
    // Reset text fields for next entry
    setTitre(""); setDateDebut(""); setDateFin(""); setLieu(""); setNotes("");
    setPriorite("normale"); setType("tache");
    onSaved();
  };

  const LinkSelect = ({
    label, value, onChange, options, prefilled,
  }: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    options: OptionRow[];
    prefilled: boolean;
  }) => (
    <div>
      <Label className="flex items-center gap-2">
        {label}
        {prefilled && <Badge variant="secondary" className="text-[10px]">Pré-rempli</Badge>}
      </Label>
      <SearchableSelect
        value={value}
        onChange={onChange}
        options={options.map((o) => ({ value: o.id, label: o.label }))}
        placeholder="Rechercher..."
      />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Nouvelle activité liée</DialogTitle></DialogHeader>
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
                {profiles.map((p) => <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>)}
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

          <div className="rounded-md border p-3 space-y-3 bg-muted/20">
            <p className="text-xs font-medium text-muted-foreground">Liaisons</p>
            <LinkSelect label="Bien" value={bienId} onChange={setBienId} options={biens} prefilled={!!defaults.bienId} />
            <LinkSelect label="Lot" value={lotId} onChange={setLotId} options={lots} prefilled={!!defaults.lotId} />
            <LinkSelect label="Contrat" value={contratId} onChange={setContratId} options={contrats} prefilled={!!defaults.contratId} />
            <LinkSelect label="Contact" value={contactId} onChange={setContactId} options={contacts} prefilled={!!defaults.contactId} />
            <LinkSelect label="Transaction" value={transactionId} onChange={setTransactionId} options={transactions} prefilled={!!defaults.transactionId} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
          <Button onClick={save} disabled={saving}>Créer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Suppress unused-import warning for DialogTrigger (kept for parity with the app's dialog API).
void DialogTrigger;
