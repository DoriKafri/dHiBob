"use client";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertCircle } from "lucide-react";

interface UploadModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function UploadModal({ open, onOpenChange, onSuccess }: UploadModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [folder, setFolder] = useState("policies");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setError(null);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('folder', folder);

    try {
      const res = await fetch('/api/documents/upload', { method: 'POST', body: formData });
      if (res.ok) {
        onSuccess();
        onOpenChange(false);
        setFile(null);
      } else {
        const data = await res.json();
        setError(data.error || "Failed to upload document");
      }
    } catch (err) {
      setError("An unexpected error occurred during upload");
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-charcoal-900 text-white border-charcoal-700">
        <DialogHeader><DialogTitle className="text-white">Upload Document</DialogTitle></DialogHeader>
        <div className="space-y-4 py-4">
          {error && (
            <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md flex items-center gap-2">
              <AlertCircle size={16} aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}
          <div className="space-y-2">
            <label htmlFor="file-upload" className="text-sm font-medium text-gray-300">File</label>
            <Input 
              id="file-upload"
              type="file" 
              className="bg-charcoal-800 border-charcoal-700 text-white file:text-white"
              onChange={(e) => {
                setFile(e.target.files?.[0] || null);
                setError(null);
              }} 
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="folder-select" className="text-sm font-medium text-gray-300">Category</label>
            <Select onValueChange={setFolder} defaultValue="policies">
              <SelectTrigger id="folder-select" className="bg-charcoal-800 border-charcoal-700 text-white"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-charcoal-800 border-charcoal-700 text-white">
                <SelectItem value="policies" className="focus:bg-charcoal-700 focus:text-white">Policies</SelectItem>
                <SelectItem value="benefits" className="focus:bg-charcoal-700 focus:text-white">Benefits</SelectItem>
                <SelectItem value="contracts" className="focus:bg-charcoal-700 focus:text-white">Contracts</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button className="w-full" onClick={handleUpload} disabled={!file || uploading}>
            {uploading ? "Uploading..." : "Upload"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
