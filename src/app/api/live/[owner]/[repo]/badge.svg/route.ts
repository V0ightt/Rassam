import type { NextRequest } from "next/server";

import { handleLiveRequest } from "../../../live";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ owner: string; repo: string }> }): Promise<Response> {
  return handleLiveRequest(request, await params, "badge");
}
