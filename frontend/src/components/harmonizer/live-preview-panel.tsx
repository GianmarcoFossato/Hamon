"use client";

import { AlertCircle, CheckCircle2, FileJson, Layers, Table as TableIcon } from "lucide-react";
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
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-2.5 dark:border-slate-800 dark:bg-slate-950">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-indigo-600" />
          <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
            Real-time Harmonized Preview
          </span>
          {isLoading && (
            <Badge variant="outline" className="text-[10px] py-0 animate-pulse">
              Syncing...
            </Badge>
          )}
        </div>

        {preview && (
          <span className="text-[11px] text-slate-500 font-mono">
            {preview.total_records} {preview.total_records === 1 ? "record" : "records"}
          </span>
        )}
      </div>

      {/* Diagnostics (if warnings) */}
      {diagnostics.length > 0 && (
        <div className="border-b border-amber-200 bg-amber-50/80 p-2.5 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300">
          <div className="flex items-start gap-1.5">
            <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
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
            <TabsList className="h-7 p-0.5">
              <TabsTrigger value="diff" className="text-xs gap-1 px-2.5 py-0.5">
                <FileJson className="h-3 w-3" />
                Side-by-Side Diff
              </TabsTrigger>
              <TabsTrigger value="table" className="text-xs gap-1 px-2.5 py-0.5">
                <TableIcon className="h-3 w-3" />
                Target Table Preview ({rows.length})
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Diff Tab */}
          <TabsContent value="diff" className="flex-1 overflow-auto">
            <div className="grid h-full grid-cols-1 md:grid-cols-2 gap-3 min-h-[300px]">
              {/* Left: Raw Extraction */}
              <div className="flex flex-col rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950">
                <span className="mb-2 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  Raw Source Extraction
                </span>
                <pre className="flex-1 overflow-auto font-mono text-[11px] text-slate-800 dark:text-slate-200 whitespace-pre-wrap">
                  {preview?.sample_raw
                    ? JSON.stringify(preview.sample_raw, null, 2)
                    : "No source record loaded."}
                </pre>
              </div>

              {/* Right: Harmonized Target BSON */}
              <div className="flex flex-col rounded-lg border border-emerald-200 bg-emerald-50/20 p-3 dark:border-emerald-950/60 dark:bg-emerald-950/10">
                <span className="mb-2 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">
                  Harmonized Enterprise BSON
                </span>
                <pre className="flex-1 overflow-auto font-mono text-[11px] text-emerald-950 dark:text-emerald-200 whitespace-pre-wrap">
                  {preview?.sample_harmonized
                    ? JSON.stringify(preview.sample_harmonized, null, 2)
                    : "Map fields to see harmonized preview."}
                </pre>
              </div>
            </div>
          </TabsContent>

          {/* Table Tab */}
          <TabsContent value="table" className="flex-1 overflow-auto rounded-lg border border-slate-200 dark:border-slate-800">
            {rows.length === 0 ? (
              <div className="flex h-full items-center justify-center p-8 text-xs text-slate-400">
                No harmonized records to display.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    {Object.keys(rows[0] || {}).map((col) => (
                      <TableHead key={col} className="text-xs font-semibold font-mono">
                        {col}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row, rIdx) => (
                    <TableRow key={rIdx}>
                      {Object.keys(rows[0] || {}).map((col) => (
                        <TableCell key={col} className="text-xs font-mono">
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
