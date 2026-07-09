import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Trash2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

export type DeleteCheck = {
  blocked: boolean;
  message: string;
  requireTypeToConfirm?: boolean;
};

type Props = {
  entityLabel: string; // ex: "ce contact"
  /** Called when user opens the dialog, to compute blockers/warnings */
  checkReferences: () => Promise<DeleteCheck>;
  /** Called on confirm */
  onDelete: () => Promise<void>;
};

export function DeleteZone({ entityLabel, checkReferences, onDelete }: Props) {
  const [open, setOpen] = useState(false);
  const [check, setCheck] = useState<DeleteCheck | null>(null);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [typed, setTyped] = useState("");

  const handleOpen = async (o: boolean) => {
    setOpen(o);
    setTyped("");
    if (o) {
      setLoading(true);
      try {
        setCheck(await checkReferences());
      } catch (e: any) {
        toast.error(e.message ?? "Erreur");
        setCheck({ blocked: true, message: "Impossible de vérifier les références." });
      }
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (!check || check.blocked) return;
    if (check.requireTypeToConfirm && typed !== "SUPPRIMER") {
      return toast.error('Tape "SUPPRIMER" pour confirmer.');
    }
    setDeleting(true);
    try {
      await onDelete();
      setOpen(false);
    } catch (e: any) {
      toast.error(e.message ?? "Erreur pendant la suppression");
    }
    setDeleting(false);
  };

  return (
    <Card className="border-destructive/40">
      <CardHeader>
        <CardTitle className="text-destructive text-base">Zone dangereuse</CardTitle>
        <CardDescription>Suppression définitive de {entityLabel}. Réservé à l'admin.</CardDescription>
      </CardHeader>
      <CardContent>
        <Dialog open={open} onOpenChange={handleOpen}>
          <DialogTrigger asChild>
            <Button variant="destructive" size="sm">
              <Trash2 className="mr-2 h-4 w-4" /> Supprimer
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-destructive" /> Confirmer la suppression
              </DialogTitle>
              <DialogDescription>Cette action est irréversible.</DialogDescription>
            </DialogHeader>
            <div className="py-4 text-sm">
              {loading ? (
                <p className="text-muted-foreground">Vérification des références...</p>
              ) : check?.blocked ? (
                <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-destructive">
                  {check.message}
                </div>
              ) : check ? (
                <>
                  <p className="whitespace-pre-line">{check.message}</p>
                  {check.requireTypeToConfirm && (
                    <div className="mt-4 grid gap-2">
                      <Label htmlFor="confirm-type">Tape <span className="font-mono font-bold">SUPPRIMER</span> pour confirmer</Label>
                      <Input
                        id="confirm-type"
                        value={typed}
                        onChange={(e) => setTyped(e.target.value)}
                        autoComplete="off"
                      />
                    </div>
                  )}
                </>
              ) : null}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
              <Button
                variant="destructive"
                onClick={handleConfirm}
                disabled={loading || deleting || !check || check.blocked || (check.requireTypeToConfirm && typed !== "SUPPRIMER")}
              >
                {deleting ? "Suppression..." : "Supprimer définitivement"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
