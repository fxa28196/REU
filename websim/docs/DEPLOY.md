# DEPLOY — building and publishing the websim site (WP14)

How to build the static site, what must be green before any byte goes public, and
how the GitHub Pages mechanics (base path, 404/permalink fallback) work.

---

## 0. PUBLIC DEPLOY IS GATED — read this first

**A public deploy is permitted only behind the WP1 sign-offs, and both are now
recorded:**

| Question | Record | What it is — and is not |
|---|---|---|
| Redistribution rights (RLIS streets, campsite-derived products) | [`DR-WP1-data-rights.md`](DR-WP1-data-rights.md) | Oregon Metro and the City of Portland approvals, **as reported by the researcher, relayed 2026-08-02**, on condition both sources are credited. **No written determination from either body is on file in this repository** — no licence text, reference number, contact, or approval date. These are author-relayed approvals, not written licence grants; any publication that needs documentary evidence must obtain it first. |
| Human-subjects review | [`DR-WP1-irb-determination.md`](DR-WP1-irb-determination.md) | The faculty mentor's determination that **no IRB review is required** (no human subjects; not yet a real-world application), relayed by the researcher 2026-08-02. Verbal; no letter or protocol number on file. It covers *research use*: any move toward operational use (a decision aid, an agency tool) must be re-raised with the mentor first. |

Do not restate either record more strongly than the table above does. "Metro has
granted permission", a licence name, or "IRB-exempt" are all claims the repository
cannot back, and the claim linter blocks several such phrasings.

The sign-offs clear *rights*. They do not relax the disclosure controls
([`DR-Q4-encampment-disclosure.md`](DR-Q4-encampment-disclosure.md)): no public asset
carries raw encampment coordinates or raw incident ids, the k = 5 display floor
stands (it floors **reports, not sites** — DR-WP1-data-rights §6.2), and both deploy
gates below grep the built bytes on every publish.

---

## 1. Build

From `websim/`, on a machine that has the pipeline outputs (`pipeline/out/assets`
and `pipeline/out/archive-bundles` — a hosted runner does not; see §4):

```bash
npm ci                      # clean install
npm run ci                  # typecheck + lint + tests + claim linter + browser gate
npm run build -w app        # stages pipeline/out into app/public, then vite build
```

`npm run build -w app` runs `stage-assets` first, so `app/dist/` always carries the
current pipeline output; the asset manifest's SHA-256s are re-verified in the browser
at load time, so a stale copy fails loudly rather than serving old bytes.

## 2. Gates that must pass before ANY upload

Both are required; they check different bytes.

```bash
npm run check:deploy -w @websim/pipeline   # WP4/Q4 gate over pipeline/out/assets
                                           # (needs the raw feed AND the build salt;
                                           #  refuses to pass without them — DR-Q4)
npm run deploy-check                       # WP14 gate over app/dist (this repo's
                                           # tools/deploy-check.ts)
```

`npm run deploy-check` fails the publish on three named rules:

- **raw-encampment-data** — any raw campsite coordinate (float64 bits at any offset,
  or a located lon+lat text pair) or any `inc_id`-shaped token in the built output.
- **manifest-mismatch** — the asset manifest in `dist` disagrees with `pipeline/out`
  in any way: differing manifest bytes, a listed asset missing or hashing differently
  than the manifest promises, stale staged copies, or an unexplained file riding
  along in `dist/assets`.
- **placeholder-marker** — a placeholder/TODO marker in user-visible text. One
  vendor shader string is quarantined by exact window with the reason pinned in
  `tools/deploy-check.ts`; anything else blocks.

It exits `2` (refuses, does not pass) when `dist`, the pipeline assets or the raw
feed are absent — absence of raw data cannot be proved without the raw data.

**The four never-regress gotchas are enforced by automated checks that run in
`npm run ci`** (README §5): the Coughlan-et-al.-2022 citation and the
Canberra-anchor severity framing by claim-linter rules (`tools/claims.ts`, exercised
in `tools/test/lint-claims.test.ts`); `simulationHours ≤ slices − 1` structurally in
the store clamp (`app/src/state/store.ts`, pinned by `app/test/store.test.ts` and
`app/test/param-meta.test.ts`) plus the engine fail-fast; and the executed-manifest
discipline (Repast's negative-`number` zeroing made unreproducible by the typed
config) pinned by `shared/test/manifest.test.ts`.

## 3. GitHub Pages mechanics

### Base path

`app/vite.config.ts` sets `base: "./"`. Every asset URL in the built site is
**relative**, so the same `dist/` works at `https://<user>.github.io/<repo>/`, at a
custom domain root, or from a local `vite preview` — no rebuild per host. The asset
loader resolves everything against `import.meta.env.BASE_URL`, and the app is a
single page served from the base URL: do not publish it at nested paths.

### 404 / permalink fallback

Permalinks are **hash fragments** (`#p=<presetId>&d=<base64url(diff)>&seed=…&t=…`,
`shared/src/permalink.ts`). A fragment never reaches the server, so every shared
link resolves to the app root and needs **no server rewrites** — static hosting is
sufficient, and stale links degrade to an in-app migration notice rather than a 404.

The only thing a 404 page must handle is a mistyped or legacy *path*. Ship this as
`404.html` next to `index.html` (generate it at deploy time; do **not** copy
`index.html` to `404.html` — with a relative base, assets would resolve against the
bad path and the app would half-load):

```html
<!doctype html>
<meta charset="utf-8" />
<title>Redirecting to the simulation</title>
<script>
  // GitHub Pages serves this for any unknown path under the site. Permalinks
  // live in the hash fragment, which the browser keeps client-side — forward
  // it to the app root untouched. On a project page the root is the first
  // path segment ("/<repo>/"); on a user/organization page it is "/".
  var segments = location.pathname.split("/");
  var base = segments.length > 1 && segments[1] !== "" ? "/" + segments[1] + "/" : "/";
  location.replace(base + location.search + location.hash);
</script>
<p>This address is not a page of the simulation. <a href="/">Open the simulation.</a></p>
```

### Publishing

The proposed Pages workflow (deploy job YAML, lint step, and the human-approval
gating) is in [`../.github-workflow-additions.md`](../.github-workflow-additions.md)
— notes for a human to apply, not applied automatically. Key properties it must
keep: it runs only on the artifact runner (hosted runners cannot rebuild the
Java-derived graph assets), it runs **both** §2 gates after the build and before the
upload, and the Pages environment requires a manual reviewer approval so a green
pipeline alone can never publish.

## 4. Why a hosted runner cannot deploy

`pipeline/out/` is git-ignored and partly Java-derived: `graph-*.bin` carry
Java-computed geodesic edge weights dumped by the read-only exporter against the
certified `Geography/` classes. A hosted runner can rebuild the data-plane assets
(`npm run build:data`) but not the graph plane, so the deploy job runs where the
artifacts live (the opt-in `WEBSIM_ARTIFACT_RUNNER` runner used by
`strict-artifacts`), and `deploy-check`'s manifest-mismatch rule proves the staged
bytes are exactly the pipeline's.

## 5. Post-deploy dry run (on the production URL)

The symposium dry-run, executed against the real deployed URL — not localhost:

1. Load the site cold (cache disabled). The asset manifest fetch and every digest
   check must pass; any mismatch renders the loader's named error, and that is a
   rollback, not a note.
2. Confirm the footer attribution line (`DATA_ATTRIBUTION_LINE`) is visible on every
   screen without interaction.
3. Select `A_present_day`: the archived certified panel must render (headline under
   the "Certified Java run" chip) before any live run.
4. Press Play through the capability dialog; the live panel must fill under the
   "Live browser simulation" chip alongside — never replacing — the archived panel.
5. Copy a permalink with a modified parameter, open it in a private window, and
   confirm the config round-trips (diff chip shows the same modification).
6. Open a nonsense path under the site and confirm the 404 page forwards to the app
   with the hash intact.
7. Record the run (date, URL, commit, pass/fail per step) in a dated note under
   `websim/docs/`.

A failed step blocks the announcement, not the retrospective: the deploy is rolled
back first and diagnosed second.
