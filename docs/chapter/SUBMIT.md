# How to submit the chapter

Everything needed is in this folder. Read §0 first — three things need your
decision before you upload, and one of them is in the author line.

---

## 0. Do these first (they are not optional)

### 0.1 Check the author line — I inferred it

`chapter.tex` currently says:

```latex
\institute{Fatima Asghar \at Harrisburg Area Community College, Harrisburg, PA,
\email{fxa28196@hawkmail.hacc.edu}}
```

I took that email from `scripts/geocode_shelters.py`, where you set it as the
Nominatim User-Agent contact, and inferred the institution from the `hacc.edu`
domain. **I did not verify either.** Van Pelt's chapter uses his *home*
institution rather than PSU, so the pattern is right, but the specific values
are my inference from a string in your own code.

Open `chapter.tex`, find that line, and correct it if either the institution or
the email is wrong.

### 0.2 The repository is private

The chapter's code-availability note points at
`https://github.com/fxa28196/REU`, and the checklist asks for a **public**
repository. Right now it is private, so that URL will 404 for a reader.

For the **26 July draft** this is fine — nobody is checking links yet.
Before the **23 August camera-ready**, do one of:

- make the repo public (Settings → General → Danger Zone → Change visibility), or
- push a cleaned public mirror and change the URL in the chapter.

If you decide to keep it private, delete the sentence and say instead that code
is available on request — but do not leave a dead URL in a published chapter.

### 0.3 Licence — done. Zenodo DOI — needs ten minutes of your clicking

| Checklist item | Status |
|---|---|
| MIT `LICENSE` file present | **Done.** `LICENSE` at the repo root. |
| Citation metadata | **Done.** `CITATION.cff` gives GitHub a "Cite this repository" button. |
| Zenodo DOI minted and cited | **Prepared, not minted.** `.zenodo.json` is written; the archive needs your GitHub account and a public repo. Steps below. |

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
   - `chapter.tex` — add it to the code-availability paragraph, e.g.
     *"...under the MIT License, archived at
     \\url{https://doi.org/10.5281/zenodo.XXXXXXX}."*
   - A GitHub README, if you add one — Zenodo gives you a badge to paste.

Nothing here blocks the July draft. Do it before 23 August.

---

## 1. What to upload to Overleaf

Nine files, about **420 KB** total.

```
chapter.tex           the chapter
references.bib        23 entries, every one with a DOI or URL
svmult.cls            the official class from docs/publication/template/OFFICIAL-template/
figures/              <- keep this as a SUBFOLDER
  fig1_event.pdf        66 KB
  fig2_outcomes.pdf     65 KB
  fig3_equity.pdf       49 KB
  fig4_map.pdf         117 KB
  fig5_seeds.pdf        32 KB
  fig6_speed.pdf        58 KB
```

**Keep `figures/` as a subfolder.** `\graphicspath{{figures/}}` in the preamble
finds them there, and none of the `\includegraphics` calls carries a file
extension, so LaTeX picks the format itself — you never touch a figure path.

### Why PDF and not EPS

The proceedings guidelines say "EPS wherever possible". PDF is equally vector
and is pdfLaTeX's *native* format. EPS is not: on Overleaf, pdfLaTeX shells out
to `epstopdf` and reconverts **every EPS on every compile**, which is what blew
the free-plan timeout on the earlier version of this chapter. Working in PDF
makes a full three-pass build take a couple of seconds.

If the editors insist on EPS for the camera-ready zip, change the `.pdf`
extension in `save()` inside `scripts/make_chapter_figures.py` to `.eps`,
re-run it, and swap the files. Compile in PDF while you work; supply EPS only
if asked.

---

## 2. Upload and compile

1. Go to <https://www.overleaf.com> → **New Project** → **Upload Project**.
2. Zip the four items above (`chapter.tex`, `references.bib`, `svmult.cls`, and
   the `figures` folder) and upload the zip. Do **not** zip the enclosing
   `chapter` folder — Overleaf should see `chapter.tex` at the top level.
3. **Menu → Compiler → pdfLaTeX.** (Not XeLaTeX or LuaLaTeX; `newtxtext` and
   `newtxmath` expect pdfLaTeX.)
4. **Menu → Main document → `chapter.tex`.**
5. Press **Recompile**.

The bibliography needs a second pass. If references show as `[?]`, press
Recompile once more. Overleaf normally runs BibTeX automatically; if it does
not, use **Logs → Other logs & files → run BibTeX**, then recompile twice.

The manual sequence, if you ever compile locally, is:

```
pdflatex chapter
bibtex   chapter
pdflatex chapter
pdflatex chapter
```

### Expected result

Roughly 14–16 pages, **zero errors and zero undefined references or
citations**. Overleaf will show some `Overfull \hbox` warnings — those are
line-breaking niggles, not errors, and are normal for this class with long URLs
and wide tables.

### If it misbehaves

| Symptom | Fix |
|---|---|
| Citations render as `[?]` | Recompile again; BibTeX needs the `.aux` from pass 1. |
| `File 'fig1_event' not found` | `figures/` was flattened during zipping. Re-upload with the folder intact. |
| `Undefined control sequence \svhline` | `svmult.cls` did not upload, or the compiler is using a different class. |
| Compile times out | Menu → Clear cached files, turn **off** Auto-compile, recompile once by hand. |
| Fonts look wrong | Compiler is not pdfLaTeX. Change it in Menu → Compiler. |

---

## 3. Submit the draft (due 26 July)

The July deadline wants **PDF only**.

1. In Overleaf: **Download → PDF**.
2. Rename it something identifiable — `Asghar_MoreBedsOrBetterBeds_draft.pdf`.
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

The mechanical checks all pass; I ran them and got `0 FAIL`. Abstract is 189
words against the 200 cap, all 23 citations resolve, all 6 figures and 4 tables
are captioned and referenced, every environment balances, and every number in
the chapter was verified against the run CSVs and matches exactly.

What a script cannot check, and the checklist asks for:

- [ ] **Read the whole chapter aloud.** It catches what silent reading misses.
- [ ] **Someone who isn't you reads it.**
- [ ] Spell-check with a technical dictionary — proper nouns to watch:
      *Multnomah*, *Bohannon*, *Buekers*, *Zellmer*, *Boyce*, *Repast Simphony*,
      *Christof Teuscher*.
- [ ] Confirm the author line (§0.1).
- [ ] Look at the compiled figures at print size. They were built to stay legible
      in greyscale, but check them on the page rather than on screen.

---

## 6. What is in the chapter, so you can defend it

Two findings, and both are yours to explain at the symposium:

1. **Scenario B leaves 578 spaces empty while turning 562 people away.** Same
   number of spaces as people. That is not a capacity failure, it is a geography
   failure — and it is why scenario C exists.
2. **Capacity expansion alone widens the equity gap**, from 13.0 to 24.5
   percentage points between residents who walk easily and those who do not.
   Well-placed capacity brings it back to 12.9. An evaluation that tracked only
   aggregate access would have scored B as a success.

Three things reviewers may push on, and the honest answer to each:

| Likely question | The answer that is already in the chapter |
|---|---|
| "Does this reproduce 2020?" | No, and the Calibration subsection says so: the model over-predicts the one observed occupancy record by 1.52×, attributed to assuming universal shelter awareness against local evidence that 65% had never heard of the shelters. Every access figure is an **upper bound**. |
| "Where did the 1.45 and 1.80 risk weights go?" | The "Exposure, dose and health risk" subsection. One was attributed to a paper whose cohort is entirely 65+, so it cannot yield an age contrast; the other to a paper that does not exist. And multiplying exposure by a relative risk is a category error regardless. Weights are 1.0 and reporting is stratified instead. |
| "Are the ten new sites real?" | No. They are street-network nodes chosen by an algorithm, stated explicitly in "Concerns and Next Steps". No zoning, cost, or staffing analysis stands behind them. |

The supporting material, if anyone wants depth:

- `docs/final/TECHNICAL_REFERENCE.md` — the complete breakdown: every equation,
  every source, every code snippet, all 27 runs.
- `docs/final/presentation/index.html` — the polished walkthrough.
- `docs/final/readable/RESULTS_EXPLAINED.md` — the plain-language version.

---

## 7. Rebuilding the figures

If you change a number or want a different cut:

```powershell
python scripts\make_chapter_figures.py
```

It reads the 27 archived runs and rewrites all six PDFs into
`docs/chapter/figures/`. Takes about a minute. Re-upload whichever changed.
