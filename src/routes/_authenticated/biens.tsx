import { createFileRoute, Link } from "@tanstack/react-router";
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

export const Route = createFileRoute("/_authenticated/biens")({
  head: () => ({
    meta: [
      { title: "Biens — Agence Immobilière" },
      { name: "description", content: "Liste et gestion des biens immobiliers de l'agence." },
    ],
  }),
  component: BiensPage,
});

const TYPES_BIEN = [
  { value: "immeuble", label: "Immeuble" },
  { value: "appartement", label: "Appartement" },
  { value: "maison", label: "Maison" },
  { value: "local_commercial", label: "Local commercial" },
  { value: "terrain", label: "Terrain" },
] as const;

const STATUTS = [
  { value: "vacant", label: "Vacant" },
  { value: "loue", label: "Loué" },
  { value: "en_travaux", label: "En travaux" },
] as const;

const OPERATIONS = [
  { value: "location", label: "Location" },
  { value: "vente", label: "Vente" },
] as const;

const TYPE_BIEN_LABEL: Record<string, string> = Object.fromEntries(TYPES_BIEN.map((t) => [t.value, t.label]));
const STATUT_LABEL: Record<string, string> = Object.fromEntries(STATUTS.map((t) => [t.value, t.label]));

type Bien = {
  id: string;
  titre: string;
  adresse: string | null;
  type_bien: string | null;
  statut: string;
  type_operation: string | null;
  surface: number | null;
  bailleur_id: string | null;
  gestionnaire_id: string | null;
  notes: string | null;
  created_at: string;
};

type Bailleur = { id: string; nom: string; prenom: string | null };

function BiensPage() {
  const [biens, setBiens] = useState<Bien[]>([]);
  const [bailleurs, setBailleurs] = useState<Bailleur[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    titre: "",
    adresse: "",
    type_bien: "",
    statut: "vacant",
    type_operation: "",
    surface: "",
    bailleur_id: "",
    notes: "",
  });

  const load = async () => {
    setLoading(true);
    const { data: userRes } = await supabase.auth.getUser();
    setUserId(userRes.user?.id ?? null);
    const [{ data: biensData, error }, { data: bData, error: bErr }] = await Promise.all([
      supabase.from("biens").select("*").order("created_at", { ascending: false }),
      supabase.from("contacts").select("id, nom, prenom").eq("type_contact", "bailleur").order("nom"),
    ]);
    if (error) toast.error(error.message);
    else setBiens((biensData ?? []) as Bien[]);
    if (bErr) toast.error(bErr.message);
    else setBailleurs((bData ?? []) as Bailleur[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const resetForm = () =>
    setForm({ titre: "", adresse: "", type_bien: "", statut: "vacant", type_operation: "", surface: "", bailleur_id: "", notes: "" });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) return;
    if (!form.titre.trim()) return toast.error("Le titre est obligatoire");
    setSaving(true);
    const { error } = await supabase.from("biens").insert({
      titre: form.titre.trim(),
      adresse: form.adresse.trim() || null,
      type_bien: form.type_bien || null,
      statut: form.statut || "vacant",
      type_operation: form.type_operation || null,
      surface: form.surface ? Number(form.surface) : null,
      bailleur_id: form.bailleur_id || null,
      notes: form.notes.trim() || null,
      gestionnaire_id: userId,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Bien ajouté");
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
          <Button variant="outline" size="sm" asChild>
            <Link to="/dashboard">
              <ArrowLeft className="mr-2 h-4 w-4" /> Tableau de bord
            </Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10">
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle>Biens</CardTitle>
              <CardDescription>Liste des biens visibles selon votre rôle.</CardDescription>
            </div>
            <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) resetForm(); }}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="mr-2 h-4 w-4" /> Nouveau bien
                </Button>
              </DialogTrigger>
              <DialogContent>
                <form onSubmit={handleCreate}>
                  <DialogHeader>
                    <DialogTitle>Nouveau bien</DialogTitle>
                    <DialogDescription>Ajouter un bien à votre portefeuille.</DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                      <Label htmlFor="titre">Titre *</Label>
                      <Input id="titre" value={form.titre} onChange={(e) => setForm({ ...form, titre: e.target.value })} required />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="adresse">Adresse</Label>
                      <Input id="adresse" value={form.adresse} onChange={(e) => setForm({ ...form, adresse: e.target.value })} />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="grid gap-2">
                        <Label>Type de bien</Label>
                        <Select value={form.type_bien} onValueChange={(v) => setForm({ ...form, type_bien: v })}>
                          <SelectTrigger><SelectValue placeholder="Sélectionner..." /></SelectTrigger>
                          <SelectContent>
                            {TYPES_BIEN.map((t) => (
                              <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid gap-2">
                        <Label>Statut</Label>
                        <Select value={form.statut} onValueChange={(v) => setForm({ ...form, statut: v })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {STATUTS.map((t) => (
                              <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="grid gap-2">
                        <Label>Opération</Label>
                        <Select value={form.type_operation} onValueChange={(v) => setForm({ ...form, type_operation: v })}>
                          <SelectTrigger><SelectValue placeholder="Sélectionner..." /></SelectTrigger>
                          <SelectContent>
                            {OPERATIONS.map((t) => (
                              <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="surface">Surface (m²)</Label>
                        <Input id="surface" type="number" min="0" step="0.01" value={form.surface} onChange={(e) => setForm({ ...form, surface: e.target.value })} />
                      </div>
                    </div>
                    <div className="grid gap-2">
                      <Label>Bailleur</Label>
                      <Select value={form.bailleur_id} onValueChange={(v) => setForm({ ...form, bailleur_id: v })}>
                        <SelectTrigger>
                          <SelectValue placeholder={bailleurs.length ? "Sélectionner un bailleur..." : "Aucun bailleur disponible"} />
                        </SelectTrigger>
                        <SelectContent>
                          {bailleurs.map((b) => (
                            <SelectItem key={b.id} value={b.id}>
                              {b.nom}{b.prenom ? ` ${b.prenom}` : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="notes">Notes</Label>
                      <Textarea id="notes" rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
                    <Button type="submit" disabled={saving}>{saving ? "Enregistrement..." : "Enregistrer"}</Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-muted-foreground">Chargement...</p>
            ) : biens.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun bien.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Titre</TableHead>
                      <TableHead>Adresse</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Statut</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {biens.map((b) => (
                      <TableRow key={b.id}>
                        <TableCell className="font-medium">
                          <Link to="/biens/$bienId" params={{ bienId: b.id }} className="hover:underline">
                            {b.titre}
                          </Link>
                        </TableCell>
                        <TableCell>{b.adresse ?? "—"}</TableCell>
                        <TableCell>
                          {b.type_bien ? (
                            <Badge variant="outline">{TYPE_BIEN_LABEL[b.type_bien] ?? b.type_bien}</Badge>
                          ) : "—"}
                        </TableCell>
                        <TableCell>
                          <Badge>{STATUT_LABEL[b.statut] ?? b.statut}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
