> Actualización MVP3: la paleta y reglas indicadas en MVP3.md sustituyen los colores históricos de este documento.

# FSY 2027 Portal — Design System

> Proyecto: FSY Lima Noroeste · Sesión 2 · 2027
> Prioridad: el documento maestro del proyecto y su paleta oficial prevalecen sobre recomendaciones genéricas de la skill UI/UX.

## Dirección

**Premium silencioso, mobile-first, orientado a tareas.** El líder debe reconocer en segundos quién necesita atención y cuál es la próxima acción. La interfaz evita estética ERP, dashboards cargados, glassmorphism y decoración sin función.

## Firma visual

El elemento distintivo del producto es el **sello de deadline + camino FSY**: el tiempo restante se presenta como un sello circular tipo credencial de evento y un trazado discreto que conecta progreso, acción y confirmación. Se usa solo en momentos de prioridad; no como ornamento repetido.

## Tokens

```css
--fsy-navy: #002F50;
--fsy-deep-blue: #003E62;
--fsy-blue: #005581;
--fsy-sky: #C4E6EE;
--fsy-green: #70AD47;
--fsy-sunrise: #F5B547;
--fsy-white: #F5F7F7;
--fsy-graphite: #26343C;
--fsy-alert: #8B1538;
```

El amarillo `#F5B547` es acento para deadline/CTA/prioridad, nunca fondo dominante permanente.

## Tipografía

System-first para velocidad:

```css
font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, system-ui, sans-serif;
```

La personalidad viene de escala, peso y espaciado; el MVP no descarga fuentes externas.

## Layout

- Mobile first.
- Desktop: sidebar discreta; contenido protagonista.
- Mobile: bottom nav de 4 destinos: Inicio, Jóvenes, Ayuda, Cuenta.
- Tablas solo en desktop; cards en móvil.
- Touch target mínimo 44×44 px.
- Contenido principal máximo aproximado: 1280 px.

## Jerarquía

1. Próxima acción / pendiente.
2. Deadline contextual.
3. Estado de participante.
4. Resumen numérico.
5. Información secundaria.

## Componentes base MVP

- `BrandMark`
- `DeadlineCard`
- `SummaryMetric`
- `StatusPill`
- `ParticipantRow`
- `ParticipantCard`
- `DocumentRow`
- `UploadDialog`
- `BottomNav`
- `Sidebar`

## Movimiento

- 150–250 ms para estados interactivos.
- Skeletons para carga.
- Nada de animaciones decorativas continuas, salvo loader de arranque.
- `prefers-reduced-motion` debe desactivar movimiento no esencial.

## Accesibilidad

- Contraste mínimo 4.5:1 en texto normal.
- Focus visible.
- Labels visibles en formularios.
- Estados no dependen solo de color: siempre incluyen texto/icono.
- Controles táctiles ≥44 px.
- Navegación usable con teclado.

## Evitar

- tarjetas dentro de tarjetas sin necesidad;
- sombras fuertes;
- gradientes decorativos;
- emojis como iconografía;
- hover como única pista de interacción;
- tablas comprimidas en móvil;
- códigos internos visibles (`OCR_REJECTED`, etc.).
