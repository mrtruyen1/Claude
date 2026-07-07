"""v2: polar rim completion + relight for buttons; haze swap for ON fans."""
from PIL import Image, ImageFilter
import numpy as np

CYAN = np.array([25, 199, 230], float)

def load(n): return np.array(Image.open(n).convert('RGBA')).astype(float)
def save(a,n): Image.fromarray(np.clip(a,0,255).astype(np.uint8),'RGBA').save(n)
def blur(a,r):
    return np.array(Image.fromarray(np.clip(a,0,255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(r)),float)

def new_glow(sil, r1=9, s1=0.62, r2=3.5, s2=0.5):
    g1 = blur(sil*255, r1)/255; g1/=max(g1.max(),1e-6)
    g2 = blur(sil*255, r2)/255; g2/=max(g2.max(),1e-6)
    ga = np.clip(np.maximum(g1*s1, g2*s2)*255, 0, 255)
    return ga

def over_glow(im, sil, ga):
    ca = im[...,3:4]*sil[...,None]
    oa = ca + ga[...,None]*(1-ca/255)
    orgb = (im[...,:3]*ca + CYAN*ga[...,None]*(1-ca/255))/np.maximum(oa,1e-6)
    out = np.zeros_like(im); out[...,:3]=orgb; out[...,3]=oa[...,0]
    return out

def smoothstep(x): return np.clip(x,0,1)**2*(3-2*np.clip(x,0,1))

def circular_smooth(v, sigma):
    n=len(v); k=int(sigma*4)|1
    ker=np.exp(-0.5*((np.arange(k)-k//2)/sigma)**2); ker/=ker.sum()
    return np.convolve(np.r_[v[-k:],v,v[:k]], ker,'same')[k:-k]

def fix_button(src,dst):
    im=load(src); H,W=im.shape[:2]
    a=im[...,3]; sm=(a>=235).astype(float)
    ys,xs=np.where(sm>0.5); cx,cy=xs.mean(),ys.mean()
    NT=1440; th=np.linspace(0,2*np.pi,NT,endpoint=False)
    Rmax=140
    rs=np.arange(0,Rmax,0.5)
    px=cx+np.cos(th)[:,None]*rs[None,:]; py=cy+np.sin(th)[:,None]*rs[None,:]
    ok=(px>=0)&(px<W)&(py>=0)&(py<H)
    smv=np.zeros_like(px); smv[ok]=sm[py[ok].astype(int),px[ok].astype(int)]
    r_out=np.array([rs[row.nonzero()[0].max()] if row.any() else 0 for row in smv>0.5])
    bx=cx+np.cos(th)*r_out
    gap=(bx<=25.5)&(np.cos(th)<0)
    # interpolate target radius across gap (periodic)
    idx=np.arange(NT); good=~gap
    r_t=np.interp(idx, idx[good], r_out[good], period=NT)
    r_t=circular_smooth(r_t, 8)
    # donor angles for fill
    gi=np.where(gap)[0]
    if len(gi):
        # find contiguous gap range (single block on left, may wrap; th=pi is left, no wrap)
        a0,a1=gi.min(),gi.max()
        thA,thB=th[(a0-3)%NT],th[(a1+3)%NT]
        yy,xx=np.mgrid[0:H,0:W]
        ang=np.arctan2(yy-cy,xx-cx)%(2*np.pi)
        rad=np.hypot(xx-cx,yy-cy)
        ti=(ang/(2*np.pi)*NT).astype(int)%NT
        in_gap=gap[ti]
        r_cut=r_out[ti]; r_tar=r_t[ti]
        fill=in_gap&(rad>=r_cut-1.5)&(rad<=r_tar+1)
        # donor sample coords: same radius, donor angle; blend between two sides
        frac=np.zeros_like(ang)
        span=(th[a1]-th[a0])
        frac=np.clip((ang-th[a0])/max(span,1e-6),0,1)
        for name,thd,wsel in [('A',thA,1-frac),('B',thB,frac)]:
            pass
        fy,fx=np.where(fill)
        fr=rad[fy,fx]; ff=frac[fy,fx]
        colA_x=(cx+np.cos(thA)*fr).astype(int).clip(0,W-1); colA_y=(cy+np.sin(thA)*fr).astype(int).clip(0,H-1)
        colB_x=(cx+np.cos(thB)*fr).astype(int).clip(0,W-1); colB_y=(cy+np.sin(thB)*fr).astype(int).clip(0,H-1)
        cA=im[colA_y,colA_x,:3]; cB=im[colB_y,colB_x,:3]
        col=cA*(1-ff[:,None])+cB*ff[:,None]
        # blend with existing where already solid, else replace
        edge=smoothstep((r_tar[fy,fx]-fr)/1.8)
        oldsolid=sm[fy,fx]
        w=np.maximum(edge*(1-oldsolid*0.55),0)
        im[fy,fx,:3]=im[fy,fx,:3]*(1-w[:,None])+col*w[:,None]
        na=np.maximum(im[fy,fx,3], edge*255)
        im[fy,fx,3]=na
        sm[fy,fx]=np.maximum(sm[fy,fx],edge)
    # relight dark rim angles (keep hue)
    yy,xx=np.mgrid[0:H,0:W]
    ang=np.arctan2(yy-cy,xx-cx)%(2*np.pi); rad=np.hypot(xx-cx,yy-cy)
    ti=(ang/(2*np.pi)*NT).astype(int)%NT
    r_tar=r_t[ti]
    lum=im[...,:3]@np.array([.299,.587,.114])
    annw=smoothstep((rad-0.86*r_tar)/(0.04*r_tar))*smoothstep((r_tar+1-rad)/(0.04*r_tar))*sm
    peak=np.zeros(NT)
    for t0 in range(NT):
        pass
    # vectorized per-angle peak: bin pixels by ti
    sel=annw>0.3
    binlum=np.zeros(NT); 
    tsel=ti[sel]; lsel=lum[sel]
    order=np.argsort(tsel)
    tsrt=tsel[order]; lsrt=lsel[order]
    uq,st=np.unique(tsrt,return_index=True)
    for i,u in enumerate(uq):
        en=st[i+1] if i+1<len(uq) else len(tsrt)
        binlum[u]=np.percentile(lsrt[st[i]:en],92)
    binlum[binlum==0]=np.nan
    med=np.nanmedian(binlum)
    tgt=0.52*med
    gain=np.where(np.isnan(binlum),1,np.clip(tgt/np.maximum(binlum,1),1,2.2))
    gain=circular_smooth(gain,10)
    g=1+(gain[ti]-1)*annw
    im[...,:3]=np.clip(im[...,:3]*g[...,None],0,255)
    # keep all original pixels inside the button disk (glass face is semi-transparent by design);
    # replace everything outside with a fresh, symmetric ring glow
    inside=smoothstep((r_tar+1.0-rad)/2.0)
    disk=(rad<=r_tar).astype(float)
    ga=new_glow(disk)*smoothstep((rad-(r_tar-2.0))/2.5)
    ca=im[...,3:4]*inside[...,None]
    oa=ca+ga[...,None]*(1-ca/255)
    orgb=(im[...,:3]*ca+CYAN*ga[...,None]*(1-ca/255))/np.maximum(oa,1e-6)
    out=np.zeros_like(im); out[...,:3]=orgb; out[...,3]=oa[...,0]
    save(out,dst)

def fix_on_fan(src,dst,lo=215,hi=248):
    im=load(src); a=im[...,3]
    sil=np.clip((a-lo)/(hi-lo),0,1)
    ga=new_glow(sil,12,0.85,4,0.6)
    save(over_glow(im,sil,ga),dst)


import os
SRC = '/config/www/tiles_chrome_v2'
WEBP = '/config/www/tiles_chrome_v2_webp'
BAK = '/config/www/tiles_chrome_v2_before_stroke_fix'
os.makedirs(BAK, exist_ok=True)

TARGETS = [
    ('wall_fan_sys3d_swing', 'button'),
    ('wall_fan_sys3d_timer', 'button'),
    ('ceiling_fan_ctrl_sys3d_stop', 'button'),
    ('stand_fan_sys3d_on', 'fan'),
    ('wall_fan_sys3d_on', 'fan'),
]
import shutil
for name, kind in TARGETS:
    png = f'{SRC}/{name}.png'
    bak = f'{BAK}/{name}.png'
    if not os.path.exists(bak):
        shutil.copy2(png, bak)
    out_png = png  # overwrite source
    if kind == 'button':
        fix_button(bak, out_png)
    else:
        fix_on_fan(bak, out_png)
    Image.open(out_png).save(f'{WEBP}/{name}.webp', quality=92, method=6)
    print('fixed', name, os.path.getsize(out_png), os.path.getsize(f'{WEBP}/{name}.webp'))
print('ALL DONE')
