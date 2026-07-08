import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import Papa from "papaparse";
import { toast } from "sonner";
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle, XCircle } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/imports")({
  head: () => ({
    meta: [
      { title: "Import CSV — GEM Immobilier" },
      { name: "description", content: "Importer des contacts, biens ou contrats depuis un fichier CSV." },
    ],
  }),
  component: ImportsPage,
});

type ImportType = "contacts" | "biens" | "contrats";

const IGNORE = "__ignore__";

const TARGET_FIELDS: Record<ImportType, { key: string; label: string; required?: boolean }[]> = {
  contacts: [
    { key: "nom", label: "Nom", required: true },
    { key: "prenom", label: "Prénom" },
    { key: "telephone", label: "Téléphone" },
    { key: "email", label: "Email" },
    { key: "type_contact", label: "Type (bailleur/locataire/prospect/prestataire)" },
    { key: "notes", label: "Notes" },
    { key: "id_externe", label: "Identifiant externe" },
  ],
  biens: [
    { key: "titre", label: "Titre", required: true },
    { key: "adresse", label: "Adresse" },
    { key: "type_bien", label: "Type (appartement/maison/local_commercial/terrain)" },
    { key: "statut", label: "Statut (loue/vacant/en_travaux)" },
    { key: "type_operation", label: "Type d'opération (location/vente)" },
    { key: "surface", label: "Surface (m²)" },
    { key: "notes", label: "Notes" },
    { key: "id_externe", label: "Identifiant externe" },
  ],
  contrats: [
    { key: "bien_titre", label: "Titre du bien", required: true },
    { key: "locataire_nom", label: "Nom du locataire", required: true },
    { key: "loyer_mensuel", label: "Loyer mensuel", required: true },
    { key: "date_entree", label: "Date d'entrée (AAAA-MM-JJ)", required: true },
  ],
};

type ImportRow = {
  id: string;
  type_import: string;
  nom_fichier: string;
  nombre_lignes: number;
  nombre_succes: number;
  nombre_erreurs: number;
  created_at: string;
};

type ContratPreviewRow = {
  index: number;
  bien_titre: string;
  locataire_nom: string;
  loyer_mensuel: string;
  date_entree: string;
  bien_id?: string;
  locataire_id?: string;
  ok: boolean;
  motif?: string;
};

function ImportsPage() {
  const [checkingRole, setCheckingRole] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  const [type, setType] = useState<ImportType>("contacts");
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [importing, setImporting] = useState(false);
  const [history, setHistory] = useState<ImportRow[]>([]);
  const [contratPreview, setContratPreview] = useState<ContratPreviewRow[]>([]);
  const [resolvingContrats, setResolvingContrats] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      const user = u.user;
      setUserId(user?.id ?? null);
      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .maybeSingle();
        setIsAdmin(profile?.role === "admin");
      }
      setCheckingRole(false);
    })();
  }, []);

  const loadHistory = async () => {
    const { data, error } = await supabase
      .from("imports")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    if (!error && data) setHistory(data as ImportRow[]);
  };

  useEffect(() => {
    if (isAdmin) loadHistory();
  }, [isAdmin]);

  const targets = TARGET_FIELDS[type];

  const resetFile = () => {
    setFileName("");
    setHeaders([]);
    setRows([]);
    setMapping({});
    setContratPreview([]);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleFile = (file: File) => {
    setFileName(file.name);
    setContratPreview([]);
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        const parsedRows = (result.data ?? []).filter((r) =>
          Object.values(r).some((v) => v != null && String(v).trim() !== ""),
        );
        const hdrs = result.meta.fields ?? [];
        setHeaders(hdrs);
        setRows(parsedRows);
        const initial: Record<string, string> = {};
        targets.forEach((t) => {
          const match = hdrs.find(
            (h) => h.trim().toLowerCase() === t.key.toLowerCase() ||
              h.trim().toLowerCase() === t.label.toLowerCase(),
          );
          initial[t.key] = match ?? IGNORE;
        });
        setMapping(initial);
      },
      error: (err) => {
        toast.error(`Erreur de lecture CSV : ${err.message}`);
      },
    });
  };

  const preview = useMemo(() => rows.slice(0, 5), [rows]);

  // Resolve contrats preview whenever mapping/rows change for the contrats type
  useEffect(() => {
    if (type !== "contrats" || rows.length === 0) {
      setContratPreview([]);
      return;
    }
    const required = ["bien_titre", "locataire_nom", "loyer_mensuel", "date_entree"];
    if (required.some((k) => !mapping[k] || mapping[k] === IGNORE)) {
      setContratPreview([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setResolvingContrats(true);
      const bienTitres = new Set<string>();
      const locataireNoms = new Set<string>();
      rows.forEach((r) => {
        const b = String(r[mapping.bien_titre] ?? "").trim();
        const l = String(r[mapping.locataire_nom] ?? "").trim();
        if (b) bienTitres.add(b);
        if (l) locataireNoms.add(l);
      });

      const [{ data: biens }, { data: contacts }] = await Promise.all([
        bienTitres.size > 0
          ? supabase.from("biens").select("id, titre").in("titre", Array.from(bienTitres))
          : Promise.resolve({ data: [] as { id: string; titre: string }[] }),
        locataireNoms.size > 0
          ? supabase
              .from("contacts")
              .select("id, nom, prenom, type_contact")
              .eq("type_contact", "locataire")
          : Promise.resolve({ data: [] as { id: string; nom: string; prenom: string | null; type_contact: string }[] }),
      ]);

      if (cancelled) return;

      const bienMap = new Map<string, string>();
      (biens ?? []).forEach((b) => bienMap.set(b.titre, b.id));
      const normalize = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
      const locataireMap = new Map<string, string>();
      (contacts ?? []).forEach((c) => {
        const full = `${c.nom ?? ""} ${c.prenom ?? ""}`;
        locataireMap.set(normalize(full), c.id);
      });

      const result: ContratPreviewRow[] = rows.map((r, i) => {
        const bien_titre = String(r[mapping.bien_titre] ?? "").trim();
        const locataire_nom = String(r[mapping.locataire_nom] ?? "").trim();
        const loyer_mensuel = String(r[mapping.loyer_mensuel] ?? "").trim();
        const date_entree = String(r[mapping.date_entree] ?? "").trim();
        const bien_id = bienMap.get(bien_titre);
        const locataire_id = locataireMap.get(locataire_nom);
        let ok = true;
        let motif: string | undefined;
        if (!bien_id) {
          ok = false;
          motif = "bien non trouvé";
        } else if (!locataire_id) {
          ok = false;
          motif = "locataire non trouvé";
        }
        return { index: i, bien_titre, locataire_nom, loyer_mensuel, date_entree, bien_id, locataire_id, ok, motif };
      });
      setContratPreview(result);
      setResolvingContrats(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [type, rows, mapping]);

  const contratStats = useMemo(() => {
    const ok = contratPreview.filter((r) => r.ok).length;
    return { ok, ko: contratPreview.length - ok };
  }, [contratPreview]);

  const handleImport = async () => {
    if (!userId) return;
    if (rows.length === 0) return toast.error("Aucune ligne à importer.");
    const requiredMissing = targets
      .filter((t) => t.required && (!mapping[t.key] || mapping[t.key] === IGNORE))
      .map((t) => t.label);
    if (requiredMissing.length > 0) {
      return toast.error(`Champ obligatoire non mappé : ${requiredMissing.join(", ")}`);
    }

    setImporting(true);
    let succes = 0;
    let errors = 0;

    if (type === "contrats") {
      const toInsert = contratPreview
        .filter((r) => r.ok)
        .map((r) => {
          const loyer = Number(r.loyer_mensuel.replace(",", "."));
          return {
            bien_id: r.bien_id!,
            locataire_id: r.locataire_id!,
            loyer_mensuel: Number.isNaN(loyer) ? null : loyer,
            date_debut: r.date_entree || null,
            statut: "actif",
          };
        });
      errors = contratPreview.filter((r) => !r.ok).length;

      if (toInsert.length > 0) {
        const chunkSize = 200;
        for (let i = 0; i < toInsert.length; i += chunkSize) {
          const chunk = toInsert.slice(i, i + chunkSize);
          const { error, data } = await supabase.from("contrats").insert(chunk).select("id");
          if (error) {
            errors += chunk.length;
          } else {
            succes += data?.length ?? chunk.length;
          }
        }
      }
    } else {
      const payload: Record<string, unknown>[] = [];
      for (const row of rows) {
        const record: Record<string, unknown> = {
          source: "import_manuel",
          gestionnaire_id: userId,
        };
        let valid = true;
        for (const t of targets) {
          const col = mapping[t.key];
          if (!col || col === IGNORE) continue;
          const raw = row[col];
          const val = raw == null ? "" : String(raw).trim();
          if (t.required && !val) {
            valid = false;
            break;
          }
          if (!val) continue;
          if (t.key === "surface") {
            const n = Number(val.replace(",", "."));
            if (!Number.isNaN(n)) record[t.key] = n;
          } else {
            record[t.key] = val;
          }
        }
        if (valid) payload.push(record);
        else errors++;
      }

      if (payload.length > 0) {
        const chunkSize = 200;
        for (let i = 0; i < payload.length; i += chunkSize) {
          const chunk = payload.slice(i, i + chunkSize);
          const { error, data } = await supabase
            .from(type)
            .insert(chunk as never)
            .select("id");
          if (error) {
            errors += chunk.length;
          } else {
            succes += data?.length ?? chunk.length;
          }
        }
      }
    }

    const { error: historyError } = await supabase.from("imports").insert({
      type_import: type,
      nom_fichier: fileName,
      nombre_lignes: rows.length,
      nombre_succes: succes,
      nombre_erreurs: errors,
      importe_par: userId,
    });

    setImporting(false);

    if (historyError) {
      toast.error(`Import terminé mais l'historique n'a pas pu être enregistré : ${historyError.message}`);
    } else if (errors === 0) {
      toast.success(`Import réussi : ${succes} ligne(s).`);
    } else {
      toast.warning(`Import terminé : ${succes} succès, ${errors} erreur(s).`);
    }

    resetFile();
    loadHistory();
  };

  if (checkingRole) {
    return (
      <div className="mx-auto max-w-6xl px-8 py-10">
        <p className="text-sm text-muted-foreground">Chargement...</p>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-6xl px-8 py-10">
        <Card>
          <CardHeader>
            <CardTitle>Accès restreint</CardTitle>
            <CardDescription>
              Seuls les administrateurs peuvent accéder à cette page.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-8 py-10 space-y-6">
      <div>
        <h1 className="text-2xl">Import CSV</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Importer des contacts, des biens ou des contrats à partir d'un fichier CSV.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">1. Choisir le type et le fichier</CardTitle>
          <CardDescription>Sélectionnez le type d'import puis chargez votre CSV.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Type d'import</Label>
              <Select
                value={type}
                onValueChange={(v) => {
                  setType(v as ImportType);
                  resetFile();
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="contacts">Contacts</SelectItem>
                  <SelectItem value="biens">Biens</SelectItem>
                  <SelectItem value="contrats">Contrats</SelectItem>
                </SelectContent>
              </Select>
              {type === "contrats" && (
                <p className="text-xs text-muted-foreground">
                  Colonnes attendues : <code>bien_titre</code>, <code>locataire_nom</code>,{" "}
                  <code>loyer_mensuel</code>, <code>date_entree</code>. Les biens et locataires
                  doivent déjà exister (correspondance exacte).
                </p>
              )}
            </div>
            <div className="grid gap-2">
              <Label>Fichier CSV</Label>
              <div className="flex items-center gap-2">
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFile(f);
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileRef.current?.click()}
                >
                  <Upload className="mr-2 h-4 w-4" />
                  {fileName || "Choisir un fichier"}
                </Button>
                {fileName && (
                  <Button type="button" variant="ghost" size="sm" onClick={resetFile}>
                    Retirer
                  </Button>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {headers.length > 0 && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">2. Correspondance des colonnes</CardTitle>
              <CardDescription>
                Associez chaque champ cible à une colonne de votre fichier.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2">
                {targets.map((t) => (
                  <div key={t.key} className="grid gap-2">
                    <Label>
                      {t.label}
                      {t.required && <span className="ml-1 text-primary">*</span>}
                    </Label>
                    <Select
                      value={mapping[t.key] ?? IGNORE}
                      onValueChange={(v) => setMapping({ ...mapping, [t.key]: v })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={IGNORE}>— Ignorer —</SelectItem>
                        {headers.map((h) => (
                          <SelectItem key={h} value={h}>
                            {h}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {type === "contrats" ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">3. Aperçu des correspondances</CardTitle>
                <CardDescription>
                  {resolvingContrats
                    ? "Recherche des biens et locataires..."
                    : `${rows.length} ligne(s) — ${contratStats.ok} à importer, ${contratStats.ko} rejetée(s).`}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10">#</TableHead>
                        <TableHead>Bien</TableHead>
                        <TableHead>Locataire</TableHead>
                        <TableHead>Loyer</TableHead>
                        <TableHead>Date d'entrée</TableHead>
                        <TableHead>Statut</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {contratPreview.map((r) => (
                        <TableRow key={r.index} className={r.ok ? "" : "bg-destructive/5"}>
                          <TableCell className="text-sm text-muted-foreground">{r.index + 1}</TableCell>
                          <TableCell className="text-sm">{r.bien_titre || "—"}</TableCell>
                          <TableCell className="text-sm">{r.locataire_nom || "—"}</TableCell>
                          <TableCell className="text-sm">{r.loyer_mensuel || "—"}</TableCell>
                          <TableCell className="text-sm">{r.date_entree || "—"}</TableCell>
                          <TableCell>
                            {r.ok ? (
                              <span className="inline-flex items-center gap-1 text-primary text-sm">
                                <CheckCircle2 className="h-4 w-4" /> À importer
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-destructive text-sm">
                                <XCircle className="h-4 w-4" /> Rejetée — {r.motif}
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <div className="mt-4 flex justify-end">
                  <Button
                    onClick={handleImport}
                    disabled={importing || resolvingContrats || contratStats.ok === 0}
                  >
                    {importing
                      ? "Import en cours..."
                      : `Confirmer l'import (${contratStats.ok})`}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">3. Aperçu (5 premières lignes)</CardTitle>
                <CardDescription>
                  {rows.length} ligne(s) détectée(s) dans le fichier.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {headers.map((h) => (
                          <TableHead key={h}>{h}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {preview.map((r, i) => (
                        <TableRow key={i}>
                          {headers.map((h) => (
                            <TableCell key={h} className="text-sm">
                              {r[h] ?? ""}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <div className="mt-4 flex justify-end">
                  <Button onClick={handleImport} disabled={importing}>
                    {importing ? "Import en cours..." : "Confirmer l'import"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Historique des imports</CardTitle>
          <CardDescription>50 imports les plus récents.</CardDescription>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <FileSpreadsheet className="h-8 w-8 text-muted-foreground/60" />
              <p className="mt-3 text-sm text-muted-foreground">
                Aucun import pour le moment. Chargez un CSV pour commencer.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Fichier</TableHead>
                    <TableHead className="text-right">Lignes</TableHead>
                    <TableHead className="text-right">Succès</TableHead>
                    <TableHead className="text-right">Erreurs</TableHead>
                    <TableHead>Statut</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.map((h) => (
                    <TableRow key={h.id}>
                      <TableCell className="text-sm">
                        {new Date(h.created_at).toLocaleString("fr-FR")}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{h.type_import}</Badge>
                      </TableCell>
                      <TableCell className="text-sm">{h.nom_fichier}</TableCell>
                      <TableCell className="text-right">{h.nombre_lignes}</TableCell>
                      <TableCell className="text-right text-primary font-medium">
                        {h.nombre_succes}
                      </TableCell>
                      <TableCell className="text-right">
                        {h.nombre_erreurs > 0 ? (
                          <span className="text-destructive font-medium">{h.nombre_erreurs}</span>
                        ) : (
                          "0"
                        )}
                      </TableCell>
                      <TableCell>
                        {h.nombre_erreurs === 0 ? (
                          <span className="inline-flex items-center gap-1 text-primary text-sm">
                            <CheckCircle2 className="h-4 w-4" /> OK
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-destructive text-sm">
                            <AlertCircle className="h-4 w-4" /> Partiel
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
