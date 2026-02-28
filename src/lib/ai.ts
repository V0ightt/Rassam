import { NodeCategory } from "@/types";
import { getProvider } from "@/lib/llm";
import type { ChatHistoryMessage } from "@/lib/llm/types";

interface ChatRuntimeSettings {
  providerId?: string | null;
  model?: string | null;
  maxTokens?: number;
  temperature?: number;
}

function clampMaxTokens(value?: number): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return 2000;
  return Math.min(8192, Math.max(64, Math.floor(value)));
}

function clampTemperature(value?: number): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return 0.7;
  return Math.min(1, Math.max(0, value));
}

const VALID_NODE_CATEGORIES: NodeCategory[] = [
  // Code-based
  'api', 'component', 'config', 'database', 'auth',
  'utility', 'test', 'style', 'asset', 'documentation',
  'core', 'service', 'hook', 'context', 'middleware',
  'model', 'route',
  // System design
  'cache', 'queue', 'load-balancer', 'gateway', 'storage',
  'cdn', 'proxy', 'firewall', 'external-api', 'message-broker',
  'container', 'serverless', 'client',
  'default',
];

function normalizeCategory(rawCategory: unknown, files: string[]): NodeCategory {
  if (typeof rawCategory === 'string' && VALID_NODE_CATEGORIES.includes(rawCategory as NodeCategory)) {
    return rawCategory as NodeCategory;
  }

  return detectCategory(files);
}

// Category detection based on file paths
export function detectCategory(files: string[]): NodeCategory {
  const pathPatterns: { pattern: RegExp; category: NodeCategory }[] = [
    { pattern: /\/(api|routes?|endpoints?)\//i, category: 'api' },
    { pattern: /\/(components?|ui)\//i, category: 'component' },
    { pattern: /\/(hooks?|use[A-Z])/i, category: 'hook' },
    { pattern: /\/(context|providers?)\//i, category: 'context' },
    { pattern: /\/(services?|clients?)\//i, category: 'service' },
    { pattern: /\/(models?|schemas?|entities?|types?)\//i, category: 'model' },
    { pattern: /\/(auth|login|register|session)\//i, category: 'auth' },
    { pattern: /\/(db|database|prisma|drizzle|migrations?)\//i, category: 'database' },
    { pattern: /\/(middleware)\//i, category: 'middleware' },
    { pattern: /\/(config|settings?|env)\//i, category: 'config' },
    { pattern: /\/(utils?|helpers?|lib)\//i, category: 'utility' },
    { pattern: /\/(tests?|__tests__|spec|\.test\.|\.spec\.)/i, category: 'test' },
    { pattern: /\.(css|scss|sass|less|styled)$/i, category: 'style' },
    { pattern: /\.(png|jpg|jpeg|gif|svg|ico|webp)$/i, category: 'asset' },
    { pattern: /\.(md|mdx|txt|doc)$/i, category: 'documentation' },
    { pattern: /\/(core|kernel|engine)\//i, category: 'core' },
    { pattern: /\/(pages?|app)\//i, category: 'route' },
  ];

  for (const { pattern, category } of pathPatterns) {
    if (files.some(f => pattern.test(f))) {
      return category;
    }
  }

  return 'default';
}

// Estimate complexity based on number of files and file types
export function estimateComplexity(files: string[]): 'low' | 'medium' | 'high' {
  if (files.length <= 3) return 'low';
  if (files.length <= 8) return 'medium';
  return 'high';
}

export async function analyzeRepoStructure(fileStructure: string[]) {
  const prompt = `You are an expert software architect analyzing a codebase.

Given this list of files from a GitHub repository, organize them into logical architectural components.

IMPORTANT RULES:
1. Group related files into meaningful "Nodes" representing architectural components
2. Use these exact category values: api, component, config, database, auth, utility, test, style, asset, documentation, core, service, hook, context, middleware, model, route, cache, queue, load-balancer, gateway, storage, cdn, proxy, firewall, external-api, message-broker, container, serverless, client, default
3. Identify connections between nodes based on common patterns (e.g., components use hooks, api calls services, etc.)
4. Provide a clear, concise description for each node
5. Include ALL files in exactly one node
6. Edge types should be one of: dependency, import, calls, extends, implements, sends, receives, reads, writes
7. Edge strength: weak, normal, or strong

File List (${fileStructure.length} files):
${fileStructure.slice(0, 500).join("\n")}
${fileStructure.length > 500 ? `\n... and ${fileStructure.length - 500} more files` : ''}

Return JSON in this exact format:
{
  "nodes": [
    {
      "id": "unique-id",
      "label": "Human Readable Name",
      "description": "Clear description of what this component does",
      "category": "one of the category values above",
      "files": ["path/to/file1.ts", "path/to/file2.ts"],
      "complexity": "low|medium|high",
      "dependencies": ["external-package-names"],
      "exports": ["main-exports-like-functions-or-classes"]
    }
  ],
  "edges": [
    {
      "id": "edge-id",
      "source": "source-node-id",
      "target": "target-node-id",
      "label": "relationship description",
      "type": "dependency|import|calls|extends|implements",
      "strength": "weak|normal|strong"
    }
  ]
}`;

  try {
    const provider = getProvider();
    const content = await provider.generateStructure({
      system: "You are a helpful assistant that analyzes codebases and outputs valid JSON only. No markdown, no explanations, just JSON.",
      prompt,
      temperature: 0.3,
      json: true,
    });

    const result = JSON.parse(content || "{}");
    
    // Post-process to ensure categories are valid and add complexity if missing
    if (result.nodes) {
      result.nodes = result.nodes.map((node: any) => ({
        ...node,
        category: normalizeCategory(node.category, node.files || []),
        complexity: node.complexity || estimateComplexity(node.files || []),
      }));
    }

    return result;
  } catch (error) {
    console.error("DeepSeek Analysis Error:", error);
    return { nodes: [], edges: [] };
  }
}

function buildSystemMessage(
  context: any | null,
  repoDetails?: { owner: string; repo: string } | null,
  allNodesContext?: any[] | null,
  canvasContext?: any | null,
  readmeContent?: string | null,
  specificFile?: { path: string; content: string | null } | null,
  message?: string
): string {
  const snapshotNodes = canvasContext?.nodes || [];
  const normalizedNodes = snapshotNodes.length > 0 ? snapshotNodes : (allNodesContext || []);

  const projectOverview = normalizedNodes.length > 0
    ? `\n\nPROJECT OVERVIEW (${normalizedNodes.length} components):
${normalizedNodes.map((node: any) => `- **${node.label}** (${node.category || 'default'}): ${node.description || 'No description'} - ${node.files?.length || 0} files`).join('\n')}`
    : '';

  const snapshotEdges = canvasContext?.edges || [];
  const canvasStructure = canvasContext
    ? `\n\nCANVAS STRUCTURE:
- Project: ${canvasContext.project?.name || 'Untitled'}${canvasContext.project?.source ? ` (${canvasContext.project.source})` : ''}
- Layout: ${canvasContext.layoutDirection || 'TB'}
- Nodes: ${snapshotNodes.length}
- Edges: ${snapshotEdges.length}
- Selected Node: ${canvasContext.selectedNodeLabel || 'None'}
- Last Sync: ${canvasContext.syncedAt || 'Unknown'}

GRAPH RELATIONSHIPS:
${snapshotEdges.length > 0 ? snapshotEdges.slice(0, 120).map((edge: any) => `- ${edge.source} -> ${edge.target}${edge.label ? ` (${edge.label})` : ''}${edge.type ? ` [${edge.type}]` : ''}`).join('\n') : '- No edges defined yet.'}`
    : '';

  const readmeSection = readmeContent
    ? `\n\n📄 README.md CONTENT (Use this as the primary source for setup/installation instructions):\n\`\`\`markdown\n${readmeContent.slice(0, 8000)}${readmeContent.length > 8000 ? '\n... (truncated)' : ''}\n\`\`\``
    : '';

  const fileSection = specificFile?.content
    ? `\n\n📁 FILE CONTENT (${specificFile.path}):\n\`\`\`\n${specificFile.content.slice(0, 6000)}${specificFile.content.length > 6000 ? '\n... (truncated)' : ''}\n\`\`\``
    : specificFile?.path
      ? `\n\n⚠️ Could not fetch content for file: ${specificFile.path}`
      : '';

  const isRunQuestion = message
    ? /how\s+(do\s+i|to|can\s+i)\s+(run|start|launch|execute|install|setup|set\s+up)/i.test(message)
    : false;

  const runInstructions = isRunQuestion
    ? `\n\nWhen answering "how to run" questions:
1. FIRST check the README content provided above - it contains the official instructions
2. Extract and present the exact commands from the README
3. If README has installation steps, quote them directly
4. Provide step-by-step instructions including:
   - Prerequisites (Node.js version, Python version, etc.)
   - Clone command (if repo URL available)
   - Install dependencies command (npm install, pip install, etc.)
   - Environment setup (copy .env.example, etc.)
   - Run command (npm run dev, python main.py, etc.)
5. If database or external services are needed, mention them
6. Include common troubleshooting tips from the README if available`
    : '';

  if (context) {
    return `You are Rassam (رسّام), an expert AI assistant specialized in explaining code and software architecture. Your name means "artist/illustrator" in Arabic, reflecting your ability to visualize and explain codebases.

You are currently helping the user understand a specific component in their repository.

CURRENT FOCUS:
- Component: ${context.label}
- Category: ${context.category || 'Not specified'}
- Description: ${context.description || 'Not provided'}
- Files: ${JSON.stringify(context.files || [], null, 2)}
${context.complexity ? `- Complexity: ${context.complexity}` : ''}
${context.dependencies ? `- Dependencies: ${context.dependencies.join(', ')}` : ''}
${repoDetails ? `- Repository: ${repoDetails.owner}/${repoDetails.repo}` : ''}
${projectOverview}
${canvasStructure}
${readmeSection}
${fileSection}
${runInstructions}

INSTRUCTIONS:
1. Answer questions specifically about this component, but you can reference other components when relevant
2. When mentioning file names, wrap them in backticks like \`filename.ts\`
3. Use code blocks with language specifiers for code examples
4. Be concise but thorough
5. If asked about implementation details you don't have, suggest what to look for
6. Format your responses with markdown for better readability
7. You have access to the full project structure, use it to provide context-aware answers
8. If README content is provided, use it as the authoritative source for setup/run instructions
9. When file content is provided, analyze it directly to answer questions`;
  }

  return `You are Rassam (رسّام), an expert AI assistant specialized in explaining code and software architecture. Your name means "artist/illustrator" in Arabic, reflecting your ability to visualize and explain codebases.

${repoDetails ? `The user is exploring the repository: ${repoDetails.owner}/${repoDetails.repo}` : 'The user is exploring a codebase.'}
${projectOverview}
${canvasStructure}
${readmeSection}
${fileSection}
${runInstructions}

INSTRUCTIONS:
1. Help the user understand the codebase architecture
2. When mentioning file names, wrap them in backticks like \`filename.ts\`
3. Use code blocks with language specifiers for code examples
4. Be concise but thorough
5. Format your responses with markdown for better readability
6. You have access to the full project structure, use it to provide context-aware answers
7. When asked about running the project, ALWAYS check the README content first - it contains the official instructions
8. If README content is provided, quote the exact commands and steps from it
9. When file content is provided, analyze it directly to answer questions`;
}

export async function chatWithContext(
  message: string, 
  context: any | null, 
  repoDetails?: { owner: string; repo: string } | null,
  allNodesContext?: any[] | null,
  canvasContext?: any | null,
  readmeContent?: string | null,
  specificFile?: { path: string; content: string | null } | null,
  runtimeSettings?: ChatRuntimeSettings,
  history?: ChatHistoryMessage[]
) {
  const systemMessage = buildSystemMessage(
    context, repoDetails, allNodesContext, canvasContext,
    readmeContent, specificFile, message
  );

  try {
    const provider = getProvider(runtimeSettings?.providerId);
    const response = await provider.chat({
      system: systemMessage,
      message,
      history,
      temperature: clampTemperature(runtimeSettings?.temperature),
      maxTokens: clampMaxTokens(runtimeSettings?.maxTokens),
      model: runtimeSettings?.model || undefined,
    });

    return response;
  } catch (error) {
    console.error("Chat Error:", error);
    throw error;
  }
}

export function chatStreamWithContext(
  message: string,
  context: any | null,
  repoDetails?: { owner: string; repo: string } | null,
  allNodesContext?: any[] | null,
  canvasContext?: any | null,
  readmeContent?: string | null,
  specificFile?: { path: string; content: string | null } | null,
  runtimeSettings?: ChatRuntimeSettings,
  history?: ChatHistoryMessage[]
): AsyncIterable<string> {
  const systemMessage = buildSystemMessage(
    context, repoDetails, allNodesContext, canvasContext,
    readmeContent, specificFile, message
  );

  const provider = getProvider(runtimeSettings?.providerId);
  return provider.chatStream({
    system: systemMessage,
    message,
    history,
    temperature: clampTemperature(runtimeSettings?.temperature),
    maxTokens: clampMaxTokens(runtimeSettings?.maxTokens),
    model: runtimeSettings?.model || undefined,
  });
}
