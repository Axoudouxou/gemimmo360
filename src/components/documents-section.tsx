import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Download, Trash2, Upload, FileText } from "lucide-react";
import { toast } from "sonner";

const MAX_SIZE = 15 * 1024 * 1024;

type FileItem = {
  name: string;
  created_at: string | null;
  metadata?: { size?: number } | null;
};

export function DocumentsSection({
  bucket,
  recordId,
  canWrite,
  title = "Documents",
  description = "Fichiers PDF joints à cette fiche.",
}: {
  bucket: string;
  recordId: string;
  canWrite: boolean;
  title?: string;
  description?: string;
}) {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.storage.from(bucket).list(recordId, {
      sortBy: { column: "created_at", order: "desc" },
    });
    if (error) toast.error(error.message);
    setFiles((data ?? []).filter((f) => f.name !== ".emptyFolderPlaceholder") as FileItem[]);
    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [bucket, recordId]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      return toast.error("Seuls les fichiers PDF sont acceptés");
    }
    if (file.size > MAX_SIZE) return toast.error("Fichier trop volumineux (max 15 Mo)");
    setUploading(true);
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${recordId}/${Date.now()}_${safeName}`;
    const { error } = await supabase.storage.from(bucket).upload(path, file, {
      contentType: "application/pdf",
      upsert: false,
    });
    setUploading(false);
    if (error) return toast.error(error.message);
    toast.success("Document ajouté");
    load();
  };

  const handleDownload = async (name: string) => {
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(`${recordId}/${name}`, 60);
    if (error || !data) return toast.error(error?.message ?? "Erreur");
    window.open(data.signedUrl, "_blank");
  };

  const handleDelete = async (name: string) => {
    if (!confirm(`Supprimer "${displayName(name)}" ?`)) return;
    const { error } = await supabase.storage.from(bucket).remove([`${recordId}/${name}`]);
    if (error) return toast.error(error.message);
    toast.success("Document supprimé");
    load();
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        {canWrite && (
          <>
            <input ref={inputRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={handleFileChange} />
            <Button size="sm" onClick={() => inputRef.current?.click()} disabled={uploading}>
              <Upload className="mr-2 h-4 w-4" /> {uploading ? "Envoi..." : "Ajouter un PDF"}
            </Button>
          </>
        )}
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Chargement...</p>
        ) : files.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun document.</p>
        ) : (
          <ul className="divide-y">
            {files.map((f) => (
              <li key={f.name} className="flex items-center justify-between gap-3 py-2">
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{displayName(f.name)}</p>
                    <p className="text-xs text-muted-foreground">
                      {f.created_at ? new Date(f.created_at).toLocaleString("fr-FR") : "—"}
                      {f.metadata?.size ? ` • ${(f.metadata.size / 1024 / 1024).toFixed(2)} Mo` : ""}
                    </p>
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button size="sm" variant="ghost" onClick={() => handleDownload(f.name)}>
                    <Download className="h-4 w-4" />
                  </Button>
                  {canWrite && (
                    <Button size="sm" variant="ghost" onClick={() => handleDelete(f.name)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-muted-foreground">PDF uniquement, 15 Mo maximum par fichier.</p>
      </CardContent>
    </Card>
  );
}

function displayName(stored: string) {
  return stored.replace(/^\d+_/, "");
}
