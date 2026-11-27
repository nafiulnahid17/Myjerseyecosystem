interface VectorAudit {
  bytes: number;
  paths: number;
  groups: number;
  rasters: number;
  subpaths: number;
  curves: number;
  lines: number;
  cmykColors: number;
  compounds: number;
  closes: number;
  clips: number;
  maxInk: number;
}

const operators: Record<string, number> = {
  save: 0, restore: 0, gsave: 0, grestore: 0, translate: 2, scale: 2,
  newpath: 0, moveto: 2, lineto: 2, curveto: 6, closepath: 0, clip: 0,
  setcmykcolor: 4, fill: 0, eofill: 0, showpage: 0
};
const numeric = /^[-+]?(?:\d+(?:\.\d*)?|\.\d+)$/;
const headerPattern = /^%!PS-Adobe-3\.0 EPSF-3\.0$/;

export function auditEPS(buffer: ArrayBuffer): VectorAudit {
  if (buffer.byteLength === 0 || buffer.byteLength >= 10_000_000) throw new Error("An EPS exceeded the 10 MB production limit.");
  const source = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  if (!/^[\x09\x0A\x0D\x20-\x7E]+$/.test(source)) throw new Error("An EPS contained unsupported binary data.");
  const lines = source.split("\n");
  if (!headerPattern.test(lines[0]?.trim() ?? "") ||
      !lines.includes("%%BoundingBox: 0 0 1584 2232") ||
      !lines.includes("%%HiResBoundingBox: 0 0 1584.000000 2232.000000") ||
      !lines.includes("%%LanguageLevel: 2") ||
      !lines.includes("%%DocumentProcessColors: Cyan Magenta Yellow Black") ||
      !lines.includes("%%Pages: 1") || !lines.includes("%%EOF")) throw new Error("An EPS did not match the 22 × 31 in Level 2 CMYK contract.");
  let page = 0, saves = 0, graphics = 0, fillCount = 0, curves = 0, straight = 0, subpaths = 0, groupCount = 0;
  let compounds = 0, closes = 0, clips = 0, maxInk = 0;
  let path: { open: boolean; rings: number; segments: number; length: number } | null = null;
  let ink: string | null = null;
  const inks = new Set<string>();
  const paintGroups: { depth: number; used: boolean }[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("%")) {
      if (line.startsWith("%%Group: ")) paintGroups.push({ depth: graphics + 1, used: false });
      continue;
    }
    const parts = line.split(/\s+/);
    const op = parts.pop() ?? "";
    if (!Object.hasOwn(operators, op) || parts.length !== operators[op] ||
        parts.some(part => !numeric.test(part) || !Number.isFinite(Number(part)) || Math.abs(Number(part)) > 25_000)) {
      throw new Error("An EPS contained an operation outside the editable vector format.");
    }
    const failPath = () => { throw new Error("An EPS contained an incomplete or oversized vector path."); };
    switch (op) {
      case "save": saves++; break;
      case "restore": saves--; break;
      case "gsave": graphics++; break;
      case "grestore":
        if (paintGroups.at(-1)?.depth === graphics && paintGroups.pop()?.used) groupCount++;
        graphics--;
        break;
      case "setcmykcolor":
        if (parts.some(part => Number(part) < 0 || Number(part) > 1)) throw new Error("An EPS contained invalid CMYK values.");
        ink = parts.map(Number).join(" ");
        break;
      case "newpath":
        if (path?.open) failPath();
        path = { open: false, rings: 0, length: 0, segments: 0 };
        break;
      case "moveto":
        if (!path || path.open) return failPath() as never;
        path.open = true; path.rings++; path.length++;
        break;
      case "curveto":
      case "lineto":
        if (!path?.open) return failPath() as never;
        path.segments++; path.length++;
        if (op === "curveto") curves++; else straight++;
        break;
      case "closepath":
        if (!path?.open || !path.segments) return failPath() as never;
        path.open = false; path.segments = 0; path.length++; closes++;
        break;
      case "clip":
      case "fill":
      case "eofill":
        if (!path || path.open || !path.rings || path.length > 1500) return failPath() as never;
        if (op !== "clip") {
          if (!ink) throw new Error("An EPS contained a fill without a native CMYK color.");
          fillCount++; subpaths += path.rings; inks.add(ink);
          if (path.rings > 1) compounds++;
          maxInk = Math.max(maxInk, ink.split(" ").reduce((sum, channel) => sum + Number(channel), 0) * 100);
          const group = paintGroups.at(-1);
          if (group?.depth === graphics) group.used = true;
        } else { clips++; }
        path = null;
        break;
      case "showpage": page++; break;
    }
    if (saves < 0 || graphics < 0 || saves > 3 || graphics > 12) throw new Error("An EPS had an invalid graphics state.");
  }
  if (page !== 1 || saves !== 0 || graphics !== 0 || paintGroups.length || path?.open || fillCount < 1 || groupCount < 1) {
    throw new Error("An EPS did not contain valid, grouped artwork.");
  }
  return { bytes: buffer.byteLength, paths: fillCount, subpaths, curves, lines: straight, cmykColors: inks.size, groups: groupCount, rasters: 0, compounds, closes, clips, maxInk: +maxInk.toFixed(2) };
}
