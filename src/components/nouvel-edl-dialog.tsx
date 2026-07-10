import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";

type Contrat = { id: string; statut: string; locataire_id: string | null };

export function NouvelEdlDialog({ open, onOpenChange, lotId, onCreated }: {
  open: boolean; onOpenChange: (v: boolean) => void; lotId: string; onCreated?: (id: string) => void;
}) {
  const [contrats, setContrats] = useState<Contrat[]>([]);
  const [form, setForm] = useState({ contrat_id: "", type: "entree", date_realisation: new Date().toISOString().slice(0, 10), observations: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm({ contrat_id: "", type: "entree", date_realisation: new Date().toISOString().slice(0, 10), observations: "" });
    (async () => {
      const { data } = await supabase.from("contrats").select("id, statut, locataire_id").eq("lot_id", lotId);
      const list = (data ?? []) as Contrat[];
      setContrats(list);
      const actif = list.find((c) => c.statut === "actif");
      if (actif) setForm((f) => ({ ...f, contrat_id: actif.id }));
    })();
  }, [open, lotId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.date_realisation) return toast.error("Date obligatoire");
    setSaving(true);
    const { data, error } = await supabase.from("etats_des_lieux").insert({
      lot_id: lotId,
      contrat_id: form.contrat_id || null,
      type: form.type,
      date_realisation: form.date_realisation,
      observations: form.observations.trim() || null,
    }).select("id").single();
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("État des lieux créé");
    onOpenChange(false);
    onCreated?.(data!.id);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Nouvel état des lieux</DialogTitle>
            <DialogDescription>Lot pré-rempli. Le contrat actif éventuel est proposé automatiquement.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Contrat associé (optionnel)</Label>
              <Select value={form.contrat_id || "none"} onValueChange={(v) => setForm({ ...form, contrat_id: v === "none" ? "" : v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Aucun contrat</SelectItem>
                  {contrats.map((c) => <SelectItem key={c.id} value={c.id}>{c.statut}</SelectItem>)}
                </SelectContent>
              </Select>
              {contrats.length === 0 && <p className="text-xs text-muted-foreground">Ce lot n'a aucun contrat. L'EDL sera rattaché uniquement au lot.</p>}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2"><Label>Type</Label>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="entree">Entrée</SelectItem><SelectItem value="sortie">Sortie</SelectItem></SelectContent>
                </Select>
              </div>
              <div className="grid gap-2"><Label>Date *</Label><Input type="date" required value={form.date_realisation} onChange={(e) => setForm({ ...form, date_realisation: e.target.value })} /></div>
            </div>
            <div className="grid gap-2"><Label>Observations</Label><Textarea rows={3} value={form.observations} onChange={(e) => setForm({ ...form, observations: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
            <Button type="submit" disabled={saving}>{saving ? "..." : "Enregistrer"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
