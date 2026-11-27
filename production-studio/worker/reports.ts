import { strToU8, zipSync } from "fflate";
import type { PanelReport } from "../src/contracts";
import type { Env, JobRow } from "./bindings";
import { prefix } from "./bindings";
import { auditEPS } from "./eps";
import { dimensions, sha256 } from "./images";
import { hostedArtifact, hostedFiles, ProductionError } from "./openai";

export const panelSides = ["front", "back"] as const;
export type Side = typeof panelSides[number];
export const epsName = (side: Side) => side.toUpperCase() + "_BODY.eps";

interface PanelValidation {
  masterSha256: string;
  epsSha256: string;
  previewSha256: string;
  artworkSha256: string;
  compare: PanelReport["compare"] & { mae: number; rmse: number };
  proof: [number, number];
  inkCoverage: number;
  filledPaths: number;
  palette: number;
}

interface Validation {
  front: PanelValidation;
  back: PanelValidation;
  renderer: string;
  cmykProfile: string;
  sourceProfile: string;
  proofDpi: number;
}

const check = (value: unknown, low: number, high: number) => typeof value === "number" && Number.isFinite(value) && value >= low && value <= high;
const hashPattern = /^[0-9a-f]{64}$/;

function isPanelMetrics(value: PanelValidation, masterHash: string) {
  if (!value || value.masterSha256 !== masterHash || ![value.epsSha256, value.previewSha256, value.artworkSha256].every(hash => hashPattern.test(hash))) return false;
  const { compare, proof } = value;
  return proof?.length === 2 && proof[0] === 13_200 && proof[1] === 18_600 && !!compare &&
    check(compare.ssim, -1, 1) && check(compare.meanDeltaE, 0, 140) && check(compare.p95DeltaE, 0, 140) &&
    check(compare.mae, 0, 255) && check(compare.rmse, 0, 255) && check(value.inkCoverage, 0, 400) && Number.isInteger(value.filledPaths);
}

export async function getValidation(env: Env, container: string, sources: Record<Side, string>) {
  const names = ["validation.json", ...panelSides.flatMap(side => [epsName(side), side + "-proof.jpg", side + "-artwork.jpg"])];
  const ids = await hostedFiles(env, container, names);
  const bytes = await hostedArtifact(env, container, ids["validation.json"], 64 * 1024);
  const measured = JSON.parse(new TextDecoder().decode(bytes)) as Validation;
  if (measured.proofDpi !== 600 || !/^Ghostscript \d+\.\d+(?:\.\d+)?$/.test(measured.renderer) ||
      measured.cmykProfile !== "FOGRA39L Coated" || !panelSides.every(side => isPanelMetrics(measured[side], sources[side]))) {
    throw new ProductionError("Production evidence did not match the locked artwork or 600 DPI proof.");
  }
  return { measured, ids };
}

async function requireHash(data: ArrayBuffer, hash: string) {
  if (await sha256(data) !== hash) throw new ProductionError("A production artifact failed its integrity check.");
}

export async function validatePanel(
  env: Env, jobId: string, container: string, side: Side, ids: Record<string, string>, measured: PanelValidation,
) {
  const name = epsName(side);
  const eps = await hostedArtifact(env, container, ids[name], 9_999_999);
  await requireHash(eps, measured.epsSha256);
  let audit;
  try { audit = auditEPS(eps); }
  catch (error) { throw new ProductionError(error instanceof Error ? error.message : "An EPS did not pass the vector preflight."); }
  if (audit.paths !== measured.filledPaths || measured.palette < audit.cmykColors ||
      Math.abs(audit.maxInk - measured.inkCoverage) > .015) {
    throw new ProductionError("A rendered EPS did not match its native path and ink measurements.");
  }
  await env.BUCKET.put(prefix(jobId) + name, eps, { httpMetadata: { contentType: "application/postscript" } });

  for (const [suffix, hash] of [["-proof.jpg", measured.previewSha256], ["-artwork.jpg", measured.artworkSha256]]) {
    const filename = side + suffix;
    const data = await hostedArtifact(env, container, ids[filename], 8_000_000);
    await requireHash(data, hash);
    const size = dimensions(new Uint8Array(data));
    const correct = suffix === "-artwork.jpg" ? size?.width === 1408 && size?.height === 1984 : size?.width === 900 && size?.height === 1268;
    if (!correct || size?.type !== "image/jpeg") throw new ProductionError("A downloaded preview did not match the verified artwork dimensions.");
    await env.BUCKET.put(prefix(jobId) + filename, data, { httpMetadata: { contentType: "image/jpeg" } });
  }
  return { ...audit, compare: measured.compare, proof: measured.proof };
}

function technicalText(
  row: JobRow, report: { front: PanelReport; back: PanelReport }, validation: Validation, at: number,
) {
  const sections = panelSides.map(side => {
    const item = report[side];
    const v = validation[side];
    return [
      epsName(side),
      "  File bytes: " + item.bytes,
      "  Physical size: 22 x 31 in (558.8 x 787.4 mm)",
      "  BoundingBox: 0 0 1584 2232 pt",
      "  HiResBoundingBox: 0 0 1584.000000 2232.000000 pt",
      "  Format: EPSF 3.0, PostScript Level 2",
      "  Color: native process Cyan, Magenta, Yellow, Black",
      "  Colors: " + item.cmykColors,
      "  Filled paths and editable objects: " + item.paths,
      "  Recorded color/tonal groups: " + item.groups,
      "  Total subpaths: " + item.subpaths,
      "  Compound fills: " + item.compounds,
      "  Cubic commands: " + item.curves,
      "  Straight-line commands: " + item.lines,
      "  Explicit closepath commands: " + item.closes,
      "  Geometry segments (line + cubic + close): " + (item.lines + item.curves + item.closes),
      "  Clipping operations: " + item.clips,
      "  Tone representation: colored vector fills",
      "  Embedded raster objects: " + item.rasters,
      "  Resolution independence: verified native paths",
      "  Total area coverage: " + item.maxInk.toFixed(2) + "%",
      "  600 DPI rendering verified: " + item.proof.join(" x ") + " px",
      "  Luminance SSIM: " + item.compare.ssim,
      "  Delta E 2000 (mean / 95th percentile): " + item.compare.meanDeltaE + " / " + item.compare.p95DeltaE,
      "  RGB MAE / RMSE (0-255): " + v.compare.mae + " / " + v.compare.rmse,
      "  Approved master SHA-256: " + v.masterSha256,
      "  EPS SHA-256: " + v.epsSha256,
    ].join("\n");
  });
  return [
    "MY JERSEY  |  TECHNICAL REPORT",
    "Run " + row.id,
    "Stage durations are recorded by the production workspace. Time to packaging: " + ((at - (row.started_at ?? row.created_at))/1000).toFixed(1) + " seconds.",
    "Master color: " + validation.sourceProfile,
    "Conversion: LittleCMS, media-relative colorimetric with black point compensation and profile-space color refinement.",
    "CMYK profile for this preflight: " + validation.cmykProfile,
    "Rendering: " + validation.renderer,
    "",
    ...sections.flatMap(section => [section, ""]),
    "Color checks compare each rendered EPS with its own canonical RGB artwork. RGB colors outside the CMYK gamut and very fine tonal transitions can differ.",
    "The EPS contains separately painted vector contours and compound paths. Host editor grouping behavior depends on its EPS importer.",
    "Adobe Illustrator import and your final printer ICC profile are outside this preflight.",
    "",
  ].join("\n");
}

export async function packageOutput(env: Env, row: JobRow, validation: Validation, front: PanelReport, back: PanelReport) {
  const files: Parameters<typeof zipSync>[0] = {
    "TECHNICAL_REPORT.txt": strToU8(technicalText(row, { front, back }, validation, Date.now())),
  };
  for (const side of panelSides) {
    for (const file of [epsName(side), side + "-artwork.jpg"]) {
      const saved = await env.BUCKET.get(prefix(row.id) + file);
      if (!saved) throw new ProductionError("A validated production file is unavailable for packaging.");
      files[file.endsWith(".jpg") ? side.toUpperCase() + "_ARTWORK.jpg" : file] =
        [new Uint8Array(await saved.arrayBuffer()), { level: file.endsWith(".jpg") ? 0 : 1 }];
    }
  }
  const packed = zipSync(files, { level: 1 });
  const key = prefix(row.id) + "master.zip";
  await env.BUCKET.put(key, packed, { httpMetadata: { contentType: "application/zip" } });
  return { front, back, renderer: validation.renderer, cmykProfile: validation.cmykProfile, packageBytes: packed.byteLength };
}
