#!/usr/bin/env python3
"""Build the Linux x86-64 Hosted Shell runtime from pinned wheels and Debian."""
import hashlib
import json
import lzma
from pathlib import Path
import shutil
import subprocess
import tarfile
import urllib.request
from concurrent.futures import ThreadPoolExecutor

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / ".toolkit"
ASSETS = ROOT / ".runtime"
DEBIAN = "https://deb.debian.org/debian/"
INDEX = DEBIAN + "dists/bookworm/main/binary-amd64/Packages.xz"
WHEELS = ["numpy==2.2.6", "scipy==1.15.3", "Pillow==11.3.0", "shapely==2.0.7"]
PACKAGES = (
    "ghostscript", "libgs10", "libgs10-common", "libgs-common", "libpotrace0",
    "liblcms2-2", "libpaper1", "libidn12", "libijs-0.35", "libjbig2dec0",
    "libjpeg62-turbo", "libtiff6", "libjbig0", "liblerc4", "libopenjp2-7",
    "fonts-urw-base35", "libxt6", "libx11-6", "libxau6", "libxdmcp6", "libxcb1",
    "libxext6", "libsm6", "libice6", "libcups2", "libavahi-client3",
    "libavahi-common3", "libpng16-16", "libfontconfig1", "libfreetype6", "libwebp7",
    "zlib1g", "libzstd1", "liblzma5", "libdeflate0", "libexpat1", "libbrotli1", "libuuid1",
    "libbsd0", "libmd0", "libstdc++6", "libgcc-s1", "libgnutls30", "libgssapi-krb5-2",
    "libkrb5-3", "libk5crypto3", "libcom-err2", "libkrb5support0", "libkeyutils1",
    "libp11-kit0", "libidn2-0", "libunistring2", "libtasn1-6", "libhogweed6",
    "libnettle8", "libgmp10", "libffi8", "libdbus-1-3", "libsystemd0", "libcap2",
    "libgcrypt20", "libgpg-error0", "liblz4-1",
)


def download(url, path, checksum=None):
    if not path.is_file() or (checksum and hashlib.sha256(path.read_bytes()).hexdigest() != checksum):
        temporary = path.with_suffix(path.suffix + ".tmp")
        with urllib.request.urlopen(url, timeout=70) as stream, temporary.open("wb") as output:
            shutil.copyfileobj(stream, output)
        if checksum and hashlib.sha256(temporary.read_bytes()).hexdigest() != checksum:
            temporary.unlink()
            raise ValueError("Debian package did not match the index: " + path.name)
        temporary.replace(path)
    return path


def native():
    archive = download(INDEX, CACHE / "bookworm.xz")
    table = {}
    with lzma.open(archive, "rt", encoding="utf-8") as index:
        for paragraph in index.read().split("\n\n"):
            fields = dict(line.split(": ", 1) for line in paragraph.splitlines() if line and not line[0].isspace() and ": " in line)
            if fields.get("Package") in PACKAGES and fields.get("Architecture") in {"all", "amd64"}:
                table[fields["Package"]] = fields
    native_root = CACHE / "native"
    native_root.mkdir(exist_ok=True)
    target = CACHE / "packages"
    target.mkdir(exist_ok=True)

    def get(name):
        fields = table[name]
        remote = fields["Filename"]
        local = download(DEBIAN + remote, target / Path(remote).name, fields["SHA256"])
        return local, {"package": name, "version": fields["Version"], "source": "https://sources.debian.org/src/" + fields.get("Source", name).split()[0] + "/", "sha256": fields["SHA256"]}

    with ThreadPoolExecutor(max_workers=6) as pool:
        packages = list(pool.map(get, PACKAGES))
    for package, _ in packages:
        subprocess.run(["dpkg-deb", "-x", str(package), str(native_root)], check=True)
    (native_root / "debian-sources.json").write_text(json.dumps([notice for _, notice in packages], indent=2))
    return native_root


def build():
    CACHE.mkdir(exist_ok=True)
    runtime = native()
    wheels = CACHE / "wheels"
    wheels.mkdir(exist_ok=True)
    if len(list(wheels.glob("*.whl"))) < len(WHEELS):
        subprocess.run(["python3", "-m", "pip", "download", "--only-binary=:all:", "--platform",
                        "manylinux_2_28_x86_64", "--platform", "manylinux2014_x86_64", "--python-version",
                        "311", "--implementation", "cp", "--abi", "cp311", "--dest", str(wheels), *WHEELS], check=True)
    ASSETS.mkdir(parents=True, exist_ok=True)
    archive = CACHE / "runtime.tar.gz"
    # Some Debian Ghostscript resource symlinks are created by package post-install.
    # The production interpreter only requires the self-contained native resources.
    ghostscript = runtime / "usr/share/ghostscript"
    for link in ghostscript.rglob("*"):
        if link.is_symlink() and not link.exists():
            link.unlink()
    # This small helper uses only stable libstdc++ symbols on Linux x86-64.
    simple = CACHE / "path_simplify.so"
    subprocess.run(["c++", "-O2", "-shared", "-fPIC", str(ROOT / "toolkit/path_simplify.cpp"), "-o", str(simple)], check=True)
    with tarfile.open(archive, "w:gz", compresslevel=5, dereference=True) as tar:
        tar.add(ROOT / "toolkit", "toolkit", filter=lambda item: item if "__pycache__" not in item.name else None)
        tar.add(wheels, "wheels")
        tar.add(simple, "toolkit/path_simplify.so")
        for relative in ["usr/bin/gs", "usr/lib/x86_64-linux-gnu", "lib/x86_64-linux-gnu", "usr/share/ghostscript",
                         "usr/share/fonts/opentype/urw-base35", "debian-sources.json"]:
            tar.add(runtime / relative, "native/" + relative)
        for name in PACKAGES:
            copyright_file = runtime / "usr/share/doc" / name / "copyright"
            if copyright_file.is_file():
                tar.add(copyright_file, "native/copyright/" + name)
    for existing in ASSETS.glob("runtime.part*"):
        existing.unlink()
    records = []
    with archive.open("rb") as stream:
        for index in range(99):
            part = stream.read(14_000_000)
            if not part:
                break
            target = ASSETS / f"runtime.part{index:02d}"
            target.write_bytes(part)
            records.append({"name": target.name, "sha256": hashlib.sha256(part).hexdigest(), "bytes": len(part)})
        else:
            raise ValueError("Runtime is too large")
    launcher = (ROOT / "toolkit" / "launch.py").read_text()
    launcher = launcher.replace("RUNTIME_PARTS = []", "RUNTIME_PARTS = " + repr([(p["name"], p["sha256"]) for p in records]))
    launch = ASSETS / "launch.py"
    launch.write_text(launcher)
    records.insert(0, {"name": launch.name, "sha256": hashlib.sha256(launch.read_bytes()).hexdigest(), "bytes": launch.stat().st_size})
    (ASSETS / "manifest.json").write_text(json.dumps(records, indent=2) + "\n")
    print(f"Packaged {len(records)} Hosted Shell files ({sum(r['bytes'] for r in records):,} bytes).")


if __name__ == "__main__":
    build()
