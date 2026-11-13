"use client";

import * as React from "react";
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  FileText,
  Loader2,
  Upload,
} from "lucide-react";

import { apiClient } from "@/lib/api-client";
import { DocumentResponse } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ViewerControls,
  ViewerControlButton,
} from "@/components/ui/viewer-controls";
import { useDropzone } from "@/components/ui/dropzone";
import { cn } from "@/lib/utils";

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
  const [zoom, setZoom] = React.useState<number>(100);
  const [rotation, setRotation] = React.useState<number>(0);
  const [isNativePdfView, setIsNativePdfView] = React.useState<boolean>(false);
  const [uploading, setUploading] = React.useState<boolean>(false);
  const [uploadError, setUploadError] = React.useState<string | null>(null);
  const [docMeta, setDocMeta] = React.useState<DocumentResponse | null>(document);

  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  // Sync internal document state when prop updates
  React.useEffect(() => {
    setDocMeta(document);
  }, [document]);

  // Poll for render status if document is rendering
  React.useEffect(() => {
    if (!docMeta?.id) return;
    if (docMeta.render_status === "completed" || docMeta.render_status === "failed") {
      return;
    }

    const interval = setInterval(async () => {
      try {
        const updated = await apiClient.getDocumentMetadata(docMeta.id);
        setDocMeta(updated);
        onDocumentChange?.(updated);
        if (updated.render_status === "completed" || updated.render_status === "failed") {
          clearInterval(interval);
        }
      } catch {
        // Ignore polling errors
      }
    }, 1500);

    return () => clearInterval(interval);
  }, [docMeta?.id, docMeta?.render_status, onDocumentChange]);

  const handleProcessFile = async (file: File) => {
    setUploading(true);
    setUploadError(null);
    try {
      const doc = await apiClient.uploadDocument(file);
      setDocMeta(doc);
      onDocumentChange?.(doc);
      onPageChange?.(0);
      setZoom(100);
      setRotation(0);
    } catch (err: any) {
      setUploadError(err?.message || "Failed to upload document");
    } finally {
      setUploading(false);
    }
  };

  // Dropzone setup for drag and drop
  const dropzone = useDropzone({
    accept:
      ".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp,image/*",
    maxFiles: 1,
    disabled: uploading,
    onIntake: (intake) => {
      if (intake.acceptedFiles.length > 0) {
        handleProcessFile(intake.acceptedFiles[0]);
      } else if (intake.fileRejections.length > 0) {
        setUploadError("Invalid file type. Please upload a PDF or image.");
      }
    },
  });

  const handlePrevPage = () => {
    if (currentPage > 0) {
      onPageChange?.(currentPage - 1);
    }
  };

  const handleNextPage = () => {
    if (docMeta && currentPage < docMeta.page_count - 1) {
      onPageChange?.(currentPage + 1);
    }
  };

  const handleRotate = () => {
    setRotation((r) => (r + 90) % 360);
  };

  const isPdf =
    docMeta?.content_type === "application/pdf" ||
    docMeta?.filename.toLowerCase().endsWith(".pdf");

  // Empty state: Retab Dropzone surface
  if (!docMeta) {
    return (
      <div className="flex h-full w-full flex-col overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex h-10 items-center justify-between border-b border-border px-3">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <FileText className="size-4" />
            <span>Document Preview</span>
          </div>
        </div>

        <div className="flex flex-1 items-center justify-center p-6">
          <div
            {...dropzone.getRootProps({
              role: "button",
              tabIndex: uploading ? -1 : 0,
              onClick: () => {
                if (!uploading) {
                  dropzone.openFileDialog();
                }
              },
              onKeyDown: (e: React.KeyboardEvent) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  if (!uploading) {
                    dropzone.openFileDialog();
                  }
                }
              },
              className: cn(
                "group relative flex w-full max-w-md flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/60 p-8 text-center transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                dropzone.isDragging && "border-primary/60 bg-accent/40",
                uploading && "pointer-events-none opacity-60",
              ),
            })}
          >
            <input {...dropzone.getInputProps({ className: "hidden" })} />

            <div
              onClick={(e) => {
                e.stopPropagation();
                if (!uploading) dropzone.openFileDialog();
              }}
              className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground transition-transform group-hover:scale-105 cursor-pointer"
            >
              {uploading ? (
                <Loader2 className="size-6 animate-spin text-primary" />
              ) : (
                <Upload className="size-6" />
              )}
            </div>

            <h3 className="mt-4 text-sm font-semibold tracking-tight text-foreground">
              {uploading ? "Uploading & Rendering..." : "Upload PDF or Image"}
            </h3>

            <p className="mt-1.5 max-w-xs text-xs text-muted-foreground">
              Drag and drop an invoice, receipt, or document here, or click to browse.
            </p>

            <div className="mt-4 flex items-center gap-1.5 text-[11px] text-muted-foreground font-mono">
              <Badge variant="outline" className="text-[10px] font-normal">
                PDF
              </Badge>
              <Badge variant="outline" className="text-[10px] font-normal">
                PNG
              </Badge>
              <Badge variant="outline" className="text-[10px] font-normal">
                JPEG
              </Badge>
              <span className="text-[10px]">up to 50MB</span>
            </div>

            {uploadError && (
              <div className="mt-4 rounded-md border border-destructive/20 bg-destructive/10 px-3 py-1.5 text-xs text-destructive">
                {uploadError}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  const pageImageUrl = apiClient.getPageImageUrl(docMeta.id, currentPage);
  const fileUrl = apiClient.getDocumentFileUrl(docMeta.id);

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card">
      {/* Retab ViewerControls Toolbar */}
      <ViewerControls
        title={
          <div className="flex items-center gap-2">
            <FileText className="size-3.5 text-muted-foreground" />
            <span className="max-w-[150px] truncate" title={docMeta.filename}>
              {docMeta.filename}
            </span>
            <Badge variant="secondary" className="text-[10px] py-0 px-1.5 h-4.5">
              {docMeta.page_count} {docMeta.page_count === 1 ? "page" : "pages"}
            </Badge>
          </div>
        }
        position={
          !isNativePdfView && docMeta.page_count > 1
            ? {
                kind: "page",
                current: currentPage + 1,
                total: docMeta.page_count,
              }
            : null
        }
        zoom={
          !isNativePdfView
            ? {
                scale: zoom / 100,
                onZoomIn: () => setZoom((z) => Math.min(250, z + 20)),
                onZoomOut: () => setZoom((z) => Math.max(40, z - 20)),
                onFit: () => {
                  setZoom(100);
                  setRotation(0);
                },
                onReset: () => setZoom(100),
                isDisabled: docMeta.render_status === "failed",
              }
            : null
        }
        rotate={!isNativePdfView ? { onRotate: handleRotate } : null}
        extra={
          <div className="flex items-center gap-1">
            {/* Page navigation buttons */}
            {!isNativePdfView && docMeta.page_count > 1 && (
              <div className="flex items-center gap-0.5 mr-1">
                <ViewerControlButton
                  label="Previous page"
                  onClick={handlePrevPage}
                  disabled={currentPage <= 0}
                >
                  <ChevronLeft className="size-3.5" />
                </ViewerControlButton>
                <ViewerControlButton
                  label="Next page"
                  onClick={handleNextPage}
                  disabled={currentPage >= docMeta.page_count - 1}
                >
                  <ChevronRight className="size-3.5" />
                </ViewerControlButton>
              </div>
            )}

            {isPdf && (
              <Button
                variant="ghost"
                size="xs"
                onClick={() => setIsNativePdfView(!isNativePdfView)}
                className="h-7 gap-1 px-2 text-[11px] text-muted-foreground hover:text-foreground"
                title={isNativePdfView ? "Switch to Rendered Pages" : "Switch to Native Browser PDF"}
              >
                <Eye className="size-3" />
                <span>{isNativePdfView ? "Rendered" : "Native PDF"}</span>
              </Button>
            )}

            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp,image/*"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleProcessFile(f);
              }}
            />
            <Button
              variant="ghost"
              size="xs"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="h-7 px-2 text-[11px] text-muted-foreground hover:text-foreground"
            >
              {uploading ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                "Replace"
              )}
            </Button>
          </div>
        }
      />

      {/* Main Viewport Container */}
      <div className="relative flex flex-1 items-center justify-center overflow-auto bg-muted/20 p-4">
        {isNativePdfView ? (
          <div className="h-full w-full rounded border border-border bg-card overflow-hidden">
            <object
              data={fileUrl}
              type="application/pdf"
              className="h-full w-full rounded"
            >
              <div className="flex h-full flex-col items-center justify-center p-6 text-center text-xs text-muted-foreground">
                <p>Native preview not supported by this browser.</p>
                <a
                  href={fileUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 text-primary underline"
                >
                  Download or open PDF in new tab
                </a>
              </div>
            </object>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center min-h-[360px]">
            {/* Render Status Banner if background rendering is ongoing */}
            {docMeta.render_status === "rendering" && (
              <div className="mb-3 flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1 text-xs text-muted-foreground shadow-xs">
                <Loader2 className="size-3 animate-spin text-primary" />
                <span>Rendering pages at 150 DPI...</span>
              </div>
            )}

            {docMeta.render_status === "failed" ? (
              <div className="flex flex-col items-center justify-center p-8 text-center">
                <div className="rounded-full bg-destructive/10 p-3 text-destructive">
                  <FileText className="size-6" />
                </div>
                <h4 className="mt-3 text-sm font-semibold text-foreground">
                  Rendering Failed
                </h4>
                <p className="mt-1 max-w-sm text-xs text-muted-foreground">
                  {docMeta.error_message || "Could not render page images for this document."}
                </p>
                {isPdf && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-4 text-xs"
                    onClick={() => setIsNativePdfView(true)}
                  >
                    View in Native PDF mode
                  </Button>
                )}
              </div>
            ) : (
              <div
                className="relative transition-all duration-150 ease-out shadow-sm border border-border bg-card rounded-md overflow-hidden"
                style={{
                  width: `${zoom}%`,
                  maxWidth: "100%",
                  transform: rotation ? `rotate(${rotation}deg)` : undefined,
                  transformOrigin: "center center",
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={pageImageUrl}
                  alt={`Page ${currentPage + 1}`}
                  className="w-full h-auto object-contain block select-none"
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Multi-page Thumbnail Rail (filmstrip) */}
      {!isNativePdfView && docMeta.page_count > 1 && (
        <div className="flex items-center gap-2 overflow-x-auto border-t border-border bg-card px-3 py-2 no-scrollbar">
          {Array.from({ length: docMeta.page_count }).map((_, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => {
                onPageChange?.(idx);
              }}
              className={cn(
                "group relative flex h-16 w-12 shrink-0 items-center justify-center overflow-hidden rounded border bg-muted/40 text-[10px] font-medium transition",
                currentPage === idx
                  ? "border-primary ring-2 ring-primary/20"
                  : "border-border hover:border-foreground/40",
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={apiClient.getPageImageUrl(docMeta.id, idx)}
                alt={`Page ${idx + 1}`}
                className="h-full w-full object-cover"
                loading="lazy"
              />
              <span className="absolute bottom-0 inset-x-0 bg-background/90 text-[9px] font-mono text-foreground text-center py-0.5 border-t border-border">
                {idx + 1}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
