# MVP3 · Revisión y entrega local

Fecha: 14 de septiembre de 2026. Versión 0.3.0.

## Resultado

Se continúa el MVP2 con permutas y reemplazos. El expediente saliente permite preparar otro participante del mismo sexo, con los datos del padre/madre/tutor. El entrante completa el checklist existente y solicita revisión. El equipo revisa documentos y aprueba o no aprueba el cambio; también se puede cancelar la solicitud. Solo una aprobación reasigna el cupo y confirma al entrante. Los expedientes anteriores permanecen como historial.

El panel administrativo incorpora Permutas. Los candidatos se identifican explícitamente y no aumentan el total de cupos. Se impide confirmarlos por el flujo ordinario, abrir dos cambios activos para un cupo, modificar expedientes congelados o iniciar/enviar solicitudes fuera de plazo.

## Revisión con las skills solicitadas

- UI UX Pro Max: etiquetas visibles, estados expresados con texto, sexo fijo explicado, campos obligatorios, controles de al menos 44 px, foco visible y movimiento reducido. Las sugerencias automáticas de colores/fuentes se subordinan a la paleta proporcionada.
- Frontend Design: composición luminosa, jerarquía clara, nueva identidad global, revisión de escritorio y móvil. Se corrigió el texto del candidato para distinguir su solicitud del expediente saliente.
- Ponytail: formulario compartido para alta y reemplazo; se reutilizan uploader, revisión documental y repositorios. Sin dependencias nuevas de producción. Las decisiones se resuelven en transacciones SQL, con historial, sin una segunda infraestructura de documentos.

## Paleta aplicada

| Color | HEX web | CMYK proporcionado | Aplicación |
|---|---|---|---|
| Neutral 5 | #EFEFE7 | 5, 3, 8, 0 | Fondo |
| Yellow 10 | #FFB81C | 0, 34, 90, 0 | Acciones y atención |
| Blue 25 | #007DA5 | 100, 0, 10, 35 | Contraste, navegación activa y confirmación |

Tres colores, dos de la paleta primaria. Blanco #FFFFFF y negro #000000 exentos. Sin verde + rojo ni azul + rosa. Gold 10 y Gray 5 no se usan. Los CMYK son los del brief; la web emplea HEX. Documentos/fotografías que suba un usuario conservan sus colores propios.

Contrastes calculados: negro/Neutral 5 18.17:1; negro/Yellow 10 12.12:1; blanco/Blue 25 4.69:1. Se utiliza texto negro en superficies neutras para evitar contraste insuficiente del azul pequeño. Estos cálculos y la inspección no equivalen a una certificación integral WCAG.

## Verificación

- `npm run build`: TypeScript y paquete de producción.
- `npm run qa`: regresión existente, contrato IA, worker con proveedor simulado, flujo documental demo, permuta demo y paleta.
- `npm run qa:db`: cinco migraciones sobre PostgreSQL embebido; permisos, documentos, mismo sexo, cupo único, duplicados, rechazo, cancelación, aprobación, plazo, historial y acceso sin unidad.
- Navegador: creación de candidata ficticia, apertura del checklist de siete documentos, botón de envío deshabilitado mientras está incompleto y pestaña administrativa Permutas. Inspección visual a 320 y 1440 px; formulario a 390 px. Sin desbordamiento horizontal en las pantallas inspeccionadas. La revisión completa de documentos y la aprobación se verifican en pruebas de repositorio/SQL.

Una prueba nueva reveló que `visible_unit` podía devolver NULL cuando no había unidad asignada. La migración 005 devuelve false explícitamente y la regresión exige denegar la RPC y ocultar solicitudes para esa cuenta.

## Activación pendiente

Entrega local; no se aplicaron migraciones remotas ni se ejecutó OCR real. En Supabase se debe aplicar 005 después de 001–004 y comprobar el flujo integrado con Auth, Storage y PostgREST. Las pruebas SQL usan stubs para esos servicios y no prueban concurrencia de múltiples conexiones; los bloqueos de filas y el índice único protegen la operación en el diseño SQL.

Se conserva la limitación previa de alcance administrativo global de los roles FSY. La demo es efímera y utiliza datos ficticios. La configuración del proveedor IA y las instrucciones del MVP2 están en README.md.
