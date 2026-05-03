import type { CanvasElementRecord } from "@/types/canvas";

export function getElementCenter(element: CanvasElementRecord) {
  return {
    x: element.x + element.width / 2,
    y: element.y + element.height / 2,
  };
}

function hashSeed(value: string) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createSeededRandom(seed: number) {
  let state = seed || 1;
  return () => {
    state = Math.imul(state ^ (state >>> 15), 1 | state);
    state ^= state + Math.imul(state ^ (state >>> 7), 61 | state);
    return ((state ^ (state >>> 14)) >>> 0) / 4294967296;
  };
}

function buildSmoothPath(points: Array<{ x: number; y: number }>) {
  if (points.length < 2) {
    return "";
  }

  let d = `M ${points[0].x} ${points[0].y}`;

  for (let i = 1; i < points.length - 1; i += 1) {
    const current = points[i];
    const next = points[i + 1];
    const midX = (current.x + next.x) / 2;
    const midY = (current.y + next.y) / 2;
    d += ` Q ${current.x} ${current.y} ${midX} ${midY}`;
  }

  const prev = points[points.length - 2];
  const last = points[points.length - 1];
  d += ` Q ${prev.x} ${prev.y} ${last.x} ${last.y}`;

  return d;
}

export function getAttachmentPath(
  from: { x: number; y: number },
  to: { x: number; y: number },
  seed: string,
  intensity = 1,
  phaseShift = 0,
) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.hypot(dx, dy);

  if (distance < 1) {
    return `M ${from.x} ${from.y} L ${to.x} ${to.y}`;
  }

  const normalX = -dy / distance;
  const normalY = dx / distance;
  const random = createSeededRandom(
    hashSeed(`${seed}:${intensity}:${phaseShift}`),
  );
  const segmentCount = Math.max(7, Math.min(16, Math.round(distance / 65)));
  const baseAmplitude =
    Math.max(12, Math.min(42, distance * 0.075)) * intensity;

  const horizontalWeight = Math.abs(dx) / Math.max(1, distance);
  const catSag =
    Math.min(70, distance * 0.09 + 14) * horizontalWeight * intensity;

  const points: Array<{ x: number; y: number }> = [];
  for (let i = 0; i <= segmentCount; i += 1) {
    const t = i / segmentCount;
    const jitter = (random() - 0.5) * 2;
    const slowWave = Math.sin((t + phaseShift) * Math.PI * 1.8);
    const midWave = Math.sin((t * 2.8 + phaseShift * 0.7) * Math.PI);
    const profile = Math.sin(Math.PI * t);
    const offset =
      (slowWave * 0.65 + midWave * 0.25 + jitter * 0.1) *
      baseAmplitude *
      profile;

    const sag = catSag * profile;

    points.push({
      x: from.x + dx * t + normalX * offset,
      y: from.y + dy * t + normalY * offset + sag,
    });
  }

  return buildSmoothPath(points);
}
