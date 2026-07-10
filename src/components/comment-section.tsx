import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Send, Trash2 } from "lucide-react";
import { toast } from "sonner";

type Comment = { id: string; auteur: string; contenu: string; created_at: string };
type Profile = { id: string; email: string | null };

/**
 * Section de commentaires générique pour travaux / réclamations.
 * table = "travaux_commentaires" ou "reclamations_commentaires"
 * fkColumn = "travaux_id" ou "reclamation_id"
 */
export function CommentSection({ table, fkColumn, recordId, canComment }: {
  table: "travaux_commentaires" | "reclamations_commentaires";
  fkColumn: "travaux_id" | "reclamation_id";
  recordId: string;
  canComment: boolean;
}) {
  const [items, setItems] = useState<Comment[]>([]);
  const [authors, setAuthors] = useState<Map<string, Profile>>(new Map());
  const [me, setMe] = useState<string>("");
  const [content, setContent] = useState("");
  const [sending, setSending] = useState(false);

  const load = async () => {
    const { data: userRes } = await supabase.auth.getUser();
    setMe(userRes.user?.id ?? "");
    const { data, error } = await (supabase.from(table) as any).select("id, auteur, contenu, created_at").eq(fkColumn, recordId).order("created_at", { ascending: true });
    if (error) return;
    const list = (data ?? []) as Comment[];
    setItems(list);
    const ids = Array.from(new Set(list.map((c) => c.auteur)));
    if (ids.length) {
      const { data: pData } = await supabase.from("profiles").select("id, email").in("id", ids);
      setAuthors(new Map(((pData ?? []) as Profile[]).map((p) => [p.id, p])));
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [recordId]);

  const submit = async () => {
    if (!content.trim()) return;
    setSending(true);
    const { error } = await (supabase.from(table) as any).insert({ [fkColumn]: recordId, auteur: me, contenu: content.trim() });
    setSending(false);
    if (error) return toast.error(error.message);
    setContent(""); load();
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from(table).delete().eq("id", id);
    if (error) return toast.error(error.message);
    load();
  };

  const fmt = (d: string) => new Date(d).toLocaleString("fr-FR");

  return (
    <div className="space-y-3">
      <h4 className="font-semibold text-sm">Commentaires ({items.length})</h4>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">Aucun commentaire.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((c) => (
            <li key={c.id} className="rounded-md border p-2 text-sm bg-muted/30">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-xs text-muted-foreground">{authors.get(c.auteur)?.email ?? "—"} • {fmt(c.created_at)}</div>
                  <div className="whitespace-pre-wrap">{c.contenu}</div>
                </div>
                {c.auteur === me && (
                  <Button size="icon" variant="ghost" onClick={() => remove(c.id)}><Trash2 className="h-3 w-3" /></Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {canComment && (
        <div className="flex gap-2">
          <Textarea rows={2} value={content} onChange={(e) => setContent(e.target.value)} placeholder="Ajouter un commentaire..." />
          <Button size="icon" onClick={submit} disabled={sending || !content.trim()}><Send className="h-4 w-4" /></Button>
        </div>
      )}
    </div>
  );
}

export function computePerms(role: string, createdBy: string | null, uid: string) {
  const isCreator = !!createdBy && createdBy === uid;
  const isAdmin = role === "admin" || role === "direction";
  const isTech = role === "technique";
  const locked = role === "recouvrement" || role === "en_attente";
  return {
    canRead: !locked,
    canComment: !locked,
    canEditFull: isCreator || isAdmin,
    canEditLimited: isTech && !isCreator && !isAdmin,
    canDelete: isCreator || role === "admin" || role === "direction",
  };
}
