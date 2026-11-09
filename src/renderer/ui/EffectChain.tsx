import { useState } from 'react';
import { EFFECTS, type EffectNode, type EffectType } from '../../core/effects';
import { newId } from '../../core/ids';
import type { ProjectStore } from '../../core/store';

export function EffectChain({ nodes, onChange, store }: {
  nodes: EffectNode[];
  onChange(nodes: EffectNode[]): void;
  store: ProjectStore;
}) {
  const [type, setType] = useState<EffectType>('ascii');
  const edit = (id: string, patch: Partial<EffectNode>) => onChange(nodes.map((node) => node.id === id ? { ...node, ...patch } : node));
  const move = (index: number, offset: number) => {
    const next = [...nodes];
    [next[index], next[index + offset]] = [next[index + offset], next[index]];
    onChange(next);
  };

  return (
    <section className="effect-chain" aria-label="Effect chain">
      <h3>Effect nodes</h3>
      <div className="effect-add">
        <select aria-label="Effect type" value={type} onChange={(event) => setType(event.target.value as EffectType)}>
          {Object.entries(EFFECTS).map(([id, effect]) => <option key={id} value={id}>{effect.name}</option>)}
        </select>
        <button onClick={() => onChange([...nodes, { id: newId('fx'), type, value: EFFECTS[type].value, enabled: true }])}>＋ Add</button>
      </div>
      {nodes.map((node, index) => (
        <div className="effect-node" key={node.id}>
          <div className="effect-node-header">
            <label>
              <input type="checkbox" checked={node.enabled} onChange={(event) => edit(node.id, { enabled: event.target.checked })} />
              {EFFECTS[node.type].name}
            </label>
            <span className="spacer" />
            <button className="icon" aria-label="Move effect up" disabled={index === 0} onClick={() => move(index, -1)}>↑</button>
            <button className="icon" aria-label="Move effect down" disabled={index === nodes.length - 1} onClick={() => move(index, 1)}>↓</button>
            <button className="icon" aria-label="Remove effect" onClick={() => onChange(nodes.filter((n) => n.id !== node.id))}>✕</button>
          </div>
          <label className="field">
            <span>{EFFECTS[node.type].control}</span>
            <input type="range" min={0} max={1} step={0.01} value={node.value}
              onPointerDown={() => store.begin('Adjust effect')}
              onPointerUp={() => store.end()}
              onPointerCancel={() => store.end()}
              onChange={(event) => edit(node.id, { value: Number(event.target.value) })} />
          </label>
        </div>
      ))}
    </section>
  );
}
