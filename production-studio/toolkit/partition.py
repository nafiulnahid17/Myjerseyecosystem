"""Bound the largest compound paths without flattening ordinary curves."""
import math

import numpy as np
from shapely import box, make_valid
from shapely.geometry import Polygon

FRACTIONS = {k: np.arange(1,k+1)[:,None]/k for k in range(2,65)}


def flatten(path):
    xy = np.array(path[0][1:])
    points = [tuple(xy)]
    for command,*co in path[1:]:
        if command == 'C':
            p1,p2,p = np.array(co).reshape(3,2)
            # Segments approximate the original curve to about 0.1 pixel.
            bend = max(np.linalg.norm(xy-2*p1+p2),np.linalg.norm(p1-2*p2+p))
            count = min(64,max(1,int(math.ceil(math.sqrt(bend*6/.78)))))
            if count == 1:
                points.append(tuple(p))
            else:
                t = FRACTIONS[count]; q = 1-t
                pts = q**3*xy + 3*q*q*t*p1 + 3*q*t*t*p2 + t**3*p
                points.extend(map(tuple,pts))
            xy = p
        elif command == 'L':
            xy = np.array(co)
            points.append(tuple(xy))
    if points[-1] != points[0]:
        points.append(points[0])
    return points



def polygon_parts(shape):
    if shape.geom_type == "Polygon" and not shape.is_empty:
        yield shape
    elif hasattr(shape, "geoms"):
        for part in shape.geoms:
            yield from polygon_parts(part)


def geometry(shape):
    commands = []
    for ring in (shape.exterior, *shape.interiors):
        coords = [(round(x, 4), round(y, 4)) for x, y in list(ring.coords)[:-1]]
        coords = [point for i, point in enumerate(coords) if point != coords[i-1]]
        if len(coords) >= 3:
            commands.append([("M", *coords[0]), *(("L", *point) for point in coords[1:]), ("Z",)])
    return commands


def limit(item, depth=0):
    if sum(map(len, item)) <= 1380:
        return [item]
    if depth >= 10:
        raise ValueError("A shape could not be partitioned within the Level 2 path limit")
    rings = [flatten(path) for path in item]
    if len(set(rings[0])) < 3:
        return []
    shape = Polygon(rings[0], [ring for ring in rings[1:] if len(set(ring)) >= 3])
    if not shape.is_valid:
        shape = make_valid(shape)
    if shape.is_empty:
        return []
    left, top, right, bottom = shape.bounds
    if right-left > bottom-top:
        cut = (left+right) / 2
        boxes = (box(left-1, top-1, cut+.09, bottom+1), box(cut-.09, top-1, right+1, bottom+1))
    else:
        cut = (top+bottom) / 2
        boxes = (box(left-1, top-1, right+1, cut+.09), box(left-1, cut-.09, right+1, bottom+1))
    result = []
    for bounds in boxes:
        piece = shape.intersection(bounds).simplify(.08, preserve_topology=True)
        for poly in polygon_parts(piece):
            if (paths := geometry(poly)):
                result.extend(limit(paths, depth+1))
    return result
