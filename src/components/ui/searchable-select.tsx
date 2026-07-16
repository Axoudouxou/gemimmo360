import * as React from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";
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
            <CommandEmpty>{emptyText}</CommandEmpty>
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
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
