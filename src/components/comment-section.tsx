import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Trash2 } from "lucide-react";
import { toast } from "sonner";

type Comment = { id: string; auteur: string; contenu: string; created_at: string };
type Profile = { id: string; email: string | null; role?: string | null };

const TEAM_HANDLE = "equipe";
const INACTIVE_ROLES = ["en_attente", "inactif"];
type Suggestion = { kind: "team" } | { kind: "user"; profile: Profile };

type CommentTable = "travaux_commentaires" | "reclamations_commentaires" | "impayes_commentaires" | "activite_commentaires";
type FkColumn = "travaux_id" | "reclamation_id" | "impaye_id" | "activite_id";

type EntityCtx =
  | { entityType: "travaux"; entityId: string; link: string }
  | { entityType: "reclamation"; entityId: string; link: string }
  | { entityType: "impaye"; entityId: string; link: string }
  | { entityType: "activite"; entityId: string; link: string }
  | { entityType?: undefined; entityId?: undefined; link?: undefined };

function localPart(email: string | null | undefined) {
  if (!email) return "";
  return email.split("@")[0] ?? "";
}

function renderWithMentions(text: string, mentionSet: Set<string>) {
  const parts = text.split(/(@[\w.-]+)/g);
  return parts.map((p, i) => {
    if (p.startsWith("@")) {
      const key = p.slice(1).toLowerCase();
      if (mentionSet.has(key)) {
        return (
          <span key={i} className="text-emerald-600 font-medium bg-emerald-50 rounded px-0.5">
            {p}
          </span>
        );
      }
    }
    return <span key={i}>{p}</span>;
  });
}

/**
 * Section de commentaires générique (travaux / réclamations / impayés).
 * Supporte @mentions avec autocomplétion et notifications.
 */
export function CommentSection(
  props: {
    table: CommentTable;
    fkColumn: FkColumn;
    recordId: string;
    canComment: boolean;
    entityTitle?: string;
  } & EntityCtx,
) {
  const { table, fkColumn, recordId, canComment, entityType, entityId, link, entityTitle } = props;
  const [items, setItems] = useState<Comment[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [me, setMe] = useState<string>("");
  const [content, setContent] = useState("");
  const [sending, setSending] = useState(false);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const authorsMap = useMemo(() => new Map(profiles.map((p) => [p.id, p])), [profiles]);
  const knownHandles = useMemo(() => {
    const s = new Set<string>([TEAM_HANDLE]);
    for (const p of profiles) {
      const lp = localPart(p.email).toLowerCase();
      if (lp) s.add(lp);
    }
    return s;
  }, [profiles]);

  const teamMembers = useMemo(
    () => profiles.filter((p) => p.id !== me && !INACTIVE_ROLES.includes(p.role ?? "")),
    [profiles, me],
  );

  const load = async () => {
    const { data: userRes } = await supabase.auth.getUser();
    setMe(userRes.user?.id ?? "");
    const { data, error } = await (supabase.from(table) as any)
      .select("id, auteur, contenu, created_at")
      .eq(fkColumn, recordId)
      .order("created_at", { ascending: true });
    if (error) return;
    setItems((data ?? []) as Comment[]);
  };

  const loadProfiles = async () => {
    const { data } = await supabase.from("profiles").select("id, email, role").order("email");
    setProfiles((data ?? []) as Profile[]);
  };

  useEffect(() => {
    load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [recordId, table]);
  useEffect(() => {
    loadProfiles();
  }, []);

  const filteredMentions = useMemo<Suggestion[]>(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.toLowerCase();
    const users: Suggestion[] = profiles
      .filter((p) => p.id !== me && !INACTIVE_ROLES.includes(p.role ?? ""))
      .filter((p) => {
        const lp = localPart(p.email).toLowerCase();
        return !q || lp.startsWith(q) || lp.includes(q);
      })
      .slice(0, 6)
      .map((profile) => ({ kind: "user", profile }));
    const teamMatches = !q || TEAM_HANDLE.startsWith(q) || "tous".startsWith(q) || "team".startsWith(q);
    return teamMatches ? [{ kind: "team" } as Suggestion, ...users] : users;
  }, [mentionQuery, profiles, me]);

  function onContentChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value;
    setContent(val);
    const caret = e.target.selectionStart ?? val.length;
    const before = val.slice(0, caret);
    const match = before.match(/(?:^|\s)@([\w.-]*)$/);
    if (match) {
      setMentionQuery(match[1] ?? "");
      setMentionIndex(0);
    } else {
      setMentionQuery(null);
    }
  }

  function insertMention(s: Suggestion) {
    const el = textareaRef.current;
    if (!el) return;
    const caret = el.selectionStart ?? content.length;
    const before = content.slice(0, caret);
    const after = content.slice(caret);
    const handle = s.kind === "team" ? TEAM_HANDLE : localPart(s.profile.email);
    const replaced = before.replace(/(?:^|\s)@([\w.-]*)$/, (m) => {
      const lead = m.startsWith("@") ? "" : m.charAt(0);
      return `${lead}@${handle} `;
    });
    const next = replaced + after;
    setContent(next);
    setMentionQuery(null);
    requestAnimationFrame(() => {
      el.focus();
      const pos = replaced.length;
      el.setSelectionRange(pos, pos);
    });
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (mentionQuery === null || filteredMentions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setMentionIndex((i) => Math.min(i + 1, filteredMentions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setMentionIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      insertMention(filteredMentions[mentionIndex]);
    } else if (e.key === "Escape") {
      setMentionQuery(null);
    }
  }

  function extractMentionedIds(text: string): string[] {
    const found = new Set<string>();
    const re = /(?:^|\s)@([\w.-]+)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const handle = m[1].toLowerCase();
      if (handle === TEAM_HANDLE) {
        for (const p of teamMembers) found.add(p.id);
        continue;
      }
      const prof = profiles.find((p) => localPart(p.email).toLowerCase() === handle);
      if (prof && prof.id !== me) found.add(prof.id);
    }
    return Array.from(found);
  }

  const submit = async () => {
    if (!content.trim()) return;
    setSending(true);
    const contenu = content.trim();
    const { error } = await (supabase.from(table) as any).insert({
      [fkColumn]: recordId,
      auteur: me,
      contenu,
    });
    setSending(false);
    if (error) return toast.error(error.message);

    // Send mention notifications
    if (entityType && entityId && link) {
      const mentioned = extractMentionedIds(contenu);
      const meEmail = authorsMap.get(me)?.email ?? "";
      const author = localPart(meEmail) || "quelqu'un";
      await Promise.all(
        mentioned.map((uid) =>
          supabase.rpc("notify_mention", {
            _user_id: uid,
            _title: "Vous avez été mentionné",
            _message: `${author} vous a mentionné${entityTitle ? ` sur : ${entityTitle}` : ""}`,
            _link: link,
            _entity_type: entityType,
            _entity_id: entityId,
          }),
        ),
      );
    }

    setContent("");
    load();
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
                <div className="min-w-0">
                  <div className="text-xs text-muted-foreground">
                    {authorsMap.get(c.auteur)?.email ?? "—"} • {fmt(c.created_at)}
                  </div>
                  <div className="whitespace-pre-wrap break-words">
                    {renderWithMentions(c.contenu, knownHandles)}
                  </div>
                </div>
                {c.auteur === me && (
                  <Button size="icon" variant="ghost" onClick={() => remove(c.id)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {canComment && (
        <div className="relative">
          <div className="flex gap-2">
            <Textarea
              ref={textareaRef}
              rows={2}
              value={content}
              onChange={onContentChange}
              onKeyDown={onKeyDown}
              placeholder="Ajouter un commentaire... (tapez @ pour mentionner, @equipe pour toute l\u2019équipe)"
            />
            <Button size="icon" onClick={submit} disabled={sending || !content.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          </div>
          {mentionQuery !== null && filteredMentions.length > 0 && (
            <div className="absolute z-30 left-0 bottom-full mb-1 w-64 rounded-md border bg-popover shadow-md p-1">
              {filteredMentions.map((s, i) => (
                <button
                  key={s.kind === "team" ? "__team__" : s.profile.id}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    insertMention(s);
                  }}
                  className={`w-full text-left px-2 py-1.5 text-sm rounded ${i === mentionIndex ? "bg-accent" : "hover:bg-accent/60"}`}
                >
                  {s.kind === "team" ? (
                    <>
                      <span className="text-emerald-600 font-medium">@{TEAM_HANDLE}</span>
                      <span className="text-xs text-muted-foreground ml-2">
                        Toute l&rsquo;équipe ({teamMembers.length})
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="text-emerald-600 font-medium">@{localPart(s.profile.email)}</span>
                      <span className="text-xs text-muted-foreground ml-2">{s.profile.email}</span>
                    </>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function computePerms(role: string, createdBy: string | null, uid: string) {
  const isCreator = !!createdBy && createdBy === uid;
  const isAdmin = role === "admin" || role === "direction";
  const isTech = role === "technique" || role === "technico_commercial";
  const isJuridique = role === "juridique";
  const locked = role === "recouvrement" || role === "en_attente";
  return {
    canRead: !locked,
    canComment: !locked,
    canEditFull: isCreator || isAdmin || isJuridique,
    canEditLimited: (isTech && !isCreator && !isAdmin) && !isJuridique,
    canDelete: isCreator || isAdmin,
  };
}
