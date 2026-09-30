import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

const BIEN_TYPES = [
  { value: "immeuble", label: "Immeuble" },
  { value: "appartement", label: "Appartement" },
  { value: "maison", label: "Maison" },
  { value: "local_commercial", label: "Local commercial" },
  { value: "terrain", label: "Terrain" },
] as const;

/** Création rapide d'un bien (prospection) : titre, adresse, type. Bailleur/gestionnaire optionnels. */
export function BienQuickCreateDialog({
  open, onOpenChange, initialTitre, onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initialTitre?: string;
  onCreated: (bien: { id: string; titre: string; adresse: string | null }) => void | Promise<void>;
}) {
  const [titre, setTitre] = useState("");
  const [adresse, setAdresse] = useState("");
  const [typeBien, setTypeBien] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitre(initialTitre ?? ""); setAdresse(""); setTypeBien("");
  }, [open, initialTitre]);

  const save = async () => {
    if (!titre.trim()) return toast.error("Le titre est obligatoire");
    setSaving(true);
    const { data, error } = await supabase.from("biens").insert({
      titre: titre.trim(),
      adresse: adresse.trim() || null,
      type_bien: typeBien || null,
      statut: "vacant",
      bailleur_id: null,
      gestionnaire_id: null,
    }).select("id, titre, adresse").single();
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Bien créé et sélectionné");
    await onCreated({ id: data!.id, titre: data!.titre ?? titre.trim(), adresse: data!.adresse ?? null });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Nouveau bien</DialogTitle>
          <DialogDescription>Bien en prospection — bailleur et gestionnaire pourront être ajoutés plus tard.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          <div className="grid gap-1.5"><Label>Titre *</Label><Input value={titre} onChange={(e) => setTitre(e.target.value)} /></div>
          <div className="grid gap-1.5"><Label>Adresse</Label><Input value={adresse} onChange={(e) => setAdresse(e.target.value)} /></div>
          <div className="grid gap-1.5">
            <Label>Type de bien</Label>
            <Select value={typeBien} onValueChange={setTypeBien}>
              <SelectTrigger><SelectValue placeholder="Sélectionner..." /></SelectTrigger>
              <SelectContent>
                {BIEN_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button type="button" onClick={save} disabled={saving}>{saving ? "..." : "Créer le bien"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
