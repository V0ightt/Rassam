import { NextResponse } from "next/server";
import { getAllProviderAvailability } from "@/lib/llm";

export async function GET() {
  try {
    const providers = await getAllProviderAvailability();

    return NextResponse.json(
      {
        providers,
        checkedAt: new Date().toISOString(),
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    console.error("Settings Models API Error:", error);
    return NextResponse.json(
      {
        error: "Failed to load model settings metadata",
      },
      { status: 500 },
    );
  }
}
