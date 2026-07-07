"use client";

import { useMemo, useState } from "react";
import { useHaStore } from "@/lib/useHaStore";
import { HeaderBar } from "@/components/HeaderBar";
import { TabBar } from "@/components/TabBar";
import { ViewSection } from "@/components/ViewSection";
import { SystemDrawer } from "@/components/SystemDrawer";
import { VIEWS } from "@/lib/views";
import type { DashboardEntity } from "@/lib/types";

export function Dashboard() {
  const { loaded, connected, entities, states, callService } = useHaStore();
  const [search, setSearch] = useState("");
  const [activeView, setActiveView] = useState(VIEWS[0].id);

  const entityById = useMemo(() => {
    const map = new Map<string, DashboardEntity>();
    for (const e of entities) map.set(e.entity_id, e);
    return map;
  }, [entities]);

  const currentView = useMemo(
    () => VIEWS.find((v) => v.id === activeView) ?? VIEWS[0],
    [activeView],
  );

  const viewEntities = useMemo(() => {
    const q = search.trim().toLowerCase();
    const resolved = currentView.entityIds
      .map((id) => entityById.get(id))
      .filter((e): e is DashboardEntity => Boolean(e));
    return q ? resolved.filter((e) => e.name.toLowerCase().includes(q)) : resolved;
  }, [currentView, entityById, search]);

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

  return (
    <div className="dashboard">
      <div className="dashboard-sticky-head">
        <HeaderBar
          connected={connected}
          loaded={loaded}
          persons={persons}
          weather={weather}
          states={states}
          search={search}
          onSearch={setSearch}
        />
        <TabBar views={VIEWS} active={activeView} onChange={setActiveView} />
      </div>
      <main className="dashboard-body">
        {!loaded && <p className="empty-state">Đang kết nối tới Home Assistant...</p>}
        {loaded && (
          <ViewSection entities={viewEntities} states={states} callService={callService} />
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
