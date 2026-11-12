"use client";

import { useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  FileText,
  Maximize2,
  Minimize2,
  Upload,
  ZoomIn,
  ZoomOut,
  Eye,
} from "lucide-react";
import { apiClient } from "@/lib/api-client";
import { DocumentResponse } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface PdfViewerProps {
  document: DocumentResponse | null;
  onDocumentChange?: (doc: DocumentResponse) => void;
  currentPage?: number;
  onPageChange?: (page: number) => void;
}

export function PdfViewer({
  document,
  onDocumentChange,
  currentPage = 0,
  onPageChange,
}: PdfViewerProps) {
  const [zoom, setZoom] = useState<number>(100);
  const [isIframeView, setIsIframeView] = useState<boolean>(false);
  const [uploading, setUploading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);
    try {
      const doc = await apiClient.uploadDocument(file);
      onDocumentChange?.(doc);
      onPageChange?.(0);
    } catch (err: any) {
      setError(err?.message || "Failed to upload document");
    } finally {
      setUploading(false);
    }
  };

  const handlePrevPage = () => {
    if (currentPage > 0) {
      onPageChange?.(currentPage - 1);
    }
  };

  const handleNextPage = () => {
    if (document && currentPage < document.page_count - 1) {
      onPageChange?.(currentPage + 1);
    }
  };

  if (!document) {
    return (
      <div className="flex h-full min-h-[480px] w-full flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center dark:border-slate-800 dark:bg-slate-900">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400">
          <Upload className="h-6 w-6" />
        </div>
        <h3 className="mt-4 text-sm font-semibold text-slate-800 dark:text-slate-200">
          Upload PDF or Image
        </h3>
        <p className="mt-1 max-w-xs text-xs text-slate-500 dark:text-slate-400">
          Upload multi-page invoices, receipts, or forms (up to 50 MB, 20 pages).
        </p>

        {error && (
          <p className="mt-2 text-xs font-medium text-red-500">{error}</p>
        )}

        <label className="mt-5 cursor-pointer">
          <Button
            variant="default"
            size="sm"
            disabled={uploading}
            className="pointer-events-none"
          >
            {uploading ? "Uploading & Rendering..." : "Choose Document"}
          </Button>
          <input
            type="file"
            className="hidden"
            accept=".pdf,image/png,image/jpeg,image/webp"
            onChange={handleFileUpload}
            disabled={uploading}
          />
        </label>
      </div>
    );
  }

  const pageImageUrl = apiClient.getPageImageUrl(document.id, currentPage);
  const fileUrl = apiClient.getDocumentFileUrl(document.id);

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
      {/* Top Controls Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs dark:border-slate-800 dark:bg-slate-950">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
          <span className="max-w-[140px] truncate font-medium text-slate-800 dark:text-slate-200" title={document.filename}>
            {document.filename}
          </span>
          <Badge variant="outline" className="text-[10px] py-0 px-1.5">
            {document.page_count} {document.page_count === 1 ? "page" : "pages"}
          </Badge>
        </div>

        {/* Page navigation */}
        {!isIframeView && document.page_count > 1 && (
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="iconXs"
              onClick={handlePrevPage}
              disabled={currentPage <= 0}
            >
              <ChevronLeft className="h-3 w-3" />
            </Button>
            <span className="px-1 text-slate-600 dark:text-slate-400">
              {currentPage + 1} / {document.page_count}
            </span>
            <Button
              variant="outline"
              size="iconXs"
              onClick={handleNextPage}
              disabled={currentPage >= document.page_count - 1}
            >
              <ChevronRight className="h-3 w-3" />
            </Button>
          </div>
        )}

        {/* Zoom & View Toggle */}
        <div className="flex items-center gap-1.5">
          {!isIframeView && (
            <>
              <Button
                variant="ghost"
                size="iconXs"
                onClick={() => setZoom((z) => Math.max(50, z - 20))}
                disabled={zoom <= 50}
              >
                <ZoomOut className="h-3.5 w-3.5" />
              </Button>
              <span className="text-[11px] text-slate-500">{zoom}%</span>
              <Button
                variant="ghost"
                size="iconXs"
                onClick={() => setZoom((z) => Math.min(200, z + 20))}
                disabled={zoom >= 200}
              >
                <ZoomIn className="h-3.5 w-3.5" />
              </Button>
            </>
          )}

          <Button
            variant="outline"
            size="xs"
            onClick={() => setIsIframeView(!isIframeView)}
            className="text-[11px] gap-1"
          >
            <Eye className="h-3 w-3" />
            {isIframeView ? "Image Mode" : "Native PDF"}
          </Button>

          <label className="cursor-pointer">
            <Button variant="ghost" size="xs" className="pointer-events-none text-[11px]">
              Replace
            </Button>
            <input
              type="file"
              className="hidden"
              accept=".pdf,image/png,image/jpeg,image/webp"
              onChange={handleFileUpload}
            />
          </label>
        </div>
      </div>

      {/* Main Preview Container */}
      <div className="relative flex-1 overflow-auto bg-slate-100/50 p-4 dark:bg-slate-950/50 flex items-center justify-center min-h-[400px]">
        {isIframeView ? (
          <iframe
            src={fileUrl}
            className="h-full w-full rounded border-0"
            title="PDF preview"
          />
        ) : (
          <div
            className="transition-transform duration-150 ease-out shadow-md bg-white dark:bg-slate-900 rounded"
            style={{ width: `${zoom}%`, maxWidth: "100%" }}
          >
            {/* Native img pointing to backend render endpoint */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={pageImageUrl}
              alt={`Document page ${currentPage + 1}`}
              className="w-full h-auto object-contain rounded"
              loading="eager"
            />
          </div>
        )}
      </div>

      {/* Thumbnail Bar (if multi-page) */}
      {!isIframeView && document.page_count > 1 && (
        <div className="flex items-center gap-2 overflow-x-auto border-t border-slate-200 bg-white p-2 dark:border-slate-800 dark:bg-slate-900">
          {Array.from({ length: document.page_count }).map((_, idx) => (
            <button
              key={idx}
              onClick={() => onPageChange?.(idx)}
              className={`relative flex h-14 w-10 shrink-0 items-center justify-center overflow-hidden rounded border text-[10px] font-semibold transition ${
                currentPage === idx
                  ? "border-indigo-600 ring-2 ring-indigo-500/30"
                  : "border-slate-200 hover:border-slate-400 dark:border-slate-700"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={apiClient.getPageImageUrl(document.id, idx)}
                alt={`Thumb ${idx + 1}`}
                className="h-full w-full object-cover"
                loading="lazy"
              />
              <span className="absolute bottom-0 inset-x-0 bg-slate-900/70 text-white text-[9px] text-center">
                {idx + 1}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
