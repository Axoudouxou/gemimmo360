import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Archive, ArchiveRestore } from "lucide-react";
import { toast } from "sonner";

export function ArchiveBienButton({ bienId, archived, activeCount, onDone }: {
  bienId: string; archived: boolean; activeCount: number; onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [motif, setMotif] = useState("");
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    const { error } = archived
      ? await supabase.rpc("restaurer_bien", { _bien_id: bienId })
      : await supabase.rpc("archiver_bien", { _bien_id: bienId, _date: date, _motif: motif || null as unknown as string });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(archived ? "Bien restauré" : "Bien archivé");
    setOpen(false);
    onDone();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          {archived ? <><ArchiveRestore className="mr-2 h-4 w-4" /> Restaurer</> : <><Archive className="mr-2 h-4 w-4" /> Archiver</>}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{archived ? "Restaurer le bien" : "Archiver le bien (fin de gestion)"}</DialogTitle>
          <DialogDescription>
            {archived
              ? "Le bien réapparaîtra dans les listes. Les contrats clôturés restent résiliés."
              : `Le bien et ses impayés seront masqués des listes et du tableau de bord. ${activeCount} contrat(s) actif(s) seront clôturés à la date de fin de gestion. Aucun historique n'est supprimé.`}
          </DialogDescription>
        </DialogHeader>
        {!archived && (
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label>Date de fin de gestion</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </div>
            <div className="grid gap-2">
              <Label>Motif (facultatif)</Label>
              <Textarea value={motif} onChange={(e) => setMotif(e.target.value)} />
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
          <Button variant={archived ? "default" : "destructive"} onClick={run} disabled={busy || (!archived && !date)}>
            {busy ? "..." : archived ? "Restaurer" : "Archiver"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
