# Chapter self-audit checklist

Derived from three sources: the official guidelines, the `svmult` template's own
instructions, and the Van Pelt example chapter as a worked model.

Run through this before each submission. Tick honestly.

---

## A. MECHANICS — the things that get a chapter bounced

- [ ] Uses the official `svmult` document class from the template
- [ ] `\bibliographystyle{plain}` (the template's choice — not `spmpsci` or others)
- [ ] Preamble packages match the template: `type1cm`, `makeidx`, `graphicx`,
      `multicol`, `footmisc[bottom]`, `newtxtext`, `newtxmath`
- [ ] **Abstract is 200 words or fewer** (template's explicit cap)
- [ ] Compiles clean: zero errors, zero undefined references
- [ ] `grep -c 'NEEDS{'` returns **0** — no drafting markers left
- [ ] Drafting scaffolding removed (`\newcommand{\NEEDS}`, `\usepackage{xcolor}`)
- [ ] Author name, institution, and email correct in `\institute{}`
- [ ] Mentor's name spelled correctly — **Christof Teuscher**, not Christopher
- [ ] Submitting **PDF** for the July draft; **PDF + LaTeX source zip** in August

---

## B. STRUCTURE — the template's prescribed sections

The template names these explicitly. Deviating without reason invites comment.

- [ ] Introduction
- [ ] Related Work and Background
- [ ] Data and Methodologies
  - [ ] Data Collection
  - [ ] Methods
- [ ] Results
- [ ] Conclusion
  - [ ] Applications
  - [ ] Concerns and Next Steps
- [ ] Acknowledgements
- [ ] References

**Van Pelt's variation:** he adds a "Code availability" note after the
acknowledgements. Worth copying.

---

## C. AI DISCLOSURE — read this twice

The template asks, inside the Methods section:

> *"what platforms did you use? what coding languages? **did you use AI? what AI
> model?** Did you use any libraries?"*

- [ ] AI use disclosed **in Methods**, not only in acknowledgements
- [ ] Named specifically — which model, and what it was used for
- [ ] Acknowledgements state authorship clearly
- [ ] The statement is **true**, not aspirational

**Van Pelt's wording, as a model:**

> *"I directed the research, made all research decisions, and wrote the
> manuscript. Claude (Anthropic) assisted with coding and verification. Both
> Claude and ChatGPT (OpenAI) helped draft a few short passages and were used to
> edit and condense my writing. I reviewed, revised, and approved all outputs and
> take full responsibility for the final text."*

Note what makes it work: it names each tool, says what each did, and ends with an
unambiguous statement of responsibility. Two people on the editorial team are
designated plagiarism-and-AI checkers.

---

## D. FIGURES

- [ ] Vector format — EPS per the guidelines, or PDF if EPS breaks the compile
- [ ] Photos/screenshots as PNG or JPG (vector gains nothing on a raster)
- [ ] Every figure has `\caption{}` and `\label{}`
- [ ] Every figure is **referenced in the text** by `\ref{}` — an unreferenced
      figure reads as decoration
- [ ] Captions state the **takeaway**, not just the contents

**Van Pelt's caption style:**

> *"Fig. 3 The same road closure seen by both models, on one change scale. The
> static land-use surface cannot change (left); the agent-based surface
> redistributes modeled NO₂ onto detour routes (right)."*

First sentence: what is shown. Second: what the reader should conclude.

- [ ] Axis labels carry **units**
- [ ] Colour scheme consistent across all figures
- [ ] Legible when printed greyscale at 8.5" × 11"

---

## E. TABLES

- [ ] `\caption{}` above the table (svmult convention)
- [ ] `\label{}` and referenced in text
- [ ] Uses `\svhline` for the header rule (the class provides it)
- [ ] Units stated in the header, not repeated in every cell

---

## F. REFERENCES

- [ ] BibTeX, not hand-typed
- [ ] Every `\cite{}` resolves — zero "undefined citation" warnings
- [ ] Every entry has a **DOI or URL that actually resolves**
- [ ] Author, journal, volume, pages, year verified **against the publisher
      record**, not from memory or a secondary citation
- [ ] Each source actually supports the claim it is attached to

**On that last point.** The most damaging citation error is not a typo — it is
citing a real, well-conducted paper for a finding it does not contain. Check that
the paper studies the right **pollutant**, the right **outcome**, and the right
**population**. See `07-EVIDENCE/CITATION_AUDIT.md` for six real examples from
this project.

---

## G. SCIENTIFIC CONTENT

- [ ] Research question stated plainly in the Introduction
- [ ] Every parameter has a **source**, or is explicitly labelled as assumed
- [ ] Methods detailed enough for someone else to reproduce
- [ ] Verification reported before results — tests whose answers can be checked
      by hand
- [ ] Results reported as **numbers**, not descriptions of numbers
- [ ] Claims match evidence — no overstatement
- [ ] Limitations named specifically, including ones that cut against the
      hypothesis
- [ ] Data provenance documented: source, URL, retrieval date

**What makes the Van Pelt chapter credible** is worth studying: he reports
ρ = 0.590 and immediately places it mid-range against published benchmarks. He
writes *"these are model-to-model comparisons"* and *"does not claim absolute
accuracy."* His limitations section runs three pages and names a matching error
he found and fixed. **Precision about what the work cannot support is what makes
the rest believable.**

---

## H. REPRODUCIBILITY

- [ ] Code repository public, with a URL in the chapter
- [ ] Licence file present (MIT is the project default)
- [ ] Random seed stated for every reported result
- [ ] Configuration files included
- [ ] Data either included or its retrieval documented
- [ ] Zenodo DOI minted and cited

**Van Pelt's code-availability note:**

> *"The full simulation and analysis code is available at [URL]. The repository
> includes the configuration file and the fixed random seed used for every result
> in this chapter."*

Note also that he explains what is *not* included and why — measured data shared
by a third party is excluded, and he says so.

---

## I. FINAL PASS BEFORE SUBMISSION

- [ ] Read the whole chapter aloud — catches what silent reading misses
- [ ] Every number in the text matches the number in the table
- [ ] Every number in a table matches the source data file
- [ ] No claim in the abstract that isn't supported in the body
- [ ] Figure and table numbering runs in order of first mention
- [ ] Spell-check with a technical dictionary
- [ ] Someone who isn't you reads it

---

## Deadlines

| Date | Deliverable |
|---|---|
| **26 July** | Draft PDF → draft chapters Drive folder |
| **9 August** | Proofreader and plagiarism feedback returned |
| **14 August** | Symposium |
| **23 August** | **Camera-ready: PDF + LaTeX source zip** |
