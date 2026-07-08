import { createFileRoute, redirect, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Building2, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/doublons")({
  head: () => ({ meta: [{ title: "Doublons de contacts — Agence Immobilière" }] }),
  beforeLoad: async () => {
    const { data: userRes } = await supabase.auth.getUser();
    if (!userRes.user) throw redirect({ to: "/auth" });
    const { data: p } = await supabase.from("profiles").select("role").eq("id", userRes.user.id).maybeSingle();
    if (p?.role !== "admin") throw redirect({ to: "/dashboard" });
  },
  component: DoublonsPage,
});

type Contact = {
  id: string; nom: string; prenom: string | null; telephone: string | null; email: string | null;
  type_contact: string | null; type_entite: string | null; interlocuteur: string | null;
};
type Pair = { a: Contact; b: Contact; raison: string };

const displayName = (c: Contact) =>
  c.type_entite === "entreprise" ? `${c.nom}${c.interlocuteur ? ` — ${c.interlocuteur}` : ""}` : `${c.nom}${c.prenom ? ` ${c.prenom}` : ""}`;

const normalize = (s: string | null) => (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

function DoublonsPage() {
  const navigate = useNavigate();
  const [pairs, setPairs] = useState<Pair[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const [{ data: contacts }, { data: ignored }] = await Promise.all([
      supabase.from("contacts").select("id, nom, prenom, telephone, email, type_contact, type_entite, interlocuteur"),
      supabase.from("contact_doublons_ignores").select("contact_a_id, contact_b_id"),
    ]);
    const ignoreSet = new Set<string>();
    (ignored ?? []).forEach((r: any) => ignoreSet.add(pairKey(r.contact_a_id, r.contact_b_id)));

    const list = (contacts ?? []) as Contact[];
    const byPhone = new Map<string, Contact[]>();
    const byName = new Map<string, Contact[]>();
    for (const c of list) {
      const tel = normalize(c.telephone).replace(/[^0-9+]/g, "");
      if (tel) byPhone.set(tel, [...(byPhone.get(tel) ?? []), c]);
      const nm = `${normalize(c.nom)}|${normalize(c.prenom)}`;
      if (normalize(c.nom)) byName.set(nm, [...(byName.get(nm) ?? []), c]);
    }

    const seen = new Set<string>();
    const out: Pair[] = [];
    const add = (arr: Contact[], raison: string) => {
      for (let i = 0; i < arr.length; i++) {
        for (let j = i + 1; j < arr.length; j++) {
          const k = pairKey(arr[i].id, arr[j].id);
          if (seen.has(k) || ignoreSet.has(k)) continue;
          seen.add(k);
          out.push({ a: arr[i], b: arr[j], raison });
        }
      }
    };
    byPhone.forEach((arr) => arr.length > 1 && add(arr, "Même téléphone"));
    byName.forEach((arr) => arr.length > 1 && add(arr, "Même nom + prénom"));
    setPairs(out);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const ignorer = async (a: string, b: string) => {
    const [ca, cb] = a < b ? [a, b] : [b, a];
    const { error } = await supabase.from("contact_doublons_ignores").insert({ contact_a_id: ca, contact_b_id: cb });
    if (error) return toast.error(error.message);
    toast.success("Paire ignorée");
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
            <Link to="/dashboard"><ArrowLeft className="mr-2 h-4 w-4" /> Tableau de bord</Link>
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-10">
        <Card>
          <CardHeader>
            <CardTitle>Doublons potentiels</CardTitle>
            <CardDescription>
              Paires de contacts avec le même téléphone ou la même combinaison nom + prénom. La fusion reste manuelle.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-muted-foreground">Analyse en cours...</p>
            ) : pairs.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun doublon détecté.</p>
            ) : (
              <div className="space-y-3">
                {pairs.map((p) => (
                  <div key={p.a.id + p.b.id} className="rounded-md border p-4 space-y-3">
                    <Badge variant="outline">{p.raison}</Badge>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {[p.a, p.b].map((c) => (
                        <div key={c.id} className="rounded-md bg-muted/50 p-3 text-sm">
                          <div className="font-medium">
                            <button className="underline" onClick={() => navigate({ to: "/contacts/$contactId", params: { contactId: c.id } })}>
                              {displayName(c)}
                            </button>
                          </div>
                          <div className="text-muted-foreground text-xs mt-1">
                            {c.type_contact ?? "—"} • {c.telephone ?? "—"} • {c.email ?? "—"}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="flex justify-end">
                      <Button variant="outline" size="sm" onClick={() => ignorer(p.a.id, p.b.id)}>
                        Ce n'est pas un doublon
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
