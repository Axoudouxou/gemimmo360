import { useCallback, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Pencil, Trash2, ArrowRight, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { format, formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import { TYPE_LABELS, TYPE_COLORS, STATUT_LABELS, type Activite } from "@/components/activites-widgets";
import { CommentSection } from "@/components/comment-section";

type Profile = { id: string; email: string | null; role?: string };

type Commentaire = {
  id: string;
  activite_id: string;
  auteur: string;
  contenu: string;
  created_at: string;
};

type Perms = {
  canEditAll: boolean;
  canChangeStatut: boolean;
  canDelete: boolean;
};

export function computeActivitePerms(
  a: Pick<Activite, "created_by" | "assigne_a"> | null,
  meId: string | null,
  role: string,
): Perms {
  if (!a || !meId) return { canEditAll: false, canChangeStatut: false, canDelete: false };
  const isCreator = a.created_by === meId;
  const isAssignee = a.assigne_a === meId;
  const isAdminDir = role === "admin" || role === "direction";
  // Créateur, assigné, admin et direction ont les pleins droits.
  const canEditAll = isCreator || isAssignee || isAdminDir;
  return {
    canEditAll,
    canChangeStatut: canEditAll,
    canDelete: isCreator || isAdminDir,
  };
}

function linkFor(a: Activite): { to: string; params?: Record<string, string>; label: string } | null {
  if (a.contrat_id) return { to: "/contrats/$contratId", params: { contratId: a.contrat_id }, label: "Contrat associé" };
  if (a.lot_id) return { to: "/lots/$lotId", params: { lotId: a.lot_id }, label: "Lot associé" };
  if (a.bien_id) return { to: "/biens/$bienId", params: { bienId: a.bien_id }, label: "Bien associé" };
  if (a.contact_id) return { to: "/contacts/$contactId", params: { contactId: a.contact_id }, label: "Contact associé" };
  if (a.transaction_id) return { to: "/transactions", label: "Transaction associée" };
  return null;
}

export function ActiviteDetailDialog({
  open,
  setOpen,
  activite,
  me,
  role,
  profiles,
  onEdit,
  onChanged,
  onDeleted,
}: {
  open: boolean;
  setOpen: (b: boolean) => void;
  activite: Activite | null;
  me: { id: string } | null;
  role: string;
  profiles: Profile[];
  onEdit?: (a: Activite) => void;
  onChanged?: () => void;
  onDeleted?: () => void;
}) {
  const [statut, setStatut] = useState<string>(activite?.statut ?? "a_faire");
  const [savingStatut, setSavingStatut] = useState(false);
  const [commentaires, setCommentaires] = useState<Commentaire[]>([]);
  const [newComment, setNewComment] = useState("");
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    if (activite) setStatut(activite.statut);
  }, [activite]);

  const perms = computeActivitePerms(activite, me?.id ?? null, role);
  const link = activite ? linkFor(activite) : null;

  const nameOf = (id: string | null) => {
    if (!id) return "—";
    const p = profiles.find((x) => x.id === id);
    return p?.email ?? id.slice(0, 8);
  };

  const loadCommentaires = useCallback(async () => {
    if (!activite) return;
    const { data, error } = await supabase
      .from("activite_commentaires")
      .select("*")
      .eq("activite_id", activite.id)
      .order("created_at", { ascending: true });
    if (error) return;
    setCommentaires((data ?? []) as Commentaire[]);
  }, [activite]);

  useEffect(() => {
    if (open && activite) loadCommentaires();
  }, [open, activite, loadCommentaires]);

  const saveStatut = async () => {
    if (!activite || !perms.canChangeStatut) return;
    if (statut === activite.statut) {
      setOpen(false);
      return;
    }
    setSavingStatut(true);
    const { error } = await supabase.from("activites").update({ statut }).eq("id", activite.id);
    setSavingStatut(false);
    if (error) return toast.error(error.message);
    toast.success("Statut mis à jour");
    onChanged?.();
  };

  const publishComment = async () => {
    if (!activite || !me || !newComment.trim()) return;
    setPosting(true);
    const { error } = await supabase.from("activite_commentaires").insert({
      activite_id: activite.id,
      auteur: me.id,
      contenu: newComment.trim(),
    });
    setPosting(false);
    if (error) return toast.error(error.message);
    setNewComment("");
    loadCommentaires();
  };

  const handleDelete = async () => {
    if (!activite || !perms.canDelete) return;
    if (!confirm("Supprimer cette activité ?")) return;
    const { error } = await supabase.from("activites").delete().eq("id", activite.id);
    if (error) return toast.error(error.message);
    toast.success("Activité supprimée");
    setOpen(false);
    onDeleted?.();
  };

  if (!activite) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            <span className={`inline-block h-2.5 w-2.5 rounded-full ${TYPE_COLORS[activite.type_activite] ?? "bg-gray-400"}`} />
            {activite.titre}
            {activite.priorite === "urgente" && (
              <Badge className="bg-red-500 text-white hover:bg-red-500">Urgente</Badge>
            )}
            <Badge variant="secondary">{TYPE_LABELS[activite.type_activite] ?? activite.type_activite}</Badge>
            <Badge variant="outline">{STATUT_LABELS[activite.statut] ?? activite.statut}</Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <div className="text-xs text-muted-foreground">Date</div>
              <div>
                {activite.date_debut
                  ? format(new Date(activite.date_debut), "EEEE d MMMM yyyy 'à' HH:mm", { locale: fr })
                  : "—"}
                {activite.date_fin ? ` → ${format(new Date(activite.date_fin), "HH:mm")}` : ""}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Lieu</div>
              <div>{activite.lieu ?? "—"}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Assigné par</div>
              <div>{nameOf(activite.created_by)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Assigné à</div>
              <div className="flex flex-wrap gap-1">
                {(assignes.length > 0 ? assignes : [activite.assigne_a]).map((id) => (
                  <Badge key={id} variant="secondary">{nameOf(id)}</Badge>
                ))}
              </div>
            </div>
            {biens.length > 0 && (
              <div className="col-span-2">
                <div className="text-xs text-muted-foreground">Biens concernés</div>
                <div className="flex flex-wrap gap-1">
                  {biens.map((b) => (
                    <Link key={b.id} to="/biens/$bienId" params={{ bienId: b.id }}>
                      <Badge variant="outline">{b.titre}</Badge>
                    </Link>
                  ))}
                </div>
              </div>
            )}

          </div>


          {activite.notes && (
            <div>
              <div className="text-xs text-muted-foreground mb-1">Description</div>
              <div className="rounded-md border bg-muted/30 p-3 text-sm whitespace-pre-wrap">{activite.notes}</div>
            </div>
          )}

          {link && (
            <Button asChild variant="outline" size="sm">
              <Link to={link.to} params={link.params as never}>
                {link.label} <ArrowRight className="ml-2 h-3.5 w-3.5" />
              </Link>
            </Button>
          )}

          {perms.canChangeStatut && (
            <div>
              <div className="text-xs text-muted-foreground mb-1">Changer le statut</div>
              <div className="flex items-center gap-2">
                <Select value={statut} onValueChange={setStatut}>
                  <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(STATUT_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button size="sm" onClick={saveStatut} disabled={savingStatut || statut === activite.statut}>
                  Enregistrer
                </Button>
              </div>
              {!perms.canEditAll && (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Vous êtes assigné à cette activité : vous pouvez uniquement modifier le statut.
                </p>
              )}
            </div>
          )}

          <Separator />

          <CommentSection
            table="activite_commentaires"
            fkColumn="activite_id"
            recordId={activite.id}
            canComment={true}
            entityType="activite"
            entityId={activite.id}
            link={`/calendrier?open=${activite.id}`}
            entityTitle={activite.titre}
          />
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <div>
            {perms.canDelete && (
              <Button variant="outline" size="sm" onClick={handleDelete} className="text-destructive hover:text-destructive">
                <Trash2 className="mr-2 h-3.5 w-3.5" /> Supprimer
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>Fermer</Button>
            {perms.canEditAll && onEdit && (
              <Button size="sm" onClick={() => { setOpen(false); onEdit(activite); }}>
                <Pencil className="mr-2 h-3.5 w-3.5" /> Modifier
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
