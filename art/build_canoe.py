"""Build the canoe with Blender 4.x: blender -b -P art/build_canoe.py."""
import math
import tempfile
from pathlib import Path

import bpy
import bmesh
import numpy as np
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
bpy.ops.wm.read_factory_settings(use_empty=True)

# A strip of the atlas represents a single length of timber. UVs follow each
# plank around the hull, so the grain still runs to the stem at the bow.
def timber_atlas():
    w, h = 1536, 1024
    pixels = np.ones((h, w, 4), dtype=np.float32)
    x = np.arange(w)[None, :]
    y = np.arange(32)[:, None]
    nrng = np.random.default_rng(8)
    for row in range(32):
        if row < 20:
            base = np.array([.601, .371, .208]) * nrng.uniform(.86, 1.10)
            base[0] += nrng.uniform(-.018, .018)
        elif row < 24:
            base = np.array([.72, .524, .323]) * nrng.uniform(.94, 1.05)
        elif row < 28:
            base = np.array([.352, .212, .124]) * nrng.uniform(.90, 1.08)
        else:
            base = np.array([.526, .406, .250]) * nrng.uniform(.90, 1.09)
        phase = nrng.uniform(0, 2 * math.pi, 6)
        grain = y + 1.0 * np.sin(x / 114 + phase[0]) + 1.9 * np.sin(x / 341 + phase[1])
        grain += .60 * np.sin(y / 7 + x / 245 + phase[2])
        season = .06 * np.sin(grain * .58 + phase[3])
        latewood = np.maximum(0, np.cos(grain * 1.45 + .45 * np.sin(x / 149))) ** 9
        pores = np.maximum(0, np.cos(grain * 2.83 + .42 * np.sin(x / 26 + phase[4]))) ** 16
        shade = 1 + season - .19 * latewood - .11 * pores + .017 * nrng.normal(size=(32, w))
        shade += .045 * np.sin(x / 331 + phase[5])
        pixels[row*32:(row+1)*32, :, :3] = np.clip(shade[...,None] * base, 0, 1)
    image = bpy.data.images.new("Quarter-sawn cedar, ash and walnut", width=w, height=h, alpha=False)
    image.pixels.foreach_set(pixels.reshape(-1))
    image.filepath_raw = str(Path(tempfile.gettempdir()) / 'relaxcanoe-woodgrain.png')
    image.file_format = 'PNG'
    image.save()
    image.pack()
    return image

def material(name, rgb, roughness, metal=0, texture=None):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*rgb, 1)
    m.use_nodes = True
    shader = m.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (*rgb, 1)
    shader.inputs['Roughness'].default_value = roughness
    shader.inputs['Metallic'].default_value = metal
    if texture:
        node = m.node_tree.nodes.new('ShaderNodeTexImage')
        node.image = texture
        m.node_tree.links.new(node.outputs['Color'], shader.inputs['Base Color'])
    return m

grain = material('Oiled boat timber', (.55,.31,.14), .43, texture=timber_atlas())
brass = material('Aged silicon bronze', (.32,.21,.077), .32, .76)
cane = material('Seat cane', (.35,.215,.104), .68)
cord = material('Tarred painter', (.067,.052,.036), .92)
hemp = material('Braided flax', (.35,.258,.155), .9)

# Pool disconnected pieces into one mesh per moving part and material.
parts = {}
part_name = 'Hull'
def face(points, uvs=None, mat=grain, smooth=True):
    key = part_name, mat
    verts, faces, tex, sh = parts.setdefault(key, ([], [], [], []))
    start = len(verts)
    verts.extend(points)
    faces.append(tuple(range(start,start+len(points))))
    tex.extend(uvs or [(0,0)]*len(points))
    sh.append(smooth)

def tint(row, u, v):
    return ((.005+u*.99), (row + .04 + .92*v)/32)

def quad(points, row=20, u0=0, u1=1, mat=grain, smooth=True):
    face(points,[tint(row,u0,0),tint(row,u1,0),tint(row,u1,1),tint(row,u0,1)],mat,smooth)

def tube(path, radius, row=22, mat=grain, sides=7):
    path = [Vector(v) for v in path]
    rings=[]
    for i, pos in enumerate(path):
        axis=(path[min(i+1,len(path)-1)]-path[max(0,i-1)]).normalized()
        side=axis.cross(Vector((0,0,1)))
        if side.length < .01:
            side=axis.cross(Vector((1,0,0)))
        side.normalize()
        up=axis.cross(side)
        rings.append([pos+radius*(math.cos(a*math.tau/sides)*side+math.sin(a*math.tau/sides)*up) for a in range(sides)])
    for i in range(len(path)-1):
        for j in range(sides):
            k=(j+1)%sides
            quad([rings[i][k],rings[i+1][k],rings[i+1][j],rings[i][j]],row,i/(len(path)-1),(i+1)/(len(path)-1),mat)
    face(rings[0][::-1],mat=mat)
    face(rings[-1],mat=mat)

def beam(a,b,width,thickness,row=21):
    a,b=Vector(a),Vector(b)
    axis=(b-a).normalized()
    side=axis.cross(Vector((0,0,1))).normalized()
    up=side.cross(axis).normalized()
    # Rounded edges on furniture and trim catch the sky light.
    sec=[]
    for sy,sz in [(1,1),(-1,1),(-1,-1),(1,-1)]:
        sec.extend([(sy*width*.5,sz*(thickness*.5-.003)),(sy*(width*.5-.003),sz*thickness*.5)] if sy==sz else [(sy*(width*.5-.003),sz*thickness*.5),(sy*width*.5,sz*(thickness*.5-.003))])
    rings=[[point+side*dy+up*dz for dy,dz in sec] for point in (a,b)]
    for j in range(8):
        k=(j+1)%8
        quad([rings[0][j],rings[1][j],rings[1][k],rings[0][k]],row,smooth=False)
    face(rings[0],mat=grain)
    face(rings[1][::-1],mat=grain)

stern, bow = -1.25, 3.65
def hull(y,phi,inside=False):
    t = (2*y-stern-bow)/(bow-stern)
    end = min(1, abs(t))
    width=.008 + .462*(1-end**1.9)**.86
    floor=-.143 + .253*end**3.8
    rim=.25 + .34*end**3.6 + .052*end**13
    if inside:
        width=max(.002,width-.012)
        floor+=.012
    return (width*math.sin(phi),y,floor+(rim-floor)*(1-math.cos(phi)))

# Paired surfaces enclose the planking, with individual strip UV islands.
sections=56
strips=40
for shell in (False,True):
    for j in range(strips):
        p0=(j/strips-.5)*math.pi
        p1=((j+1)/strips-.5)*math.pi
        row=(j*7+int(shell)*3)%20
        for i in range(sections):
            u,v=i/sections,(i+1)/sections
            y0=stern+u*(bow-stern)
            y1=stern+v*(bow-stern)
            points=[hull(y0,p0,shell),hull(y1,p0,shell),hull(y1,p1,shell),hull(y0,p1,shell)]
            uv=[tint(row,u,0),tint(row,v,0),tint(row,v,1),tint(row,u,1)]
            face(points[::-1] if shell else points, uv[::-1] if shell else uv)
for side in (-1,1):
    rail=[hull(stern+(bow-stern)*i/sections,side*math.pi/2) for i in range(sections+1)]
    tube(rail,.020,row=24,sides=8)
    tube([(x*.958,y,z+.006) for x,y,z in rail],.013,row=21,sides=8)
    tube([(x*.987,y,z-.035) for x,y,z in rail],.0042,row=21,sides=6)

# Close the ends with laminated stem bands.
for end in (stern,bow):
    ring=[hull(end,(j/strips-.5)*math.pi) for j in range(strips+1)]
    face(ring)
    tube(ring,.010,row=25,sides=6)

# Bent ribs follow the inner skin. Tangent offsets keep their top faces flush.
for y in np.arange(stern+.23,bow-.12,.31):
    for j in range(28):
        a=(j/28-.5)*math.pi*.965
        b=((j+1)/28-.5)*math.pi*.965
        def rib(yy,phi):
            x,_,z=hull(yy,phi,True)
            return (x-.006*math.sin(phi),yy,z+.007*math.cos(phi))
        pts=[rib(y-.014,a),rib(y-.014,b),rib(y+.014,b),rib(y+.014,a)]
        quad(pts,20+(j//12)%3,j/28,(j+1)/28)
# Keelson protects the bottom inside.
tube([(0,stern+.07+(bow-stern-.14)*i/sections,hull(stern+.07+(bow-stern-.14)*i/sections,0,True)[2]+.005) for i in range(sections+1)],.012,25)

# Shaped thwarts grow wider at their bolted ends.
def thwart(y):
    width,_,z=hull(y,math.pi/2)
    z-=.039
    def end(x, side, dz):
        t=x/width
        breadth=.024+.041*abs(t)**4+.012*math.exp(-(t/.22)**2)
        return (x,y+side*breadth,z+dz+.009*(1-t*t))
    for i in range(16):
        x0=(i/8-1)*width
        x1=((i+1)/8-1)*width
        for a,b in [((-1,0),(1,0)),((1,0),(1,-.019)),((1,-.019),(-1,-.019)),((-1,-.019),(-1,0))]:
            quad([end(x0,*a),end(x1,*a),end(x1,*b),end(x0,*b)],21,i/16,(i+1)/16)
    for side in (-1,1):
        x=side*(width-.027)
        tube([(x,y,z+.002),(x,y,z+.007)],.007,mat=brass,sides=10)
thwart(.91)
thwart(-.72)

def seat(y):
    z=.17
    breadths=[hull(y+d,math.pi/2)[0]-.022 for d in (-.145,.145)]
    for d,w in zip((-.145,.145),breadths):
        beam((-w,y+d,z),(w,y+d,z),.039,.028,23)
    w=min(breadths)*.77
    for side in (-1,1):
        beam((side*w,y-.145,z),(side*w,y+.145,z),.035,.03,23)
    # Continuous flat strands alternate over and under a second set of strands.
    def weave(a,b,half,across):
        off=(half,0,0) if across else (0,half,0)
        a,b=Vector(a),Vector(b)
        d=Vector(off)
        face([a-d,b-d,b+d,a+d],mat=cane,smooth=False)
    for i,x in enumerate(np.arange(-w+.012,w-.005,.011)):
        weave((x,y-.126,z+.001),(x,y+.126,z+.001),.0036,True)
    for i,d in enumerate(np.arange(-.126,.127,.011)):
        weave((-w,y+d,z+.002),(w,y+d,z+.002),.0036,False)
    for s in (-1,1):
        for d,ww in zip((-.145,.145),breadths):
            tube([(s*ww,y+d,z),(s*ww,y+d,hull(y+d,math.pi/2)[2]-.002)],.009,24,brass,8)
seat(.03)
seat(2.05)

# Cap triangles and split king plank.
for sign,end in ((1,bow),(-1,stern)):
    for side in (-1,1):
        for i in range(15):
            t,v=i/15,(i+1)/15
            def deck(q,edge):
                y=end-sign*(.50*(1-q)+.008)
                w,_,z=hull(y,math.pi/2)
                return (side*(w-.003)*edge,y,z+.011*(1-edge))
            quad([deck(t,0),deck(v,0),deck(v,1),deck(t,1)],25 if side>0 else 24,t,v)
    points=[]
    for i in range(16):
        y=end-sign*(.50*(1-i/15)+.008)
        points.append((0,y,hull(y,math.pi/2)[2]+.017))
    tube(points,.0055,22)

# A short, loose painter coil at the bow.
rope=[]
for i in range(90):
    t=i/89
    a=t*math.tau*2.25
    y=bow-.37+.064*math.sin(a)+t*.044
    x=.004+(.041-.012*t)*math.cos(a)
    rope.append((x,y,hull(y,math.pi/2)[2]+.020+t*.009))
rope.extend([(.014,bow-.21,hull(bow-.21,math.pi/2)[2]+.025),(0,bow-.13,hull(bow-.13,math.pi/2)[2]+.024)])
tube(rope,.0048,mat=hemp,sides=6)

# A laminated beavertail paddle, modelled around the upper grip pivot.
part_name='Paddle'
tube([(0,0,-.032),(0,0,-.41),(0,.003,-.85),(0,.005,-1.02)],.017,22,sides=12)
profile=[(.86,.014,.015),(.94,.022,.017),(1.03,.039,.016),(1.14,.068,.013),(1.26,.089,.010),(1.39,.088,.008),(1.49,.075,.007),(1.544,.053,.006),(1.566,.03,.004),(1.574,.0008,.002)]
lanes=[-1,-.70,-.48,-.14,-.105,.105,.14,.48,.70,1]
rows=[23,7,15,20,24,20,15,7,23]
for i,((a,wa,da),(b,wb,db)) in enumerate(zip(profile,profile[1:])):
    for j,(p,q) in enumerate(zip(lanes,lanes[1:])):
        def blade(depth,w,d,r,side):
            return (w*r, side*d*(.09+.91*(1-abs(r)**1.36)),-depth)
        for s in (-1,1):
            ps=[blade(a,wa,da,p,s),blade(b,wb,db,p,s),blade(b,wb,db,q,s),blade(a,wa,da,q,s)]
            quad(ps if s==-1 else ps[::-1],rows[j],a/1.58,b/1.58)
    for r in (-1,1):
        quad([blade(a,wa,da,r,-1),blade(b,wb,db,r,-1),blade(b,wb,db,r,1),blade(a,wa,da,r,1)],25)
# Pear-shaped palm grip.
grip=[(-.085,.015,.015),(-.052,.023,.018),(-.031,.043,.019),(-.010,.050,.018),(.008,.043,.014),(.016,.027,.009),(.019,.0008,.0008)]
for i,((a,wa,da),(b,wb,db)) in enumerate(zip(grip,grip[1:])):
    for n in range(16):
        def gp(z,w,d,j): return (w*math.cos(j*math.tau/16),d*math.sin(j*math.tau/16),z)
        quad([gp(a,wa,da,n+1),gp(b,wb,db,n+1),gp(b,wb,db,n),gp(a,wa,da,n)],24,i/6,(i+1)/6)

for name in ('Hull','Paddle'):
    obj=bpy.data.objects.new(name,None)
    bpy.context.collection.objects.link(obj)
    for (part, mat),(verts,faces,uvs,shading) in parts.items():
        if part!=name: continue
        mesh=bpy.data.meshes.new(name+' '+mat.name)
        mesh.from_pydata(verts,[],faces)
        mesh.update()
        uv=mesh.uv_layers.new(name='Grain')
        uv.data.foreach_set('uv',np.array(uvs,dtype=np.float32).ravel())
        child=bpy.data.objects.new(mesh.name,mesh)
        mesh.materials.append(mat)
        # Double-sided geometry permits proper inspection of thin cane and trim.
        mat.use_backface_culling=False
        child.parent=obj
        bpy.context.collection.objects.link(child)
        for poly,smooth in zip(mesh.polygons,shading):
            poly.use_smooth=smooth
        bm=bmesh.new()
        bm.from_mesh(mesh)
        bmesh.ops.remove_doubles(bm,verts=bm.verts,dist=0.000001)
        bm.to_mesh(mesh)
        bm.free()

out=ROOT/'public/models/cedar-canoe.glb'
out.parent.mkdir(parents=True,exist_ok=True)
bpy.ops.export_scene.gltf(filepath=str(out), export_format='GLB', export_yup=True,
                          export_cameras=False, export_lights=False, export_animations=False,
                          export_image_format='JPEG', export_jpeg_quality=89)
print('Exported', out)
