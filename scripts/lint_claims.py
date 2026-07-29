#!/usr/bin/env python
"""lint_claims.py — claim linter for the wildfire-shelter ABM deliverables.

Round-5 Phase A, task A4.

Loads the claim registry (docs/claims.yaml), scans the registered deliverables
for every pattern whose status is not ``live``, and prints one line per hit::

    <file>:<line>:<claim-id> [<status>] matched: '<text>'

Exit status is 1 if any hit is found, 0 otherwise.

Usage:
    python scripts/lint_claims.py
    python scripts/lint_claims.py --report docs/critique-response/report.md
    python scripts/lint_claims.py --registry docs/claims.yaml --root .

The registry format (statuses, per-entry fields, precision rationale) is
documented at the top of docs/claims.yaml.
"""

from __future__ import annotations

import argparse
import datetime as _dt
import glob as _glob
import json
import re
import sys
from pathlib import Path

try:
    import yaml  # PyYAML 6.x — available in this environment
except ImportError:  # pragma: no cover — JSON registry still usable
    yaml = None

REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_REGISTRY = REPO_ROOT / "docs" / "claims.yaml"

# Fallback only — the authoritative list lives in docs/claims.yaml.
DEFAULT_DELIVERABLES = [
    "docs/chapter/*.tex",
    "docs/chapter/SUBMIT.md",
    "README.md",
    "docs/final/presentation/index.html",
    "docs/final/PRESENTER_SCRIPT.md",
    "docs/final/PRESENTER_SCRIPT_REFORMAT.html",
    "docs/final/TECHNICAL_REFERENCE.md",
    "docs/final/PRESENT_DAY_THREE_ARM_RESULTS.md",
    "docs/final/README_RESULTS.md",
    "docs/final/readable/RESULTS_EXPLAINED.md",
]

VALID_STATUSES = {"live", "corrected", "corrected-pending", "refuted", "retired"}


def load_registry(path: Path) -> dict:
    text = path.read_text(encoding="utf-8")
    if path.suffix in (".yaml", ".yml"):
        if yaml is None:
            sys.exit(f"error: PyYAML unavailable but registry is YAML: {path}")
        data = yaml.safe_load(text)
    else:
        data = json.loads(text)
    if not isinstance(data, dict) or "claims" not in data:
        sys.exit(f"error: registry {path} has no top-level 'claims' list")
    for entry in data["claims"]:
        for field in ("id", "pattern", "status"):
            if field not in entry:
                sys.exit(f"error: claim entry missing '{field}': {entry!r}")
        if entry["status"] not in VALID_STATUSES:
            sys.exit(
                f"error: claim '{entry['id']}' has invalid status "
                f"'{entry['status']}' (valid: {sorted(VALID_STATUSES)})"
            )
        if entry["status"].startswith("corrected") and not entry.get("replacement"):
            sys.exit(f"error: claim '{entry['id']}' is {entry['status']} but has no replacement")
    return data


def compile_claim(entry: dict) -> re.Pattern:
    pattern = entry["pattern"] if entry.get("regex") else re.escape(entry["pattern"])
    flags = re.IGNORECASE if entry.get("case_insensitive") else 0
    try:
        return re.compile(pattern, flags)
    except re.error as exc:
        sys.exit(f"error: claim '{entry['id']}' pattern does not compile: {exc}")


def resolve_deliverables(patterns: list[str], root: Path) -> list[Path]:
    files: list[Path] = []
    for pat in patterns:
        matches = sorted(_glob.glob(str(root / pat)))
        if not matches:
            print(f"warning: deliverable pattern matched no files: {pat}", file=sys.stderr)
        files.extend(Path(m) for m in matches)
    return files


def scan(files: list[Path], claims: list[dict], root: Path) -> list[dict]:
    """Return one dict per hit: file, line, claim id, status, matched text."""
    hits: list[dict] = []
    active = [(entry, compile_claim(entry)) for entry in claims if entry["status"] != "live"]
    for fp in files:
        text = fp.read_text(encoding="utf-8", errors="replace")
        rel = fp.relative_to(root).as_posix()
        for entry, rx in active:
            for m in rx.finditer(text):
                line = text.count("\n", 0, m.start()) + 1
                matched = " ".join(m.group(0).split())  # collapse wraps for display
                if len(matched) > 90:
                    matched = matched[:87] + "..."
                hits.append(
                    {
                        "file": rel,
                        "line": line,
                        "id": entry["id"],
                        "status": entry["status"],
                        "matched": matched,
                    }
                )
    hits.sort(key=lambda h: (h["file"], h["line"], h["id"]))
    return hits


def write_report(path: Path, hits: list[dict], files: list[Path], claims: list[dict],
                 root: Path, registry_path: Path, note: str | None) -> None:
    now = _dt.date.today().isoformat()
    scanned = [f.relative_to(root).as_posix() for f in files]
    per_file: dict[str, int] = {s: 0 for s in scanned}
    per_claim: dict[str, int] = {c["id"]: 0 for c in claims if c["status"] != "live"}
    for h in hits:
        per_file[h["file"]] = per_file.get(h["file"], 0) + 1
        per_claim[h["id"]] = per_claim.get(h["id"], 0) + 1

    by_id = {c["id"]: c for c in claims}
    lines: list[str] = []
    lines.append(f"# Claim-linter report — {now}")
    lines.append("")
    lines.append(f"Registry: `{registry_path.relative_to(root).as_posix()}` — "
                 f"generated by `scripts/lint_claims.py`.")
    if note:
        lines.append("")
        lines.append(f"> {note}")
    lines.append("")
    lines.append(f"**Total: {len(hits)} hit(s) across {sum(1 for v in per_file.values() if v)} "
                 f"of {len(scanned)} scanned deliverables.** "
                 f"Exit status: {'1 (red)' if hits else '0 (green)'}.")
    lines.append("")
    lines.append("## Hits per file")
    lines.append("")
    lines.append("| Deliverable | Hits |")
    lines.append("|---|---:|")
    for s in scanned:
        lines.append(f"| `{s}` | {per_file[s]} |")
    lines.append("")
    lines.append("## Hits per claim")
    lines.append("")
    lines.append("| Claim id | Status | Hits |")
    lines.append("|---|---|---:|")
    for cid, n in sorted(per_claim.items(), key=lambda kv: (-kv[1], kv[0])):
        lines.append(f"| `{cid}` | {by_id[cid]['status']} | {n} |")
    lines.append("")
    lines.append("## Detail")
    lines.append("")
    if not hits:
        lines.append("No hits.")
    current = None
    for h in hits:
        if h["file"] != current:
            current = h["file"]
            lines.append(f"### `{current}`")
            lines.append("")
        lines.append(f"- **:{h['line']}** `{h['id']}` [{h['status']}] — matched: `{h['matched']}`")
        repl = by_id[h["id"]].get("replacement")
        if repl:
            lines.append(f"  - replacement: {' '.join(str(repl).split())}")
    lines.append("")
    lines.append("---")
    lines.append("")
    lines.append("Pattern precision rationale for every claim lives in the registry's "
                 "`note` fields; statuses are defined in the registry header.")
    lines.append("")
    path.write_text("\n".join(lines), encoding="utf-8")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--registry", type=Path, default=DEFAULT_REGISTRY,
                    help="claim registry (default: docs/claims.yaml)")
    ap.add_argument("--root", type=Path, default=REPO_ROOT,
                    help="repo root the deliverable globs are relative to")
    ap.add_argument("--report", type=Path, default=None,
                    help="write a markdown report to FILE")
    ap.add_argument("--note", type=str, default=None,
                    help="one-line note included in the report header")
    args = ap.parse_args()

    root = args.root.resolve()
    registry = load_registry(args.registry)
    deliverables = registry.get("deliverables") or DEFAULT_DELIVERABLES
    files = resolve_deliverables(deliverables, root)
    hits = scan(files, registry["claims"], root)

    for h in hits:
        print(f"{h['file']}:{h['line']}:{h['id']} [{h['status']}] matched: '{h['matched']}'")
    n_files = sum(1 for f in {h['file'] for h in hits})
    print(f"\n{len(hits)} hit(s) in {n_files} file(s); "
          f"{len(files)} deliverable file(s) scanned.", file=sys.stderr)

    if args.report:
        write_report(args.report.resolve(), hits, files, registry["claims"],
                     root, args.registry.resolve(), args.note)
        print(f"report written: {args.report}", file=sys.stderr)

    return 1 if hits else 0


if __name__ == "__main__":
    sys.exit(main())
