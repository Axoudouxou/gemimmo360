import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Search, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

type ResultKind = "contact" | "bien" | "lot" | "contrat";

type SearchResult = {
  kind: ResultKind;
  id: string;
  primary: string;
  secondary?: string | null;
  onClickPath: { to: string; params: Record<string, string> };
};

const SECTION_LABELS: Record<ResultKind, string> = {
  contact: "Contacts",
  bien: "Biens",
  lot: "Lots",
  contrat: "Contrats",
};

export function GlobalSearch() {
  const navigate = useNavigate();
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // keyboard shortcut: "/" or Cmd/Ctrl+K
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (e.key === "Escape") {
        setOpen(false);
        inputRef.current?.blur();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // click outside
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  // debounced search
  useEffect(() => {
    const q = term.trim();
    if (q.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const handle = setTimeout(async () => {
      const like = `%${q}%`;
      const [contactsRes, biensRes, lotsRes, contratsRes] = await Promise.all([
        supabase
          .from("contacts")
          .select("id, nom, prenom, telephone, email, type_contact")
          .eq("archive", false)
          .or(
            `nom.ilike.${like},prenom.ilike.${like},telephone.ilike.${like},email.ilike.${like}`,
          )
          .limit(5),
        supabase
          .from("biens")
          .select("id, titre, adresse")
          .or(`titre.ilike.${like},adresse.ilike.${like}`)
          .limit(5),
        supabase.from("lots").select("id, label, bien_id").ilike("label", like).limit(5),
        supabase
          .from("contrats")
          .select(
            "id, statut, lot:lots(label, bien:biens(titre)), locataire:contacts!contrats_locataire_id_fkey(nom, prenom)",
          )
          .limit(20),
      ]);

      const out: SearchResult[] = [];

      (contactsRes.data ?? []).forEach((c: any) => {
        const name = [c.nom, c.prenom].filter(Boolean).join(" ");
        out.push({
          kind: "contact",
          id: c.id,
          primary: name || c.email || c.telephone || "Contact",
          secondary: c.type_contact ?? c.email ?? c.telephone,
          onClickPath: { to: "/contacts/$contactId", params: { contactId: c.id } },
        });
      });

      (biensRes.data ?? []).forEach((b: any) => {
        out.push({
          kind: "bien",
          id: b.id,
          primary: b.titre ?? "Bien",
          secondary: b.adresse,
          onClickPath: { to: "/biens/$bienId", params: { bienId: b.id } },
        });
      });

      (lotsRes.data ?? []).forEach((l: any) => {
        out.push({
          kind: "lot",
          id: l.id,
          primary: l.label ?? "Lot",
          onClickPath: { to: "/lots/$lotId", params: { lotId: l.id } },
        });
      });

      // client-side filter for contrats via joined names/titles
      const ql = q.toLowerCase();
      (contratsRes.data ?? [])
        .filter((c: any) => {
          const locNom = [c.locataire?.nom, c.locataire?.prenom].filter(Boolean).join(" ").toLowerCase();
          const bienTitre = (c.lot?.bien?.titre ?? "").toLowerCase();
          const lotLabel = (c.lot?.label ?? "").toLowerCase();
          return locNom.includes(ql) || bienTitre.includes(ql) || lotLabel.includes(ql);
        })
        .slice(0, 5)
        .forEach((c: any) => {
          const locNom = [c.locataire?.nom, c.locataire?.prenom].filter(Boolean).join(" ");
          const bienTitre = c.lot?.bien?.titre ?? "";
          out.push({
            kind: "contrat",
            id: c.id,
            primary: locNom || "Contrat",
            secondary: [bienTitre, c.lot?.label].filter(Boolean).join(" — ") || c.statut,
            onClickPath: { to: "/contrats/$contratId", params: { contratId: c.id } },
          });
        });

      setResults(out);
      setLoading(false);
      setOpen(true);
    }, 250);
    return () => clearTimeout(handle);
  }, [term]);

  const grouped: Record<ResultKind, SearchResult[]> = {
    contact: [],
    bien: [],
    lot: [],
    contrat: [],
  };
  results.forEach((r) => grouped[r.kind].push(r));

  const showDropdown = open && term.trim().length >= 2;

  return (
    <div ref={containerRef} className="relative w-full max-w-md">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={inputRef}
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          onFocus={() => term.trim().length >= 2 && setOpen(true)}
          placeholder="Rechercher contacts, biens, lots, contrats..."
          className="pl-9 pr-16 h-9"
        />
        <kbd className="absolute right-2 top-1/2 -translate-y-1/2 hidden sm:inline-flex items-center gap-1 rounded border bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : "⌘K"}
        </kbd>
      </div>

      {showDropdown && (
        <div className="absolute left-0 right-0 top-full mt-2 rounded-md border bg-popover shadow-lg z-50 max-h-[70vh] overflow-y-auto">
          {results.length === 0 && !loading ? (
            <div className="p-4 text-sm text-muted-foreground">
              Aucun résultat pour « {term.trim()} »
            </div>
          ) : (
            <div className="py-2">
              {(Object.keys(grouped) as ResultKind[]).map((kind) =>
                grouped[kind].length === 0 ? null : (
                  <div key={kind} className="mb-1">
                    <div className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {SECTION_LABELS[kind]}
                    </div>
                    {grouped[kind].map((r) => (
                      <button
                        key={`${r.kind}-${r.id}`}
                        type="button"
                        onClick={() => {
                          setOpen(false);
                          setTerm("");
                          navigate({ to: r.onClickPath.to as any, params: r.onClickPath.params as any });
                        }}
                        className="w-full text-left px-3 py-2 hover:bg-accent flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate">{r.primary}</div>
                          {r.secondary && (
                            <div className="text-xs text-muted-foreground truncate">{r.secondary}</div>
                          )}
                        </div>
                        <Badge variant="outline" className="text-[10px] shrink-0">
                          {SECTION_LABELS[r.kind].slice(0, -1)}
                        </Badge>
                      </button>
                    ))}
                  </div>
                ),
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
