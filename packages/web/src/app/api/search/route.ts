import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { searchFiles } from "@/lib/fs";

/**
 * GET /api/search?q=query&type=contexts|logs&limit=20
 */
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const username = (session.user as any).ctxUsername;
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get("q");
  const type = searchParams.get("type") || undefined;
  const limit = parseInt(searchParams.get("limit") || "20", 10);

  if (!query) {
    return NextResponse.json({ error: "Query parameter 'q' is required" }, { status: 400 });
  }

  try {
    const results = await searchFiles(username, query, { type, limit });
    return NextResponse.json({ query, results, total: results.length });
  } catch (error: any) {
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
