import { NextResponse } from "next/server";
import { getHaClient } from "@/lib/server/ha-client";
import type { DashboardSnapshot } from "@/lib/types";

export async function GET() {
  const client = getHaClient();
  try {
    await Promise.race([
      client.whenReady(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 8000)),
    ]);
  } catch {
    // fall through and report disconnected with whatever cache we have
  }

  const snapshot: DashboardSnapshot = {
    connected: client.isConnected(),
    areas: client.listAreas(),
    entities: client.listEntities(),
    states: Object.fromEntries(client.states),
  };

  return NextResponse.json(snapshot);
}
