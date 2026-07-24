# Original Repast Eclipse project metadata (archived)

## What happened

When VS Code restarted on 2026-07-24, the Java Language Server (redhat.java
1.55.0) imported `Geography/` as a Gradle project via its embedded Buildship
engine and **rewrote** `Geography/.project` and `Geography/.classpath`:

| File | Before (Repast-native) | After (Buildship-managed) |
|---|---|---|
| `.classpath` | `REPAST_SIMPHONY_SUPPORT`, `GROOVY_SUPPORT`, `GROOVY_DSL_SUPPORT` containers, output `bin/` | `org.eclipse.buildship.core.gradleclasspathcontainer`, JavaSE-17 container, output `bin/main`+`bin/default` |
| `.project` | natures: `repast_simphony_nature`, statecharts nature, Groovy nature; builders: statecharts diagram builder + javabuilder | natures: javanature + `gradleprojectnature`; builders: javabuilder + `gradleprojectbuilder` |

The overwrite occurred **before the repository's first git commit existed**, so
the project's own originals are unrecoverable. The copies in this directory are
taken from the stock Repast Simphony 2.11.0 `models/Geography` demo
(`C:\Users\<you>\RepastSimphony-2.11.0\models\Geography`), which this project
was derived from; `PROJECT_ASSESSMENT.md` §1.1 records that the project's
`.classpath` line 6 carried the same `REPAST_SIMPHONY_SUPPORT` container.

Files are stored with `.xml` names so IDE importers do not mistake this docs
folder for a live Eclipse project:

- `classpath.xml` → restore as `Geography/.classpath`
- `project.xml`   → restore as `Geography/.project`

## Why we did NOT restore them in place

1. The VS Code Java Language Server rewrites them again on every Gradle import
   — restoring them while VS Code is the primary IDE just creates churn.
2. **Repast 2.11.0's bundled Eclipse ships Buildship 3.1.9** (verified:
   `org.eclipse.buildship.core_3.1.9.v20240115-1636.jar` in its
   `eclipse/plugins/`), so the Buildship-managed metadata still opens there:
   *File → Import → Gradle → Existing Gradle Project*. Dependency resolution
   goes through `build.gradle`, which resolves the identical Repast plugin
   jars from `REPAST_HOME`.
3. The runtime contract is unaffected either way: the model is launched via
   `RepastMain`/`RepastBatchMain` with classes compiled to `bin/` by Gradle
   (`Geography.rs/user_path.xml` loads from `../bin`).

What IS lost with the Buildship metadata: the Repast Eclipse **project
nature** conveniences (Repast menu wizards, statechart diagram builder,
agent-class auto-discovery hooks). None are used by this model's build or run
path today.

## How to restore the Repast-native metadata (if ever needed)

```powershell
Copy-Item docs/eclipse/original-repast-metadata/classpath.xml Geography/.classpath -Force
Copy-Item docs/eclipse/original-repast-metadata/project.xml   Geography/.project  -Force
```

Then open the project **only** in Repast's Eclipse (the containers resolve
nowhere else), and expect VS Code to rewrite the files again if the folder is
reopened there with the Java extension active.
