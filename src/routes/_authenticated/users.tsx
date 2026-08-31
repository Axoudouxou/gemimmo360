import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Building2, ArrowLeft, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { adminSetUserPassword } from "@/lib/admin-users.functions";

export const Route = createFileRoute("/_authenticated/users")({
  head: () => ({
    meta: [
      { title: "Gestion des utilisateurs — Agence Immobilière" },
      { name: "description", content: "Administration des comptes et des rôles internes." },
    ],
  }),
  beforeLoad: async () => {
    const { data: userRes } = await supabase.auth.getUser();
    const user = userRes.user;
    if (!user) throw redirect({ to: "/auth" });
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    if (profile?.role !== "admin") throw redirect({ to: "/dashboard" });
  },
  component: UsersPage,
});

const ROLES = [
  { value: "admin", label: "Administrateur" },
  { value: "direction", label: "Direction" },
  { value: "gestion_locative", label: "Gestion locative" },
  { value: "recouvrement", label: "Recouvrement" },
  { value: "technique", label: "Technique" },
  { value: "technico_commercial", label: "Technico-commercial" },
  { value: "juridique", label: "Juridique" },
  { value: "commercial", label: "Commercial" },
  { value: "inactif", label: "Inactif (accès révoqué)" },
] as const;

const ROLE_LABEL: Record<string, string> = Object.fromEntries(ROLES.map((r) => [r.value, r.label]));

type Profile = {
  id: string;
  email: string | null;
  role: string;
  created_at: string;
};

function PasswordDialog({
  profile,
  onDone,
}: {
  profile: Profile;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const setPwd = useServerFn(adminSetUserPassword);

  const submit = async () => {
    if (password.length < 8) {
      toast.error("Le mot de passe doit contenir au moins 8 caractères.");
      return;
    }
    setBusy(true);
    try {
      await setPwd({ data: { userId: profile.id, password } });
      toast.success("Mot de passe défini");
      setPassword("");
      setOpen(false);
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <KeyRound className="mr-2 h-4 w-4" /> Mot de passe
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Définir un mot de passe temporaire</DialogTitle>
          <DialogDescription>
            Pour {profile.email}. Communiquez-le à l'utilisateur en toute sécurité ; il pourra le
            modifier ensuite depuis son compte.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Input
            type="text"
            placeholder="Nouveau mot de passe (min. 8 caractères)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setPassword("Gem2026Temp!")}
            >
              Utiliser « Gem2026Temp! »
            </Button>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
            Annuler
          </Button>
          <Button onClick={submit} disabled={busy || password.length < 8}>
            {busy ? "Enregistrement..." : "Définir"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function UsersPage() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data: userRes } = await supabase.auth.getUser();
    setCurrentUserId(userRes.user?.id ?? null);
    const { data, error } = await supabase
      .from("profiles")
      .select("id, email, role, created_at")
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    else setProfiles((data ?? []) as Profile[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const handleRoleChange = async (id: string, role: string) => {
    setUpdatingId(id);
    const { error } = await supabase.from("profiles").update({ role }).eq("id", id);
    setUpdatingId(null);
    if (error) return toast.error(error.message);
    toast.success("Rôle mis à jour");
    setProfiles((prev) => prev.map((p) => (p.id === id ? { ...p, role } : p)));
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
          <CardHeader>
            <CardTitle>Gestion des utilisateurs</CardTitle>
            <CardDescription>
              Consultez les comptes, modifiez leur rôle ou définissez un mot de passe temporaire.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-muted-foreground">Chargement...</p>
            ) : profiles.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun utilisateur.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Email</TableHead>
                      <TableHead>Rôle actuel</TableHead>
                      <TableHead className="w-[240px]">Modifier le rôle</TableHead>
                      <TableHead className="w-[180px]">Mot de passe</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {profiles.map((p) => {
                      const isSelf = p.id === currentUserId;
                      return (
                        <TableRow key={p.id}>
                          <TableCell className="font-medium">
                            {p.email ?? "—"}
                            {isSelf && (
                              <Badge variant="secondary" className="ml-2">
                                vous
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{ROLE_LABEL[p.role] ?? p.role}</Badge>
                          </TableCell>
                          <TableCell>
                            <Select
                              value={p.role}
                              disabled={updatingId === p.id}
                              onValueChange={(v) => handleRoleChange(p.id, v)}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {ROLES.map((r) => (
                                  <SelectItem key={r.value} value={r.value}>
                                    {r.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            <PasswordDialog profile={p} onDone={load} />
                          </TableCell>
                        </TableRow>
                      );
                    })}
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
