# Revisión responsive · MVP3

Revisado con UI UX Pro Max, Frontend Design y Ponytail el 14/09/2026.

## Resultado y correcciones

- Móvil: tarjetas, navegación inferior y formularios de una columna. Los cuatro filtros ahora se distribuyen en varias líneas y permanecen visibles a 320 px; altura medida: 44 px.
- Escritorio: listado en columnas con botones nativos reconocibles por tecnologías de asistencia. Se eliminó el rol de fila que ocultaba la acción y se añadió feedback al pasar el puntero.
- Tamaños intermedios: checklist en una columna hasta 1050 px para evitar comprimir documentos junto a la ficha lateral.
- Formularios: campos de 16 px, ancho flexible y nombres largos con salto de línea.
- Carga documental: texto “Elegir un archivo” válido para móvil y PC; selectores internos ocultos para evitar controles duplicados en la navegación por teclado.
- Diálogo: corregidos el ancho mínimo de página y el máximo predeterminado del diálogo; sin barra horizontal a 320 px. El fondo deja de desplazarse mientras está abierto. Escape cierra y devuelve el foco a Corregir, verificado en navegador.

## Evidencia y alcance

Inspección de listado y expediente en anchos de 320, 375, 768, 1024 y 1440 px. Revisión visual de formularios a 375 px, controles a 768 px y diálogo a 320/1440 px. Mediciones DOM de anchos, filtros, campos y foco. Compilación y regresión estructural/paleta ejecutadas después de las correcciones. Sin dependencias nuevas.

Son pruebas responsive en el navegador local, no pruebas en dispositivos iOS/Android físicos ni una certificación completa WCAG.

Paleta conservada: Neutral 5 #EFEFE7 (CMYK 5,3,8,0), Yellow 10 #FFB81C (0,34,90,0), Blue 25 #007DA5 (100,0,10,35), blanco/negro exentos. Tres colores, dos primarios; sin combinaciones prohibidas ni colores reservados para el identificador.
