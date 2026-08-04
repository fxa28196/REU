/**
 * A deliberately small YAML reader and GitHub-expression evaluator, for tests
 * that assert on the STRUCTURE of `.github/workflows/*.yml`.
 *
 * ## Why this exists at all
 *
 * `websim-nightly.yml` was repaired from a single job that could report success
 * having executed nothing into three jobs whose conditions are exact complements
 * plus an `if: always()` verdict job. That repair was defended by **inspection
 * only**: no test in this tree read a workflow file, so reverting the YAML to its
 * inert form left `npm test`, `npm run ci` and `npm run test:strict` all green.
 * A property nothing can observe is not a property the repository holds.
 *
 * ## Why not a YAML dependency
 *
 * `websim` has five runtime dependencies and none of them parses YAML. Adding
 * `yaml` to satisfy one test would enlarge the supply chain of a project whose
 * whole claim is reproducibility from a lockfile, and the subset needed here is
 * small and closed: block mappings, block sequences, plain and quoted scalars,
 * and `|` / `>` block scalars. So this parses exactly that subset and **throws on
 * anything it does not understand** rather than guessing — a workflow that grows
 * a construct this reader cannot see turns the gate red and asks for attention,
 * which is the failure direction a gate is allowed to have.
 *
 * It is not a YAML implementation. It does not do anchors, aliases, flow
 * mappings, multi-document streams, tags or block-scalar indentation indicators,
 * and it treats every scalar as a string (no YAML 1.1 booleans, so the `on:` key
 * survives as `"on"` rather than becoming `true`). Every one of those omissions
 * is a *throw*, never a silent misparse.
 */

/** Everything a parsed workflow can be. Scalars are always strings. */
export type YamlNode = string | readonly YamlNode[] | YamlMap;
export interface YamlMap {
  readonly [key: string]: YamlNode;
}

interface Line {
  readonly indent: number;
  readonly text: string;
  /** 1-based, for error messages that name the offending line. */
  readonly no: number;
}

const BLOCK_SCALAR = /^[|>][+-]?$/u;
const KEY = /^([A-Za-z0-9_.-]+):(?:\s+(.*))?$/u;

/** Parse the workflow subset. Throws on any construct outside it. */
export function parseWorkflowYaml(source: string): YamlMap {
  const raw = source.replace(/\r\n/gu, "\n").split("\n");
  const lines: Line[] = raw.map((text, i) => ({
    indent: text.length - text.trimStart().length,
    text,
    no: i + 1,
  }));
  const state = { i: 0 };
  skipBlank(lines, state);
  if (state.i >= lines.length) {
    return {};
  }
  const value = parseBlock(lines, state, lines[state.i]!.indent, raw);
  skipBlank(lines, state);
  if (state.i < lines.length) {
    throw new Error(`workflow-yaml: trailing content at line ${lines[state.i]!.no}`);
  }
  if (typeof value === "string" || Array.isArray(value)) {
    throw new Error("workflow-yaml: a workflow's document root must be a mapping");
  }
  return value as YamlMap;
}

function skipBlank(lines: readonly Line[], state: { i: number }): void {
  while (state.i < lines.length) {
    const t = lines[state.i]!.text.trim();
    if (t.length > 0 && !t.startsWith("#")) {
      return;
    }
    state.i++;
  }
}

function parseBlock(
  lines: readonly Line[],
  state: { i: number },
  indent: number,
  raw: readonly string[],
): YamlNode {
  const first = lines[state.i]!;
  return first.text.trimStart().startsWith("- ") || first.text.trim() === "-"
    ? parseSequence(lines, state, indent, raw)
    : parseMapping(lines, state, indent, raw);
}

function parseMapping(
  lines: readonly Line[],
  state: { i: number },
  indent: number,
  raw: readonly string[],
): YamlMap {
  const out: Record<string, YamlNode> = {};
  for (;;) {
    skipBlank(lines, state);
    if (state.i >= lines.length) {
      break;
    }
    const line = lines[state.i]!;
    if (line.indent < indent) {
      break;
    }
    if (line.indent > indent) {
      throw new Error(`workflow-yaml: unexpected indentation at line ${line.no}: ${line.text}`);
    }
    const m = KEY.exec(line.text.trim());
    if (m === null) {
      throw new Error(`workflow-yaml: line ${line.no} is not a 'key: value' pair: ${line.text}`);
    }
    const key = m[1]!;
    const rest = (m[2] ?? "").trim();
    state.i++;
    out[key] = valueFor(lines, state, indent, rest, line, raw);
  }
  return out;
}

function valueFor(
  lines: readonly Line[],
  state: { i: number },
  indent: number,
  rest: string,
  at: Line,
  raw: readonly string[],
): YamlNode {
  if (BLOCK_SCALAR.test(rest)) {
    return readBlockScalar(lines, state, indent, raw);
  }
  if (rest.length > 0) {
    return scalar(rest, at);
  }
  // An empty value: either a nested block (more indented) or an empty mapping.
  const save = state.i;
  skipBlank(lines, state);
  if (state.i < lines.length && lines[state.i]!.indent > indent) {
    return parseBlock(lines, state, lines[state.i]!.indent, raw);
  }
  state.i = save;
  return "";
}

/**
 * A `|` / `>` block scalar: every following line more indented than the key,
 * verbatim, with the block's own indentation removed. Comments and colons inside
 * are content, not syntax — which is the whole reason a step's `run:` script has
 * to be read this way.
 */
function readBlockScalar(
  lines: readonly Line[],
  state: { i: number },
  indent: number,
  raw: readonly string[],
): string {
  const body: string[] = [];
  let blockIndent = -1;
  while (state.i < lines.length) {
    const line = lines[state.i]!;
    const blank = line.text.trim().length === 0;
    if (!blank && line.indent <= indent) {
      break;
    }
    if (!blank && blockIndent < 0) {
      blockIndent = line.indent;
    }
    body.push(blank ? "" : raw[line.no - 1]!.slice(blockIndent < 0 ? 0 : blockIndent));
    state.i++;
  }
  while (body.length > 0 && body[body.length - 1] === "") {
    body.pop();
  }
  return body.length === 0 ? "" : `${body.join("\n")}\n`;
}

function parseSequence(
  lines: readonly Line[],
  state: { i: number },
  indent: number,
  raw: readonly string[],
): readonly YamlNode[] {
  const out: YamlNode[] = [];
  for (;;) {
    skipBlank(lines, state);
    if (state.i >= lines.length) {
      break;
    }
    const line = lines[state.i]!;
    if (line.indent < indent) {
      break;
    }
    const trimmed = line.text.trim();
    if (!trimmed.startsWith("- ") && trimmed !== "-") {
      break;
    }
    if (line.indent > indent) {
      throw new Error(`workflow-yaml: unexpected indentation at line ${line.no}: ${line.text}`);
    }
    const itemIndent = indent + 2;
    const head = trimmed === "-" ? "" : trimmed.slice(2).trim();
    state.i++;
    if (head.length === 0) {
      skipBlank(lines, state);
      if (state.i < lines.length && lines[state.i]!.indent > indent) {
        out.push(parseBlock(lines, state, lines[state.i]!.indent, raw));
      } else {
        out.push("");
      }
      continue;
    }
    const m = KEY.exec(head);
    if (m === null) {
      // `- some scalar`
      out.push(scalar(head, line));
      continue;
    }
    // `- key: value`, possibly followed by sibling keys at itemIndent.
    const item: Record<string, YamlNode> = {};
    item[m[1]!] = valueFor(lines, state, itemIndent, (m[2] ?? "").trim(), line, raw);
    for (;;) {
      skipBlank(lines, state);
      if (state.i >= lines.length) {
        break;
      }
      const next = lines[state.i]!;
      if (next.indent !== itemIndent || next.text.trim().startsWith("- ")) {
        break;
      }
      const km = KEY.exec(next.text.trim());
      if (km === null) {
        throw new Error(`workflow-yaml: line ${next.no} is not a 'key: value' pair: ${next.text}`);
      }
      state.i++;
      item[km[1]!] = valueFor(lines, state, itemIndent, (km[2] ?? "").trim(), next, raw);
    }
    out.push(item);
  }
  return out;
}

/** A plain or quoted scalar, with any trailing `#` comment removed. */
function scalar(text: string, at: Line): string {
  if (text.startsWith('"')) {
    const end = text.indexOf('"', 1);
    if (end < 0) {
      throw new Error(`workflow-yaml: unterminated double-quoted scalar at line ${at.no}`);
    }
    return text.slice(1, end);
  }
  if (text.startsWith("'")) {
    const end = text.indexOf("'", 1);
    if (end < 0) {
      throw new Error(`workflow-yaml: unterminated single-quoted scalar at line ${at.no}`);
    }
    return text.slice(1, end);
  }
  if (text.startsWith("[") || text.startsWith("{")) {
    return flow(text, at);
  }
  const hash = text.search(/\s#/u);
  return (hash < 0 ? text : text.slice(0, hash)).trim();
}

/**
 * A one-line flow sequence, `[a, b]`, which is how `needs:` is written here. It
 * is returned joined by `,` rather than as an array so `scalar()` keeps one
 * return type; {@link needsOf} splits it. A flow MAPPING throws — nothing in
 * these workflows uses one and guessing would be worse than refusing.
 */
function flow(text: string, at: Line): string {
  if (text.startsWith("{")) {
    throw new Error(`workflow-yaml: flow mappings are not supported (line ${at.no})`);
  }
  const end = text.indexOf("]");
  if (end < 0) {
    throw new Error(`workflow-yaml: unterminated flow sequence at line ${at.no}`);
  }
  return text
    .slice(1, end)
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .join(",");
}

// --- reading the parsed tree -------------------------------------------------

export function asMap(node: YamlNode | undefined, what: string): YamlMap {
  if (node === undefined || typeof node === "string" || Array.isArray(node)) {
    throw new Error(`workflow-yaml: ${what} is not a mapping`);
  }
  return node as YamlMap;
}

export function asString(node: YamlNode | undefined): string | undefined {
  return typeof node === "string" ? node : undefined;
}

/** `needs: [a, b]` or `needs: a` → `["a", "b"]` / `["a"]`. */
export function needsOf(job: YamlMap): readonly string[] {
  const raw = job["needs"];
  if (raw === undefined) {
    return [];
  }
  if (typeof raw === "string") {
    return raw.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
  }
  if (Array.isArray(raw)) {
    return raw.filter((x): x is string => typeof x === "string");
  }
  return [];
}

/** Strip the `${{ … }}` wrapper GitHub conditions are usually written with. */
export function unwrapExpression(raw: string): string {
  const t = raw.trim();
  if (t.startsWith("${{") && t.endsWith("}}")) {
    return t.slice(3, -2).trim();
  }
  return t;
}

// --- the expression evaluator ------------------------------------------------

/**
 * Evaluate the closed subset of GitHub's expression language these conditions
 * use: `!`, `(`, `)`, `&&`, `||`, `==`, `!=`, single-quoted strings, dotted
 * context paths, and the zero-argument status functions `always()`,
 * `success()`, `failure()`, `cancelled()`. **Anything else throws.**
 *
 * That refusal is the point. The alternative — `new Function(expr)` — would run
 * whatever a workflow file happens to contain and would quietly accept a
 * rewritten condition whose complementarity this evaluator could no longer
 * verify. A throw makes such a rewrite visible.
 */
export function evaluateExpression(expr: string, context: Readonly<Record<string, unknown>>): boolean {
  const tokens = tokenise(expr);
  const state = { i: 0 };
  const value = parseOr(tokens, state, context);
  if (state.i !== tokens.length) {
    throw new Error(`workflow-expr: trailing token ${JSON.stringify(tokens[state.i])} in ${expr}`);
  }
  return truthy(value);
}

type Token = string;

function tokenise(expr: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < expr.length) {
    const c = expr[i]!;
    if (/\s/u.test(c)) {
      i++;
      continue;
    }
    if (c === "'") {
      const end = expr.indexOf("'", i + 1);
      if (end < 0) {
        throw new Error(`workflow-expr: unterminated string in ${expr}`);
      }
      out.push(expr.slice(i, end + 1));
      i = end + 1;
      continue;
    }
    const two = expr.slice(i, i + 2);
    if (two === "&&" || two === "||" || two === "==" || two === "!=") {
      out.push(two);
      i += 2;
      continue;
    }
    if (c === "(" || c === ")" || c === "!") {
      out.push(c);
      i++;
      continue;
    }
    const word = /^[A-Za-z0-9_.-]+/u.exec(expr.slice(i));
    if (word === null) {
      throw new Error(`workflow-expr: unsupported character ${JSON.stringify(c)} in ${expr}`);
    }
    out.push(word[0]);
    i += word[0].length;
    continue;
  }
  return out;
}

function parseOr(t: readonly Token[], s: { i: number }, ctx: Readonly<Record<string, unknown>>): unknown {
  let left = parseAnd(t, s, ctx);
  while (t[s.i] === "||") {
    s.i++;
    const right = parseAnd(t, s, ctx);
    left = truthy(left) ? left : right;
  }
  return left;
}

function parseAnd(t: readonly Token[], s: { i: number }, ctx: Readonly<Record<string, unknown>>): unknown {
  let left = parseCompare(t, s, ctx);
  while (t[s.i] === "&&") {
    s.i++;
    const right = parseCompare(t, s, ctx);
    left = truthy(left) ? right : left;
  }
  return left;
}

function parseCompare(
  t: readonly Token[],
  s: { i: number },
  ctx: Readonly<Record<string, unknown>>,
): unknown {
  const left = parseUnary(t, s, ctx);
  const op = t[s.i];
  if (op === "==" || op === "!=") {
    s.i++;
    const right = parseUnary(t, s, ctx);
    const equal = compare(left, right);
    return op === "==" ? equal : !equal;
  }
  return left;
}

function parseUnary(
  t: readonly Token[],
  s: { i: number },
  ctx: Readonly<Record<string, unknown>>,
): unknown {
  if (t[s.i] === "!") {
    s.i++;
    return !truthy(parseUnary(t, s, ctx));
  }
  return parsePrimary(t, s, ctx);
}

function parsePrimary(
  t: readonly Token[],
  s: { i: number },
  ctx: Readonly<Record<string, unknown>>,
): unknown {
  const tok = t[s.i];
  if (tok === undefined) {
    throw new Error("workflow-expr: unexpected end of expression");
  }
  if (tok === "(") {
    s.i++;
    const inner = parseOr(t, s, ctx);
    if (t[s.i] !== ")") {
      throw new Error("workflow-expr: unbalanced parentheses");
    }
    s.i++;
    return inner;
  }
  s.i++;
  if (tok.startsWith("'")) {
    return tok.slice(1, -1);
  }
  if (tok === "true" || tok === "false") {
    return tok === "true";
  }
  if (t[s.i] === "(") {
    // A status-check function. Only the zero-argument ones are supported, and
    // an unknown name throws rather than being read as `false` — a condition
    // this evaluator cannot model must not be silently treated as inactive.
    s.i++;
    if (t[s.i] !== ")") {
      throw new Error(`workflow-expr: ${tok}() takes no arguments in this subset`);
    }
    s.i++;
    return statusFunction(tok, ctx);
  }
  if (/^[A-Za-z_][A-Za-z0-9_.-]*$/u.test(tok)) {
    return resolvePath(tok, ctx);
  }
  throw new Error(`workflow-expr: unsupported token ${JSON.stringify(tok)}`);
}

/**
 * `always()` is unconditionally true — that is the whole reason a verdict job
 * uses it. `success()` / `failure()` / `cancelled()` read `status` from the
 * context so a caller can model them; absent a value they are `false`, which is
 * the conservative reading (a job that might not run).
 */
function statusFunction(name: string, ctx: Readonly<Record<string, unknown>>): boolean {
  if (name === "always") {
    return true;
  }
  if (name === "success" || name === "failure" || name === "cancelled") {
    return resolvePath("status", ctx) === name;
  }
  throw new Error(`workflow-expr: unsupported function ${name}()`);
}

function resolvePath(path: string, ctx: Readonly<Record<string, unknown>>): unknown {
  let node: unknown = ctx;
  for (const part of path.split(".")) {
    if (node === null || typeof node !== "object" || !(part in (node as object))) {
      return undefined;
    }
    node = (node as Record<string, unknown>)[part];
  }
  return node;
}

/** GitHub coerces across types when comparing; `undefined` equals `''`. */
function compare(a: unknown, b: unknown): boolean {
  const norm = (x: unknown): unknown => (x === undefined || x === null ? "" : x);
  const l = norm(a);
  const r = norm(b);
  if (typeof l === "boolean" || typeof r === "boolean") {
    return truthy(l) === truthy(r);
  }
  return String(l) === String(r);
}

function truthy(v: unknown): boolean {
  if (typeof v === "boolean") {
    return v;
  }
  if (v === undefined || v === null) {
    return false;
  }
  if (typeof v === "string") {
    return v.length > 0 && v !== "false";
  }
  return Boolean(v);
}
