import { NextRequest, NextResponse } from "next/server";
import { streamChatResponse } from "@/lib/chat-agent";
import type { FileResolutionStrategy } from "@/lib/chat-file-resolution";
import {
    normalizeRepoPath,
    resolveAvailableFilePath,
    sanitizeAvailableFiles,
} from "@/lib/chat-file-resolution";
import { getFileContent } from "@/lib/github";
import { getProviderAvailability } from "@/lib/llm";
import { normalizeProviderId } from "@/lib/llm/registry";
import { ChatMode } from "@/types";

interface HistoryPayloadMessage {
    role: 'user' | 'assistant';
    content: string;
}

function parseNumber(value: unknown): number | undefined {
    if (typeof value === 'number') return value;
    if (typeof value === 'string' && value.trim() !== '') {
        const parsed = Number(value);
        if (!Number.isNaN(parsed)) return parsed;
    }
    return undefined;
}

// Detect if the question needs README or specific file content
function detectFileQueryIntent(message: string): { needsReadme: boolean; specificFile: string | null } {
    const lowerMessage = message.toLowerCase();
    
    // Questions that typically need README
    const readmeKeywords = [
        'how to run', 'how do i run', 'how can i run',
        'how to install', 'how do i install',
        'how to start', 'how do i start',
        'how to setup', 'how to set up', 'setup instructions',
        'getting started', 'quick start',
        'run locally', 'run this project', 'run the project',
        'install dependencies', 'install the project',
        'what is this project', 'what does this project',
        'project description', 'project overview',
        'documentation', 'readme', 'instructions',
        'prerequisites', 'requirements',
        'environment variables', 'env vars', '.env',
        'contribute', 'contributing',
        'license', 'usage',
    ];
    
    const needsReadme = readmeKeywords.some(kw => lowerMessage.includes(kw));
    
    // Detect specific file queries like "what's in src/app/page.tsx"
    const filePatterns = [
        /what(?:'s| is) (?:in|inside) (?:the )?[`"]?([a-zA-Z0-9_\-./]+\.[a-zA-Z]+)[`"]?/i,
        /show (?:me )?(?:the )?(?:content(?:s)? of )?[`"]?([a-zA-Z0-9_\-./]+\.[a-zA-Z]+)[`"]?/i,
        /read [`"]?([a-zA-Z0-9_\-./]+\.[a-zA-Z]+)[`"]?/i,
        /explain [`"]?([a-zA-Z0-9_\-./]+\.[a-zA-Z]+)[`"]?/i,
        /how .*?[`"]?([a-zA-Z0-9_\-./]+\.[a-zA-Z]+)[`"]?\s+works/i,
        /[`"]?([a-zA-Z0-9_\-./]+\.[a-zA-Z]+)[`"]? (?:file )?content/i,
    ];
    
    let specificFile: string | null = null;
    for (const pattern of filePatterns) {
        const match = message.match(pattern);
        if (match && match[1]) {
            specificFile = match[1];
            break;
        }
    }
    
    return { needsReadme, specificFile };
}

export async function POST(req: NextRequest) {
    try {
        const {
            message,
            chatMode,
            repoDetails,
            canvasContext,
            modelSettings,
            history,
            cachedFiles,
            availableFiles,
        } = await req.json();

        if (!message) {
            return NextResponse.json({ error: "Message is required" }, { status: 400 });
        }

        // Derive context from canvasContext using selectedNodeId (avoids redundant payload)
        const context = canvasContext?.selectedNodeId
            ? canvasContext.nodes?.find((n: { id: string }) => n.id === canvasContext.selectedNodeId) ?? null
            : null;

        // Detect what content we need to fetch
        const { needsReadme, specificFile } = detectFileQueryIntent(message);
        
        // Normalize cached files object
        const cached: Record<string, string> = (cachedFiles && typeof cachedFiles === 'object') ? cachedFiles : {};
        const availableFileList = sanitizeAvailableFiles(availableFiles, 2000);
        const knownFiles = sanitizeAvailableFiles(
            [...availableFileList, ...Object.keys(cached)],
            Math.max(availableFileList.length + Object.keys(cached).length, 2000),
        );

        const getCachedContent = (path: string): { resolvedPath: string; content: string } | null => {
            const normalizedPath = normalizeRepoPath(path);
            if (!normalizedPath) return null;
            if (Object.prototype.hasOwnProperty.call(cached, normalizedPath)) {
                return { resolvedPath: normalizedPath, content: cached[normalizedPath] };
            }

            const caseInsensitiveHit = Object.entries(cached).find(([cachedPath]) => (
                normalizeRepoPath(cachedPath).toLowerCase() === normalizedPath.toLowerCase()
            ));

            return caseInsensitiveHit
                ? {
                    resolvedPath: normalizeRepoPath(caseInsensitiveHit[0]),
                    content: caseInsensitiveHit[1],
                }
                : null;
        };

        const resolveAndReadFile = async (requestedPath: string): Promise<{
            path: string;
            content: string | null;
            source: 'cache' | 'github' | 'missing';
            resolvedPath?: string | null;
            resolutionStrategy?: FileResolutionStrategy;
            candidates?: string[];
        }> => {
            const normalizedRequestedPath = normalizeRepoPath(requestedPath);
            if (!normalizedRequestedPath) {
                return { path: requestedPath, content: null, source: 'missing', resolvedPath: null, resolutionStrategy: 'missing' };
            }

            const resolution = resolveAvailableFilePath(normalizedRequestedPath, knownFiles);
            if (resolution.status === 'ambiguous') {
                return {
                    path: normalizedRequestedPath,
                    content: null,
                    source: 'missing',
                    resolvedPath: null,
                    resolutionStrategy: resolution.resolutionStrategy,
                    candidates: resolution.candidates,
                };
            }

            const resolvedPath = resolution.status === 'resolved'
                ? resolution.resolvedPath
                : normalizedRequestedPath;
            const cachedHit = getCachedContent(resolvedPath);
            if (cachedHit) {
                return {
                    path: normalizedRequestedPath,
                    content: cachedHit.content,
                    source: 'cache',
                    resolvedPath: cachedHit.resolvedPath,
                    resolutionStrategy: resolution.status === 'resolved'
                        ? resolution.resolutionStrategy
                        : 'exact',
                };
            }

            if (repoDetails?.owner && repoDetails?.repo) {
                try {
                    const content = await getFileContent(repoDetails.owner, repoDetails.repo, resolvedPath);
                    if (content !== null) {
                        return {
                            path: normalizedRequestedPath,
                            content,
                            source: 'github',
                            resolvedPath,
                            resolutionStrategy: resolution.status === 'resolved'
                                ? resolution.resolutionStrategy
                                : 'exact',
                        };
                    }
                } catch (e) {
                    console.log('Could not fetch specific file:', e);
                }
            }

            return {
                path: normalizedRequestedPath,
                content: null,
                source: 'missing',
                resolvedPath: resolution.status === 'resolved' ? resolvedPath : null,
                resolutionStrategy: resolution.resolutionStrategy,
            };
        };

        let readmeContent: string | null = null;
        let specificFilePayload: {
            path: string;
            content: string | null;
            resolvedPath?: string | null;
            resolutionStrategy?: FileResolutionStrategy;
            candidates?: string[];
        } | null = null;
        
        // Fetch README – prefer cached version
        if (needsReadme) {
            const readmeKeys = ['README.md', 'readme.md', 'README.MD', 'Readme.md', 'README', 'readme'];
            for (const key of readmeKeys) {
                if (Object.prototype.hasOwnProperty.call(cached, key)) {
                    readmeContent = cached[key];
                    break;
                }
            }
            // Fall back to GitHub if not cached
            if (readmeContent === null && repoDetails?.owner && repoDetails?.repo) {
                try {
                    for (const filename of readmeKeys) {
                        const content = await getFileContent(repoDetails.owner, repoDetails.repo, filename);
                        if (content !== null) {
                            readmeContent = content;
                            break;
                        }
                    }
                } catch (e) {
                    console.log('Could not fetch README:', e);
                }
            }
        }
        
        // Fetch specific file – prefer cached version
        if (specificFile) {
            const resolvedFile = await resolveAndReadFile(specificFile);
            specificFilePayload = {
                path: resolvedFile.path,
                content: resolvedFile.content,
                resolvedPath: resolvedFile.resolvedPath || null,
                resolutionStrategy: resolvedFile.resolutionStrategy,
                candidates: resolvedFile.candidates,
            };
        }

        // Build supplementary cached files context (beyond README and specificFile)
        const supplementaryFiles: Record<string, string> = {};
        const excludedSpecificPath = specificFilePayload?.resolvedPath || specificFilePayload?.path || specificFile || null;
        for (const [path, content] of Object.entries(cached)) {
            if (excludedSpecificPath && normalizeRepoPath(path) === normalizeRepoPath(excludedSpecificPath)) continue;
            if (/readme/i.test(path) && readmeContent !== null) continue;
            if (typeof content === 'string') {
                supplementaryFiles[path] = content;
            }
        }

        const providerId = normalizeProviderId(modelSettings?.providerId ?? null);
        const model = typeof modelSettings?.model === 'string' && modelSettings.model.trim()
            ? modelSettings.model.trim()
            : null;
        const maxTokens = parseNumber(modelSettings?.maxTokens);
        const temperature = parseNumber(modelSettings?.temperature);

        if (providerId) {
            const availability = await getProviderAvailability(providerId, model || undefined);

            if (!availability.models.includes(model || availability.models[0])) {
                return NextResponse.json({
                    error: "Selected model is not available",
                    reply: `Selected model is not available for ${availability.label}.`,
                }, { status: 400 });
            }

            if (!availability.available) {
                return NextResponse.json({
                    error: "Selected provider is unavailable",
                    reply: availability.reason || "Selected provider is unavailable. Open Settings to fix it.",
                }, { status: 400 });
            }
        }

        // Sanitize history: keep last 20 messages, validate shape
        const MAX_HISTORY = 20;
        const sanitizedHistory = Array.isArray(history)
            ? history
                .filter((m: unknown): m is HistoryPayloadMessage => {
                    if (!m || typeof m !== 'object') return false;
                    const message = m as Partial<HistoryPayloadMessage>;
                    return typeof message.content === 'string' &&
                        (message.role === 'user' || message.role === 'assistant');
                })
                .map((m) => ({ role: m.role, content: m.content }))
                .slice(-MAX_HISTORY)
            : undefined;

        const mode: ChatMode = chatMode === 'agent' ? 'agent' : 'ask';

        const readFile = async (requestedPath: string) => {
            return resolveAndReadFile(requestedPath);
        };

        const eventStream = streamChatResponse({
            message,
            mode,
            context: context || null,
            repoDetails,
            canvasContext,
            readmeContent,
            specificFile: specificFilePayload,
            runtimeSettings: {
                providerId,
                model,
                maxTokens,
                temperature,
            },
            history: sanitizedHistory,
            cachedFiles: supplementaryFiles,
            readFile,
        });

        const encoder = new TextEncoder();
        const readable = new ReadableStream({
            async start(controller) {
                try {
                    for await (const event of eventStream) {
                        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
                    }
                    controller.close();
                } catch (err) {
                    const errorMsg = err instanceof Error ? err.message : 'Streaming failed';
                    controller.enqueue(encoder.encode(`${JSON.stringify({ type: 'error', text: errorMsg })}\n`));
                    controller.close();
                }
            },
        });

        return new Response(readable, {
            headers: {
                'Content-Type': 'application/x-ndjson; charset=utf-8',
                'Transfer-Encoding': 'chunked',
                'Cache-Control': 'no-cache',
                'X-Content-Type-Options': 'nosniff',
            },
        });

    } catch (error: unknown) {
        console.error("Chat API Error:", error);
        return NextResponse.json({ 
            error: "Failed to process chat",
            reply: "Sorry, I encountered an error processing your request. Please try again."
        }, { status: 500 });
    }
}
