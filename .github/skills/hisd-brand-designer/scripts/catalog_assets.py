#!/usr/bin/env python3
"""Extract the HISD brand assets from the toolkit clone into TWO surfaces:

  1. Artifacts/Brand-Assets/                  — the repo's canonical catalog
  2. .skills/design/hisd-brand-designer/assets/            — vendored into the skill so it is
                                                self-contained in any other repo

Every unique LOGO flavor is preserved (SVG + PNG), deduped by CONTENT so the
toolkit's byte-identical Digital/Print copies collapse to one, with
orientation-aware semantic names. A hard assertion guarantees no unique flavor
is dropped. Fonts, templates, and guideline documents go to Artifacts; the skill
vendors the logos (both formats) plus the variable fonts.

The toolkit clone (`References/`) was removed after this one-time extraction, so the
default mode only runs when it is restored. To re-vendor the skill's assets from the
durable repo catalog instead (no toolkit needed), run:

    python3 catalog_assets.py --resync-skill

Run once:  python3 catalog_assets.py
"""
import os, re, json, shutil, hashlib, sys, argparse
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.normpath(os.path.join(HERE, "..", "..", ".."))
KIT = os.path.join(REPO, "References", "HISD-Branding-Toolkit")
ART = os.path.join(REPO, "Artifacts", "Brand-Assets")          # surface 1
SKILL = os.path.normpath(os.path.join(HERE, "..", "assets"))    # surface 2
LOGO_EXTS = (".svg", ".png")
NO_ORIENT = {"icon", "seal"}                                   # marks with no orientation

def md5(path):
    h = hashlib.md5()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()

def group_of(rel):
    parts = rel.split(os.sep)
    if "Departments Logos" in parts:
        i = parts.index("Departments Logos")
        return "departments", (slug(parts[i + 1]) if i + 1 < len(parts) else None)
    for needle, grp in [("Division Logos", "divisions"), ("Office Emblems", "offices"),
                        ("Program Logos", "programs")]:
        if needle in parts:
            i = parts.index(needle)
            return grp, (slug(parts[i + 1]) if i + 1 < len(parts) else None)
    for needle, grp in [("-Seal", "seal"), ("HISD Icon", "icon"), ("-Submark", "submark"),
                        ("-Full-Logo", "full-logo"), ("HISD Full Logo", "full-logo"),
                        ("HISD Primary Logo", "submark")]:  # primary == submark lockups
        if needle in rel:
            return grp, None
    return "other", None

def slug(s):
    s = s.lower().replace("(", " ").replace(")", " ")
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return re.sub(r"-{2,}", "-", s) or "x"

GENERIC_WORDS = {"svg", "png", "eps", "jpg", "pdf", "digital", "use", "only", "print", "quality",
                 "horizontal", "vertical", "full", "color", "dark", "light", "grey", "gray",
                 "white", "black", "green", "teal", "yellow", "purple", "blue", "red", "off",
                 "2025", "2026", "rgb", "cmyk", "reverse"}

def _generic(c):
    return all(w in GENERIC_WORDS for w in c.split("-") if w)

def semantic_name(path, group, subject):
    rel = os.path.relpath(path, KIT)
    low = rel.lower()
    orient = "vertical" if "vert" in low else ("horizontal" if re.search(r"horiz|horz", low) else "")
    # distinguishing sub-variant folders between the subject and the file (e.g. launchpad locations)
    parts = rel.split(os.sep)
    extra = []
    if subject:
        start = next((i + 1 for i, p in enumerate(parts) if slug(p) == subject), len(parts))
        for comp in parts[start:-1]:
            c = re.sub(r"\b" + re.escape(subject) + r"\b", "", slug(comp)).strip("-")
            c = re.sub(r"-{2,}", "-", c).strip("-")
            if c and not _generic(c):
                extra.append(c)
    base = os.path.splitext(os.path.basename(path))[0].lower().replace("(", " ").replace(")", " ")
    base = re.sub(r"[_\-]+", " ", base)
    junk = ["hisd", "department", "departments", "logos", "logo", "2025", "2026",
            "rgb", "cmyk", "horiz", "horizontal", "vert", "vertical", "face", "icons",
            "submark", "seal", "icon", "flat", "3d"]
    if subject:
        junk += [subject, subject.replace("-", " ")]
    junk += extra
    base = " " + base + " "
    for j in junk:
        base = re.sub(r"\b" + re.escape(j) + r"\b", " ", base)
    # drop filename abbreviations of a sub-variant (e.g. "west" when the folder said "westside")
    base = " ".join(w for w in base.split() if not any(len(w) >= 3 and e.startswith(w) for e in extra))
    form = "3d" if "3d" in low else ("flat" if "flat" in low else "")
    base = re.sub(r"[^a-z0-9]+", "-", base).strip("-")
    pieces = [orient if group not in NO_ORIENT else ""] + extra + [form, base]
    name = "-".join(p for p in pieces if p)
    return re.sub(r"-{2,}", "-", name).strip("-") or group

def resync_skill_from_artifacts():
    """Re-vendor the skill's logos + variable fonts from the repo catalog (no toolkit)."""
    if not os.path.isdir(ART):
        sys.exit(f"No repo catalog at {ART} to resync from — restore it or re-run the extraction.")
    asrc, adst = os.path.join(ART, "logos"), os.path.join(SKILL, "logos")
    if os.path.isdir(asrc):
        if os.path.isdir(adst):
            shutil.rmtree(adst)
        shutil.copytree(asrc, adst, ignore=shutil.ignore_patterns(".DS_Store"))
    fdst = os.path.join(SKILL, "fonts"); os.makedirs(fdst, exist_ok=True)
    for dp, _, files in os.walk(os.path.join(ART, "fonts")):
        fam = os.path.basename(dp)
        for fn in files:
            low = fn.lower()
            if "variablefont" in low:
                shutil.copy2(os.path.join(dp, fn), os.path.join(fdst, fn))
            elif low.startswith("ofl"):
                out = fn if low.startswith("ofl-") else f"OFL-{fam}.txt"
                shutil.copy2(os.path.join(dp, fn), os.path.join(fdst, out))
    nlogos = sum(len(fs) for _, _, fs in os.walk(adst)) if os.path.isdir(adst) else 0
    print(f"Re-vendored skill from {os.path.relpath(ART, REPO)}: {nlogos} logo files + variable fonts.")

# ---- dispatch: guard the destructive one-time extraction ----
_ap = argparse.ArgumentParser(description="Catalog HISD brand assets, or re-vendor the skill.")
_ap.add_argument("--resync-skill", action="store_true",
                 help="re-vendor the skill's logos + fonts from Artifacts/Brand-Assets (no toolkit needed)")
_args = _ap.parse_args()
if _args.resync_skill:
    resync_skill_from_artifacts()
    sys.exit(0)
if not os.path.isdir(KIT):
    print("Source toolkit not present:", KIT)
    print("References/ was removed after the one-time extraction; the catalog now lives in")
    print("  Artifacts/Brand-Assets/   and is vendored under .skills/design/hisd-brand-designer/assets/.")
    print("To re-vendor the skill from that catalog, run:  python3 catalog_assets.py --resync-skill")
    print("To re-run the full extraction, restore the toolkit clone to the path above.")
    sys.exit(2)

# ---- Phase 1: collect unique-by-content logos ----
src_hashes = defaultdict(set)            # ext -> set(content hashes) in source
by_content = {}                          # (group, subject, ext, hash) -> representative path
for root in (os.path.join(KIT, "HISD Logos"), os.path.join(KIT, "Departments Logos")):
    if not os.path.isdir(root):
        continue
    for dirpath, _, files in os.walk(root):
        if root.endswith("HISD Logos") and "Departments Logos" in dirpath:
            continue  # use only the canonical top-level Departments Logos tree (avoids re-export dupes)
        for fn in files:
            ext = os.path.splitext(fn)[1].lower()
            if ext not in LOGO_EXTS:
                continue
            p = os.path.join(dirpath, fn)
            rel = os.path.relpath(p, KIT)
            g, s = group_of(rel)
            h = md5(p)
            src_hashes[ext].add(h)
            k = (g, s, ext, h)
            # prefer a representative path that carries orientation + a longer name
            if k not in by_content:
                by_content[k] = p
            else:
                cur = by_content[k]
                score = lambda x: (bool(re.search(r"vert|horiz|horz", x.lower())), len(os.path.basename(x)))
                if score(p) > score(cur):
                    by_content[k] = p

# ---- Phase 2: name (dedup names per bucket) and copy to BOTH surfaces ----
names_used = defaultdict(dict)           # (group,subject,ext) -> {name: hash}
catalog = defaultdict(lambda: {"svg": 0, "png": 0})
copied_hashes = defaultdict(set)
def dests(group, subject):
    sub = os.path.join("logos", group, subject) if subject else os.path.join("logos", group)
    return [os.path.join(ART, sub), os.path.join(SKILL, sub)]

for (g, s, ext, h), path in sorted(by_content.items()):
    bucket = (g, s, ext)
    name = semantic_name(path, g, s)
    final, i = name, 2
    while final in names_used[bucket] and names_used[bucket][final] != h:
        final = f"{name}-{i}"; i += 1
    names_used[bucket][final] = h
    for d in dests(g, s):
        os.makedirs(d, exist_ok=True)
        shutil.copy2(path, os.path.join(d, final + ext))
    catalog[f"{g}/{s}" if s else g]["svg" if ext == ".svg" else "png"] += 1
    copied_hashes[ext].add(h)

# ---- correctness: every unique source flavor must be present ----
for ext in LOGO_EXTS:
    missing = src_hashes[ext] - copied_hashes[ext]
    assert not missing, f"LOST {len(missing)} unique {ext} flavors!"
print(f"Logos preserved — unique SVG: {len(copied_hashes['.svg'])}/{len(src_hashes['.svg'])}, "
      f"unique PNG: {len(copied_hashes['.png'])}/{len(src_hashes['.png'])} (no flavor lost).")

# ---- fonts: all weights -> Artifacts; variable -> skill ----
for fam in ("Radio_Canada", "Parkinsans", "Lora"):
    fsrc = os.path.join(KIT, "Fonts", fam)
    if not os.path.isdir(fsrc):
        continue
    famc = fam.replace("_", "-")
    adst = os.path.join(ART, "fonts", famc); os.makedirs(adst, exist_ok=True)
    sdst = os.path.join(SKILL, "fonts"); os.makedirs(sdst, exist_ok=True)
    for dp, _, files in os.walk(fsrc):
        for fn in files:
            if fn.lower().endswith((".ttf", ".txt")):
                src = os.path.join(dp, fn)
                shutil.copy2(src, os.path.join(adst, fn))
                if "variablefont" in fn.lower() or fn == "OFL.txt":
                    shutil.copy2(src, os.path.join(sdst, fn if fn != "OFL.txt" else f"OFL-{famc}.txt"))

# ---- guidelines + templates -> Artifacts only ----
os.makedirs(os.path.join(ART, "guidelines"), exist_ok=True)
guides = []
for pat in ("HISD-Brand-Guidelines-SPR2025.pdf", "HISD-Branding-Quick-Reference-(2025).pdf",
            "HISD Brand Toolkit Information.docx", "HISD-2025-Email_Signature 2.docx"):
    sp = os.path.join(KIT, pat)
    if os.path.exists(sp):
        shutil.copy2(sp, os.path.join(ART, "guidelines", os.path.basename(sp))); guides.append(os.path.basename(sp))
tsrc = os.path.join(KIT, "HISD Templates")
templates = []
if os.path.isdir(tsrc):
    tdst = os.path.join(ART, "templates")
    if os.path.exists(tdst): shutil.rmtree(tdst)
    shutil.copytree(tsrc, tdst, ignore=shutil.ignore_patterns(".DS_Store"))
    templates = sorted(d for d in os.listdir(tdst) if not d.startswith("."))

# ---- catalog index (Artifacts) ----
cat = {"logos": dict(sorted(catalog.items())), "fonts": ["Radio-Canada", "Parkinsans", "Lora"],
       "templates": templates, "guidelines": guides}
with open(os.path.join(ART, "catalog.json"), "w") as f:
    json.dump(cat, f, indent=2)
lines = ["# HISD Brand Assets — Catalog", "",
         "Extracted from the HISD Branding Toolkit into two surfaces: this repo catalog "
         "and the vendored copy inside `.skills/design/hisd-brand-designer/assets/`. Logos are kept as "
         "vector (SVG) and raster (PNG), deduped by content with orientation-aware names; "
         "the bulky redundant EPS/JPG/PDF derivatives are dropped (regenerable from the "
         "vectors; originals in SharePoint and git history).", "",
         "## Logos", "", "| Group | SVG | PNG |", "| --- | --- | --- |"]
for k in sorted(cat["logos"]):
    c = cat["logos"][k]; lines.append(f"| `{k}` | {c['svg']} | {c['png']} |")
lines += ["", "## Fonts", "", "Radio-Canada, Parkinsans, Lora (OFL; variable + static weights).", "",
          "## Templates", "", ", ".join(f"`{t}`" for t in templates) or "(none)", "",
          "## Guidelines", ""] + [f"- `{g}`" for g in guides]
with open(os.path.join(ART, "CATALOG.md"), "w") as f:
    f.write("\n".join(lines) + "\n")

print(f"Groups: {len(cat['logos'])} | templates: {len(templates)} | guidelines: {len(guides)}")
print("Surfaces written: Artifacts/Brand-Assets/  and  .skills/design/hisd-brand-designer/assets/")
