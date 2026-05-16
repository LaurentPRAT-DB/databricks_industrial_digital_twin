import { useState, useEffect, useRef, useCallback } from 'react';
import type { Entity, Resource, Metrics, SimulationState } from '../types/entity';

const WS_URL = `ws://${window.location.host}/ws/entities`;

export function useEntities() {
  const [entities, setEntities] = useState<Map<string, Entity>>(new Map());
  const [resources, setResources] = useState<Resource[]>([]);
  const [metrics, setMetrics] = useState<Metrics>({
    throughput_per_hour: 0,
    wip_count: 0,
    completed: 0,
    avg_utilization_pct: 0,
    total_queue_depth: 0,
    elapsed_hours: 0,
  });
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const connect = () => {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => setConnected(true);
      ws.onclose = () => {
        setConnected(false);
        setTimeout(connect, 2000);
      };

      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);

        if (msg.type === 'initial') {
          const state: SimulationState = msg.data;
          setEntities(new Map(state.entities.map(e => [e.id, e])));
          setResources(state.resources);
          if (state.metrics) setMetrics(state.metrics);
        } else if (msg.type === 'entity_delta') {
          const { deltas, removed, metrics: m, resources: r } = msg.data;

          setEntities(prev => {
            const next = new Map(prev);
            for (const id of removed || []) next.delete(id);
            for (const delta of deltas || []) {
              const existing = next.get(delta.id);
              if (existing) {
                next.set(delta.id, { ...existing, ...delta });
              } else {
                next.set(delta.id, delta as Entity);
              }
            }
            return next;
          });

          if (r) setResources(r);
          if (m) setMetrics(m);
        }
      };
    };

    connect();
    return () => { wsRef.current?.close(); };
  }, []);

  return { entities: Array.from(entities.values()), resources, metrics, connected };
}
