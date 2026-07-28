#!/usr/bin/env python3
"""Render docs/final/PRESENTER_SCRIPT.md as a polished, print-ready HTML page.

Why a hand-rolled converter: neither `markdown`, `mistune` nor `pandoc` is
available here, and the requirement is specific -- code snippets must read as
CODE, not as body text. A generic converter gives plain <pre> and loses the one
thing that matters most in this document.

The output is meant to be used three ways from the same file:
  1. read on screen;
  2. Ctrl+P -> Save as PDF, with page breaks falling between slides;
  3. select-all, copy, paste into Google Docs -- rendered HTML survives that
     trip far better than Markdown does, code panels included.

Regenerate after editing the Markdown:
    python scripts/format_presenter_script.py
"""
import html
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parents[1]
SRC = ROOT / "docs/final/PRESENTER_SCRIPT.md"
OUT = ROOT / "docs/final/PRESENTER_SCRIPT_REFORMAT.html"

JAVA_KW = r"""\b(abstract|boolean|break|case|catch|class|continue|default|do|
double|else|enum|extends|final|finally|float|for|if|implements|import|instanceof|
int|interface|long|new|null|package|private|protected|public|return|static|super|
switch|this|throw|throws|try|void|while|true|false)\b"""
PY_KW = r"""\b(and|as|assert|break|class|continue|def|del|elif|else|except|False|
finally|for|from|global|if|import|in|is|lambda|None|nonlocal|not|or|pass|raise|
return|True|try|while|with|yield)\b"""


def highlight(code, lang):
    """Escape, then wrap tokens. Comments and strings win over keywords."""
    out = html.escape(code)
    holds = []

    # Placeholders must contain NO digits and no markup characters: a later pass
    # (the number regex) would otherwise match the index inside a placeholder and
    # wrap it in a second span, corrupting both. Private-use code points are safe.
    def hold(m, cls):
        holds.append(f'<span class="{cls}">{m.group(0)}</span>')
        return chr(0xE000 + len(holds) - 1)

    if lang in ("java", "python", "powershell", ""):
        if lang == "java":
            out = re.sub(r"/\*.*?\*/", lambda m: hold(m, "c"), out, flags=re.S)
            out = re.sub(r"//[^\n]*", lambda m: hold(m, "c"), out)
        else:
            out = re.sub(r"#[^\n]*", lambda m: hold(m, "c"), out)
        out = re.sub(r"&quot;(?:[^&]|&(?!quot;))*?&quot;", lambda m: hold(m, "s"), out)
        kw = JAVA_KW if lang == "java" else PY_KW
        out = re.sub(kw, lambda m: hold(m, "k"), out, flags=re.X)
        out = re.sub(r"\b\d[\d_.]*[LlFfDd]?\b", lambda m: hold(m, "n"), out)

    for i, span in enumerate(holds):
        out = out.replace(chr(0xE000 + i), span)
    return out


def inline(t):
    """Inline markdown -> HTML. Code spans are protected before anything else."""
    spans = []

    def keep(m):
        spans.append(f"<code>{html.escape(m.group(1))}</code>")
        return chr(0xE100 + len(spans) - 1)

    t = re.sub(r"`([^`]+)`", keep, t)
    t = html.escape(t)
    t = re.sub(r"\*\*\*(.+?)\*\*\*", r"<strong><em>\1</em></strong>", t)
    t = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", t)
    t = re.sub(r"(?<![\*\w])\*([^*\n]+?)\*(?!\*)", r"<em>\1</em>", t)
    t = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", r'<a href="\2">\1</a>', t)
    for i, s in enumerate(spans):
        t = t.replace(chr(0xE100 + i), s)
    return t


def convert(md):
    lines = md.split("\n")
    out, i = [], 0
    open_section = False
    while i < len(lines):
        ln = lines[i]

        if ln.startswith("```"):
            lang = ln[3:].strip().lower()
            i += 1
            buf = []
            while i < len(lines) and not lines[i].startswith("```"):
                buf.append(lines[i])
                i += 1
            i += 1
            label = {"java": "Java", "python": "Python",
                     "powershell": "PowerShell"}.get(lang, lang.title() or "Code")
            out.append(
                f'<figure class="code"><figcaption>{label}</figcaption>'
                f"<pre><code>{highlight(chr(10).join(buf), lang)}</code></pre></figure>")
            continue

        if ln.startswith("|") and i + 1 < len(lines) and re.match(
                r"^\|[\s:|-]+\|?\s*$", lines[i + 1]):
            head = [c.strip() for c in ln.strip().strip("|").split("|")]
            i += 2
            body = []
            while i < len(lines) and lines[i].startswith("|"):
                body.append([c.strip() for c in lines[i].strip().strip("|").split("|")])
                i += 1
            th = "".join(f"<th>{inline(c)}</th>" for c in head)
            tr = "".join("<tr>" + "".join(f"<td>{inline(c)}</td>" for c in r) + "</tr>"
                         for r in body)
            out.append(f'<div class="tw"><table><thead><tr>{th}</tr></thead>'
                       f"<tbody>{tr}</tbody></table></div>")
            continue

        m = re.match(r"^(#{1,4})\s+(.*)$", ln)
        if m:
            lvl, txt = len(m.group(1)), m.group(2)
            slide = re.match(r"^\[SLIDE\s+(\d+)\s*[—-]\s*(.+?)\]\s*(?:·\s*\*(.+?)\*)?\s*$", txt)
            if slide:
                num, title, timing = slide.group(1), slide.group(2), slide.group(3)
                badge = f'<span class="timing">{inline(timing)}</span>' if timing else ""
                if open_section:
                    out.append("</section>")
                open_section = True
                out.append(f'<section class="slide"><h2><span class="num">{num}</span>'
                           f"{inline(title)}{badge}</h2>")
            else:
                out.append(f"<h{lvl}>{inline(txt)}</h{lvl}>")
            i += 1
            continue

        if re.match(r"^---+\s*$", ln):
            out.append("<hr>")
            i += 1
            continue

        if ln.startswith(">"):
            buf = []
            while i < len(lines) and lines[i].startswith(">"):
                buf.append(lines[i].lstrip(">").strip())
                i += 1
            out.append(f"<blockquote>{inline(' '.join(buf))}</blockquote>")
            continue

        if re.match(r"^\s*([-*]|\d+\.)\s+", ln):
            ordered = bool(re.match(r"^\s*\d+\.", ln))
            tag = "ol" if ordered else "ul"
            items = []
            while i < len(lines) and (re.match(r"^\s*([-*]|\d+\.)\s+", lines[i])
                                      or (lines[i].startswith("  ") and lines[i].strip()
                                          and items)):
                if re.match(r"^\s*([-*]|\d+\.)\s+", lines[i]):
                    items.append(re.sub(r"^\s*([-*]|\d+\.)\s+", "", lines[i]))
                else:
                    items[-1] += " " + lines[i].strip()
                i += 1
            out.append(f"<{tag}>" + "".join(f"<li>{inline(x)}</li>" for x in items)
                       + f"</{tag}>")
            continue

        if not ln.strip():
            i += 1
            continue

        buf = []
        while i < len(lines) and lines[i].strip() and not re.match(
                r"^(#{1,4}\s|```|\||>|\s*([-*]|\d+\.)\s|---+\s*$)", lines[i]):
            buf.append(lines[i].strip())
            i += 1
        p = inline(" ".join(buf))
        cls = ""
        for key, c in (("What this does:", "does"), ("Why it&#x27;s here:", "why"),
                       ("Why it's here:", "why"), ("If they ask:", "ask")):
            if p.startswith(f"<strong>{key}</strong>"):
                cls = f' class="note {c}"'
        out.append(f"<p{cls}>{p}</p>")

    if open_section:
        out.append("</section>")
    return "\n".join(out)


CSS = """
:root{--ink:#14171a;--ink2:#41474e;--ink3:#767d85;--rule:#e3e1dc;--paper:#fff;
--accent:#b03a2e;--accent2:#1c5d8c;--codebg:#f6f5f1;--codeink:#23262a;
--kw:#8a3f8f;--str:#0f6b4f;--com:#7b8189;--num:#a8541c;}
*{box-sizing:border-box}
body{margin:0;background:#e9e7e2;color:var(--ink);
 font:16.5px/1.62 "Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif;}
.page{max-width:52rem;margin:0 auto;background:var(--paper);
 padding:clamp(1.6rem,4vw,3.6rem);box-shadow:0 0 40px rgba(0,0,0,.09);}
h1,h2,h3,h4{font-family:"Segoe UI",system-ui,-apple-system,Helvetica,Arial,sans-serif;}
h1{font-size:2.3rem;line-height:1.12;letter-spacing:-.02em;margin:0 0 .3rem;}
h2{font-size:1.5rem;letter-spacing:-.015em;margin:0 0 1.1rem;display:flex;
 align-items:baseline;gap:.7rem;flex-wrap:wrap;}
h3{font-size:1.12rem;letter-spacing:-.01em;margin:2rem 0 .5rem;}
h4{font-size:.95rem;margin:1.4rem 0 .4rem;}
p{margin:0 0 .95rem;}
a{color:var(--accent2);}
strong{font-weight:640;color:#000;}
hr{border:0;border-top:1px solid var(--rule);margin:2.4rem 0;}
blockquote{margin:1.3rem 0;padding:.7rem 0 .7rem 1.1rem;border-left:3px solid var(--accent);
 font-family:"Segoe UI",system-ui,sans-serif;font-size:1.06rem;font-weight:600;
 line-height:1.45;color:#000;}
ul,ol{margin:0 0 1rem;padding-left:1.35rem;}li{margin:.3rem 0;}
code{font-family:ui-monospace,"Cascadia Mono",Consolas,"SF Mono",monospace;
 font-size:.86em;background:var(--codebg);padding:.12em .36em;border-radius:3px;
 border:1px solid #e6e4de;}
section.slide{margin-top:2.2rem;}
section.slide h2 .num{display:inline-flex;align-items:center;justify-content:center;
 min-width:2rem;height:2rem;border-radius:50%;background:var(--accent);color:#fff;
 font-size:.95rem;font-weight:700;flex:none;}
.timing{font-family:ui-monospace,Consolas,monospace;font-size:.72rem;font-weight:400;
 color:var(--ink3);border:1px solid var(--rule);border-radius:20px;padding:.15rem .6rem;
 white-space:nowrap;}
figure.code{margin:1.2rem 0 1.5rem;border:1px solid #ddd9d0;border-radius:6px;
 overflow:hidden;background:var(--codebg);page-break-inside:avoid;break-inside:avoid;}
figure.code figcaption{font-family:"Segoe UI",system-ui,sans-serif;font-size:.68rem;
 letter-spacing:.13em;text-transform:uppercase;color:var(--ink3);
 padding:.42rem .85rem;background:#efede7;border-bottom:1px solid #ddd9d0;}
figure.code pre{margin:0;padding:.9rem 1rem;overflow-x:auto;}
figure.code code{font-size:.79rem;line-height:1.66;background:none;border:0;padding:0;
 color:var(--codeink);white-space:pre;display:block;}
.k{color:var(--kw);font-weight:600;} .s{color:var(--str);}
.c{color:var(--com);font-style:italic;} .n{color:var(--num);}
p.note{padding:.7rem .95rem;border-radius:5px;margin:.55rem 0;font-size:.97rem;
 border-left:3px solid;}
p.does{background:#f2f7fb;border-color:var(--accent2);}
p.why{background:#f6f3f8;border-color:#8a3f8f;}
p.ask{background:#fbf6ee;border-color:#b8791f;}
.tw{overflow-x:auto;margin:1.1rem 0 1.4rem;border:1px solid var(--rule);border-radius:5px;}
table{border-collapse:collapse;width:100%;font-family:"Segoe UI",system-ui,sans-serif;
 font-size:.86rem;}
th,td{padding:.5rem .75rem;text-align:left;border-bottom:1px solid var(--rule);
 vertical-align:top;}
thead th{background:#f4f2ed;font-size:.7rem;letter-spacing:.06em;text-transform:uppercase;
 color:var(--ink3);font-weight:600;}
tbody tr:last-child td{border-bottom:0;}
tbody tr:nth-child(even){background:#faf9f6;}
@media print{
 body{background:#fff;font-size:10.5pt;}
 .page{max-width:none;box-shadow:none;padding:0;}
 section.slide{page-break-before:always;break-before:page;}
 section.slide:first-of-type{page-break-before:auto;break-before:auto;}
 figure.code,blockquote,table,p.note{page-break-inside:avoid;break-inside:avoid;}
 h2,h3{page-break-after:avoid;break-after:avoid;}
 a{color:inherit;text-decoration:none;}
 @page{margin:16mm 14mm;}
}
"""

md = SRC.read_text(encoding="utf-8")
body = convert(md)
OUT.write_text(
    "<!doctype html><html lang=en><head><meta charset=utf-8>"
    "<meta name=viewport content='width=device-width,initial-scale=1'>"
    "<title>Presenter's Script &mdash; Wildfire Smoke Shelter Access</title>"
    f"<style>{CSS}</style></head><body><div class=page>{body}</div></body></html>",
    encoding="utf-8")

print(f"wrote {OUT}  ({OUT.stat().st_size/1024:.0f} KB)")
print(f"  slide sections: {body.count('<section class=')}")
print(f"  code blocks:    {body.count('<figure class=')}")
print(f"  tables:         {body.count('<table>')}")
print(f"  callouts:       {body.count('class=' + chr(34) + 'note')}")
