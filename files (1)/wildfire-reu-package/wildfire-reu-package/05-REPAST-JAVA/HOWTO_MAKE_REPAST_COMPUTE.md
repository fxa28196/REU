# Making Repast Simphony actually compute and output data

Four Java files, then five minutes of GUI wiring. The GUI part is the bit
nobody tells you about: **Repast writes no output files unless you explicitly
declare a Data Set and attach a File Sink.** You can run a perfect model for
288 ticks and get zero files.

---

## Step 1 — Drop in the Java files

Copy all four into `src/wildfire/` in your Eclipse project:

```
src/wildfire/SimData.java            data in
src/wildfire/Shelter.java            capacity, registry
src/wildfire/UnshelteredAgent.java   the step that accumulates  <- the compute
src/wildfire/WildfireBuilder.java    context builder
```

Delete (or just stop referencing) the demo's old builder and agent.

**If the JTS imports go red**, you are on Repast <= 2.6. Change
`org.locationtech.jts.*` to `com.vividsolutions.jts.*` in `UnshelteredAgent.java`
and `WildfireBuilder.java`. That is the only version-dependent line.

---

## Step 2 — Put the data where Repast looks

Repast's working directory is the **project root**, not `src/`.

```
your-eclipse-project/
├── repast_data/               <- HERE
│   ├── nodes.csv
│   ├── shelters.csv
│   ├── agents_initial.csv
│   └── pm25_by_node_hour.csv
├── src/wildfire/
└── ...
```

Generate them with `bootstrap_data.py`, or export from your Python pipeline.

`pm25_by_node_hour.csv` is long format:

```
node_id,hour,pm25
0,0,12.4
0,1,15.8
...
```

If you only have a single county-wide hourly series, write the same value for
every node. That is a legitimate simplification — state it in the chapter.

**Test the path first.** If you get `FileNotFoundException`, add this to
`build()` temporarily:

```java
System.out.println("CWD = " + new java.io.File(".").getAbsolutePath());
```

---

## Step 3 — Point the scenario at your builder

Run the model once. In the **Scenario Tree** (left panel of the runtime GUI):

1. Right-click **Data Loaders** → **Set Data Loader**
2. Choose **Custom ContextBuilder Loader**
3. Class: `wildfire.WildfireBuilder`
4. Save the scenario

---

## Step 4 — Declare a Data Set  ← this is the missing piece

Still in the Scenario Tree:

1. Right-click **Data Sets** → **Add Data Set**
2. Choose **Agent Data Set**
3. Name it `agent_output`
4. **Agent Class**: `wildfire.UnshelteredAgent`
5. On the method-selection page, tick the getters you want logged:
   - `getAgentId`
   - `getCumulativePm25`
   - `getCumulativeVwe`
   - `getHoursSheltered`
   - `getHoursAboveThreshold`
   - `getAgeBin`
   - `getComorbidity`
   - `getCombinedWeight`
6. Finish

**Anything without a public getter cannot be logged.** That is why
`UnshelteredAgent` has that block of getters at the bottom.

Optionally add a second **Aggregate Data Set** on `wildfire.Shelter` with
`getOccupancy` and `getUtilisation` to chart shelter fill live.

---

## Step 5 — Attach a File Sink  ← this is what writes the CSV

1. Right-click **Text Sinks** (in some versions: **Outputters**) → **Add File Sink**
2. **Data Set**: `agent_output`
3. **File name**: `output/agent_output.csv`
4. **Format**: `TABULAR` (one row per agent per tick)
5. Tick every column you want written
6. Finish, then **save the scenario**

Run the model. `output/agent_output.csv` appears in the project root.

---

## Step 6 — Verify it computed

```bash
head -3 output/agent_output.csv
wc -l output/agent_output.csv     # expect n_agents * n_ticks + 1
```

If `cumulativePm25` is all zeros, `pm25At()` is returning 0 — your
`pm25_by_node_hour.csv` node ids don't match `nodes.csv`.

If every agent has identical values, `awareness_prob` is 0 or no shelter is in
range. Print `Shelter.nearestAvailable(...)` for one agent to check.

---

## Step 7 — Batch sweep (this is where Repast beats Mesa)

This is genuinely a strength worth putting in your Methods and worth showing
your mentor.

1. In the Parameters panel, add parameters you want swept, e.g.
   `awarenessProb` (double), `maxTravelM` (double)
2. **Run → Batch Run Configuration**
3. Define the sweep, e.g. `awarenessProb` from 0.3 to 0.7 step 0.2
4. Set replications (different random seeds) — 5 or 10
5. Run

Repast executes every combination and writes one CSV per run. Reporting
*"swept across N parameter combinations with M replications each"* is a
stronger Methods sentence than a single hand-run simulation, and the
infrastructure is already built — you are just configuring it.

---

## Analysing the output

`agent_output.csv` is tabular. In Python:

```python
import pandas as pd
df = pd.read_csv("output/agent_output.csv")

final = df.sort_values("tick").groupby("agentId").tail(1)

print("mean cumulative PM2.5:", final.cumulativePm25.mean())
print("mean cumulative VWE  :", final.cumulativeVwe.mean())
print("mean hours sheltered :", final.hoursSheltered.mean())

# Gini
import numpy as np
def gini(x):
    x = np.sort(np.asarray(x, float)); n = x.size
    return float((2*np.sum(np.arange(1,n+1)*x)/(n*np.sum(x))) - (n+1)/n)

print("Gini(PM2.5):", gini(final.cumulativePm25))
print("Gini(VWE)  :", gini(final.cumulativeVwe))

# exposure by vulnerability stratum -- a good figure
print(final.groupby("comorbidity").cumulativeVwe.mean())
```

---

## The three bugs you will hit

1. **Agents render in the ocean.** JTS `Coordinate(x, y)` is `(lon, lat)`.
   Commented in `moveToNode()`.
2. **`FileNotFoundException: repast_data/nodes.csv`.** Working directory is the
   project root, not `src/`. Print the absolute path to confirm.
3. **Shelter occupancy grows forever across batch runs.** You dropped
   `Shelter.clearRegistry()` from `build()`. Repast reuses the JVM, so static
   state leaks between runs.

---

## Order to do this in tonight

1. Files in, project compiles (~30 min, most of it JTS imports)
2. `repast_data/` present, one run completes without exception (~30 min)
3. Data Set + File Sink wired, CSV appears (~15 min)
4. One status-quo run at your real agent count → **your first real numbers**
5. Batch sweep if time allows

Step 4 is the one that ends the "no results" problem.
