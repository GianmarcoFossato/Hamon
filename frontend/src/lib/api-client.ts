import {
  DocumentResponse,
  ExtractionJobResponse,
  FieldMappingItem,
  HarmonizationProfile,
  PreviewResponse,
  SchemaMatchCandidate,
  CommitResponse,
} from "./types";

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001/api";

export interface DatabaseStatus {
  app_db: boolean;
  target_db: boolean;
}

export interface HealthResponse {
  status: string;
  databases: DatabaseStatus;
}

export interface SchemaCreate {
  name: string;
  description?: string | null;
  json_schema: Record<string, unknown>;
}

export interface SchemaUpdate {
  name?: string | null;
  description?: string | null;
  json_schema?: Record<string, unknown> | null;
}

export interface SchemaResponse {
  id: string;
  name: string;
  description?: string | null;
  json_schema: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export async function fetchHealth(): Promise<HealthResponse> {
  const res = await fetch(`${API_BASE_URL}/health`, {
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Health check failed with status: ${res.status}`);
  }
  return res.json();
}

export async function fetchSchemas(): Promise<SchemaResponse[]> {
  const res = await fetch(`${API_BASE_URL}/schemas`, {
    cache: "no-store",
  });
  if (!res.ok) {
    const errorBody = await res.json().catch(() => null);
    throw new Error(
      errorBody?.detail || `Failed to fetch schemas (${res.status})`,
    );
  }
  return res.json();
}

export async function fetchSchemaById(id: string): Promise<SchemaResponse> {
  const res = await fetch(`${API_BASE_URL}/schemas/${id}`, {
    cache: "no-store",
  });
  if (!res.ok) {
    const errorBody = await res.json().catch(() => null);
    throw new Error(
      errorBody?.detail || `Failed to fetch schema ${id} (${res.status})`,
    );
  }
  return res.json();
}

export async function createSchema(
  payload: SchemaCreate,
): Promise<SchemaResponse> {
  const res = await fetch(`${API_BASE_URL}/schemas`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const errorBody = await res.json().catch(() => null);
    throw new Error(
      errorBody?.detail || `Failed to create schema (${res.status})`,
    );
  }
  return res.json();
}

export async function updateSchema(
  id: string,
  payload: SchemaUpdate,
): Promise<SchemaResponse> {
  const res = await fetch(`${API_BASE_URL}/schemas/${id}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const errorBody = await res.json().catch(() => null);
    throw new Error(
      errorBody?.detail || `Failed to update schema ${id} (${res.status})`,
    );
  }
  return res.json();
}

export async function deleteSchema(id: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/schemas/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const errorBody = await res.json().catch(() => null);
    throw new Error(
      errorBody?.detail || `Failed to delete schema ${id} (${res.status})`,
    );
  }
}

export const apiClient = {
  // Health
  fetchHealth,

  // Schemas
  fetchSchemas,
  fetchSchemaById,
  createSchema,
  updateSchema,
  deleteSchema,

  // Documents
  uploadDocument: async (file: File): Promise<DocumentResponse> => {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch(`${API_BASE_URL}/documents/upload`, {
      method: "POST",
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      throw new Error(err?.detail || `Failed to upload document (${res.status})`);
    }
    return res.json();
  },

  getDocumentMetadata: async (docId: string): Promise<DocumentResponse> => {
    const res = await fetch(`${API_BASE_URL}/documents/${docId}`, {
      cache: "no-store",
    });
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      throw new Error(err?.detail || `Failed to fetch document metadata (${res.status})`);
    }
    return res.json();
  },

  getPageImageUrl: (docId: string, pageNum: number): string => {
    return `${API_BASE_URL}/documents/${docId}/pages/${pageNum}`;
  },

  getDocumentFileUrl: (docId: string): string => {
    return `${API_BASE_URL}/documents/${docId}/file`;
  },

  // Extraction
  startExtraction: async (payload: {
    document_id: string;
    schema_id?: string;
    json_schema?: Record<string, any>;
    page_range?: string;
  }): Promise<{ job_id: string; status: string; total_pages?: number }> => {
    const res = await fetch(`${API_BASE_URL}/extract/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      throw new Error(err?.detail || `Failed to start extraction (${res.status})`);
    }
    return res.json();
  },

  getJobStatus: async (jobId: string): Promise<ExtractionJobResponse> => {
    const res = await fetch(`${API_BASE_URL}/extract/status/${jobId}`, {
      cache: "no-store",
    });
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      throw new Error(err?.detail || `Failed to fetch job status (${res.status})`);
    }
    return res.json();
  },

  getExtractionJobs: async (limit: number = 50): Promise<ExtractionJobResponse[]> => {
    const res = await fetch(`${API_BASE_URL}/extract/jobs?limit=${limit}`, {
      cache: "no-store",
    });
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      throw new Error(err?.detail || `Failed to fetch extraction jobs (${res.status})`);
    }
    return res.json();
  },

  // Harmonization
  getTargetCollections: async (): Promise<string[]> => {
    const res = await fetch(`${API_BASE_URL}/harmonize/target/collections`, {
      cache: "no-store",
    });
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      throw new Error(err?.detail || `Failed to fetch target collections (${res.status})`);
    }
    return res.json();
  },

  matchSchema: async (payload: {
    target_collection: string;
    source_fields: string[];
    source_samples?: Record<string, any[]>;
    job_id?: string;
    method?: string;
  }): Promise<SchemaMatchCandidate[]> => {
    const res = await fetch(`${API_BASE_URL}/harmonize/match-schema`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      throw new Error(err?.detail || `Failed to match schema (${res.status})`);
    }
    return res.json();
  },

  previewHarmonization: async (payload: {
    target_collection: string;
    field_mappings: FieldMappingItem[];
    job_id?: string;
    raw_data?: any;
    root_array_path?: string;
  }): Promise<PreviewResponse> => {
    const res = await fetch(`${API_BASE_URL}/harmonize/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      throw new Error(err?.detail || `Failed to preview harmonization (${res.status})`);
    }
    return res.json();
  },

  commitHarmonization: async (payload: {
    job_id: string;
    target_collection: string;
    field_mappings: FieldMappingItem[];
    mode?: "append" | "upsert";
    business_key?: string;
    root_array_path?: string;
  }): Promise<CommitResponse> => {
    const res = await fetch(`${API_BASE_URL}/harmonize/commit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      throw new Error(err?.detail || `Failed to commit harmonization (${res.status})`);
    }
    return res.json();
  },

  fetchHarmonizationProfiles: async (): Promise<HarmonizationProfile[]> => {
    const res = await fetch(`${API_BASE_URL}/harmonize/profiles`, {
      cache: "no-store",
    });
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      throw new Error(err?.detail || `Failed to fetch profiles (${res.status})`);
    }
    return res.json();
  },

  saveHarmonizationProfile: async (payload: {
    name: string;
    target_collection: string;
    field_mappings: FieldMappingItem[];
    source_schema_id?: string;
  }): Promise<HarmonizationProfile> => {
    const res = await fetch(`${API_BASE_URL}/harmonize/profiles`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      throw new Error(err?.detail || `Failed to save harmonization profile (${res.status})`);
    }
    return res.json();
  },
};
