#!/usr/bin/env python3
"""Reconstruct both canonical panels and measure rendered EPS fidelity."""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import os
from pathlib import Path
import struct
import subprocess

import numpy as np
from PIL import Image, ImageCms
from scipy import ndimage as ndi
from scipy.cluster.hierarchy import linkage
from scipy.spatial import cKDTree

from geometry import ColorTransform, LAB_WEIGHT, PAD, PROFILE, SAMPLES, SRGB, bilateral, group_small_marks, trace_local, train_lab
from metrics import as_lab, delta_e, ssim
from partition import limit

WIDTH, HEIGHT = 1408, 1984
WPT, HPT = 1584, 2232
LIMIT = 10_000_000
PROOF_DIMS = (13200, 18600)
GS = os.environ.get("MYJERSEY_GS", "gs")


def digest(path):
    with path.open("rb") as file:
        return hashlib.file_digest(file, "sha256").hexdigest()


def palette_labels(visual, centers):
    """Assign labels at subpixel resolution in limited-memory strips."""
    labels = np.empty((HEIGHT*SAMPLES, (WIDTH+2*PAD)*SAMPLES), np.int16)
    counts = np.zeros(len(centers), np.int64)
    rgb_sum = np.zeros((len(centers), 3), np.float64)
    tree = cKDTree(centers)
    x = (np.arange(labels.shape[1], dtype=np.float32)+.5)/SAMPLES-.5-PAD
    for start in range(0, labels.shape[0], 72):
        stop = min(labels.shape[0], start+72)
        y = (np.arange(start, stop, dtype=np.float32)+.5)/SAMPLES-.5
        yy, xx = np.broadcast_arrays(y[:, None], x[None, :])
        slab = np.stack([ndi.map_coordinates(visual[..., c], (yy, xx), order=1, mode="nearest") for c in range(3)], axis=-1)
        ids = tree.query((as_lab(slab)*LAB_WEIGHT).reshape(-1, 3), workers=2)[1]
        labels[start:stop] = ids.reshape(stop-start, labels.shape[1])
        counts += np.bincount(ids, minlength=len(centers))
        for c in range(3):
            rgb_sum[:, c] += np.bincount(ids, weights=slab[..., c].ravel(), minlength=len(centers))
    used = np.flatnonzero(counts)
    mapping = np.full(len(counts), -1, np.int16)
    mapping[used] = np.arange(len(used), dtype=np.int16)
    return mapping[labels], centers[used], counts[used], rgb_sum[used]/counts[used, None]


def prepare_colors(master, size):
    source = np.asarray(master, np.float32)
    visual = bilateral(source, 14., .56)
    blurred = ndi.gaussian_filter(visual, (.99, .99, 0))
    diff = np.linalg.norm(visual-blurred, axis=2)
    dark = np.clip((61-visual.mean(axis=2))/55, 0, 1)
    visual += (blurred-visual) * ((.35+dark*.65) * np.clip((10-diff)/12, 0, .61))[..., None]
    del source, blurred, diff, dark
    train = as_lab(visual)*LAB_WEIGHT
    count = min(size, len(np.unique(np.asarray(master)[::16, ::16].reshape(-1, 3), axis=0)))
    centers = np.unique(train_lab(train, np.ones(train.shape[:2], bool), max(1, count)), axis=0)
    if not np.isfinite(centers).all():
        centers = centers[np.isfinite(centers).all(axis=1)]
    if not len(centers):
        raise ValueError("A dominant source color could not be determined")
    return palette_labels(visual, centers)


def family(rgb):
    r, g, b = rgb
    high, low = max(rgb), min(rgb)
    if high-low < 24:
        return "Neutral highlights" if high > 142 else "Neutral base and shadows"
    if r > g*1.06 and g > b*1.12:
        return "Gold and amber"
    if r > g*1.21 and r > b*1.16:
        return "Warm accents"
    if g > r*1.17 and g > b*1.15:
        return "Green tones"
    if b > g*1.15:
        return "Violet and blue" if r > g*1.1 else "Blue tones"
    if g > r*1.17 and b > r*1.24:
        return "Cyan details" if high > 77 else "Teal shadows"
    return "Secondary tones"


def rectangle():
    return [[("M", 0, 0), ("L", WIDTH, 0), ("L", WIDTH, HEIGHT), ("L", 0, HEIGHT), ("Z",)]]


def write_path(output, geometry):
    mapping = {"M": "moveto", "L": "lineto", "C": "curveto", "Z": "closepath"}
    for ring in geometry:
        for kind, *values in ring:
            nums = " ".join(f"{v:.2f}".rstrip("0").rstrip(".") or "0" for v in values)
            output.write((nums + " " if nums else "") + mapping[kind] + "\n")


def trace_eps(path, master, count, density_limit):
    labels, colors, density, average = prepare_colors(master, count)
    n = len(colors)
    tree = {}
    density = dict(enumerate(density))
    primary = dict(zip(range(n), range(n)))
    if n > 1:
        for j, (a, b, _, _) in enumerate(linkage(colors, method="ward"), n):
            a, b = int(a), int(b)
            if density[a] < density[b]:
                a, b = b, a
            tree[j] = (a, b)
            density[j] = density[a] + density[b]
            primary[j] = primary[a]
    root = 2*n-2
    order, intervals = [], {}

    def index(node):
        begin = len(order)
        if node < n:
            order.append(node)
        else:
            for child in tree[node]:
                index(child)
        intervals[node] = (begin, len(order)-1)

    index(root)
    labels = np.argsort(order).astype(np.int16)[labels]
    converter = ColorTransform()
    inks = [converter.solve(color)[0] for color in average]
    groups, objects, used_colors = 0, 0, set()
    with path.open("w", encoding="ascii", newline="\n") as out:
        out.write(f"""%!PS-Adobe-3.0 EPSF-3.0
%%Title: {path.name}
%%Creator: My Jersey Production Studio
%%BoundingBox: 0 0 1584 2232
%%HiResBoundingBox: 0 0 1584.000000 2232.000000
%%LanguageLevel: 2
%%DocumentData: Clean7Bit
%%DocumentProcessColors: Cyan Magenta Yellow Black
%%Pages: 1
%%EndComments
%%Page: 1 1
save
gsave
0 {HPT} translate
1.125 -1.125 scale
newpath
""")
        write_path(out, rectangle())
        out.write("clip\n")

        def paint(name, color, paths):
            nonlocal groups, objects
            if not paths:
                return
            groups += 1
            used_colors.add(color)
            out.write(f"%%Group: {name} | {groups}\ngsave\n")
            out.write(" ".join(f"{v:.5f}" for v in inks[color]) + " setcmykcolor\n")
            for geometry in paths:
                out.write("newpath\n")
                write_path(out, geometry)
                out.write("eofill\n" if len(geometry) > 1 else "fill\n")
                objects += 1
            out.write("grestore\n")
            if out.tell() >= LIMIT:
                raise OverflowError("Vector stream exceeds 10 MB")

        def walk(node):
            if node < n:
                return
            a, b = tree[node]
            walk(a)
            lo, hi = intervals[b]
            active = (labels >= lo) & (labels <= hi)
            color = primary[b]
            difference = np.linalg.norm(colors[color]-colors[primary[a]])
            highlight = np.max(average[color]) > 159
            minimum = (1.05 if difference > 17 else (3.50 if difference > 8 else (4.6 if highlight else 10.5))) * density_limit
            smooth, fit, epsilon = (.87, .25, .20) if difference > 14 else (1.03, .43, .33)
            traced = trace_local(active, minimum, smooth, fit * density_limit**.33, epsilon * density_limit**.4)
            del active
            geometry = [item for shape in traced for item in limit(shape)]
            paint(family(average[color]), color, group_small_marks(geometry))
            walk(b)

        paint("Continuous background", primary[root], [rectangle()])
        walk(root)
        out.write("grestore\nrestore\nshowpage\n%%PageTrailer\n%%Trailer\n%%EOF\n")
    if path.stat().st_size >= LIMIT:
        raise OverflowError("Vector stream exceeds 10 MB")
    return {"palette": len(used_colors), "inkCoverage": round(max(sum(inks[i]) for i in used_colors)*100, 2), "filledPaths": objects}


def load_master(path):
    with Image.open(path) as source:
        if source.format != "PNG" or source.size != (WIDTH, HEIGHT):
            raise ValueError("The locked master must be a 1408 x 1984 PNG")
        if ("A" in source.getbands() or "transparency" in source.info) and source.convert("RGBA").getchannel("A").getextrema() != (255, 255):
            raise ValueError("The master contains transparent pixels")
        rgb = source.convert("RGB")
        if profile := source.info.get("icc_profile"):
            embedded = ImageCms.ImageCmsProfile(io.BytesIO(profile))
            rgb = ImageCms.profileToProfile(rgb, embedded, SRGB, renderingIntent=1, outputMode="RGB")
        return rgb


def render_args(path, dpi, output):
    return [
        GS, "-q", "-dSAFER", "-dBATCH", "-dNOPAUSE", "-dEPSCrop", "-sDEVICE=png16m",
        "-dGraphicsAlphaBits=1", "-dNumRenderingThreads=2", "-dMaxBitmap=85000000",
        "-dBufferSpace=24000000", f"-r{dpi}", f"-sOutputFile={output}",
        "-sDefaultCMYKProfile=" + PROFILE, "-sOutputICCProfile=" + SRGB, "-dRenderIntent=1",
        "-c", "<< /BlackPtComp 1 >> setpagedevice", "-f", str(path),
    ]


def fit_render(path, target):
    proof = target.with_suffix(".temporary.png")
    subprocess.run(render_args(path, 128, proof), check=True, timeout=120)
    try:
        with Image.open(proof) as rendered:
            if rendered.size != (WIDTH*2, HEIGHT*2):
                raise ValueError("The EPS rendered at the wrong physical size")
            return rendered.convert("RGB").resize((WIDTH, HEIGHT), Image.Resampling.BOX)
    finally:
        proof.unlink(missing_ok=True)


def render_600_dpi(path):
    report = path.with_suffix(".600dpi.tmp.png")
    try:
        subprocess.run(render_args(path, 600, report), check=True, timeout=160)
        with report.open("rb") as image:
            header = image.read(24)
        if len(header) != 24 or header[:8] != b"\x89PNG\r\n\x1a\n" or header[12:16] != b"IHDR":
            raise ValueError("Ghostscript did not write the proof")
        dimensions = struct.unpack(">II", header[16:24])
        if dimensions != PROOF_DIMS:
            raise ValueError("The 600 DPI proof did not match the requested physical dimensions")
        return dimensions
    finally:
        report.unlink(missing_ok=True)


def measure(master, render):
    a, b = np.asarray(master, np.float32), np.asarray(render, np.float32)
    y = np.array([.299, .587, .114], np.float32)
    errors = np.empty((HEIGHT, WIDTH), np.float32)
    for row in range(0, HEIGHT, 144):
        sl = slice(row, row+144)
        errors[sl] = delta_e(as_lab(a[sl]), as_lab(b[sl]))
    return {"ssim": round(ssim(a@y, b@y), 6), "meanDeltaE": round(float(errors.mean()), 5),
            "p95DeltaE": round(float(np.percentile(errors, 95)), 5),
            "mae": round(float(np.abs(a-b).mean()), 5),
            "rmse": round(float(np.sqrt(np.square(a-b).mean())), 5)}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("front", type=Path)
    parser.add_argument("back", type=Path)
    parser.add_argument("directory", type=Path)
    parser.add_argument("--palette", type=int, default=84, choices=[64, 84, 104])
    args = parser.parse_args()
    args.directory.mkdir(exist_ok=True, parents=True)
    version = subprocess.check_output([GS, "--version"], text=True, timeout=12).strip()
    result = {
        "renderer": "Ghostscript " + version, "cmykProfile": "FOGRA39L Coated",
        "sourceProfile": "Embedded RGB ICC when present; sRGB otherwise",
        "proofDpi": 600,
    }
    for side, path in (("front", args.front), ("back", args.back)):
        output = args.directory / (side.upper() + "_BODY.eps")
        artwork = args.directory / (side + "-artwork.jpg")
        master = load_master(path)
        for capacity, density_limit in ((args.palette, 1.0), (60, 1.7), (44, 2.8), (32, 4.6)):
            try:
                details = trace_eps(output, master, capacity, density_limit)
                break
            except OverflowError:
                print(f"Reducing minor tonal details for {side} to keep its EPS under 10 MB", flush=True)
                output.unlink(missing_ok=True)
        else:
            raise ValueError(f"{side} EPS could not meet the 10 MB requirement")
        master.save(artwork, quality=95, subsampling=0, optimize=True, icc_profile=Path(SRGB).read_bytes())
        result[side] = {**details, "masterSha256": digest(path), "epsSha256": digest(output)}
        print(f"MYJERSEY_VECTOR_DONE={side}", flush=True)

    print("MYJERSEY_STAGE=validation", flush=True)
    for side, path in (("front", args.front), ("back", args.back)):
        output = args.directory / (side.upper() + "_BODY.eps")
        preview = args.directory / (side + "-proof.jpg")
        render = fit_render(output, preview)
        metrics = measure(load_master(path), render)
        render.thumbnail((900, 1268), Image.Resampling.LANCZOS)
        render.save(preview, quality=91, optimize=True, icc_profile=Path(SRGB).read_bytes())
        result[side].update({"compare": metrics, "proof": render_600_dpi(output),
                             "previewSha256": digest(preview), "artworkSha256": digest(args.directory / (side + "-artwork.jpg"))})
        print(f"MYJERSEY_PROOF_DONE={side}", flush=True)

    report = args.directory / "validation.json"
    report.write_text(json.dumps(result, allow_nan=False, indent=2), encoding="utf-8")
    print("MYJERSEY_STAGE=complete", flush=True)


if __name__ == "__main__":
    main()
