/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, ChangeEvent, FormEvent, useEffect, DragEvent } from 'react';
import { 
  FileText, Upload, Database, Cpu, Activity, CheckCircle2, 
  Loader2, Search, ShieldCheck, ShieldAlert, Send, 
  ChevronDown, ChevronUp, BookOpen, MessageSquare,
  LayoutDashboard, PlusCircle, RefreshCw, X, ChevronLeft, ChevronRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import ingestionConfig from './config/ingestion_config.json';

interface IngestionResult {
  message: string;
  count: number;
  source: string;
}

interface SourceQuestion {
  text: string;
  metadata: {
    source: string;
    timestamp: string;
    subject?: string;
    class?: string;
  };
}

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  status?: 'VALID' | 'REJECTED';
  reason?: string;
  sources?: SourceQuestion[];
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'ingest' | 'chat' | 'database'>('ingest');
  
  // Ingestion State
  const [isUploading, setIsUploading] = useState(false);
  const [ingestResult, setIngestResult] = useState<IngestionResult | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [subject, setSubject] = useState('');
  const [className, setClassName] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Chat State
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [filterSubject, setFilterSubject] = useState('');
  const [filterClass, setFilterClass] = useState('');
  const [isQuerying, setIsQuerying] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Database State
  const [dbRecords, setDbRecords] = useState<any[]>([]);
  const [isLoadingDb, setIsLoadingDb] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<any | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);
  const [dbSearchQuery, setDbSearchQuery] = useState('');

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (activeTab === 'database') {
      fetchDatabase(currentPage, dbSearchQuery);
    }
  }, [activeTab, currentPage]);

  const fetchDatabase = async (page: number = 1, search: string = '') => {
    setIsLoadingDb(true);
    try {
      const response = await fetch(`/api/database?page=${page}&limit=10&search=${encodeURIComponent(search)}`);
      const result = await response.json();
      setDbRecords(result.data || []);
      setTotalPages(result.totalPages || 1);
      setTotalRecords(result.total || 0);
    } catch (err) {
      console.error('Failed to fetch database:', err);
    } finally {
      setIsLoadingDb(false);
    }
  };

  const handleDbSearch = (e: FormEvent) => {
    e.preventDefault();
    setCurrentPage(1);
    fetchDatabase(1, dbSearchQuery);
  };

  const handleFileUpload = async (file: File) => {
    if (!file) return;

    if (!subject || !className) {
      setUploadError('Subject and Class are mandatory. Please select them from the dropdowns.');
      return;
    }

    setIsUploading(true);
    setUploadError(null);
    setIngestResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('subject', subject);
      formData.append('class', className);

      const response = await fetch('/api/ingest', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to ingest document');
        }
        throw new Error(`Failed to ingest document (${response.status})`);
      }

      const data = await response.json();
      setIngestResult(data);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && (file.type === 'application/pdf' || file.type.startsWith('image/'))) {
      handleFileUpload(file);
    } else {
      setUploadError('Please upload a PDF file or an image');
    }
  };

  const handleQuery = async (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isQuerying) return;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: input
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsQuerying(true);

    try {
      const response = await fetch('/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          query: input,
          subject: filterSubject,
          class: filterClass
        }),
      });

      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        const text = await response.text();
        console.error('Non-JSON response:', text);
        throw new Error(`Server returned non-JSON response (${response.status})`);
      }

      const data = await response.json();
      
      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: data.answer || (data.status === 'REJECTED' ? '' : 'No answer received'),
        status: data.status,
        reason: data.reason || data.error,
        sources: data.raw_questions
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (err) {
      const errorMessage: Message = {
        id: crypto.randomUUID(),
        role: 'system',
        content: err instanceof Error ? err.message : 'An error occurred'
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsQuerying(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-bg text-text-ink font-sans">
      {/* Navigation Bar */}
      <nav className="bg-paper border-b border-black/5 px-10 py-4 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-accent/10 rounded-xl">
            <BookOpen className="w-6 h-6 text-accent" />
          </div>
          <h1 className="font-serif text-xl text-accent">Question Bank RAG</h1>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab('ingest')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm transition-all ${
              activeTab === 'ingest' 
                ? 'bg-accent text-white shadow-lg' 
                : 'text-text-muted hover:bg-black/5'
            }`}
          >
            <PlusCircle className="w-4 h-4" />
            Ingest Papers
          </button>
          <button
            onClick={() => setActiveTab('chat')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm transition-all ${
              activeTab === 'chat' 
                ? 'bg-accent text-white shadow-lg' 
                : 'text-text-muted hover:bg-black/5'
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            Ask Assistant
          </button>
          <button
            onClick={() => setActiveTab('database')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm transition-all ${
              activeTab === 'database' 
                ? 'bg-accent text-white shadow-lg' 
                : 'text-text-muted hover:bg-black/5'
            }`}
          >
            <Database className="w-4 h-4" />
            Database
          </button>
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 max-w-5xl mx-auto w-full p-10">
        <AnimatePresence mode="wait">
          {activeTab === 'ingest' ? (
            <motion.div
              key="ingest"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              <div className="text-center space-y-2">
                <h2 className="font-serif text-3xl text-accent">Ingest Question Papers</h2>
                <p className="text-text-muted">Upload PDFs to expand the knowledge base of your academic assistant.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div className="md:col-span-2 space-y-6">
                  <div 
                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={onDrop}
                    className={`card border-2 border-dashed transition-all flex flex-col items-center justify-center py-16 gap-4 cursor-pointer ${
                      isDragging ? 'border-accent bg-accent/5 scale-[1.02]' : 'border-[#dcdccf] hover:border-accent/50'
                    }`}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <div className={`p-4 rounded-full transition-colors ${isDragging ? 'bg-accent text-white' : 'bg-bg text-accent-soft'}`}>
                      {isUploading ? <Loader2 className="w-10 h-10 animate-spin" /> : <Upload className="w-10 h-10" />}
                    </div>
                    <div className="text-center">
                      <p className="font-medium text-lg">{isUploading ? 'Vectorizing...' : 'Drop PDF or Image here or click to browse'}</p>
                      <p className="text-sm text-text-muted">Supports question papers in PDF or Image format</p>
                    </div>
                    <input
                      type="file"
                      accept=".pdf,image/*"
                      className="hidden"
                      ref={fileInputRef}
                      onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
                    />
                  </div>

                  <AnimatePresence>
                    {ingestResult && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="p-6 bg-[#eef2e8] rounded-3xl border border-accent/10 flex items-center gap-4"
                      >
                        <div className="p-3 bg-white rounded-full text-accent shadow-sm">
                          <CheckCircle2 className="w-6 h-6" />
                        </div>
                        <div>
                          <p className="font-serif text-lg text-accent">Ingestion Successful</p>
                          <p className="text-sm text-text-muted">Stored {ingestResult.count} questions from {ingestResult.source}</p>
                        </div>
                      </motion.div>
                    )}
                    {uploadError && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="p-6 bg-red-50 rounded-3xl border border-red-100 flex items-center gap-4 text-red-600"
                      >
                        <ShieldAlert className="w-6 h-6" />
                        <p className="text-sm font-medium">{uploadError}</p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                <div className="space-y-6">
                  <div className="card space-y-4">
                    <h3 className="font-serif text-lg">Metadata</h3>
                    <div className="space-y-4">
                      <div className="space-y-1.5">
                        <label className="text-[11px] uppercase tracking-wider text-text-muted">Subject <span className="text-red-500">*</span></label>
                        <select
                          value={subject}
                          onChange={(e) => setSubject(e.target.value)}
                          className="w-full bg-bg border-none rounded-xl py-3 px-4 text-sm focus:ring-2 focus:ring-accent/20 outline-none appearance-none cursor-pointer"
                        >
                          <option value="">Select Subject</option>
                          {ingestionConfig.subjects.map(s => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[11px] uppercase tracking-wider text-text-muted">Class / Grade <span className="text-red-500">*</span></label>
                        <select
                          value={className}
                          onChange={(e) => setClassName(e.target.value)}
                          className="w-full bg-bg border-none rounded-xl py-3 px-4 text-sm focus:ring-2 focus:ring-accent/20 outline-none appearance-none cursor-pointer"
                        >
                          <option value="">Select Class</option>
                          {ingestionConfig.classes.map(c => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                  
                  <div className="stat-box">
                    <p className="text-[11px] uppercase tracking-wider text-text-muted mb-3">System Status</p>
                    <div className="text-[13px] space-y-2">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-[#4caf50]" />
                        <span>LanceDB: Connected</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-[#4caf50]" />
                        <span>Transformer: Ready</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          ) : activeTab === 'chat' ? (
            <motion.div
              key="chat"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="h-[calc(100vh-180px)] flex flex-col gap-6"
            >
              <div className="flex-1 overflow-y-auto pr-4 space-y-6 scrollbar-thin">
                {messages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center space-y-4 opacity-40">
                    <div className="p-6 bg-accent/5 rounded-full">
                      <MessageSquare className="w-16 h-16 text-accent" />
                    </div>
                    <div>
                      <h3 className="font-serif text-2xl">Academic Assistant</h3>
                      <p className="text-sm">Ask questions based on your ingested papers.</p>
                    </div>
                  </div>
                ) : (
                  messages.map((msg) => (
                    <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[85%] space-y-3 ${msg.role === 'user' ? 'text-right' : 'text-left'}`}>
                        {msg.status === 'REJECTED' ? (
                          <div className="p-4 bg-red-50 rounded-2xl border border-red-100 flex gap-4 text-left">
                            <ShieldAlert className="w-5 h-5 text-red-500 shrink-0" />
                            <div>
                              <p className="text-sm font-medium text-red-600">Gatekeeper Rejection</p>
                              <p className="text-xs text-red-500/80 mt-1">{msg.reason}</p>
                            </div>
                          </div>
                        ) : (
                          <div className={`p-5 rounded-3xl text-sm leading-relaxed shadow-sm ${
                            msg.role === 'user' 
                              ? 'bg-accent text-white rounded-tr-none' 
                              : 'bg-paper text-text-ink rounded-tl-none border border-black/5'
                          }`}>
                            <div className={`markdown-body ${
                              msg.role === 'user' ? 'prose prose-sm prose-invert max-w-none' : 'prose prose-sm max-w-none'
                            }`}>
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                {msg.content}
                              </ReactMarkdown>
                            </div>
                          </div>
                        )}

                        {msg.sources && msg.sources.length > 0 && (
                          <SourceAccordion sources={msg.sources} />
                        )}
                      </div>
                    </div>
                  ))
                )}
                {isQuerying && (
                  <div className="flex justify-start">
                    <div className="bg-paper p-4 rounded-3xl rounded-tl-none border border-black/5 flex gap-2 items-center">
                      <Loader2 className="w-4 h-4 animate-spin text-accent" />
                      <span className="text-xs text-text-muted">Consulting knowledge base...</span>
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              <div className="space-y-4">
                {/* Chat Filters */}
                <div className="flex flex-wrap items-center gap-4 px-2">
                  <div className="flex items-center gap-2">
                    <label className="text-[10px] uppercase font-bold text-accent/60 tracking-widest flex items-center gap-1">
                      <LayoutDashboard className="w-3 h-3" />
                      Filter:
                    </label>
                  </div>
                  <div className="flex gap-2">
                    <select
                      value={filterSubject}
                      onChange={(e) => setFilterSubject(e.target.value)}
                      className={`text-xs bg-paper border border-black/5 rounded-lg px-3 py-1.5 outline-none transition-all cursor-pointer ${filterSubject ? 'text-accent border-accent/20 bg-accent/5' : 'text-text-muted hover:bg-black/5'}`}
                    >
                      <option value="">All Subjects</option>
                      {ingestionConfig.subjects.map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                    <select
                      value={filterClass}
                      onChange={(e) => setFilterClass(e.target.value)}
                      className={`text-xs bg-paper border border-black/5 rounded-lg px-3 py-1.5 outline-none transition-all cursor-pointer ${filterClass ? 'text-accent border-accent/20 bg-accent/5' : 'text-text-muted hover:bg-black/5'}`}
                    >
                      <option value="">All Classes</option>
                      {ingestionConfig.classes.map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                    {(filterSubject || filterClass) && (
                      <button 
                        onClick={() => { setFilterSubject(''); setFilterClass(''); }}
                        className="text-[10px] uppercase font-bold text-red-400 hover:text-red-500 transition-colors px-2"
                      >
                        Clear Filters
                      </button>
                    )}
                  </div>
                </div>

                <form onSubmit={handleQuery} className="relative">
                  <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder={filterSubject ? `Ask about ${filterSubject}...` : "Ask about your question papers..."}
                    className="w-full bg-paper border border-black/5 rounded-2xl py-5 pl-8 pr-16 text-sm shadow-xl focus:ring-2 focus:ring-accent/20 outline-none transition-all"
                  />
                  <button
                    type="submit"
                    disabled={isQuerying || !input.trim()}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-3 bg-accent text-white rounded-xl shadow-lg hover:opacity-90 transition-all disabled:opacity-30"
                  >
                    <Send className="w-5 h-5" />
                  </button>
                </form>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="database"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                <div className="text-center md:text-left space-y-2">
                  <h2 className="font-serif text-3xl text-accent">Knowledge Base Contents</h2>
                  <p className="text-text-muted">A direct view of all ingested and vectorized question fragments ({totalRecords} fragments).</p>
                </div>
                
                <div className="flex w-full md:w-auto gap-2">
                  <form onSubmit={handleDbSearch} className="relative flex-1 md:w-64">
                    <input
                      type="text"
                      placeholder="Search fragments..."
                      className="w-full pl-10 pr-4 py-2 bg-white border border-black/5 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 transition-all font-serif"
                      value={dbSearchQuery}
                      onChange={(e) => setDbSearchQuery(e.target.value)}
                    />
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                  </form>
                  <button
                    onClick={() => fetchDatabase(currentPage, dbSearchQuery)}
                    disabled={isLoadingDb}
                    className="flex items-center gap-2 px-4 py-2 bg-accent/5 hover:bg-accent/10 text-accent rounded-xl transition-all disabled:opacity-50"
                  >
                    <RefreshCw className={`w-4 h-4 ${isLoadingDb ? 'animate-spin' : ''}`} />
                    <span className="hidden sm:inline">Refresh</span>
                  </button>
                </div>
              </div>

              <div className="card overflow-hidden !p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm border-collapse">
                    <thead>
                      <tr className="bg-black/5 text-text-muted text-[11px] uppercase tracking-wider">
                        <th className="px-6 py-4 font-bold border-b border-black/5">Source / Metadata</th>
                        <th className="px-6 py-4 font-bold border-b border-black/5">Content Fragment</th>
                        <th className="px-6 py-4 font-bold border-b border-black/5">Added</th>
                        <th className="px-6 py-4 font-bold border-b border-black/5 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-black/5">
                      {isLoadingDb ? (
                        <tr>
                          <td colSpan={4} className="px-6 py-12 text-center">
                            <Loader2 className="w-8 h-8 animate-spin text-accent mx-auto mb-2" />
                            <span className="text-text-muted">Loading vector records...</span>
                          </td>
                        </tr>
                      ) : dbRecords.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="px-6 py-12 text-center text-text-muted italic">
                            No data found. Ingest some question papers to see them here.
                          </td>
                        </tr>
                      ) : (
                        dbRecords.map((record) => (
                          <tr key={record.id} className="hover:bg-black/[0.02] transition-colors">
                            <td className="px-6 py-4 align-top">
                              <div className="space-y-1">
                                <div className="font-medium text-accent truncate max-w-[150px]" title={record.source}>
                                  {record.source}
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                  <span className="px-1.5 py-0.5 bg-accent/5 text-accent/70 text-[10px] rounded uppercase font-bold tracking-tight">
                                    {record.subject}
                                  </span>
                                  <span className="px-1.5 py-0.5 bg-accent/5 text-accent/70 text-[10px] rounded uppercase font-bold tracking-tight">
                                    Class {record.class_name}
                                  </span>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4 align-top">
                              <p className="line-clamp-2 text-text-ink/80 leading-relaxed italic text-xs">
                                "{record.text}"
                              </p>
                            </td>
                            <td className="px-6 py-4 align-top whitespace-nowrap text-text-muted text-[11px] uppercase tracking-tighter">
                              {new Date(record.timestamp).toLocaleDateString()}
                            </td>
                            <td className="px-6 py-4 align-top text-right">
                              <button 
                                onClick={() => setSelectedRecord(record)}
                                className="text-accent underline hover:text-accent/80 text-xs font-bold"
                              >
                                View Full
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                
                {/* Pagination Controls */}
                {totalPages > 1 && (
                  <div className="px-6 py-4 bg-black/[0.02] border-t border-black/5 flex items-center justify-between">
                    <p className="text-xs text-text-muted">
                      Showing page <span className="font-bold text-accent">{currentPage}</span> of <span className="font-bold text-accent">{totalPages}</span> ({totalRecords} total fragments)
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                        disabled={currentPage === 1 || isLoadingDb}
                        className="p-2 rounded-lg bg-white border border-black/5 hover:bg-black/5 transition-all disabled:opacity-30"
                        title="Previous Page"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                        disabled={currentPage === totalPages || isLoadingDb}
                        className="p-2 rounded-lg bg-white border border-black/5 hover:bg-black/5 transition-all disabled:opacity-30"
                        title="Next Page"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Record Detail Modal */}
              <AnimatePresence>
                {selectedRecord && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
                    onClick={() => setSelectedRecord(null)}
                  >
                    <motion.div
                      initial={{ scale: 0.95, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.95, opacity: 0 }}
                      className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="p-6 border-b border-black/5 flex justify-between items-start">
                        <div>
                          <h3 className="text-xl font-serif text-accent">{selectedRecord.source}</h3>
                          <div className="flex gap-2 mt-2">
                            <span className="px-2 py-0.5 bg-accent/10 text-accent text-xs rounded uppercase font-bold tracking-tighter">
                              {selectedRecord.subject}
                            </span>
                            <span className="px-2 py-0.5 bg-accent/10 text-accent text-xs rounded uppercase font-bold tracking-tighter">
                              Class {selectedRecord.class_name}
                            </span>
                          </div>
                        </div>
                        <button 
                          onClick={() => setSelectedRecord(null)}
                          className="p-2 hover:bg-black/5 rounded-full transition-colors"
                        >
                          <X className="w-5 h-5 text-text-muted" />
                        </button>
                      </div>
                      <div className="p-8 overflow-y-auto flex-1 bg-accent/[0.02]">
                        <div className="markdown-body prose prose-sm max-w-none">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {selectedRecord.text}
                          </ReactMarkdown>
                        </div>
                      </div>
                      <div className="p-6 border-t border-black/5 bg-white text-right">
                        <span className="text-xs text-text-muted font-mono">
                          RECORD_ID: {selectedRecord.id} • ADDED: {new Date(selectedRecord.timestamp).toLocaleString()}
                        </span>
                      </div>
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

function SourceAccordion({ sources }: { sources: SourceQuestion[] }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="space-y-2">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-text-muted hover:text-accent transition-colors ml-2"
      >
        {isOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        Source Questions ({sources.length})
      </button>
      
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-3 overflow-hidden"
          >
            {sources.map((q, i) => (
              <div key={i} className="p-4 bg-white/50 rounded-2xl border border-black/5 text-left">
                <div className="flex flex-wrap gap-2 mb-2">
                  <span className="tag tag-source">{q.metadata.source}</span>
                  {q.metadata.subject && <span className="tag">{q.metadata.subject}</span>}
                  {q.metadata.class && <span className="tag">{q.metadata.class}</span>}
                </div>
                <p className="text-xs text-text-muted italic leading-relaxed">
                  "{q.text}"
                </p>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

