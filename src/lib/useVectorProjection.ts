// src/lib/useVectorProjection.ts

import { useState, useEffect, useMemo } from "react";
import Worker from "../workers/pca2d.worker"; // Import the Web Worker

// Define the data types for communication
export type DataPoint = {
  id: string; // Typically the URL or a unique key
  vector: number[]; // The embedding array (high dimension)
};

export type ProjectionResult = {
  id: string;
  x: number; // 1st principal component
  y: number; // 2nd principal component
};

// Define the shape of the hook's return value
export type ProjectionState = {
  results: ProjectionResult[] | null;
  loading: boolean;
  error: string | null;
};

/**
 * Custom hook to calculate a 2D projection (PCA) for a set of high-dimensional vectors.
 * The heavy calculation is offloaded to a Web Worker.
 * @param dataPoints - Array of {id, vector} objects. Calculation only runs if dataPoints.length > 0.
 */
export function useVectorProjection(dataPoints: DataPoint[]): ProjectionState {
  const [state, setState] = useState<ProjectionState>({
    results: null,
    loading: false,
    error: null,
  });

  // Memoize the input data's vectors to ensure the effect only runs when the vectors actually change.
  const vectors = useMemo(() => dataPoints.map((d) => d.vector), [dataPoints]);
  const ids = useMemo(() => dataPoints.map((d) => d.id), [dataPoints]);

  useEffect(() => {
    // 1. Skip if no data or already running
    if (vectors.length === 0 || state.loading) {
      setState((s) => ({ ...s, results: null }));
      return;
    }

    setState((s) => ({ ...s, loading: true, error: null }));

    // 2. Initialize the Web Worker
    const worker = new Worker();

    worker.onmessage = (event: MessageEvent<any>) => {
      const { type, payload } = event.data;

      if (type === "PCA_RESULT") {
        const projectedData: ProjectionResult[] = payload.projection.map(
          (coords: number[], index: number) => ({
            id: ids[index],
            x: coords[0],
            y: coords[1],
          })
        );
        setState({ results: projectedData, loading: false, error: null });
      } else if (type === "PCA_ERROR") {
        console.error("PCA Worker Error:", payload.message);
        setState({ results: null, loading: false, error: payload.message });
      }

      // 3. Terminate the worker to clean up resources
      worker.terminate();
    };

    worker.onerror = (e) => {
      console.error("Worker failed to start or execute:", e);
      setState({ results: null, loading: false, error: "PCA Worker Error" });
      worker.terminate();
    };

    // 4. Send the vectors to the worker for calculation
    worker.postMessage({ type: "CALCULATE_PCA", vectors });

    // 5. Cleanup function
    return () => {
      worker.terminate();
    };
  }, [vectors, ids]);

  return state;
}
