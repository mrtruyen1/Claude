#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Tab icon set v3 — "sys3d chrome neon" style for HA SmartHome Neon Dark theme.
5 icons (home, bed, tower1, tower2, tower3) x 2 states (off, on).
No SVG filters (renderer-safe): glow is built from layered strokes/gradients.
"""
import cairosvg, os

OUT = os.path.dirname(os.path.abspath(__file__)) + "/out"
os.makedirs(OUT, exist_ok=True)

# ---------------------------------------------------------------- palette
CY_HI   = "#d9fbff"   # neon core
CY_MID  = "#4fe3ff"
CY_DEEP = "#17b5dd"
CY_DIM  = "#0e8fb0"

def defs(on: bool) -> str:
    # metal tones get slightly cooler & brighter when lit
    m_hi  = "#8ea1b6" if on else "#7d8ea1"
    m_mid = "#46536a" if on else "#3d4756"
    m_lo  = "#232a37" if on else "#20262f"
    return f"""
<defs>
  <linearGradient id="metalV" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="{m_hi}"/><stop offset="0.45" stop-color="{m_mid}"/><stop offset="1" stop-color="{m_lo}"/>
  </linearGradient>
  <linearGradient id="metalLite" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#b9c7d6"/><stop offset="0.5" stop-color="#77879b"/><stop offset="1" stop-color="#3c4654"/>
  </linearGradient>
  <linearGradient id="metalDark" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#4a5666"/><stop offset="1" stop-color="#161b23"/>
  </linearGradient>
  <linearGradient id="sideShade" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="#000000" stop-opacity="0"/><stop offset="1" stop-color="#000000" stop-opacity="0.42"/>
  </linearGradient>
  <linearGradient id="glass" x1="0" y1="0" x2="0" y2="1">
    {'<stop offset="0" stop-color="#e7fdff"/><stop offset="0.35" stop-color="#7deaff"/><stop offset="1" stop-color="#12a7cf"/>'
     if on else
     '<stop offset="0" stop-color="#27394a"/><stop offset="0.5" stop-color="#17222e"/><stop offset="1" stop-color="#0b1219"/>'}
  </linearGradient>
  <linearGradient id="glassRoof" x1="0" y1="0" x2="0" y2="1">
    {'<stop offset="0" stop-color="#f2feff"/><stop offset="0.4" stop-color="#8ceeff"/><stop offset="1" stop-color="#1fb9de"/>'
     if on else
     '<stop offset="0" stop-color="#4c6175"/><stop offset="0.55" stop-color="#2c3d4e"/><stop offset="1" stop-color="#16212c"/>'}
  </linearGradient>
  <radialGradient id="gshadow" cx="0.5" cy="0.5" r="0.5">
    <stop offset="0" stop-color="#000" stop-opacity="0.5"/><stop offset="0.7" stop-color="#000" stop-opacity="0.28"/>
    <stop offset="1" stop-color="#000" stop-opacity="0"/>
  </radialGradient>
  <radialGradient id="halo" cx="0.5" cy="0.5" r="0.5">
    <stop offset="0" stop-color="{CY_MID}" stop-opacity="0.30"/><stop offset="0.55" stop-color="{CY_MID}" stop-opacity="0.12"/>
    <stop offset="1" stop-color="{CY_MID}" stop-opacity="0"/>
  </radialGradient>
  <radialGradient id="badgeG" cx="0.35" cy="0.3" r="0.9">
    <stop offset="0" stop-color="#5df5e6"/><stop offset="0.55" stop-color="#14cfc0"/><stop offset="1" stop-color="#079b90"/>
  </radialGradient>
  <linearGradient id="badgeRim" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#bffff7"/><stop offset="1" stop-color="#04564f"/>
  </linearGradient>
</defs>"""

def glow(shape_attrs: str, on: bool) -> str:
    """Layered neon strokes around an outline path/shape (pass d=... or points=...)."""
    if not on:
        return ""
    layers = [(30, 0.08), (18, 0.15), (9, 0.30), (3.5, 0.75)]
    s = ""
    for w, o in layers:
        s += f'<{shape_attrs} fill="none" stroke="{CY_MID}" stroke-width="{w}" stroke-opacity="{o}" stroke-linejoin="round" stroke-linecap="round"/>'
    return s

def halo(on, cx=256, cy=250, r=240):
    return f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="url(#halo)"/>' if on else ""

def ground(cx=256, cy=452, rx=175, ry=28):
    return f'<ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}" fill="url(#gshadow)"/>'

def spec(points, op=0.10):
    return f'<polygon points="{points}" fill="#ffffff" opacity="{op}"/>'

def text_badge(label: str, cx: float, cy: float, rx: float = 92, ry: float = 72) -> str:
    """Oval badge with baked text label (used for PN and T1/T2/T3) — same size everywhere."""
    font_size = ry * 1.55
    return f"""
<g>
  <ellipse cx="{cx}" cy="{cy+5}" rx="{rx+5}" ry="{ry+5}" fill="#000" opacity="0.35"/>
  <ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}" fill="url(#badgeG)" stroke="url(#badgeRim)" stroke-width="6"/>
  <path d="M {cx-rx*0.62} {cy-ry*0.28} A {rx*0.72} {ry*0.72} 0 0 1 {cx+rx*0.62} {cy-ry*0.28} A {rx*1.15} {ry*1.15} 0 0 0 {cx-rx*0.62} {cy-ry*0.28} Z" fill="#ffffff" opacity="0.30"/>
  <text x="{cx}" y="{cy+ry*0.36}" text-anchor="middle" font-family="DejaVu Sans, Arial, sans-serif"
        font-weight="bold" font-size="{font_size}" fill="#ffffff" stroke="#04564f" stroke-width="3.5" paint-order="stroke">{label}</text>
</g>"""

def svg(body: str, on: bool) -> str:
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">{defs(on)}{body}</svg>'

# =====================================================================
# 1) HOME — A-frame glass roof house
# =====================================================================
def home(on: bool) -> str:
    roof = "256,54 62,244 450,244"
    b = halo(on) + ground()
    # chimney (behind roof)
    b += '<rect x="344" y="96" width="40" height="120" rx="6" fill="url(#metalDark)"/>'
    b += '<rect x="338" y="88" width="52" height="18" rx="6" fill="url(#metalLite)"/>'
    # roof glass + chrome frame
    b += glow(f'polygon points="{roof}"', on)
    b += f'<polygon points="{roof}" fill="url(#glassRoof)" stroke="url(#metalLite)" stroke-width="15" stroke-linejoin="round"/>'
    # roof mullions
    b += '<line x1="256" y1="60" x2="168" y2="238" stroke="#0b1620" stroke-width="7" opacity="0.65"/>'
    b += '<line x1="256" y1="60" x2="344" y2="238" stroke="#0b1620" stroke-width="7" opacity="0.65"/>'
    b += spec("256,62 96,232 148,232 268,74", 0.14 if on else 0.10)
    # eave bar
    b += '<rect x="52" y="234" width="408" height="22" rx="10" fill="url(#metalLite)"/>'
    # body
    b += glow('rect x="106" y="256" width="300" height="172" rx="10"', on)
    b += '<rect x="106" y="256" width="300" height="172" rx="10" fill="url(#metalV)"/>'
    b += '<rect x="356" y="256" width="50" height="172" rx="10" fill="url(#sideShade)"/>'
    b += spec("120,256 180,256 150,428 106,428", 0.06)
    # door
    door_glass = 'url(#glass)' if on else '#0d151d'
    b += f'<rect x="146" y="296" width="76" height="132" rx="8" fill="url(#metalDark)"/>'
    b += f'<rect x="153" y="303" width="62" height="125" rx="6" fill="{door_glass}"/>'
    b += f'<circle cx="205" cy="368" r="6" fill="{CY_MID if on else "#5f7286"}"/>'
    # window (4 panes)
    b += '<rect x="268" y="288" width="104" height="86" rx="10" fill="url(#metalLite)"/>'
    for wx in (276, 322):
        for wy in (296, 334):
            b += f'<rect x="{wx}" y="{wy}" width="42" height="32" rx="5" fill="url(#glass)"/>'
    # plinth
    b += '<rect x="96" y="424" width="320" height="22" rx="10" fill="url(#metalDark)"/>'
    if on:
        b += f'<rect x="106" y="440" width="300" height="5" rx="2.5" fill="{CY_MID}" opacity="0.85"/>'
    return svg(b, on)

# =====================================================================
# 2) BED — side view, neon blanket
# =====================================================================
def bed(on: bool) -> str:
    b = halo(on, cy=280, r=230) + ground(cy=450)
    outline = 'path d="M96,130 h44 a22,22 0 0 1 22,22 v96 h236 a30,30 0 0 1 30,30 v56 h-352 z" '
    b += glow(outline, on)
    # headboard
    b += '<rect x="84" y="118" width="62" height="228" rx="20" fill="url(#metalV)" stroke="url(#metalLite)" stroke-width="4"/>'
    b += '<rect x="98" y="136" width="34" height="150" rx="14" fill="url(#metalDark)"/>'
    # mattress
    b += '<rect x="140" y="252" width="310" height="62" rx="18" fill="url(#metalLite)"/>'
    b += '<rect x="140" y="252" width="310" height="26" rx="13" fill="#dfe8f0" opacity="0.85"/>'
    # pillow
    b += '<rect x="152" y="228" width="112" height="46" rx="18" fill="#eef4f9" stroke="#9fb0c0" stroke-width="3"/>'
    # blanket (neon when on)
    bl = 'url(#glass)'
    b += f'<path d="M258,238 h150 a34,34 0 0 1 34,34 v42 h-196 v-62 a14,14 0 0 1 12,-14 z" fill="{bl}" stroke="{CY_MID if on else "#54687c"}" stroke-width="{4 if on else 3}"/>'
    b += '<line x1="300" y1="244" x2="292" y2="314" stroke="#0b1620" stroke-width="5" opacity="0.35"/>'
    b += '<line x1="352" y1="240" x2="346" y2="314" stroke="#0b1620" stroke-width="5" opacity="0.35"/>'
    # frame rail
    b += '<rect x="84" y="314" width="374" height="30" rx="12" fill="url(#metalV)" stroke="url(#metalLite)" stroke-width="3"/>'
    if on:
        b += f'<rect x="96" y="338" width="350" height="6" rx="3" fill="{CY_MID}" opacity="0.9"/>'
    # legs
    b += '<rect x="110" y="344" width="30" height="72" rx="9" fill="url(#metalDark)"/>'
    b += '<rect x="412" y="344" width="30" height="72" rx="9" fill="url(#metalDark)"/>'
    b += '<rect x="102" y="408" width="46" height="14" rx="7" fill="url(#metalLite)"/>'
    b += '<rect x="404" y="408" width="46" height="14" rx="7" fill="url(#metalLite)"/>'
    # footboard post
    b += '<rect x="440" y="226" width="28" height="120" rx="12" fill="url(#metalV)" stroke="url(#metalLite)" stroke-width="3"/>'
    b += f'<circle cx="454" cy="218" r="13" fill="url(#{ "glass" if on else "metalLite"})"/>'
    b += text_badge("PN", 380, 392)
    return svg(b, on)

# =====================================================================
# 3-5) TOWERS — distinct silhouettes, baked number badge
# =====================================================================
def tower(n: int, on: bool) -> str:
    b = halo(on) + ground()
    if n == 1:
        # wide 2-storey shophouse with awning
        X, Y, W, H = 76, 172, 300, 260
        b += glow(f'rect x="{X}" y="{Y}" width="{W}" height="{H}" rx="18"', on)
        b += f'<rect x="{X}" y="{Y}" width="{W}" height="{H}" rx="18" fill="url(#metalV)"/>'
        b += f'<rect x="{X+W-46}" y="{Y}" width="46" height="{H}" rx="18" fill="url(#sideShade)"/>'
        b += f'<rect x="{X-10}" y="{Y-18}" width="{W+20}" height="26" rx="12" fill="url(#metalLite)"/>'
        # upper windows x3
        for i, wx in enumerate((X+26, X+118, X+210)):
            b += f'<rect x="{wx}" y="{Y+30}" width="64" height="52" rx="8" fill="url(#glass)" stroke="#0b1620" stroke-width="3"/>'
        # awning
        b += f'<rect x="{X+14}" y="{Y+108}" width="{W-28}" height="20" rx="9" fill="url(#metalLite)"/>'
        # storefront glass + door
        b += f'<rect x="{X+24}" y="{Y+140}" width="150" height="86" rx="8" fill="url(#glass)" stroke="#0b1620" stroke-width="3"/>'
        b += f'<line x1="{X+99}" y1="{Y+142}" x2="{X+99}" y2="{Y+224}" stroke="#0b1620" stroke-width="5" opacity="0.6"/>'
        b += f'<rect x="{X+196}" y="{Y+134}" width="62" height="96" rx="8" fill="url(#metalDark)"/>'
        b += f'<rect x="{X+203}" y="{Y+141}" width="48" height="89" rx="6" fill="{("url(#glass)") if on else "#0d151d"}"/>'
        b += f'<rect x="{X-14}" y="{Y+H-8}" width="{W+28}" height="22" rx="10" fill="url(#metalDark)"/>'
        if on:
            b += f'<rect x="{X}" y="{Y+H+10}" width="{W}" height="5" rx="2.5" fill="{CY_MID}" opacity="0.85"/>'
        b += spec(f"{X+18},{Y} {X+70},{Y} {X+34},{Y+H} {X},{Y+H-40}", 0.06)
    elif n == 2:
        # mid tower, 3 floors, rooftop box
        X, Y, W, H = 118, 128, 226, 304
        b += f'<rect x="{X+58}" y="{Y-34}" width="66" height="40" rx="8" fill="url(#metalDark)"/>'
        b += glow(f'rect x="{X}" y="{Y}" width="{W}" height="{H}" rx="18"', on)
        b += f'<rect x="{X}" y="{Y}" width="{W}" height="{H}" rx="18" fill="url(#metalV)"/>'
        b += f'<rect x="{X+W-42}" y="{Y}" width="42" height="{H}" rx="18" fill="url(#sideShade)"/>'
        b += f'<rect x="{X-12}" y="{Y-14}" width="{W+24}" height="24" rx="11" fill="url(#metalLite)"/>'
        for fy in (Y+28, Y+112, Y+196):
            for wx in (X+24, X+118):
                b += f'<rect x="{wx}" y="{fy}" width="76" height="58" rx="8" fill="url(#glass)" stroke="#0b1620" stroke-width="3"/>'
                b += f'<line x1="{wx+38}" y1="{fy+2}" x2="{wx+38}" y2="{fy+56}" stroke="#0b1620" stroke-width="4" opacity="0.55"/>'
        b += f'<rect x="{X+78}" y="{Y+H-56}" width="66" height="56" rx="8" fill="url(#metalDark)"/>'
        b += f'<rect x="{X-16}" y="{Y+H-6}" width="{W+32}" height="22" rx="10" fill="url(#metalDark)"/>'
        if on:
            b += f'<rect x="{X}" y="{Y+H+12}" width="{W}" height="5" rx="2.5" fill="{CY_MID}" opacity="0.85"/>'
        b += spec(f"{X+16},{Y} {X+62},{Y} {X+30},{Y+H} {X},{Y+H-46}", 0.06)
    else:
        # tall tower, 4 floors, antenna
        X, Y, W, H = 134, 96, 200, 336
        b += f'<rect x="{X+W//2-5}" y="{Y-62}" width="10" height="62" rx="5" fill="url(#metalLite)"/>'
        tip = CY_MID if on else "#5f7286"
        b += f'<circle cx="{X+W//2}" cy="{Y-66}" r="10" fill="{tip}"/>'
        if on:
            b += f'<circle cx="{X+W//2}" cy="{Y-66}" r="20" fill="url(#halo)"/>'
        b += glow(f'rect x="{X}" y="{Y}" width="{W}" height="{H}" rx="18"', on)
        b += f'<rect x="{X}" y="{Y}" width="{W}" height="{H}" rx="18" fill="url(#metalV)"/>'
        b += f'<rect x="{X+W-38}" y="{Y}" width="38" height="{H}" rx="18" fill="url(#sideShade)"/>'
        b += f'<rect x="{X-12}" y="{Y-14}" width="{W+24}" height="24" rx="11" fill="url(#metalLite)"/>'
        for fy in (Y+26, Y+102, Y+178, Y+254):
            for wx in (X+22, X+104):
                b += f'<rect x="{wx}" y="{fy}" width="64" height="52" rx="7" fill="url(#glass)" stroke="#0b1620" stroke-width="3"/>'
        b += f'<rect x="{X+66}" y="{Y+H-52}" width="60" height="52" rx="8" fill="url(#metalDark)"/>'
        b += f'<rect x="{X-16}" y="{Y+H-6}" width="{W+32}" height="22" rx="10" fill="url(#metalDark)"/>'
        if on:
            b += f'<rect x="{X}" y="{Y+H+12}" width="{W}" height="5" rx="2.5" fill="{CY_MID}" opacity="0.85"/>'
        b += spec(f"{X+14},{Y} {X+56},{Y} {X+26},{Y+H} {X},{Y+H-50}", 0.06)
    b += text_badge(f"T{n}", 398, 400)
    return svg(b, on)

# =====================================================================
ICONS = {
    "home_tab3d":  home,
    "bed_tab3d":   bed,
    "t1_tab3d":    lambda on: tower(1, on),
    "t2_tab3d":    lambda on: tower(2, on),
    "t3_tab3d":    lambda on: tower(3, on),
}

for name, fn in ICONS.items():
    for state in ("off", "on"):
        s = fn(state == "on")
        p_svg = f"{OUT}/{name}_{state}.svg"
        open(p_svg, "w").write(s)
        cairosvg.svg2png(url=p_svg, write_to=f"{OUT}/{name}_{state}.png",
                         output_width=512, output_height=512)
        print("rendered", name, state)
print("done")
