import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ETAPE_LABELS } from "@/lib/echeance-statut";
import { toast } from "sonner";

export type SuiviEcheance = {
  id: string; service_en_charge: string | null;
  date_mise_en_demeure: string | null; date_acte_commissaire: string | null; date_assignation: string | null;
};
type Hist = { id: string; champ: string; ancienne_valeur: string | null; nouvelle_valeur: string | null; auteur: string | null; created_at: string };

const CHAMPS: Record<string, string> = {
  etape_traitement: "Étape", service_en_charge: "Service en charge", date_mise_en_demeure: "Date de mise en demeure",
  date_acte_commissaire: "Date d'acte de commissaire de justice", date_assignation: "Date d'assignation", cloture: "Clôture",
};
const SERVICES: Record<string, string> = { recouvrement: "Finance", juridique: "Juridique" };
const STATUTS: Record<string, string> = { solde: "Soldé", impaye: "Impayé", partiel: "Partiel" };
const fmtD = (d: string) => new Date(d).toLocaleDateString("fr-FR");

function val(champ: string, v: string | null) {
  if (!v) return "—";
  if (champ === "etape_traitement") return ETAPE_LABELS[v] ?? v;
  if (champ === "service_en_charge") return SERVICES[v] ?? v;
  if (champ === "cloture") return STATUTS[v] ?? v;
  if (champ.startsWith("date_")) return fmtD(v);
  return v;
}

export function SuiviJuridiqueDialog({ echeance, onOpenChange, canEditLegal, onSaved }: {
  echeance: SuiviEcheance | null; onOpenChange: (o: boolean) => void; canEditLegal: boolean; onSaved?: () => void;
}) {
  const [mise, setMise] = useState(""); const [acte, setActe] = useState(""); const [assign, setAssign] = useState("");
  const [hist, setHist] = useState<Hist[]>([]); const [emails, setEmails] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const juridique = echeance?.service_en_charge === "juridique";

  const loadHist = async (id: string) => {
    const { data } = await supabase.from("echeances_historique").select("*").eq("echeance_id", id).order("created_at", { ascending: false });
    const rows = (data ?? []) as Hist[]; setHist(rows);
    const ids = [...new Set(rows.map((r) => r.auteur).filter(Boolean))] as string[];
    if (ids.length) {
      const { data: p } = await supabase.from("profiles").select("id, email").in("id", ids);
      setEmails(Object.fromEntries((p ?? []).map((x) => [x.id, x.email ?? ""])));
    }
  };

  useEffect(() => {
    if (!echeance) return;
    setMise(echeance.date_mise_en_demeure ?? ""); setActe(echeance.date_acte_commissaire ?? ""); setAssign(echeance.date_assignation ?? "");
    loadHist(echeance.id);
  }, [echeance]);

  const save = async () => {
    if (!echeance) return;
    setSaving(true);
    const { error } = await supabase.rpc("maj_dates_juridiques", {
      _echeance_id: echeance.id, _mise_en_demeure: (mise || null) as string, _acte: (acte || null) as string, _assignation: (assign || null) as string,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Suivi juridique enregistré");
    loadHist(echeance.id); onSaved?.();
  };

  return (
    <Dialog open={!!echeance} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Suivi de l'impayé</DialogTitle>
          <DialogDescription>Suivi juridique et historique des statuts.</DialogDescription>
        </DialogHeader>
        {juridique && (
          <div className="grid gap-3">
            <div className="grid gap-1"><Label>Date de mise en demeure</Label>
              <Input type="date" value={mise} disabled={!canEditLegal} onChange={(e) => setMise(e.target.value)} /></div>
            <div className="grid gap-1"><Label>Date d'acte de commissaire de justice</Label>
              <Input type="date" value={acte} disabled={!canEditLegal} onChange={(e) => setActe(e.target.value)} /></div>
            <div className="grid gap-1"><Label>Date d'assignation</Label>
              <Input type="date" value={assign} disabled={!canEditLegal} onChange={(e) => setAssign(e.target.value)} /></div>
            {canEditLegal && <DialogFooter><Button onClick={save} disabled={saving}>{saving ? "..." : "Enregistrer les dates"}</Button></DialogFooter>}
          </div>
        )}
        <div className="mt-2">
          <div className="mb-2 text-sm font-semibold">Historique des statuts</div>
          {hist.length === 0 ? <p className="text-sm text-muted-foreground">Aucun changement enregistré.</p> : (
            <ul className="space-y-2 text-sm">
              {hist.map((h) => (
                <li key={h.id} className="rounded-md border p-2">
                  <div className="text-xs text-muted-foreground">
                    {new Date(h.created_at).toLocaleString("fr-FR")} — {h.auteur ? (emails[h.auteur] || "Utilisateur") : "Automatique"}
                  </div>
                  <div><span className="font-medium">{CHAMPS[h.champ] ?? h.champ}</span> : {val(h.champ, h.ancienne_valeur)} → <span className="font-medium">{val(h.champ, h.nouvelle_valeur)}</span></div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
