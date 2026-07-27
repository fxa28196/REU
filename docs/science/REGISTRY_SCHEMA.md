# Scientific Governance Registries — Schema

Two machine-readable registries make the model's scientific content auditable
without reading source code, and expose it in every run manifest:

| File | Contents |
|---|---|
| `Geography/data/registry/variables.csv` | every scientific variable: what it is, how it is computed, where the number came from, how uncertain it is, and what it affects |
| `Geography/data/registry/assumptions.csv` | every modelling assumption, classified by evidence strength |

Both are loaded and **validated fail-fast at model startup** by
`geography.science.ScienceRegistry`, and both are written into `simulation.json`
under `governance`. A run whose registries fail validation produces no output.

**Why CSV and not YAML/JSON.** The build resolves only Repast plugin jars
(`Geography/build.gradle`); there is no YAML or JSON parser on the compile
classpath, and adding one for configuration data would introduce a third-party
dependency into a project whose reproducibility story depends on a fixed,
offline toolchain. `geography.data.CsvLoader` already parses quoted fields
containing commas with `""` escapes, and the same format is used by every other
input dataset. Prose fields must therefore stay on one line and be double-quoted
when they contain a comma.

---

## 1. `variables.csv`

| Column | Meaning |
|---|---|
| `variable_id` | Stable identifier, continuing the `VARIABLES.md` numbering (`V1`–`V22`); non-numbered internals use a descriptive id. |
| `name` | The code-level name (parameter, field, or column) so registry rows can be matched against source. |
| `description` | One line: what the quantity is. |
| `mechanism` | The scientific mechanism — *why this variable belongs in the model at all*. |
| `math` | Mathematical representation (formula, distribution, or `derived`). |
| `units` | SI or explicit; `-` for dimensionless or categorical. |
| `evidence_class` | `M` measured · `L` literature · `C` calibrated · `A` assumption · `F` future work (`DESIGN_SPEC.md`). |
| `source` | Human-readable citation or dataset name. |
| `doi_or_dataset` | DOI, dataset id (`D0`–`D13`), or `none` for pure modelling decisions. |
| `uncertainty` | Sensitivity range or CI to sweep; `none` only for exact conventions and infrastructure. |
| `affects_movement` | `yes`/`no` — does this change how agents move? |
| `affects_exposure` | `yes`/`no` — does this change accrued exposure? |
| `affects_shelter_access` | `yes`/`no` — does this change who reaches shelter? |
| `affects_reporting` | `yes`/`no` — does this appear in results? |
| `status` | `implemented` · `specified` (designed, not coded) · `placeholder` (present but inert) · `deprecated`. |
| `implementation` | Where it lives in code, or `-`. |

### Validation rules (fail-fast)

1. Required columns present; `variable_id` unique and non-empty.
2. `evidence_class` ∈ {M, L, C, A, F}; `status` ∈ {implemented, specified, placeholder, deprecated}.
3. All four `affects_*` ∈ {yes, no}, and **at least one must be `yes`** — a
   variable that affects nothing does not belong in the registry.
4. `evidence_class = L` **requires** a non-empty `doi_or_dataset`; `M` requires a
   dataset id. A literature value without a resolvable source is exactly the
   defect this project has twice been damaged by, so it is rejected at load, not
   merely warned about.
5. `evidence_class ∈ {L, C}` requires a non-`none` `uncertainty` — a literature
   or calibrated value with no stated range cannot be sensitivity-tested.
6. `status = placeholder` rows are permitted but **counted and named in the
   manifest** under `governance.placeholder_variables`, so a run depending on an
   inert value cannot be quoted as a finished result.

Rules 4 and 5 are the mechanised form of the project's founding rule: *no
invented values*.

---

## 2. `assumptions.csv`

| Column | Meaning |
|---|---|
| `assumption_id` | `A-nn`, stable. |
| `statement` | The assumption in one sentence, stated so it could in principle be falsified. |
| `classification` | `measured` · `literature` · `calibrated` · `assumption` · `future_work`. |
| `rationale` | Why it is acceptable *for now*, or what forced it. |
| `affects` | Which results it could change. |
| `sensitivity_plan` | How it will be tested, or `none - structural`. |
| `status` | `active` · `retired` (kept for history) · `blocking` (must be resolved before publication). |
| `source_or_doc` | Where it is argued in full. |

### Validation rules (fail-fast)

1. `assumption_id` unique; `classification` and `status` drawn from the sets above.
2. `classification = assumption` requires a non-empty `sensitivity_plan` — an
   untested modelling choice may not be silent.
3. `status = blocking` rows are counted and named under
   `governance.blocking_assumptions`.

---

## 3. Manifest exposure

`simulation.json` gains:

```json
"governance": {
  "variables_file": "data/registry/variables.csv", "variables_sha256": "...",
  "assumptions_file": "data/registry/assumptions.csv", "assumptions_sha256": "...",
  "variable_count": 0, "assumption_count": 0,
  "evidence_class_census": { "M": 0, "L": 0, "C": 0, "A": 0, "F": 0 },
  "placeholder_variables": [], "blocking_assumptions": []
}
```

**The registry files are deliberately NOT added to `input_datasets`.** That list
feeds `data_version_tag`, which the archived baseline pins at `0bc943324ae6`;
appending governance metadata would change the tag without any change to model
inputs, severing baseline comparability for a non-scientific reason. Registry
checksums live in their own block, so both facts are recorded and independent.

---

## 4. Maintenance rule

**A variable may not be added to the model without a registry row in the same
commit.** Validation runs at startup and the counts appear in every manifest, so
drift is visible; the enforcement that matters is review discipline, but a test
asserting that every Repast parameter has a matching `implemented` registry row
makes the common case mechanical.
