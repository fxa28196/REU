# IDE & Build Consistency Audit — Wildfire Smoke Shelter ABM

**Date:** 2026-07-24 · **Trigger:** After a VS Code restart, the Problems panel
showed **371 problems** (unresolved imports/types/methods, GeoTools errors)
while Gradle reported `BUILD SUCCESSFUL` and the model demonstrably ran
(`BASELINE_RUN.md`). This document records the investigation, root cause,
fixes, verification, and remaining limitations.

**Verdict up front:** all 369 error-severity problems were **editor-only
Java-Language-Server errors caused by a failed Gradle-classpath installation
inside the language server** — not compiler errors, not source defects, not
dependency misconfiguration. After repair, VS Code reports **0 errors**; the
~77 remaining warnings are the same pre-existing raw-type/unused-code warnings
the command-line compiler reports. The IDE and the compiler now agree.

---

## 1. Problem inventory (as reported)

Captured via the VS Code diagnostics API before repair — exactly **371**
diagnostics, all from source `Java` (redhat.java / JDT), 369 Error,
1 Warning, 1 Information:

| Category | Count | Examples |
|---|---|---|
| Unresolved imports | 93 | `The import repast cannot be resolved` (46), `org.geotools` (14), `gov.nasa` (WorldWind, 21), `org.locationtech` (10), `org.opengis` (2) |
| Unresolved types | ~200 | `ContextBuilder cannot be resolved to a type`, `SimpleFeature …`, `WWTexture …` |
| Unresolved variables/names | 35 | `AVKey cannot be resolved to a variable`, `WorldWind cannot be resolved` |
| Cascading method errors | ~40 | `The method getFillColor(...) must override or implement a supertype method` (superclass itself unresolved) |
| Legitimate non-errors | 3 | deprecated `File.toURL()` warning, `TODO` info marker |

Distribution: every `.java` file under `Geography/src/` was affected
(ContextCreator 93, GisAgent 89, styles 50/26/18/12×5/11, ZoneAgent 19,
BufferZoneAgent 17). All missing packages live inside Repast Simphony plugin
jars (`repast.simphony.*`, GeoTools `gt-*`, JTS, OpenGIS, WorldWind under
`repast.simphony.gis*/lib`) — i.e., the **entire dependency classpath was
absent from the editor's model** while the CLI build resolved it fine.

## 2. Ground truth established before touching anything

1. `gradlew compileJava` → `BUILD SUCCESSFUL` (compiler ground truth).
2. New audit task `gradlew -q printResolvedClasspath` (added in this commit) →
   **314 classpath entries: 273 jars + 41 plugin `bin/` class dirs**, including
   GeoTools 26.6 (`gt-shapefile`, `gt-referencing`, `gt-opengis`, … 17 jars),
   `jts-core`, `worldwind-2.2.0.jar`, and every `repast.simphony.*` plugin.
   The runtime deps of every failing import were present in the CLI build.

Conclusion: the source code and the Gradle build were **proven correct**
before any repair — per the audit rule "do not assume the source code is
broken until the environment has been proven correct."

## 3. Root cause (from the language-server log)

Log: `%APPDATA%\Code\User\workspaceStorage\4822885a052f1e4b33e03efbace2660d\redhat.java\jdt_ws\.metadata\.log`

Timeline of the VS Code restart at 01:44 on 2026-07-24:

```
01:44:24  ERROR  Failed to start Gradle Build Server, use BuildShip instead
01:44:44  WARN   Cannot update classpath provider
                 org.eclipse.core.internal.resources.ResourceException:
                 The resource tree is locked for modifications.   (×10)
01:53:55  ERROR  Error occured while building workspace. Details:
                 The import org.locationtech cannot be resolved … (the 371)
```

Causal chain:

1. VS Code restarted → redhat.java re-imported `Geography/` as a Gradle
   project. The newer *Gradle Build Server* path failed to start, so JDT fell
   back to its embedded **Buildship** engine (expected fallback, not fatal).
2. Buildship ran the Gradle sync, then attempted to write the resolved
   classpath into the workspace project — and hit an Eclipse workspace
   **resource-tree lock** ten times in a row (a race between the mass import
   job and concurrent resource events; the OneDrive-synced working copy makes
   file-event storms more likely). The Buildship
   `org.eclipse.buildship.core.gradleclasspathcontainer` was left **empty**.
3. The subsequent workspace build compiled all sources against an empty
   dependency classpath → all 371 diagnostics. The container never self-healed
   because nothing re-triggered a sync (`auto.sync=false` is Buildship's
   default project preference).

### Classification against the suspect list

| Suspect | Verdict |
|---|---|
| Java Language Server indexing | **✔ Root cause** — failed classpath-container installation (lock race), stale thereafter |
| Gradle classpath mismatch | ✘ CLI resolution complete & correct (314 entries) |
| Repast library resolution | ✘ All plugin jars present under `REPAST_HOME\eclipse\plugins` |
| GeoTools dependency resolution | ✘ GeoTools 26.6 jars resolve via `repast.simphony.gis*/lib` fileTree |
| Eclipse metadata vs Gradle metadata | ⚠ Side finding (see §4) — not the cause of the 371 |
| Workspace configuration | ⚠ Minor: `java.jdt.ls.java.home` pointed at JDK 17, which the LS silently ignores (needs 21+) — misleading, now removed |
| Duplicate source roots | ✘ Single source root `src/` |
| Incorrect REPAST_HOME | ✘ `build.gradle` fallback `<user home>/RepastSimphony-2.11.0` resolves on this machine even without the env var |
| Java extension configuration | ⚠ Same as workspace configuration row |

## 4. Side finding: Eclipse project metadata was overwritten

The Buildship import **rewrote** `Geography/.project` and
`Geography/.classpath`, replacing the Repast-native containers/natures
(`REPAST_SIMPHONY_SUPPORT`, `GROOVY_SUPPORT`, `repast_simphony_nature`,
statecharts builder) with Buildship equivalents. This happened *before the
first git commit existed*, so the originals are unrecoverable from history.

Mitigation (this commit):

- Reference copies of the Repast-native metadata (from the stock 2.11.0
  `models/Geography` demo this project derives from) are archived under
  `docs/eclipse/original-repast-metadata/` with restore instructions.
- Compatibility verified: **Repast 2.11.0's bundled Eclipse ships Buildship
  3.1.9**, so the project still opens there via
  *Import → Gradle → Existing Gradle Project* and resolves the identical
  dependency set through `build.gradle`. Native Repast wizards/statechart
  builder conveniences are lost unless the archived metadata is restored;
  nothing in this model's build/run path uses them.

## 5. Fixes applied

| # | Fix | File(s) | Effect |
|---|---|---|---|
| 1 | Forced a Buildship re-sync by modifying `build.gradle` (with `"java.configuration.updateBuildConfiguration": "automatic"` already set, a build-file change triggers sync without UI) | `Geography/build.gradle` | LS log: `Updated Geography in 27400 ms` → classpath container populated → **all 369 errors cleared** |
| 2 | Added `printResolvedClasspath` audit task (also serves as the future sync-trigger/verification procedure) | `Geography/build.gradle` | `gradlew -q printResolvedClasspath` prints all 314 resolved entries for IDE-vs-CLI comparison |
| 3 | Removed ignored `java.jdt.ls.java.home` (LS needs Java 21+; verified the LS process runs the extension's embedded JRE `21.0.11`, while Gradle daemons correctly run JDK 17 via `java.import.gradle.java.home`) | `.vscode/settings.json` | Configuration no longer claims something false |
| 4 | Archived Repast-native Eclipse metadata + restore guide | `docs/eclipse/original-repast-metadata/` | Eclipse-compatibility path documented and recoverable |

## 6. Verification (post-repair)

- **VS Code diagnostics:** 0 Error. Remaining: ~77 Warnings + 1 Info across
  6 files — raw-type/unchecked-generics warnings (`Context`, `Geography`,
  `Network`, `RepastEdge` used raw — stock demo style), unused imports/locals,
  deprecated `File.toURL()`, one `TODO` marker. These are **identical in kind**
  to the warnings `gradlew compileJava` prints (BASELINE_RUN.md §1: "deprecated
  `File.toURL()` API, unchecked generics").
- **Compiler:** `gradlew compileJava` → BUILD SUCCESSFUL (unchanged).
- **Dependency parity:**

| Consumer | Resolution mechanism | Result |
|---|---|---|
| Gradle CLI | `build.gradle` fileTree over `%REPAST_HOME%\eclipse\plugins` | 314 entries (273 jars + 41 class dirs) |
| VS Code Java (JDT LS) | Buildship container fed by the same `build.gradle` | Same set (0 unresolved symbols post-sync) |
| Eclipse (Repast 2.11 bundle) | Buildship 3.1.9 Gradle import of the same `build.gradle` | Same set by construction |
| Repast runtime | `RepastMain` bootstrap + `user_path.xml` → `../bin` | Independent of IDE state; verified in BASELINE_RUN.md |
| GeoTools | jars inside `repast.simphony.gis*/lib` (26.6) | Identical files on every path above |

## 7. Remaining limitations

1. **Warnings are intentional debt, not errors.** The raw-generics and
   unused-import warnings live in stock demo code scheduled for removal or
   rewrite in roadmap commits 2–5 (`PROJECT_ASSESSMENT.md` Phase 4). They will
   be cleared by those commits rather than by a cosmetic sweep now.
2. **JDT compiles to `bin/main`–`bin/default`** (Buildship's output mapping)
   while Gradle compiles to `bin/` (the `user_path.xml` contract). Both are
   gitignored; the runtime only reads Gradle's output. Cosmetic only.
3. **Recurrence playbook:** if a future VS Code restart reproduces the lock
   race (mass problems in the Problems panel while `gradlew compileJava`
   passes), either make any edit to `build.gradle` and save (auto re-sync), or
   run *Command Palette → "Java: Clean the Java language server workspace"*.
   Verify with `gradlew -q printResolvedClasspath` — if the CLI prints the
   full jar list, the fault is on the editor side by definition.
4. **OneDrive working copy** (standing risk, `docs/setup/ENVIRONMENT_SETUP.md` §9): file
   event storms/locking increase the odds of exactly this class of race.
   Recommendation unchanged: move the clone outside OneDrive or pause sync
   during heavy IDE/simulation activity.
5. The `Failed to start Gradle Build Server` message recurs per session with
   this extension combination; it is benign (Buildship fallback) as long as a
   sync completes.

## 8. Do any unresolved issues affect execution?

**No.** The execution path (Gradle `compileJava` → `bin/` → `RepastMain` /
`RepastBatchMain` with the scenario's `user_path.xml`) never consults the
language server or the Eclipse project model. That is why the model compiled
and ran end-to-end (BASELINE_RUN.md) while the editor displayed 371 phantom
errors. Post-repair, editor and compiler agree, and the run path is unchanged.
