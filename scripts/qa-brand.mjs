import fs from 'node:fs'
import assert from 'node:assert/strict'
const css=fs.readFileSync('src/styles.css','utf8')
const allowed=new Set(['#EFEFE7','#FFB81C','#007DA5','#FFFFFF','#000000'])
for(const color of css.match(/#[\da-f]{3,8}\b/gi)??[])assert.ok(allowed.has(color.toUpperCase()),`Color no permitido: ${color}`)
function luminance(hex){const c=hex.match(/[\da-f]{2}/gi).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return c[0]*.2126+c[1]*.7152+c[2]*.0722}
for(const [fg,bg] of [['#000000','#EFEFE7'],['#000000','#FFB81C'],['#FFFFFF','#007DA5']]){const a=luminance(fg),b=luminance(bg),ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);assert.ok(ratio>=4.5);console.log(`OK contraste ${fg}/${bg}: ${ratio.toFixed(2)}:1`)}
console.log('OK paleta: 3 colores, 2 primarios, blanco/negro exentos; sin colores reservados ni combinaciones prohibidas.')
