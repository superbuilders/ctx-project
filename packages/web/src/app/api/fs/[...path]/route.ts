import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { listFiles, readDocument, writeDocument, deleteFile, createDirectory } from "@/lib/fs";

/**
 * GET /api/fs/[...path] — Read a file or list a directory
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const username = (session.user as any).ctxUsername;
  const { path: pathSegments } = await params;
  const filePath = pathSegments?.join("/") || "";

  try {
    if (filePath.endsWith(".md") || filePath.endsWith(".txt") || filePath.endsWith(".yaml")) {
      const doc = await readDocument(username, filePath);
      return NextResponse.json(doc);
    }

    const files = await listFiles(username, filePath);
    return NextResponse.json({ path: filePath, files });
  } catch (error: any) {
    if (error.message === "File not found" || error.message === "Directory not found") {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error.message === "Permission denied") {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/**
 * PUT /api/fs/[...path] — Write a file
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const username = (session.user as any).ctxUsername;
  const { path: pathSegments } = await params;
  const filePath = pathSegments?.join("/") || "";

  try {
    const body = await request.json();
    await writeDocument(username, filePath, body.content);
    return NextResponse.json({ success: true, path: filePath });
  } catch (error: any) {
    if (error.message === "Permission denied") {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/**
 * DELETE /api/fs/[...path] — Delete a file
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const username = (session.user as any).ctxUsername;
  const { path: pathSegments } = await params;
  const filePath = pathSegments?.join("/") || "";

  try {
    await deleteFile(username, filePath);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error.message === "File not found") {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error.message === "Permission denied") {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/**
 * POST /api/fs/[...path] — Create directory or move file
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const username = (session.user as any).ctxUsername;
  const { path: pathSegments } = await params;
  const filePath = pathSegments?.join("/") || "";

  try {
    const body = await request.json();
    if (body.action === "mkdir") {
      await createDirectory(username, filePath);
      return NextResponse.json({ success: true, path: filePath });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
