"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import type { DashboardSnapshot, HassState } from "@/lib/types";

interface StoreState {
  loaded: boolean;
  connected: boolean;
  areas: DashboardSnapshot["areas"];
  entities: DashboardSnapshot["entities"];
  states: Record<string, HassState>;
}

type Action =
  | { type: "snapshot"; payload: DashboardSnapshot }
  | { type: "state"; payload: HassState }
  | { type: "connection"; connected: boolean };

function reducer(state: StoreState, action: Action): StoreState {
  switch (action.type) {
    case "snapshot":
      return {
        loaded: true,
        connected: action.payload.connected,
        areas: action.payload.areas,
        entities: action.payload.entities,
        states: action.payload.states,
      };
    case "state":
      return {
        ...state,
        states: { ...state.states, [action.payload.entity_id]: action.payload },
      };
    case "connection":
      return { ...state, connected: action.connected };
    default:
      return state;
  }
}

const initialState: StoreState = {
  loaded: false,
  connected: false,
  areas: [],
  entities: [],
  states: {},
};

export function useHaStore() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const optimistic = useRef(new Map<string, Record<string, unknown>>());

  useEffect(() => {
    let cancelled = false;

    fetch("/api/states")
      .then((res) => res.json())
      .then((snapshot: DashboardSnapshot) => {
        if (!cancelled) dispatch({ type: "snapshot", payload: snapshot });
      })
      .catch(() => {
        /* the SSE stream + retry below will recover */
      });

    const source = new EventSource("/api/stream");
    source.addEventListener("state", (evt) => {
      const state = JSON.parse((evt as MessageEvent).data) as HassState;
      optimistic.current.delete(state.entity_id);
      dispatch({ type: "state", payload: state });
    });
    source.addEventListener("connection", (evt) => {
      const { connected } = JSON.parse((evt as MessageEvent).data) as {
        connected: boolean;
      };
      dispatch({ type: "connection", connected });
    });

    return () => {
      cancelled = true;
      source.close();
    };
  }, []);

  const callService = useCallback(
    async (
      domain: string,
      service: string,
      entityId?: string,
      data?: Record<string, unknown>,
      optimisticState?: Partial<HassState>,
    ) => {
      if (entityId && optimisticState) {
        const current = state.states[entityId];
        if (current) {
          dispatch({
            type: "state",
            payload: { ...current, ...optimisticState } as HassState,
          });
        }
      }
      await fetch("/api/call-service", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain, service, entity_id: entityId, data }),
      });
    },
    [state.states],
  );

  return { ...state, callService };
}
