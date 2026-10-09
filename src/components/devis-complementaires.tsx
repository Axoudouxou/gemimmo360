import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fmtDate, fmtMoney } from "@/lib/travaux-utils";

type Devis = { id: string; libelle: string; montant: number; date_realisation: string | null; created_at: string };
const empty = { libelle: "", montant: "", date_realisation: "" };

export function DevisComplementaires({ travauxId, montantInitial, canEdit }: {
  travauxId: string; montantInitial: number; canEdit: boolean;
}) {
  const [rows, setRows] = useState<Devis[]>([]);
  const [editId, setEditId] = useState<string | "new" | null>(null);
  const [form, setForm] = useState(empty);
  const [busy, setBusy] = useState(false);
  const tbl = () => supabase.from("travaux_devis_complementaires" as never) as any;

  const load = async () => {
    const { data } = await tbl().select("id, libelle, montant, date_realisation, created_at").eq("travaux_id", travauxId).order("created_at");
    setRows((data ?? []) as Devis[]);
  };
  useEffect(() => { load(); }, [travauxId]);

  const save = async () => {
    if (!form.libelle.trim()) return toast.error("Libellé requis");
    const montant = Number(form.montant);
    if (!(montant >= 0) || form.montant === "") return toast.error("Montant invalide");
    setBusy(true);
    const payload = { libelle: form.libelle.trim(), montant, date_realisation: form.date_realisation || null };
    const { data: u } = await supabase.auth.getUser();
    const { error } = editId === "new"
      ? await tbl().insert({ ...payload, travaux_id: travauxId, created_by: u.user?.id ?? null })
      : await tbl().update(payload).eq("id", editId);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(editId === "new" ? "Devis ajouté" : "Devis modifié");
    setEditId(null); setForm(empty); load();
  };

  const remove = async (id: string) => {
    if (!confirm("Supprimer ce devis complémentaire ?")) return;
    const { error } = await tbl().delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Devis supprimé"); load();
  };

  const total = montantInitial + rows.reduce((s, r) => s + Number(r.montant || 0), 0);

  const formUi = (
    <div className="grid gap-2 rounded-md border bg-muted/30 p-2 sm:grid-cols-[1fr_140px_150px]">
      <div className="grid gap-1"><Label className="text-xs">Libellé</Label><Input value={form.libelle} placeholder="ex. Retouches" onChange={(e) => setForm({ ...form, libelle: e.target.value })} /></div>
      <div className="grid gap-1"><Label className="text-xs">Montant (FCFA)</Label><Input type="number" min="0" value={form.montant} onChange={(e) => setForm({ ...form, montant: e.target.value })} /></div>
      <div className="grid gap-1"><Label className="text-xs">Date de réalisation</Label><Input type="date" value={form.date_realisation} onChange={(e) => setForm({ ...form, date_realisation: e.target.value })} /></div>
      <div className="flex gap-2 sm:col-span-3">
        <Button size="sm" onClick={save} disabled={busy}>Enregistrer</Button>
        <Button size="sm" variant="ghost" onClick={() => { setEditId(null); setForm(empty); }}>Annuler</Button>
      </div>
    </div>
  );

  return (
    <section className="rounded-md border p-3">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-sm font-semibold">Devis complémentaires</h4>
        {canEdit && editId === null && (
          <Button size="sm" variant="outline" onClick={() => { setForm(empty); setEditId("new"); }}><Plus className="mr-1 h-4 w-4" />Ajouter un devis</Button>
        )}
      </div>
      {rows.length === 0 && editId !== "new" && <p className="text-xs text-muted-foreground">Aucun devis complémentaire.</p>}
      <ul className="space-y-2">
        {rows.map((r) => editId === r.id ? <li key={r.id}>{formUi}</li> : (
          <li key={r.id} className="flex items-start justify-between gap-2 border-b pb-2 text-sm last:border-0">
            <div>
              <div className="font-medium">{r.libelle} — {fmtMoney(r.montant)}</div>
              <div className="text-xs text-muted-foreground">
                Date de réalisation : {r.date_realisation ? fmtDate(r.date_realisation) : "non renseignée (non prise en compte dans les décomptes)"} · Saisi le {fmtDate(r.created_at)}
              </div>
            </div>
            {canEdit && editId === null && (
              <div className="flex gap-1">
                <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Modifier" onClick={() => { setEditId(r.id); setForm({ libelle: r.libelle, montant: String(r.montant), date_realisation: r.date_realisation ?? "" }); }}><Pencil className="h-4 w-4" /></Button>
                <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Supprimer" onClick={() => remove(r.id)}><Trash2 className="h-4 w-4" /></Button>
              </div>
            )}
          </li>
        ))}
        {editId === "new" && <li>{formUi}</li>}
      </ul>
      <div className="mt-3 flex justify-between border-t pt-2 text-sm font-semibold">
        <span>Total de la fiche (devis initial + complémentaires)</span><span>{fmtMoney(total)}</span>
      </div>
    </section>
  );
}
