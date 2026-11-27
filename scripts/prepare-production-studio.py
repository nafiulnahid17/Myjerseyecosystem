#!/usr/bin/env python3
"""Prepare the approved Studio runtime and real account bindings."""
import argparse
import base64
import gzip
import hashlib
import json
import re
from pathlib import Path
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parent.parent
PREFIX = "my-jersey-studio/"
DEST = ROOT / "production-studio" / ".runtime"

parser = argparse.ArgumentParser()
parser.add_argument("setup_zip", type=Path)
parser.add_argument("--database-id", required=True)
parser.add_argument("--bucket", required=True)
parser.add_argument("--access-team-domain", required=True)
parser.add_argument("--access-aud", required=True)
args = parser.parse_args()

if not re.fullmatch(r"[0-9a-fA-F-]{36}", args.database_id):
    parser.error("Use the existing Cloudflare D1 database ID.")
if not re.fullmatch(r"[a-z0-9][a-z0-9-]{1,62}", args.bucket):
    parser.error("Use an existing private R2 bucket name.")
if not re.fullmatch(r"[a-z0-9-]+\.cloudflareaccess\.com", args.access_team_domain):
    parser.error("Use the Cloudflare Access team hostname without https://.")
if not re.fullmatch(r"[a-fA-F0-9]{64}", args.access_aud):
    parser.error("Use the Cloudflare Access application audience.")

with ZipFile(args.setup_zip) as z:
    runtime = PREFIX + "public/_pipeline/"
    manifest_bytes = z.read(runtime + "manifest.json")
    names = json.loads(manifest_bytes)
    if not 2 <= len(names) <= 40:
        raise ValueError("Invalid Studio runtime manifest")
    for index, entry in enumerate(names):
        name = "launch.py" if index == 0 else f"runtime.part{index - 1:02d}"
        member = z.getinfo(runtime + name)
        if entry["name"] != name or not 0 < member.file_size == entry["bytes"] <= 15_000_000:
            raise ValueError(f"Invalid Studio runtime member {name}")
        if hashlib.sha256(z.read(member)).hexdigest() != entry["sha256"]:
            raise ValueError(f"Runtime integrity check failed for {name}")
    original = z.read(PREFIX + "worker/artwork-prompt.txt")
    worker_src = (ROOT / "production-studio/worker/openai.ts").read_text()
    if hashlib.sha256(original).hexdigest() not in worker_src:
        raise ValueError("The Setup ZIP does not contain the approved artwork prompt")
    prompt = base64.b64encode(gzip.compress(original, mtime=0))
    if len(prompt) > 5120:
        raise ValueError("The compressed Studio prompt exceeds the Worker's secret size limit")

    DEST.mkdir(parents=True, exist_ok=True)
    for previous in DEST.glob("runtime.part*"):
        previous.unlink()
    for entry in names:
        name = entry["name"]
        (DEST / name).write_bytes(z.read(runtime + name))
    (DEST / "manifest.json").write_bytes(manifest_bytes)
    secret = DEST / "approved-prompt.gz.b64"
    secret.write_bytes(prompt)
    secret.chmod(0o600)

config = json.loads((ROOT / "wrangler.jsonc").read_text())
config["d1_databases"] = [{
    "binding": "DB", "database_name": "my-jersey-jobs", "database_id": args.database_id,
    "migrations_dir": "production-studio/migrations",
}]
config["r2_buckets"] = [{"binding": "BUCKET", "bucket_name": args.bucket}]
config["workflows"] = [{"binding": "PRODUCTION", "name": "my-jersey-production", "class_name": "JerseyProduction"}]
config["vars"] = {"CF_ACCESS_TEAM_DOMAIN": args.access_team_domain, "CF_ACCESS_AUD": args.access_aud}
(ROOT / "wrangler.studio.jsonc").write_text(json.dumps(config, indent=2) + "\n")
print("Prepared the Studio runtime, secret input and account configuration locally.")
