import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Building2, ArrowLeft, Plus } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/biens/$bienId")({
  head: () => ({
    meta: [{ title: "Fiche bien — Agence Immobilière" }],
  }),
  component: BienDetailPage,
});

const STATUTS_LOT = [
  { value: "vacant", label: "Vacant" },
  { value: "loue", label: "Loué" },
  { value: "en_travaux", label: "En travaux" },
] as const;
const STATUT_LABEL: Record<string, string> = Object.fromEntries(STATUTS_LOT.map((s) => [s.value, s.label]));

type Bien = {
  id: string;
  titre: string;
  adresse: string | null;
  type_bien: string | null;
  statut: string;
  surface: number | null;
  notes: string | null;
};
type Lot = {
  id: string;
  bien_id: string;
  label: string;
  type_lot: string | null;
  statut: string;
  surface: number | null;
  notes: string | null;
};

function BienDetailPage() {
  const { bienId } = Route.useParams();
  const navigate = useNavigate();
  const [bien, setBien] = useState<Bien | null>(null);
  const [lots, setLots] = useState<Lot[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ label: "", type_lot: "", statut: "vacant", surface: "", notes: "" });

  const load = async () => {
    setLoading(true);
    const [{ data: bData, error: bErr }, { data: lData, error: lErr }] = await Promise.all([
      supabase.from("biens").select("id, titre, adresse, type_bien, statut, surface, notes").eq("id", bienId).maybeSingle(),
      supabase.from("lots").select("*").eq("bien_id", bienId).order("label"),
    ]);
    if (bErr) toast.error(bErr.message);
    setBien((bData ?? null) as Bien | null);
    if (lErr) toast.error(lErr.message);
    else setLots((lData ?? []) as Lot[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, [bienId]);

  const resetForm = () => setForm({ label: "", type_lot: "", statut: "vacant", surface: "", notes: "" });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.label.trim()) return toast.error("Le label est obligatoire");
    setSaving(true);
    const { error } = await supabase.from("lots").insert({
      bien_id: bienId,
      label: form.label.trim(),
      type_lot: form.type_lot.trim() || null,
      statut: form.statut || "vacant",
      surface: form.surface ? Number(form.surface) : null,
      notes: form.notes.trim() || null,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Lot ajouté");
    setOpen(false);
    resetForm();
    load();
  };

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            <span className="font-semibold">Agence Immobilière</span>
          </div>
          <Button variant="outline" size="sm" onClick={() => navigate({ to: "/biens" })}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Retour aux biens
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-10 space-y-6">
        {loading ? (
          <p className="text-sm text-muted-foreground">Chargement...</p>
        ) : !bien ? (
          <p className="text-sm text-muted-foreground">Bien introuvable.</p>
        ) : (
          <>
            <Card>
              <CardHeader>
                <CardTitle>{bien.titre}</CardTitle>
                <CardDescription>{bien.adresse ?? "Adresse non renseignée"}</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-2 sm:grid-cols-3 text-sm">
                <div><span className="text-muted-foreground">Type : </span>{bien.type_bien ?? "—"}</div>
                <div><span className="text-muted-foreground">Statut : </span>{bien.statut}</div>
                <div><span className="text-muted-foreground">Surface : </span>{bien.surface ?? "—"}</div>
                {bien.notes && <div className="sm:col-span-3"><span className="text-muted-foreground">Notes : </span>{bien.notes}</div>}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-start justify-between gap-4">
                <div>
                  <CardTitle>Lots</CardTitle>
                  <CardDescription>Unités louables rattachées à ce bien.</CardDescription>
                </div>
                <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) resetForm(); }}>
                  <DialogTrigger asChild>
                    <Button size="sm"><Plus className="mr-2 h-4 w-4" /> Nouveau lot</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <form onSubmit={handleCreate}>
                      <DialogHeader>
                        <DialogTitle>Nouveau lot</DialogTitle>
                        <DialogDescription>Ajouter un lot au bien {bien.titre}.</DialogDescription>
                      </DialogHeader>
                      <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                          <Label htmlFor="label">Label *</Label>
                          <Input id="label" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="1er étage N°7" required />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="grid gap-2">
                            <Label htmlFor="type_lot">Type de lot</Label>
                            <Input id="type_lot" value={form.type_lot} onChange={(e) => setForm({ ...form, type_lot: e.target.value })} placeholder="appartement, studio, magasin..." />
                          </div>
                          <div className="grid gap-2">
                            <Label>Statut</Label>
                            <Select value={form.statut} onValueChange={(v) => setForm({ ...form, statut: v })}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {STATUTS_LOT.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="surface">Surface (m²)</Label>
                          <Input id="surface" type="number" min="0" step="0.01" value={form.surface} onChange={(e) => setForm({ ...form, surface: e.target.value })} />
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="notes">Notes</Label>
                          <Textarea id="notes" rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                        </div>
                      </div>
                      <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
                        <Button type="submit" disabled={saving}>{saving ? "..." : "Enregistrer"}</Button>
                      </DialogFooter>
                    </form>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent>
                {lots.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Aucun lot pour ce bien.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Label</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Statut</TableHead>
                          <TableHead>Surface</TableHead>
                          <TableHead></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {lots.map((l) => (
                          <TableRow key={l.id}>
                            <TableCell className="font-medium">{l.label}</TableCell>
                            <TableCell>{l.type_lot ?? "—"}</TableCell>
                            <TableCell><Badge>{STATUT_LABEL[l.statut] ?? l.statut}</Badge></TableCell>
                            <TableCell>{l.surface ?? "—"}</TableCell>
                            <TableCell className="text-right">
                              <Button asChild variant="ghost" size="sm">
                                <Link to="/lots/$lotId" params={{ lotId: l.id }}>Ouvrir</Link>
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </main>
    </div>
  );
}
