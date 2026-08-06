#!/usr/bin/env python3
"""Scaffold an on-brand HISD starter for a chosen medium.

Usage:  python3 scaffold.py <medium> [name] [--out DIR]
Mediums: web-page | email | report | deck | powerbi

Writes a starter already wired to the HISD tokens (light + dark), the logo lockup,
and the type system, plus a copy of hisd-theme.css where one is needed. Then refine
it with reference/Media-Playbooks.md.
"""
import sys, os, shutil, argparse, glob

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.normpath(os.path.join(HERE, "..", "assets"))

LOGO = '<img src="hisd-logo.svg" alt="Houston ISD" class="hisd-logo">'
FONTS = '<!-- brand fonts self-hosted via hisd-theme.css @font-face — no external CDN -->'
# Per medium: white logo on the teal header/title; the colored logo on the white report.
LOGO_FILE = {"web-page": "full-white.svg", "deck": "full-white.svg", "report": "full-dark-grey-teal.svg"}

WEB = f"""<!doctype html>
<html lang="en" data-theme-source="system">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>{{name}}</title>{FONTS}
<link rel="stylesheet" href="hisd-theme.css">
<style>
  body{{margin:0;background:var(--color-bg);color:var(--color-text);font-family:var(--font-sans);line-height:var(--leading-normal)}}
  header{{display:flex;align-items:center;gap:.6rem;padding:var(--space-4) var(--space-6);background:var(--color-brand);color:#fff}}
  header .logo{{display:flex;align-items:center}} .hisd-logo{{height:1.7rem;width:auto}}
  main{{max-width:880px;margin:0 auto;padding:var(--space-8) var(--space-6)}}
  h1{{font-family:var(--font-display);font-size:var(--text-4xl);line-height:var(--leading-tight)}}
  .card{{background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-lg);
        padding:var(--space-6);box-shadow:var(--shadow-2)}}
  .btn{{font:inherit;font-weight:600;border:none;border-radius:var(--radius-pill);padding:.6rem 1.15rem;
       background:var(--color-action);color:var(--color-on-action);cursor:pointer}}
  .btn:focus-visible{{outline:3px solid var(--color-focus);outline-offset:2px}}
  .toggle{{margin-left:auto;background:rgba(255,255,255,.15);color:#fff;border:none;border-radius:var(--radius-pill);padding:.4rem .8rem;cursor:pointer}}
</style></head>
<body>
<header><span class="logo">{LOGO}</span>
  <button class="toggle" onclick="var h=document.documentElement;h.dataset.theme=(h.dataset.theme==='dark'?'light':'dark')">Toggle theme</button>
</header>
<main>
  <h1>{{name}}</h1>
  <p>On-brand starter. Edit me, then follow <code>reference/Media-Playbooks.md</code>.</p>
  <div class="card"><h2>Card</h2><p>Surfaces, type, and color all come from the HISD tokens.</p>
    <button class="btn">Primary action</button></div>
</main>
</body></html>
"""

EMAIL = f"""<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>{{name}}</title></head>
<body style="margin:0;background:#F6F7F7;font-family:'Radio Canada',Arial,sans-serif;color:#19282C">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff">
  <tr><td style="background:#00A3AF;color:#fff;padding:20px 24px;font-family:'Parkinsans',Arial,sans-serif;font-weight:800;font-size:20px">HISD</td></tr>
  <tr><td style="padding:24px">
    <h1 style="font-family:'Parkinsans',Arial,sans-serif;color:#19282C;margin:0 0 12px">{{name}}</h1>
    <p style="font-size:16px;line-height:1.5">On-brand HTML email starter. Use inline styles and hex from the tokens; test in light and dark clients.</p>
    <a href="#" style="display:inline-block;background:#037882;color:#fff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:999px">Take action</a>
  </td></tr>
  <tr><td style="padding:16px 24px;background:#F2F2F2;color:#4B5C5F;font-size:12px">Houston Independent School District</td></tr>
</table></td></tr></table></body></html>
"""

REPORT = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>{{name}}</title>{FONTS}
<link rel="stylesheet" href="hisd-theme.css">
<style>
  body{{margin:0;background:#fff;color:var(--color-text);font-family:var(--font-serif);line-height:var(--leading-relaxed)}}
  /* The Ribbon header — canonical field + white strokes device (teal field, white strokes, render under content). */
  .ribbon{{aspect-ratio:1920 / 96;min-height:14px;
        background:var(--ribbon-field-bg, #00A3AF) url('assets/ribbon/ribbon-field.svg') center / cover no-repeat}}
  .page{{max-width:760px;margin:0 auto;padding:var(--space-10) var(--space-6)}}
  h1,h2{{font-family:var(--font-display);color:var(--color-brand)}}
  h1{{font-size:var(--text-4xl)}} h2{{font-size:var(--text-2xl);margin-top:2rem}}
  .meta{{font-family:var(--font-sans);color:var(--color-text-muted);font-size:var(--text-sm)}}
  table{{width:100%;border-collapse:collapse;font-family:var(--font-sans)}}
  th{{background:var(--color-brand);color:#fff;text-align:left;padding:.5rem .7rem}}
  td{{border-bottom:1px solid var(--color-border);padding:.5rem .7rem}}
  .hisd-logo{{height:40px;width:auto;margin-bottom:.6rem}}
  @media print{{ .ribbon{{-webkit-print-color-adjust:exact;print-color-adjust:exact}} }}
</style></head>
<body><div class="ribbon"></div>
<div class="page">
  {LOGO}
  <h1>{{name}}</h1><p class="meta">Houston Independent School District · Report</p>
  <h2>Section</h2><p>On-brand report starter — Parkinsans headings, Lora body, the Ribbon header. Use CMYK/Pantone for press.</p>
  <table><tr><th>Metric</th><th>Value</th></tr><tr><td>Example</td><td>123</td></tr></table>
</div></body></html>
"""

DECK = f"""<!doctype html>
<html lang="en" data-theme-source="system"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>{{name}}</title>{FONTS}<link rel="stylesheet" href="hisd-theme.css">
<style>
  body{{margin:0;font-family:var(--font-sans);background:var(--color-bg);color:var(--color-text)}}
  .slide{{height:100vh;scroll-snap-align:start;display:flex;flex-direction:column;justify-content:center;padding:8vh 10vw;box-sizing:border-box}}
  html{{scroll-snap-type:y mandatory;overflow-y:scroll}}
  .title{{background:var(--color-brand);color:#fff}}
  .title h1{{font-family:var(--font-display);font-size:6vw;margin:0}}
  h2{{font-family:var(--font-display);font-size:4vw;color:var(--color-brand)}}
  .hisd-logo{{height:7vh;width:auto}}
</style></head>
<body>
  <section class="slide title"><div>{LOGO}</div><h1>{{name}}</h1><p style="font-family:var(--font-serif);font-size:2vw">Subtitle</p></section>
  <section class="slide"><h2>One idea per slide</h2><p style="font-size:1.6vw">Large type, teal accents, the Ribbon as a divider.</p></section>
</body></html>
"""

TEMPLATES = {"web-page": (WEB, ".html", True), "email": (EMAIL, ".html", False),
             "report": (REPORT, ".html", True), "deck": (DECK, ".html", True)}

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("medium", choices=list(TEMPLATES) + ["powerbi"])
    ap.add_argument("name", nargs="?", default="HISD Starter")
    ap.add_argument("--out", default=".")
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)

    if a.medium == "powerbi":
        dst = os.path.join(a.out, "hisd-powerbi-theme.json")
        shutil.copy(os.path.join(ASSETS, "hisd-powerbi-theme.json"), dst)
        print("Wrote", dst, "\nImport via Power BI Desktop -> View -> Themes -> Browse for themes.")
        return

    tpl, ext, needs_css = TEMPLATES[a.medium]
    safe = "".join(c if c.isalnum() or c in "-_" else "-" for c in a.name).strip("-").lower() or "starter"
    dst = os.path.join(a.out, f"{safe}{ext}")
    with open(dst, "w") as f:
        f.write(tpl.replace("{name}", a.name))
    if needs_css:
        shutil.copy(os.path.join(ASSETS, "hisd-theme.css"), os.path.join(a.out, "hisd-theme.css"))
        # self-host the brand fonts so the CSS @font-face resolves (no external CDN)
        fdst = os.path.join(a.out, "fonts"); os.makedirs(fdst, exist_ok=True)
        for ttf in glob.glob(os.path.join(ASSETS, "fonts", "*.ttf")):
            shutil.copy(ttf, fdst)
        # the real HISD logo: white on the teal header/title, colored on the white report
        logo_src = os.path.join(ASSETS, "logos", "full-logo", LOGO_FILE[a.medium])
        if os.path.exists(logo_src):
            shutil.copy(logo_src, os.path.join(a.out, "hisd-logo.svg"))
        # the canonical Ribbon field+strokes device for the report header (referenced by .ribbon CSS)
        if a.medium == "report":
            rdst = os.path.join(a.out, "assets", "ribbon"); os.makedirs(rdst, exist_ok=True)
            ribbon_src = os.path.join(ASSETS, "ribbon", "ribbon-field.svg")
            if os.path.exists(ribbon_src):
                shutil.copy(ribbon_src, os.path.join(rdst, "ribbon-field.svg"))
    print("Wrote", dst, "(+ hisd-theme.css, fonts/, hisd-logo.svg)" if needs_css else "")
    print("Next: refine with reference/Media-Playbooks.md and run the accessibility checklist.")

if __name__ == "__main__":
    main()
