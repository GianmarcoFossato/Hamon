export type TransformType =
  | "direct"
  | "trim"
  | "string"
  | "int"
  | "float"
  | "clean_currency"
  | "iso_date"
  | "boolean"
  | "object_id"
  | "constant"
  | "formula";

export interface FieldMappingItem {
  source_path: string;
  target_field: string;
  transform: TransformType;
  transform_args?: Record<string, any> | null;
  confidence?: number | null;
  sample_value?: any;
}

export interface HarmonizationProfile {
  id: string;
  name: string;
  source_schema_id?: string | null;
  target_collection: string;
  field_mappings: FieldMappingItem[];
  tenant_id?: string;
  created_at?: string;
  updated_at?: string;
}

export interface PreviewResponse {
  sample_raw?: any;
  sample_harmonized?: any;
  preview_rows: Record<string, any>[];
  diagnostics: string[];
  total_records: number;
}

export interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface ExtractionJobResponse {
  id: string;
  document_id: string;
  filename: string;
  schema_id?: string | null;
  json_schema: Record<string, any>;
  page_range?: string | null;
  requested_pages: number[];
  status:
    | "pending"
    | "waiting_for_render"
    | "extracting"
    | "merging"
    | "completed"
    | "partial_success"
    | "failed"
    | "harmonizing"
    | "harmonize_failed"
    | string;
  progress_percent: number;
  raw_extraction?: Record<string, any> | null;
  token_usage: TokenUsage;
  error_message?: string | null;
  failed_pages: number[];
  harmonized: boolean;
  harmonized_target_collection?: string | null;
  tenant_id: string;
  created_at: string;
  updated_at: string;
  completed_at?: string | null;
}

export interface DocumentResponse {
  id: string;
  filename: string;
  content_type: string;
  file_size: number;
  page_count: number;
  rendered_pages: number[];
  render_status: "pending" | "rendering" | "completed" | "failed" | string;
  error_message?: string | null;
  tenant_id: string;
  created_at: string;
  updated_at: string;
}

export interface SchemaMatchCandidate {
  source_attribute: string;
  target_attribute: string;
  similarity: number;
  suggested_transform?: string;
}

export interface CommitResponse {
  inserted_count: number;
  upserted_count: number;
  quarantined_count: number;
  target_collection: string;
  status: string;
  message: string;
}
