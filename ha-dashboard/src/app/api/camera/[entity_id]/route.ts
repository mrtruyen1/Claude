import { getHaClient } from "@/lib/server/ha-client";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ entity_id: string }> },
) {
  const { entity_id } = await params;
  const result = await getHaClient().fetchCameraImage(entity_id);
  if (!result) {
    return new Response("Not found", { status: 404 });
  }
  return new Response(result.body, {
    headers: {
      "Content-Type": result.contentType,
      "Cache-Control": "no-store",
    },
  });
}
