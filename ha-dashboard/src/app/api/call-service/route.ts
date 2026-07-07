import { NextResponse } from "next/server";
import { getHaClient } from "@/lib/server/ha-client";

interface CallServiceBody {
  domain: string;
  service: string;
  entity_id?: string;
  data?: Record<string, unknown>;
}

export async function POST(request: Request) {
  let body: CallServiceBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const { domain, service, entity_id, data } = body;
  if (!domain || !service) {
    return NextResponse.json(
      { error: "domain and service are required" },
      { status: 400 },
    );
  }

  try {
    await getHaClient().callService(domain, service, entity_id, data);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }
}
