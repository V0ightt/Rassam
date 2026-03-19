import { NextRequest, NextResponse } from 'next/server';
import { getFileContent } from '@/lib/github';

/**
 * POST /api/files
 *
 * Fetches one file's content from GitHub.
 * Body: { owner, repo, path }
 * Returns: { path, content }
 */
export async function POST(req: NextRequest) {
  try {
    const { owner, repo, path } = await req.json();

    if (!owner || !repo || !path) {
      return NextResponse.json(
        { error: 'owner, repo, and path are required' },
        { status: 400 },
      );
    }

    const content = await getFileContent(owner, repo, path);

    if (content === null) {
      return NextResponse.json(
        { error: 'File content not available' },
        { status: 404 },
      );
    }

    return NextResponse.json({ path, content });
  } catch (error: unknown) {
    console.error('File fetch error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch file' },
      { status: 500 },
    );
  }
}
