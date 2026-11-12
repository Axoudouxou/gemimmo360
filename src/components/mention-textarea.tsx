import { useEffect, useRef, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Textarea } from "@/components/ui/textarea";

type Profile = { id: string; email: string | null; role: string | null };
const TEAM = "equipe";
const INACTIVE = ["en_attente", "inactif"];
const handleOf = (e: string | null) => (e ?? "").split("@")[0] ?? "";

async function loadProfiles(): Promise<Profile[]> {
  const { data } = await supabase.from("profiles").select("id, email, role").order("email");
  return (data ?? []) as Profile[];
}

function mentionedIds(text: string, profiles: Profile[], me: string): Set<string> {
  const out = new Set<string>();
  const re = /(?:^|\s)@([\w.-]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const h = m[1].toLowerCase();
    if (h === TEAM) { profiles.filter((p) => p.id !== me && !INACTIVE.includes(p.role ?? "")).forEach((p) => out.add(p.id)); continue; }
    const p = profiles.find((x) => handleOf(x.email).toLowerCase() === h);
    if (p && p.id !== me) out.add(p.id);
  }
  return out;
}

/** Notifie les personnes nouvellement mentionnées (absentes de l'ancien texte). */
export async function notifyNewMentions(oldText: string | null, newText: string | null, ctx: { link: string; entityType: string; entityId: string; entityTitle?: string }) {
  if (!newText || !newText.includes("@")) return;
  const [{ data: u }, profiles] = await Promise.all([supabase.auth.getUser(), loadProfiles()]);
  const me = u.user?.id ?? "";
  const before = mentionedIds(oldText ?? "", profiles, me);
  const after = mentionedIds(newText, profiles, me);
  const author = handleOf(profiles.find((p) => p.id === me)?.email ?? null) || "quelqu'un";
  await Promise.all([...after].filter((id) => !before.has(id)).map((uid) =>
    supabase.rpc("notify_mention", {
      _user_id: uid, _title: "Vous avez été mentionné",
      _message: `${author} vous a mentionné${ctx.entityTitle ? ` sur : ${ctx.entityTitle}` : ""}`,
      _link: ctx.link, _entity_type: ctx.entityType, _entity_id: ctx.entityId,
    })));
}

export function MentionTextarea({ value, onChange, rows = 3, id, disabled }: {
  value: string; onChange: (v: string) => void; rows?: number; id?: string; disabled?: boolean;
}) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [q, setQ] = useState<string | null>(null);
  const [idx, setIdx] = useState(0);
  const ref = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => { loadProfiles().then(setProfiles); }, []);

  const options = useMemo(() => {
    if (q === null) return [] as string[];
    const s = q.toLowerCase();
    const users = profiles.filter((p) => !INACTIVE.includes(p.role ?? "")).map((p) => handleOf(p.email)).filter((h) => h && h.toLowerCase().includes(s)).slice(0, 6);
    return (TEAM.startsWith(s) ? [TEAM] : []).concat(users);
  }, [q, profiles]);

  const insert = (h: string) => {
    const el = ref.current; if (!el) return;
    const caret = el.selectionStart ?? value.length;
    const before = value.slice(0, caret).replace(/(?:^|\s)@([\w.-]*)$/, (m) => `${m.startsWith("@") ? "" : m.charAt(0)}@${h} `);
    onChange(before + value.slice(caret)); setQ(null);
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(before.length, before.length); });
  };

  return (
    <div className="relative">
      <Textarea id={id} ref={ref} rows={rows} value={value} disabled={disabled}
        placeholder="Tapez @ pour mentionner un collègue, @equipe pour toute l'équipe"
        onChange={(e) => {
          onChange(e.target.value);
          const m = e.target.value.slice(0, e.target.selectionStart ?? 0).match(/(?:^|\s)@([\w.-]*)$/);
          setQ(m ? m[1] ?? "" : null); setIdx(0);
        }}
        onKeyDown={(e) => {
          if (q === null || !options.length) return;
          if (e.key === "ArrowDown") { e.preventDefault(); setIdx((i) => Math.min(i + 1, options.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setIdx((i) => Math.max(i - 1, 0)); }
          else if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); insert(options[idx]); }
          else if (e.key === "Escape") setQ(null);
        }} />
      {q !== null && options.length > 0 && (
        <div className="absolute z-50 left-0 top-full mt-1 w-64 rounded-md border bg-popover p-1 shadow-md">
          {options.map((h, i) => (
            <button key={h} type="button" onMouseDown={(e) => { e.preventDefault(); insert(h); }}
              className={`w-full rounded px-2 py-1.5 text-left text-sm ${i === idx ? "bg-accent" : "hover:bg-accent/60"}`}>
              @{h}{h === TEAM && <span className="ml-2 text-xs text-muted-foreground">Toute l'équipe</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
