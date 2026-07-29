#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""build_smoke_severe.py -- generator for the Scenario-E severe smoke series.

================================ READ THIS FIRST ==============================
THE OUTPUT OF THIS SCRIPT IS A CONSTRUCTED COUNTERFACTUAL. IT IS NOT MEASURED
DATA.

  * It is a LABELED, DETERMINISTIC TRANSFORM of the observed EPA AQS hourly
    PM2.5 record for the Portland metro, September 2020 (parameter 88502).
    Every value in it is an observed value multiplied by a constant, and every
    hour in it is either an observed hour or a verbatim repeat of an observed
    whole day. Nothing is simulated, interpolated, smoothed, or sampled.
  * It is NOT a measurement. No monitor ever recorded these concentrations at
    these times. It must never be presented, plotted, or cited as observed air
    quality, and it must never be pooled with the observed series.
  * It is NOT Los Angeles data and NOT Palisades data. The geography, the
    monitors, the monitor coordinates, and the diurnal structure are all
    Portland's. The "Palisades-equivalent" framing used elsewhere in this
    project is a SEVERITY ANALOGY ONLY -- a statement about how bad the air
    gets and for how long, not a claim about a particular fire, a particular
    city, or a particular plume.
  * Its purpose is a stress test: it answers "what would this shelter system do
    under an episode markedly worse and markedly longer than the one we
    actually observed?", which is a question about the model, not about 2020.

The transform is fully described by the CLI arguments recorded in the sidecar
provenance JSON written next to the CSV, and re-running this script with those
arguments reproduces the output byte for byte.
===============================================================================

WHY THE BANNER ABOVE IS NOT INSIDE THE CSV
    geography.data.CsvLoader reads line 1 of the file as the header row and has
    no comment syntax, so a '#' banner inside the CSV would either become the
    header or become a junk data row. The requirement that
    geography.env.SmokeField parse the output with ZERO code changes therefore
    forbids in-band comments. The banner instead lives (a) in this docstring,
    (b) in the sidecar '<output>.provenance.json', and (c) in the output
    filename itself. The Qualifier column is deliberately NOT used to carry the
    label: it holds real AQS qualifier flags ('IT') on 1576 observed rows.

THE TRANSFORM
    1. SCALE. Every 'Sample Measurement' is multiplied by --scale (default
       1.75) using exact decimal arithmetic and re-rounded to the source file's
       one-decimal convention (ROUND_HALF_UP, trailing '.0' dropped, as AQS
       does). Applied to every row of every county so the file stays internally
       consistent for any county SmokeField might be pointed at.

    2. STRETCH. The main episode is located on the OBSERVED county-mean series
       exactly as SmokeField would build it, then lengthened by --stretch
       (default 1.5x) by REPEATING WHOLE LOCAL CALENDAR DAYS of the plateau.

       Detection runs on the observed series, before scaling, on purpose: it
       makes the episode window IDENTICAL across the registered --scale sweep
       (1.5 / 1.75 / 2.0), so the sweep varies severity alone and never
       silently varies which hours are being stretched. Applying the fixed
       55.5 ug/m3 line to a scaled series would instead move the window --
       observed hour 15 (43.2) and the observed decay hours (41.8, 46.7) all
       cross 55.5 once multiplied by 1.75, which would lengthen the "episode"
       for reasons that have nothing to do with the episode. The same hours in
       the output are at/above threshold x scale, and the checks below verify
       exactly that correspondence.

       The plateau
       is the contiguous run of whole days lying entirely inside the episode
       whose mean concentration is highest; its copy is inserted immediately
       after itself, and every later day slides forward by the same number of
       days so the hour axis stays contiguous. Repeating whole days (rather
       than hours) keeps the diurnal cycle intact and leaves exactly ONE
       artificial seam -- the junction into the copy; the junction out of the
       copy is an observed day-to-day junction.

    3. PRESERVED EXACTLY. The pre-episode structure is untouched in time: the
       minor spike and the clean hours between the two spells keep their
       observed hour indices, and the hours before the simulation anchor keep
       their observed timestamps, so the first hour of the output file is the
       same wall-clock hour as the first hour of the input.

    4. TAIL. --tail-days whole days of observed post-episode recovery air are
       kept after the day the stretched episode ends; the remainder of the
       observed record (clean background no run reaches) is dropped, which is
       what holds the series inside its ~430-460 h design length. Pass
       --tail-days -1 to keep the entire observed tail instead.

DETERMINISM
    No RNG, no clock, no environment reads. random/Date.now are banned
    project-wide in generators. The same inputs and arguments always produce
    the same bytes; the script verifies this by building twice and comparing.

USAGE
    python scripts/build_smoke_severe.py                       # defaults
    python scripts/build_smoke_severe.py --scale 1.5           # registered sweep
    python scripts/build_smoke_severe.py --scale 2.0 --out ... # registered sweep

EXIT CODE
    0 if every registered check passes, 1 otherwise (house convention, see
    scripts/verify_2026_runs.py and scripts/analyze_run.py).
"""

import argparse
import csv
import datetime as dt
import hashlib
import io
import json
import pathlib
import sys
from collections import OrderedDict
from decimal import Decimal, ROUND_HALF_UP

ROOT = pathlib.Path(__file__).resolve().parents[1]
SRC = ROOT / "Geography/data/airnow/aqs_hourly_pm25_portland_2020-09.csv"
DST = ROOT / "Geography/data/airnow/aqs_hourly_pm25_synthetic_severe_v1.csv"

# SmokeField is constructed with these in ContextCreator (SIM_START, "Multnomah").
DEFAULT_START = "2020-09-07T00:00"
DEFAULT_COUNTY = "Multnomah"

# 55.5 ug/m3 is the AQI "Unhealthy for Sensitive Groups" hourly breakpoint used
# throughout the project (evacuationThresholdUgM3 family, registry V6).
DEFAULT_THRESHOLD = "55.5"

# The observed record has two spells: a minor spike at hours 16-21 and the main
# episode. Searching at/after hour 79 skips the minor spike without hard-coding
# the episode itself; the detector still has to find it.
DEFAULT_MIN_HOUR = 79
DEFAULT_SUSTAIN = 3

# Column identities that must survive the transform untouched.
KEY_COLS = ["State Code", "County Code", "Site Num", "POC", "Parameter Code",
            "Latitude", "Longitude", "Datum", "Parameter Name",
            "Units of Measure", "MDL", "Method Type", "Method Code",
            "Method Name", "State Name", "County Name"]

DATE_FMT = "%Y-%m-%d"
TIME_FMT = "%H:%M"


class Checks:
    """PASS/FAIL registry, mirroring scripts/analyze_run.py."""

    def __init__(self):
        self.results = []

    def add(self, name, ok, detail=""):
        self.results.append({"name": name, "status": "PASS" if ok else "FAIL",
                             "detail": str(detail)})

    @property
    def failed(self):
        return [c for c in self.results if c["status"] == "FAIL"]


# --------------------------------------------------------------------------- #
# IO helpers
# --------------------------------------------------------------------------- #

def read_source(path):
    """Read the AQS CSV (UTF-8 BOM, CRLF, fully quoted) into ordered dicts."""
    with open(path, "r", encoding="utf-8-sig", newline="") as fh:
        reader = csv.DictReader(fh)
        fields = list(reader.fieldnames)
        rows = [dict(r) for r in reader]
    return fields, rows


def render_csv(fields, rows):
    """Serialise to the source file's exact dialect: BOM + CRLF + QUOTE_ALL."""
    buf = io.StringIO(newline="")
    writer = csv.writer(buf, quoting=csv.QUOTE_ALL, lineterminator="\r\n")
    writer.writerow(fields)
    for row in rows:
        writer.writerow([row[f] for f in fields])
    return b"\xef\xbb\xbf" + buf.getvalue().encode("utf-8")


def sha256_bytes(blob):
    return hashlib.sha256(blob).hexdigest()


def local_dt(row):
    return dt.datetime.strptime(row["Date Local"] + " " + row["Time Local"],
                                DATE_FMT + " " + TIME_FMT)


def gmt_dt(row):
    return dt.datetime.strptime(row["Date GMT"] + " " + row["Time GMT"],
                                DATE_FMT + " " + TIME_FMT)


# --------------------------------------------------------------------------- #
# SmokeField reimplementation (must match SmokeField.java exactly)
# --------------------------------------------------------------------------- #

def county_field(rows, county, start):
    """Rebuild the hourly field the way geography.env.SmokeField does.

    Unweighted arithmetic mean over every in-county row landing in the hour
    (all monitors, all POCs); hours with no row are None, i.e. Java's NaN;
    rows before `start` are dropped; there is no upper bound.
    """
    sums = {}
    counts = {}
    max_hour = -1
    for row in rows:
        if row["County Name"].lower() != county.lower():
            continue
        val_str = row["Sample Measurement"]
        if not val_str:
            continue
        try:
            val = float(val_str)
        except ValueError:
            continue
        hour = int((local_dt(row) - start).total_seconds() // 3600)
        if hour < 0:
            continue
        sums[hour] = sums.get(hour, 0.0) + val
        counts[hour] = counts.get(hour, 0) + 1
        max_hour = max(max_hour, hour)
    return [(sums[h] / counts[h]) if counts.get(h) else None
            for h in range(max_hour + 1)]


def series_stats(series):
    vals = [v for v in series if v is not None]
    return {
        "hours": len(series),
        "peak": max(vals) if vals else 0.0,
        "peak_hour": max(range(len(series)),
                         key=lambda h: (series[h] is not None, series[h] or 0.0)),
        "mean": (sum(vals) / len(vals)) if vals else 0.0,
        "gaps": [h for h, v in enumerate(series) if v is None],
    }


def detect_episode(series, threshold, min_hour, sustain):
    """First SUSTAINED crossing at/after `min_hour`, then the whole run.

    A sustained crossing is `sustain` consecutive hours at/above `threshold`.
    The episode runs from that hour to the end of the contiguous at/above run.
    """
    n = len(series)
    start = None
    for h in range(min_hour, n - sustain + 1):
        window = series[h:h + sustain]
        if all(v is not None and v >= threshold for v in window):
            start = h
            break
    if start is None:
        raise SystemExit(
            "no sustained crossing of %.1f ug/m3 for %d h at/after hour %d"
            % (threshold, sustain, min_hour))
    end = start
    while end + 1 < n and series[end + 1] is not None and series[end + 1] >= threshold:
        end += 1
    return start, end


# --------------------------------------------------------------------------- #
# Transform
# --------------------------------------------------------------------------- #

def scale_measurement(val_str, scale):
    """Exact decimal scale, re-rounded to the source's own number formatting.

    The source writes one decimal place and drops a trailing '.0' ('5', not
    '5.0'; '5.5' stays '5.5'). Reproducing that convention keeps the output
    indistinguishable in shape from the input for any downstream reader.
    """
    scaled = (Decimal(val_str) * scale).quantize(Decimal("0.1"), rounding=ROUND_HALF_UP)
    text = format(scaled, "f")
    if text.endswith(".0"):
        text = text[:-2]
    return text


def interior_days(all_days, start, ep_start, ep_end):
    """Local calendar days lying ENTIRELY inside the episode."""
    out = []
    for day in all_days:
        h0 = int((dt.datetime.combine(day, dt.time(0)) - start).total_seconds() // 3600)
        if h0 >= ep_start and h0 + 23 <= ep_end:
            out.append(day)
    return out


def pick_plateau(series, start, days, width):
    """Highest-mean contiguous run of `width` days; ties resolved earliest."""
    best_i, best_mean = 0, None
    for i in range(len(days) - width + 1):
        total, count = 0.0, 0
        for day in days[i:i + width]:
            h0 = int((dt.datetime.combine(day, dt.time(0)) - start).total_seconds() // 3600)
            for h in range(h0, h0 + 24):
                if series[h] is not None:
                    total += series[h]
                    count += 1
        mean = total / count if count else 0.0
        if best_mean is None or mean > best_mean:
            best_i, best_mean = i, mean
    return best_i, best_mean


def build_day_plan(all_days, plateau, add_days):
    """Output day sequence: observed days with the plateau block duplicated.

    Returns the list of SOURCE days in output order. Output position i is dated
    all_days[0] + i days, so the hour axis stays contiguous by construction.
    """
    if add_days <= 0 or not plateau:
        return list(all_days)
    # Tile the plateau if the requested stretch exceeds one plateau length.
    block = []
    while len(block) < add_days:
        block.extend(plateau)
    block = block[:add_days]
    after = all_days.index(plateau[-1]) + 1
    return list(all_days[:after]) + block + list(all_days[after:])


def emit_rows(fields, monitors, day_plan, base_day, scale, keep_through=None):
    """Materialise the output rows, monitor-major then time-ascending.

    Keeping the AQS monitor-major layout means the output diffs cleanly against
    the source. Dates are rewritten by whole-day offsets; Date GMT moves by the
    same offset, so the source's local-to-GMT relationship is carried over
    rather than re-derived from a timezone the source may not agree with.
    """
    out = []
    for _key, by_day in monitors.items():
        for pos, src_day in enumerate(day_plan):
            tgt_day = base_day + dt.timedelta(days=pos)
            if keep_through is not None and tgt_day > keep_through:
                break
            delta = dt.timedelta(days=(tgt_day - src_day).days)
            for row in by_day.get(src_day, ()):
                new = dict(row)
                new["Date Local"] = tgt_day.strftime(DATE_FMT)
                new["Date GMT"] = (gmt_dt(row) + delta).strftime(DATE_FMT)
                new["Sample Measurement"] = scale_measurement(
                    row["Sample Measurement"], scale)
                out.append(new)
    return out


def index_monitors(rows):
    """monitor key -> {local date -> [rows in file (time) order]}."""
    monitors = OrderedDict()
    for row in rows:
        key = (row["State Code"], row["County Code"], row["Site Num"], row["POC"])
        by_day = monitors.setdefault(key, OrderedDict())
        day = dt.datetime.strptime(row["Date Local"], DATE_FMT).date()
        by_day.setdefault(day, []).append(row)
    return monitors


def monitor_identity(rows):
    return sorted({tuple(row[c] for c in KEY_COLS) for row in rows})


# --------------------------------------------------------------------------- #
# Main
# --------------------------------------------------------------------------- #

def main():
    ap = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--src", default=str(SRC), help="observed AQS CSV (read-only)")
    ap.add_argument("--out", default=str(DST), help="counterfactual CSV to write")
    ap.add_argument("--scale", default="1.75",
                    help="multiplier on every Sample Measurement (sweep: 1.5/2.0)")
    ap.add_argument("--stretch", default="1.5",
                    help="target episode length as a multiple of the observed one")
    ap.add_argument("--tail-days", type=int, default=3,
                    help="whole days of observed recovery kept after the "
                         "stretched episode ends; -1 keeps the entire tail")
    ap.add_argument("--county", default=DEFAULT_COUNTY,
                    help="county whose monitors define the field")
    ap.add_argument("--start", default=DEFAULT_START,
                    help="simulation hour 0 (local), the SmokeField anchor")
    ap.add_argument("--threshold", default=DEFAULT_THRESHOLD,
                    help="ug/m3 defining 'in episode'")
    ap.add_argument("--episode-min-hour", type=int, default=DEFAULT_MIN_HOUR,
                    help="earliest hour index the episode search may start at")
    ap.add_argument("--sustain", type=int, default=DEFAULT_SUSTAIN,
                    help="consecutive hours at/above threshold to count as sustained")
    ap.add_argument("--dry-run", action="store_true",
                    help="run every check and print the summary, write nothing")
    args = ap.parse_args()

    scale = Decimal(args.scale)
    stretch = Decimal(args.stretch)
    threshold = float(args.threshold)
    start = dt.datetime.strptime(args.start, "%Y-%m-%dT%H:%M")
    src_path = pathlib.Path(args.src)
    out_path = pathlib.Path(args.out)
    ck = Checks()

    # ---- read observed (never written to) --------------------------------- #
    src_bytes = src_path.read_bytes()
    fields, src_rows = read_source(src_path)
    src_days = sorted({dt.datetime.strptime(r["Date Local"], DATE_FMT).date()
                       for r in src_rows})
    base_day = src_days[0]
    monitors = index_monitors(src_rows)

    # The writer must be byte-faithful before any transform is trustworthy:
    # re-emitting the source unchanged has to reproduce the source exactly.
    ck.add("writer round-trips the observed CSV byte-identically",
           sha256_bytes(render_csv(fields, src_rows)) == sha256_bytes(src_bytes),
           "dialect: UTF-8 BOM, CRLF, QUOTE_ALL")

    in_series = county_field(src_rows, args.county, start)
    in_stats = series_stats(in_series)

    # ---- locate the episode ----------------------------------------------- #
    ep_start, ep_end = detect_episode(in_series, threshold,
                                      args.episode_min_hour, args.sustain)
    ep_len = ep_end - ep_start + 1
    ep_t0 = start + dt.timedelta(hours=ep_start)
    ep_t1 = start + dt.timedelta(hours=ep_end)

    add_days = int((Decimal(ep_len) * (stretch - 1) / Decimal(24))
                   .quantize(Decimal("1"), rounding=ROUND_HALF_UP))
    inner = interior_days(src_days, start, ep_start, ep_end)
    width = min(add_days, len(inner)) if inner else 0
    if width > 0:
        pi, plateau_mean = pick_plateau(in_series, start, inner, width)
        plateau = inner[pi:pi + width]
    else:
        plateau, plateau_mean = [], 0.0
        add_days = 0

    day_plan = build_day_plan(src_days, plateau, add_days)

    # ---- build, then truncate the tail from the OBSERVED result ----------- #
    # The output is `scale` times the stretched observed series, so the SAME
    # physical hours are found by the SAME threshold multiplied by `scale`.
    # This is a consistency check on the transform, not a second detection
    # policy: the window that gets stretched was fixed on the observed series.
    out_threshold = threshold * float(scale)

    full_rows = emit_rows(fields, monitors, day_plan, base_day, scale)
    full_series = county_field(full_rows, args.county, start)
    out_ep_start, out_ep_end = detect_episode(full_series, out_threshold,
                                              args.episode_min_hour, args.sustain)
    if args.tail_days >= 0:
        ep_end_day = (start + dt.timedelta(hours=out_ep_end)).date()
        keep_through = ep_end_day + dt.timedelta(days=args.tail_days)
    else:
        keep_through = None
    out_rows = emit_rows(fields, monitors, day_plan, base_day, scale, keep_through)
    out_series = county_field(out_rows, args.county, start)
    out_stats = series_stats(out_series)
    out_ep_start, out_ep_end = detect_episode(out_series, out_threshold,
                                              args.episode_min_hour, args.sustain)
    out_blob = render_csv(fields, out_rows)
    out_sha = sha256_bytes(out_blob)

    # ---- determinism ------------------------------------------------------ #
    again = render_csv(fields, emit_rows(fields, monitors, day_plan, base_day,
                                         scale, keep_through))
    ck.add("deterministic: two builds are byte-identical",
           sha256_bytes(again) == out_sha, out_sha[:16])

    # ---- structural checks ------------------------------------------------ #
    ck.add("header line identical to the observed file",
           out_blob.split(b"\r\n")[0] == src_bytes.split(b"\r\n")[0],
           "%d columns" % len(fields))
    ck.add("column set and order identical",
           list(read_source_from_bytes(out_blob)[0]) == fields, len(fields))
    ck.add("monitor identity columns unchanged",
           monitor_identity(out_rows) == monitor_identity(src_rows),
           "%d monitor/site tuples" % len(monitor_identity(src_rows)))
    ck.add("county name values unchanged",
           sorted({r["County Name"] for r in out_rows})
           == sorted({r["County Name"] for r in src_rows}),
           ",".join(sorted({r["County Name"] for r in out_rows})))

    bad_fmt = [r for r in out_rows
               if len(r["Date Local"]) != 10 or len(r["Time Local"]) != 5
               or r["Date Local"][4] != "-" or r["Time Local"][2] != ":"]
    ck.add("date/time formats are yyyy-MM-dd and HH:mm", not bad_fmt,
           "%d malformed" % len(bad_fmt))

    src_off = {(gmt_dt(r) - local_dt(r)).total_seconds() / 3600 for r in src_rows}
    out_off = {(gmt_dt(r) - local_dt(r)).total_seconds() / 3600 for r in out_rows}
    ck.add("GMT-to-local offset preserved", out_off == src_off,
           "%s vs %s" % (sorted(out_off), sorted(src_off)))

    first_in = min(local_dt(r) for r in src_rows)
    first_out = min(local_dt(r) for r in out_rows)
    ck.add("file hour 0 timestamp matches the observed file",
           first_out == first_in, "%s vs %s" % (first_out, first_in))
    ck.add("simulation anchor %s is inside the series" % args.start,
           out_stats["hours"] > 0 and out_series[0] is not None,
           "hour 0 = %.1f ug/m3" % (out_series[0] or float("nan")))

    ck.add("no NaN/gap hours in the %s field" % args.county,
           not out_stats["gaps"], "%d gaps" % len(out_stats["gaps"]))

    span_hours = int((max(local_dt(r) for r in out_rows) - first_out)
                     .total_seconds() // 3600) + 1
    stamps = {local_dt(r) for r in out_rows}
    missing = [first_out + dt.timedelta(hours=h) for h in range(span_hours)
               if (first_out + dt.timedelta(hours=h)) not in stamps]
    ck.add("file hours contiguous with no gaps", not missing,
           "%d missing of %d" % (len(missing), span_hours))

    # ---- transform-fidelity checks ---------------------------------------- #
    # Rounding to 1 dp per monitor then averaging two monitors: max error 0.05.
    tol = 0.051
    pre = [h for h in range(ep_start)
           if abs((out_series[h] or 0.0) - float(scale) * (in_series[h] or 0.0)) > tol]
    ck.add("pre-episode hours preserved exactly (scaled, not moved)", not pre,
           "%d of %d hours differ" % (len(pre), ep_start))

    in_spike = contiguous_runs(in_series, threshold)[0]
    out_spike = contiguous_runs(out_series, out_threshold)[0]
    ck.add("minor spike unmoved", in_spike == out_spike,
           "hours %d-%d vs %d-%d" % (out_spike + in_spike))
    clean_in = ep_start - in_spike[1] - 1
    clean_out = out_ep_start - out_spike[1] - 1
    ck.add("clean interval between spells unchanged",
           clean_in == clean_out, "%d h vs %d h" % (clean_out, clean_in))

    out_len = out_ep_end - out_ep_start + 1
    ck.add("episode stretched by whole days", out_len == ep_len + 24 * add_days,
           "%d h = %d h + %d x 24 h (%.3fx)"
           % (out_len, ep_len, add_days, out_len / float(ep_len)))
    ck.add("episode start unmoved", out_ep_start == ep_start,
           "hour %d" % out_ep_start)
    # Every output hour must be scale x some observed hour: no interpolation,
    # no smoothing, no fabricated value anywhere in the file.
    # Built with scale_measurement itself, not round(): Python's round() is
    # half-to-even and would disagree with the writer's ROUND_HALF_UP on exact
    # .x5 products, manufacturing false mismatches.
    observed_images = {scale_measurement(v, scale)
                       for v in {r["Sample Measurement"] for r in src_rows}}
    novel = {r["Sample Measurement"] for r in out_rows} - observed_images
    ck.add("every value is scale x an observed value", not novel,
           "%d values with no observed pre-image" % len(novel))
    ck.add("peak scaled by %s" % args.scale,
           abs(out_stats["peak"] - float(scale) * in_stats["peak"]) <= tol,
           "%.2f vs %.2f" % (out_stats["peak"], float(scale) * in_stats["peak"]))

    # One artificial junction only: into the copy. The junction out of the copy
    # is an observed day-to-day junction, restored by construction.
    seams = []
    if add_days > 0:
        seam_h = int((dt.datetime.combine(plateau[-1], dt.time(0)) - start)
                     .total_seconds() // 3600) + 24
        seams.append((seam_h, out_series[seam_h - 1], out_series[seam_h]))

    # ---- write ------------------------------------------------------------ #
    prov = {
        "label": "CONSTRUCTED COUNTERFACTUAL -- NOT MEASURED DATA",
        "statement": (
            "This file is a labeled, deterministic transform of the observed "
            "EPA AQS hourly PM2.5 record for the Portland metro, September 2020 "
            "(parameter 88502). Every value is an observed value multiplied by a "
            "constant; every hour is an observed hour or a verbatim repeat of an "
            "observed whole day. It is NOT measured data: no monitor recorded "
            "these concentrations at these times, and it must never be plotted, "
            "cited, or pooled as observed air quality. It is NOT Los Angeles "
            "data and NOT Palisades data -- the geography, monitors, and diurnal "
            "structure are Portland's. Any 'Palisades-equivalent' framing is a "
            "SEVERITY ANALOGY ONLY, describing how bad and how long, not a claim "
            "about any particular fire or city."),
        "generator": "scripts/build_smoke_severe.py",
        "deterministic": "no RNG, no clock; same inputs and arguments reproduce these bytes",
        "source_file": src_path.name,
        "source_sha256": sha256_bytes(src_bytes),
        "output_sha256": out_sha,
        "parameters": {
            "scale": str(scale), "stretch": str(stretch),
            "tail_days": args.tail_days, "county": args.county,
            "start": args.start, "threshold": args.threshold,
            "episode_min_hour": args.episode_min_hour, "sustain": args.sustain,
        },
        "observed_episode": {
            "hour_start": ep_start, "hour_end": ep_end, "hours": ep_len,
            "local_start": ep_t0.isoformat(), "local_end": ep_t1.isoformat(),
        },
        "counterfactual_episode": {
            "hour_start": out_ep_start, "hour_end": out_ep_end, "hours": out_len,
            "local_start": (start + dt.timedelta(hours=out_ep_start)).isoformat(),
            "local_end": (start + dt.timedelta(hours=out_ep_end)).isoformat(),
        },
        "plateau_days_repeated": [d.isoformat() for d in plateau],
        "days_added": add_days,
        "observed_series": {"hours": in_stats["hours"],
                            "peak_ugm3": round(in_stats["peak"], 4),
                            "mean_ugm3": round(in_stats["mean"], 4)},
        "counterfactual_series": {"hours": out_stats["hours"],
                                  "peak_ugm3": round(out_stats["peak"], 4),
                                  "mean_ugm3": round(out_stats["mean"], 4)},
        "rows": len(out_rows),
        "checks": ck.results,
    }
    prov_path = out_path.with_suffix(".provenance.json")

    if not args.dry_run:
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_bytes(out_blob)
        prov_path.write_text(json.dumps(prov, indent=2) + "\n", encoding="utf-8")

    # ---- summary ----------------------------------------------------------- #
    n_fail = len(ck.failed)
    print("=" * 78)
    print("CONSTRUCTED COUNTERFACTUAL -- NOT MEASURED DATA, NOT LOS ANGELES DATA.")
    print("Labeled deterministic transform of observed Portland AQS Sept 2020")
    print("(EPA parameter 88502). 'Palisades-equivalent' is a severity analogy only.")
    print("=" * 78)
    print("source        : %s" % src_path)
    print("output        : %s%s" % (out_path, "  (DRY RUN, not written)"
                                    if args.dry_run else ""))
    print("provenance    : %s" % prov_path)
    print()
    print("transform     : scale x%s, stretch x%s (whole-day repeats), tail %s"
          % (scale, stretch, "%d d" % args.tail_days if args.tail_days >= 0 else "kept in full"))
    print("anchor        : %s local = field hour 0, county %s"
          % (args.start, args.county))
    print()
    print("episode detected (observed, >=%.1f ug/m3 sustained %d h at/after hour %d):"
          % (threshold, args.sustain, args.episode_min_hour))
    print("    hours %d..%d  = %s .. %s  (%d h)"
          % (ep_start, ep_end, ep_t0, ep_t1, ep_len))
    print("    whole days inside episode : %s .. %s (%d)"
          % (inner[0], inner[-1], len(inner)) if inner else "    (none)")
    print("    plateau repeated          : %s (%d d, mean %.1f ug/m3 observed)"
          % (", ".join(str(d) for d in plateau) or "none", add_days, plateau_mean))
    print("    episode after stretch     : hours %d..%d = %s .. %s (%d h, %.3fx)"
          % (out_ep_start, out_ep_end,
             start + dt.timedelta(hours=out_ep_start),
             start + dt.timedelta(hours=out_ep_end), out_len,
             out_len / float(ep_len)))
    for seam_h, before, after in seams:
        print("    artificial seam           : hour %d, %.1f -> %.1f ug/m3"
              % (seam_h, before, after))
    print()
    print("series (%s field as SmokeField builds it, hour 0 = %s):"
          % (args.county, args.start))
    print("    input  : %4d h   peak %8.2f ug/m3 (hour %d)   mean %7.2f ug/m3"
          % (in_stats["hours"], in_stats["peak"], in_stats["peak_hour"],
             in_stats["mean"]))
    print("    output : %4d h   peak %8.2f ug/m3 (hour %d)   mean %7.2f ug/m3"
          % (out_stats["hours"], out_stats["peak"], out_stats["peak_hour"],
             out_stats["mean"]))
    print("    gaps   : input %d, output %d" % (len(in_stats["gaps"]),
                                                len(out_stats["gaps"])))
    # The mean moves for three separate reasons; spell them out so the jump is
    # not mistaken for a defect.
    kept = out_stats["hours"] - 24 * add_days
    kept_vals = [v for v in in_series[:kept] if v is not None]
    kept_mean = sum(kept_vals) / len(kept_vals) if kept_vals else 0.0
    print("    mean decomposition: observed %.2f over all %d h -> %.2f over the "
          "%d h retained\n"
          "                       -> %.2f scaled x%s -> %.2f with %d repeated "
          "plateau days"
          % (in_stats["mean"], in_stats["hours"], kept_mean, kept,
             kept_mean * float(scale), scale, out_stats["mean"], add_days))
    print("    in-episode line: %.1f ug/m3 observed = %.1f ug/m3 in the "
          "counterfactual" % (threshold, out_threshold))
    print()
    print("file          : %d data rows (input %d), local %s .. %s"
          % (len(out_rows), len(src_rows), first_out,
             max(local_dt(r) for r in out_rows)))
    print("hour 0        : %s (input %s)" % (first_out, first_in))
    print("SHA-256       : %s" % out_sha)
    print()
    for c in ck.results:
        print("  %-4s %-55s %s" % (c["status"], c["name"], c["detail"]))
    print("verification  : %d/%d passed" % (len(ck.results) - n_fail, len(ck.results)))
    sys.exit(1 if n_fail else 0)


def read_source_from_bytes(blob):
    text = blob.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(text, newline=""))
    fields = list(reader.fieldnames)
    return fields, [dict(r) for r in reader]


def contiguous_runs(series, threshold):
    """Maximal runs of hours at/above threshold, as (start, end) pairs."""
    runs, start = [], None
    for h, v in enumerate(series):
        above = v is not None and v >= threshold
        if above and start is None:
            start = h
        if not above and start is not None:
            runs.append((start, h - 1))
            start = None
    if start is not None:
        runs.append((start, len(series) - 1))
    return runs


if __name__ == "__main__":
    main()
