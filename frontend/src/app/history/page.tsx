"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Database,
  FileJson,
  FileText,
  Layers,
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
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100 flex flex-col font-sans">
      {/* Navbar */}
      <header className="border-b border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900 sticky top-0 z-50">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8 h-16">
          <div className="flex items-center gap-3">
            <Link href="/">
              <Button variant="ghost" size="iconXs">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold text-sm shadow-xs">
              H
            </div>
            <div>
              <h1 className="text-base font-bold tracking-tight">Extraction History</h1>
              <p className="text-xs text-slate-500">
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
              className="gap-1.5 text-xs"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              <span>Refresh</span>
            </Button>
            <Link href="/">
              <Button size="xs" className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs">
                New Extraction
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-7xl w-full flex-1 px-4 sm:px-6 lg:px-8 py-8">
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs font-semibold">Document</TableHead>
                <TableHead className="text-xs font-semibold">Status</TableHead>
                <TableHead className="text-xs font-semibold">Pages</TableHead>
                <TableHead className="text-xs font-semibold">Tokens</TableHead>
                <TableHead className="text-xs font-semibold">Harmonization</TableHead>
                <TableHead className="text-xs font-semibold">Date</TableHead>
                <TableHead className="text-xs font-semibold text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-12 text-center text-xs text-slate-400">
                    Loading extraction history...
                  </TableCell>
                </TableRow>
              ) : jobs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-12 text-center text-xs text-slate-400">
                    No extraction jobs found. Upload a document to get started.
                  </TableCell>
                </TableRow>
              ) : (
                jobs.map((job) => (
                  <TableRow key={job.id}>
                    <TableCell className="align-middle">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-indigo-500 shrink-0" />
                        <span className="font-medium text-xs text-slate-800 dark:text-slate-200">
                          {job.filename || "Untitled"}
                        </span>
                      </div>
                    </TableCell>

                    <TableCell className="align-middle">
                      <Badge
                        variant={
                          job.status === "completed"
                            ? "success"
                            : job.status === "partial_success"
                            ? "warning"
                            : job.status === "failed" || job.status === "harmonize_failed"
                            ? "destructive"
                            : "secondary"
                        }
                        className="text-[10px] capitalize"
                      >
                        {job.status.replace("_", " ")}
                      </Badge>
                    </TableCell>

                    <TableCell className="align-middle text-xs">
                      {job.requested_pages?.length || 1}
                    </TableCell>

                    <TableCell className="align-middle text-xs font-mono">
                      {job.token_usage?.total_tokens?.toLocaleString() || "0"}
                    </TableCell>

                    <TableCell className="align-middle">
                      {job.harmonized ? (
                        <Badge variant="success" className="text-[10px] gap-1">
                          <Database className="h-3 w-3" />
                          <span>{job.harmonized_target_collection || "Committed"}</span>
                        </Badge>
                      ) : (
                        <span className="text-xs text-slate-400">Pending</span>
                      )}
                    </TableCell>

                    <TableCell className="align-middle text-xs text-slate-500">
                      {new Date(job.created_at).toLocaleDateString()}{" "}
                      {new Date(job.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </TableCell>

                    <TableCell className="align-middle text-right">
                      {job.status === "completed" && (
                        <Link href={`/harmonize/${job.id}`}>
                          <Button
                            variant="outline"
                            size="xs"
                            className="h-7 gap-1 text-[11px] text-indigo-600 dark:text-indigo-400"
                          >
                            <span>Harmonize</span>
                            <ArrowRight className="h-3 w-3" />
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
