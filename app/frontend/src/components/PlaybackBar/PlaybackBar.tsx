import { useRef } from 'react';
import type { PlaybackSpeed } from '../../types/entity';

interface Props {
  isPlaying: boolean;
  speed: PlaybackSpeed;
  currentFrameIndex: number;
  totalFrames: number;
  progressPct: number;
  currentSimTime: string;
  elapsedHours: number;
  onTogglePlay: () => void;
  onSeekPercent: (pct: number) => void;
  onChangeSpeed: (speed: PlaybackSpeed) => void;
}

const SPEEDS: PlaybackSpeed[] = [1, 2, 5, 10, 30, 60];

function formatSimTime(iso: string): string {
  if (!iso) return '--:--:--';
  const d = new Date(iso);
  return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export default function PlaybackBar({
  isPlaying, speed, currentFrameIndex, totalFrames,
  progressPct, currentSimTime, elapsedHours,
  onTogglePlay, onSeekPercent, onChangeSpeed,
}: Props) {
  const barRef = useRef<HTMLDivElement>(null);

  const handleBarClick = (e: React.MouseEvent) => {
    if (!barRef.current) return;
    const rect = barRef.current.getBoundingClientRect();
    const pct = ((e.clientX - rect.left) / rect.width) * 100;
    onSeekPercent(Math.max(0, Math.min(100, pct)));
  };

  return (
    <div className="bg-slate-800 border-t border-slate-700 px-4 py-2 flex items-center gap-3 shrink-0">
      {/* Play/Pause */}
      <button
        onClick={onTogglePlay}
        className="w-8 h-8 flex items-center justify-center rounded-full bg-blue-600 hover:bg-blue-500 transition-colors shrink-0"
        title={isPlaying ? 'Pause' : 'Play'}
      >
        {isPlaying ? (
          <svg className="w-3.5 h-3.5 text-white" fill="currentColor" viewBox="0 0 24 24">
            <rect x="6" y="4" width="4" height="16" />
            <rect x="14" y="4" width="4" height="16" />
          </svg>
        ) : (
          <svg className="w-3.5 h-3.5 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
            <polygon points="5,3 19,12 5,21" />
          </svg>
        )}
      </button>

      {/* Time display */}
      <div className="shrink-0 text-center min-w-[90px]">
        <div className="text-sm font-mono font-bold text-white leading-none">
          {formatSimTime(currentSimTime)}
        </div>
        <div className="text-[9px] text-slate-500 uppercase mt-0.5">
          {elapsedHours}h elapsed
        </div>
      </div>

      {/* Progress bar */}
      <div
        ref={barRef}
        className="flex-1 h-6 flex items-center cursor-pointer group"
        onClick={handleBarClick}
      >
        <div className="w-full h-1.5 bg-slate-700 rounded-full relative overflow-hidden group-hover:h-2.5 transition-all">
          <div
            className="absolute left-0 top-0 h-full bg-blue-500 rounded-full transition-[width] duration-75"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Speed selector */}
      <div className="flex items-center gap-0.5 shrink-0">
        {SPEEDS.map(s => (
          <button
            key={s}
            onClick={() => onChangeSpeed(s)}
            className={`px-1.5 py-0.5 text-[10px] font-bold rounded transition-colors ${
              s === speed
                ? 'bg-blue-600 text-white'
                : 'text-slate-400 hover:text-white hover:bg-slate-700'
            }`}
          >
            {s}x
          </button>
        ))}
      </div>

      {/* Frame counter */}
      <div className="text-[10px] text-slate-500 shrink-0 min-w-[70px] text-right font-mono">
        {currentFrameIndex + 1} / {totalFrames}
      </div>
    </div>
  );
}
