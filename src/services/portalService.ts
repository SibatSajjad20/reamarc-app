import { apiClient } from './apiClient';

export interface PortalAsset {
  id: string;
  serial: string;
  campaignType: string;
  creativeType: string;
  contentPillar: string;
  contentConcept: string;
  offer: string;
  productionDirection: string;
  primaryText: string;
  primaryCopy: string;
  headlinesHooks: string;
  contentOnCreative: string;
  scriptOutline: string;
  cta: string;
  hashtagsKeywords: string;
  designOwner: string;
  designDue: string;
  setupStatus: string;
  notes: string;
  approvalStatus: string;
  client_feedback?: { category: string; notes: string; submitted_at: string; submitted_by: string } | null;
  _campaignId: string;
  _campaignTitle: string;
  _workspaceId: string;
}

export interface PortalDashboard {
  pending_review_count: number;
  approved_count: number;
  pending_review: PortalAsset[];
  all_assets: PortalAsset[];
}

export interface RevisionNotification {
  campaignId: string;
  campaignTitle: string;
  rowId: string;
  serial: string;
  contentConcept: string;
  client_feedback: { category: string; notes: string; submitted_at: string; submitted_by: string } | null;
}

export interface NotificationsResponse {
  count: number;
  items: RevisionNotification[];
}

export const portalService = {
  getDashboard: () => apiClient.get<PortalDashboard>('/portal/dashboard'),

  approveAsset: (campaignId: string, rowId: string) =>
    apiClient.post(`/portal/assets/${campaignId}/${rowId}/approve`),

  requestRevision: (campaignId: string, rowId: string, category: string, notes: string) =>
    apiClient.post(`/portal/assets/${campaignId}/${rowId}/revision`, { category, notes }),

  getNotifications: () => apiClient.get<NotificationsResponse>('/portal/notifications'),

  resetToReview: (campaignId: string, rowId: string) =>
    apiClient.post(`/portal/assets/${campaignId}/${rowId}/reset-to-review`),
};
