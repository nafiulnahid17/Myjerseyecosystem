"""Native contour extraction, palette preparation and LittleCMS inversion."""
import ctypes as ct
import os
from collections import defaultdict
from pathlib import Path

import numpy as np
from scipy.cluster.vq import kmeans2
from scipy.optimize import least_squares

ROOT = Path(__file__).resolve().parent
PROFILE = str(ROOT / "print.icc")
SRGB = str(ROOT / "srgb.icc")
PAD, SAMPLES = 3, 2
LAB_WEIGHT = np.array([1.12, .80, .80], np.float32)

class Point(ct.Structure):
    _fields_ = [('x', ct.c_double), ('y', ct.c_double)]


class Curve(ct.Structure):
    _fields_ = [('n', ct.c_int), ('tag', ct.POINTER(ct.c_int)), ('c', ct.POINTER(Point * 3))]


class PathNode(ct.Structure):
    pass


NodePtr = ct.POINTER(PathNode)
PathNode._fields_ = [
    ('area', ct.c_int), ('sign', ct.c_int), ('curve', Curve),
    ('next', NodePtr), ('childlist', NodePtr), ('sibling', NodePtr), ('priv', ct.c_void_p),
]


class Parameters(ct.Structure):
    _fields_ = [
        ('turdsize', ct.c_int), ('turnpolicy', ct.c_int), ('alphamax', ct.c_double),
        ('opticurve', ct.c_int), ('opttolerance', ct.c_double),
    ]


class Bitmap(ct.Structure):
    _fields_ = [('w', ct.c_int), ('h', ct.c_int), ('dy', ct.c_int), ('map', ct.c_void_p)]


class TraceState(ct.Structure):
    _fields_ = [('status', ct.c_int), ('plist', NodePtr)]


pot = ct.CDLL(os.environ.get("MYJERSEY_POTRACE", "libpotrace.so.0"))
pot.potrace_param_default.restype = ct.POINTER(Parameters)
pot.potrace_param_free.argtypes = [ct.POINTER(Parameters)]
pot.potrace_state_free.argtypes = [ct.POINTER(TraceState)]
pot.potrace_trace.argtypes = [ct.POINTER(Parameters), ct.POINTER(Bitmap)]
pot.potrace_trace.restype = ct.POINTER(TraceState)


simp = ct.CDLL(os.environ.get("MYJERSEY_SIMPLIFY", str(ROOT / "path_simplify.so")))
simp.simplify_path.argtypes = [ct.c_void_p, ct.c_int, ct.c_double, ct.c_void_p, ct.c_void_p]
simp.simplify_path.restype = ct.c_int


def simplify_near_straight(commands, eps):
    if len(commands) < 6 or eps < .05:
        return commands
    commands = commands[:-1]
    array = np.zeros((len(commands), 7), dtype=np.float64)
    for i, (command, *c) in enumerate(commands):
        array[i,0] = 2 if command == 'C' else 1
        array[i,1:1+len(c)] = c
    idx = np.empty(len(commands), np.int32)
    lines = np.empty(len(commands), np.uint8)
    n = simp.simplify_path(array.ctypes.data, len(commands), eps, idx.ctypes.data, lines.ctypes.data)
    result = [commands[0]]
    for k, line in zip(idx[:n], lines[:n]):
        obj = commands[k]
        result.append(('L', *obj[-2:]) if line else obj)
    if result[-1][0] == 'L' and result[-1][1:] == result[0][1:]:
        result.pop()
    if len(result) < 3:
        return commands + [('Z',)]
    return result + [('Z',)]


def contour(curve, epsilon):
    n = curve.n
    to_xy = lambda pt: (pt.x / SAMPLES - PAD, pt.y / SAMPLES)
    start = to_xy(curve.c[n - 1][2])
    current = start
    commands = [('M', *start)]
    for idx in range(n):
        pts = [to_xy(p) for p in curve.c[idx]]
        end = pts[2]
        if curve.tag[idx] == 1:
            controls = pts[:2]
            dx, dy = end[0] - current[0], end[1] - current[1]
            run = dx * dx + dy * dy
            if run > 0 and all(
                (dx*(p[1]-current[1])-dy*(p[0]-current[0]))**2 <= .046**2 * run
                and -.001 <= ((p[0]-current[0])*dx+(p[1]-current[1])*dy)/run <= 1.001
                for p in controls
            ):
                commands.append(('L', *end))
            else:
                commands.append(('C', *pts[0], *pts[1], *end))
        else:
            if pts[1] != current and pts[1] != end:
                commands.append(('L', *pts[1]))
            if end != current:
                commands.append(('L', *end))
        current = end
    if commands[-1][0] == 'L' and commands[-1][1:] == start:
        commands.pop()
    commands.append(('Z',))
    return simplify_near_straight(commands, epsilon)


def trace(mask, minimum, smooth, tolerance, epsilon):
    height, width = mask.shape
    stride = (width + 63) // 64
    packed = np.packbits(mask, axis=1, bitorder='big')
    storage = np.zeros((height, stride * 8), np.uint8)
    storage[:, :packed.shape[1]] = packed
    storage = storage.view('>u8').astype(np.uint64)
    bm = Bitmap(width, height, stride, storage.ctypes.data)
    param = pot.potrace_param_default()
    param.contents.turdsize = round(minimum * SAMPLES**2)
    param.contents.turnpolicy = 4  # Prefer the local minority at ambiguous corners.
    param.contents.alphamax = smooth
    param.contents.opttolerance = tolerance * SAMPLES
    state = pot.potrace_trace(param, ct.byref(bm))
    pot.potrace_param_free(param)
    if not state:
        raise MemoryError('Potrace failed to allocate a state')
    items = []
    try:
        if state.contents.status:
            raise RuntimeError('Potrace returned an incomplete trace')
        p = state.contents.plist
        while p:
            node = p.contents
            if node.sign == ord('+'):
                obj = [contour(node.curve, epsilon)]
                child = node.childlist
                while child:
                    if child.contents.sign == ord('-'):
                        obj.append(contour(child.contents.curve, epsilon))
                    child = child.contents.sibling
                items.append(obj)
            p = node.next
    finally:
        pot.potrace_state_free(state)
    return items


class ColorTransform:
    def __init__(self):
        cm = self.cm = ct.CDLL(os.environ.get("MYJERSEY_LCMS", "liblcms2.so.2"))
        cm.cmsOpenProfileFromFile.argtypes = [ct.c_char_p, ct.c_char_p]
        cm.cmsOpenProfileFromFile.restype = ct.c_void_p
        cm.cmsCreateTransform.argtypes = [ct.c_void_p, ct.c_uint32, ct.c_void_p, ct.c_uint32, ct.c_uint32, ct.c_uint32]
        cm.cmsCreateTransform.restype = ct.c_void_p
        cm.cmsDoTransform.argtypes = [ct.c_void_p, ct.c_void_p, ct.c_void_p, ct.c_uint32]
        rgb = cm.cmsOpenProfileFromFile(SRGB.encode(), b'r')
        cmyk = cm.cmsOpenProfileFromFile(PROFILE.encode(), b'r')
        rgbf = (1 << 22) | (4 << 16) | (3 << 3) | 4
        cmykf = (1 << 22) | (6 << 16) | (4 << 3) | 4
        flags = 0x2000 | 0x0100  # BPC and no 8-bit LUT optimization.
        self.encode = cm.cmsCreateTransform(rgb, rgbf, cmyk, cmykf, 1, flags)
        self.decode = cm.cmsCreateTransform(cmyk, cmykf, rgb, rgbf, 1, flags)
        if not self.encode or not self.decode:
            raise RuntimeError('Could not initialize LittleCMS profile transforms')
        self.cache = {}

    def run(self, transform, values, out_channels):
        values = np.ascontiguousarray(values, dtype=np.float32)
        dst = np.zeros((len(values), out_channels), np.float32)
        self.cm.cmsDoTransform(transform, values.ctypes.data, dst.ctypes.data, len(values))
        return dst

    def solve(self, rgb):
        key = tuple(round(float(x), 2) for x in rgb)
        if key in self.cache:
            return self.cache[key]
        target = np.array([key]) / 255
        start = self.run(self.encode, target, 4)[0].astype(float)
        start = np.clip(start, 0, 100)

        # Refine profile inversion in its own media-relative soft-proof space.
        def residual(x):
            q = self.run(self.decode, [x], 3)[0]
            return np.r_[
                (q - target[0]) * 255 * [.92, 1.0, .94],
                (x - start) * .015, max(x.sum() - 315.0, 0.0),
            ]
        result = least_squares(residual, start, bounds=(0, 100), diff_step=.003, max_nfev=40)
        corrected = result.x if np.linalg.norm(residual(result.x)) < np.linalg.norm(residual(start)) else start
        inks = tuple(round(float(v / 100), 5) for v in corrected)
        srgb = tuple(np.clip(np.round(self.run(self.decode, [np.array(inks) * 100], 3)[0] * 255), 0, 255).astype(int))
        self.cache[key] = inks, srgb
        return inks, srgb


def bilateral(rgb, sigma, amount):
    base=rgb.astype(np.float32)
    padded=np.pad(base,((1,1),(1,1),(0,0)),mode='edge')
    h,w,_=rgb.shape
    acc=base.copy()
    weights=np.ones((h,w),np.float32)
    for dy,dx in [(-1,-1),(-1,0),(-1,1),(0,-1),(0,1),(1,-1),(1,0),(1,1)]:
        neighbor=padded[1+dy:1+dy+h,1+dx:1+dx+w]
        delta=neighbor-base
        dist=(delta*delta).sum(2)
        factor=np.exp(-dist/(2*sigma*sigma))*(.48 if dx*dy==0 else .23)
        acc += neighbor*factor[...,None]
        weights+=factor
    return np.clip(base+(acc/weights[...,None]-base)*amount,0,255)


def mask_bbox(mask):
    rows,cols=np.flatnonzero(np.any(mask,axis=1)),np.flatnonzero(np.any(mask,axis=0))
    if not len(rows):
        return None
    return rows[0],rows[-1]+1,cols[0],cols[-1]+1


def trace_local(mask, minimum, smoothness, tolerance, epsilon):
    box=mask_bbox(mask)
    if box is None:
        return []
    y0,y1,x0,x1=box
    group=trace(mask[y0:y1,x0:x1],minimum,smoothness,tolerance,epsilon)
    shift_x=x0/SAMPLES
    shift_y=y0/SAMPLES
    def offset(line):
        op,*coords=line
        return (op, *(v+(shift_x if i%2==0 else shift_y) for i,v in enumerate(coords)))
    return [[list(map(offset,sub)) for sub in geom] for geom in group]


def train_lab(samples, eligible, k):
    rng=np.random.default_rng(772)
    src=samples[eligible]
    l=src[:,0]/LAB_WEIGHT[0]
    blu=np.clip(np.abs(src[:,2])/38,0,1)
    weights=.66+.48*np.clip((l+10)/63,0,1)+.16*blu
    picked=rng.choice(len(src), size=min(59000,len(src)), replace=False, p=weights/weights.sum(dtype=np.float64))
    data=np.ascontiguousarray(src[picked],np.float64)
    palette,_=kmeans2(data,k,iter=17,minit='++',seed=772)
    return palette


def group_small_marks(objects):
    # Group isolated decorations in close proximity without altering their
    # boundaries. Letter outlines and all contours with holes stay separate.
    kept=[]
    pockets=defaultdict(list)
    for obj in objects:
        if len(obj)!=1:
            kept.append(obj)
            continue
        path=obj[0]
        xs=[x for _,*v in path for x in v[::2]]
        ys=[y for _,*v in path for y in v[1::2]]
        width=max(xs)-min(xs); height=max(ys)-min(ys)
        if max(width,height)>5.0 or width*height>14 or len(path)>27:
            kept.append(obj)
            continue
        cell=(int(min(xs)//62),int(min(ys)//56))
        pockets[cell].append(path)
    for cell in sorted(pockets):
        rest=pockets[cell]
        for pos in range(0,len(rest),23):
            kept.append(rest[pos:pos+23])
    return kept
