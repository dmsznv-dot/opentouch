export const EFFECTS = {
  transform: { name: 'Transform', control: 'Rotate', value: 0.15 },
  displace: { name: 'Displace', control: 'Amount', value: 0.35 },
  ascii: { name: 'ASCII Art', control: 'Cell size', value: 0.25 },
  particles: { name: 'Particles', control: 'Density', value: 0.45 },
  pulse: { name: 'Audio Pulse', control: 'Sensitivity', value: 0.6 },
  blur: { name: 'Blur', control: 'Radius', value: 0.2 },
  level: { name: 'Level', control: 'Brightness', value: 0.65 },
  mirror: { name: 'Mirror', control: 'Mix', value: 1 },
  threshold: { name: 'Threshold', control: 'Cutoff', value: 0.5 },
  feedback: { name: 'Feedback', control: 'Trail length', value: 0.65 },
} as const;

export type EffectType = keyof typeof EFFECTS;
export interface EffectNode {
  id: string;
  type: EffectType;
  value: number;
  enabled: boolean;
}
