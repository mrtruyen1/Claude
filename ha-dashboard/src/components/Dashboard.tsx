"use client";

import { useMemo, useState } from "react";
import { useHaStore } from "@/lib/useHaStore";
import { HeaderBar } from "@/components/HeaderBar";
import { AreaSection } from "@/components/AreaSection";
import { SystemDrawer } from "@/components/SystemDrawer";
import type { DashboardEntity } from "@/lib/types";

const UNASSIGNED_ID = "__unassigned__";

export function Dashboard() {
  const { loaded, connected, areas, entities, states, callService } = useHaStore();
  const [search, setSearch] = useState("");

  const grouped = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? entities.filter((e) => e.name.toLowerCase().includes(q))
      : entities;

    const byArea = new Map<string, DashboardEntity[]>();
    for (const e of filtered) {
      const key = e.area_id ?? UNASSIGNED_ID;
      if (!byArea.has(key)) byArea.set(key, []);
      byArea.get(key)!.push(e);
    }
    return byArea;
  }, [entities, search]);

  const persons = useMemo(() => entities.filter((e) => e.domain === "person"), [entities]);
  const weather = useMemo(() => entities.find((e) => e.domain === "weather") ?? null, [entities]);
  const automations = useMemo(
    () => entities.filter((e) => e.domain === "automation").sort((a, b) => a.name.localeCompare(b.name)),
    [entities],
  );
  const scripts = useMemo(
    () => entities.filter((e) => e.domain === "script").sort((a, b) => a.name.localeCompare(b.name)),
    [entities],
  );
  const updates = useMemo(() => entities.filter((e) => e.domain === "update"), [entities]);

  const sortedAreas = useMemo(
    () => [...areas].sort((a, b) => a.name.localeCompare(b.name, "vi")),
    [areas],
  );

  return (
    <div className="dashboard">
      <HeaderBar
        connected={connected}
        loaded={loaded}
        persons={persons}
        weather={weather}
        states={states}
        search={search}
        onSearch={setSearch}
      />
      <main className="dashboard-body">
        {!loaded && <p className="empty-state">Đang kết nối tới Home Assistant...</p>}
        {loaded && (
          <div className="area-grid">
            {sortedAreas.map((area) => (
              <AreaSection
                key={area.area_id}
                title={area.name}
                entities={grouped.get(area.area_id) ?? []}
                states={states}
                callService={callService}
              />
            ))}
            <AreaSection
              title="Khác"
              entities={grouped.get(UNASSIGNED_ID) ?? []}
              states={states}
              callService={callService}
            />
          </div>
        )}
        {loaded && (
          <SystemDrawer
            automations={automations}
            scripts={scripts}
            updates={updates}
            states={states}
            callService={callService}
          />
        )}
      </main>
    </div>
  );
}
