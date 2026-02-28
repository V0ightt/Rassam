import { NextRequest, NextResponse } from "next/server";
import { chatStreamWithContext } from "@/lib/ai";
import { getFileContent } from "@/lib/github";
import { getProviderAvailability } from "@/lib/llm";
import { normalizeProviderId } from "@/lib/llm/registry";

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
        /[`"]?([a-zA-Z0-9_\-./]+\.[a-zA-Z]+)[`"]? (?:file )?content/i,
    ];
    
    let specificFile: string | null = null;
    for (const pattern of filePatterns) {
        const match = lowerMessage.match(pattern);
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
            context,
            repoDetails,
            allNodesContext,
            canvasContext,
            modelSettings,
            history,
        } = await req.json();

        if (!message) {
            return NextResponse.json({ error: "Message is required" }, { status: 400 });
        }

        // Detect what content we need to fetch
        const { needsReadme, specificFile } = detectFileQueryIntent(message);
        
        let readmeContent: string | null = null;
        let fileContent: string | null = null;
        
        // Fetch README if needed and repo details available
        if (needsReadme && repoDetails?.owner && repoDetails?.repo) {
            try {
                // Try common README filenames
                const readmeFiles = ['README.md', 'readme.md', 'README.MD', 'Readme.md', 'README', 'readme'];
                for (const filename of readmeFiles) {
                    const content = await getFileContent(repoDetails.owner, repoDetails.repo, filename);
                    if (content) {
                        readmeContent = content;
                        break;
                    }
                }
            } catch (e) {
                console.log('Could not fetch README:', e);
            }
        }
        
        // Fetch specific file if requested
        if (specificFile && repoDetails?.owner && repoDetails?.repo) {
            try {
                fileContent = await getFileContent(repoDetails.owner, repoDetails.repo, specificFile);
            } catch (e) {
                console.log('Could not fetch specific file:', e);
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
                .filter((m: any) => 
                    m && typeof m.content === 'string' && 
                    (m.role === 'user' || m.role === 'assistant')
                )
                .map((m: any) => ({ role: m.role as 'user' | 'assistant', content: m.content }))
                .slice(-MAX_HISTORY)
            : undefined;

        const tokenStream = chatStreamWithContext(
            message, 
            context, 
            repoDetails, 
            allNodesContext,
            canvasContext,
            readmeContent,
            specificFile ? { path: specificFile, content: fileContent } : null,
            {
                providerId,
                model,
                maxTokens,
                temperature,
            },
            sanitizedHistory
        );

        const encoder = new TextEncoder();
        const readable = new ReadableStream({
            async start(controller) {
                try {
                    for await (const token of tokenStream) {
                        controller.enqueue(encoder.encode(token));
                    }
                    controller.close();
                } catch (err) {
                    const errorMsg = err instanceof Error ? err.message : 'Streaming failed';
                    controller.enqueue(encoder.encode(`\n\n❌ Error: ${errorMsg}`));
                    controller.close();
                }
            },
        });

        return new Response(readable, {
            headers: {
                'Content-Type': 'text/plain; charset=utf-8',
                'Transfer-Encoding': 'chunked',
                'Cache-Control': 'no-cache',
                'X-Content-Type-Options': 'nosniff',
            },
        });

    } catch (error: any) {
        console.error("Chat API Error:", error);
        return NextResponse.json({ 
            error: "Failed to process chat",
            reply: "Sorry, I encountered an error processing your request. Please try again."
        }, { status: 500 });
    }
}
