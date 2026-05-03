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
  const segmentCount = Math.max(4, Math.min(8, Math.round(distance / 100)));
  const baseAmplitude =
    Math.max(6, Math.min(25, distance * 0.04)) * intensity;

  // Catenary sag — rope droops downward under its own weight.
  // Scale with horizontal span so nearly-vertical ropes sag less.
  const horizontalWeight = Math.abs(dx) / Math.max(1, distance);
  const catSag =
    Math.min(130, distance * 0.16 + 28) * horizontalWeight * intensity;

  const points: Array<{ x: number; y: number }> = [];
  for (let i = 0; i <= segmentCount; i += 1) {
    const t = i / segmentCount;
    const jitter = (random() - 0.5) * 0.4;
    // Single slow wave — river-like wide arc, one gentle S-bend
    const slowWave = Math.sin((t + phaseShift) * Math.PI * 0.85);
    const profile = Math.sin(Math.PI * t);
    const offset =
      (slowWave * 0.92 + jitter * 0.08) *
      baseAmplitude *
      profile;

    // Gravity pulls the midpoint downward; ends are pinned.
    const sag = catSag * profile;

    points.push({
      x: from.x + dx * t + normalX * offset,
      y: from.y + dy * t + normalY * offset + sag,
    });
  }

  return buildSmoothPath(points);
}
