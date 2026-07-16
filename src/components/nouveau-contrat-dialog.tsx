import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";

type Lot = { id: string; label: string; bien_id: string; statut: string };
type Bien = { id: string; titre: string };
type Locataire = { id: string; nom: string; prenom: string | null; type_entite: string | null };
type ExistingContrat = { id: string; date_fin: string | null };

const locName = (l: Locataire) => l.type_entite === "entreprise" ? l.nom : `${l.nom}${l.prenom ? ` ${l.prenom}` : ""}`;

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Si fourni, le lot est fixé (fiche Lot). Sinon un sélecteur apparaît. */
  fixedLotId?: string;
  onCreated?: (contratId: string) => void;
};

export function NouveauContratDialog({ open, onOpenChange, fixedLotId, onCreated }: Props) {
  const [lots, setLots] = useState<Lot[]>([]);
  const [biens, setBiens] = useState<Bien[]>([]);
  const [locataires, setLocataires] = useState<Locataire[]>([]);
  const [lotId, setLotId] = useState<string>(fixedLotId ?? "");
  const [mode, setMode] = useState<"existant" | "nouveau">("existant");
  const [existantId, setExistantId] = useState<string>("");
  const [newLoc, setNewLoc] = useState({ nom: "", prenom: "", telephone: "", email: "", type_entite: "personne" as "personne" | "entreprise" });
  const [form, setForm] = useState({ loyer_mensuel: "", depot_garantie: "", date_debut: new Date().toISOString().slice(0, 10), statut: "actif" });
  const [saving, setSaving] = useState(false);
  const [activeContrat, setActiveContrat] = useState<ExistingContrat | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLotId(fixedLotId ?? "");
    setMode("existant"); setExistantId(""); setConfirmed(false);
    setNewLoc({ nom: "", prenom: "", telephone: "", email: "", type_entite: "personne" });
    setForm({ loyer_mensuel: "", depot_garantie: "", date_debut: new Date().toISOString().slice(0, 10), statut: "actif" });
    (async () => {
      const [{ data: lData }, { data: bData }, { data: locData }] = await Promise.all([
        supabase.from("lots").select("id, label, bien_id, statut").order("label"),
        supabase.from("biens").select("id, titre").order("titre"),
        supabase.from("contacts").select("id, nom, prenom, type_entite").eq("type_contact", "locataire").eq("archive", false).order("nom"),
      ]);
      setLots((lData ?? []) as Lot[]);
      setBiens((bData ?? []) as Bien[]);
      setLocataires((locData ?? []) as Locataire[]);
    })();
  }, [open, fixedLotId]);

  useEffect(() => {
    if (!lotId) { setActiveContrat(null); return; }
    (async () => {
      const { data } = await supabase.from("contrats").select("id, date_fin").eq("lot_id", lotId).eq("statut", "actif").maybeSingle();
      setActiveContrat((data ?? null) as ExistingContrat | null);
      setConfirmed(false);
    })();
  }, [lotId]);

  const bienTitre = (bid: string) => biens.find((b) => b.id === bid)?.titre ?? "—";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lotId) return toast.error("Sélectionner un lot");
    if (activeContrat && !confirmed) return toast.error("Merci de confirmer le remplacement du contrat actif");
    setSaving(true);

    let locId = existantId;
    const { data: userRes } = await supabase.auth.getUser();
    if (mode === "nouveau") {
      if (!newLoc.nom.trim()) { setSaving(false); return toast.error("Le nom est obligatoire"); }
      const { data: created, error: cErr } = await supabase.from("contacts").insert({
        nom: newLoc.nom.trim(),
        prenom: newLoc.prenom.trim() || null,
        telephone: newLoc.telephone.trim() || null,
        email: newLoc.email.trim() || null,
        type_contact: "locataire",
        type_entite: newLoc.type_entite,
        gestionnaire_id: userRes.user?.id ?? null,
      }).select("id").single();
      if (cErr) { setSaving(false); return toast.error(cErr.message); }
      locId = created.id;
    }
    if (!locId) { setSaving(false); return toast.error("Sélectionnez un locataire"); }

    // Terminer l'ancien contrat actif si nécessaire
    if (activeContrat) {
      const today = new Date().toISOString().slice(0, 10);
      const { error: endErr } = await supabase.from("contrats")
        .update({ statut: "termine", date_fin: today })
        .eq("id", activeContrat.id);
      if (endErr) { setSaving(false); return toast.error("Impossible de terminer l'ancien contrat: " + endErr.message); }
    }

    const { data: newC, error } = await supabase.from("contrats").insert({
      lot_id: lotId,
      locataire_id: locId,
      loyer_mensuel: form.loyer_mensuel ? Number(form.loyer_mensuel) : null,
      depot_garantie: form.depot_garantie ? Number(form.depot_garantie) : null,
      date_debut: form.date_debut || null,
      statut: form.statut || "actif",
    }).select("id").single();
    if (error) {
      setSaving(false);
      if ((error as any).code === "23505") return toast.error("Ce lot a déjà un contrat actif en cours.");
      return toast.error(error.message);
    }
    if ((form.statut || "actif") === "actif") {
      await supabase.from("lots").update({ statut: "loue" }).eq("id", lotId);
    }
    setSaving(false);
    toast.success(activeContrat ? "Nouveau contrat créé, ancien terminé automatiquement" : "Contrat créé");
    onOpenChange(false);
    onCreated?.(newC!.id);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Nouveau contrat</DialogTitle>
            <DialogDescription>Choisir un locataire existant ou en créer un nouveau.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {!fixedLotId && (
              <div className="grid gap-2">
                <Label>Lot *</Label>
                <SearchableSelect
                  value={lotId}
                  onChange={setLotId}
                  options={lots.map((l) => ({
                    value: l.id,
                    label: `${bienTitre(l.bien_id)} — ${l.label} (${l.statut})`,
                  }))}
                  placeholder={lots.length ? "Rechercher un lot..." : "Aucun lot disponible"}
                />
              </div>
            )}

            {activeContrat && (
              <div className="rounded-md border border-amber-500 bg-amber-50 dark:bg-amber-950/30 p-3 space-y-2">
                <div className="flex items-start gap-2 text-sm text-amber-900 dark:text-amber-100">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                  <div>Ce lot a déjà un contrat actif — le créer quand même mettra fin automatiquement à l'ancien contrat (avec la date du jour).</div>
                </div>
                <label className="flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
                  <span>Je confirme vouloir remplacer l'ancien contrat.</span>
                </label>
              </div>
            )}

            <div className="flex gap-2">
              <Button type="button" size="sm" variant={mode === "existant" ? "default" : "outline"} onClick={() => setMode("existant")}>Locataire existant</Button>
              <Button type="button" size="sm" variant={mode === "nouveau" ? "default" : "outline"} onClick={() => setMode("nouveau")}>Nouveau locataire</Button>
            </div>

            {mode === "existant" ? (
              <div className="grid gap-2">
                <Label>Locataire</Label>
                <Select value={existantId} onValueChange={setExistantId}>
                  <SelectTrigger><SelectValue placeholder={locataires.length ? "Sélectionner..." : "Aucun locataire disponible"} /></SelectTrigger>
                  <SelectContent>
                    {locataires.map((l) => <SelectItem key={l.id} value={l.id}>{locName(l)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="grid gap-3 rounded-md border p-3">
                <div className="grid gap-2">
                  <Label>Type</Label>
                  <Select value={newLoc.type_entite} onValueChange={(v) => setNewLoc({ ...newLoc, type_entite: v as "personne" | "entreprise" })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="personne">Personne</SelectItem>
                      <SelectItem value="entreprise">Entreprise</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-2"><Label>Nom *</Label><Input value={newLoc.nom} onChange={(e) => setNewLoc({ ...newLoc, nom: e.target.value })} required={mode === "nouveau"} /></div>
                  <div className="grid gap-2"><Label>Prénom</Label><Input value={newLoc.prenom} onChange={(e) => setNewLoc({ ...newLoc, prenom: e.target.value })} /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-2"><Label>Téléphone</Label><Input value={newLoc.telephone} onChange={(e) => setNewLoc({ ...newLoc, telephone: e.target.value })} /></div>
                  <div className="grid gap-2"><Label>Email</Label><Input type="email" value={newLoc.email} onChange={(e) => setNewLoc({ ...newLoc, email: e.target.value })} /></div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2"><Label>Loyer mensuel</Label><Input type="number" min="0" step="0.01" value={form.loyer_mensuel} onChange={(e) => setForm({ ...form, loyer_mensuel: e.target.value })} /></div>
              <div className="grid gap-2"><Label>Dépôt de garantie</Label><Input type="number" min="0" step="0.01" value={form.depot_garantie} onChange={(e) => setForm({ ...form, depot_garantie: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2"><Label>Date début</Label><Input type="date" value={form.date_debut} onChange={(e) => setForm({ ...form, date_debut: e.target.value })} /></div>
              <div className="grid gap-2"><Label>Statut</Label>
                <Select value={form.statut} onValueChange={(v) => setForm({ ...form, statut: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="actif">Actif</SelectItem>
                    <SelectItem value="brouillon">Brouillon</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
            <Button type="submit" disabled={saving}>{saving ? "..." : "Créer le contrat"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
