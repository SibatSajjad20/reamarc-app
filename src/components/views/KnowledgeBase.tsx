import React, { useState, useRef, useMemo } from 'react';
import type { KnowledgeSource, Workspace } from '../../types';
import { useToast } from '../../context/ToastContext';
import {
  Brain,
  UploadCloud,
  Globe,
  Trash2,
  FileText,
  CheckCircle2,
  Plus,
  Sparkles,
  Search,
} from 'lucide-react';

interface KnowledgeBaseProps {
  sources: KnowledgeSource[];
  onAddSource: (newSource: KnowledgeSource) => void;
  onDeleteSource: (sourceId: string) => void;
  selectedWorkspace: Workspace | null;
}

export const KnowledgeBase: React.FC<KnowledgeBaseProps> = ({
  sources,
  onAddSource,
  onDeleteSource,
  selectedWorkspace,
}) => {
  const { addToast } = useToast();
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
  const handleAddUrl = (e: React.FormEvent) => {
    e.preventDefault();
    if (!urlInput.trim()) return;

    let cleanUrl = urlInput.trim();
    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
      cleanUrl = `https://${cleanUrl}`;
    }

    setIsScraping(true);

    setTimeout(() => {
      setIsScraping(false);
      const newSource: KnowledgeSource = {
        id: `src-${Date.now()}`,
        name: cleanUrl.replace(/^https?:\/\//, ''),
        type: 'url',
        sizeOrTokens: `${Math.floor(Math.random() * 2000 + 1200)} tokens extracted`,
        workspaceId: selectedWorkspace ? selectedWorkspace.id : 'ws-1',
        dateAdded: 'Just now',
        status: 'indexed',
      };

      onAddSource(newSource);
      addToast(
        'Website Scraped & Indexed! 🌐',
        `Extracted brand copy context from ${cleanUrl}`,
        'success'
      );
      setUrlInput('');
    }, 1200);
  };

  // PDF File Upload Handler
  const handleFileUpload = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];

    setIsUploading(true);

    setTimeout(() => {
      setIsUploading(false);
      const newSource: KnowledgeSource = {
        id: `src-${Date.now()}`,
        name: file.name,
        type: 'pdf',
        sizeOrTokens: `${(file.size / (1024 * 1024)).toFixed(1)} MB (${Math.floor(
          Math.random() * 30 + 10
        )} Pages)`,
        workspaceId: selectedWorkspace ? selectedWorkspace.id : 'ws-1',
        dateAdded: 'Just now',
        status: 'indexed',
      };

      onAddSource(newSource);
      addToast(
        'Document Processed! 📄',
        `"${file.name}" vector embeddings stored in AI memory.`,
        'success'
      );
    }, 1500);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    handleFileUpload(e.dataTransfer.files);
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-zinc-950 overflow-y-auto select-none">
      {/* Header Bar */}
      <header className="h-16 border-b border-zinc-800/80 px-6 flex items-center justify-between bg-zinc-950/80 backdrop-blur-md shrink-0 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-pink-500/10 border border-pink-500/20 text-pink-400">
            <Brain className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-bold text-zinc-100 flex items-center gap-2">
              Brand Knowledge Base
              <span className="text-xs font-normal text-zinc-400">
                ({workspaceSources.length} saved sources)
              </span>
            </h1>
            <p className="text-xs text-zinc-400">
              Train the AI engine on your specific brand voice, guidelines, and assets.
            </p>
          </div>
        </div>

        {selectedWorkspace && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-300">
            <span className="text-zinc-500">Active Workspace:</span>
            <span className="font-semibold text-zinc-100">{selectedWorkspace.name}</span>
          </div>
        )}
      </header>

      {/* Content Container */}
      <div className="p-6 space-y-8 max-w-6xl mx-auto w-full">
        {/* Upload & Scraping Tools Section */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Drag & Drop PDF Zone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-6 flex flex-col items-center justify-center text-center cursor-pointer transition-all duration-200 relative group overflow-hidden ${
              dragOver
                ? 'border-indigo-500 bg-indigo-500/10'
                : 'border-zinc-800 hover:border-indigo-500/50 bg-zinc-900/40 hover:bg-zinc-900/80'
            }`}
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={(e) => handleFileUpload(e.target.files)}
              accept=".pdf,.doc,.docx,.txt"
              className="hidden"
            />

            {isUploading ? (
              <div className="flex flex-col items-center space-y-2 py-4">
                <Sparkles className="w-8 h-8 text-indigo-400 animate-spin" />
                <p className="text-xs font-semibold text-zinc-200">Parsing PDF & Embeddings...</p>
              </div>
            ) : (
              <>
                <div className="p-3 rounded-2xl bg-zinc-800/80 group-hover:bg-indigo-600/20 text-indigo-400 transition-colors mb-3">
                  <UploadCloud className="w-6 h-6" />
                </div>
                <h3 className="text-sm font-bold text-zinc-200 group-hover:text-white">
                  Drop Brand PDFs & Brochures Here
                </h3>
                <p className="text-xs text-zinc-400 mt-1 max-w-xs">
                  Upload property brochures, brand manifestos, or style guidelines (PDF up to 25MB).
                </p>
                <span className="mt-3 text-[11px] font-semibold text-indigo-400 bg-indigo-500/10 px-3 py-1 rounded-full border border-indigo-500/20">
                  Browse Files
                </span>
              </>
            )}
          </div>

          {/* Web URL Scraper Card */}
          <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl p-6 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="p-2 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
                  <Globe className="w-5 h-5" />
                </div>
                <h3 className="text-sm font-bold text-zinc-200">Scrape Website Content</h3>
              </div>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Feed your live company site, landing pages, or blog posts directly into Reamarc's vector memory.
              </p>
            </div>

            <form onSubmit={handleAddUrl} className="mt-4 space-y-3">
              <div className="relative">
                <Globe className="w-4 h-4 text-zinc-500 absolute left-3 top-3" />
                <input
                  type="text"
                  placeholder="https://nova-realestate.com/about"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 focus:border-indigo-500 rounded-xl pl-9 pr-3 py-2.5 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none transition-colors"
                />
              </div>

              <button
                type="submit"
                disabled={isScraping || !urlInput.trim()}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-bold transition-all shadow-md shadow-indigo-600/20"
              >
                {isScraping ? (
                  <>
                    <Sparkles className="w-4 h-4 animate-spin" /> Scraping URL...
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4" /> Add Website URL
                  </>
                )}
              </button>
            </form>
          </div>
        </div>

        {/* Saved Sources List Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3">
            <div>
              <h2 className="text-base font-bold text-zinc-100 flex items-center gap-2">
                Saved Sources
                <span className="text-xs text-zinc-500 font-normal">
                  ({filteredSources.length} indexed)
                </span>
              </h2>
              <p className="text-xs text-zinc-400">
                Active context files used for AI copy generation.
              </p>
            </div>

            <div className="relative w-64">
              <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Filter saved sources..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="space-y-2.5">
            {filteredSources.length === 0 ? (
              <div className="p-8 text-center bg-zinc-900/30 rounded-2xl border border-zinc-800 text-zinc-500 text-xs">
                No saved sources found for this workspace.
              </div>
            ) : (
              filteredSources.map((source) => (
                <div
                  key={source.id}
                  className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 hover:border-zinc-700/80 flex items-center justify-between transition-all group"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div
                      className={`p-2.5 rounded-xl ${
                        source.type === 'pdf'
                          ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                          : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                      }`}
                    >
                      {source.type === 'pdf' ? (
                        <FileText className="w-5 h-5" />
                      ) : (
                        <Globe className="w-5 h-5" />
                      )}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="text-xs font-bold text-zinc-200 group-hover:text-white truncate">
                          {source.name}
                        </h4>
                        <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                          <CheckCircle2 className="w-3 h-3" /> Indexed
                        </span>
                      </div>
                      <p className="text-[11px] text-zinc-500 mt-0.5 flex items-center gap-3">
                        <span>{source.sizeOrTokens}</span>
                        <span>•</span>
                        <span>Added: {source.dateAdded}</span>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        onDeleteSource(source.id);
                        addToast(
                          'Source Removed',
                          `"${source.name}" has been deleted from brand memory.`,
                          'info'
                        );
                      }}
                      className="p-2 text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
                      title="Delete Source"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
