/**
 * Type definitions and constants for Content Calendar module.
 * Fully synchronized with backend schemas and Apex Campaign Content Plan.xlsx.
 */

export const PIPELINE_STAGES = [
  'Content',
  'Content Internal Review',
  'Content Client Review',
  'Content Revision',
  'Creative Production',
  'Creative Internal Review',
  'Creative Client Review',
  'Creative Revision',
  'Ready to Post',
  'Posted',
  'Rejected',
] as const;

export type PipelineStage = typeof PIPELINE_STAGES[number];

export type AssetKind = 'image' | 'video' | 'document' | 'other' | 'link';
export type AssetRole = 'primary' | 'carousel_slide' | 'reference' | 'copy_doc' | 'script';
export type ContentCalendarQuickFilter = 'all' | 'overdue' | 'today' | 'scheduled' | 'idle';

export interface CreativeAsset {
  id: string;
  url: string;
  filename: string;
  size_bytes: number;
  content_type: string;
  kind: AssetKind;
  role: AssetRole;
  order: number;
  uploaded_at: string;
  uploaded_by?: string | null;
  width?: number | null;
  height?: number | null;
  duration_seconds?: number | null;
  thumbnail_url?: string | null;
  google_drive_file_id?: string | null;
  google_drive_url?: string | null;
  google_drive_thumb_file_id?: string | null;
}

export const CONTENT_TYPE_OPTIONS = ['Scheduled', 'Runtime'] as const;
export type ContentTypeOption = typeof CONTENT_TYPE_OPTIONS[number];

export const CREATIVE_CATEGORY_OPTIONS = ['Organic Creative', 'Ad Creative'] as const;
export type CreativeCategoryOption = typeof CREATIVE_CATEGORY_OPTIONS[number];

export interface ContentCalendarItem {
  id: string;
  serial: string;
  client_name?: string | null;
  campaign_type: string;
  creative_type: string;
  content_type: ContentTypeOption | string;
  creative_category: CreativeCategoryOption | string;
  posting_type?: string | null;
  content_pillar: string;
  content_concept: string;
  offer: string;
  production_direction?: string | null;
  primary_text?: string | null;
  headlines_hooks?: string | null;
  content_on_creative?: string | null;
  cta: string;
  captions_hashtags?: string | null;
  design_owner?: string | null;
  design_due?: string | null;
  draft_preview_link?: string | null;
  final_asset_link?: string | null;
  approval_status: string;
  setup_status: string;
  notes?: string | null;
  notes_author?: string | null;
  notes_updated_at?: string | null;
  stage: PipelineStage;
  publish_date?: string | null;
  channels?: string[];
  workspace_id?: string | null;
  attachments?: CreativeAsset[];
  created_by?: string | null;
  created_by_name?: string | null;
  submitted_from?: PipelineStage | string | null;
  assignee_id?: string | null;
  assignee_name?: string | null;
  revision_note?: string | null;
  share_token?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ContentCalendarListResponse {
  items: ContentCalendarItem[];
  total: number;
  stages_count: Record<PipelineStage, number>;
}

export interface ContentCalendarConstants {
  campaign_types: string[];
  creative_types: string[];
  content_types?: string[];
  creative_categories?: string[];
  content_pillars: string[];
  offers: string[];
  ctas: string[];
  approval_statuses: string[];
  setup_statuses: string[];
  pipeline_stages: PipelineStage[];
  design_owners?: string[];
}

export type ContentCalendarViewMode = 'overview' | 'table' | 'pipeline' | 'calendar';

export interface ContentCalendarFilter {
  search?: string;
  client_name?: string | 'all';
  stage?: PipelineStage | 'all';
  creative_type?: string | 'all';
  approval_status?: string | 'all';
  campaign_type?: string | 'all';
  start_date?: string;
  end_date?: string;
}

export interface BatchUpdateItem {
  id: string;
  changes: Partial<ContentCalendarItem>;
}

export interface BatchUpdateResponse {
  updated: number;
  matched: number;
}

export interface BulkImportRequest {
  items: Partial<ContentCalendarItem>[];
  upsert_by_serial?: boolean;
  default_client_name?: string;
}

export interface BulkImportResponse {
  total_processed: number;
  inserted_count: number;
  updated_count: number;
  errors: string[];
}

export interface DrivePickedFile {
  id: string;
  name: string;
  mime_type?: string;
  size_bytes?: number;
  url?: string;
  thumbnail_url?: string;
  role?: AssetRole | string;
}

export interface DrivePickerConfig {
  developer_key: string;
  client_id: string;
  app_id: string;
  access_token: string;
  folder_id?: string;
  root_folder_id?: string;
}

