import type { Companerismo, Familia, Participante } from '../types';
import { FAMILY_COLORS } from '../data/colors';
import type { EstadisticasFamilia } from './repartoFamilias';
import { nombreConInicialMaterna } from './nombreCorto';

// Paleta oficial FSY 2027 — lema "Regocíjate en Cristo" (ver reglas de marca:
// máx. 3 colores por pieza sin contar blanco/negro). El color de cada
// compañía (FAMILY_COLORS) es la única excepción — es su identidad ya
// establecida en el resto de la app, no un color decorativo más.
const PARCHMENT = '#F5EFCA';
const YELLOW_10 = '#FFB81C';
const BLUE_20 = '#01B6D1';
const INK = '#1A1A1A';
const GRAY = '#6B6B6B';

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export interface FamiliaParaPdf {
  familia: Familia;
  companerismo: Companerismo[];
  participantes: Participante[]; // ya filtrados a miembros de esta familia, ya ordenados
  stats: EstadisticasFamilia;
}

/**
 * Un PDF combinado, una hoja A4 por compañía — se genera 100% en el navegador
 * (jsPDF), sin backend. `jspdf` se importa de forma dinámica, mismo patrón de
 * carga bajo demanda que ya usa el resto del proyecto para dependencias pesadas.
 */
export async function generarRepartoPdf(
  datos: FamiliaParaPdf[],
  todosParticipantes: Participante[], // para resolver los IDs de Coordinadores Auxiliares (no son miembros del reparto, así que no están en datos[].participantes)
  nombreEvento: string,
  lema: string
): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210;

  datos.forEach(({ familia, companerismo, participantes, stats }, i) => {
    if (i > 0) doc.addPage();
    const familyHex = FAMILY_COLORS.find((c) => c.id === familia.colorId)?.hex || '#888888';

    // Fondo
    doc.setFillColor(...hexToRgb(PARCHMENT));
    doc.rect(0, 0, W, 297, 'F');

    // Banda superior — identidad de la compañía
    doc.setFillColor(...hexToRgb(familyHex));
    doc.rect(0, 0, W, 32, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(22);
    doc.text(familia.customName || familia.nombre, 14, 20);

    // Evento + lema
    doc.setTextColor(...hexToRgb(INK));
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(nombreEvento, 14, 40);
    doc.setTextColor(...hexToRgb(YELLOW_10));
    doc.setFont('helvetica', 'italic');
    doc.text(`"${lema}"`, 14, 46);

    // Coordinadores Auxiliares
    let y = 58;
    doc.setTextColor(...hexToRgb(BLUE_20));
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text('Coordinadores Auxiliares', 14, y);
    doc.setDrawColor(...hexToRgb(BLUE_20));
    doc.line(14, y + 1.5, W - 14, y + 1.5);
    y += 8;
    doc.setTextColor(...hexToRgb(INK));
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    const coordNombres = companerismo
      .flatMap((c) => [c.p1Id, c.p2Id])
      .filter(Boolean)
      .map((id) => todosParticipantes.find((p) => p.id === id))
      .filter((p): p is Participante => !!p)
      .map((p) => `${p.nombres} ${p.apellidos}`);
    if (coordNombres.length) {
      coordNombres.forEach((n) => {
        doc.text(`• ${n}`, 16, y);
        y += 6;
      });
    } else {
      doc.setTextColor(...hexToRgb(GRAY));
      doc.text('Sin asignar todavía', 16, y);
      y += 6;
    }

    // Resumen del balance
    y += 4;
    doc.setTextColor(...hexToRgb(BLUE_20));
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text('Balance de la compañía', 14, y);
    doc.line(14, y + 1.5, W - 14, y + 1.5);
    y += 8;
    doc.setTextColor(...hexToRgb(INK));
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    const modaTxt = stats.edadModa !== null ? `${stats.edadModa} años` : '—';
    const resumen = [
      `Total: ${stats.total}   ·   Hombres: ${stats.hombres}   ·   Mujeres: ${stats.mujeres}`,
      `Edad — promedio: ${stats.edadPromedio}   ·   mediana: ${stats.edadMediana}   ·   moda: ${modaTxt}`,
      `Ventanilla: ${stats.porEstaca.Ventanilla}   ·   Puente Piedra: ${stats.porEstaca['Puente Piedra']}   ·   Pro Lima: ${stats.porEstaca['Pro Lima']}   ·   Otros: ${stats.porEstaca.Otros}`,
    ];
    resumen.forEach((line) => {
      doc.text(line, 14, y);
      y += 6;
    });

    // Integrantes
    y += 6;
    doc.setTextColor(...hexToRgb(BLUE_20));
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text(`Integrantes (${participantes.length})`, 14, y);
    doc.line(14, y + 1.5, W - 14, y + 1.5);
    y += 9;
    doc.setFontSize(10);
    participantes.forEach((p, idx) => {
      if (y > 280) {
        doc.addPage();
        doc.setFillColor(...hexToRgb(PARCHMENT));
        doc.rect(0, 0, W, 297, 'F');
        y = 18;
      }
      const zebra = idx % 2 === 0;
      if (zebra) {
        doc.setFillColor(255, 255, 255);
        doc.rect(12, y - 4.5, W - 24, 6.5, 'F');
      }
      doc.setTextColor(...hexToRgb(INK));
      doc.setFont('helvetica', 'normal');
      doc.text(`${idx + 1}. ${nombreConInicialMaterna(p.nombres, p.apellidos)}`, 15, y);
      doc.setTextColor(...hexToRgb(GRAY));
      doc.text(`${p.estaca}`, 120, y);
      doc.text(`${p.genero === 'H' ? 'H' : 'M'}`, 190, y);
      y += 6.5;
    });

    doc.setFontSize(8);
    doc.setTextColor(...hexToRgb(GRAY));
    doc.text(`Generado automáticamente el ${new Date().toLocaleDateString('es-PE')}`, 14, 292);
  });

  return doc.output('blob');
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
