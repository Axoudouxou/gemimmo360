import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { SearchableSelect, type SearchableOption } from "@/components/ui/searchable-select";

type Props = {
  values: string[];
  onChange: (v: string[]) => void;
  options: SearchableOption[];
  placeholder?: string;
  emptyLabel?: string;
  disabled?: boolean;
};

/** Sélection multiple : recherche pour ajouter, puces pour retirer. */
export function MultiSelect({
  values,
  onChange,
  options,
  placeholder = "Ajouter...",
  emptyLabel = "Aucune sélection",
  disabled,
}: Props) {
  const available = options.filter((o) => !values.includes(o.value));
  const labelOf = (v: string) => options.find((o) => o.value === v)?.label ?? v.slice(0, 8);

  return (
    <div className="space-y-2">
      <SearchableSelect
        value=""
        onChange={(v) => v && onChange([...values, v])}
        options={available}
        placeholder={placeholder}
        disabled={disabled}
        allowClear={false}
      />
      <div className="flex flex-wrap gap-1">
        {values.length === 0 ? (
          <span className="text-xs text-muted-foreground">{emptyLabel}</span>
        ) : (
          values.map((v) => (
            <Badge key={v} variant="secondary" className="gap-1">
              {labelOf(v)}
              {!disabled && (
                <button
                  type="button"
                  aria-label={`Retirer ${labelOf(v)}`}
                  onClick={() => onChange(values.filter((x) => x !== v))}
                  className="ml-0.5 rounded-full hover:text-destructive"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </Badge>
          ))
        )}
      </div>
    </div>
  );
}
