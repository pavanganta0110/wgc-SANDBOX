import { NextResponse } from "next/server";
import { finixClient } from "@/lib/finix/client";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "Missing file ID" }, { status: 400 });
  }

  try {
    const file = await finixClient.getFileContent(id);
    return new NextResponse(file.data, {
      headers: {
        "Content-Type": file.contentType || "image/png",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (err: any) {
    console.error(`Failed to proxy file ${id} from Finix:`, err);
    return NextResponse.json({ error: "File not found or failed to fetch" }, { status: 404 });
  }
}
