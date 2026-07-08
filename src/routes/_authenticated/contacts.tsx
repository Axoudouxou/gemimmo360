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

export const Route = createFileRoute("/_authenticated/contacts")({
  head: () => ({
    meta: [
      { title: "Contacts — Agence Immobilière" },
      { name: "description", content: "Liste et gestion des contacts de l'agence." },
    ],
  }),
  component: ContactsPage,
});

const TYPES = [
  { value: "bailleur", label: "Bailleur" },
  { value: "locataire", label: "Locataire" },
  { value: "prospect", label: "Prospect" },
  { value: "prestataire", label: "Prestataire" },
] as const;

const TYPE_LABEL: Record<string, string> = Object.fromEntries(TYPES.map((t) => [t.value, t.label]));

type Contact = {
  id: string;
  nom: string;
  prenom: string | null;
  telephone: string | null;
  email: string | null;
  type_contact: string | null;
  gestionnaire_id: string | null;
  notes: string | null;
  created_at: string;
  type_entite: string | null;
  interlocuteur: string | null;
};

function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    nom: "",
    prenom: "",
    telephone: "",
    email: "",
    type_contact: "",
    notes: "",
    type_entite: "personne",
    interlocuteur: "",
  });

  const load = async () => {
    setLoading(true);
    const { data: userRes } = await supabase.auth.getUser();
    setUserId(userRes.user?.id ?? null);
    const { data, error } = await supabase
      .from("contacts")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    else setContacts((data ?? []) as Contact[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const resetForm = () =>
    setForm({ nom: "", prenom: "", telephone: "", email: "", type_contact: "", notes: "", type_entite: "personne", interlocuteur: "" });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) return;
    if (!form.nom.trim()) return toast.error("Le nom est obligatoire");
    setSaving(true);
    const { error } = await supabase.from("contacts").insert({
      nom: form.nom.trim(),
      prenom: form.prenom.trim() || null,
      telephone: form.telephone.trim() || null,
      email: form.email.trim() || null,
      type_contact: form.type_contact || null,
      notes: form.notes.trim() || null,
      type_entite: form.type_entite || "personne",
      interlocuteur: form.type_entite === "entreprise" ? (form.interlocuteur.trim() || null) : null,
      gestionnaire_id: userId,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Contact ajouté");
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
              <CardTitle>Contacts</CardTitle>
              <CardDescription>
                Liste des contacts visibles selon votre rôle.
              </CardDescription>
            </div>
            <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) resetForm(); }}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="mr-2 h-4 w-4" /> Nouveau contact
                </Button>
              </DialogTrigger>
              <DialogContent>
                <form onSubmit={handleCreate}>
                  <DialogHeader>
                    <DialogTitle>Nouveau contact</DialogTitle>
                    <DialogDescription>Ajouter un contact à votre portefeuille.</DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                      <Label htmlFor="nom">Nom *</Label>
                      <Input id="nom" value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} required />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="prenom">Prénom</Label>
                      <Input id="prenom" value={form.prenom} onChange={(e) => setForm({ ...form, prenom: e.target.value })} />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="grid gap-2">
                        <Label htmlFor="telephone">Téléphone</Label>
                        <Input id="telephone" value={form.telephone} onChange={(e) => setForm({ ...form, telephone: e.target.value })} />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="email">Email</Label>
                        <Input id="email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                      </div>
                    </div>
                    <div className="grid gap-2">
                      <Label>Type de contact</Label>
                      <Select value={form.type_contact} onValueChange={(v) => setForm({ ...form, type_contact: v })}>
                        <SelectTrigger><SelectValue placeholder="Sélectionner..." /></SelectTrigger>
                        <SelectContent>
                          {TYPES.map((t) => (
                            <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="grid gap-2">
                        <Label>Type d'entité</Label>
                        <Select value={form.type_entite} onValueChange={(v) => setForm({ ...form, type_entite: v })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="personne">Personne</SelectItem>
                            <SelectItem value="entreprise">Entreprise</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {form.type_entite === "entreprise" && (
                        <div className="grid gap-2">
                          <Label htmlFor="interlocuteur">Interlocuteur</Label>
                          <Input id="interlocuteur" value={form.interlocuteur} onChange={(e) => setForm({ ...form, interlocuteur: e.target.value })} />
                        </div>
                      )}
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
            ) : contacts.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun contact.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nom</TableHead>
                      <TableHead>Prénom</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Téléphone</TableHead>
                      <TableHead>Email</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {contacts.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium">{c.nom}</TableCell>
                        <TableCell>{c.prenom ?? "—"}</TableCell>
                        <TableCell>
                          {c.type_contact ? (
                            <Badge variant="outline">{TYPE_LABEL[c.type_contact] ?? c.type_contact}</Badge>
                          ) : "—"}
                        </TableCell>
                        <TableCell>{c.telephone ?? "—"}</TableCell>
                        <TableCell>{c.email ?? "—"}</TableCell>
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
