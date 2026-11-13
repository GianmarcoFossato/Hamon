"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import {
  History,
  Layers,
  Play,
  Sparkles,
} from "lucide-react";
import { toast, Toaster } from "sonner";
import { apiClient, fetchHealth, HealthResponse, API_BASE_URL } from "@/lib/api-client";
import { DocumentResponse, ExtractionJobResponse } from "@/lib/types";
import { PdfViewer } from "@/components/studio/pdf-viewer";
import { ResultsPanel } from "@/components/studio/results-panel";
import { SchemaEditorPanel } from "@/components/retab/schema-editor-panel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function StudioPage() {
  const [health, setHealth] = useState<HealthResponse | null>(null);

  const [document, setDocument] = useState<DocumentResponse | null>(null);
  const [currentPage, setCurrentPage] = useState<number>(0);

  const [activeSchema, setActiveSchema] = useState<Record<string, any> | null>(null);
  const [activeSchemaMeta, setActiveSchemaMeta] = useState<any | null>(null);

  const [activeJob, setActiveJob] = useState<ExtractionJobResponse | null>(null);
  const [isExtracting, setIsExtracting] = useState<boolean>(false);
  const [streamingStatus, setStreamingStatus] = useState<any | null>(null);

  const [activeRightTab, setActiveRightTab] = useState<string>("schema");

  const eventSourceRef = useRef<EventSource | null>(null);

  const checkHealth = async () => {
    try {
      const data = await fetchHealth();
      setHealth(data);
    } catch {
      setHealth(null);
    }
  };

  useEffect(() => {
    checkHealth();
  }, []);

  // Cleanup SSE on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  const handleStartExtraction = async () => {
    if (!document) {
      toast.error("Please upload or select a document first.");
      return;
    }
    if (!activeSchema) {
      toast.error("Please load or author a JSON schema first.");
      return;
    }

    setIsExtracting(true);
    setActiveRightTab("results");
    setStreamingStatus({
      status: "pending",
      progress_percent: 5,
      message: "Initiating extraction job...",
    });

    try {
      const res = await apiClient.startExtraction({
        document_id: document.id,
        schema_id: activeSchemaMeta?.id,
        json_schema: activeSchema,
      });

      const jobId = res.job_id;

      // Subscribe to SSE stream
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }

      const es = new EventSource(`${API_BASE_URL}/extract/stream/${jobId}`);
      eventSourceRef.current = es;

      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          setStreamingStatus(data);

          if (data.status === "completed" || data.status === "partial_success") {
            es.close();
            setIsExtracting(false);
            apiClient.getJobStatus(jobId).then((finalJob) => {
              setActiveJob(finalJob);
              toast.success("Extraction completed successfully!");
            });
          } else if (data.status === "failed") {
            es.close();
            setIsExtracting(false);
            toast.error(data.error_message || "Extraction failed");
            apiClient.getJobStatus(jobId).then(setActiveJob);
          }
        } catch (e) {
          console.error("SSE parse error:", e);
        }
      };

      es.onerror = () => {
        es.close();
        // Fallback polling
        const interval = setInterval(async () => {
          try {
            const statusData = await apiClient.getJobStatus(jobId);
            setActiveJob(statusData);
            if (
              statusData.status === "completed" ||
              statusData.status === "partial_success" ||
              statusData.status === "failed"
            ) {
              clearInterval(interval);
              setIsExtracting(false);
            }
          } catch {
            clearInterval(interval);
            setIsExtracting(false);
          }
        }, 1500);
      };
    } catch (err: any) {
      setIsExtracting(false);
      toast.error(`Failed to start extraction: ${err.message}`);
    }
  };

  const isAppDbHealthy = health?.databases?.app_db ?? false;
  const isTargetDbHealthy = health?.databases?.target_db ?? false;

  return (
    <div className="flex h-screen flex-col bg-background text-foreground font-sans">
      <Toaster richColors position="top-right" />

      {/* Top Navbar in Retab Aesthetic */}
      <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-40">
        <div className="flex items-center justify-between px-4 h-12">
          <div className="flex items-center gap-3">
            <div className="size-6 rounded-md bg-primary text-primary-foreground flex items-center justify-center font-bold text-xs tracking-tight shadow-xs">
              H
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold tracking-tight text-foreground">Hamon Studio</span>
              <Badge variant="outline" className="text-[10px] py-0 px-1.5 h-4.5 font-mono text-muted-foreground">
                GPT-4o Vision
              </Badge>
            </div>
          </div>

          {/* Infrastructure Health Indicators */}
          <div className="hidden sm:flex items-center gap-3 text-xs">
            <div className="flex items-center gap-1.5" title="Internal App DB (Port 27017)">
              <span className={`size-1.5 rounded-full ${isAppDbHealthy ? "bg-emerald-500" : "bg-amber-500"}`} />
              <span className="text-[11px] text-muted-foreground">App DB</span>
            </div>
            <div className="flex items-center gap-1.5" title="Target Enterprise DB (Port 27018)">
              <span className={`size-1.5 rounded-full ${isTargetDbHealthy ? "bg-emerald-500" : "bg-amber-500"}`} />
              <span className="text-[11px] text-muted-foreground">Enterprise DB</span>
            </div>
          </div>

          {/* Action CTAs */}
          <div className="flex items-center gap-2">
            <Link href="/history">
              <Button variant="ghost" size="xs" className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-foreground">
                <History className="size-3.5" />
                <span>History</span>
              </Button>
            </Link>

            <Button
              size="xs"
              variant="default"
              onClick={handleStartExtraction}
              disabled={isExtracting || !document || !activeSchema}
              className="h-7 gap-1.5 text-xs font-medium"
            >
              <Play className={`size-3 fill-current ${isExtracting ? "animate-spin" : ""}`} />
              <span>{isExtracting ? "Extracting..." : "Run Extraction"}</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Main Dual-Pane Studio Body */}
      <main className="flex flex-1 overflow-hidden p-3 gap-3 bg-muted/10">
        {/* Left Pane (50%): Document Viewer */}
        <section className="flex flex-1 flex-col overflow-hidden min-w-[380px]">
          <PdfViewer
            document={document}
            onDocumentChange={(doc) => {
              setDocument(doc);
              setCurrentPage(0);
            }}
            currentPage={currentPage}
            onPageChange={setCurrentPage}
          />
        </section>

        {/* Right Pane (50%): Schema Editor & Results Tabs */}
        <section className="flex flex-1 flex-col overflow-hidden min-w-[380px]">
          <Tabs
            value={activeRightTab}
            onValueChange={setActiveRightTab}
            className="flex flex-1 flex-col overflow-hidden"
          >
            <div className="flex items-center justify-between pb-2">
              <TabsList className="h-7 p-0.5 bg-muted/60 border border-border">
                <TabsTrigger value="schema" className="text-xs gap-1.5 px-3 py-0.5">
                  <Layers className="size-3" />
                  Schema Editor
                </TabsTrigger>
                <TabsTrigger value="results" className="text-xs gap-1.5 px-3 py-0.5">
                  <Sparkles className="size-3" />
                  Results {activeJob ? "✓" : ""}
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="schema" className="flex-1 overflow-auto mt-0">
              <SchemaEditorPanel
                onSchemaChange={(schema, meta) => {
                  setActiveSchema(schema as Record<string, any>);
                  setActiveSchemaMeta(meta);
                }}
              />
            </TabsContent>

            <TabsContent value="results" className="flex-1 overflow-hidden mt-0">
              <ResultsPanel
                job={activeJob}
                streamingStatus={streamingStatus}
              />
            </TabsContent>
          </Tabs>
        </section>
      </main>
    </div>
  );
}
