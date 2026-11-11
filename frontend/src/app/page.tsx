"use client";

import { useEffect, useState } from "react";
import {
  Activity,
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Database,
  FileText,
  Layers,
  RefreshCw,
  Server,
} from "lucide-react";
import { fetchHealth, HealthResponse, API_BASE_URL } from "@/lib/api-client";
import { SchemaEditorPanel } from "@/components/retab/schema-editor-panel";

export default function Home() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  const checkConnection = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchHealth();
      setHealth(data);
      setLastChecked(new Date());
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to connect to backend",
      );
      setHealth(null);
      setLastChecked(new Date());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkConnection();
  }, []);

  const isBackendHealthy = health?.status === "ok";
  const isAppDbHealthy = health?.databases?.app_db ?? false;
  const isTargetDbHealthy = health?.databases?.target_db ?? false;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100 flex flex-col font-sans">
      {/* Top Navbar */}
      <header className="border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold text-lg shadow-sm">
              H
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight">Hamon</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Data Harmonization & Schema Extraction Workbench
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2 text-xs text-slate-500 dark:text-slate-400">
              <span className="font-mono">API: {API_BASE_URL}</span>
            </div>
            <button
              onClick={checkConnection}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 transition disabled:opacity-50 shadow-sm"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`}
              />
              <span>Check Status</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Status Banner */}
        <section className="bg-white dark:bg-slate-900 rounded-xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3 mb-4">
            <div>
              <h2 className="text-sm font-semibold flex items-center gap-2 text-slate-800 dark:text-slate-200">
                <Activity className="w-4 h-4 text-indigo-500" />
                System Environment & Infrastructure
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-400">
                {lastChecked
                  ? `Last verified at ${lastChecked.toLocaleTimeString()}`
                  : "Checking connectivity..."}
              </span>
            </div>
          </div>

          {/* Service Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* Backend API Card */}
            <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 rounded-md bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400">
                  <Server className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs font-semibold">FastAPI Backend</h3>
                  <p className="text-[11px] text-slate-500">Port 8001</p>
                </div>
              </div>
              {loading ? (
                <RefreshCw className="w-3.5 h-3.5 text-slate-400 animate-spin" />
              ) : isBackendHealthy ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
                  <CheckCircle2 className="w-3 h-3" /> Online
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded-full border border-amber-200 dark:border-amber-800">
                  <AlertCircle className="w-3 h-3" /> Offline
                </span>
              )}
            </div>

            {/* App MongoDB Card */}
            <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 rounded-md bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400">
                  <Database className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs font-semibold">App MongoDB (27017)</h3>
                  <p className="text-[11px] text-slate-500">extraction_app_db</p>
                </div>
              </div>
              {loading ? (
                <RefreshCw className="w-3.5 h-3.5 text-slate-400 animate-spin" />
              ) : isAppDbHealthy ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
                  <CheckCircle2 className="w-3 h-3" /> Connected
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 px-2 py-0.5 rounded-full border border-rose-200 dark:border-rose-800">
                  <AlertCircle className="w-3 h-3" /> Offline
                </span>
              )}
            </div>

            {/* Target MongoDB Card */}
            <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 rounded-md bg-cyan-50 dark:bg-cyan-950/50 text-cyan-600 dark:text-cyan-400">
                  <Database className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs font-semibold">Target MongoDB (27018)</h3>
                  <p className="text-[11px] text-slate-500">company_enterprise_db</p>
                </div>
              </div>
              {loading ? (
                <RefreshCw className="w-3.5 h-3.5 text-slate-400 animate-spin" />
              ) : isTargetDbHealthy ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
                  <CheckCircle2 className="w-3 h-3" /> Connected
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 px-2 py-0.5 rounded-full border border-rose-200 dark:border-rose-800">
                  <AlertCircle className="w-3 h-3" /> Offline
                </span>
              )}
            </div>
          </div>

          {error && (
            <div className="mt-3 p-2.5 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 rounded-lg text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>
                Backend is currently unreachable ({error}). Start the backend via{" "}
                <code className="font-mono bg-rose-100 dark:bg-rose-900 px-1 py-0.5 rounded">
                  npm run dev:backend
                </code>
                .
              </span>
            </div>
          )}
        </section>

        {/* Phase 2: Schema Editor Workbench Section */}
        <section className="space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Layers className="w-5 h-5 text-indigo-500" />
                Extraction Schema Builder & Template Manager
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Interactive Draft-07 schema workbench powered by official @retab/schema-builder. Build, edit, and persist schemas directly to MongoDB.
              </p>
            </div>
          </div>

          {/* Mounted Schema Editor Panel */}
          <SchemaEditorPanel />
        </section>

        {/* Pipeline Architecture Reference */}
        <section className="space-y-4 pt-4 border-t border-slate-200 dark:border-slate-800">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 tracking-tight">
            Workbench Pipeline Architecture
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
              <div>
                <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center mb-2.5">
                  <FileText className="w-4 h-4" />
                </div>
                <h3 className="font-semibold text-sm mb-1">
                  1. Document Ingestion
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Ingest multi-page PDFs and images, flatten form fields, and render high-resolution raster images with pypdfium2.
                </p>
              </div>
              <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center text-xs font-medium text-slate-400">
                <span>Phase 3</span>
                <ArrowRight className="w-3 h-3 ml-1" />
              </div>
            </div>

            <div className="p-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
              <div>
                <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mb-2.5">
                  <Layers className="w-4 h-4" />
                </div>
                <h3 className="font-semibold text-sm mb-1">
                  2. Schema Definition (Active)
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Controlled JSON Schema authoring with @retab/schema-builder and FastAPI CRUD API with Draft-07 validator.
                </p>
              </div>
              <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center text-xs font-medium text-emerald-600 dark:text-emerald-400">
                <span>Phase 2 Operational</span>
                <CheckCircle2 className="w-3 h-3 ml-1" />
              </div>
            </div>

            <div className="p-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
              <div>
                <div className="w-8 h-8 rounded-lg bg-cyan-50 dark:bg-cyan-950/60 text-cyan-600 dark:text-cyan-400 flex items-center justify-center mb-2.5">
                  <Database className="w-4 h-4" />
                </div>
                <h3 className="font-semibold text-sm mb-1">
                  3. Harmonization
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Align and map extracted structures into enterprise destination schemas using BDI-Kit machine learning matchers.
                </p>
              </div>
              <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center text-xs font-medium text-slate-400">
                <span>Phase 4</span>
                <ArrowRight className="w-3 h-3 ml-1" />
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 dark:border-slate-800 py-4 bg-white dark:bg-slate-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 dark:text-slate-400 gap-2">
          <span>Hamon Enterprise Workbench &bull; Next.js 14 LTS &bull; FastAPI</span>
          <span>Dual MongoDB Architecture (27017 / 27018)</span>
        </div>
      </footer>
    </div>
  );
}
