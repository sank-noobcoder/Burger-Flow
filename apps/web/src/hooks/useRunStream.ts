import { useState, useEffect, useRef } from "react";
import { getToken } from "../lib/apiClient";

export interface MetricEvent {
  epoch: number;
  loss: number;
  best_loss: number;
  patience: number;
  lr?: number;
  phase?: string;
  ri_active?: boolean;
}

export interface RegionEvent {
  epoch: number;
  n_detected: number;
  sample: number[][];
}

export function useRunStream(runId: string | null) {
  const [metrics, setMetrics] = useState<MetricEvent[]>([]);
  const [currentPhase, setCurrentPhase] = useState<string>("search");
  const [isRiActive, setIsRiActive] = useState<boolean>(false);
  const [regionsSample, setRegionsSample] = useState<number[][]>([]);
  const [status, setStatus] = useState<string>("connecting");
  const [latestMetric, setLatestMetric] = useState<MetricEvent | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!runId) return;

    abortControllerRef.current?.abort();
    const ac = new AbortController();
    abortControllerRef.current = ac;

    const token = getToken();
    const url = `/api/v1/runs/${runId}/stream`;

    async function startStream() {
      try {
        const response = await fetch(url, {
          headers: {
            ...(token && { Authorization: `Bearer ${token}` }),
          },
          signal: ac.signal,
        });

        if (!response.ok || !response.body) {
          setStatus("disconnected");
          return;
        }

        setStatus("connected");
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n\n");
          buffer = lines.pop() || "";

          for (const chunk of lines) {
            if (!chunk.trim() || chunk.startsWith(":")) continue;

            let eventType = "message";
            let dataStr = "";

            const partLines = chunk.split("\n");
            for (const line of partLines) {
              if (line.startsWith("event:")) {
                eventType = line.replace("event:", "").trim();
              } else if (line.startsWith("data:")) {
                dataStr = line.replace("data:", "").trim();
              }
            }

            if (!dataStr) continue;

            try {
              const parsed = JSON.parse(dataStr);
              if (eventType === "metrics") {
                setLatestMetric(parsed);
                setMetrics((prev) => [...prev.slice(-300), parsed]);
                if (parsed.phase) setCurrentPhase(parsed.phase);
                if (parsed.ri_active !== undefined) setIsRiActive(parsed.ri_active);
              } else if (eventType === "phase") {
                setCurrentPhase(parsed.phase);
              } else if (eventType === "regions") {
                setRegionsSample(parsed.sample || []);
              } else if (eventType === "done") {
                setStatus("completed");
              } else if (eventType === "error") {
                setStatus("error");
              }
            } catch (err) {
              console.error("Error parsing SSE data", err);
            }
          }
        }
      } catch (err: any) {
        if (err.name !== "AbortError") {
          setStatus("disconnected");
        }
      }
    }

    startStream();

    return () => {
      ac.abort();
    };
  }, [runId]);

  return {
    metrics,
    latestMetric,
    currentPhase,
    isRiActive,
    regionsSample,
    status,
  };
}
