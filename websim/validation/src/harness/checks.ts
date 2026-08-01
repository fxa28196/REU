/**
 * checks.ts — the self-printing check registry `verify_E_runs.py` uses.
 *
 * Transcribed from `scripts/verify_E_runs.py` lines 163–183 (`class Checks`).
 * Three statuses and no fourth: PASS, FAIL, and SKIP — where SKIP means *not
 * applicable to this run class*, never *could not be bothered*. The Python
 * prints each line as it is recorded so an operator watching a 6,842-row
 * comparison sees progress; the port keeps the same behaviour behind an
 * injectable {@link CheckLog} so the CLI can print while vitest stays quiet.
 *
 * The registry is the reason this port can be *tested* rather than merely run:
 * a gate returns a list of typed results, so a corrosion test can assert on the
 * exact check that went red instead of pattern-matching stdout.
 */

export type CheckStatus = "PASS" | "FAIL" | "SKIP";

export interface CheckResult {
  readonly name: string;
  readonly status: CheckStatus;
  /** The Python's `detail` string, one line. */
  readonly detail: string;
  /** The Python's `extra_lines`, printed indented under the check. */
  readonly lines: readonly string[];
}

/** Where a check line goes. Default is nowhere; the CLI passes `console.log`. */
export type CheckLog = (line: string) => void;

export class Checks {
  readonly #results: CheckResult[] = [];
  readonly #log: CheckLog;

  constructor(log: CheckLog = () => undefined) {
    this.#log = log;
  }

  /**
   * Record a PASS/FAIL. Returns `ok`, exactly like the Python, so a caller can
   * write `if (!ck.add(...)) return;`.
   */
  add(name: string, ok: boolean, detail = "", extraLines: readonly string[] = []): boolean {
    const status: CheckStatus = ok ? "PASS" : "FAIL";
    this.#results.push({ name, status, detail, lines: [...extraLines] });
    this.#log(`${status}  ${name}${detail === "" ? "" : `  --  ${detail}`}`);
    for (const line of extraLines) {
      this.#log(`        ${line}`);
    }
    return ok;
  }

  /** Record a SKIP. Always returns `true` — a skip is never a failure. */
  skip(name: string, why: string): boolean {
    this.#results.push({ name, status: "SKIP", detail: why, lines: [] });
    this.#log(`SKIP  ${name}  --  ${why}`);
    return true;
  }

  /**
   * An ungated observation line. The Python emits these with a bare `print`
   * (gate (l)'s P-SE5 line, gate (c)'s departure timing) precisely so they can
   * never be mistaken for checks; keeping them out of `results` preserves that.
   */
  observe(line: string): void {
    this.#log(`        ${line}`);
  }

  get results(): readonly CheckResult[] {
    return this.#results;
  }

  get failed(): readonly CheckResult[] {
    return this.#results.filter((c) => c.status === "FAIL");
  }

  get skipped(): readonly CheckResult[] {
    return this.#results.filter((c) => c.status === "SKIP");
  }

  get passed(): readonly CheckResult[] {
    return this.#results.filter((c) => c.status === "PASS");
  }

  /** `=== N passed, N failed, N skipped (N checks) ===`, as the Python prints. */
  summary(): string {
    return (
      `${this.passed.length} passed, ${this.failed.length} failed, ` +
      `${this.skipped.length} skipped (${this.#results.length} checks)`
    );
  }

  /** Every FAIL rendered as `name: detail`, for an assertion message. */
  failureReport(): string {
    return this.failed.map((c) => `  - ${c.name}: ${c.detail}`).join("\n");
  }
}
