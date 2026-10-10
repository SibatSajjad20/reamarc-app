import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Globe, AlertCircle } from 'lucide-react';
import { Button } from '../ui/button';
import type { Workspace } from '../../types';
import type { WebsiteProject, WebsiteType } from '../../types/websiteProject';
import { WEBSITE_TYPES_LIST } from '../../types/websiteProject';
import { websiteProjectService } from '../../services/websiteProjectService';
import { CustomSelect } from '../ui/CustomSelect';
import { CustomDatePicker } from '../ui/CustomDatePicker';
import { Modal } from '../ui/Modal';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { canManageWebsiteProject } from '../../utils/websiteProjectAccess';
import { focusFirstError } from '../../utils/formFocus';
import { FormErrorSummaryButton } from '../../hooks/useFormValidation';
import { cn } from '../../lib/utils';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void;
  workspaces: Workspace[];
  project?: WebsiteProject | null;
  onUpdated?: (project: WebsiteProject) => void;
  readOnly?: boolean;
}

interface TeamUser {
  id: string;
  name: string;
  full_name?: string;
  email?: string;
  role?: string;
  department?: string;
}

export const WebsiteCreateProjectModal: React.FC<Props> = ({
  isOpen,
  onClose,
  onCreated,
  workspaces,
  project,
  onUpdated,
  readOnly,
}) => {
  const { user } = useAuth();
  const isClient = user?.role === 'client';
  const effectiveReadOnly = readOnly ?? (isClient || (Boolean(project) && !canManageWebsiteProject(user, project)));
  const { addToast } = useToast();

  const [name, setName] = useState(project?.name || '');
  const [workspaceId, setWorkspaceId] = useState(project?.workspace_id || '');
  const [managerId, setManagerId] = useState(project?.manager_id || user?.id || '');
  const [websiteType, setWebsiteType] = useState(project?.website_type || 'brochure');
  const [startDate, setStartDate] = useState(
    project?.start_date || (project ? '' : new Date().toISOString().slice(0, 10))
  );
  const [targetLaunchDate, setTargetLaunchDate] = useState(project?.target_launch_date || '');
  const [stagingUrl, setStagingUrl] = useState(project?.staging_url || '');
  const [liveUrl, setLiveUrl] = useState(project?.live_url || '');
  const [description, setDescription] = useState(project?.description || '');
  const [users, setUsers] = useState<TeamUser[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);

  const isDirty = useMemo(() => {
    if (!project) return true;
    const initialName = project.name || '';
    const initialWorkspaceId = project.workspace_id || '';
    const initialManagerId = project.manager_id || user?.id || '';
    const initialWebsiteType = project.website_type || 'brochure';
    const initialStartDate = project.start_date || '';
    const initialTargetLaunchDate = project.target_launch_date || '';
    const initialStagingUrl = project.staging_url || '';
    const initialLiveUrl = project.live_url || '';
    const initialDescription = project.description || '';

    return (
      name.trim() !== initialName.trim() ||
      workspaceId !== initialWorkspaceId ||
      managerId !== initialManagerId ||
      websiteType !== initialWebsiteType ||
      startDate !== initialStartDate ||
      targetLaunchDate !== initialTargetLaunchDate ||
      stagingUrl.trim() !== initialStagingUrl.trim() ||
      liveUrl.trim() !== initialLiveUrl.trim() ||
      description.trim() !== initialDescription.trim()
    );
  }, [
    project,
    user?.id,
    name,
    workspaceId,
    managerId,
    websiteType,
    startDate,
    targetLaunchDate,
    stagingUrl,
    liveUrl,
    description,
  ]);

  useEffect(() => {
    if (isOpen) {
      setFieldErrors({});
      setServerError(null);
      if (project) {
        setName(project.name || '');
        setWorkspaceId(project.workspace_id || '');
        setManagerId(project.manager_id || user?.id || '');
        setWebsiteType(project.website_type || 'brochure');
        setStartDate(project.start_date || '');
        setTargetLaunchDate(project.target_launch_date || '');
        setStagingUrl(project.staging_url || '');
        setLiveUrl(project.live_url || '');
        setDescription(project.description || '');
      } else {
        setName('');
        if (workspaces.length > 0) {
          setWorkspaceId(workspaces[0].id);
        }
        setManagerId(user?.id || '');
        setWebsiteType('brochure');
        setStartDate(new Date().toISOString().slice(0, 10));
        setTargetLaunchDate('');
        setStagingUrl('');
        setLiveUrl('');
        setDescription('');
      }

      // Load team members using websiteProjectService (skip for clients)
      if (!isClient) {
        websiteProjectService
          .getTeamMembers()
          .then((res) => {
            if (Array.isArray(res)) setUsers(res);
          })
          .catch(() => {});
      }
    }
  }, [isOpen, project?.id, isClient]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (effectiveReadOnly) return;
    setServerError(null);

    const errs: Record<string, string> = {};
    if (!name.trim()) {
      errs.name = 'Project name is required';
    }
    if (!workspaceId) {
      errs.workspaceId = 'Client Workspace is required';
    }

    setFieldErrors(errs);
    if (Object.keys(errs).length > 0) {
      setTimeout(() => {
        if (formRef.current) focusFirstError(formRef.current);
      }, 50);
      return;
    }

    setIsSubmitting(true);
    try {
      const selectedWs = workspaces.find((w) => w.id === workspaceId);
      const selectedMgr = users.find((u) => u.id === managerId);

      if (project) {
        const updated = await websiteProjectService.updateProject(project.id, {
          name: name.trim(),
          workspace_id: workspaceId,
          client_name: selectedWs?.name || project.client_name,
          manager_id: managerId,
          manager_name: selectedMgr?.full_name || selectedMgr?.name || project.manager_name,
          website_type: websiteType as any,
          start_date: startDate || '',
          target_launch_date: targetLaunchDate || '',
          staging_url: stagingUrl.trim() || '',
          live_url: liveUrl.trim() || '',
          description: description.trim() || '',
        });

        addToast('Success', 'Project overview & details updated successfully!', 'success');
        if (onUpdated) {
          onUpdated(updated);
        }
        onCreated();
        onClose();
      } else {
        await websiteProjectService.createProject({
          name: name.trim(),
          workspace_id: workspaceId,
          client_name: selectedWs?.name,
          manager_id: managerId,
          manager_name: selectedMgr?.full_name || selectedMgr?.name,
          website_type: websiteType,
          start_date: startDate || undefined,
          target_launch_date: targetLaunchDate || undefined,
          staging_url: stagingUrl.trim() || undefined,
          live_url: liveUrl.trim() || undefined,
          description: description.trim() || undefined,
        });

        addToast('Success', 'Website project created with 8 stages and 5 draft gates!', 'success');
        onCreated();
        onClose();
      }
    } catch (err: any) {
      setServerError(err.message || 'Failed to save project');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-accent-subtle text-accent">
            <Globe className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-base text-fg">
                {effectiveReadOnly ? 'Project Overview' : project ? 'Project Overview & Details' : 'New Website Project'}
              </h3>
              {effectiveReadOnly && (
                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-subtle text-fg-muted border border-border">
                  View Only
                </span>
              )}
            </div>
          </div>
        </div>
      }
      description={
        effectiveReadOnly
          ? 'View project parameters, URLs, and scope.'
          : project
          ? 'View and update project parameters, URLs, and brief.'
          : 'Initializes the 8-stage pipeline and 5 client approval gates.'
      }
      maxWidth="xl"
    >
      <form ref={formRef} noValidate onSubmit={handleSubmit} className="space-y-4 pt-2">
        <div>
          <label className="block text-xs font-semibold text-fg mb-1">
            Project Name *
          </label>
          <input
            type="text"
            required
            aria-invalid={!!fieldErrors.name}
            disabled={effectiveReadOnly}
            placeholder="e.g. Apex Redesign & E-Commerce Build"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (fieldErrors.name) setFieldErrors((prev) => { const n = { ...prev }; delete n.name; return n; });
            }}
            className={cn(
              'w-full px-3.5 py-2.5 rounded-xl text-xs border bg-subtle text-fg placeholder:text-fg-subtle outline-none ring-0 focus:border-border-strong disabled:bg-surface disabled:cursor-not-allowed disabled:text-fg-muted',
              fieldErrors.name ? 'border-status-danger-border ring-1 ring-status-danger-border' : 'border-border'
            )}
          />
          {fieldErrors.name && (
            <p className="mt-1 text-xs text-status-danger-fg flex items-center gap-1" role="alert">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>{fieldErrors.name}</span>
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-fg mb-1">
              Client Workspace *
            </label>
            <CustomSelect
              value={workspaceId}
              onChange={(val) => {
                setWorkspaceId(val);
                if (fieldErrors.workspaceId) setFieldErrors((prev) => { const n = { ...prev }; delete n.workspaceId; return n; });
              }}
              options={workspaces.map((ws) => ({ value: ws.id, label: ws.name }))}
              placeholder="Select workspace..."
              disabled={effectiveReadOnly}
              error={fieldErrors.workspaceId}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-fg mb-1">
              Project Manager *
            </label>
            <CustomSelect
              value={managerId}
              onChange={setManagerId}
              options={users.map((u) => ({
                value: u.id,
                label: u.full_name || u.name,
                description: u.department || u.role,
              }))}
              placeholder="Select project manager..."
              disabled={effectiveReadOnly}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-fg mb-1">
              Website Type
            </label>
            <CustomSelect
              value={websiteType}
              onChange={(val) => setWebsiteType(val as WebsiteType)}
              options={WEBSITE_TYPES_LIST.map((t) => ({ value: t.id, label: t.label }))}
              placeholder="Select website type..."
              disabled={effectiveReadOnly}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-fg mb-1">
              Start Date
            </label>
            <CustomDatePicker
              value={startDate}
              onChange={setStartDate}
              disabled={effectiveReadOnly}
              placeholder="Select start date..."
              clearable
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-fg mb-1">
              Target Launch Date
            </label>
            <CustomDatePicker
              value={targetLaunchDate}
              onChange={setTargetLaunchDate}
              disabled={effectiveReadOnly}
              placeholder="Select launch date..."
              clearable
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-fg mb-1">
              Staging Preview URL (optional)
            </label>
            <input
              type="url"
              disabled={effectiveReadOnly}
              placeholder="https://staging.client.com"
              value={stagingUrl}
              onChange={(e) => setStagingUrl(e.target.value)}
              className="w-full px-3 py-2 rounded-xl text-xs border border-border bg-subtle text-fg placeholder:text-fg-subtle outline-none ring-0 focus:border-border-strong disabled:bg-surface disabled:cursor-not-allowed disabled:text-fg-muted"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-fg mb-1">
              Live URL (optional)
            </label>
            <input
              type="url"
              disabled={effectiveReadOnly}
              placeholder="https://client.com"
              value={liveUrl}
              onChange={(e) => setLiveUrl(e.target.value)}
              className="w-full px-3 py-2 rounded-xl text-xs border border-border bg-subtle text-fg placeholder:text-fg-subtle outline-none ring-0 focus:border-border-strong disabled:bg-surface disabled:cursor-not-allowed disabled:text-fg-muted"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-fg mb-1">
            Project Description / Scope Summary
          </label>
          <textarea
            rows={2}
            disabled={effectiveReadOnly}
            placeholder="Key deliverables, tech stack, CMS, or client objectives..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full px-3 py-2 rounded-xl text-xs border border-border bg-subtle text-fg placeholder:text-fg-subtle outline-none ring-0 focus:border-border-strong disabled:bg-surface disabled:cursor-not-allowed disabled:text-fg-muted"
          />
        </div>

        {/* Buttons */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-3 border-t border-border">
          <div className="flex items-center gap-2">
            {Object.keys(fieldErrors).length > 1 && (
              <FormErrorSummaryButton
                count={Object.keys(fieldErrors).length}
                onClick={() => formRef.current && focusFirstError(formRef.current)}
              />
            )}
            {serverError && (
              <p className="text-xs text-status-danger-fg flex items-center gap-1.5" role="alert">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>{serverError}</span>
              </p>
            )}
          </div>
          <div className="flex items-center justify-end gap-2">
            {effectiveReadOnly ? (
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2 rounded-xl bg-hover hover:bg-subtle text-fg text-xs font-semibold transition-colors cursor-pointer border border-border"
              >
                Close
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-fg-muted hover:bg-hover transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <Button
                  type="submit"
                  variant="primary"
                  loading={isSubmitting}
                  loadingText={project ? 'Saving Changes…' : 'Creating Project…'}
                  disabled={Boolean(project) && !isDirty}
                >
                  {project ? 'Save Changes' : 'Create Project'}
                </Button>
              </>
            )}
          </div>
        </div>
      </form>
    </Modal>
  );
};
