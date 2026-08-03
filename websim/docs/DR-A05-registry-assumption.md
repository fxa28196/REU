# DR-A05 — assumptions.csv row A-05 is false, and the file is being left unedited on purpose

Status: **documented, file deliberately NOT edited** (decision taken 2026-08-02).
Scope: `Geography/data/registry/assumptions.csv` row `A-05`; secondary finding on
`Geography/data/registry/variables.csv` row `V-REATTACH`.
This DR records a governance discrepancy and the provenance reasoning behind
leaving it in place. It changes no code and no data.

## 1. The discrepancy

`Geography/data/registry/assumptions.csv` line 6, row `A-05`:

> `A-05,Every mapped street centerline is walkable by pedestrians,assumption,`
> `Freeway and ramp segments are not yet filtered from the pedestrian graph`
> `although the classification attributes needed to do so are present in the`
> `data,...,active,docs/science/VARIABLES.md V11`

Two of those fields are now false:

* **"not yet filtered" is false.** U-27 filters them. `ContextCreator.java`
  declares `NON_PEDESTRIAN_TYPES` = RLIS TYPE `{1110, 1120, 1121, 1122, 1123}`
  (freeway mainline plus ramps and connectors) and excludes them from the
  pedestrian routing graph. Every archived manifest since counts the exclusion:
  `street_network_validation.freeway_filter.features_excluded = 2636`,
  `km_excluded = 614.1`, broken down `1110:1372, 1120:279, 1121:466, 1122:447,
  1123:72`.
* **`status = active` is false.** The remediation the row itself proposes
  ("Filter by street classification and compare routed distances before and
  after") has been carried out, and the before/after comparison is reported in
  the chapter: all sheltered counts unchanged to the digit in every scenario and
  seed.

So the registry asserts, with a status flag that says the issue is live, that
the model does something it demonstrably stopped doing.

## 2. Why the file is being left unedited

`assumptions.csv` is not documentation. It is a **governance input**:

* `ContextCreator.java:432` loads it at every model start via
  `ScienceRegistry.load(VARIABLES_CSV, ASSUMPTIONS_CSV)` and fails/warns on
  blocking assumption IDs (`ContextCreator.java:438-440`).
* `OutcomeLogger.java` hashes it into every run manifest **twice**: the file is
  listed in the `source_integrity` array at `:453` (hashed at `:469`), and it is
  emitted again as `governance.assumptions_sha256` at `:586`. Both emissions
  carry `0006704c…` in the three-arm manifests.

Editing it therefore (a) changes the input to a fail-fast validation path and
(b) changes a hash that 154 archived manifests were written against. The
researcher's decision is that a one-line prose correction is not worth
perturbing a validated governance input mid-submission, and that documenting the
discrepancy in a dated DR is the honest and cheaper remedy. **Do not edit
`assumptions.csv` to close this DR.** Close it by re-running the affected
families, if and when they are re-run for other reasons.

## 3. The hash situation, reported honestly

Two prior agents disagreed about whether the on-disk `assumptions.csv` matches
the archive. **Both were reporting true facts about different parts of the
archive.** Recomputed from scratch here:

**On-disk (working tree, raw bytes as the model hashes them):**

| file | SHA-256 |
|---|---|
| `assumptions.csv` (29,763 B, CRLF) | `d1ab3df6a3c6317b9a68255e30967c4aae1cd119833db3ecb0be03c51e24d386` |
| `variables.csv` (47,140 B, LF) | `e0963e188b0571fcee7f3131246df4ed476e69a594f2e9292c355fc0431089fa` |

**Every distinct value recorded across all 154 archived manifests**
(`docs/runs/**/simulation.json`; 153 carry a `governance` block, one does not):

`governance.assumptions_sha256` — four distinct values:

| value | manifests | archive families |
|---|---|---|
| `0006704cda736b32e5e7a57dc71bb00e4fe3efc1163485d7cda9e572d7681de5` | 93 | historical-reference, phaseD-bed-sweep, phaseD-windows, **present-day-three-arm**, scenario-crandom-2026, scenario-d-2026 |
| `d1ab3df6a3c6317b9a68255e30967c4aae1cd119833db3ecb0be03c51e24d386` | 27 | scenario-e-v2 |
| `804ae0e4b0544042600059067b6dbb9d68356a441e661a3eac23e3607bc4b41f` | 21 | scenario-e |
| `6785ed1cc503a97c00d077eb7cadbda2ef496c04c7ec662635552451c772cd6b` | 12 | phase-e |

`governance.variables_sha256` — five distinct values:

| value | manifests | archive families |
|---|---|---|
| `a460273be5f9e71d84a120be393064e3bcf3bf20787cdc1951ba6bf96b27b0df` | 84 | historical-reference, phaseD-bed-sweep, phaseD-windows, **present-day-three-arm**, scenario-crandom-2026, scenario-d-2026 |
| `5279b1db5e0f9b6c83c94c1663efdf1c06e54b949b8ffd8c0d38bd6a9e8b4486` | 27 | scenario-e-v2 |
| `e51d0ea64d598a1a16f5dbea256084f51ba7c6a1e5b1ca553d48e7859c3bce38` | 21 | scenario-e |
| `96624a3351224d423ff3c89f9a7fb4b070f29c3fe38525cab0c9c329e1e0fb45` | 12 | phase-e |
| `3b2aaffa6a888e6f1030b4b44263ffadee0702b3650873d342ccb5d4dbd38cde` | 9 | phaseD-bed-sweep |

### Resolution of the disagreement

* Agent 1 was right that the on-disk `d1ab3df6…` **does** match an archived
  value — it matches the 27 `scenario-e-v2` manifests, the most recent family.
* Agent 2 was right that the archived value is `0006704c…` and **does not**
  match — that is the value recorded by the 93 manifests that include
  `present-day-three-arm`, `phaseD-bed-sweep`, `scenario-crandom-2026` and
  `scenario-d-2026`, i.e. **every run behind the book chapter's headline
  results**.

Both statements hold simultaneously. Neither agent was wrong; each looked at a
different slice.

### The drift is real, not a line-ending artifact

`d1ab3df6…` is the CRLF-byte hash; the LF-normalized hash of the same
working-tree file is `fa2fe578…`. To rule out the possibility that `0006704c…`
is just the same content under different line endings, the **SHA-256 of the file
content at each commit** was compared directly (these are content digests, as
produced by `git show <commit>:<path> | sha256sum` — not git blob object IDs,
which are SHA-1):

* `assumptions.csv` at `deddfcad` (the commit stamped by the
  `present-day-three-arm` manifests): `825aa63e3166…`
* `assumptions.csv` at `HEAD`: `fa2fe57815d7…`

Different content. **`assumptions.csv` has genuinely drifted since the chapter's
production runs were archived**, and drifted twice more besides (four distinct
values across the archive).

### What this means for the provenance argument

It weakens it, and that should be said plainly. The reason given for not editing
`assumptions.csv` is that its SHA-256 is recorded in every archived manifest. But
that hash has **already** been broken three times: the file the chapter's
93 headline manifests hashed (`0006704c…`) is not the file on disk today, and two
further intermediate values sit between them. Leaving A-05 unedited preserves
byte-identity only with the 27 `scenario-e-v2` manifests, not with the runs the
chapter actually reports. The protection being bought is narrower than it looks.

The decision to leave the file alone still stands — the cost of an edit is a
fresh re-hash and another validation pass, and the benefit is one corrected
sentence in a file nobody reads as prose — but it should be taken as a
convenience decision, not as a provenance guarantee.

## 4. `variables.csv` was treated differently, and here is why

`variables.csv` is a governance input of exactly the same class: same loader
(`ScienceRegistry.load`), same hashing into every manifest
(`governance.variables_sha256`), same fail-fast path. **It was edited in this
workstream and `assumptions.csv` was not.**

The edit: row `V-REATTACH` (line 20), notes field, `"4 of 27 corrections were
reattachments"` → `"3 of 25 corrections were reattachments"`, to match the
post-U-27 graph census the manifests actually report
(`street_network_validation.sites_reattached = 3`,
`sites_split_synthetic = 22`, `corrections` list length 25). The edit is
currently **uncommitted** in the working tree.

Consequences, stated so the researcher is not surprised later:

* On-disk `variables.csv` (`e0963e18…`) matches **none** of the five archived
  values. Before the edit, `HEAD` was `5279b1db…`, which did match the 27
  `scenario-e-v2` manifests; the edit broke that last remaining match.
* The two files are therefore now in different states: `assumptions.csv` still
  matches one archive family, `variables.csv` matches none.

The asymmetry is defensible — `V-REATTACH` stated a *count* that contradicted
the manifests it sits alongside, whereas `A-05` states a *status* that is stale
— but it was not a principled distinction applied in advance, and it should be
recorded as such.

**Researcher's decision, 2026-08-02:** keep the `V-REATTACH` correction and leave
`A-05` unedited, with both states documented here. The asymmetry was put to the
researcher explicitly, together with the finding that the 93 manifests behind the
chapter's headline results already matched *neither* file, and was ratified on
that basis — i.e. the choice was made knowing the provenance argument for
ring-fencing `assumptions.csv` is weaker than it first appeared.

If the registries are ever re-baselined, both rows should be
brought into line in the same pass and the affected families re-run together.

## 5. Verification commands

```bash
# on-disk hashes, raw bytes (what the model hashes)
python -c "import hashlib;print(hashlib.sha256(open('Geography/data/registry/assumptions.csv','rb').read()).hexdigest())"
python -c "import hashlib;print(hashlib.sha256(open('Geography/data/registry/variables.csv','rb').read()).hexdigest())"

# every distinct governance hash across the archive
python -c "
import json,glob,os
from collections import defaultdict
A=defaultdict(list)
for p in glob.glob('docs/runs/**/simulation.json',recursive=True):
    g=json.load(open(p)).get('governance')
    if g: A[g['assumptions_sha256']].append(p)
for k,v in A.items(): print(k,len(v))"

# proof the drift is content, not line endings
git show deddfcad:Geography/data/registry/assumptions.csv | sha256sum
git show HEAD:Geography/data/registry/assumptions.csv     | sha256sum
```
