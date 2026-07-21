import * as React from "react";
import { Check, ChevronsUpDown, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

export type SearchableOption = {
  value: string;
  label: string;
  /** Extra text used for filtering (not shown). */
  keywords?: string;
};

type Props = {
  value: string;
  onChange: (v: string) => void;
  options: SearchableOption[];
  placeholder?: string;
  emptyText?: string;
  disabled?: boolean;
  className?: string;
  allowClear?: boolean;
  id?: string;
  /** When set, shows a "+ Créer …" row using the current query when it doesn't match an existing label. */
  onCreateOption?: (query: string) => void;
  /** Label formatter for the create row. */
  createLabel?: (query: string) => string;
};

/**
 * Combobox with type-to-search. Results starting with the query rank first.
 */
export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = "Sélectionner...",
  emptyText = "Aucun résultat",
  disabled,
  className,
  allowClear = true,
  id,
  onCreateOption,
  createLabel,
}: Props) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");

  const selected = React.useMemo(
    () => options.find((o) => o.value === value) ?? null,
    [options, value],
  );

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options.slice(0, 200);
    const scored = options
      .map((o) => {
        const label = o.label.toLowerCase();
        const kw = (o.keywords ?? "").toLowerCase();
        const inLabel = label.includes(q);
        const inKw = kw.includes(q);
        if (!inLabel && !inKw) return null;
        // Rank: startsWith label > word-start label > substring label > keyword match
        let score = 3;
        if (label.startsWith(q)) score = 0;
        else if (label.includes(" " + q) || label.includes("-" + q)) score = 1;
        else if (inLabel) score = 2;
        return { o, score };
      })
      .filter((x): x is { o: SearchableOption; score: number } => x !== null)
      .sort((a, b) => a.score - b.score || a.o.label.localeCompare(b.o.label))
      .slice(0, 200);
    return scored.map((s) => s.o);
  }, [options, query]);

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQuery(""); }}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn("w-full justify-between font-normal", !selected && "text-muted-foreground", className)}
        >
          <span className="truncate">{selected ? selected.label : placeholder}</span>
          <span className="ml-2 flex items-center gap-1 shrink-0">
            {allowClear && selected && !disabled && (
              <span
                role="button"
                tabIndex={-1}
                aria-label="Effacer"
                onClick={(e) => { e.stopPropagation(); onChange(""); }}
                className="rounded p-0.5 hover:bg-muted"
              >
                <X className="h-3.5 w-3.5" />
              </span>
            )}
            <ChevronsUpDown className="h-4 w-4 opacity-50" />
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Rechercher..."
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            <CommandEmpty>
              <div className="px-2 py-1.5 text-sm">{emptyText}</div>
              {onCreateOption && query.trim() && (
                <button
                  type="button"
                  className="w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent text-primary"
                  onClick={() => {
                    const q = query.trim();
                    onCreateOption(q);
                    setOpen(false);
                    setQuery("");
                  }}
                >
                  <Plus className="h-4 w-4" />
                  <span className="truncate">
                    {createLabel ? createLabel(query.trim()) : `Créer "${query.trim()}"`}
                  </span>
                </button>
              )}
            </CommandEmpty>
            <CommandGroup>
              {filtered.map((o) => (
                <CommandItem
                  key={o.value}
                  value={o.value}
                  onSelect={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                >
                  <Check className={cn("mr-2 h-4 w-4", value === o.value ? "opacity-100" : "opacity-0")} />
                  <span className="truncate">{o.label}</span>
                </CommandItem>
              ))}
              {onCreateOption && query.trim() && filtered.length > 0 && !filtered.some((o) => o.label.toLowerCase().includes(query.trim().toLowerCase()) && o.label.toLowerCase() === query.trim().toLowerCase()) && (
                <CommandItem
                  key="__create__"
                  value={`__create__${query}`}
                  onSelect={() => {
                    const q = query.trim();
                    onCreateOption(q);
                    setOpen(false);
                    setQuery("");
                  }}
                >
                  <Plus className="mr-2 h-4 w-4 text-primary" />
                  <span className="truncate text-primary">
                    {createLabel ? createLabel(query.trim()) : `+ Créer "${query.trim()}"`}
                  </span>
                </CommandItem>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
