import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type {
  Entity, Resource, Metrics, SimConfig, PathSegment, LocationMeta,
  StateDescription, SimFrame, SimulationFrameData, PlaybackSpeed,
} from '../types/entity';

const FRAMES_URL = '/api/simulation/frames';

export function useSimulationReplay() {
  const [frameData, setFrameData] = useState<SimulationFrameData | null>(null);
  const [currentFrameIndex, setCurrentFrameIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState<PlaybackSpeed>(10);
  const [isLoading, setIsLoading] = useState(true);
  const intervalRef = useRef<number | null>(null);

  // Load frames from backend
  const loadFrames = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(FRAMES_URL);
      const data: SimulationFrameData = await res.json();
      setFrameData(data);
      setCurrentFrameIndex(0);
      setIsPlaying(false);
    } catch (e) {
      console.error('Failed to load simulation frames', e);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => { loadFrames(); }, [loadFrames]);

  // Derived data from current frame
  const frames = frameData?.frames ?? [];
  const totalFrames = frames.length;
  const currentFrame = frames[currentFrameIndex] as SimFrame | undefined;

  const entities: Entity[] = currentFrame?.entities ?? [];
  const resources: Resource[] = currentFrame?.resources ?? [];
  const metrics: Metrics = currentFrame?.metrics ?? {
    throughput_per_hour: 0, wip_count: 0, completed: 0,
    avg_utilization_pct: 0, total_queue_depth: 0, elapsed_hours: 0,
  };

  const simConfig: SimConfig = frameData?.config ?? { name: '', description: '', facility_name: '' };
  const paths: PathSegment[] = frameData?.paths ?? [];
  const locations: LocationMeta[] = frameData?.locations ?? [];
  const stateDescriptions: Record<string, StateDescription> = frameData?.state_descriptions ?? {};

  const progressPct = totalFrames > 1 ? (currentFrameIndex / (totalFrames - 1)) * 100 : 0;
  const currentSimTime = currentFrame?.sim_time ?? '';
  const elapsedHours = currentFrame ? Math.round(currentFrame.elapsed_s / 3600 * 100) / 100 : 0;

  // Playback timing
  const snapshotInterval = frameData?.snapshot_interval_s ?? 5;

  useEffect(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (!isPlaying || totalFrames === 0) return;

    // 1x speed = 1 sim-minute per real second = 60 sim-seconds per real second
    const framesPerRealSecond = (60 * speed) / snapshotInterval;

    if (framesPerRealSecond <= 60) {
      const intervalMs = 1000 / framesPerRealSecond;
      intervalRef.current = window.setInterval(() => {
        setCurrentFrameIndex(prev => {
          if (prev >= totalFrames - 1) {
            setIsPlaying(false);
            return prev;
          }
          return prev + 1;
        });
      }, intervalMs);
    } else {
      // Fast mode: advance multiple frames per 16ms tick
      const framesPerTick = Math.ceil(framesPerRealSecond / 60);
      intervalRef.current = window.setInterval(() => {
        setCurrentFrameIndex(prev => {
          const next = prev + framesPerTick;
          if (next >= totalFrames - 1) {
            setIsPlaying(false);
            return totalFrames - 1;
          }
          return next;
        });
      }, 16);
    }

    return () => {
      if (intervalRef.current !== null) clearInterval(intervalRef.current);
    };
  }, [isPlaying, speed, totalFrames, snapshotInterval]);

  const play = useCallback(() => {
    if (totalFrames === 0) return;
    if (currentFrameIndex >= totalFrames - 1) setCurrentFrameIndex(0);
    setIsPlaying(true);
  }, [currentFrameIndex, totalFrames]);

  const pause = useCallback(() => setIsPlaying(false), []);

  const togglePlayPause = useCallback(() => {
    if (isPlaying) pause(); else play();
  }, [isPlaying, play, pause]);

  const seekTo = useCallback((idx: number) => {
    const clamped = Math.max(0, Math.min(idx, totalFrames - 1));
    setCurrentFrameIndex(clamped);
  }, [totalFrames]);

  const seekToPercent = useCallback((pct: number) => {
    if (totalFrames <= 1) return;
    const idx = Math.round((pct / 100) * (totalFrames - 1));
    seekTo(idx);
  }, [totalFrames, seekTo]);

  const changeSpeed = useCallback((s: PlaybackSpeed) => setSpeed(s), []);

  return {
    entities, resources, metrics, simConfig, paths, locations, stateDescriptions,
    isLoading, isPlaying, speed, currentFrameIndex, totalFrames,
    progressPct, currentSimTime, elapsedHours,
    play, pause, togglePlayPause, seekTo, seekToPercent, changeSpeed,
    loadFrames,
  };
}
