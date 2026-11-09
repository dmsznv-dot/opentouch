import { expect, test } from '@playwright/test';

test('imports two clips, maps the sequence, crops it and applies ASCII', async ({ page }) => {
  await page.goto('/tests/render/ui.html');
  await page.getByTestId('add-surface').click();
  await page.getByTestId('add-sequence').click();
  const timeline = page.getByRole('region', { name: 'Sequencer' });
  await timeline.getByRole('button', { name: 'Video clips' }).click();
  await expect(timeline.locator('.timeline-clip')).toHaveCount(1);
  await timeline.getByRole('button', { name: 'Video clips' }).click();
  await expect(timeline.locator('.timeline-clip')).toHaveCount(2);
  await page.getByRole('button', { name: '＋ Add', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: 'ASCII Art' })).toBeChecked();

  const result = await page.evaluate(() => {
    const ctx = (window as any).__ctx as import('../../src/renderer/app-context').AppContext;
    const p = ctx.store.get();
    const s = p.sources[0];
    if (s.type !== 'sequence') throw new Error('No sequence');
    return { mapped: p.surfaces[0].sourceId === s.id, clips: s.params.clips, effects: s.params.effects };
  });
  expect(result.mapped).toBe(true);
  expect(result.clips[1].start).toBeCloseTo(result.clips[0].duration);
  expect(result.effects?.[0].type).toBe('ascii');

  await page.getByText('Surface 1', { exact: true }).click();
  await page.getByRole('checkbox', { name: 'Crop to fill' }).check();
  await expect(page.getByRole('checkbox', { name: 'Crop to fill' })).toBeChecked();
});

test('shows video after a missing clip, and particles react to an audio file', async ({ page }) => {
  await page.goto('/tests/render/ui.html');
  const result = await page.evaluate(async () => {
    const { SequenceSource } = await import('/src/renderer/sources/sequence.ts' as string) as typeof import('../../src/renderer/sources/sequence');
    const file = '/tests/fixtures/bars.webm';
    const bytes = new ArrayBuffer(44 + 48000 * 4);
    const wav = new DataView(bytes);
    const ascii = (i: number, s: string) => [...s].forEach((c, n) => wav.setUint8(i + n, c.charCodeAt(0)));
    ascii(0, 'RIFF'); wav.setUint32(4, bytes.byteLength - 8, true);
    ascii(8, 'WAVEfmt '); wav.setUint32(16, 16, true);
    wav.setUint16(20, 1, true); wav.setUint16(22, 1, true);
    wav.setUint32(24, 48000, true); wav.setUint32(28, 96000, true);
    wav.setUint16(32, 2, true); wav.setUint16(34, 16, true);
    ascii(36, 'data'); wav.setUint32(40, bytes.byteLength - 44, true);
    for (let i = 0; i < 96000; i++) wav.setInt16(44 + i * 2, Math.sin(i / 48000 * 2 * Math.PI * 70) * 24000, true);
    const audio = URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' }));
    const opts = { mediaUrl: (path: string) => path, document };
    const visual = new SequenceSource('cut', {
      width: 160, height: 90, loop: false,
      clips: [
        { id: 'missing', path: '/missing.webm', kind: 'video', start: 0, inPoint: 0, duration: 1, muted: true },
        { id: 'present', path: file, kind: 'video', start: 1, inPoint: 0.2, duration: 1, muted: true },
      ],
    }, opts);
    const particles = new SequenceSource('particles', {
      width: 160, height: 90, loop: true,
      clips: [{ id: 'audio', path: audio, kind: 'audio', start: 0, inPoint: 0, duration: 2, muted: false }],
      effects: [{ id: 'fx', type: 'particles', enabled: true, value: 0.3 }],
    }, opts);
    visual.markMissing(['missing']);
    visual.pause();
    visual.seek(1.3);
    const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    const pixels = (source: InstanceType<typeof SequenceSource>) => {
      const canvas = source.preview;
      const rgba = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
      let colored = 0;
      for (let i = 0; i < rgba.length; i += 4) if (rgba[i + 1] > 40 || rgba[i] > 40 || rgba[i + 2] > 40) colored++;
      return colored;
    };
    let videoPixels = 0;
    let loudParticles = 0;
    try {
      for (let i = 0; i < 70; i++) {
        const now = performance.now() / 1000;
        visual.tick(now);
        particles.tick(now);
        videoPixels = Math.max(videoPixels, pixels(visual));
        loudParticles = Math.max(loudParticles, pixels(particles));
        if (videoPixels > 100 && loudParticles > 500) break;
        await wait(35);
      }
      return { videoPixels, loudParticles, status: visual.status, hasFrame: visual.hasFrame };
    } finally {
      visual.dispose();
      particles.dispose();
      URL.revokeObjectURL(audio);
    }
  });
  expect(result.status).toBe('missing');
  expect(result.hasFrame).toBe(true);
  expect(result.videoPixels).toBeGreaterThan(100);
  expect(result.loudParticles).toBeGreaterThan(500);
});
