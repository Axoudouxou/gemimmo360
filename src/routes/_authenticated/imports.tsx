import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import Papa from "papaparse";
import { toast } from "sonner";
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle } from "lucide-react";

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
      { name: "description", content: "Importer des contacts ou des biens depuis un fichier CSV." },
    ],
  }),
  component: ImportsPage,
});

type ImportType = "contacts" | "biens";

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
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleFile = (file: File) => {
    setFileName(file.name);
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
        // Auto-map by name match
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
    const payload: Record<string, unknown>[] = [];
    let errors = 0;

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

    let succes = 0;
    if (payload.length > 0) {
      // Insert in chunks of 200
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
          Importer des contacts ou des biens à partir d'un fichier CSV.
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
                </SelectContent>
              </Select>
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
