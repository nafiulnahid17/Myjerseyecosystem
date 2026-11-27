#!/usr/bin/env python3
"""Unpack the integrity-checked runtime in the hosted workspace."""
import hashlib
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tarfile

RUNTIME_PARTS = []


def main():
    base = Path(__file__).resolve().parent
    runtime = base / "my-jersey-runtime"
    runtime.mkdir(exist_ok=True)
    archive = runtime / "runtime.tar.gz"
    with archive.open("wb") as output:
        for name, expected in RUNTIME_PARTS:
            with (base / name).open("rb") as file:
                if hashlib.file_digest(file, "sha256").hexdigest() != expected:
                    raise RuntimeError("Hosted toolkit failed its file-integrity check")
                file.seek(0)
                shutil.copyfileobj(file, output)
    with tarfile.open(archive) as tar:
        tar.extractall(runtime, filter="data")
    archive.unlink()
    wheels = runtime / "wheels"
    packages = runtime / "packages"
    subprocess.run([sys.executable, "-m", "pip", "install", "--no-index", "--no-deps", "--no-compile",
                    "--target", str(packages), *map(str, sorted(wheels.glob("*.whl")))], check=True)
    native = runtime / "native"
    lib = native / "usr/lib/x86_64-linux-gnu"
    version = next(path for path in (native / "usr/share/ghostscript").iterdir() if path.name[0].isdigit())
    env = dict(os.environ)
    env.update({
        "PYTHONPATH": str(packages),
        "MYJERSEY_GS": str(native / "usr/bin/gs"),
        "MYJERSEY_POTRACE": str(lib / "libpotrace.so.0"),
        "MYJERSEY_LCMS": str(lib / "liblcms2.so.2"),
        "GS_LIB": os.pathsep.join((str(version / "Resource/Init"), str(version / "Resource"), str(version / "lib"),
                                  str(version / "iccprofiles"), str(native / "usr/share/ghostscript/fonts"))),
        "GS_FONTPATH": str(native / "usr/share/fonts/opentype/urw-base35"),
        "LD_LIBRARY_PATH": os.pathsep.join((str(lib), str(native / "lib/x86_64-linux-gnu"))),
        "OPENBLAS_NUM_THREADS": "2",
        "OMP_NUM_THREADS": "2",
    })
    final = base / "my-jersey-output"
    subprocess.run([sys.executable, str(runtime / "toolkit/production.py"), str(base / "front-master.png"),
                    str(base / "back-master.png"), str(final), *sys.argv[1:]], env=env, check=True)
    for file in final.iterdir():
        file.chmod(0o444)


if __name__ == "__main__":
    main()
