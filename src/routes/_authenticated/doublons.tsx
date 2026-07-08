import { createFileRoute, redirect, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Building2, ArrowLeft, AlertTriangle } from "lucide-react";
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

type Impact = { biens: number; contrats: number; transactions: number; reclamations: number };

function DoublonsPage() {
  const navigate = useNavigate();
  const [pairs, setPairs] = useState<Pair[]>([]);
  const [loading, setLoading] = useState(true);

  // Merge dialog state
  const [mergeOpen, setMergeOpen] = useState(false);
  const [activePair, setActivePair] = useState<Pair | null>(null);
  const [keepId, setKeepId] = useState<string>("");
  const [impact, setImpact] = useState<Impact | null>(null);
  const [loadingImpact, setLoadingImpact] = useState(false);
  const [confirmStep, setConfirmStep] = useState(false);
  const [merging, setMerging] = useState(false);

  const load = async () => {
    setLoading(true);
    const [{ data: contacts }, { data: ignored }] = await Promise.all([
      supabase.from("contacts").select("id, nom, prenom, telephone, email, type_contact, type_entite, interlocuteur").eq("archive", false),
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

  const openMerge = (p: Pair) => {
    setActivePair(p);
    setKeepId(p.a.id);
    setImpact(null);
    setConfirmStep(false);
    setMergeOpen(true);
  };

  // Load impact for the contact that will be MERGED (the one not kept)
  useEffect(() => {
    if (!mergeOpen || !activePair || !keepId) return;
    const mergedId = keepId === activePair.a.id ? activePair.b.id : activePair.a.id;
    (async () => {
      setLoadingImpact(true);
      const [biens, contrats, tx, recl] = await Promise.all([
        supabase.from("biens").select("id", { count: "exact", head: true }).eq("bailleur_id", mergedId),
        supabase.from("contrats").select("id", { count: "exact", head: true }).eq("locataire_id", mergedId),
        supabase.from("transactions_commerciales").select("id", { count: "exact", head: true }).eq("contact_id", mergedId),
        supabase.from("reclamations").select("id", { count: "exact", head: true }).eq("locataire_id", mergedId),
      ]);
      setImpact({
        biens: biens.count ?? 0,
        contrats: contrats.count ?? 0,
        transactions: tx.count ?? 0,
        reclamations: recl.count ?? 0,
      });
      setLoadingImpact(false);
    })();
  }, [mergeOpen, keepId, activePair]);

  const doMerge = async () => {
    if (!activePair || !keepId) return;
    const mergedId = keepId === activePair.a.id ? activePair.b.id : activePair.a.id;
    setMerging(true);
    try {
      // Reassign all references
      const updates = await Promise.all([
        supabase.from("biens").update({ bailleur_id: keepId }).eq("bailleur_id", mergedId),
        supabase.from("contrats").update({ locataire_id: keepId }).eq("locataire_id", mergedId),
        supabase.from("transactions_commerciales").update({ contact_id: keepId }).eq("contact_id", mergedId),
        supabase.from("reclamations").update({ locataire_id: keepId }).eq("locataire_id", mergedId),
      ]);
      const firstError = updates.find((r) => r.error)?.error;
      if (firstError) throw firstError;

      // Archive the merged contact
      const { error: archErr } = await supabase
        .from("contacts")
        .update({ archive: true, fusionne_avec_id: keepId })
        .eq("id", mergedId);
      if (archErr) throw archErr;

      toast.success("Fusion effectuée");
      setMergeOpen(false);
      setActivePair(null);
      load();
    } catch (e: any) {
      toast.error(e.message ?? "Erreur lors de la fusion");
    } finally {
      setMerging(false);
    }
  };

  const kept = activePair ? (keepId === activePair.a.id ? activePair.a : activePair.b) : null;
  const merged = activePair ? (keepId === activePair.a.id ? activePair.b : activePair.a) : null;

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
              Paires de contacts avec le même téléphone ou la même combinaison nom + prénom.
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
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => ignorer(p.a.id, p.b.id)}>
                        Ce n'est pas un doublon
                      </Button>
                      <Button size="sm" onClick={() => openMerge(p)}>
                        Fusionner
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      <Dialog open={mergeOpen} onOpenChange={(o) => { setMergeOpen(o); if (!o) { setActivePair(null); setConfirmStep(false); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Fusionner deux contacts</DialogTitle>
            <DialogDescription>
              Choisissez le contact à conserver. L'autre sera archivé et toutes ses références lui seront réattribuées.
            </DialogDescription>
          </DialogHeader>

          {activePair && (
            <div className="space-y-4">
              <RadioGroup value={keepId} onValueChange={(v) => { setKeepId(v); setConfirmStep(false); }}>
                {[activePair.a, activePair.b].map((c) => (
                  <div key={c.id} className="flex items-start gap-3 rounded-md border p-3">
                    <RadioGroupItem value={c.id} id={`keep-${c.id}`} className="mt-1" />
                    <Label htmlFor={`keep-${c.id}`} className="flex-1 cursor-pointer">
                      <div className="font-medium">{displayName(c)}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {c.type_contact ?? "—"} • {c.telephone ?? "—"} • {c.email ?? "—"}
                      </div>
                    </Label>
                  </div>
                ))}
              </RadioGroup>

              <div className="rounded-md border bg-muted/40 p-3 text-sm">
                <div className="font-medium mb-2">Impact de la fusion</div>
                {loadingImpact || !impact ? (
                  <p className="text-muted-foreground text-xs">Calcul en cours...</p>
                ) : (
                  <>
                    <p className="text-xs text-muted-foreground mb-2">
                      Réattribution vers <span className="font-medium text-foreground">{kept ? displayName(kept) : ""}</span> depuis <span className="font-medium text-foreground">{merged ? displayName(merged) : ""}</span> :
                    </p>
                    <ul className="text-xs space-y-1">
                      <li>• Biens (bailleur) : <span className="font-medium">{impact.biens}</span></li>
                      <li>• Contrats (locataire) : <span className="font-medium">{impact.contrats}</span></li>
                      <li>• Transactions commerciales : <span className="font-medium">{impact.transactions}</span></li>
                      <li>• Réclamations (locataire) : <span className="font-medium">{impact.reclamations}</span></li>
                    </ul>
                  </>
                )}
              </div>

              {confirmStep && (
                <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>Es-tu sûr ? Cette action archive le contact fusionné et réattribue ses références. Elle n'est pas automatiquement réversible.</span>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setMergeOpen(false)} disabled={merging}>Annuler</Button>
            {!confirmStep ? (
              <Button onClick={() => setConfirmStep(true)} disabled={loadingImpact || !impact}>
                Confirmer la fusion
              </Button>
            ) : (
              <Button variant="destructive" onClick={doMerge} disabled={merging}>
                {merging ? "Fusion..." : "Oui, fusionner"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
