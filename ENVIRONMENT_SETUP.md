# Environment Setup — Wildfire Smoke Shelter ABM (Repast Simphony)

Reproducible development environment for the `Geography` Repast Simphony model,
developed primarily in **VS Code + Claude Code** (Eclipse remains optional).

Verified on Windows 11 Home, 2026-07-24. No administrator rights required —
every component installs per-user.

---

## 1. Required software

| # | Software | Version (verified) | Why it is needed | Install method |
|---|----------|--------------------|------------------|----------------|
| 1 | **Temurin OpenJDK 17 (LTS)** | 17.0.19+10 | Compiles and runs the model. Repast 2.11.0 itself ships a JustJ JRE 17.0.10 inside its Eclipse, and the model's last recorded run used JRE 17 (`Geography/hs_err_pid5412.log`), so 17 is the proven-compatible major version. A full JDK (not JRE) is required for `javac` and the VS Code language server. | Portable zip — extract, no installer: [adoptium.net](https://adoptium.net/temurin/releases/?version=17) → Windows x64 JDK `.zip` → extract to `C:\Users\<you>\tools\jdk-17.0.19+10` |
| 2 | **Repast Simphony** | **2.11.0** | The simulation framework: engine, scheduler, GIS projections (bundled GeoTools + JTS), runtime GUI, displays. Not available on Maven Central — the local installation is the dependency repository. | `Repast-Simphony-2.11.0-win64.exe` from [GitHub releases (tag v.2.11.0)](https://github.com/Repast/repast.simphony/releases). Silent install: `Repast-Simphony-2.11.0-win64.exe /S /D=C:\Users\<you>\RepastSimphony-2.11.0` (NSIS installer; `/D` must be last and unquoted) |
| 3 | **Gradle** (via checked-in wrapper) | 8.14.3 | Modern build: compiles `src/` → `bin/`, resolves the Repast jar classpath, and provides the `runModel` launch task VS Code uses. Fresh clones need **no manual Gradle install** — `Geography/gradlew.bat` bootstraps itself (requires only JAVA_HOME). | Nothing to install; wrapper is committed (`Geography/gradle/wrapper/`) |
| 4 | **VS Code** | ≥ 1.129 | Primary IDE. | [code.visualstudio.com](https://code.visualstudio.com) (already present on this machine) |
| 5 | **VS Code "Extension Pack for Java"** | vscjava.vscode-java-pack (redhat.java 1.55.0, vscode-java-debug, vscode-gradle 3.18.0, …) | Java IntelliSense/errors, Gradle import, JDWP debugger for breakpoints in agent code. | `code --install-extension vscjava.vscode-java-pack` |
| 6 | **Git** | any recent | Version control for the staged research-commit workflow. | Already present (Git for Windows) |
| 7 | *(Optional)* **Eclipse w/ Repast** | bundled in #2 | The Repast installer includes its own Eclipse (`RepastSimphony-2.11.0\eclipse\eclipse.exe`) with the Repast wizards/editors. Optional — the VS Code workflow below does not require it, and `.project`/`.classpath` are preserved so the project still opens there. | Included with #2 |

### Version notes

- `Geography.rs/scenario.xml` is stamped `simphonyVersion="2.8.0"` — the version that
  *created* the scenario. The recorded working run (`hs_err_pid5412.log` command line)
  used a **2.11.0** installation (`…\RepastSimphony-2.11.0\models\Geography`), which
  opens 2.8 scenarios. Target 2.11.0.
- Java > 17 is untested with Repast 2.11.0's Eclipse/JOGL stack; stay on 17 LTS.

## 2. Environment variables

| Variable | Value (this machine) | Consumed by |
|---|---|---|
| `JAVA_HOME` | `C:\Users\Chick\tools\jdk-17.0.19+10` | `gradlew.bat`, `scripts/run-model.ps1` |
| `REPAST_HOME` | `C:\Users\Chick\RepastSimphony-2.11.0` | `Geography/build.gradle`, `scripts/run-model.ps1` (both default to `%USERPROFILE%\RepastSimphony-2.11.0` if unset) |

Alternative to `REPAST_HOME`: create `Geography/gradle.properties` (gitignored) with
`repastHome=C:/Users/<you>/RepastSimphony-2.11.0`.

## 3. Required JVM arguments

Copied verbatim from the project's Eclipse launcher (`Geography/launchers/Geography
Model.launch`) and the recorded run; already encoded in `build.gradle` and
`scripts/run-model.ps1` — listed here for reference:

```
-XX:+IgnoreUnrecognizedVMOptions
--add-opens=java.base/java.lang.reflect=ALL-UNNAMED
--add-modules=ALL-SYSTEM
--add-exports=java.base/jdk.internal.ref=ALL-UNNAMED
--add-exports=java.desktop/sun.awt=ALL-UNNAMED
--add-exports=java.base/java.lang=ALL-UNNAMED
--add-opens=java.base/java.util=ALL-UNNAMED
--add-exports=java.xml/com.sun.org.apache.xpath.internal.objects=ALL-UNNAMED
--add-exports=java.xml/com.sun.org.apache.xpath.internal=ALL-UNNAMED
--add-opens=java.base/java.lang=ALL-UNNAMED
-Xmx4g        (added: the 112,070-feature street layer OOMed on the default heap)
```

Main class: `repast.simphony.runtime.RepastMain`, single argument = absolute path to
`Geography/Geography.rs`. Launch classpath = `<REPAST_HOME>\eclipse\plugins\
repast.simphony.runtime_2.11.0\bin` + `…\lib\*` (Repast bootstraps every other
plugin itself). Working directory must be `Geography/` (the model loads
`./data/Streets.shp` relatively).

## 4. Build system decision (Eclipse metadata: preserved; Gradle: added)

**Investigated:** the project uses Eclipse project files (`.project`, `.classpath`
with `REPAST_SIMPHONY_SUPPORT`/`GROOVY_SUPPORT` containers), Repast `.launch`
launchers, and a stock Ant script only inside `installer/` (model distribution, not
build). No Maven, no Gradle, no custom build scripts existed.

**Decision:**

- `.project` / `.classpath` / `launchers/` — **preserved untouched.** The Eclipse
  containers only resolve inside Repast's own Eclipse; deleting them would break the
  mentor's/lab's ability to open the project there.
- **Gradle added alongside** (`Geography/build.gradle` + wrapper) as the build VS Code
  uses. It compiles to the same `bin/` directory the scenario's `user_path.xml`
  expects, so Eclipse and Gradle builds are interchangeable.
- **Maven/Gradle dependency management limitation (documented):** Repast Simphony has
  no Maven Central coordinates. Dependencies therefore cannot be declared as
  `group:artifact:version`; `build.gradle` resolves them as a `fileTree` over the
  local installation's `eclipse/plugins/` directory, selected by pattern
  (`repast.simphony.*`, `libs.*`, `saf.*`, `groovy*`). This is the cleanest possible
  setup given the framework's distribution model.

## 5. Dependency inventory

Everything below ships **inside** the Repast 2.11.0 installation (`eclipse/plugins/`);
none are fetched separately.

| Dependency | Version | Purpose | Installation method |
|---|---|---|---|
| `repast.simphony.runtime` | 2.11.0 | Bootstrap classpath; `RepastMain`; runtime GUI | bundled in Repast install |
| `repast.simphony.core` | 2.11.0 | Contexts, schedulers (`@ScheduledMethod`), `RandomHelper`, parameters | bundled |
| `repast.simphony.gis` (+ `gis.visualization`) | 2.11.0 | `Geography` projection, `GeographyWithin`/`IntersectsQuery`, GIS displays | bundled |
| GeoTools (inside gis plugin `lib/`) | as bundled | Shapefile I/O (`ShapefileDataStore`), CRS reprojection (`ReprojectingFeatureCollection`) | bundled |
| JTS (`org.locationtech.jts`) | as bundled | Geometry math (points, lines, distance) used throughout agent code | bundled |
| `repast.simphony.dataLoader` | 2.11.0 | `ContextBuilder` interface → `ContextCreator` entry point | bundled |
| `repast.simphony.data*` | 2.11.0 | Data-set/outputter framework (currently unused; needed for Phase-5 logging) | bundled |
| Groovy (`org.codehaus.groovy`) | as bundled | Required by Repast runtime internals (project has no Groovy sources) | bundled |
| `saf.core.runtime`, `libs.*` | as bundled | Repast plugin framework + UI libs the runtime loads | bundled |

## 6. Geographic data setup (verified)

**Rule respected: no original research data modified or deleted.** `Streets.zip` at
the repo root is untouched; its contents were *extracted* (copy) into `Geography/data/`.

| Item | Verified state |
|---|---|
| `Geography/data/Streets.shp/.shx/.dbf/.prj/.cpg` | Extracted from `Streets.zip`; **112,070** polyline features (confirmed via `.shx` record math and `.dbf` header) |
| Streets CRS | `WGS_1984_Web_Mercator_Auxiliary_Sphere` (Web Mercator, EPSG:3857, metres). The model reprojects to WGS84 at load (`ContextCreator.loadFeaturesFromShapefile`, `ReprojectingFeatureCollection`) — **required**, and present. |
| Streets attributes | Real schema incl. `STREETNAME`, `FULL_NAME`, `LENGTH`, `Shape_Leng`, `PREFIX/FTYPE`, `LCITY/RCITY`, and **`PDX_F_NODE`/`PDX_T_NODE`** (street-graph node IDs — Portland Metro RLIS street centerline schema; enables true network routing later without geometric snapping) |
| Stock demo layers (`Zones2`, `WaterLines`, `Agents2`, `CookCounty`, GeoTIFFs) | Present in `Geography/data/`; all in WGS84 lat/lon; **not loaded** by current code (loads commented out) — retained untouched |
| Shelter locations | **No data file exists.** The 5 shelters are generated in code at arbitrary street vertices (`ContextCreator.java:102-115`) — real locations are a scientific-phase deliverable (see `PROJECT_ASSESSMENT.md` R3) |
| Display CRS | Repast GIS display renders the WGS84 geography; scenario display configs unchanged |

Fresh-clone data step: `unzip Streets.zip -d Geography/data/` **or** rely on the
tracked `Geography/data/Streets.*` files (they are committed; the zip is gitignored
as redundant).

## 7. How to verify the installation

Run each from a fresh terminal:

```powershell
# 1. JDK
& "C:\Users\Chick\tools\jdk-17.0.19+10\bin\java.exe" -version
#    → openjdk version "17.0.19"

# 2. Repast present
Test-Path "$env:USERPROFILE\RepastSimphony-2.11.0\eclipse\plugins"
#    → True  (and a repast.simphony.runtime_2.11.0 folder inside)

# 3. Compile the model
cd Geography
$env:JAVA_HOME = "C:\Users\Chick\tools\jdk-17.0.19+10"
.\gradlew.bat compileJava
#    → BUILD SUCCESSFUL, classes in Geography\bin

# 4. Launch the GUI
.\gradlew.bat runModel
#    → Repast Simphony runtime window opens; press ⏻ (Initialize), then Run.

# 5. VS Code
code <repo root>   # Java extension imports the Gradle project; no red squiggles in src/
```

## 8. Launching & debugging from VS Code

| Action | How |
|---|---|
| Compile | `Ctrl+Shift+B` (default build task → `gradlew compileJava`) |
| Run simulation | Terminal → Run Task → **Repast: Run GUI** |
| Debug agent code | Run Task → **Repast: Run GUI (wait for debugger on :5005)**, then F5 with **Attach to Repast (localhost:5005)**; set breakpoints in `Geography/src/**` |
| See compile errors | Problems panel (language server, live) or the build task output |
| Launch a different scenario | Duplicate the `runModel` task or pass another `.rs` path to `scripts/run-model.ps1` |
| No-Gradle fallback | `powershell -File scripts\run-model.ps1 [-CompileOnly] [-DebugJvm]` |

## 9. Known environment caveats

1. **OneDrive**: the working copy lives under OneDrive. Pause syncing during long
   simulations (file-lock contention with `.rs` state and large shapefiles), or move
   the clone outside OneDrive.
2. **Heap**: keep `-Xmx4g` until the street layer is spatially indexed / thinned
   (see `PROJECT_ASSESSMENT.md`, risk register) — the prior OOM crash is on record.
3. **GUI-only runtime**: `RepastMain` opens the interactive runtime; batch/headless
   runs use Repast's batch machinery (`batch/batch_params.xml`, currently an empty
   stock sweep) and will be wired up in the sensitivity-analysis phase.
4. The stock demo jars/plugins inside the Repast install cover **all** current model
   imports; the project itself has zero third-party dependencies of its own
   (`Geography/lib/` is empty apart from the stock ReadMe).
