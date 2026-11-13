"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  Copy,
  FileJson,
  Layers,
  Table as TableIcon,
} from "lucide-react";
import { ExtractionJobResponse } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface ResultsPanelProps {
  job: ExtractionJobResponse | null;
  streamingStatus?: {
    status?: string;
    progress_percent?: number;
    message?: string;
  } | null;
}

export function ResultsPanel({ job, streamingStatus }: ResultsPanelProps) {
  const [copied, setCopied] = useState(false);

  const activeStatus = streamingStatus?.status || job?.status || "pending";
  const progressPercent = streamingStatus?.progress_percent ?? job?.progress_percent ?? 0;
  const rawData = job?.raw_extraction;

  const handleCopyJson = () => {
    if (rawData) {
      navigator.clipboard.writeText(JSON.stringify(rawData, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Extract array rows if exists
  let tabularRows: Record<string, any>[] = [];
  if (rawData && typeof rawData === "object") {
    for (const val of Object.values(rawData)) {
      if (Array.isArray(val) && val.length > 0 && typeof val[0] === "object") {
        tabularRows = val;
        break;
      }
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card">
      {/* Header with live SSE Status and Token Usage */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card px-4 py-2.5">
        <div className="flex items-center gap-2.5">
          <FileJson className="size-4 text-muted-foreground" />
          <span className="text-xs font-semibold tracking-tight text-foreground">
            Extraction Results
          </span>

          <Badge
            variant={
              activeStatus === "completed"
                ? "default"
                : activeStatus === "failed"
                ? "destructive"
                : "secondary"
            }
            className="text-[10px] capitalize h-4.5"
          >
            {activeStatus.replace("_", " ")}
          </Badge>
        </div>

        {/* Tokens & CTA */}
        <div className="flex items-center gap-2">
          {job?.token_usage && (
            <span className="text-[11px] font-mono text-muted-foreground">
              {job.token_usage.total_tokens.toLocaleString()} tokens
            </span>
          )}

          {job && job.status === "completed" && (
            <Link href={`/harmonize/${job.id}`}>
              <Button size="xs" variant="default" className="gap-1.5 text-xs h-7">
                <span>Harmonize Data</span>
                <ArrowRight className="size-3" />
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* Progress Bar (if in-flight) */}
      {(activeStatus === "extracting" ||
        activeStatus === "waiting_for_render" ||
        activeStatus === "merging") && (
        <div className="border-b border-border bg-muted/40 px-4 py-2">
          <div className="flex items-center justify-between text-[11px] font-medium text-foreground">
            <span>{streamingStatus?.message || "Processing extraction..."}</span>
            <span className="tabular-nums font-mono">{progressPercent}%</span>
          </div>
          <Progress value={progressPercent} className="mt-1.5 h-1.5" />
        </div>
      )}

      {/* Main Content Area */}
      {!rawData ? (
        <div className="flex flex-1 flex-col items-center justify-center p-8 text-center text-muted-foreground">
          <Layers className="size-8 stroke-1 text-muted-foreground/50" />
          <p className="mt-2 text-xs">
            Run extraction on an uploaded document to view structured data here.
          </p>
        </div>
      ) : (
        <div className="flex flex-1 flex-col overflow-hidden p-3">
          <Tabs defaultValue="json" className="flex flex-1 flex-col overflow-hidden">
            <div className="flex items-center justify-between pb-2">
              <TabsList className="h-7 p-0.5">
                <TabsTrigger value="json" className="text-xs gap-1 px-2.5 py-0.5">
                  <FileJson className="size-3" />
                  JSON Tree
                </TabsTrigger>
                {tabularRows.length > 0 && (
                  <TabsTrigger value="table" className="text-xs gap-1 px-2.5 py-0.5">
                    <TableIcon className="size-3" />
                    Table ({tabularRows.length})
                  </TabsTrigger>
                )}
              </TabsList>

              <Button
                variant="outline"
                size="xs"
                onClick={handleCopyJson}
                className="h-7 text-[11px] gap-1"
              >
                {copied ? (
                  <>
                    <Check className="size-3 text-emerald-600" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="size-3" />
                    Copy JSON
                  </>
                )}
              </Button>
            </div>

            {/* JSON View */}
            <TabsContent value="json" className="flex-1 overflow-auto rounded-lg border border-border bg-muted/20 p-3 font-mono text-xs">
              <pre className="whitespace-pre-wrap leading-relaxed text-foreground">
                {JSON.stringify(rawData, null, 2)}
              </pre>
            </TabsContent>

            {/* Tabular View */}
            {tabularRows.length > 0 && (
              <TabsContent value="table" className="flex-1 overflow-auto rounded-lg border border-border bg-card">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {Object.keys(tabularRows[0] || {}).map((col) => (
                        <TableHead key={col} className="text-xs font-semibold capitalize text-muted-foreground">
                          {col.replace("_", " ")}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tabularRows.map((row, rIdx) => (
                      <TableRow key={rIdx}>
                        {Object.keys(tabularRows[0] || {}).map((col) => (
                          <TableCell key={col} className="text-xs text-foreground">
                            {row[col] !== null && row[col] !== undefined
                              ? String(row[col])
                              : "—"}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TabsContent>
            )}
          </Tabs>
        </div>
      )}
    </div>
  );
}
