#!/usr/bin/env python3
"""Propagate the RECORDED pet-intake policy into E-layer shelter files.

WHY THIS EXISTS
---------------
Assumption A-29 originally justified refusing pets everywhere on the grounds
that "the record is SILENT" about pet intake. That is true of the September
2020 clean-air shelters. It is NOT true of the present-day 2026 network the
Phase-E arms actually run: the upstream inventory
`data/shelters/shelters_multnomah_2026.csv` carries an explicit
`pets_allowed` column for all 48 rows, and 4 of them record 1 (admit) --
Laurelwood Center, River District Navigation Center, Walnut Park Shelter and
Willamette Center, 422 beds between them.

The derived per-arm files dropped that column, so the model was asserting
refusal at 422 beds whose own source records admission, and pet owners came
out at exactly 0% sheltered. That is a documented-value-vs-used-value
mismatch, the defect class this project's audits exist to catch.

WHAT IT DOES
------------
Reads an archived per-arm shelter CSV, joins the upstream inventory on
normalised facility name, and writes a NEW `*_elayer.csv` carrying one extra
column, `pet_intake`, with values:

    admit    the inventory records pets_allowed = 1
    refuse   the inventory records pets_allowed = 0
    (blank)  no inventory row -- policy genuinely unknown, so the run-wide
             petPolicyDefault parameter applies (the honest A-29 fallback)

Blank is the correct value for arm C's ten NEW_optimized_site_* entries:
those are street-network coordinates, not venues, so they have no intake
policy to record and inventing one would be a fabrication.

WHY A NEW FILE, NOT AN EDIT
---------------------------
The archived per-arm shelter CSVs are checksummed into `data_version_tag`.
Editing one would change the tag on every future re-run and sever
comparability with the archived three-arm record. New files, selected by the
`shelterPolicyVariant` parameter (default 0 = archived file untouched), keep
that chain intact.

Usage:
    python scripts/build_shelter_policy_elayer.py            # all three arms
    python scripts/build_shelter_policy_elayer.py --check    # report only
"""
import argparse
import csv
import hashlib
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SHELTER_DIR = os.path.join(HERE, "..", "Geography", "data", "shelters")

INVENTORY = "shelters_multnomah_2026.csv"

# The three per-arm files the Phase-E arms read (arm D reads arm B's file).
ARM_FILES = [
    "shelters_2026_current_placement.csv",        # arm A (scenarioCode 0)
    "shelters_2026_expanded_capacity.csv",        # arm B (1) and arm D (7)
    "shelters_2026_expanded_plus_new_sites.csv",  # arm C (2)
]

TRUE_VALUES = {"1", "yes", "y", "true", "allowed", "admit"}


def norm(name):
    """Normalised join key: case-folded, alphanumerics only.

    The per-arm files carry a truncated underscore id plus a full `name`;
    the inventory carries only `name`. Joining on the normalised name avoids
    depending on how the id was truncated.
    """
    return re.sub(r"[^a-z0-9]", "", (name or "").lower())


def sha256(path):
    with open(path, "rb") as fh:
        return hashlib.sha256(fh.read()).hexdigest()


def load_inventory(path):
    """{normalised name: 'admit'|'refuse'} from the recorded pets_allowed."""
    policy = {}
    with open(path, newline="", encoding="utf-8-sig") as fh:
        for row in csv.DictReader(fh):
            if "pets_allowed" not in row:
                raise SystemExit("inventory %s has no pets_allowed column" % path)
            key = norm(row.get("name"))
            if not key:
                continue
            raw = (row.get("pets_allowed") or "").strip().lower()
            policy[key] = "admit" if raw in TRUE_VALUES else "refuse"
    return policy


def build(arm_file, policy, check_only):
    src = os.path.join(SHELTER_DIR, arm_file)
    dest = os.path.join(SHELTER_DIR, arm_file[:-4] + "_elayer.csv")
    with open(src, newline="", encoding="utf-8-sig") as fh:
        reader = csv.DictReader(fh)
        fieldnames = list(reader.fieldnames)
        rows = list(reader)

    if "pet_intake" in fieldnames:
        raise SystemExit("%s already carries pet_intake" % arm_file)
    out_fields = fieldnames + ["pet_intake"]

    admit = refuse = unknown = 0
    admit_beds = total_beds = 0
    unknown_names = []
    for row in rows:
        val = policy.get(norm(row.get("name")))
        row["pet_intake"] = val or ""
        try:
            cap = int(float(row.get("capacity") or 0))
        except ValueError:
            cap = 0
        total_beds += cap
        if val == "admit":
            admit += 1
            admit_beds += cap
        elif val == "refuse":
            refuse += 1
        else:
            unknown += 1
            unknown_names.append(row.get("shelter_id") or row.get("name"))

    print("  %-46s sites: admit=%d refuse=%d unknown=%d | beds: admit=%d of %d (%.1f%%)"
          % (arm_file, admit, refuse, unknown, admit_beds, total_beds,
             100.0 * admit_beds / max(1, total_beds)))
    if unknown_names:
        shown = ", ".join(unknown_names[:4])
        more = "" if len(unknown_names) <= 4 else " (+%d more)" % (len(unknown_names) - 4)
        print("      unknown -> petPolicyDefault applies: %s%s" % (shown, more))

    if check_only:
        return None

    # newline="" + \n keeps one dialect; the model reads with CsvLoader, which
    # strips the BOM and tolerates either line ending.
    with open(dest, "w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=out_fields)
        writer.writeheader()
        writer.writerows(rows)

    # The source must be untouched: its checksum feeds data_version_tag.
    print("      wrote %s  sha256=%s" % (os.path.basename(dest), sha256(dest)[:16]))
    print("      source unchanged sha256=%s" % sha256(src)[:16])
    return dest


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--check", action="store_true",
                    help="report the join without writing anything")
    args = ap.parse_args()

    inv_path = os.path.join(SHELTER_DIR, INVENTORY)
    policy = load_inventory(inv_path)
    n_admit = sum(1 for v in policy.values() if v == "admit")
    print("inventory %s: %d facilities, %d record pets_allowed=admit"
          % (INVENTORY, len(policy), n_admit))
    print("  admit-recording facilities: %s"
          % ", ".join(sorted(k for k, v in policy.items() if v == "admit")))
    print()
    for arm_file in ARM_FILES:
        build(arm_file, policy, args.check)
    return 0


if __name__ == "__main__":
    sys.exit(main())
