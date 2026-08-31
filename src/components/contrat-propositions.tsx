import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { CheckCircle2, XCircle, Send } from "lucide-react";
import { toast } from "sonner";

// Champs modifiables via proposition
const CHAMPS = [
  { value: "loyer_mensuel", label: "Loyer mensuel", type: "number" },
  { value: "depot_garantie", label: "Dépôt de garantie", type: "number" },
  { value: "date_debut", label: "Date de début", type: "date" },
  { value: "date_fin", label: "Date de fin", type: "date" },
  { value: "statut", label: "Statut", type: "text" },
  { value: "notes", label: "Notes", type: "text" },
] as const;
const CHAMP_LABEL: Record<string, string> = Object.fromEntries(CHAMPS.map((c) => [c.value, c.label]));

type Proposition = {
  id: string;
  contrat_id: string;
  propose_par: string;
  champ_modifie: string;
  ancienne_valeur: string | null;
  nouvelle_valeur: string | null;
  statut: string;
  commentaire: string | null;
  created_at: string;
  traite_par: string | null;
  traite_le: string | null;
};

type Props = {
  contratId: string;
  contrat: Record<string, any>;
  myRole: string;
  onApproved: () => void;
};

export function ContratPropositions({ contratId, contrat, myRole, onApproved }: Props) {
  const [items, setItems] = useState<Proposition[]>([]);
  const [emails, setEmails] = useState<Map<string, string>>(new Map());
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ champ: "loyer_mensuel", nouvelle: "", commentaire: "" });

  const canPropose = ["gestion_locative", "commercial", "technico_commercial", "admin", "juridique"].includes(myRole);
  const canDecide = myRole === "admin" || myRole === "juridique";

  const load = async () => {
    const { data } = await (supabase as any)
      .from("contrat_modifications_proposees")
      .select("*")
      .eq("contrat_id", contratId)
      .order("created_at", { ascending: false });
    const list = (data ?? []) as Proposition[];
    setItems(list);
    const ids = Array.from(new Set(list.flatMap((p) => [p.propose_par, p.traite_par]).filter(Boolean) as string[]));
    if (ids.length) {
      const { data: profs } = await supabase.from("profiles").select("id, email").in("id", ids);
      setEmails(new Map((profs ?? []).map((p: any) => [p.id, p.email])));
    }
  };

  useEffect(() => { load(); }, [contratId]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nouvelle.trim()) return toast.error("Nouvelle valeur requise");
    setSaving(true);
    const { data: userRes } = await supabase.auth.getUser();
    const uid = userRes.user?.id;
    if (!uid) { setSaving(false); return toast.error("Non authentifié"); }
    const ancienne = contrat[form.champ];
    const { error } = await (supabase as any).from("contrat_modifications_proposees").insert({
      contrat_id: contratId,
      propose_par: uid,
      champ_modifie: form.champ,
      ancienne_valeur: ancienne == null ? null : String(ancienne),
      nouvelle_valeur: form.nouvelle.trim(),
      commentaire: form.commentaire.trim() || null,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Proposition envoyée pour validation");
    setForm({ champ: "loyer_mensuel", nouvelle: "", commentaire: "" });
    setOpen(false);
    load();
  };

  const handleDecision = async (p: Proposition, approve: boolean) => {
    const { data: userRes } = await supabase.auth.getUser();
    const uid = userRes.user?.id;
    if (!uid) return toast.error("Non authentifié");
    if (approve) {
      // Appliquer sur le contrat
      const champ = p.champ_modifie;
      const raw = p.nouvelle_valeur;
      const meta = CHAMPS.find((c) => c.value === champ);
      let value: any = raw;
      if (raw === null || raw === "") value = null;
      else if (meta?.type === "number") value = Number(raw);
      const { error: uErr } = await supabase.from("contrats").update({ [champ]: value } as any).eq("id", contratId);
      if (uErr) return toast.error("Application impossible : " + uErr.message);
    }
    const { error } = await (supabase as any).from("contrat_modifications_proposees").update({
      statut: approve ? "approuvee" : "rejetee",
      traite_par: uid,
      traite_le: new Date().toISOString(),
    }).eq("id", p.id);
    if (error) return toast.error(error.message);
    toast.success(approve ? "Proposition approuvée et appliquée" : "Proposition rejetée");
    load();
    if (approve) onApproved();
  };

  const enAttente = items.filter((p) => p.statut === "en_attente");
  const traitees = items.filter((p) => p.statut !== "en_attente");
  const fieldMeta = CHAMPS.find((c) => c.value === form.champ);

  const fmtVal = (v: string | null) => v == null || v === "" ? "—" : v;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>Modifications proposées</CardTitle>
          <CardDescription>
            {canDecide
              ? "Approuve ou rejette les propositions envoyées par les gestionnaires."
              : "Les modifications non directes doivent être approuvées par le service juridique."}
          </CardDescription>
        </div>
        {canPropose && !canDecide && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline"><Send className="mr-2 h-4 w-4" /> Proposer</Button>
            </DialogTrigger>
            <DialogContent>
              <form onSubmit={handleCreate}>
                <DialogHeader>
                  <DialogTitle>Proposer une modification</DialogTitle>
                  <DialogDescription>La proposition sera envoyée au service juridique.</DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label>Champ</Label>
                    <Select value={form.champ} onValueChange={(v) => setForm({ ...form, champ: v, nouvelle: "" })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CHAMPS.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2 text-sm p-2 rounded bg-muted/50">
                    <span className="text-muted-foreground">Valeur actuelle : </span>
                    <span className="font-medium">{fmtVal(contrat[form.champ] == null ? null : String(contrat[form.champ]))}</span>
                  </div>
                  <div className="grid gap-2">
                    <Label>Nouvelle valeur</Label>
                    <Input
                      type={fieldMeta?.type ?? "text"}
                      value={form.nouvelle}
                      onChange={(e) => setForm({ ...form, nouvelle: e.target.value })}
                      required
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>Commentaire (optionnel)</Label>
                    <Textarea rows={2} value={form.commentaire} onChange={(e) => setForm({ ...form, commentaire: e.target.value })} />
                  </div>
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
                  <Button type="submit" disabled={saving}>{saving ? "..." : "Envoyer"}</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {enAttente.length > 0 && (
          <div className="rounded-md border border-amber-500/40 bg-amber-50/50 dark:bg-amber-950/10 p-3 space-y-3">
            <div className="text-sm font-semibold text-amber-800 dark:text-amber-300">
              En attente de validation ({enAttente.length})
            </div>
            {enAttente.map((p) => (
              <div key={p.id} className="rounded-md border bg-background p-3 text-sm space-y-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="font-medium">{CHAMP_LABEL[p.champ_modifie] ?? p.champ_modifie}</div>
                  <div className="text-xs text-muted-foreground">
                    proposée par {emails.get(p.propose_par) ?? "—"} · {new Date(p.created_at).toLocaleDateString("fr-FR")}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded border bg-muted/40 p-2">
                    <div className="text-xs text-muted-foreground">Actuel</div>
                    <div>{fmtVal(p.ancienne_valeur)}</div>
                  </div>
                  <div className="rounded border border-primary/40 bg-primary/5 p-2">
                    <div className="text-xs text-muted-foreground">Proposé</div>
                    <div className="font-medium">{fmtVal(p.nouvelle_valeur)}</div>
                  </div>
                </div>
                {p.commentaire && <div className="text-xs text-muted-foreground">« {p.commentaire} »</div>}
                {canDecide && (
                  <div className="flex gap-2 pt-1">
                    <Button size="sm" onClick={() => handleDecision(p, true)}>
                      <CheckCircle2 className="mr-2 h-4 w-4" /> Approuver
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => handleDecision(p, false)}>
                      <XCircle className="mr-2 h-4 w-4" /> Rejeter
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        {enAttente.length === 0 && (
          <p className="text-sm text-muted-foreground">Aucune proposition en attente.</p>
        )}
        {traitees.length > 0 && (
          <div>
            <div className="text-xs font-semibold uppercase text-muted-foreground mb-2">Historique</div>
            <div className="space-y-2">
              {traitees.slice(0, 5).map((p) => (
                <div key={p.id} className="flex items-center justify-between text-xs rounded border p-2">
                  <div>
                    <Badge variant={p.statut === "approuvee" ? "default" : "outline"} className="mr-2">
                      {p.statut === "approuvee" ? "Approuvée" : "Rejetée"}
                    </Badge>
                    <span className="text-muted-foreground">{CHAMP_LABEL[p.champ_modifie] ?? p.champ_modifie} — </span>
                    <span>{fmtVal(p.ancienne_valeur)} → {fmtVal(p.nouvelle_valeur)}</span>
                  </div>
                  <div className="text-muted-foreground">
                    {p.traite_le ? new Date(p.traite_le).toLocaleDateString("fr-FR") : ""}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
