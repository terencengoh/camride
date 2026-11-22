# Regenerates the CamRide icon / splash artwork (Pillow). Run from mobile/assets:
#   python3 ../scripts/gen-icons.py && for f in *.png; do base64 -w0 "$f" > "$f.b64"; done
# The PNGs are gitignored; the committed *.png.b64 files are decoded by scripts/decode-assets.js.
import math
from PIL import Image, ImageDraw
GREEN=(0,122,61,255); RED=(206,17,38,255); YELLOW=(252,209,22,255); WHITE=(255,255,255,255)
def star(d, cx, cy, r, fill):
    pts=[]
    for i in range(10):
        a=-math.pi/2+i*math.pi/5
        rr=r if i%2==0 else r*0.4
        pts.append((cx+rr*math.cos(a), cy+rr*math.sin(a)))
    d.polygon(pts, fill=fill)
def mark(size, scale, bg=None, mono=False):
    S=size*4
    im=Image.new("RGBA",(S,S),(0,0,0,0) if bg is None else bg)
    d=ImageDraw.Draw(im)
    c=S/2; R=S*0.30*scale; w=S*0.085*scale
    # C ring: arc from 40deg to 320deg (open on the right)
    box=[c-R,c-R,c+R,c+R]
    d.arc(box, start=45, end=315, fill=WHITE, width=int(w))
    # rounded ends
    for ang in (45,315):
        a=math.radians(ang); rr=R-w/2
        x=c+rr*math.cos(a); y=c+rr*math.sin(a)
        d.ellipse([x-w/2,y-w/2,x+w/2,y+w/2], fill=WHITE)
    star(d, c, c, R*0.42, WHITE if mono else YELLOW)
    if not mono:
        # red "road" dot to the right, in the C opening
        dr=w*0.55; x=c+R*0.98; d.ellipse([x-dr,c-dr,x+dr,c+dr], fill=RED)
    return im.resize((size,size), Image.LANCZOS)
mark(1024,1.0,bg=GREEN).convert("RGB").save("icon.png", optimize=True)
mark(1024,0.72).save("adaptive-icon.png", optimize=True)
mark(1024,1.0).save("splash-icon.png", optimize=True)
mark(96,1.15,mono=True).save("notification-icon.png", optimize=True)
