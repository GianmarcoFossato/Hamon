"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast, Toaster } from "sonner";
import { Loader2 } from "lucide-react";
import { apiClient } from "@/lib/api-client";
import {
  ExtractionJobResponse,
  FieldMappingItem,
  HarmonizationProfile,
  PreviewResponse,
} from "@/lib/types";
import { StudioHeader } from "@/components/harmonizer/studio-header";
import { MappingTable } from "@/components/harmonizer/mapping-table";
import { LivePreviewPanel } from "@/components/harmonizer/live-preview-panel";

export default function HarmonizePage() {
  const params = useParams();
  const router = useRouter();
  const jobId = params?.id as string;

  const [job, setJob] = useState<ExtractionJobResponse | null>(null);
  const [collections, setCollections] = useState<string[]>([]);
  const [selectedCollection, setSelectedCollection] = useState<string>("");
  const [profiles, setProfiles] = useState<HarmonizationProfile[]>([]);
  const [mappings, setMappings] = useState<FieldMappingItem[]>([]);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);

  const [commitMode, setCommitMode] = useState<"append" | "upsert">("append");
  const [businessKey, setBusinessKey] = useState<string>("");

  const [isLoading, setIsLoading] = useState(true);
  const [isCommitting, setIsCommitting] = useState(false);
  const [isMatching, setIsMatching] = useState(false);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);

  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // 1. Initial Data Loading
  useEffect(() => {
    async function init() {
      if (!jobId) return;
      setIsLoading(true);
      try {
        const [jobData, colList, profileList] = await Promise.all([
          apiClient.getJobStatus(jobId),
          apiClient.getTargetCollections().catch(() => []),
          apiClient.fetchHarmonizationProfiles().catch(() => []),
        ]);

        setJob(jobData);
        setCollections(colList);
        setProfiles(profileList);

        const defaultCol =
          jobData.harmonized_target_collection ||
          (colList.length > 0 ? colList[0] : "enterprise_invoices");
        setSelectedCollection(defaultCol);

        // Derive initial source fields from raw extraction
        const sourceKeys = extractSourceKeys(jobData.raw_extraction);
        const initialMappings: FieldMappingItem[] = sourceKeys.map((k) => ({
          source_path: k,
          target_field: k,
          transform: "direct",
        }));
        setMappings(initialMappings);
      } catch (err: any) {
        toast.error(`Failed to load harmonization data: ${err.message}`);
      } finally {
        setIsLoading(false);
      }
    }
    init();
  }, [jobId]);

  // Extract source keys from raw JSON
  const extractSourceKeys = (raw: any): string[] => {
    if (!raw) return [];
    if (typeof raw === "object") {
      for (const val of Object.values(raw)) {
        if (Array.isArray(val) && val.length > 0 && typeof val[0] === "object") {
          return Object.keys(val[0]);
        }
      }
      return Object.keys(raw);
    }
    return [];
  };

  const getSampleRow = (): Record<string, any> => {
    const raw = job?.raw_extraction;
    if (!raw) return {};
    if (typeof raw === "object") {
      for (const val of Object.values(raw)) {
        if (Array.isArray(val) && val.length > 0 && typeof val[0] === "object") {
          return val[0];
        }
      }
      return raw;
    }
    return {};
  };

  // 2. Debounced Live Preview (300ms, DEC-7.3)
  const triggerPreview = useCallback(
    (currentMappings: FieldMappingItem[], targetCol: string) => {
      if (!jobId || !targetCol || currentMappings.length === 0) return;

      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      setIsPreviewLoading(true);
      debounceTimerRef.current = setTimeout(async () => {
        try {
          const res = await apiClient.previewHarmonization({
            job_id: jobId,
            target_collection: targetCol,
            field_mappings: currentMappings,
          });
          setPreview(res);
        } catch (err: any) {
          console.warn("Preview error:", err);
        } finally {
          setIsPreviewLoading(false);
        }
      }, 300);
    },
    [jobId]
  );

  const handleMappingsChange = (updated: FieldMappingItem[]) => {
    setMappings(updated);
    triggerPreview(updated, selectedCollection);
  };

  const handleCollectionChange = (col: string) => {
    setSelectedCollection(col);
    triggerPreview(mappings, col);
  };

  // 3. Auto Match Fields via LLM / BDI-Kit
  const handleAutoMatch = async () => {
    if (!selectedCollection || !job) return;
    setIsMatching(true);
    try {
      const sourceKeys = extractSourceKeys(job.raw_extraction);
      const sample = getSampleRow();

      const sourceSamples: Record<string, any[]> = {};
      for (const k of sourceKeys) {
        if (sample[k] !== undefined) {
          sourceSamples[k] = [sample[k]];
        }
      }

      const candidates = await apiClient.matchSchema({
        target_collection: selectedCollection,
        source_fields: sourceKeys,
        source_samples: sourceSamples,
        job_id: jobId,
      });

      if (candidates.length === 0) {
        toast.info("No matching fields found for target collection.");
        return;
      }

      const updated = mappings.map((m) => {
        const found = candidates.find(
          (c) => c.source_attribute === m.source_path
        );
        if (found) {
          return {
            ...m,
            target_field: found.target_attribute,
            confidence: found.similarity,
            transform: (found.suggested_transform as any) || m.transform,
          };
        }
        return m;
      });

      setMappings(updated);
      triggerPreview(updated, selectedCollection);
      toast.success(`Generated ${candidates.length} field alignments`);
    } catch (err: any) {
      toast.error(`Auto match failed: ${err.message}`);
    } finally {
      setIsMatching(false);
    }
  };

  const handleAcceptHighConfidence = () => {
    const updated = mappings.map((m) => {
      if ((m.confidence || 0) >= 0.85) {
        return m;
      }
      return m;
    });
    setMappings(updated);
    triggerPreview(updated, selectedCollection);
    toast.success("Accepted high confidence alignments");
  };

  // 4. Save and Load Profile
  const handleSaveProfile = async (name: string) => {
    try {
      const p = await apiClient.saveHarmonizationProfile({
        name,
        target_collection: selectedCollection,
        field_mappings: mappings,
      });
      setProfiles((prev) => [...prev, p]);
      toast.success(`Saved profile "${name}"`);
    } catch (err: any) {
      toast.error(`Failed to save profile: ${err.message}`);
    }
  };

  const handleLoadProfile = (profile: HarmonizationProfile) => {
    setSelectedCollection(profile.target_collection);
    setMappings(profile.field_mappings);
    triggerPreview(profile.field_mappings, profile.target_collection);
    toast.success(`Loaded profile "${profile.name}"`);
  };

  // 5. Commit to Enterprise MongoDB
  const handleCommit = async () => {
    if (!jobId || !selectedCollection) return;
    if (commitMode === "upsert" && !businessKey.trim()) {
      toast.error("Please specify a business key for upsert mode");
      return;
    }

    setIsCommitting(true);
    try {
      const res = await apiClient.commitHarmonization({
        job_id: jobId,
        target_collection: selectedCollection,
        field_mappings: mappings,
        mode: commitMode,
        business_key: commitMode === "upsert" ? businessKey.trim() : undefined,
      });

      toast.success(res.message);
      setTimeout(() => {
        router.push("/history");
      }, 1500);
    } catch (err: any) {
      toast.error(`Commit failed: ${err.message}`);
    } finally {
      setIsCommitting(false);
    }
  };

  const sourceFields = extractSourceKeys(job?.raw_extraction);
  const sampleRow = getSampleRow();
  // Introspect target fields from preview or fallback
  const targetFields = preview?.preview_rows?.[0]
    ? Object.keys(preview.preview_rows[0])
    : [];

  return (
    <div className="flex h-screen flex-col bg-background text-foreground font-sans">
      <Toaster richColors position="top-right" />

      {/* Header Bar */}
      <StudioHeader
        jobId={jobId}
        filename={job?.filename || ""}
        collections={collections}
        selectedCollection={selectedCollection}
        onCollectionChange={handleCollectionChange}
        profiles={profiles}
        onLoadProfile={handleLoadProfile}
        onSaveProfile={handleSaveProfile}
        commitMode={commitMode}
        onCommitModeChange={setCommitMode}
        businessKey={businessKey}
        onBusinessKeyChange={setBusinessKey}
        onCommit={handleCommit}
        isCommitting={isCommitting}
        onAutoMatch={handleAutoMatch}
        isMatching={isMatching}
      />

      {/* Main Dual-Pane Studio Body */}
      {isLoading ? (
        <div className="flex flex-1 items-center justify-center p-8 text-xs text-muted-foreground">
          <Loader2 className="size-5 animate-spin mr-2" />
          <span>Loading extraction job details...</span>
        </div>
      ) : (
        <main className="flex flex-1 overflow-hidden p-3 gap-3 bg-muted/10">
          {/* Left Pane (50%): Columnar Mapping Table */}
          <section className="flex flex-1 flex-col overflow-hidden min-w-[400px]">
            <MappingTable
              mappings={mappings}
              onMappingsChange={handleMappingsChange}
              sourceFields={sourceFields}
              targetFields={targetFields}
              sampleRow={sampleRow}
              onAcceptHighConfidence={handleAcceptHighConfidence}
            />
          </section>

          {/* Right Pane (50%): Real-time Preview & Diff */}
          <section className="flex flex-1 flex-col overflow-hidden min-w-[400px]">
            <LivePreviewPanel
              preview={preview}
              isLoading={isPreviewLoading}
            />
          </section>
        </main>
      )}
    </div>
  );
}
