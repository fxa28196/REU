# Upload every file in this folder to Overleaf. Nothing else.

9 files, 580 KB. All flat — no subfolders. Drag them in all at once.

## Steps

1. overleaf.com -> New Project -> Blank Project -> name it.
2. Click the upload icon (up-arrow) above the file list.
3. Drag in ALL 9 files from this folder at once.
4. Right-click `main.tex` -> Delete. (Overleaf makes it; you don't need it.)
5. Menu -> Compiler -> **pdfLaTeX**
6. Menu -> Main document -> **chapter.tex**
7. Recompile. Then Recompile TWICE MORE — the `[?]` marks become numbers
   once BibTeX has run.

## Expected

14-16 pages, zero errors, zero undefined references.
`Overfull \hbox` warnings are normal and are not errors.

## You do NOT need spmpsci.bst

The other guidance said you did. You don't. The official template uses
`\bibliographystyle{plain}`, which ships with LaTeX — there is no .bst file
to find. `svmult.cls` here is byte-identical to the one in the official
template zip (81,405 bytes), so it is the real thing.

## Files

| File | What it is |
|---|---|
| `chapter.tex` | the chapter — set this as Main document |
| `references.bib` | 23 sources, every one with a DOI or URL |
| `svmult.cls` | official Springer class, from the editors' template |
| `fig1_event.pdf` | measured PM2.5 across the smoke event |
| `fig2_outcomes.pdf` | access, and spare capacity vs unmet need |
| `fig3_equity.pdf` | the mobility gap across the three scenarios |
| `fig4_map.pdf` | where people are vs where the shelters are |
| `fig5_seeds.pdf` | all 27 runs |
| `fig6_speed.pdf` | sampled walking speeds by group |

## Fixed in this version

- **Percent signs.** Figures 2 and 3 printed a literal `30.1\%`. The
  backslash is gone; they now read `30.1%`.
- **Quote marks.** Figure 1 printed literal backticks around "Unhealthy".
  Now proper quotes.
- **"clean-air-capable facilities"** -> **"existing shelter facilities"**.
  Nothing in the sources establishes those buildings filter their air, and
  the model does not simulate indoor air at all.
- Figures are PDF, not EPS. PDF is equally vector and is pdfLaTeX's native
  format; EPS forces a reconversion on every compile and is what caused the
  earlier free-plan timeout.

## Before you submit

Two things only you can check:

1. **Line 30-ish, the `\institute{}` block.** It says Harrisburg Area
   Community College and `fxa28196@hawkmail.hacc.edu`. I inferred both from
   an email in your own geocoding script. **Fix it if it's wrong.**
2. **Your GitHub repo is private.** The chapter prints its URL. Open it in a
   private browser window; if it 404s, either make the repo public or change
   that sentence to "available on request."

Then: Menu -> Download -> PDF, and put it in the draft folder
https://drive.google.com/drive/folders/1QWSUbYspKX1rnSWQcF6s5j6tZoWvtqHO
