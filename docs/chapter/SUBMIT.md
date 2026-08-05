# How to submit the chapter

Everything needed is in this folder. Read §0 first. **As of 2026-08-04 most of
it is resolved** — only one item still needs anything from you.

---

## 0. Status of the pre-upload items

### 0.1 Author line — RESOLVED (author-confirmed 2026-08-04)

`Capacity_Is_Not_Access.tex` now reads:

```latex
\institute{Fatima Asghar \at Harrisburg University of Science and Technology, Harrisburg, PA, USA, \email{fxa28196@hawkmail.hacc.edu}}
```

Both values are **author-confirmed** (2026-08-04). Two corrections to earlier
guesses in this file, so neither gets reintroduced:

- The institution is **Harrisburg University of Science and Technology**. My
  earlier "Harrisburg Area Community College" reading — inferred from the
  `hacc.edu` domain — was wrong and is retracted.
- `fxa28196@hawkmail.hacc.edu` is **correct and current**. It is the author's
  active research contact address, and it stays. Do not infer the affiliation
  from it: the domain and the institution are simply not the same thing here.

The REU host institution is **Portland State University** and appears in the
acknowledgements, which is the correct place for it — the `\institute` line
carries the author's *home* institution, matching the pattern in Van Pelt's
chapter.

`CITATION.cff` and `.zenodo.json` already carry the same affiliation. Nothing to
change there.

### 0.2 Repository visibility — RESOLVED

`https://github.com/fxa28196/REU` is **public** (verified 2026-07-31). The
code-availability URL in the chapter resolves, and the checklist's public-repo
requirement is satisfied. Nothing to do.

*Historical note, superseded — kept only so the reasoning is on record:*

The chapter's code-availability note points at
`https://github.com/fxa28196/REU`, and the checklist asks for a **public**
repository. Right now it is private, so that URL will 404 for a reader.

For the **26 July draft** this is fine — nobody is checking links yet.
Before the **23 August camera-ready**, do one of:

- make the repo public (Settings → General → Danger Zone → Change visibility), or
- push a cleaned public mirror and change the URL in the chapter.

If you decide to keep it private, delete the sentence and say instead that code
is available on request — but do not leave a dead URL in a published chapter.

### 0.3 Licence — done. Zenodo DOI — DROPPED by author decision (2026-08-04)

| Checklist item | Status |
|---|---|
| MIT `LICENSE` file present | **Done.** `LICENSE` at the repo root. |
| Citation metadata | **Done.** `CITATION.cff` gives GitHub a "Cite this repository" button. |
| Zenodo DOI minted and cited | **Dropped.** The author decided on 2026-08-04 not to mint one. `.zenodo.json` stays in the tree, unused and harmless, in case that changes. `doi:` in `CITATION.cff` stays commented out — never placeholder it. |

**Street data — RESOLVED (2026-08-04).** Oregon Metro gave the author the
go-ahead to use the RLIS street centerlines. The chapter now credits Metro in
the acknowledgements and in §3.1, as ordinary use of a public regional data
resource. This is a **verbal/author-attested clearance, not a written licence
grant** — so the `LICENSE` carve-out stays exactly as it is and the chapter
claims permission to *use and credit*, never a relicensing right. Do not
upgrade that wording.

**IRB — RESOLVED (2026-08-04).** The author's professor determined that no IRB
review is required: the work uses published municipal open data and simulated
agents, with no human subjects and no interaction with any individual. Recorded
in `websim/docs/DR-WP1-irb-determination.md`.

*The Zenodo steps below are retained only in case the decision is reversed.*

**About the licence.** It is MIT, but *scoped* — because a blanket MIT grant
over this repository would have been false. The repo contains Springer's
`svmult.cls`, 41 Repast dependency licences, EPA and City of Portland data, and
the RLIS street file whose redistribution terms could not be recovered. The
`LICENSE` file grants MIT over the work you actually authored (the model, the
scripts, the docs, the registries, the shelter inventory you compiled) and then
lists, by path, everything it does not cover and why. Read the second half of
that file once, so you can answer for it if a reviewer asks.

**Minting the DOI.** Do this *after* making the repo public (§0.2):

1. Go to <https://zenodo.org> and sign in **with GitHub** (top right → Log in →
   GitHub). This authorises Zenodo to see your repositories.
2. Go to <https://zenodo.org/account/settings/github/>. Find `fxa28196/REU` in
   the list and flip its toggle **On**. Zenodo now watches for releases.
   *If the repo is not listed, press Sync and reload — a private repo will not
   appear at all, which is why §0.2 comes first.*
3. On GitHub: **Releases → Create a new release**. Tag `v1.0.0`, title it
   `v1.0.0 — proceedings chapter`, and publish.
4. Wait a minute or two, then reload the Zenodo GitHub page. The release appears
   with a DOI badge like `10.5281/zenodo.1234567`.
5. **Use the "Concept DOI", not the version DOI.** Zenodo issues two: one that
   always resolves to the newest version, and one pinned to `v1.0.0`. Cite the
   concept DOI so the reference stays alive if you release again.
6. Put it in three places:
   - `CITATION.cff` — uncomment the `doi:` line and fill it in.
   - `Capacity_Is_Not_Access.tex` — add it to the code-availability paragraph,
     e.g. *"...under the MIT License, archived at
     \\url{https://doi.org/10.5281/zenodo.XXXXXXX}."*
   - A GitHub README, if you add one — Zenodo gives you a badge to paste.

Nothing here blocks the July draft. Do it before 23 August.

### 0.4 ONE bold placeholder still prints in the PDF

`\authornote` deliberately prints its argument **in bold** so a placeholder
cannot ship unnoticed.

| Placeholder | Status |
|---|---|
| NSF award number, acknowledgements | **Filled — 2244551.** |
| Full Pathways Study 2026 citation, Table 2 | **STILL OPEN.** Under verification. This is the last one. |

Once the Pathways citation lands, switch `\authornote` to the blank definition
commented at the top of the file. If it is still unknown at upload time, leave
the bold flag visible — do not silently hide an unfilled placeholder.

### 0.5 ORCA acknowledgement — a decision you must make before camera-ready

The acknowledgements carry a second NSF award, **2346732** (the ORCA GPU
accelerator), through a one-line macro `\orcaack` defined in the preamble.

**As of 2026-08-04 ORCA has not been used for any result in this paper.**
Acknowledging a computing resource you did not use would be inaccurate, so this
is a genuine either/or, not a formality:

- **ORCA gets used before 2026-08-23** → leave the preamble as it is.
- **ORCA does not get used** → comment out the active `\orcaack` line and
  uncomment the empty one directly below it. One line, nothing else changes.

Search the `.tex` for `ORCA ACKNOWLEDGEMENT` — the block is self-documenting.
The Markdown twin carries the same sentence tagged `[ORCA-TOGGLE:`.

---

## 1. What to upload to Overleaf

Seven files, about **490 KB** total.

```
Capacity_Is_Not_Access.tex   the chapter (bibliography is inline — see below)
svmult.cls            the official class from docs/publication/template/OFFICIAL-template/
figures/              <- keep this as a SUBFOLDER
  fig1_pm25.pdf         69 KB
  fig2_speeds.pdf       58 KB
  fig3_access.pdf       64 KB
  fig4_map.pdf         118 KB
  fig5_race.pdf         38 KB
```

**Do not upload `references.bib`.** The chapter carries its bibliography
inline (a `thebibliography` environment with 25 entries; every `\cite` key
resolves in-file). `references.bib` in this folder is a courtesy export for
reference managers, not a build input — the build never reads it, and its
keys are not guaranteed to track the inline list.

**Keep `figures/` as a subfolder.** `\graphicspath{{figures/}}` in the preamble
finds them there, and none of the `\includegraphics` calls carries a file
extension, so LaTeX picks the format itself — you never touch a figure path.

### Why PDF and not EPS

The proceedings guidelines say "EPS wherever possible". PDF is equally vector
and is pdfLaTeX's *native* format. EPS is not: on Overleaf, pdfLaTeX shells out
to `epstopdf` and reconverts **every EPS on every compile**, which is what blew
the free-plan timeout on the earlier version of this chapter. Working in PDF
makes a full build take a couple of seconds.

If the editors insist on EPS for the camera-ready zip, change the `.pdf`
extension in `save()` inside `scripts/make_chapter_figures.py` to `.eps`,
re-run it, and swap the files. Compile in PDF while you work; supply EPS only
if asked.

---

## 2. Upload and compile

1. Go to <https://www.overleaf.com> → **New Project** → **Upload Project**.
2. Zip the three items above (`Capacity_Is_Not_Access.tex`, `svmult.cls`, and
   the `figures` folder) and upload the zip. Do **not** zip the enclosing
   `chapter` folder — Overleaf should see `Capacity_Is_Not_Access.tex` at the
   top level.
3. **Menu → Compiler → pdfLaTeX.** (Not XeLaTeX or LuaLaTeX; the chapter's
   font packages — `mathptmx`, `helvet`, `courier` — are classic pdfLaTeX
   Times/Helvetica/Courier packages.)
4. **Menu → Main document → `Capacity_Is_Not_Access.tex`.**
5. Press **Recompile**.

There is **no BibTeX step** — the bibliography is inline. Cross-references
still need a second pass: if anything renders as `[?]` or `??`, press
Recompile once more.

The manual sequence, if you ever compile locally, is:

```
pdflatex Capacity_Is_Not_Access
pdflatex Capacity_Is_Not_Access
```

### Expected result

**Zero errors and zero undefined references or citations.** Overleaf will show
some `Overfull \hbox` warnings — those are line-breaking niggles, not errors,
and are normal for this class with long URLs and wide tables.

### If it misbehaves

| Symptom | Fix |
|---|---|
| Citations or cross-references render as `[?]` / `??` | Recompile once more; the second pass reads the `.aux` from pass 1. There is no BibTeX run to trigger. |
| `File 'fig1_pm25' not found` | `figures/` was flattened during zipping. Re-upload with the folder intact. |
| `Undefined control sequence \svhline` | `svmult.cls` did not upload, or the compiler is using a different class. |
| Compile times out | Menu → Clear cached files, turn **off** Auto-compile, recompile once by hand. |
| Fonts look wrong | Compiler is not pdfLaTeX. Change it in Menu → Compiler. |

---

## 3. Submit the draft (due 26 July)

The July deadline wants **PDF only**.

1. In Overleaf: **Download → PDF**.
2. Rename it something identifiable — `Asghar_CapacityIsNotAccess_draft.pdf`.
3. Upload to the draft-chapters Drive folder:
   <https://drive.google.com/drive/folders/1QWSUbYspKX1rnSWQcF6s5j6tZoWvtqHO>

That is the whole July submission.

---

## 4. Camera-ready (due 23 August)

The August deadline wants **PDF *and* a zip of the LaTeX sources**.

1. Apply the editorial feedback you get back on 9 August.
2. Handle §0.2 (public repo) and §0.3 (Zenodo DOI, LICENSE).
3. In Overleaf: **Download → Source** — that gives you the zip directly.
4. Also **Download → PDF**.
5. Upload both to the final-chapters folder:
   <https://drive.google.com/drive/folders/1dRSXjArz_LJ98PsMZqRWI6t7-fyY8EvW>

---

## 5. Before you press submit — the human checks

Re-run the mechanical checks after tonight's science pass, since the text
changed: the abstract fits the 200-word cap, all **25 inline citations**
resolve, all **five figures** and **five tables** are captioned and
referenced, every environment balances, every number matches the
corrected-graph CSVs under `docs/final/results-2026/`, and
`python scripts/lint_claims.py` exits 0.

What a script cannot check, and the checklist asks for:

- [ ] **Read the whole chapter aloud.** It catches what silent reading misses.
- [ ] **Someone who isn't you reads it.**
- [ ] Spell-check with a technical dictionary — proper nouns to watch:
      *Multnomah*, *Bohannon*, *Buekers*, *Zellmer*, *Boyce*, *Repast Simphony*,
      *Christof Teuscher*.
- [ ] Confirm the author line (§0.1) and the two placeholders (§0.4).
- [ ] Look at the compiled figures at print size. They were built to stay legible
      in greyscale, but check them on the page rather than on screen.

---

## 6. What is in the chapter, so you can defend it

Two findings, and both are yours to explain at the symposium:

1. **Scenario B leaves 578 spaces empty while 550 people are refused and 28
   cannot reach any shelter on foot** (seed 42). B holds capacity equal to
   population, so empty beds ≡ refused + unreachable is an identity forced by
   the design, not a discovery — the point is what it isolates: adding
   capacity without touching geography leaves the geography problem intact,
   which is why scenarios C and D exist.
2. **Capacity expansion alone widens the equity gap** between residents who
   walk easily and those who do not: B's mobility gap is 23.7 percentage
   points at seed 42 (24.5 / 22.4 at seeds 43/44). Splitting the same total
   across ten additional sites brings it to roughly 12.5–13.8, and scenario
   D's 10% triage reserve closes it outright — 23.7 pp → −0.5 pp at seed 42 —
   at identical aggregate access (6,264 sheltered, 550 refused with and
   without the reserve) and zero capital cost. An evaluation that tracked only
   aggregate access would have scored B as a success.

Five things reviewers may push on, and the honest answer to each:

| Likely question | The answer that is already in the chapter |
|---|---|
| "Does this reproduce 2020?" | No, and the Calibration subsection says so: the model over-predicts the one observed occupancy record by 1.5–15.6× — a censored bracket, because the record itself is censored; 1.52× is the uncensored lower edge — and the final figure awaits the U-12 recalibration. The over-prediction is attributed to assuming universal shelter awareness against local evidence that 65% had never heard of the shelters. Every access figure is an **upper bound**. |
| "Where did the 1.45 and 1.80 risk weights go?" | The "Exposure, dose and health risk" subsection. One was attributed to a paper whose cohort is entirely 65+, so it cannot yield an age contrast; the other to a paper that does not exist. And multiplying exposure by a relative risk is a category error regardless. Weights are 1.0 and reporting is stratified instead. |
| "Wouldn't ten *random* extra sites do just as well?" | On headcount, yes — and the chapter says so. The POOL control draws ten sites at random from the same 498-node candidate pool and reproduces C's sheltered count run-for-run (6,570 / 6,565 / 6,566 at seeds 42–44 — an exact null). The gain over B is dispersion — more doors — not optimised placement; placement credit survives only in the shorter walk (nine-seed mean walk ≈ 8.0 km in B vs ≈ 5.6 km in C), and that is conditional on perfect information. |
| "Isn't this all an artifact of capacity exactly matching demand?" | Largely yes, and the chapter reports it as two registered prediction misses (P-3c, P-3d): the bed sweep shows access reaches 99.5% already at 1.2× demand, and the mobility gap vanishes at any surplus. The equity gap and dispersion's headcount value are knife-edge phenomena of capacity == demand — and D's triage reserve is the zero-cost fix exactly at that knife edge. |
| "Are the ten new sites real?" | No. They are street-network nodes chosen by an algorithm, stated explicitly in "Concerns and Next Steps". No zoning, cost, or staffing analysis stands behind them. |

The supporting material, if anyone wants depth:

- `docs/final/TECHNICAL_REFERENCE.md` — the complete breakdown: every equation,
  every source, every code snippet, every archived run.
- `docs/final/presentation/index.html` — the polished walkthrough.
- `docs/final/readable/RESULTS_EXPLAINED.md` — the plain-language version.

---

## 7. Rebuilding the figures

If you change a number or want a different cut:

```powershell
python scripts\make_chapter_figures.py
```

It reads the archived corrected-graph runs and rewrites all **five** PDFs into
`docs/chapter/figures/`. Takes about a minute. Re-upload whichever changed.
