"use client";
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, Upload, FileText, File, Image, Download, Loader2, AlertCircle, PenTool, CheckCircle } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { UploadModal } from "@/components/documents/upload-modal";
import { SignatureDialog } from "@/components/documents/signature-dialog";
import { PlacementDialog } from "@/components/documents/placement-dialog";
import { format } from "date-fns";

const SIG_BADGE: Record<string, { variant: "success" | "warning" | "default" | "destructive"; label: string }> = {
  SIGNED:             { variant: "success",     label: "Signed" },
  PENDING_SIGNATURE:  { variant: "warning",     label: "Pending Signature" },
  DECLINED:           { variant: "destructive", label: "Declined" },
  VIEW_ONLY:          { variant: "default",     label: "View Only" },
  PENDING:            { variant: "warning",     label: "Pending" },
};

export default function DocumentsPage() {
  const [showUpload, setShowUpload] = useState(false);
  const [search, setSearch] = useState("");

  // Request signature state
  const [signDoc, setSignDoc] = useState<{ id: string; name: string } | null>(null);

  // Sign dialog state
  const [signingRecord, setSigningRecord] = useState<{
    id: string;
    documentName: string;
    requesterName: string;
    placements?: string | null;
  } | null>(null);

  const { data: documents, isLoading, error, refetch } = trpc.document.list.useQuery({});
  const { data: pendingSignatures, refetch: refetchPending } = trpc.signature.getPending.useQuery();

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getIcon = (name: string, mimeType: string) => {
    const ext = name.split('.').pop()?.toLowerCase();
    const mime = mimeType.toLowerCase();
    if (ext === 'pdf' || mime.includes('pdf')) return FileText;
    if (['jpg', 'jpeg', 'png', 'webp'].includes(ext || '') || mime.startsWith('image/')) return Image;
    return File;
  };

  const filteredDocuments = documents?.filter(d =>
    d.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Documents</h1>
        <Button onClick={() => setShowUpload(true)}>
          <Upload size={16} className="mr-2" aria-hidden="true" />
          Upload
        </Button>
      </div>

      {/* Pending Signatures Section */}
      {pendingSignatures && pendingSignatures.length > 0 && (
        <Card className="border-amber-200 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-900/10">
          <CardContent className="p-4">
            <h2 className="text-sm font-semibold text-amber-800 dark:text-amber-300 mb-3 flex items-center gap-2">
              <PenTool size={16} />
              Documents Awaiting Your Signature ({pendingSignatures.length})
            </h2>
            <div className="space-y-2">
              {pendingSignatures.map((rec) => (
                <div
                  key={rec.id}
                  className="flex items-center justify-between bg-white dark:bg-charcoal-800 rounded-md p-3 border border-amber-100 dark:border-amber-800"
                >
                  <div>
                    <p className="font-medium text-sm">{rec.document.name}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Requested by {rec.requester.firstName} {rec.requester.lastName} &middot;{" "}
                      {format(new Date(rec.requestedAt), "MMM dd, yyyy")}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    className="gap-1"
                    onClick={() =>
                      setSigningRecord({
                        id: rec.id,
                        documentName: rec.document.name,
                        requesterName: `${rec.requester.firstName} ${rec.requester.lastName}`,
                        placements: (rec as any).placements || null,
                      })
                    }
                  >
                    <PenTool size={14} /> Sign Now
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="relative max-w-sm">
        <label htmlFor="search-documents" className="sr-only">Search documents</label>
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} aria-hidden="true" />
        <Input
          id="search-documents"
          placeholder="Search documents..."
          className="pl-10"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-500 dark:text-gray-300">
            <Loader2 className="animate-spin mb-2" size={32} aria-hidden="true" />
            <p>Loading documents...</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-20 text-destructive bg-destructive/5 rounded-lg border border-destructive/20">
            <AlertCircle size={32} className="mb-2" aria-hidden="true" />
            <p>Error loading documents: {error.message}</p>
            <Button variant="outline" className="mt-4" onClick={() => refetch()}>
              Try Again
            </Button>
          </div>
        ) : filteredDocuments?.length === 0 ? (
          <div className="text-center py-10 text-gray-500 dark:text-gray-300">
            {search ? "No documents match your search." : "No documents found."}
          </div>
        ) : (
          filteredDocuments?.map(d => {
            const Icon = getIcon(d.name, d.mimeType);
            return (
              <Card key={d.id}>
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Icon size={24} className="text-gray-400" aria-hidden="true" />
                    <div>
                      <p className="font-medium">{d.name}</p>
                      <p className="text-sm text-gray-500 dark:text-gray-300">
                        {d.type} &middot; {formatSize(d.fileSize)} &middot; Updated {format(new Date(d.createdAt), 'MMM dd')}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {d.signatureStatus && SIG_BADGE[d.signatureStatus] && (
                      <Badge variant={SIG_BADGE[d.signatureStatus].variant}>
                        {SIG_BADGE[d.signatureStatus].label}
                      </Badge>
                    )}
                    {d.signatureStatus === 'SIGNED' && (
                      <ViewSignedButton documentId={d.id} />
                    )}
                    <Badge variant="outline" className="capitalize">{d.folder}</Badge>
                    {d.type === 'CONTRACT' && d.signatureStatus !== 'SIGNED' && d.signatureStatus !== 'PENDING_SIGNATURE' && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1 text-xs"
                        onClick={() => setSignDoc({ id: d.id, name: d.name })}
                      >
                        <PenTool size={12} /> Send for Signature
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" aria-label={`Download ${d.name}`}>
                      <Download size={16} aria-hidden="true" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      <UploadModal
        open={showUpload}
        onOpenChange={setShowUpload}
        onSuccess={refetch}
      />

      {/* Send for Signature — PlacementDialog with employee picker + PDF placement */}
      <PlacementDialog
        open={!!signDoc}
        onOpenChange={(open) => { if (!open) setSignDoc(null); }}
        documentId={signDoc?.id || ""}
        documentName={signDoc?.name || ""}
        onComplete={() => { setSignDoc(null); refetch(); }}
      />

      {/* Signature capture dialog */}
      <SignatureDialog
        open={!!signingRecord}
        onOpenChange={(open) => { if (!open) setSigningRecord(null); }}
        signatureRecord={signingRecord}
        onComplete={() => {
          setSigningRecord(null);
          refetch();
          refetchPending();
        }}
      />
    </div>
  );
}

/** Small component that fetches the signed PDF URL via the access-controlled tRPC procedure */
function ViewSignedButton({ documentId }: { documentId: string }) {
  const { data: records } = trpc.signature.getByDocument.useQuery({ documentId });
  const signedRecord = records?.find(r => r.status === 'SIGNED');
  const getSignedPdf = trpc.signature.getSignedPdf.useQuery(
    { signatureRecordId: signedRecord?.id ?? '' },
    { enabled: !!signedRecord?.id },
  );

  if (!signedRecord) return null;

  return (
    <Button
      variant="outline"
      size="sm"
      className="gap-1 text-xs text-green-600"
      onClick={() => {
        if (getSignedPdf.data?.url) {
          window.open(getSignedPdf.data.url, '_blank');
        }
      }}
      disabled={!getSignedPdf.data?.url}
    >
      <CheckCircle size={12} /> View Signed
    </Button>
  );
}
