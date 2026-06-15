// Builds slider ceilings + tick marks for the resource limits from the real host capacity, so the
// memory/CPU sliders top out at what the machine actually has rather than a hardcoded guess. When
// the host capacity is unknown (Docker unreachable → zeros) we fall back to conservative defaults.

export interface Mark {
  value: number;
  label: string;
}

const FALLBACK_MEMORY_MB = 4096;
const FALLBACK_CPUS = 8;

// Round host memory down to whole GB for a clean ceiling (at least 1G).
export function memoryMaxMb(hostMemoryMb: number | undefined): number {
  if (!hostMemoryMb || hostMemoryMb < 1024) {
    return FALLBACK_MEMORY_MB;
  }

  return Math.floor(hostMemoryMb / 1024) * 1024;
}

export function memoryMarks(maxMb: number): Mark[] {
  const gb = Math.max(1, Math.round(maxMb / 1024));
  const stepGb = gb <= 4 ? 1 : Math.ceil(gb / 4);
  const marks: Mark[] = [{ value: 0, label: "Off" }];

  for (let g = stepGb; g < gb; g += stepGb) {
    marks.push({ value: g * 1024, label: `${g}G` });
  }

  marks.push({ value: gb * 1024, label: `${gb}G` });

  return marks;
}

export function cpuMax(hostCpus: number | undefined): number {
  return hostCpus && hostCpus > 0 ? Math.max(1, Math.round(hostCpus)) : FALLBACK_CPUS;
}

export function cpuMarks(maxCores: number): Mark[] {
  const max = Math.max(1, Math.round(maxCores));
  const step = max <= 4 ? 1 : Math.ceil(max / 4);
  const marks: Mark[] = [{ value: 0, label: "Off" }];

  for (let c = step; c < max; c += step) {
    marks.push({ value: c, label: String(c) });
  }

  marks.push({ value: max, label: String(max) });

  return marks;
}
