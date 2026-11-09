import { useEffect, useRef, useState } from 'react';
import { newId } from '../../core/ids';
import { updateSourceParams } from '../../core/ops';
import { clipEnd, sequenceEnd } from '../../core/sequence';
import type { SequenceClip, SequenceParams, SourceDef } from '../../core/types';
import type { AppContext } from '../app-context';
import { readClipMetadata } from '../sources/clip-metadata';
import { SequenceSource } from '../sources/sequence';
import { useSourceStatusVersion } from './useStore';

const basename = (path: string) => path.split(/[\\/]/).pop() || path;
const audioFile = /\.(mp3|wav|m4a|aac|flac|ogg|opus)$/i;
const rounded = (value: number) => Math.round(value * 100) / 100;
const MAX_TIMELINE_SECONDS = 24 * 60 * 60;

function Seconds({ label, value, min = 0, onChange }: {
  label: string;
  value: number;
  min?: number;
  onChange(value: number): void;
}) {
  return (
    <label>
      {label}
      <input type="number" min={min} max={MAX_TIMELINE_SECONDS} step={0.01} key={value} defaultValue={rounded(value)}
        onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }}
        onBlur={(event) => {
          const next = event.currentTarget.valueAsNumber;
          if (next === rounded(value)) return;
          if (Number.isFinite(next) && next >= min && next <= MAX_TIMELINE_SECONDS) onChange(next);
          else event.currentTarget.value = String(rounded(value));
        }} />
    </label>
  );
}

export function Timeline({ ctx, source }: { ctx: AppContext; source: Extract<SourceDef, { type: 'sequence' }> }) {
  useSourceStatusVersion(ctx.engine);
  const live = ctx.engine.getSource(source.id);
  const sequence = live instanceof SequenceSource ? live : null;
  const [time, setTime] = useState(0);
  const [clipId, setClipId] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [zoom, setZoom] = useState(90);
  const [playing, setPlaying] = useState(false);
  const adding = useRef(false);
  const drag = useRef<{ x: number; start: number } | null>(null);
  const { clips, loop } = source.params;
  const duration = sequenceEnd(clips);
  const scaleEnd = Math.max(5, Math.ceil(duration + 2));
  const pixelsPerSecond = Math.min(zoom, 2000000 / scaleEnd);
  const trackWidth = pixelsPerSecond * scaleEnd;
  const clip = clips.find((c) => c.id === clipId);
  const set = (label: string, patch: Partial<SequenceParams>) => {
    ctx.store.dispatch(label, (project) => updateSourceParams(project, source.id, patch));
  };
  const edit = (id: string, patch: Partial<SequenceClip>, label = 'Edit clip') =>
    set(label, { clips: clips.map((c) => c.id === id ? { ...c, ...patch } : c) });

  useEffect(() => {
    const sync = () => {
      setTime(rounded(sequence?.time ?? 0));
      setPlaying(sequence?.isPlaying ?? false);
    };
    sync();
    const timer = setInterval(sync, 70);
    return () => clearInterval(timer);
  }, [sequence]);

  async function addClips(kind?: SequenceClip['kind'], dropped?: string[]) {
    if (adding.current) return;
    adding.current = true;
    setBusy(true);
    setMessage('');
    try {
      const paths = dropped ?? await ctx.api.media.pick(kind);
      const imported: SequenceClip[] = [];
      const unreadable: string[] = [];
      let firstVideoSize: { width: number; height: number } | undefined;
      // Probe one file at a time to keep imports of long lists cheap.
      for (const path of paths) {
        const track = kind ?? (audioFile.test(path) ? 'audio' : 'video');
        try {
          const { duration, width, height } = await readClipMetadata(ctx.api.media.url(path), track);
          if (track === 'video' && !firstVideoSize && width >= 2 && height >= 2) {
            const ratio = Math.min(1, 4096 / Math.max(width, height));
            firstVideoSize = { width: Math.max(2, Math.round(width * ratio)), height: Math.max(2, Math.round(height * ratio)) };
          }
          imported.push({ id: newId('clip'), path, kind: track, start: 0, inPoint: 0, duration, muted: false });
        } catch {
          unreadable.push(basename(path));
        }
      }
      if (ctx.engine.getSource(source.id) !== sequence) return;
      if (imported.length) {
        ctx.store.dispatch('Add clips', (p) => {
          const latest = p.sources.find((s) => s.id === source.id);
          if (latest?.type !== 'sequence') return p;
          const ends = { video: 0, audio: 0 };
          for (const c of latest.params.clips) ends[c.kind] = Math.max(ends[c.kind], clipEnd(c));
          for (const c of imported) {
            c.start = ends[c.kind];
            ends[c.kind] = clipEnd(c);
          }
          const size = latest.params.width === 1920 && latest.params.height === 1080 &&
            !latest.params.clips.some((c) => c.kind === 'video') ? firstVideoSize : undefined;
          return updateSourceParams(p, source.id, { ...size, clips: [...latest.params.clips, ...imported] });
        });
        setClipId(imported[0].id);
      }
      if (unreadable.length) setMessage(`Could not read: ${unreadable.join(', ')}`);
    } catch {
      setMessage('Could not open media picker.');
    } finally {
      adding.current = false;
      setBusy(false);
    }
  }

  async function relink(c: SequenceClip) {
    try {
      const path = await ctx.api.media.relink(c.kind);
      if (!path) return;
      const { duration: length } = await readClipMetadata(ctx.api.media.url(path), c.kind);
      if (ctx.engine.getSource(source.id) !== sequence) return;
      ctx.store.dispatch('Relink clip', (p) => {
        const latest = p.sources.find((s) => s.id === source.id);
        if (latest?.type !== 'sequence') return p;
        const clips = latest.params.clips.map((old) => {
          if (old.id !== c.id) return old;
          const inPoint = old.inPoint < length ? old.inPoint : 0;
          return { ...old, path, inPoint, duration: Math.min(old.duration, length - inPoint) };
        });
        return updateSourceParams(p, source.id, { clips });
      });
      setMessage('');
    } catch {
      setMessage('Could not open the replacement file.');
    }
  }

  const seek = (seconds: number) => {
    sequence?.pause();
    sequence?.seek(seconds);
    setTime(sequence?.time ?? 0);
  };
  const seekAt = (event: React.PointerEvent<HTMLDivElement>) => {
    seek((event.clientX - event.currentTarget.getBoundingClientRect().left) / pixelsPerSecond);
  };
  const divisions = Math.max(1, Math.ceil(scaleEnd / 120));
  const ticks = Array.from({ length: Math.floor(scaleEnd / divisions) + 1 }, (_, i) => i * divisions);

  return (
    <section className="timeline" aria-label="Sequencer"
      onDragOver={(event) => { event.preventDefault(); event.stopPropagation(); }}
      onDrop={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void addClips(undefined, [...event.dataTransfer.files].map((file) => ctx.api.media.pathForFile(file)).filter(Boolean));
      }}>
      <div className="timeline-tools">
        <strong>{source.name}</strong>
        <button onClick={() => {
          if (sequence?.isPlaying) sequence.pause();
          else sequence?.play();
          setPlaying(sequence?.isPlaying ?? false);
        }}>{playing ? 'Pause sequence' : 'Play sequence'}</button>
        <button onClick={() => { sequence?.restart(); setTime(0); }}>↶ Start</button>
        <output>{time.toFixed(2)} / {duration.toFixed(2)} s</output>
        <label><input type="checkbox" checked={loop} onChange={(event) => set('Loop sequence', { loop: event.target.checked })} /> Loop</label>
        <button disabled={busy} onClick={() => void addClips('video')}>＋ Video clips</button>
        <button disabled={busy} onClick={() => void addClips('audio')}>＋ Audio clips</button>
        <label>Zoom <input type="range" min={24} max={180} value={zoom} onChange={(event) => setZoom(Number(event.target.value))} /></label>
      </div>
      <div className="timeline-scroll">
        <div className="timeline-grid" style={{ width: trackWidth + 64 }}>
          <div className="timeline-track-labels"><span>Time</span><span>Video</span><span>Audio</span></div>
          <div className="timeline-tracks">
            <div className="timeline-ruler" onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); seekAt(event); }}
              onPointerMove={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) seekAt(event); }}>
              {ticks.map((tick) => <span key={tick} style={{ left: tick * pixelsPerSecond }}>{tick}s</span>)}
            </div>
            {(['video', 'audio'] as const).map((kind) => (
              <div className={`timeline-track ${kind}`} key={kind} style={{ backgroundSize: `${pixelsPerSecond}px 100%` }}>
                {clips.filter((c) => c.kind === kind).map((c) => (
                  <button key={c.id} className={`timeline-clip${c.id === clipId ? ' on' : ''}`}
                    style={{ left: c.start * pixelsPerSecond, width: Math.max(8, c.duration * pixelsPerSecond) }}
                    title={basename(c.path)} onClick={() => setClipId(c.id)}
                    onPointerDown={(event) => {
                      if (event.button !== 0) return;
                      event.currentTarget.setPointerCapture(event.pointerId);
                      setClipId(c.id);
                      ctx.store.begin('Move clip');
                      drag.current = { x: event.clientX, start: c.start };
                    }}
                    onPointerMove={(event) => {
                      if (drag.current && event.currentTarget.hasPointerCapture(event.pointerId)) {
                        edit(c.id, { start: Math.max(0, rounded(drag.current.start + (event.clientX - drag.current.x) / pixelsPerSecond)) }, 'Move clip');
                      }
                    }}
                    onLostPointerCapture={() => {
                      if (drag.current) ctx.store.end();
                      drag.current = null;
                    }}>
                    {(sequence?.isMissing(c.id) || sequence?.hasError(c.id)) ? '⚠ ' : ''}{basename(c.path)}
                  </button>
                ))}
              </div>
            ))}
            <div className="timeline-playhead" style={{ left: Math.min(time, scaleEnd) * pixelsPerSecond }} />
          </div>
        </div>
      </div>
      <input className="timeline-scrub" aria-label="Seek sequence" type="range" min={0} max={duration || 1} step={0.01}
        value={Math.min(time, duration)} disabled={!duration} onChange={(event) => seek(Number(event.target.value))} />
      {clip ? (
        <div className="timeline-tools timeline-selection" key={clip.id}>
          <span title={clip.path}>{basename(clip.path)}</span>
          <Seconds label="Start (s)" value={clip.start} onChange={(start) => { if (start !== clip.start) edit(clip.id, { start }); }} />
          <Seconds label="In (s)" value={clip.inPoint} onChange={(inPoint) => { if (inPoint !== clip.inPoint) edit(clip.id, { inPoint }); }} />
          <Seconds label="Length (s)" value={clip.duration} min={0.01} onChange={(duration) => { if (duration !== clip.duration) edit(clip.id, { duration }); }} />
          <label><input type="checkbox" checked={clip.muted} onChange={(event) => edit(clip.id, { muted: event.target.checked })} /> Mute</label>
          <button onClick={() => void relink(clip)}>Relink</button>
          <button onClick={() => set('Remove clip', { clips: clips.filter((c) => c.id !== clip.id) })}>Remove clip</button>
        </div>
      ) : <div className="empty">Add or drop clips. Select one to set its start, in point and length.</div>}
      {(busy || message) && <div className="empty" role="status">{busy ? 'Reading media…' : message}</div>}
    </section>
  );
}
