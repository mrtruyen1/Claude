#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
5 bộ icon tab thay thế (mỗi bộ: home, bed, t1, t2, t3 × off/on) — để người dùng chọn.
  s1_neonline  – Neon Line (Tron): nét phát sáng, không tô đặc
  s2_frost     – Frosted Glass: kính mờ tím kiểu Flux Glass
  s3_gold      – Gold Chrome: kim loại + kính vàng ấm như stairs/night-lamp sys3d
  s4_synth     – Synthwave: gradient magenta→cyan
  s5_holo      – Hologram: cyan trong suốt + scanline
Không dùng SVG filter — glow bằng lớp stroke chồng.
"""
import cairosvg, os

OUT = os.path.dirname(os.path.abspath(__file__)) + "/sets"
os.makedirs(OUT, exist_ok=True)

# ---------------------------------------------------------------- numerals
NUMS = {
    1: "M -13,-14 L 1,-27 L 1,27 M -14,27 L 16,27",
    2: "M -16,-11 A 17,17 0 1 1 13,2 L -17,27 L 19,27",
    3: "M -14,-16 A 16,16 0 1 1 2,3 M 2,3 A 16.5,16.5 0 1 1 -15,20",
}

class Style:
    def __init__(self, **kw): self.__dict__.update(kw)

# ---------------------------------------------------------------- styles
def stops(*pairs):
    return "".join(f'<stop offset="{o}" stop-color="{c}"/>' for o, c in pairs)

def mkdefs(S, on):
    g_on, g_off = S.glass_on, S.glass_off
    gr_on, gr_off = getattr(S, 'roof_on', g_on), getattr(S, 'roof_off', g_off)
    return f"""
<defs>
  <linearGradient id="metalV" x1="0" y1="0" x2="0" y2="1">{stops(*S.metal)}</linearGradient>
  <linearGradient id="metalLite" x1="0" y1="0" x2="0" y2="1">{stops(*S.metal_lite)}</linearGradient>
  <linearGradient id="metalDark" x1="0" y1="0" x2="0" y2="1">{stops(*S.metal_dark)}</linearGradient>
  <linearGradient id="sideShade" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="{S.side_op}"/>
  </linearGradient>
  <linearGradient id="glass" x1="0" y1="0" x2="0" y2="1">{stops(*(g_on if on else g_off))}</linearGradient>
  <linearGradient id="glassRoof" x1="0" y1="0" x2="0" y2="1">{stops(*(gr_on if on else gr_off))}</linearGradient>
  <radialGradient id="gshadow" cx="0.5" cy="0.5" r="0.5">
    <stop offset="0" stop-color="#000" stop-opacity="0.5"/><stop offset="0.7" stop-color="#000" stop-opacity="0.28"/>
    <stop offset="1" stop-color="#000" stop-opacity="0"/>
  </radialGradient>
  <radialGradient id="halo" cx="0.5" cy="0.5" r="0.5">
    <stop offset="0" stop-color="{S.glow}" stop-opacity="0.30"/><stop offset="0.55" stop-color="{S.glow}" stop-opacity="0.12"/>
    <stop offset="1" stop-color="{S.glow}" stop-opacity="0"/>
  </radialGradient>
  <radialGradient id="badgeG" cx="0.35" cy="0.3" r="0.9">{stops(*S.badge)}</radialGradient>
  <linearGradient id="badgeRim" x1="0" y1="0" x2="0" y2="1">{stops(*S.badge_rim)}</linearGradient>
</defs>"""

S2 = Style(  # Frosted Glass (Flux violet)
    key="s2_frost", label="Frosted Glass",
    metal=[(0, "rgba(255,255,255,0.34)"), (0.5, "rgba(255,255,255,0.16)"), (1, "rgba(255,255,255,0.07)")],
    metal_lite=[(0, "rgba(255,255,255,0.55)"), (1, "rgba(255,255,255,0.18)")],
    metal_dark=[(0, "rgba(35,20,70,0.75)"), (1, "rgba(18,10,40,0.85)")],
    side_op=0.18, line_dark="rgba(255,255,255,0.35)",
    glass_off=[(0, "rgba(210,190,255,0.16)"), (1, "rgba(150,120,220,0.08)")],
    glass_on=[(0, "#f3ecff"), (0.4, "#cdb4ff"), (1, "#8f5cf0")],
    glow="#c9b6ff", acc="#cdb4ff",
    badge=[(0, "#d5c3ff"), (0.55, "#a07bf0"), (1, "#6a3fc4")],
    badge_rim=[(0, "#f0e8ff"), (1, "#3a1f78")], badge_ink="#3a1f78",
)
S3 = Style(  # Gold Chrome
    key="s3_gold", label="Gold Chrome",
    metal=[(0, "#8ea1b6"), (0.45, "#46536a"), (1, "#232a37")],
    metal_lite=[(0, "#b9c7d6"), (0.5, "#77879b"), (1, "#3c4654")],
    metal_dark=[(0, "#4a5666"), (1, "#161b23")],
    side_op=0.42, line_dark="#1a1408",
    glass_off=[(0, "#4f4630"), (0.55, "#2e2a1c"), (1, "#171408")],
    glass_on=[(0, "#fff6d8"), (0.35, "#ffd35c"), (1, "#d98a00")],
    glow="#ffbe36", acc="#ffca28",
    badge=[(0, "#ffe082"), (0.55, "#ffb300"), (1, "#b26a00")],
    badge_rim=[(0, "#fff3c4"), (1, "#5a3400")], badge_ink="#5a3400",
)
S4 = Style(  # Synthwave
    key="s4_synth", label="Synthwave",
    metal=[(0, "#5a4a8a"), (0.45, "#372a5e"), (1, "#1d1438")],
    metal_lite=[(0, "#9a86d8"), (0.5, "#5a4a8a"), (1, "#2a2050")],
    metal_dark=[(0, "#3a2c66"), (1, "#120c26")],
    side_op=0.45, line_dark="#12081f",
    glass_off=[(0, "#3a2451"), (0.55, "#251536"), (1, "#120a1e")],
    glass_on=[(0, "#ffd9f6"), (0.35, "#ff5fd7"), (1, "#39a7ff")],
    glow="#ff5fd7", acc="#ff7ae2",
    badge=[(0, "#ff9ce8"), (0.55, "#f03cbe"), (1, "#8f1a86")],
    badge_rim=[(0, "#ffd9f6"), (1, "#4a0a45")], badge_ink="#4a0a45",
)
S5 = Style(  # Hologram
    key="s5_holo", label="Hologram",
    metal=[(0, "rgba(80,225,255,0.30)"), (0.5, "rgba(40,180,220,0.18)"), (1, "rgba(20,120,160,0.12)")],
    metal_lite=[(0, "rgba(160,245,255,0.55)"), (1, "rgba(60,190,230,0.22)")],
    metal_dark=[(0, "rgba(20,90,120,0.45)"), (1, "rgba(8,40,60,0.55)")],
    side_op=0.22, line_dark="rgba(10,60,80,0.7)",
    glass_off=[(0, "rgba(90,230,255,0.20)"), (1, "rgba(30,140,190,0.10)")],
    glass_on=[(0, "#e8fdff"), (0.4, "#7deaff"), (1, "#12a7cf")],
    glow="#4fe3ff", acc="#7deaff",
    badge=[(0, "rgba(120,240,255,0.75)"), (0.55, "rgba(40,190,230,0.65)"), (1, "rgba(10,120,170,0.6)")],
    badge_rim=[(0, "#bff6ff"), (1, "#065a78")], badge_ink="#04435c",
)

def glow_shape(shape_attrs, S, on):
    if not on: return ""
    return "".join(
        f'<{shape_attrs} fill="none" stroke="{S.glow}" stroke-width="{w}" stroke-opacity="{o}" stroke-linejoin="round" stroke-linecap="round"/>'
        for w, o in [(30, 0.08), (18, 0.15), (9, 0.30), (3.5, 0.75)])

def halo(on, cx=256, cy=250, r=240):
    return f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="url(#halo)"/>' if on else ""

def ground(cx=256, cy=452, rx=175, ry=28):
    return f'<ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}" fill="url(#gshadow)"/>'

def spec(points, op=0.10):
    return f'<polygon points="{points}" fill="#ffffff" opacity="{op}"/>'

def badge(S, n, cx=398, cy=400, r=58):
    num = NUMS[n]
    return f"""
<g>
  <circle cx="{cx}" cy="{cy+4}" r="{r+4}" fill="#000" opacity="0.35"/>
  <circle cx="{cx}" cy="{cy}" r="{r}" fill="url(#badgeG)" stroke="url(#badgeRim)" stroke-width="5"/>
  <path d="M {cx-r*0.62} {cy-r*0.28} A {r*0.72} {r*0.72} 0 0 1 {cx+r*0.62} {cy-r*0.28} A {r*1.15} {r*1.15} 0 0 0 {cx-r*0.62} {cy-r*0.28} Z" fill="#ffffff" opacity="0.30"/>
  <g transform="translate({cx},{cy})" fill="none" stroke-linecap="round" stroke-linejoin="round">
    <path d="{num}" stroke="{S.badge_ink}" stroke-width="19" opacity="0.85"/>
    <path d="{num}" stroke="#ffffff" stroke-width="12"/>
  </g>
</g>"""

def scanlines():
    ln = "".join(f'<line x1="40" y1="{y}" x2="472" y2="{y}" stroke="#aef4ff" stroke-width="3" opacity="0.10"/>'
                 for y in range(60, 460, 16))
    return f'<g>{ln}</g>'

def wrap(S, body, on, holo=False):
    extra = scanlines() if holo else ""
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">'
            f'{mkdefs(S, on)}{body}{extra}</svg>')

# ---------------------------------------------------------------- filled geometry
def f_home(S, on):
    roof = "256,54 62,244 450,244"
    b = halo(on) + ground()
    b += '<rect x="344" y="96" width="40" height="120" rx="6" fill="url(#metalDark)"/>'
    b += '<rect x="338" y="88" width="52" height="18" rx="6" fill="url(#metalLite)"/>'
    b += glow_shape(f'polygon points="{roof}"', S, on)
    b += f'<polygon points="{roof}" fill="url(#glassRoof)" stroke="url(#metalLite)" stroke-width="15" stroke-linejoin="round"/>'
    b += f'<line x1="256" y1="60" x2="168" y2="238" stroke="{S.line_dark}" stroke-width="7" opacity="0.65"/>'
    b += f'<line x1="256" y1="60" x2="344" y2="238" stroke="{S.line_dark}" stroke-width="7" opacity="0.65"/>'
    b += spec("256,62 96,232 148,232 268,74", 0.14 if on else 0.10)
    b += '<rect x="52" y="234" width="408" height="22" rx="10" fill="url(#metalLite)"/>'
    b += glow_shape('rect x="106" y="256" width="300" height="172" rx="10"', S, on)
    b += '<rect x="106" y="256" width="300" height="172" rx="10" fill="url(#metalV)"/>'
    b += '<rect x="356" y="256" width="50" height="172" rx="10" fill="url(#sideShade)"/>'
    b += spec("120,256 180,256 150,428 106,428", 0.06)
    door_glass = 'url(#glass)' if on else 'url(#metalDark)'
    b += '<rect x="146" y="296" width="76" height="132" rx="8" fill="url(#metalDark)"/>'
    b += f'<rect x="153" y="303" width="62" height="125" rx="6" fill="{door_glass}"/>'
    b += f'<circle cx="205" cy="368" r="6" fill="{S.acc if on else "#5f7286"}"/>'
    b += '<rect x="268" y="288" width="104" height="86" rx="10" fill="url(#metalLite)"/>'
    for wx in (276, 322):
        for wy in (296, 334):
            b += f'<rect x="{wx}" y="{wy}" width="42" height="32" rx="5" fill="url(#glass)"/>'
    b += '<rect x="96" y="424" width="320" height="22" rx="10" fill="url(#metalDark)"/>'
    if on:
        b += f'<rect x="106" y="440" width="300" height="5" rx="2.5" fill="{S.acc}" opacity="0.85"/>'
    return b

def f_bed(S, on):
    b = halo(on, cy=280, r=230) + ground(cy=450)
    outline = 'path d="M96,130 h44 a22,22 0 0 1 22,22 v96 h236 a30,30 0 0 1 30,30 v56 h-352 z" '
    b += glow_shape(outline, S, on)
    b += '<rect x="84" y="118" width="62" height="228" rx="20" fill="url(#metalV)" stroke="url(#metalLite)" stroke-width="4"/>'
    b += '<rect x="98" y="136" width="34" height="150" rx="14" fill="url(#metalDark)"/>'
    b += '<rect x="140" y="252" width="310" height="62" rx="18" fill="url(#metalLite)"/>'
    b += '<rect x="140" y="252" width="310" height="26" rx="13" fill="#dfe8f0" opacity="0.85"/>'
    b += '<rect x="152" y="228" width="112" height="46" rx="18" fill="#eef4f9" stroke="#9fb0c0" stroke-width="3"/>'
    b += f'<path d="M258,238 h150 a34,34 0 0 1 34,34 v42 h-196 v-62 a14,14 0 0 1 12,-14 z" fill="url(#glass)" stroke="{S.acc if on else "#54687c"}" stroke-width="{4 if on else 3}"/>'
    b += f'<line x1="300" y1="244" x2="292" y2="314" stroke="{S.line_dark}" stroke-width="5" opacity="0.35"/>'
    b += f'<line x1="352" y1="240" x2="346" y2="314" stroke="{S.line_dark}" stroke-width="5" opacity="0.35"/>'
    b += '<rect x="84" y="314" width="374" height="30" rx="12" fill="url(#metalV)" stroke="url(#metalLite)" stroke-width="3"/>'
    if on:
        b += f'<rect x="96" y="338" width="350" height="6" rx="3" fill="{S.acc}" opacity="0.9"/>'
    b += '<rect x="110" y="344" width="30" height="72" rx="9" fill="url(#metalDark)"/>'
    b += '<rect x="412" y="344" width="30" height="72" rx="9" fill="url(#metalDark)"/>'
    b += '<rect x="102" y="408" width="46" height="14" rx="7" fill="url(#metalLite)"/>'
    b += '<rect x="404" y="408" width="46" height="14" rx="7" fill="url(#metalLite)"/>'
    b += '<rect x="440" y="226" width="28" height="120" rx="12" fill="url(#metalV)" stroke="url(#metalLite)" stroke-width="3"/>'
    b += f'<circle cx="454" cy="218" r="13" fill="url(#{ "glass" if on else "metalLite"})"/>'
    return b

def f_tower(S, n, on):
    b = halo(on) + ground()
    if n == 1:
        X, Y, W, H = 76, 172, 300, 260
        b += glow_shape(f'rect x="{X}" y="{Y}" width="{W}" height="{H}" rx="18"', S, on)
        b += f'<rect x="{X}" y="{Y}" width="{W}" height="{H}" rx="18" fill="url(#metalV)"/>'
        b += f'<rect x="{X+W-46}" y="{Y}" width="46" height="{H}" rx="18" fill="url(#sideShade)"/>'
        b += f'<rect x="{X-10}" y="{Y-18}" width="{W+20}" height="26" rx="12" fill="url(#metalLite)"/>'
        for wx in (X+26, X+118, X+210):
            b += f'<rect x="{wx}" y="{Y+30}" width="64" height="52" rx="8" fill="url(#glass)" stroke="{S.line_dark}" stroke-width="3"/>'
        b += f'<rect x="{X+14}" y="{Y+108}" width="{W-28}" height="20" rx="9" fill="url(#metalLite)"/>'
        b += f'<rect x="{X+24}" y="{Y+140}" width="150" height="86" rx="8" fill="url(#glass)" stroke="{S.line_dark}" stroke-width="3"/>'
        b += f'<line x1="{X+99}" y1="{Y+142}" x2="{X+99}" y2="{Y+224}" stroke="{S.line_dark}" stroke-width="5" opacity="0.6"/>'
        b += f'<rect x="{X+196}" y="{Y+134}" width="62" height="96" rx="8" fill="url(#metalDark)"/>'
        b += f'<rect x="{X+203}" y="{Y+141}" width="48" height="89" rx="6" fill="{("url(#glass)") if on else "url(#metalDark)"}"/>'
        b += f'<rect x="{X-14}" y="{Y+H-8}" width="{W+28}" height="22" rx="10" fill="url(#metalDark)"/>'
        if on: b += f'<rect x="{X}" y="{Y+H+10}" width="{W}" height="5" rx="2.5" fill="{S.acc}" opacity="0.85"/>'
        b += spec(f"{X+18},{Y} {X+70},{Y} {X+34},{Y+H} {X},{Y+H-40}", 0.06)
    elif n == 2:
        X, Y, W, H = 118, 128, 226, 304
        b += f'<rect x="{X+58}" y="{Y-34}" width="66" height="40" rx="8" fill="url(#metalDark)"/>'
        b += glow_shape(f'rect x="{X}" y="{Y}" width="{W}" height="{H}" rx="18"', S, on)
        b += f'<rect x="{X}" y="{Y}" width="{W}" height="{H}" rx="18" fill="url(#metalV)"/>'
        b += f'<rect x="{X+W-42}" y="{Y}" width="42" height="{H}" rx="18" fill="url(#sideShade)"/>'
        b += f'<rect x="{X-12}" y="{Y-14}" width="{W+24}" height="24" rx="11" fill="url(#metalLite)"/>'
        for fy in (Y+28, Y+112, Y+196):
            for wx in (X+24, X+118):
                b += f'<rect x="{wx}" y="{fy}" width="76" height="58" rx="8" fill="url(#glass)" stroke="{S.line_dark}" stroke-width="3"/>'
                b += f'<line x1="{wx+38}" y1="{fy+2}" x2="{wx+38}" y2="{fy+56}" stroke="{S.line_dark}" stroke-width="4" opacity="0.55"/>'
        b += f'<rect x="{X+78}" y="{Y+H-56}" width="66" height="56" rx="8" fill="url(#metalDark)"/>'
        b += f'<rect x="{X-16}" y="{Y+H-6}" width="{W+32}" height="22" rx="10" fill="url(#metalDark)"/>'
        if on: b += f'<rect x="{X}" y="{Y+H+12}" width="{W}" height="5" rx="2.5" fill="{S.acc}" opacity="0.85"/>'
        b += spec(f"{X+16},{Y} {X+62},{Y} {X+30},{Y+H} {X},{Y+H-46}", 0.06)
    else:
        X, Y, W, H = 134, 96, 200, 336
        b += f'<rect x="{X+W//2-5}" y="{Y-62}" width="10" height="62" rx="5" fill="url(#metalLite)"/>'
        tip = S.acc if on else "#5f7286"
        b += f'<circle cx="{X+W//2}" cy="{Y-66}" r="10" fill="{tip}"/>'
        if on: b += f'<circle cx="{X+W//2}" cy="{Y-66}" r="20" fill="url(#halo)"/>'
        b += glow_shape(f'rect x="{X}" y="{Y}" width="{W}" height="{H}" rx="18"', S, on)
        b += f'<rect x="{X}" y="{Y}" width="{W}" height="{H}" rx="18" fill="url(#metalV)"/>'
        b += f'<rect x="{X+W-38}" y="{Y}" width="38" height="{H}" rx="18" fill="url(#sideShade)"/>'
        b += f'<rect x="{X-12}" y="{Y-14}" width="{W+24}" height="24" rx="11" fill="url(#metalLite)"/>'
        for fy in (Y+26, Y+102, Y+178, Y+254):
            for wx in (X+22, X+104):
                b += f'<rect x="{wx}" y="{fy}" width="64" height="52" rx="7" fill="url(#glass)" stroke="{S.line_dark}" stroke-width="3"/>'
        b += f'<rect x="{X+66}" y="{Y+H-52}" width="60" height="52" rx="8" fill="url(#metalDark)"/>'
        b += f'<rect x="{X-16}" y="{Y+H-6}" width="{W+32}" height="22" rx="10" fill="url(#metalDark)"/>'
        if on: b += f'<rect x="{X}" y="{Y+H+12}" width="{W}" height="5" rx="2.5" fill="{S.acc}" opacity="0.85"/>'
        b += spec(f"{X+14},{Y} {X+56},{Y} {X+26},{Y+H} {X},{Y+H-50}", 0.06)
    b += badge(S, n)
    return b

# ---------------------------------------------------------------- line style (s1)
L_OFF, L_ON, L_CORE = "#2ea8c4", "#4fe3ff", "#eafdff"

def l_stroke(d, on, w=11):
    """neon line: off = 1 nét dịu; on = glow nhiều lớp + lõi trắng"""
    if not on:
        return f'<path d="{d}" fill="none" stroke="{L_OFF}" stroke-width="{w}" stroke-linecap="round" stroke-linejoin="round" opacity="0.9"/>'
    s = ""
    for ww, o in [(w+22, 0.08), (w+12, 0.16), (w+5, 0.35)]:
        s += f'<path d="{d}" fill="none" stroke="{L_ON}" stroke-width="{ww}" stroke-opacity="{o}" stroke-linecap="round" stroke-linejoin="round"/>'
    s += f'<path d="{d}" fill="none" stroke="{L_ON}" stroke-width="{w}" stroke-linecap="round" stroke-linejoin="round"/>'
    s += f'<path d="{d}" fill="none" stroke="{L_CORE}" stroke-width="{max(3,w-6)}" stroke-linecap="round" stroke-linejoin="round" opacity="0.9"/>'
    return s

def l_badge(n, on, cx=398, cy=400, r=54):
    col = L_ON if on else L_OFF
    s = f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="rgba(6,30,44,0.72)" stroke="{col}" stroke-width="8"/>'
    if on:
        s = (f'<circle cx="{cx}" cy="{cy}" r="{r+9}" fill="none" stroke="{L_ON}" stroke-width="14" stroke-opacity="0.16"/>' + s)
    s += f'<g transform="translate({cx},{cy})" fill="none" stroke-linecap="round" stroke-linejoin="round">'
    s += f'<path d="{NUMS[n]}" stroke="{col}" stroke-width="12"/>'
    if on: s += f'<path d="{NUMS[n]}" stroke="{L_CORE}" stroke-width="6" opacity="0.9"/>'
    s += '</g>'
    return s

def l_home(on):
    b = halo(on) if on else ""
    b += l_stroke("M 62,244 L 256,54 L 450,244", on, 13)
    b += l_stroke("M 106,256 L 106,430 L 406,430 L 406,256", on, 13)
    b += l_stroke("M 344,150 L 344,96 L 384,96 L 384,190", on, 9)
    b += l_stroke("M 146,430 L 146,300 A 8,8 0 0 1 154,292 L 214,292 A 8,8 0 0 1 222,300 L 222,430", on, 9)
    b += l_stroke("M 268,292 h 104 v 84 h -104 z M 320,292 v 84 M 268,334 h 104", on, 8)
    return b

def l_bed(on):
    b = halo(on, cy=280, r=230) if on else ""
    b += l_stroke("M 96,392 L 96,132 A 14,14 0 0 1 110,118 L 132,118 A 14,14 0 0 1 146,132 L 146,248", on, 12)
    b += l_stroke("M 146,252 L 430,252 A 34,34 0 0 1 464,286 L 464,392", on, 12)
    b += l_stroke("M 84,330 L 464,330", on, 12)
    b += l_stroke("M 120,330 L 120,414 M 440,330 L 440,414", on, 10)
    b += l_stroke("M 160,252 A 22,22 0 0 1 182,230 L 240,230 A 22,22 0 0 1 262,252", on, 8)
    if on:
        b += l_stroke("M 286,290 L 436,290", on, 6)
    return b

def l_tower(n, on):
    b = halo(on) if on else ""
    if n == 1:
        b += l_stroke("M 76,432 L 76,190 A 18,18 0 0 1 94,172 L 358,172 A 18,18 0 0 1 376,190 L 376,432 Z", on, 12)
        for wx in (108, 196, 284):
            b += l_stroke(f"M {wx},206 h 60 v 46 h -60 z", on, 7)
        b += l_stroke("M 92,286 L 360,286", on, 8)
        b += l_stroke("M 104,432 L 104,318 h 128 v 114", on, 7)
        b += l_stroke("M 276,432 L 276,326 h 58 v 106", on, 7)
    elif n == 2:
        b += l_stroke("M 118,432 L 118,146 A 18,18 0 0 1 136,128 L 326,128 A 18,18 0 0 1 344,146 L 344,432 Z", on, 12)
        b += l_stroke("M 176,128 L 176,94 h 66 v 34", on, 8)
        for fy in (160, 248, 336):
            for wx in (146, 246):
                b += l_stroke(f"M {wx},{fy} h 70 v 52 h -70 z", on, 7)
        b += l_stroke("M 196,432 L 196,376 h 66 v 56", on, 7)
    else:
        b += l_stroke("M 134,432 L 134,114 A 18,18 0 0 1 152,96 L 316,96 A 18,18 0 0 1 334,114 L 334,432 Z", on, 12)
        b += l_stroke("M 234,96 L 234,40", on, 8)
        b += (f'<circle cx="234" cy="32" r="9" fill="{L_ON if on else L_OFF}"/>')
        for fy in (126, 202, 278, 354):
            for wx in (160, 246):
                b += l_stroke(f"M {wx},{fy} h 62 v 48 h -62 z", on, 7)
    b += l_stroke("M 60,432 L 452,432", on, 10)
    b += l_badge(n, on)
    return b

def line_defs(on):
    return f"""<defs><radialGradient id="halo" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="{L_ON}" stop-opacity="0.25"/><stop offset="0.55" stop-color="{L_ON}" stop-opacity="0.10"/>
      <stop offset="1" stop-color="{L_ON}" stop-opacity="0"/></radialGradient></defs>"""

# ---------------------------------------------------------------- build all
def render(path, s):
    open(path, "w").write(s)
    cairosvg.svg2png(url=path, write_to=path.replace(".svg", ".png"), output_width=512, output_height=512)

ICON_KEYS = ["home", "bed", "t1", "t2", "t3"]

for st in ("off", "on"):
    on = st == "on"
    # s1 neon line
    parts = {"home": l_home(on), "bed": l_bed(on), "t1": l_tower(1, on), "t2": l_tower(2, on), "t3": l_tower(3, on)}
    for k, body in parts.items():
        s = f'<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">{line_defs(on)}{body}</svg>'
        render(f"{OUT}/s1_neonline_{k}_{st}.svg", s)
    # filled styles
    for S in (S2, S3, S4, S5):
        holo = S.key == "s5_holo"
        bodies = {"home": f_home(S, on), "bed": f_bed(S, on),
                  "t1": f_tower(S, 1, on), "t2": f_tower(S, 2, on), "t3": f_tower(S, 3, on)}
        for k, body in bodies.items():
            render(f"{OUT}/{S.key}_{k}_{st}.svg", wrap(S, body, on, holo))
print("done", len(os.listdir(OUT)), "files")
