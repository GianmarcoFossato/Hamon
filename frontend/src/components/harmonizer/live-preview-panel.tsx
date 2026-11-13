"use client";

import { AlertCircle, FileJson, Layers, Table as TableIcon } from "lucide-react";
import { PreviewResponse } from "@/lib/types";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface LivePreviewPanelProps {
  preview: PreviewResponse | null;
  isLoading?: boolean;
}

export function LivePreviewPanel({ preview, isLoading }: LivePreviewPanelProps) {
  const rows = preview?.preview_rows || [];
  const diagnostics = preview?.diagnostics || [];

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border bg-card px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Layers className="size-4 text-muted-foreground" />
          <span className="text-xs font-semibold tracking-tight text-foreground">
            Real-time Harmonized Preview
          </span>
          {isLoading && (
            <Badge variant="outline" className="text-[10px] py-0 h-4.5 animate-pulse">
              Syncing...
            </Badge>
          )}
        </div>

        {preview && (
          <span className="text-[11px] text-muted-foreground font-mono">
            {preview.total_records} {preview.total_records === 1 ? "record" : "records"}
          </span>
        )}
      </div>

      {/* Diagnostics (if warnings) */}
      {diagnostics.length > 0 && (
        <div className="border-b border-amber-500/20 bg-amber-500/10 p-2.5 text-xs text-amber-600 dark:text-amber-400">
          <div className="flex items-start gap-1.5">
            <AlertCircle className="size-4 text-amber-500 shrink-0 mt-0.5" />
            <div className="flex flex-col gap-0.5">
              <span className="font-semibold text-[11px]">Harmonization Diagnostics:</span>
              <ul className="list-disc pl-4 text-[10px] space-y-0.5">
                {diagnostics.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Main Tabs Container */}
      <div className="flex flex-1 flex-col overflow-hidden p-3">
        <Tabs defaultValue="diff" className="flex flex-1 flex-col overflow-hidden">
          <div className="flex items-center justify-between pb-2">
            <TabsList className="h-7 p-0.5 bg-muted/60 border border-border">
              <TabsTrigger value="diff" className="text-xs gap-1 px-2.5 py-0.5">
                <FileJson className="size-3" />
                Side-by-Side Diff
              </TabsTrigger>
              <TabsTrigger value="table" className="text-xs gap-1 px-2.5 py-0.5">
                <TableIcon className="size-3" />
                Target Table Preview ({rows.length})
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Diff Tab */}
          <TabsContent value="diff" className="flex-1 overflow-auto mt-0">
            <div className="grid h-full grid-cols-1 md:grid-cols-2 gap-3 min-h-[300px]">
              {/* Left: Raw Extraction */}
              <div className="flex flex-col rounded-lg border border-border bg-muted/20 p-3">
                <span className="mb-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Raw Source Extraction
                </span>
                <pre className="flex-1 overflow-auto font-mono text-[11px] text-foreground whitespace-pre-wrap">
                  {preview?.sample_raw
                    ? JSON.stringify(preview.sample_raw, null, 2)
                    : "No source record loaded."}
                </pre>
              </div>

              {/* Right: Harmonized Target BSON */}
              <div className="flex flex-col rounded-lg border border-border bg-card p-3 shadow-xs">
                <span className="mb-2 text-[11px] font-semibold text-foreground uppercase tracking-wider">
                  Harmonized Enterprise BSON
                </span>
                <pre className="flex-1 overflow-auto font-mono text-[11px] text-foreground whitespace-pre-wrap">
                  {preview?.sample_harmonized
                    ? JSON.stringify(preview.sample_harmonized, null, 2)
                    : "Map fields to view harmonized output."}
                </pre>
              </div>
            </div>
          </TabsContent>

          {/* Table Tab */}
          <TabsContent value="table" className="flex-1 overflow-auto rounded-lg border border-border bg-card mt-0">
            {rows.length === 0 ? (
              <div className="flex h-48 items-center justify-center text-xs text-muted-foreground">
                No preview records available.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-b border-border bg-muted/30">
                    {Object.keys(rows[0] || {}).map((col) => (
                      <TableHead key={col} className="text-xs font-semibold capitalize text-muted-foreground">
                        {col.replace("_", " ")}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row, rIdx) => (
                    <TableRow key={rIdx} className="border-b border-border hover:bg-muted/30">
                      {Object.keys(rows[0] || {}).map((col) => (
                        <TableCell key={col} className="text-xs text-foreground">
                          {row[col] !== null && row[col] !== undefined
                            ? typeof row[col] === "object"
                              ? JSON.stringify(row[col])
                              : String(row[col])
                            : "—"}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
