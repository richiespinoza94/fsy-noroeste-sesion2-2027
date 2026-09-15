from pathlib import Path
from math import ceil
import html

OUT=Path(__file__).parent
def txt(x,y,t,cls='label',anchor='middle'):
    return f'<text x="{x}" y="{y}" class="{cls}" text-anchor="{anchor}">{html.escape(str(t))}</text>'
def line(x,y,a,b,cls='edge'):
    return f'<line x1="{x}" y1="{y}" x2="{a}" y2="{b}" class="{cls}"/>'
def rect(x,y,w,h,cls='box'):
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" class="{cls}"/>'
def dh(x,a,y,t):
    return line(x,y,a,y,'dim')+line(x,y-6,x,y+6,'dim')+line(a,y-6,a,y+6,'dim')+txt((x+a)/2,y-7,t,'measure')
def dv(y,b,x,t):
    return line(x,y,x,b,'dim')+line(x-5,y,x+5,y,'dim')+line(x-5,b,x+5,b,'dim')+f'<text transform="translate({x-9},{(y+b)/2}) rotate(-90)" class="measure" text-anchor="middle">{t}</text>'
def svg(content,w=1100,h=680):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" role="img">{content}</svg>'
def doors(x,y,w,h,n,glass=False,up=False):
    s=''
    for i in range(n):
        a=x+i*w/n
        s+=rect(a+1,y+1,w/n-2,h-2,'glass' if glass else 'door')
        if up:
            s+=f'<path d="M {a+6},{y+h-6} L {a+w/n/2},{y+8} L {a+w/n-6},{y+h-6}" class="swing"/>'
        else:
            hinge=a+4 if i%2==0 else a+w/n-4
            tip=a+w/n-6 if i%2==0 else a+6
            s+=f'<path d="M {hinge},{y+6} L {tip},{y+h/2} L {hinge},{y+h-6}" class="swing"/>'
    return s

S=.25; X=100; Y=100; floor=Y+2400*S
mods=[('A',750,2400,400,2),('B',885,700,320,2),('C',610,450,320,1),('D',885,700,320,2),('E',1280,700,320,3),('F',850,450,320,2)]
a=line(75,Y,960,Y,'wall')+line(75,floor,960,floor,'wall')+txt(965,Y+4,'+2400','note','start')+txt(965,floor+4,'±0','note','start')
x=X
for id,w,h,d,n in mods[:4]:
    yy=Y+(2400-h)*S if id=='A' else Y
    hh=h*S
    if id=='A':
        a+=rect(x,Y,w*S,2300*S,'box')+rect(x,Y+2300*S,w*S,100*S,'plinth')
        a+=doors(x,Y,w*S,1150*S,2,True)+doors(x,Y+1150*S,w*S,1150*S,2,True)
        for z in (380,760,1530,1910): a+=line(x+4,Y+z*S,x+w*S-4,Y+z*S,'shelf')
        a+=line(x+9,Y+10,x+9,Y+2300*S-10,'led')+line(x+w*S-9,Y+10,x+w*S-9,Y+2300*S-10,'led')
    else:
        a+=doors(x,yy,w*S,hh,n,up=id=='C')
    a+=dh(x,x+w*S,70,str(w))+txt(x+w*S/2,45,id,'id')
    if id=='C':
        a+=rect(x+4,Y+450*S+20,w*S-8,30,'ghost')+txt(x+w*S/2,Y+450*S+40,'CAMPANA','note')
        a+=txt(x+w*S/2,Y+700*S+35,'Hueco 610','note')
    x+=w*S
a+=dh(X,x,25,'3130 · suma del texto')+dv(Y,floor,55,'2400')+dv(Y,Y+175,930,'700')
a+=txt(500,760,'Alzado A · tramo recto; esquina K se muestra en planta. C: altura 450 propuesta.','note')
front=svg(a,1100,800)

b=line(70,100,980,100,'wall')+line(70,700,980,700,'wall')
x=160
for id,w,h,d,n in mods[4:]:
    b+=doors(x,100,w*S,h*S,n)+dh(x,x+w*S,70,w)+txt(x+w*S/2,40,id,'id')
    if id=='F':
        b+=rect(x+10,100+650*S,(w-80)*S,1750*S,'ghost')+txt(x+w*S/2,440,'REFRIGERADOR','label')+txt(x+w*S/2,465,'envolvente ilustrativa','note')
        b+=dv(100+450*S,100+650*S,x+w*S+35,'200*')
    x+=w*S
b+=dv(100,275,110,'700')+dv(100,212.5,745,'450')+dv(212.5,700,800,'1950 hasta piso')+dh(160,x,740,'2130 · sin esquina')
b+=txt(520,790,'*Con holgura de 200–250, altura del equipo = 1700–1750; verificar modelo y ventilación.','note')
side=svg(b,1100,820)

# Planta: los largos rectos se preservan y se agrega K, exclusivamente como hipótesis.
p=.22; ox=110; oy=120
P=lambda x: ox+x*p
Q=lambda y: oy+y*p
c=line(P(0),Q(0),P(3730),Q(0),'wall')+line(P(3730),Q(0),P(3730),Q(2730),'wall')
x=0
for id,w,h,d,n in mods[:4]:
    c+=rect(P(x),Q(0),w*p,d*p)+txt(P(x+w/2),Q(d/2)+4,id,'id')+dh(P(x),P(x+w),90,w)
    x+=w
pts=[(3130,0),(3730,0),(3730,600),(3410,600),(3130,320)]
c+='<polygon points="'+' '.join(f'{P(x)},{Q(y)}' for x,y in pts)+'" class="proposal"/>'
c+=line(P(3410),Q(600),P(3130),Q(320),'diag')+txt(P(3490),Q(220),'K*','id')
y=600
for id,w,h,d,n in mods[4:]:
    c+=rect(P(3410),Q(y),320*p,w*p)+txt(P(3570),Q(y+w/2),id,'id')+dv(Q(y),Q(y+w),1000,w)
    y+=w
c+=dh(P(3130),P(3730),55,'600*')+dv(Q(0),Q(600),960,'600*')+dh(P(0),P(3730),25,'3730* total de esta propuesta')
c+=dv(Q(600),Q(2730),1050,'2130 sin esquina')+dv(Q(0),Q(2730),1090,'2730* total')
c+=dv(Q(0),Q(400),80,'400')+dv(Q(0),Q(320),P(1550),'320')
c+=txt(370,360,'INTERIOR DE LA COCINA','label')+txt(370,393,'Frente diagonal K: 396 aprox. / 45°','note')
c+=txt(370,420,'600 − 320 = 280; diagonal = 280 × √2','note')
c+=txt(370,465,'*K es una propuesta añadida; no una cota de la fuente.','warn')
c+=txt(370,491,'Si 885 o 1280 incluyen la esquina, recalcular esos módulos.','note')
c+=txt(370,517,'No cortar D, E ni K hasta cerrar esta interpretación.','warn')
plant=svg(c,1150,800)

d=''
for x,depth,title in [(140,400,'A · alacena'),(450,320,'B / D / E · altos'),(760,320,'F · sobre refrigerador')]:
    height=2400 if x==140 else 700 if x==450 else 450
    d+=line(x,90,x,710,'wall')+rect(x,100,depth*S,height*S)+dh(x,x+depth*S,70,depth)+txt(x+depth*S/2,35,title,'label')
    if x==140:
        d+=rect(x,675,depth*S,25,'plinth')
        for yy in [195,290,387.5,482.5,577.5]:d+=line(x+3,yy,x+depth*S-5,yy,'shelf')
    elif x==450: d+=line(x+3,187.5,x+depth*S-5,187.5,'shelf')
    d+=dv(100,100+height*S,x+depth*S+40,height)
d+=line(90,700,970,700,'wall')+txt(540,750,'Profundidades exteriores terminadas. Cuerpo alto: 297 + fondo 3 + luz 2 + puerta 18 = 320.','note')
cuts=svg(d,1100,800)

def table(headers,rows):
    return '<table><thead><tr>'+''.join(f'<th>{h}</th>' for h in headers)+'</tr></thead><tbody>'+''.join('<tr>'+''.join(f'<td>{v}</td>' for v in row)+'</tr>' for row in rows)+'</tbody></table>'
doorrows=[['A','4 propuestas','375 × 1150','372 × 1147','Vidrio en marco; dos niveles'],['B','2','442,5 × 700','439,5 × 697','Batientes'],['C','1','610 × 450*','607 × 447*','Basculante hacia arriba'],['D','2','442,5 × 700','439,5 × 697','Los 440 de la fuente son aproximados'],['E','3','426,67 × 700','423,67 × 697','Tres iguales; apoyo interno en ejes de hojas'],['F','2','425 × 450','422 × 447','Batientes'],['K','1 propuesta','Diagonal ≈396 × 700','Por definir con herraje','Frente a 45°']]
pieces=[]
def add(mod,name,n,L,W,t=18,edge='F:2 / T:0 / I:0 / D:0',grain='L'):
    pieces.append([mod,name,n,L,W,t,grain,edge])
for id,w,h,dep,n in mods:
    if id=='A':h=2300
    body=dep-23
    add(id,'Laterales',2,h,body)
    add(id,'Piso y techo',2,w-36,body,edge='F:1 / T:0 / I:0 / D:0')
    add(id,'Fondo superficial',1,w,h,3,'Sin canto','—')
    if id=='A':
        add(id,'Entrepaño fijo central',1,714,body)
        add(id,'Estantes regulables',4,712,body-20)
        add(id,'Zócalo frontal',1,750,100)
    if id in ('B','D'):
        add(id,'Divisoria central',1,h-36,body-10)
        add(id,'Estantes por vano',2,(w-54)/2-2,body-20)
    if id=='E':
        add(id,'Divisorias en ejes 426,67 / 853,33',2,h-36,body-10)
        add(id,'Estantes vanos extremos',2,397.6667,body-20)
        add(id,'Estante vano central',1,406.6667,body-20)
    if id!='A':add(id,'Frentes opacos terminados',n,w/n-3,h-3,edge='2 mm en 4 lados',grain='H')
rows=[[m,name,n,f'{L:.2f}',f'{W:.2f}',t,g,e] for m,name,n,L,W,t,g,e in pieces]
area={t:sum(n*L*W/1e6 for _,_,n,L,W,tt,_,_ in pieces if t==tt) for t in (18,3)}
assert sum(m[1] for m in mods[:4])==3130
assert sum(m[1] for m in mods[4:])==2130
assert abs(3*423.6666666667+4*1.5+2*1.5-1280)<.001

css='''*{box-sizing:border-box}body{margin:0;background:#edf1f2;color:#20383e;font:15px/1.55 system-ui,sans-serif}header,main{max-width:1220px;margin:auto}header{padding:45px 32px 28px}h1{font-size:38px;line-height:1.15;margin:8px 0}h2{font-size:24px;margin:0 0 10px}h3{font-size:18px}p{max-width:1000px}.eyebrow{letter-spacing:3px;font-size:12px;color:#3e777e}.meta{color:#587078}.badge{display:inline-block;background:#fff0d6;color:#81591a;padding:6px 12px;border-radius:4px}nav{display:flex;gap:9px;flex-wrap:wrap;margin:20px 0}a,button{color:#1b5f68}nav a,button{background:white;border:1px solid #becdd0;padding:8px 14px;border-radius:5px;font:inherit;text-decoration:none;cursor:pointer}.sheet{background:white;padding:30px;margin:0 12px 24px;border:1px solid #d7e0e2;border-radius:8px}.caption{font-size:13px;color:#526b72;border-top:1px solid #dbe2e4;padding-top:10px}.alert{background:#fff7e8;border-left:4px solid #d7a143;padding:14px 18px}svg{width:100%;height:auto;max-height:760px;display:block}.box{fill:#e9f1f1;stroke:#29484f;stroke-width:1.5}.door{fill:#f3f6f4;stroke:#29484f;stroke-width:1.4}.glass{fill:#daedf1;stroke:#29484f;stroke-width:1.4}.plinth{fill:#b6c1c2;stroke:#29484f}.edge,.wall{stroke:#29484f;stroke-width:2;fill:none}.wall{stroke-width:2.5}.dim{stroke:#52868f;stroke-width:1;fill:none}.swing{stroke:#6a8a90;stroke-width:1;stroke-dasharray:5 4;fill:none}.ghost{stroke:#97a4a8;stroke-dasharray:7 5;fill:#f8f9f9}.shelf{stroke:#819ba0;stroke-dasharray:5 3}.led{stroke:#eab64d;stroke-width:3}.proposal{fill:#fff0d7;stroke:#b88227;stroke-width:2;stroke-dasharray:6 4}.diag{stroke:#b88227;stroke-width:4}.label{font:15px system-ui;fill:#29484f}.id{font:bold 19px system-ui;fill:#29484f}.measure{font:14px monospace;fill:#326d79}.note{font:13px system-ui;fill:#62767b}.warn{font:14px system-ui;fill:#976a23}table{border-collapse:collapse;width:100%;font-size:13px}th,td{padding:9px 10px;text-align:left;border-bottom:1px solid #dce5e6}th{background:#edf4f4}tbody tr:nth-child(even){background:#fafcfc}.scroll{overflow:auto}summary{cursor:pointer;font-weight:600;padding:10px}input{width:100px;padding:7px;border:1px solid #abc}footer{padding:20px 32px 40px;color:#64777c}@media print{@page{size:A3 landscape;margin:12mm}body{background:white;font-size:11px}header{padding:0 12px}h1{font-size:25px}nav,button{display:none}.sheet{break-before:page;border:0;padding:0;margin:0}svg{height:225mm;max-height:none}table{font-size:10px}th,td{padding:5px}tr{break-inside:avoid}.caption{font-size:10px}details{display:block}footer{display:none}}'''
sections=[('frente','01 / Alzado principal',front,'Dimensiones en mm. Línea de techo +2400; base de altos +1700. Alacena: zócalo de 100 y cuerpo de 2300 propuestos. Las diagonales discontinuas indican bisagra en el lado de base del triángulo.'),('retorno','02 / Alzado del retorno derecho',side,'Altos E a +1700. Bajo F a +1950. Los 250 mm son la diferencia entre las bases de E y F; la ventilación real depende de la altura del refrigerador.'),('planta','03 / Planta y resolución de esquina',plant,'Vista superior. Profundidad 320 en altos y 400 en alacena. La pieza K ocupa una esquina adicional de 600 × 600; estos totales NO son medidas verificadas del ambiente.'),('cortes','04 / Cortes laterales',cuts,'Cortes esquemáticos por módulos. El espesor de tablero propuesto es 18 mm; el fondo superficial, 3 mm. Altura de techo nominal sin margen de montaje: prever remate y tolerancia tras medir en obra.')]
body=''.join(f'<section class="sheet" id="{i}"><div class="eyebrow">REPOSTERO EN L · R01</div><h2>{title}</h2>{drawing}<p class="caption">{cap}</p></section>' for i,title,drawing,cap in sections)
body+='<section class="sheet" id="puertas"><h2>05 / Puertas y criterios de diseño</h2>'+table(['Módulo','Cantidad','Reparto nominal (ancho × alto)','Exterior terminado propuesto','Apertura / detalle'],doorrows)+'''<p>Holguras de frentes: 1,5 mm en el perímetro de cada módulo y 3 mm entre hojas. Fórmula: ancho = (W − 3 − 3 × (n−1)) / n; alto = H − 3. Las medidas nominales del pedido no son medidas de corte.</p><p>La alacena se propone con cuatro hojas de vidrio en marco, divididas en dos niveles de 1150, para conservar la altura completa con puertas manejables. Cristales: cotizar por 4 unidades, definir espesor y corte con el fabricante del marco. LED vertical en ambos laterales interiores: aproximadamente 4,6 m, con fuente accesible y canal difusor.</p><p>C se dibuja con 450 mm de alto por falta de una altura especificada; fondo, techo y paso del conducto se deben adaptar a la campana real. Elegir un mecanismo basculante que funcione contra techo o reservar el remate que exija su recorrido.</p><div class="alert"><b>Antes de liberar fabricación:</b> medir paredes y ángulo; resolver si D/E incluyen K; confirmar 3120/3130; verificar refrigerador, campana y conducto; comprobar enchufes, soporte de pared, nivel del techo y acceso de montaje. Este documento es un anteproyecto dimensional, no una orden de corte final.</div></section>'''
body+='<section class="sheet" id="despiece"><h2>06 / Despiece preliminar</h2><p>Melamina de 18 mm como material de cálculo. Piezas terminadas, incluidas las cintas. L = largo, W = ancho; veta L salvo frentes (H = dirección de la altura). F/T/I/D = frente/trasera/izquierda/derecha. El corte bruto se obtiene restando el espesor de cada canto aplicado a esa dimensión. No descontar canto del espesor de placa.</p><p><b>Alcance:</b> cajas rectas A–F; K, marcos y vidrios excluidos. D/E pendientes de esquina; C pendiente de campana. Zócalo frontal incluido; patas y remates según obra. Estantes de B/D divididos para reducir luz libre.</p><div class="scroll">'+table(['Mód.','Pieza','Cant.','L mm','W mm','Esp.','Veta','Cantos mm'],rows)+'</div></section>'
body+='<section class="sheet" id="materiales"><h2>07 / Materiales, herrajes y armado</h2>'+table(['Material','Área neta preliminar','Placa de cálculo','Mínimo por área +10%'],[[f'Melamina {t} mm' if t==18 else 'Fondo MDF 3 mm',f'{area[t]:.2f} m²','2750 × 1830' if t==18 else '2600 × 1830',ceil(area[t]*1.1/(2.75*1.83 if t==18 else 2.6*1.83))] for t in (18,3)])+'''<p>Estimación por superficie; no es un anidado optimizado ni una compra cerrada. Sierra: 3 mm entre piezas. Agrupar primero laterales altos, después pisos/techos y frentes; conservar orientación de veta. El proveedor debe validar encaje de piezas y añadir K, marcos, remates y pérdidas de escuadrado.</p>'''+table(['Herraje','Cantidad preliminar','Criterio'],[['Bisagras para B/D/E','21','3 por hoja; confirmar peso y ficha'],['Bisagras para F','4','2 por hoja'],['Bisagras de marco A','12','3 por hoja; validar marco y peso del vidrio'],['Sistema elevable C','1 juego','Según peso y gálibo bajo techo'],['Bisagras K','Por definir','Geometría del esquinero'],['Tiradores','14 + 1 K','Uno por hoja; compatibilidad con marco'],['Soportes de estantes','44','4 por cada uno de los 11 estantes'],['Colgadores de altos','10 + K','2 por caja B–F; dimensionar por carga'],['Patas de alacena','4','Zócalo 100; capacidad según carga'],['Antivuelco alacena','2 puntos propuestos','Confirmar fijación y soporte'],['LED y difusor','4,6 m + 1 fuente','Potencia y cable según sistema elegido'],['Confirmat 5 × 50','≈100 unidades','Pretaladrar; unión de cajas y divisorias'],['Riel / anclajes / tornillos','Según obra','Fijación estructural al cuerpo; nunca solo al fondo de 3 mm']])+'''<h3>Secuencia de armado</h3><ol><li>Medir en obra y cerrar esquina, aparatos, remate de techo y acabado. Corregir el plano y emitir cortes finales.</li><li>Preparar tableros, descontar cantos, aplicar cintas y realizar perforaciones. Sistema 32 para estantes regulables.</li><li>Armar cajas con laterales, piso y techo; añadir divisorias y entrepaño fijo de A. Comprobar diagonales y fijar fondos.</li><li>Montar la alacena sobre patas, nivelar y fijar contra vuelco. Prever instalación por partes para llegar hasta techo.</li><li>Instalar riel y colgar módulos; comprobar capacidad de pared, nivel y encuentro diagonal.</li><li>Montar campana y conducto según su ficha. Instalar LED con fuente accesible.</li><li>Colocar frentes, marcos y vidrio. Regular holguras, probar aperturas y ventilación del refrigerador.</li></ol><h3>Presupuesto editable</h3><p>Sin precios de proveedor: no se inventa un costo. Introducir importes en la misma moneda. Cantidades y totales son orientativos.</p><p>Tableros y cortes <input type="number" min="0" value="0" aria-label="Tableros y cortes"> · Vidrios y marcos <input type="number" min="0" value="0" aria-label="Vidrios y marcos"> · Herrajes y LED <input type="number" min="0" value="0" aria-label="Herrajes y LED"> · Montaje <input type="number" min="0" value="0" aria-label="Montaje"></p><p><b>Total ingresado: <output id="total">0,00</output></b></p></section>'''
document='<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Repostero en L · Plano R01</title><style>'+css+'</style></head><body><header><div class="eyebrow">PLANOS DE MOBILIARIO / 11 SEP 2026</div><h1>Repostero en L</h1><p class="meta">Altura 2400 · Frente recto 3130 · Retorno recto 2130 · Todas las cotas en mm</p><span class="badge">R01 · Anteproyecto para revisión</span><p>Basado en las especificaciones escritas y el croquis adjunto. Las referencias [1]–[6] pertenecen al texto recibido; no se dispuso del audio original. Dibujo proporcional; prevalecen las cotas, no medir sobre pantalla.</p><nav>'+''.join(f'<a href="#{i}">{label}</a>' for i,label in [('frente','Frente'),('retorno','Retorno'),('planta','Planta'),('cortes','Cortes'),('puertas','Puertas'),('despiece','Despiece'),('materiales','Materiales')])+'<button onclick="window.print()">Imprimir / Guardar PDF</button></nav></header><main>'+body+'</main><footer>Plano generado con Furniture Planner · R01 · Medidas propuestas identificadas con asterisco.</footer><script>document.querySelectorAll("input").forEach(el=>el.addEventListener("input",()=>{document.getElementById("total").value=[...document.querySelectorAll("input")].reduce((s,e)=>s+(Number(e.value)||0),0).toLocaleString("es-PE",{minimumFractionDigits:2,maximumFractionDigits:2})}));</script></body></html>'
(OUT/'repostero-plano.html').write_text(document,encoding='utf-8')
print(OUT/'repostero-plano.html')
print('Verificado: frente 3130; retorno 2130; reparto de puertas E y holguras. Áreas:',area)
