import { NextRequest, NextResponse } from "next/server";
import { getRepoStructure } from "@/lib/github";
import { analyzeRepoStructure } from "@/lib/ai";
import dagre from "dagre";

// Helper to layout the graph
const getLayoutedElements = (nodes: any[], edges: any[], direction = 'TB') => {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));

  // Dynamic node sizing based on content
  const getNodeDimensions = (node: any) => {
    const baseWidth = 280;
    const baseHeight = 100;
    const filesCount = node.data?.files?.length || 0;
    const extraHeight = filesCount > 5 ? 30 : 0;
    return { width: baseWidth, height: baseHeight + extraHeight };
  };

  dagreGraph.setGraph({ 
    rankdir: direction,
    nodesep: 80,
    ranksep: 100,
    edgesep: 30,
    marginx: 50,
    marginy: 50,
  });

  nodes.forEach((node) => {
    const { width, height } = getNodeDimensions(node);
    dagreGraph.setNode(node.id, { width, height });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  const newNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    const { width, height } = getNodeDimensions(node);
    return {
      ...node,
      position: {
        x: nodeWithPosition.x - width / 2,
        y: nodeWithPosition.y - height / 2,
      },
    };
  });

  return { nodes: newNodes, edges };
};

export async function POST(req: NextRequest) {
  try {
    const { url, layout = 'TB' } = await req.json();

    if (!url) {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    // Parse URL (e.g. https://github.com/owner/repo)
    const regex = /github\.com\/([^/]+)\/([^/]+)/;
    const match = url.match(regex);

    if (!match) {
      return NextResponse.json({ error: "Invalid GitHub URL" }, { status: 400 });
    }

    const [_, owner, repo] = match;

    // 1. Get Repo Structure
    const repoNodes = await getRepoStructure(owner, repo);
    const filePaths = repoNodes.map(n => n.path);

    // 2. Analyze with AI
    const aiAnalysis = await analyzeRepoStructure(filePaths);
    
    // 3. Transform to React Flow with enhanced node types
    const flowNodes = aiAnalysis.nodes.map((n: any, index: number) => ({
      id: n.id || `node-${index}`,
      type: 'enhanced', // Use enhanced node type
      position: { x: 0, y: 0 },
      data: { 
        label: n.label, 
        description: n.description,
        files: n.files || [],
        category: n.category || 'default',
        complexity: n.complexity || 'medium',
        dependencies: n.dependencies || [],
        exports: n.exports || [],
      }
    }));

    const flowEdges = aiAnalysis.edges.map((e: any, index: number) => ({
      id: e.id || `edge-${index}`,
      source: e.source,
      target: e.target,
      label: e.label,
      type: 'custom',
      animated: e.type === 'calls',
      data: {
        label: e.label,
        type: e.type || 'dependency',
        strength: e.strength || 'normal',
      },
      style: {
        strokeWidth: e.strength === 'strong' ? 3 : e.strength === 'weak' ? 1 : 2,
      },
      markerEnd: {
        type: 'arrowclosed',
        color: '#64748b',
      },
    }));

    // 4. Apply Layout
    const layouted = getLayoutedElements(flowNodes, flowEdges, layout);

    return NextResponse.json({
      nodes: layouted.nodes,
      edges: layouted.edges,
      repoDetails: { owner, repo, fileCount: filePaths.length }
    });

  } catch (error: any) {
    console.error("API Error:", error);
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
  }
}

// Endpoint to re-layout existing nodes
export async function PUT(req: NextRequest) {
  try {
    const { nodes, edges, layout = 'TB' } = await req.json();
    
    if (!nodes || !edges) {
      return NextResponse.json({ error: "Nodes and edges are required" }, { status: 400 });
    }

    const layouted = getLayoutedElements(nodes, edges, layout);
    
    return NextResponse.json({
      nodes: layouted.nodes,
      edges: layouted.edges,
    });
  } catch (error: any) {
    console.error("Layout API Error:", error);
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
  }
}
