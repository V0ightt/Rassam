'use client';

import Link from 'next/link';
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  Bot,
  Bug,
  Check,
  ChevronDown,
  Code,
  Copy,
  FileCode,
  FileQuestion,
  Folder,
  History,
  Lightbulb,
  MessageSquare,
  Package,
  Plus,
  RefreshCw,
  Send,
  Settings,
  Sparkles,
  Square,
  Terminal,
  Trash2,
  User,
  X,
} from 'lucide-react';
import type { Edge, Node } from 'reactflow';

import { selectCanvasContextForChat } from '@/lib/chat-request';
import { ChatStreamV2Decoder } from '@/lib/chat-stream-client';
import type { CanvasPatchContract } from '@/lib/contracts';
import { cn } from '@/lib/utils';
import type { SourceLocationNavigationHandler } from '@/lib/source-location';
import { isSensitiveSourcePath } from '@/lib/source-policy';
import type { LLMProviderId } from '@/lib/llm';
import {
  loadModelSettings,
  MODEL_SETTINGS_STORAGE_KEY,
  type ModelSettings,
  type ProviderStatusResponse,
  saveModelSettings,
  sanitizeModelSettings,
} from '@/lib/model-settings';
import type {
  CanvasSyncSnapshot,
  ChatMessage,
  ChatMode,
  ChatSession,
  EdgeData,
  NodeData,
  RepoDetails,
} from '@/types';

import MarkdownRenderer from './MarkdownRenderer';

interface ChatbotProps {
  projectId: string | null;
  graphRevision: number;
  selectedNode: Node<NodeData> | null;
  repoDetails?: RepoDetails | null;
  getCanvasState?: () => { nodes: Node[]; edges: Edge[] };
  projectName?: string;
  layoutDirection?: 'TB' | 'LR';
  syncedCanvasContext?: CanvasSyncSnapshot | null;
  liveCanvasLastModifiedAt?: string | null;
  chatSessions: ChatSession[];
  activeChatSessionId: string | null;
  onUpdateMessages: (projectId: string, sessionId: string, messages: ChatMessage[]) => void;
  onCreateNewChat: () => void;
  onSwitchChat: (sessionId: string) => void;
  onDeleteChat: (sessionId: string) => void;
  getCachedFiles?: (paths: string[]) => Promise<Record<string, string>>;
  cachedFilePaths?: Set<string>;
  availableFiles?: string[];
  onApplyCanvasPatch?: (patch: CanvasPatchContract) => { ok: boolean; message: string };
  onNavigateToSource?: SourceLocationNavigationHandler;
  onClose?: () => void;
}

interface PendingProposal {
  patch: CanvasPatchContract;
  projectId: string;
  sessionId: string;
}

const CHAT_MODE_STORAGE_KEY = 'repoAgent_chatMode';
const SOURCE_CONSENT_STORAGE_KEY = 'rassam.external-source-consent.v1';

const quickActions = [
  { icon: Lightbulb, label: 'Explain this', prompt: 'Explain what this component does and cite the source evidence.' },
  { icon: Code, label: 'Show usage', prompt: 'Show how this component is used, with source citations.' },
  { icon: Bug, label: 'Find issues', prompt: 'What potential issues do you see? Separate evidence from inference.' },
  { icon: FileQuestion, label: 'Dependencies', prompt: 'Trace this component’s dependencies and cite each relationship.' },
];

const globalQuickActions = [
  { icon: Terminal, label: 'How to run', prompt: 'How do I run this project locally? Cite the relevant files.' },
  { icon: Package, label: 'Dependencies', prompt: 'What are the main dependencies and where are they declared?' },
  { icon: Settings, label: 'Architecture', prompt: 'Explain the architecture using verified graph and source evidence.' },
  { icon: Code, label: 'Key features', prompt: 'What are the key features? Distinguish evidence from inference.' },
];

const defaultMessages: ChatMessage[] = [{
  id: 'rassam-welcome',
  role: 'assistant',
  content: "Hi! I’m **Rassam**. Select a component or relationship, then ask me to explain it from the pinned source evidence.",
  timestamp: new Date(0),
}];

function messageId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function proposalKey(projectId: string | null, sessionId: string | null): string {
  return `${projectId ?? 'none'}:${sessionId ?? 'none'}`;
}

export default memo(function EnhancedChatbot({
  projectId,
  graphRevision,
  selectedNode,
  repoDetails,
  getCanvasState,
  projectName,
  layoutDirection = 'TB',
  syncedCanvasContext,
  liveCanvasLastModifiedAt,
  chatSessions,
  activeChatSessionId,
  onUpdateMessages,
  onCreateNewChat,
  onSwitchChat,
  onDeleteChat,
  getCachedFiles,
  cachedFilePaths,
  availableFiles,
  onApplyCanvasPatch,
  onNavigateToSource,
  onClose,
}: ChatbotProps) {
  const [input, setInput] = useState('');
  const [activeRequestKey, setActiveRequestKey] = useState<string | null>(null);
  const [showQuickActions, setShowQuickActions] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showChatHistory, setShowChatHistory] = useState(false);
  const [providerStatus, setProviderStatus] = useState<ProviderStatusResponse | null>(null);
  const [modelSettings, setModelSettings] = useState<ModelSettings | null>(null);
  const [modelError, setModelError] = useState<string | null>(null);
  const [chatMode, setChatMode] = useState<ChatMode>('ask');
  const [sourceConsent, setSourceConsent] = useState(false);
  const [pendingProposals, setPendingProposals] = useState<Record<string, PendingProposal>>({});
  const [proposalMessage, setProposalMessage] = useState<string | null>(null);
  const [toolEvents, setToolEvents] = useState<Record<string, string[]>>({});
  const [showNewResponse, setShowNewResponse] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const nearBottomRef = useRef(true);

  const activeSession = chatSessions.find((session) => session.id === activeChatSessionId);
  const messages = activeSession?.messages ?? defaultMessages;
  const currentKey = proposalKey(projectId, activeChatSessionId);
  const pendingProposal = pendingProposals[currentKey];
  const currentToolEvents = toolEvents[currentKey] ?? [];
  const loading = activeRequestKey !== null;
  const loadingCurrentSession = activeRequestKey === currentKey;

  const messageVirtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 116,
    overscan: 6,
    getItemKey: (index) => messages[index]?.id ?? index,
  });

  const scrollToLatest = useCallback(() => {
    if (messages.length === 0) return;
    messageVirtualizer.scrollToIndex(messages.length - 1, { align: 'end' });
    setShowNewResponse(false);
  }, [messageVirtualizer, messages.length]);

  useEffect(() => {
    if (nearBottomRef.current) {
      requestAnimationFrame(scrollToLatest);
    } else if (messages.length > 0) {
      setShowNewResponse(true);
    }
  }, [messages, scrollToLatest]);

  useEffect(() => {
    if (!selectedNode) return;
    setShowQuickActions(true);
  }, [selectedNode]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const storedMode = window.localStorage.getItem(CHAT_MODE_STORAGE_KEY);
    if (storedMode === 'ask' || storedMode === 'agent') setChatMode(storedMode);
    setSourceConsent(window.localStorage.getItem(SOURCE_CONSENT_STORAGE_KEY) === 'accepted');
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') window.localStorage.setItem(CHAT_MODE_STORAGE_KEY, chatMode);
  }, [chatMode]);

  useEffect(() => () => abortControllerRef.current?.abort(), []);

  useEffect(() => {
    const textarea = inputRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
  }, [input]);

  const syncSettings = useCallback((statusPayload: ProviderStatusResponse) => {
    const sanitized = sanitizeModelSettings(loadModelSettings(), statusPayload);
    setModelSettings(sanitized);
    saveModelSettings(sanitized);
  }, []);

  const fetchModelStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/settings/models', { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.message ?? payload?.error ?? 'Failed to load model metadata');
      const statusPayload = payload as ProviderStatusResponse;
      setProviderStatus(statusPayload);
      syncSettings(statusPayload);
      setModelError(null);
    } catch (error) {
      setModelError(error instanceof Error ? error.message : 'Could not load model metadata');
      setModelSettings(loadModelSettings());
    }
  }, [syncSettings]);

  useEffect(() => {
    void fetchModelStatus();
  }, [fetchModelStatus]);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== MODEL_SETTINGS_STORAGE_KEY) return;
      setModelSettings(sanitizeModelSettings(loadModelSettings(), providerStatus));
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [providerStatus]);

  const enabledModelOptions = useMemo(() => {
    if (!providerStatus || !modelSettings) return [] as Array<{ providerId: LLMProviderId; model: string; label: string }>;
    return providerStatus.providers.flatMap((provider) => {
      if (!provider.available) return [];
      return (modelSettings.enabledModels[provider.id] ?? [])
        .filter((model) => provider.models.includes(model))
        .map((model) => ({ providerId: provider.id, model, label: `${provider.label} · ${model}` }));
    });
  }, [modelSettings, providerStatus]);

  const activeModelValue = modelSettings?.selectedProvider && modelSettings.selectedModel
    ? `${modelSettings.selectedProvider}::${modelSettings.selectedModel}`
    : '';
  const activeModelLabel = enabledModelOptions.find(
    (option) => `${option.providerId}::${option.model}` === activeModelValue,
  )?.label ?? 'No enabled model';

  const updateSelectedModel = useCallback((value: string) => {
    if (!modelSettings) return;
    const [providerIdRaw, ...modelParts] = value.split('::');
    const next = sanitizeModelSettings({
      ...modelSettings,
      selectedProvider: providerIdRaw as LLMProviderId,
      selectedModel: modelParts.join('::'),
    }, providerStatus);
    setModelSettings(next);
    saveModelSettings(next);
  }, [modelSettings, providerStatus]);

  const sanitizeHistoryContent = useCallback((content: string) => (
    content.replace(/^> \[tool\].*$/gm, '').replace(/\n{3,}/g, '\n\n').trim()
  ), []);

  const buildLiveCanvasContext = useCallback((): CanvasSyncSnapshot => {
    const canvasState = getCanvasState?.();
    const canvasNodes = canvasState?.nodes ?? [];
    const canvasEdges = canvasState?.edges ?? [];
    const activeSelection = selectedNode
      ? canvasNodes.find((node) => node.id === selectedNode.id) ?? null
      : null;

    return {
      syncedAt: liveCanvasLastModifiedAt ?? new Date().toISOString(),
      graphRevision,
      project: {
        id: projectId ?? 'live-canvas',
        name: projectName ?? (repoDetails ? `${repoDetails.owner}/${repoDetails.repo}` : 'Untitled Project'),
        source: repoDetails ? 'github' : 'empty',
        repo: repoDetails ? `${repoDetails.owner}/${repoDetails.repo}` : undefined,
      },
      layoutDirection,
      selectedNodeId: activeSelection?.id ?? null,
      selectedNodeLabel: activeSelection?.data?.label ?? null,
      nodes: canvasNodes.map((node) => ({
        id: node.id,
        label: node.data?.label,
        description: node.data?.description,
        category: node.data?.category,
        files: node.data?.files,
        complexity: node.data?.complexity,
        dependencies: node.data?.dependencies,
        exports: node.data?.exports,
        evidence: node.data?.evidence,
        confidence: node.data?.confidence,
        analysisLevel: node.data?.analysisLevel,
        position: node.position,
      })),
      edges: canvasEdges.map((edge) => {
        const data = edge.data as EdgeData | undefined;
        return {
          id: edge.id,
          source: edge.source,
          target: edge.target,
          label: data?.label ?? (typeof edge.label === 'string' ? edge.label : undefined),
          type: data?.type ?? edge.type,
          strength: data?.strength,
          direction: data?.direction,
          evidence: data?.evidence,
          confidence: data?.confidence,
        };
      }),
    };
  }, [getCanvasState, graphRevision, layoutDirection, liveCanvasLastModifiedAt, projectId, projectName, repoDetails, selectedNode]);

  const gatherCachedFiles = useCallback(async (text: string) => {
    if (!getCachedFiles || !cachedFilePaths?.size) return undefined;
    const relevantPaths = new Set<string>();
    for (const path of selectedNode?.data.files ?? []) {
      if (cachedFilePaths.has(path) && !isSensitiveSourcePath(path)) relevantPaths.add(path);
    }
    const lowerText = text.toLowerCase();
    for (const path of cachedFilePaths) {
      if (isSensitiveSourcePath(path)) continue;
      const fileName = path.split('/').pop()?.toLowerCase() ?? '';
      if ((fileName && lowerText.includes(fileName)) || text.includes(path)) relevantPaths.add(path);
    }
    for (const keyPath of ['README.md', 'readme.md', 'package.json', 'Cargo.toml', 'pyproject.toml', 'go.mod']) {
      if (cachedFilePaths.has(keyPath) && !isSensitiveSourcePath(keyPath)) relevantPaths.add(keyPath);
    }
    const paths = [...relevantPaths].slice(0, 15);
    if (!paths.length) return undefined;
    try {
      return await getCachedFiles(paths);
    } catch {
      return undefined;
    }
  }, [cachedFilePaths, getCachedFiles, selectedNode]);

  const handleSend = useCallback(async (messageText?: string) => {
    const text = (messageText ?? input).trim();
    const targetProjectId = projectId;
    const targetSessionId = activeSession?.id ?? activeChatSessionId;
    if (!text || !targetProjectId || !targetSessionId || loading) return;

    const targetKey = proposalKey(targetProjectId, targetSessionId);
    const selectedOption = enabledModelOptions.find(
      (option) => option.providerId === modelSettings?.selectedProvider && option.model === modelSettings.selectedModel,
    );
    if (!selectedOption || !modelSettings) {
      onUpdateMessages(targetProjectId, targetSessionId, [...messages, {
        id: messageId(), role: 'assistant',
        content: 'No enabled AI model is selected. Open Settings, enable a model, and use Test Model if needed.',
        timestamp: new Date(),
      }]);
      return;
    }
    if (repoDetails && !sourceConsent) {
      setModelError('Acknowledge source sharing before sending repository context to an external provider.');
      return;
    }

    const userMessage: ChatMessage = { id: messageId(), role: 'user', content: text, timestamp: new Date() };
    const assistantMessageId = messageId();
    const assistantMessage: ChatMessage = { id: assistantMessageId, role: 'assistant', content: '', timestamp: new Date() };
    const requestMessages = [...messages, userMessage, assistantMessage];
    onUpdateMessages(targetProjectId, targetSessionId, requestMessages);
    setInput('');
    setShowQuickActions(false);
    setProposalMessage(null);
    setToolEvents((current) => ({ ...current, [targetKey]: [] }));
    setPendingProposals((current) => {
      const next = { ...current };
      delete next[targetKey];
      return next;
    });
    setActiveRequestKey(targetKey);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    let streamedContent = '';
    let receivedPatch: CanvasPatchContract | null = null;
    let updateTimer: ReturnType<typeof setTimeout> | null = null;
    let lastUpdateAt = 0;

    const persistAssistant = (force = false) => {
      const persist = () => {
        lastUpdateAt = performance.now();
        onUpdateMessages(targetProjectId, targetSessionId, requestMessages.map((message) => (
          message.id === assistantMessageId ? { ...message, content: streamedContent } : message
        )));
      };
      const remaining = 34 - (performance.now() - lastUpdateAt);
      if (force || remaining <= 0) {
        if (updateTimer) clearTimeout(updateTimer);
        updateTimer = null;
        persist();
      } else if (!updateTimer) {
        updateTimer = setTimeout(() => {
          updateTimer = null;
          persist();
        }, remaining);
      }
    };

    try {
      const liveCanvasContext = buildLiveCanvasContext();
      const canvasContext = selectCanvasContextForChat(
        liveCanvasContext,
        syncedCanvasContext,
        liveCanvasLastModifiedAt,
      );
      const cachedFiles = await gatherCachedFiles(text);
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: abortController.signal,
        body: JSON.stringify({
          protocolVersion: 2,
          message: text,
          chatMode,
          baseGraphRevision: graphRevision,
          repoDetails: repoDetails ?? null,
          canvasContext,
          availableFiles,
          cachedFiles,
          modelSettings: {
            providerId: selectedOption.providerId,
            model: selectedOption.model,
            maxTokens: modelSettings.maxOutputTokens,
            temperature: modelSettings.temperature,
          },
          history: messages
            .filter((message) => message.role === 'user' || message.role === 'assistant')
            .map((message) => ({ role: message.role, content: sanitizeHistoryContent(message.content) })),
        }),
      });

      if (!response.ok) {
        let errorMessage = 'Rassam could not process this request.';
        try {
          const payload = await response.json();
          errorMessage = payload?.error?.message ?? payload?.reply ?? payload?.error ?? errorMessage;
        } catch {
          // Preserve the safe generic message for non-JSON failures.
        }
        throw new Error(errorMessage);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('The chat response did not contain a stream.');
      const decoder = new ChatStreamV2Decoder();

      const processEvents = (events: ReturnType<ChatStreamV2Decoder['push']>) => {
        for (const event of events) {
          if (event.type === 'status') {
            setToolEvents((current) => ({
              ...current,
              [targetKey]: [...(current[targetKey] ?? []), event.text].slice(-30),
            }));
          } else if (event.type === 'text') {
            streamedContent += event.text;
            persistAssistant();
          } else if (event.type === 'error') {
            streamedContent += `${streamedContent ? '\n\n' : ''}Error: ${event.text}`;
            persistAssistant();
          } else if (event.type === 'canvas_patch') {
            receivedPatch = event.patch;
            streamedContent += `${streamedContent ? '\n\n' : ''}${event.text ?? 'A validated canvas proposal is ready for review.'}`;
            persistAssistant();
          }
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        processEvents(decoder.push(value));
      }
      processEvents(decoder.finish());

      if (!streamedContent.trim()) {
        streamedContent = receivedPatch
          ? 'A validated canvas proposal is ready for review.'
          : 'Rassam completed the request without returning an answer.';
      }
      persistAssistant(true);
      if (receivedPatch) {
        setPendingProposals((current) => ({
          ...current,
          [targetKey]: { patch: receivedPatch!, projectId: targetProjectId, sessionId: targetSessionId },
        }));
      }
    } catch (error) {
      const cancelled = error instanceof DOMException && error.name === 'AbortError';
      streamedContent += `${streamedContent ? '\n\n' : ''}${cancelled
        ? '_Response stopped. No canvas changes were applied._'
        : `Error: ${error instanceof Error ? error.message : 'Could not communicate with the selected model.'}`}`;
      persistAssistant(true);
    } finally {
      if (updateTimer) clearTimeout(updateTimer);
      abortControllerRef.current = null;
      setActiveRequestKey((current) => current === targetKey ? null : current);
    }
  }, [activeChatSessionId, activeSession?.id, availableFiles, buildLiveCanvasContext, chatMode, enabledModelOptions, gatherCachedFiles, graphRevision, input, liveCanvasLastModifiedAt, loading, messages, modelSettings, onUpdateMessages, projectId, repoDetails, sanitizeHistoryContent, sourceConsent, syncedCanvasContext]);

  const applyProposal = useCallback(() => {
    if (!pendingProposal || !onApplyCanvasPatch) return;
    if (pendingProposal.patch.baseGraphRevision !== graphRevision) {
      setProposalMessage('The canvas changed after this proposal was created. Discard it and regenerate the proposal.');
      return;
    }
    const result = onApplyCanvasPatch(pendingProposal.patch);
    setProposalMessage(result.message);
    if (!result.ok) return;

    const session = chatSessions.find((candidate) => candidate.id === pendingProposal.sessionId);
    if (session) {
      onUpdateMessages(pendingProposal.projectId, pendingProposal.sessionId, [...session.messages, {
        id: messageId(),
        role: 'assistant',
        content: `Applied: ${pendingProposal.patch.summary}`,
        timestamp: new Date(),
      }]);
    }
    setPendingProposals((current) => {
      const next = { ...current };
      delete next[currentKey];
      return next;
    });
  }, [chatSessions, currentKey, graphRevision, onApplyCanvasPatch, onUpdateMessages, pendingProposal]);

  const discardProposal = useCallback(() => {
    setPendingProposals((current) => {
      const next = { ...current };
      delete next[currentKey];
      return next;
    });
    setProposalMessage('Proposal discarded. The canvas was not changed.');
  }, [currentKey]);

  const copyMessage = useCallback(async (id: string, content: string) => {
    await navigator.clipboard.writeText(content);
    setCopiedId(id);
    window.setTimeout(() => setCopiedId(null), 2_000);
  }, []);

  const setConsent = useCallback((accepted: boolean) => {
    setSourceConsent(accepted);
    setModelError(null);
    if (typeof window !== 'undefined') {
      if (accepted) window.localStorage.setItem(SOURCE_CONSENT_STORAGE_KEY, 'accepted');
      else window.localStorage.removeItem(SOURCE_CONSENT_STORAGE_KEY);
    }
  }, []);

  return (
    <section className="flex h-full min-h-0 flex-col border-l border-[var(--border-subtle)] bg-[var(--surface-base)]" aria-label="Rassam assistant">
      <header className="border-b border-[var(--border-subtle)] p-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-100">
            <span className="grid h-7 w-7 place-items-center rounded-md bg-cyan-500/15 text-cyan-300"><Bot size={16} aria-hidden="true" /></span>
            Rassam
            <span className="rounded border border-cyan-500/30 px-1.5 py-0.5 text-[10px] font-medium text-cyan-300">AI</span>
          </h2>
          <div className="flex items-center gap-1">
            <button type="button" aria-label="Toggle chat history" aria-expanded={showChatHistory} onClick={() => setShowChatHistory((value) => !value)} className="icon-button"><History size={16} /></button>
            <button type="button" aria-label="Start a new chat" onClick={onCreateNewChat} className="icon-button"><Plus size={16} /></button>
            <Link href="/settings" aria-label="Open AI settings" className="icon-button"><Settings size={16} /></Link>
            {onClose && <button type="button" aria-label="Close Rassam panel" onClick={onClose} className="icon-button"><X size={16} /></button>}
          </div>
        </div>

        {showChatHistory && (
          <div className="mt-3 max-h-52 overflow-y-auto rounded-md border border-[var(--border)]" role="list" aria-label="Chat sessions">
            {chatSessions.map((session) => (
              <div key={session.id} role="listitem" className={cn('group flex items-center border-l-2', session.id === activeChatSessionId ? 'border-cyan-400 bg-cyan-500/10' : 'border-transparent')}>
                <button type="button" className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left" aria-current={session.id === activeChatSessionId ? 'true' : undefined} onClick={() => { onSwitchChat(session.id); setShowChatHistory(false); }}>
                  <MessageSquare size={13} className="shrink-0 text-slate-500" />
                  <span className="min-w-0">
                    <span className="block truncate text-xs text-slate-200">{session.title}</span>
                    <span className="block text-[10px] text-slate-500">{session.messages.length} messages · {new Date(session.updatedAt).toLocaleDateString()}</span>
                  </span>
                </button>
                <button type="button" aria-label={`Delete chat ${session.title}`} onClick={() => { if (window.confirm('Delete this chat?')) onDeleteChat(session.id); }} className="icon-button mr-1 text-slate-500 hover:text-red-300"><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
        )}

        {selectedNode && (
          <div className="mt-2 flex items-center gap-2 rounded-md border border-cyan-500/25 bg-cyan-500/8 px-2 py-1.5 text-xs">
            <Folder size={13} className="text-cyan-300" aria-hidden="true" />
            <span className="min-w-0 truncate font-medium text-cyan-200">{selectedNode.data.label}</span>
            <span className="ml-auto shrink-0 text-slate-500">{selectedNode.data.files?.length ?? 0} files</span>
          </div>
        )}
        {repoDetails && <p className="mt-2 flex items-center gap-1 text-[10px] text-slate-500"><FileCode size={11} />{repoDetails.owner}/{repoDetails.repo} · {repoDetails.commitSha?.slice(0, 7) ?? 'unpinned'}</p>}
      </header>

      <div
        ref={scrollRef}
        className="relative flex-1 overflow-y-auto px-3 py-3 custom-scrollbar"
        role="log"
        aria-live="polite"
        aria-busy={loadingCurrentSession}
        onScroll={(event) => {
          const element = event.currentTarget;
          nearBottomRef.current = element.scrollHeight - element.scrollTop - element.clientHeight < 80;
          if (nearBottomRef.current) setShowNewResponse(false);
        }}
      >
        <div className="relative w-full" style={{ height: messageVirtualizer.getTotalSize() }}>
          {messageVirtualizer.getVirtualItems().map((virtualRow) => {
            const message = messages[virtualRow.index];
            return (
              <article
                key={message.id}
                ref={messageVirtualizer.measureElement}
                data-index={virtualRow.index}
                className={cn('absolute left-0 top-0 flex w-full gap-2 pb-3', message.role === 'user' && 'flex-row-reverse')}
                style={{ transform: `translateY(${virtualRow.start}px)` }}
              >
                <span className={cn('grid h-7 w-7 shrink-0 place-items-center rounded-full border', message.role === 'user' ? 'border-slate-600 bg-slate-800' : 'border-cyan-500/30 bg-cyan-500/15 text-cyan-300')}>
                  {message.role === 'user' ? <User size={13} /> : <Sparkles size={13} />}
                </span>
                <div className="group/message min-w-0 max-w-[87%] rounded-lg border border-slate-700/70 bg-slate-800/55 px-3 py-2">
                  {message.role === 'assistant'
                    ? <MarkdownRenderer content={message.content || (loadingCurrentSession ? 'Working…' : '')} onNavigateToSource={onNavigateToSource} />
                    : <p className="whitespace-pre-wrap text-sm text-slate-100">{message.content}</p>}
                  <div className="mt-1 flex items-center justify-between gap-3 text-[9px] text-slate-500">
                    <time>{new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
                    <button type="button" className="rounded p-1 opacity-0 transition-opacity group-focus-within/message:opacity-100 group-hover/message:opacity-100" aria-label="Copy message" onClick={() => void copyMessage(message.id, message.content)}>
                      {copiedId === message.id ? <Check size={12} className="text-emerald-300" /> : <Copy size={12} />}
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        {loadingCurrentSession && (
          <div className="mb-3 flex items-center gap-2 rounded-md border border-slate-700 bg-slate-800/50 p-2 text-xs text-slate-300" role="status">
            <RefreshCw size={14} className="animate-spin text-cyan-300" /> Rassam is working…
          </div>
        )}

        {currentToolEvents.length > 0 && (
          <details className="mb-3 rounded-md border border-slate-700 bg-slate-900/50 text-xs">
            <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-slate-300"><ChevronDown size={13} />Tool progress ({currentToolEvents.length})</summary>
            <ol className="space-y-1 border-t border-slate-700 px-3 py-2 text-slate-400">
              {currentToolEvents.map((event, index) => <li key={`${index}-${event}`}>{event}</li>)}
            </ol>
          </details>
        )}

        {pendingProposal && (
          <section className="mb-3 rounded-md border border-cyan-500/40 bg-cyan-500/8 p-3" aria-label="Canvas change proposal">
            <h3 className="text-xs font-semibold text-cyan-200">Review proposed canvas changes</h3>
            <p className="mt-1 text-xs text-slate-300">{pendingProposal.patch.summary}</p>
            <dl className="mt-2 grid grid-cols-3 gap-2 text-center text-[10px] text-slate-400">
              <div><dt>Operations</dt><dd className="text-sm text-slate-100">{pendingProposal.patch.operations.length}</dd></div>
              <div><dt>Nodes</dt><dd className="text-sm text-slate-100">{pendingProposal.patch.affectedNodeIds.length}</dd></div>
              <div><dt>Edges</dt><dd className="text-sm text-slate-100">{pendingProposal.patch.affectedEdgeIds.length}</dd></div>
            </dl>
            <div className="mt-3 flex gap-2">
              <button type="button" onClick={applyProposal} className="min-h-10 flex-1 rounded-md bg-cyan-500 px-3 text-xs font-semibold text-slate-950 hover:bg-cyan-400">Apply</button>
              <button type="button" onClick={discardProposal} className="min-h-10 flex-1 rounded-md border border-slate-600 px-3 text-xs text-slate-200 hover:bg-slate-800">Discard</button>
            </div>
          </section>
        )}
        {proposalMessage && <p className="mb-3 rounded-md border border-slate-700 px-3 py-2 text-xs text-slate-300" role="status">{proposalMessage}</p>}

        {showQuickActions && !loading && (
          <div className="grid grid-cols-2 gap-2 pb-2">
            {(selectedNode ? quickActions : globalQuickActions).map((action) => (
              <button key={action.label} type="button" onClick={() => void handleSend(action.prompt)} className="flex min-h-10 items-center gap-2 rounded-md border border-slate-700 bg-slate-800/45 px-3 text-left text-xs text-slate-300 hover:border-cyan-500/50">
                <action.icon size={13} className="text-cyan-300" />{action.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {showNewResponse && <button type="button" onClick={scrollToLatest} className="mx-auto -mt-12 mb-2 rounded-full border border-cyan-500/40 bg-slate-900 px-3 py-1.5 text-xs text-cyan-200 shadow-lg">New response</button>}

      <footer className="border-t border-[var(--border-subtle)] p-3">
        <div className="mb-2 flex gap-2">
          <label className="sr-only" htmlFor="rassam-model">AI model</label>
          <select id="rassam-model" value={activeModelValue} onChange={(event) => updateSelectedModel(event.target.value)} disabled={!enabledModelOptions.length || loading} className="min-w-0 flex-1 rounded-md border border-slate-700 bg-slate-800 px-2 py-2 text-xs text-slate-200">
            {!enabledModelOptions.length
              ? <option value="">No enabled model</option>
              : enabledModelOptions.map((option) => <option key={`${option.providerId}-${option.model}`} value={`${option.providerId}::${option.model}`}>{option.label}</option>)}
          </select>
          <label className="sr-only" htmlFor="rassam-mode">Assistant mode</label>
          <select id="rassam-mode" value={chatMode} onChange={(event) => setChatMode(event.target.value as ChatMode)} disabled={loading} className="rounded-md border border-slate-700 bg-slate-800 px-2 py-2 text-xs text-slate-200">
            <option value="ask">Ask</option>
            <option value="agent">Propose changes</option>
          </select>
        </div>

        {repoDetails && (
          <label className="mb-2 flex gap-2 rounded-md border border-amber-500/25 bg-amber-500/5 p-2 text-[10px] leading-4 text-slate-300">
            <input type="checkbox" checked={sourceConsent} onChange={(event) => setConsent(event.target.checked)} className="mt-0.5 h-4 w-4 accent-cyan-400" />
            I understand that selected source excerpts are sent to {activeModelLabel}.
          </label>
        )}
        {modelError && <p className="mb-2 text-[10px] text-amber-300" role="alert">{modelError}</p>}

        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            rows={2}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                void handleSend();
              }
            }}
            placeholder={selectedNode ? `Ask about ${selectedNode.data.label}…` : 'Ask about the codebase…'}
            className="min-h-11 max-h-40 flex-1 resize-none rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500"
          />
          {loadingCurrentSession
            ? <button type="button" onClick={() => abortControllerRef.current?.abort()} aria-label="Stop response" className="grid min-h-11 min-w-11 place-items-center rounded-md bg-red-600 text-white hover:bg-red-500"><Square size={17} /></button>
            : <button type="button" onClick={() => void handleSend()} disabled={!input.trim() || loading} aria-label="Send message" className="grid min-h-11 min-w-11 place-items-center rounded-md bg-cyan-500 text-slate-950 hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-40"><Send size={17} /></button>}
        </div>
        <p className="mt-2 text-center text-[9px] text-slate-500">Enter to send · Shift+Enter for a new line · {activeModelLabel}</p>
      </footer>
    </section>
  );
});
