import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Search, X } from "lucide-react";

export type FilterSelect = {
  key: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  width?: string;
};

export type DateRangeFilter = {
  label: string;
  from: string;
  to: string;
  onFromChange: (v: string) => void;
  onToChange: (v: string) => void;
};

export function FilterBar({
  search,
  onSearchChange,
  searchPlaceholder = "Rechercher...",
  selects = [],
  dateRange,
  onReset,
  extra,
}: {
  search?: string;
  onSearchChange?: (v: string) => void;
  searchPlaceholder?: string;
  selects?: FilterSelect[];
  dateRange?: DateRangeFilter;
  onReset?: () => void;
  extra?: React.ReactNode;
}) {
  const hasActive =
    (search && search.length > 0) ||
    selects.some((s) => s.value && s.value !== "all") ||
    (dateRange && (dateRange.from || dateRange.to));

  return (
    <div className="mb-4 flex flex-wrap items-end gap-2 rounded-md border bg-muted/20 p-3">
      {onSearchChange && (
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={searchPlaceholder}
            value={search ?? ""}
            onChange={(e) => onSearchChange(e.target.value)}
            className="h-9 pl-8"
          />
        </div>
      )}
      {selects.map((s) => (
        <Select key={s.key} value={s.value} onValueChange={s.onChange}>
          <SelectTrigger className={`h-9 ${s.width ?? "w-44"}`}>
            <SelectValue placeholder={s.label} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{s.label} : tous</SelectItem>
            {s.options.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ))}
      {dateRange && (
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground">{dateRange.label}</span>
          <Input
            type="date"
            value={dateRange.from}
            onChange={(e) => dateRange.onFromChange(e.target.value)}
            className="h-9 w-[9.5rem]"
          />
          <span className="text-xs text-muted-foreground">→</span>
          <Input
            type="date"
            value={dateRange.to}
            onChange={(e) => dateRange.onToChange(e.target.value)}
            className="h-9 w-[9.5rem]"
          />
        </div>
      )}
      {extra}
      {hasActive && onReset && (
        <Button variant="ghost" size="sm" onClick={onReset} className="h-9">
          <X className="mr-1 h-3 w-3" /> Réinitialiser
        </Button>
      )}
    </div>
  );
}
