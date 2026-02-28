'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { 
  Send, 
  Bot, 
  User, 
  Sparkles, 
  FileCode, 
  Folder, 
  Trash2, 
  RefreshCw,
  ChevronDown,
  Copy,
  Check,
  Lightbulb,
  Code,
  Bug,
  FileQuestion,
  Plus,
  MessageSquare,
  Terminal,
  Settings,
  Package,
  History,
  ChevronRight,
  X,
  Square
} from 'lucide-react';
import { cn } from '@/lib/utils';
import MarkdownRenderer from './MarkdownRenderer';
import { motion, AnimatePresence } from 'framer-motion';
import { Edge, Node } from 'reactflow';
import { CanvasSyncSnapshot, ChatSession, ChatMessage, EdgeData } from '@/types';
import { LLMProviderId } from '@/lib/llm';
import {
  loadModelSettings,
  MODEL_SETTINGS_STORAGE_KEY,
  ModelSettings,
  ProviderStatusResponse,
  saveModelSettings,
  sanitizeModelSettings,
} from '@/lib/model-settings';

interface ChatbotProps {
  selectedNode: any | null;
  repoDetails?: { owner: string; repo: string } | null;
  allNodes?: Node[];
  allEdges?: Edge[];
  projectName?: string;
  layoutDirection?: 'TB' | 'LR';
  syncedCanvasContext?: CanvasSyncSnapshot | null;
  chatSessions: ChatSession[];
  activeChatSessionId: string | null;
  onUpdateMessages: (messages: ChatMessage[]) => void;
  onCreateNewChat: () => void;
  onSwitchChat: (sessionId: string) => void;
  onDeleteChat: (sessionId: string) => void;
}

// Quick action prompts
const quickActions = [
  { icon: Lightbulb, label: 'Explain this', prompt: 'Explain what this component does and how it works' },
  { icon: Code, label: 'Show usage', prompt: 'Show me how to use this component with a code example' },
  { icon: Bug, label: 'Find issues', prompt: 'What potential issues or improvements do you see in this code?' },
  { icon: FileQuestion, label: 'Dependencies', prompt: 'What are the dependencies and how does this connect to other parts?' },
];

// Global quick actions when no node is selected
const globalQuickActions = [
  { icon: Terminal, label: 'How to run', prompt: 'How do I run this project locally? Give me step-by-step instructions.' },
  { icon: Package, label: 'Dependencies', prompt: 'What are the main dependencies and technologies used in this project?' },
  { icon: Settings, label: 'Architecture', prompt: 'Explain the overall architecture and structure of this project.' },
  { icon: Code, label: 'Key features', prompt: 'What are the key features and main functionality of this project?' },
];

const defaultMessages: ChatMessage[] = [{
  id: '1',
  role: 'assistant', 
  content: "👋 Hi! I'm **Rassam**, your AI assistant for understanding code and flowcharts.\n\n**Quick tips:**\n- Create a project from GitHub URL or start with an empty canvas\n- Click on any node to ask questions about it\n- Use the canvas **Sync** button before chat for the latest graph context\n\nLet's explore your architecture together!",
  timestamp: new Date()
}];

export default function EnhancedChatbot({ 
  selectedNode, 
  repoDetails, 
  allNodes,
  allEdges,
  projectName,
  layoutDirection = 'TB',
  syncedCanvasContext,
  chatSessions,
  activeChatSessionId,
  onUpdateMessages,
  onCreateNewChat,
  onSwitchChat,
  onDeleteChat
}: ChatbotProps) {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [showQuickActions, setShowQuickActions] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showChatHistory, setShowChatHistory] = useState(false);
  const [providerStatus, setProviderStatus] = useState<ProviderStatusResponse | null>(null);
  const [modelSettings, setModelSettings] = useState<ModelSettings | null>(null);
  const [modelError, setModelError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Get current messages from active chat session
  const activeSession = chatSessions.find(s => s.id === activeChatSessionId);
  const messages = activeSession?.messages || defaultMessages;

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Show quick actions when node selection changes (without spamming chat)
  useEffect(() => {
    if (selectedNode) {
      setShowQuickActions(true);
    }
  }, [selectedNode?.id]);

  const syncSettings = useCallback((statusPayload: ProviderStatusResponse) => {
    const loaded = loadModelSettings();
    const sanitized = sanitizeModelSettings(loaded, statusPayload);
    setModelSettings(sanitized);
    saveModelSettings(sanitized);
  }, []);

  const fetchModelStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/settings/models', { cache: 'no-store' });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to load model settings');
      }

      const statusPayload = payload as ProviderStatusResponse;
      setProviderStatus(statusPayload);
      syncSettings(statusPayload);
      setModelError(null);
    } catch (error) {
      setModelError(error instanceof Error ? error.message : 'Could not load model settings');
      setModelSettings(loadModelSettings());
    }
  }, [syncSettings]);

  useEffect(() => {
    fetchModelStatus();
  }, [fetchModelStatus]);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== MODEL_SETTINGS_STORAGE_KEY) return;
      const loaded = loadModelSettings();
      const sanitized = sanitizeModelSettings(loaded, providerStatus);
      setModelSettings(sanitized);
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [providerStatus]);

  const enabledModelOptions = React.useMemo(() => {
    if (!providerStatus || !modelSettings) return [] as Array<{ providerId: LLMProviderId; model: string; label: string }>;

    const options: Array<{ providerId: LLMProviderId; model: string; label: string }> = [];
    for (const provider of providerStatus.providers) {
      if (!provider.available) continue;
      const enabledModels = modelSettings.enabledModels[provider.id] || [];
      for (const model of enabledModels) {
        if (!provider.models.includes(model)) continue;
        options.push({
          providerId: provider.id,
          model,
          label: `${provider.label} • ${model}`,
        });
      }
    }

    return options;
  }, [providerStatus, modelSettings]);

  const activeModelValue = modelSettings?.selectedProvider && modelSettings?.selectedModel
    ? `${modelSettings.selectedProvider}::${modelSettings.selectedModel}`
    : '';

  const activeModelLabel = enabledModelOptions.find(
    (option) => `${option.providerId}::${option.model}` === activeModelValue,
  )?.label || 'No enabled model';

  const updateSelectedModel = useCallback((value: string) => {
    if (!modelSettings) return;

    const [providerIdRaw, ...rest] = value.split('::');
    const selectedModel = rest.join('::').trim();
    const providerId = providerIdRaw as LLMProviderId;

    const next: ModelSettings = {
      ...modelSettings,
      selectedProvider: providerId,
      selectedModel,
    };
    const sanitized = sanitizeModelSettings(next, providerStatus);
    setModelSettings(sanitized);
    saveModelSettings(sanitized);
  }, [modelSettings, providerStatus]);

  const handleSend = async (messageText?: string) => {
    const text = messageText || input;
    if (!text.trim()) return;

    if (!modelSettings || enabledModelOptions.length === 0) {
      const unavailableMsg: ChatMessage = {
        id: Date.now().toString(),
        role: 'assistant',
        content: '❌ No enabled AI model is available. Open Settings and enable a validated model first.',
        timestamp: new Date(),
      };
      onUpdateMessages([...messages, unavailableMsg]);
      return;
    }

    const selectedOption = enabledModelOptions.find(
      (option) => option.providerId === modelSettings.selectedProvider && option.model === modelSettings.selectedModel,
    );

    if (!selectedOption) {
      const invalidSelectionMsg: ChatMessage = {
        id: Date.now().toString(),
        role: 'assistant',
        content: '❌ Your selected model is no longer valid. Please update it in Settings.',
        timestamp: new Date(),
      };
      onUpdateMessages([...messages, invalidSelectionMsg]);
      return;
    }

    const userMsg: ChatMessage = { 
      id: Date.now().toString(),
      role: 'user', 
      content: text,
      timestamp: new Date()
    };
    
    const updatedMessages = [...messages, userMsg];
    onUpdateMessages(updatedMessages);
    setInput("");
    setLoading(true);
    setShowQuickActions(false);

    try {
      const liveCanvasContext: CanvasSyncSnapshot = {
        syncedAt: new Date().toISOString(),
        project: {
          id: 'live-canvas',
          name: projectName || (repoDetails ? `${repoDetails.owner}/${repoDetails.repo}` : 'Untitled Project'),
          source: repoDetails ? 'github' : 'empty',
          repo: repoDetails ? `${repoDetails.owner}/${repoDetails.repo}` : undefined,
        },
        layoutDirection,
        selectedNodeId: selectedNode?.id || null,
        selectedNodeLabel: selectedNode?.data?.label || null,
        nodes: (allNodes || []).map(n => ({
          id: n.id,
          label: n.data?.label,
          category: n.data?.category,
          description: n.data?.description,
          files: n.data?.files,
          complexity: n.data?.complexity,
          dependencies: n.data?.dependencies,
          exports: n.data?.exports,
          position: n.position,
        })),
        edges: (allEdges || []).map(e => ({
          id: e.id,
          source: e.source,
          target: e.target,
          label: (e.data as EdgeData)?.label || (typeof e.label === 'string' ? e.label : undefined),
          type: (e.data as EdgeData)?.type || e.type,
          strength: (e.data as EdgeData)?.strength,
          direction: (e.data as EdgeData)?.direction,
        })),
      };

      const canvasContext = syncedCanvasContext || liveCanvasContext;

      const allNodesContext = canvasContext.nodes.map(n => ({
        id: n.id,
        label: n.label,
        category: n.category,
        description: n.description,
        files: n.files,
        complexity: n.complexity,
        dependencies: n.dependencies,
      }));

      // Create AbortController for this request
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: abortController.signal,
        body: JSON.stringify({ 
          message: text, 
          context: selectedNode ? selectedNode.data : null,
          repoDetails: repoDetails,
          canvasContext,
          allNodesContext: allNodesContext,
          modelSettings: {
            providerId: selectedOption.providerId,
            model: selectedOption.model,
            maxTokens: modelSettings.maxOutputTokens,
            temperature: modelSettings.temperature,
          },
          // Send conversation history (prior messages, excluding the just-added user message)
          history: messages
            .filter(m => m.role === 'user' || m.role === 'assistant')
            .map(m => ({ role: m.role, content: m.content })),
        })
      });

      if (!res.ok) {
        // Non-streaming error responses come back as JSON
        let errorMessage = 'Failed to process chat message';
        try {
          const data = await res.json();
          errorMessage = data?.reply || data?.error || errorMessage;
        } catch {
          // body isn't JSON
        }
        throw new Error(errorMessage);
      }

      // Stream the response
      const reader = res.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      const assistantMsgId = (Date.now() + 1).toString();
      let streamedContent = '';

      const assistantMsg: ChatMessage = {
        id: assistantMsgId,
        role: 'assistant',
        content: '',
        timestamp: new Date()
      };

      const messagesWithAssistant = [...updatedMessages, assistantMsg];
      onUpdateMessages(messagesWithAssistant);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        streamedContent += decoder.decode(value, { stream: true });

        const updated = messagesWithAssistant.map(m =>
          m.id === assistantMsgId ? { ...m, content: streamedContent } : m
        );
        onUpdateMessages(updated);
      }

      if (!streamedContent.trim()) {
        const updated = messagesWithAssistant.map(m =>
          m.id === assistantMsgId
            ? { ...m, content: "Sorry, I couldn't process that request." }
            : m
        );
        onUpdateMessages(updated);
      }
    } catch (error) {
      // Don't show error message if the user intentionally cancelled
      if (error instanceof DOMException && error.name === 'AbortError') {
        // Stream was cancelled by the user – keep whatever was streamed so far
        return;
      }
      const errorMsg: ChatMessage = { 
        id: (Date.now() + 1).toString(),
        role: 'assistant', 
        content: `❌ ${error instanceof Error ? error.message : 'Error communicating with AI. Please try again.'}`,
        timestamp: new Date()
      };
      onUpdateMessages([...updatedMessages, errorMsg]);
    } finally {
      abortControllerRef.current = null;
      setLoading(false);
    }
  };

  const handleStop = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  const copyMessage = useCallback((id: string, content: string) => {
    navigator.clipboard.writeText(content);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }, []);

  return (
    <div className="flex flex-col h-full bg-slate-900 border-l border-slate-800">
      {/* Header */}
      <div className="p-4 border-b border-slate-800 bg-gradient-to-r from-slate-900 to-slate-900/50">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-slate-100 flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-cyan-500/20">
              <Bot size={16} className="text-cyan-400"/> 
            </div>
            Rassam Chat
            <span className="text-[10px] px-1.5 py-0.5 bg-cyan-500/20 text-cyan-400 rounded-full">AI</span>
          </h3>
          <div className="flex items-center gap-1">
            <button 
              onClick={() => setShowChatHistory(!showChatHistory)}
              className={cn(
                "p-1.5 text-slate-500 hover:text-slate-300 hover:bg-slate-800 rounded-lg transition-colors",
                showChatHistory && "bg-blue-500/20 text-blue-400"
              )}
              title="Chat history"
            >
              <History size={14} />
            </button>
            <button 
              onClick={onCreateNewChat}
              className="p-1.5 text-slate-500 hover:text-slate-300 hover:bg-slate-800 rounded-lg transition-colors"
              title="New chat"
            >
              <Plus size={14} />
            </button>
          </div>
        </div>
        
        {/* Chat History Dropdown */}
        <AnimatePresence>
          {showChatHistory && chatSessions.length > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-3 border border-slate-700 rounded-lg overflow-hidden"
            >
              <div className="max-h-48 overflow-y-auto custom-scrollbar">
                {chatSessions.map((session) => (
                  <div
                    key={session.id}
                    className={cn(
                      "flex items-center justify-between px-3 py-2 cursor-pointer transition-all group",
                      session.id === activeChatSessionId
                        ? "bg-blue-500/20 border-l-2 border-blue-500"
                        : "hover:bg-slate-800 border-l-2 border-transparent"
                    )}
                    onClick={() => {
                      onSwitchChat(session.id);
                      setShowChatHistory(false);
                    }}
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <MessageSquare size={12} className={session.id === activeChatSessionId ? "text-blue-400" : "text-slate-500"} />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-slate-300 truncate">{session.title}</div>
                        <div className="text-[10px] text-slate-600">
                          {session.messages.length} messages • {new Date(session.updatedAt).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm('Delete this chat?')) {
                          onDeleteChat(session.id);
                        }
                      }}
                      className="p-1 text-slate-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        
        {/* Context indicator */}
        <AnimatePresence>
          {selectedNode && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-2 flex items-center gap-2 text-xs"
            >
              <div className={cn(
                "px-2 py-1 rounded-lg flex items-center gap-1.5",
                "bg-gradient-to-r from-blue-500/20 to-purple-500/20 border border-blue-500/30"
              )}>
                <Folder size={12} className="text-blue-400" />
                <span className="text-blue-300 font-medium">{selectedNode.data.label}</span>
                <span className="text-slate-500">•</span>
                <span className="text-slate-400">{selectedNode.data.files?.length || 0} files</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        
        {/* Repo info */}
        {repoDetails && (
          <div className="mt-2 text-[10px] text-slate-500 flex items-center gap-1">
            <FileCode size={10} />
            {repoDetails.owner}/{repoDetails.repo}
          </div>
        )}
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
        {messages.map((m) => (
          <motion.div 
            key={m.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn("flex gap-3 group", m.role === 'user' ? "flex-row-reverse" : "")}
          >
            <div className={cn(
              "w-8 h-8 rounded-full flex items-center justify-center shrink-0 shadow-lg", 
              m.role === 'user' 
                ? "bg-gradient-to-br from-slate-700 to-slate-800 border border-slate-600" 
                : "bg-gradient-to-br from-blue-600 to-blue-700"
            )}>
              {m.role === 'user' ? <User size={14}/> : <Sparkles size={14}/>}
            </div>
            <div className={cn(
              "rounded-2xl px-4 py-2 max-w-[85%] relative",
              m.role === 'user' 
                ? "bg-slate-800 text-slate-100 border border-slate-700" 
                : "bg-slate-800/50 border border-slate-700/50"
            )}>
              {m.role === 'assistant' ? (
                <MarkdownRenderer content={m.content} />
              ) : (
                <p className="text-sm">{m.content}</p>
              )}
              
              {/* Message actions */}
              <div className={cn(
                "absolute top-1 opacity-0 group-hover:opacity-100 transition-opacity",
                m.role === 'user' ? "left-2" : "right-2"
              )}>
                <button
                  onClick={() => copyMessage(m.id, m.content)}
                  className="p-1 text-slate-500 hover:text-slate-300 hover:bg-slate-700 rounded transition-colors"
                  title="Copy"
                >
                  {copiedId === m.id ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
                </button>
              </div>
              
              {/* Timestamp */}
              <div className={cn(
                "text-[9px] text-slate-600 mt-1",
                m.role === 'user' ? "text-right" : "text-left"
              )}>
                {new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          </motion.div>
        ))}
        
        {/* Loading indicator */}
        {loading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex gap-3"
          >
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-600 to-blue-700 flex items-center justify-center shadow-lg">
              <RefreshCw size={14} className="animate-spin" />
            </div>
            <div className="rounded-2xl px-4 py-3 bg-slate-800/50 border border-slate-700/50">
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <span className="flex gap-1">
                  <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                  <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                  <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                </span>
                Thinking...
              </div>
            </div>
          </motion.div>
        )}
        
        {/* Quick actions */}
        <AnimatePresence>
          {showQuickActions && selectedNode && !loading && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="mt-4"
            >
              <div className="text-[10px] text-slate-500 mb-2 flex items-center gap-1">
                <Sparkles size={10} />
                Quick actions for {selectedNode.data.label}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {quickActions.map((action, i) => (
                  <button
                    key={i}
                    onClick={() => handleSend(action.prompt)}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800/50 border border-slate-700/50 hover:border-blue-500/50 hover:bg-slate-800 text-slate-300 text-xs transition-all group"
                  >
                    <action.icon size={12} className="text-slate-500 group-hover:text-blue-400 transition-colors" />
                    {action.label}
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Global quick actions when no node selected */}
        <AnimatePresence>
          {showQuickActions && !selectedNode && allNodes && allNodes.length > 0 && !loading && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="mt-4"
            >
              <div className="text-[10px] text-slate-500 mb-2 flex items-center gap-1">
                <MessageSquare size={10} />
                Ask about the project
              </div>
              <div className="grid grid-cols-2 gap-2">
                {globalQuickActions.map((action, i) => (
                  <button
                    key={i}
                    onClick={() => handleSend(action.prompt)}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800/50 border border-slate-700/50 hover:border-green-500/50 hover:bg-slate-800 text-slate-300 text-xs transition-all group"
                  >
                    <action.icon size={12} className="text-slate-500 group-hover:text-green-400 transition-colors" />
                    {action.label}
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Input */}
      <div className="p-4 border-t border-slate-800 bg-gradient-to-t from-slate-900 to-slate-900/50">
        <div className="mb-2 flex items-center gap-2">
          <select
            value={activeModelValue}
            onChange={(e) => updateSelectedModel(e.target.value)}
            className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 outline-none focus:ring-2 focus:ring-cyan-500"
            disabled={enabledModelOptions.length === 0 || loading}
          >
            {enabledModelOptions.length === 0 ? (
              <option value="">No enabled model</option>
            ) : (
              enabledModelOptions.map((option) => (
                <option key={`${option.providerId}-${option.model}`} value={`${option.providerId}::${option.model}`}>
                  {option.label}
                </option>
              ))
            )}
          </select>
          <Link
            href="/settings"
            className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800"
          >
            Settings
          </Link>
        </div>
        {modelError && (
          <div className="text-[10px] text-amber-300 mb-2">{modelError}</div>
        )}
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <input
              ref={inputRef}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 pr-10 text-sm text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none placeholder-slate-500 transition-all"
              placeholder={selectedNode ? `Ask about ${selectedNode.data.label}...` : "Ask about the codebase..."}
              value={input}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
              onChange={(e) => setInput(e.target.value)}
            />
          </div>
          {loading ? (
            <button 
              onClick={handleStop}
              className="p-2.5 bg-red-600 hover:bg-red-500 text-white rounded-xl transition-all shadow-lg shadow-red-900/30 hover:shadow-red-900/50"
              title="Stop generating"
            >
              <Square size={18} />
            </button>
          ) : (
            <button 
              onClick={() => handleSend()}
              disabled={!input.trim()}
              className="p-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-900/30 hover:shadow-blue-900/50"
            >
              <Send size={18} />
            </button>
          )}
        </div>
        <div className="text-[9px] text-slate-600 mt-2 text-center">
          Press Enter to send • {activeModelLabel}
        </div>
      </div>
    </div>
  );
}
