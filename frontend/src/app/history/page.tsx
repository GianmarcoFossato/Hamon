"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Database,
  FileText,
  RefreshCw,
} from "lucide-react";
import { apiClient } from "@/lib/api-client";
import { ExtractionJobResponse } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function HistoryPage() {
  const [jobs, setJobs] = useState<ExtractionJobResponse[]>([]);
  const [loading, setLoading] = useState(true);

  const loadHistory = async () => {
    setLoading(true);
    try {
      const data = await apiClient.getExtractionJobs(50);
      setJobs(data);
    } catch (err) {
      console.error("Failed to load jobs history:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHistory();
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col font-sans">
      {/* Top Navbar */}
      <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 sm:px-6 h-14">
          <div className="flex items-center gap-3">
            <Link href="/">
              <Button variant="ghost" size="iconXs" className="size-7">
                <ArrowLeft className="size-4" />
              </Button>
            </Link>
            <div className="size-6 rounded-md bg-primary text-primary-foreground flex items-center justify-center font-bold text-xs shadow-xs">
              H
            </div>
            <div>
              <h1 className="text-sm font-semibold tracking-tight text-foreground">Extraction History</h1>
              <p className="text-[11px] text-muted-foreground hidden sm:block">
                Audit and inspect previously extracted documents and committed records
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="xs"
              onClick={loadHistory}
              disabled={loading}
              className="gap-1.5 text-xs h-7"
            >
              <RefreshCw className={`size-3 ${loading ? "animate-spin" : ""}`} />
              <span>Refresh</span>
            </Button>
            <Link href="/">
              <Button size="xs" variant="default" className="text-xs h-7">
                New Extraction
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-7xl w-full flex-1 px-4 sm:px-6 py-6">
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="border-b border-border bg-muted/40">
                <TableHead className="text-xs font-semibold text-muted-foreground">Document</TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground">Status</TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground">Pages</TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground">Tokens</TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground">Harmonization</TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground">Date</TableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-12 text-center text-xs text-muted-foreground">
                    Loading extraction history...
                  </TableCell>
                </TableRow>
              ) : jobs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-12 text-center text-xs text-muted-foreground">
                    No extraction jobs found. Upload a document to get started.
                  </TableCell>
                </TableRow>
              ) : (
                jobs.map((job) => (
                  <TableRow key={job.id} className="border-b border-border hover:bg-muted/30">
                    <TableCell className="align-middle">
                      <div className="flex items-center gap-2">
                        <FileText className="size-3.5 text-muted-foreground shrink-0" />
                        <span className="font-medium text-xs text-foreground">
                          {job.filename || "Untitled"}
                        </span>
                      </div>
                    </TableCell>

                    <TableCell className="align-middle">
                      <Badge
                        variant={
                          job.status === "completed"
                            ? "default"
                            : job.status === "failed" || job.status === "harmonize_failed"
                            ? "destructive"
                            : "secondary"
                        }
                        className="text-[10px] capitalize h-4.5"
                      >
                        {job.status.replace("_", " ")}
                      </Badge>
                    </TableCell>

                    <TableCell className="align-middle text-xs text-muted-foreground">
                      {job.requested_pages?.length || 1}
                    </TableCell>

                    <TableCell className="align-middle text-xs font-mono text-muted-foreground">
                      {job.token_usage?.total_tokens?.toLocaleString() || "0"}
                    </TableCell>

                    <TableCell className="align-middle">
                      {job.harmonized ? (
                        <Badge variant="secondary" className="text-[10px] gap-1 h-4.5">
                          <Database className="size-3" />
                          <span>{job.harmonized_target_collection || "Committed"}</span>
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">Pending</span>
                      )}
                    </TableCell>

                    <TableCell className="align-middle text-xs text-muted-foreground">
                      {new Date(job.created_at).toLocaleDateString()}{" "}
                      {new Date(job.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </TableCell>

                    <TableCell className="align-middle text-right">
                      {job.status === "completed" && (
                        <Link href={`/harmonize/${job.id}`}>
                          <Button
                            variant="outline"
                            size="xs"
                            className="h-7 gap-1 text-[11px]"
                          >
                            <span>Harmonize</span>
                            <ArrowRight className="size-3" />
                          </Button>
                        </Link>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </main>
    </div>
  );
}
