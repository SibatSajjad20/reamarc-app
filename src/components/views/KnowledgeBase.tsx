import React, { useState, useRef, useMemo } from 'react';
import type { KnowledgeSource, Workspace } from '../../types';
import { useToast } from '../../context/ToastContext';
import { HasPermission } from '../HasPermission';
import { useAuth } from '../../context/AuthContext';
import {
  Brain,
  Globe,
  Trash2,
  FileText,
  CheckCircle2,
  Plus,
  Sparkles,
  Search,
  Building2,
  FileCode,
  FileType,
  FolderUp,
} from 'lucide-react';

interface KnowledgeBaseProps {
  sources: KnowledgeSource[];
  isLoading?: boolean;
  error?: string | null;
  onRefetch?: () => void;
  onUploadPdf: (file: File, workspaceId: string) => Promise<void>;
  onUploadFiles?: (files: File[], workspaceId: string) => Promise<void>;
  onScrapeUrl: (url: string, workspaceId: string) => Promise<void>;
  onDeleteSource: (sourceId: string) => void;
  selectedWorkspace: Workspace | null;
  workspaces?: Workspace[];
}

export const KnowledgeBase: React.FC<KnowledgeBaseProps> = ({
  sources,
  isLoading,
  error,
  onRefetch,
  onUploadPdf,
  onUploadFiles,
  onScrapeUrl,
  onDeleteSource,
  selectedWorkspace,
  workspaces = [],
}) => {
  const { addToast } = useToast();
  const { role } = useAuth();
  const [urlInput, setUrlInput] = useState('');
  const [isScraping, setIsScraping] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Filter sources by workspace if selected with useMemo
  const workspaceSources = useMemo(() => {
    return selectedWorkspace
      ? sources.filter((s) => s.workspaceId === selectedWorkspace.id)
      : sources;
  }, [sources, selectedWorkspace]);

  const filteredSources = useMemo(() => {
    return workspaceSources.filter((s) =>
      s.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [workspaceSources, searchQuery]);

  // URL Scrape Handler
  const handleAddUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!urlInput.trim()) return;
    let cleanUrl = urlInput.trim();
    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
      cleanUrl = `https://${cleanUrl}`;
    }
    setIsScraping(true);
    try {
      await onScrapeUrl(cleanUrl, selectedWorkspace?.id ?? 'ws-1');
      setUrlInput('');
    } catch {
      // error toast handled in parent
    } finally {
      setIsScraping(false);
    }
  };

  // RAG File Upload Handler (.pdf, .docx, .txt, .md)
  const handleFileUpload = async (files: FileList | File[] | null) => {
    if (!files || files.length === 0) return;
    const fileArray = Array.from(files);
    const validExtensions = ['.pdf', '.docx', '.doc', '.txt', '.md', '.json', '.csv'];

    const validFiles = fileArray.filter((file) => {
      const ext = '.' + file.name.split('.').pop()?.toLowerCase();
      return validExtensions.includes(ext);
    });

    if (validFiles.length === 0) {
      addToast(
        'Invalid Format',
        'Supported formats: PDF (.pdf), Word (.docx), Plain Text (.txt), Markdown (.md)',
        'warning'
      );
      return;
    }

    setIsUploading(true);
    try {
      if (onUploadFiles) {
        await onUploadFiles(validFiles, selectedWorkspace?.id ?? 'ws-1');
      } else {
        await onUploadPdf(validFiles[0], selectedWorkspace?.id ?? 'ws-1');
      }
    } catch {
      // error toast handled in parent
    } finally {
      setIsUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (role === 'viewer') return;
    handleFileUpload(e.dataTransfer.files);
  };

  const renderSourceIcon = (type: string) => {
    switch (type.toLowerCase()) {
      case 'pdf':
        return (
          <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-500/20">
            <FileText className="w-5 h-5" />
          </div>
        );
      case 'docx':
      case 'doc':
        return (
          <div className="p-2.5 rounded-xl bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-500/20">
            <FileType className="w-5 h-5" />
          </div>
        );
      case 'txt':
      case 'md':
        return (
          <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20">
            <FileCode className="w-5 h-5" />
          </div>
        );
      case 'url':
      case 'website':
      default:
        return (
          <div className="p-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-500/20">
            <Globe className="w-5 h-5" />
          </div>
        );
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-50 dark:bg-zinc-950 overflow-y-auto font-sans text-slate-900 dark:text-zinc-100 select-none">
      {/* Header Bar */}
      <header className="h-16 border-b border-slate-200 dark:border-zinc-800/80 px-6 flex items-center justify-between bg-white dark:bg-zinc-950/80 backdrop-blur-md shrink-0 sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-pink-50 dark:bg-pink-500/10 border border-pink-200 dark:border-pink-500/20 text-pink-600 dark:text-pink-400">
            <Brain className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-extrabold text-slate-900 dark:text-zinc-100 flex items-center gap-2">
              Brand RAG Knowledge Base
              <span className="text-xs font-bold text-slate-500 dark:text-zinc-400">
                ({workspaceSources.length} indexed sources)
              </span>
            </h1>
            <p className="text-xs text-slate-500 dark:text-zinc-400 font-medium">
              Vector semantic search engine powered by Gemini embeddings (3072D) & MongoDB.
            </p>
          </div>
        </div>

        {selectedWorkspace && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-xs text-slate-700 dark:text-zinc-300 font-medium">
            <Building2 className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
            <span className="text-slate-500">Workspace:</span>
            <span className="font-bold text-slate-900 dark:text-zinc-100">{selectedWorkspace.name}</span>
          </div>
        )}
      </header>

      {/* Content Container */}
      <div className="p-6 space-y-8 max-w-6xl mx-auto w-full">
        {/* Upload & Scraping Tools Section */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* RAG Multi-Format Drag & Drop Zone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              if (role !== 'viewer') setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => role !== 'viewer' && fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-3xl p-6 flex flex-col items-center justify-center text-center transition-all duration-200 relative group overflow-hidden shadow-sm ${
              role === 'viewer'
                ? 'cursor-not-allowed opacity-50 border-slate-300 dark:border-zinc-800 bg-white dark:bg-zinc-900/40'
                : dragOver
                ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-500/10 cursor-pointer'
                : 'border-slate-300 dark:border-zinc-800 hover:border-indigo-500/60 bg-white dark:bg-zinc-900/40 hover:bg-slate-100/60 dark:hover:bg-zinc-900/80 cursor-pointer'
            }`}
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={(e) => handleFileUpload(e.target.files)}
              accept=".pdf,.docx,.doc,.txt,.md"
              multiple
              className="hidden"
            />

            {isUploading ? (
              <div className="flex flex-col items-center space-y-2 py-4">
                <Sparkles className="w-8 h-8 text-indigo-600 dark:text-indigo-400 animate-spin" />
                <p className="text-xs font-bold text-slate-900 dark:text-zinc-200">
                  Chunking text & generating Gemini vector embeddings...
                </p>
                <p className="text-[11px] text-slate-500 dark:text-zinc-400">Storing in MongoDB knowledge_chunks index</p>
              </div>
            ) : (
              <>
                <div className="p-3.5 rounded-2xl bg-indigo-50 dark:bg-zinc-800/80 group-hover:bg-indigo-600/10 text-indigo-600 dark:text-indigo-400 transition-colors mb-3">
                  <FolderUp className="w-6 h-6" />
                </div>
                <h3 className="text-sm font-extrabold text-slate-900 dark:text-zinc-200 group-hover:text-indigo-600 dark:group-hover:text-white transition-colors">
                  Drop Files or Entire Folders Here
                </h3>
                <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1 max-w-xs font-medium">
                  Upload PDF, Word (.docx), Plain Text (.txt), or Markdown (.md) documents (up to 100MB per file).
                </p>
                <div className="flex items-center gap-1.5 mt-3">
                  <span className="text-[10px] font-extrabold text-slate-600 dark:text-zinc-400 bg-slate-100 dark:bg-zinc-800 px-2 py-0.5 rounded border border-slate-200 dark:border-zinc-700">.PDF</span>
                  <span className="text-[10px] font-extrabold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10 px-2 py-0.5 rounded border border-blue-200 dark:border-blue-500/20">.DOCX</span>
                  <span className="text-[10px] font-extrabold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-500/20">.TXT / .MD</span>
                </div>
                <span className="mt-3 text-[11px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-100 dark:bg-indigo-500/10 px-3 py-1 rounded-full border border-indigo-200 dark:border-indigo-500/20">
                  Select Files / Batch Upload
                </span>
              </>
            )}
          </div>

          {/* Web URL Scraper Card */}
          <div className="bg-white dark:bg-zinc-900/40 border border-slate-200 dark:border-zinc-800 rounded-3xl p-6 flex flex-col justify-between shadow-sm">
            <div>
              <div className="flex items-center gap-2.5 mb-3">
                <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-500/20">
                  <Globe className="w-5 h-5" />
                </div>
                <h3 className="text-sm font-extrabold text-slate-900 dark:text-zinc-200">Scrape & Index Web Page</h3>
              </div>
              <p className="text-xs text-slate-500 dark:text-zinc-400 leading-relaxed font-medium">
                Scrapes live web pages, extracts clean body content, and indexes sentence chunks into RAG vector storage.
              </p>
            </div>

            <form onSubmit={handleAddUrl} className="mt-4 space-y-3">
              <div className="relative">
                <Globe className="w-4 h-4 text-slate-400 dark:text-zinc-500 absolute left-3.5 top-3" />
                <input
                  type="text"
                  placeholder="https://nova-realestate.com/about"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 focus:border-indigo-600 rounded-xl pl-9 pr-3 py-2.5 text-xs text-slate-900 dark:text-zinc-100 placeholder-slate-400 dark:placeholder-zinc-500 focus:outline-none transition-colors shadow-sm"
                />
              </div>

                      <button
                        type="submit"
                        disabled={isScraping || !urlInput.trim() || role === 'viewer'}
                        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-bold transition-all shadow-md shadow-indigo-600/20 cursor-pointer"
                      >
                        {isScraping ? (
                          <>
                            <Sparkles className="w-4 h-4 animate-spin" /> Fetching & Indexing URL...
                          </>
                        ) : (
                          <>
                            <Plus className="w-4 h-4" /> Add Website URL to RAG
                          </>
                        )}
                      </button>
                    </form>
                  </div>
                </div>

                {/* Saved Sources List Section */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-200 dark:border-zinc-800/80 pb-3">
                    <div>
                      <h2 className="text-base font-extrabold text-slate-900 dark:text-zinc-100 flex items-center gap-2">
                        RAG Vector Index Sources
                        <span className="text-xs text-slate-500 dark:text-zinc-500 font-bold">
                          ({filteredSources.length} indexed)
                        </span>
                      </h2>
                      <p className="text-xs text-slate-500 dark:text-zinc-400 font-medium">
                        Active context documents automatically retrieved via cosine similarity search during AI campaign generation.
                      </p>
                    </div>

                    <div className="relative w-64">
                      <Search className="w-4 h-4 text-slate-400 dark:text-zinc-500 absolute left-3 top-2.5" />
                      <input
                        type="text"
                        placeholder="Filter saved sources..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full bg-white dark:bg-zinc-900 border border-slate-300 dark:border-zinc-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-slate-900 dark:text-zinc-100 placeholder-slate-400 dark:placeholder-zinc-500 focus:outline-none shadow-sm"
                      />
                    </div>
                  </div>

                  <div className="space-y-2.5">
                    {isLoading ? (
                      <div className="p-8 text-center bg-white dark:bg-zinc-900/30 rounded-2xl border border-slate-200 dark:border-zinc-800 text-slate-400 dark:text-zinc-400 text-xs space-y-2 shadow-sm">
                        <Sparkles className="w-6 h-6 text-indigo-600 dark:text-indigo-400 animate-spin mx-auto" />
                        <p className="font-bold">Loading knowledge vector index...</p>
                      </div>
                    ) : error ? (
                      <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-center space-y-2">
                        <p className="text-xs text-rose-600 dark:text-rose-300 font-bold">{error}</p>
                        {onRefetch && (
                          <button
                            onClick={onRefetch}
                            className="px-3 py-1 rounded-lg bg-rose-600 text-white text-xs font-bold transition-colors cursor-pointer"
                          >
                            Retry Loading
                          </button>
                        )}
                      </div>
                    ) : filteredSources.length === 0 ? (
                      <div className="p-8 text-center bg-white dark:bg-zinc-900/30 rounded-2xl border border-slate-200 dark:border-zinc-800 text-slate-500 dark:text-zinc-500 text-xs font-medium shadow-sm">
                        No saved knowledge sources found for this workspace. Upload documents or add a URL to enable RAG retrieval.
                      </div>
                    ) : (
                      filteredSources.map((source) => {
                        const srcWs = workspaces?.find((w) => w.id === source.workspaceId);
                        return (
                          <div
                            key={source.id}
                            className="p-4 rounded-2xl bg-white dark:bg-zinc-900/60 border border-slate-200 dark:border-zinc-800 hover:border-slate-300 dark:hover:border-zinc-700/80 flex items-center justify-between transition-all group shadow-sm"
                          >
                            <div className="flex items-center gap-3.5 min-w-0">
                              {renderSourceIcon(source.type)}

                              <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <h4 className="text-xs font-bold text-slate-900 dark:text-zinc-200 group-hover:text-indigo-600 dark:group-hover:text-white truncate transition-colors">
                                    {source.name}
                                  </h4>
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 uppercase">
                                    {source.type}
                                  </span>
                                  {srcWs && (
                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold text-white ${srcWs.brandColor} shadow-xs`}>
                                      {srcWs.name}
                                    </span>
                                  )}
                                </div>
                                <p className="text-[11px] text-slate-500 dark:text-zinc-400 mt-0.5 truncate font-medium">
                                  Added: {source.dateAdded} • {source.sizeOrTokens || 'RAG Vector Index'}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-3">
                              <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-200 dark:border-emerald-500/20">
                                <CheckCircle2 className="w-3.5 h-3.5" /> RAG Vectorized
                              </span>
                              <HasPermission allowedRoles={['admin', 'editor']}>
                                <button
                                  onClick={() => onDeleteSource(String(source.id))}
                                  className="p-1.5 rounded-lg text-slate-400 dark:text-zinc-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors cursor-pointer"
                                  title="Delete Source & Cascaded Vectors"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </HasPermission>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
      </div>
    </div>
  );
};
