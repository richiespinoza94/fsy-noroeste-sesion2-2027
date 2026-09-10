import { EVENTO_FECHAS_LABEL } from '../data/evento';

const NAVY = '#0E2954';
const NAVY_DARK = '#071A35';
const GOLD = '#F5C038';

/**
 * Asegura que Inter esté realmente cargado antes de dibujar texto en canvas.
 * A diferencia del CSS normal (que hace "negrita sintética" de forma
 * predecible si un peso no está listo), un <canvas> puede resolver a
 * cualquier fuente de respaldo del sistema sin avisar si el peso pedido
 * todavía no terminó de descargar — esta app ya carga Inter 400-800 vía
 * Google Fonts en index.html, solo falta esperar a que esos pesos
 * específicos estén listos antes de usarlos en el canvas.
 */
export async function ensureCanvasFonts(): Promise<void> {
  try {
    await Promise.all([
      document.fonts.load('800 48px Inter'),
      document.fonts.load('700 24px Inter'),
      document.fonts.load('400 20px Inter'),
    ]);
  } catch {
    // Cosmético: si falla, el canvas cae a la fuente de respaldo del
    // sistema y la imagen igual sale bien — no bloquea compartir/descargar.
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function drawShareCard(ctx: CanvasRenderingContext2D, qrImage: HTMLImageElement, size = 1080) {
  // Fondo degradado navy, igual que los encabezados del resto de la app.
  const grad = ctx.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, NAVY);
  grad.addColorStop(1, NAVY_DARK);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  // Círculo dorado decorativo, mismo lenguaje visual que los headers de la app.
  ctx.save();
  ctx.globalAlpha = 0.1;
  ctx.fillStyle = GOLD;
  ctx.beginPath();
  ctx.arc(size * 0.85, size * 0.08, size * 0.22, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Badge "GESTIÓN FSY 2027"
  ctx.textAlign = 'center';
  ctx.font = '700 26px Inter, sans-serif';
  ctx.fillStyle = GOLD;
  ctx.fillText('GESTIÓN FSY 2027', size / 2, size * 0.13);

  // Título
  ctx.font = '800 52px Inter, sans-serif';
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText('Marca tu asistencia', size / 2, size * 0.21);

  // Tarjeta blanca con el QR
  const qrBox = size * 0.62;
  const qrX = (size - qrBox) / 2;
  const qrY = size * 0.27;
  ctx.fillStyle = '#FFFFFF';
  roundRect(ctx, qrX - 24, qrY - 24, qrBox + 48, qrBox + 48, 28);
  ctx.fill();
  ctx.drawImage(qrImage, qrX, qrY, qrBox, qrBox);

  // Instrucción + fechas del evento
  ctx.font = '400 30px Inter, sans-serif';
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText('Escanea con la cámara de tu celular', size / 2, qrY + qrBox + 64);

  ctx.font = '700 24px Inter, sans-serif';
  ctx.fillStyle = GOLD;
  ctx.fillText(EVENTO_FECHAS_LABEL.replace(/^del /, '').toUpperCase(), size / 2, qrY + qrBox + 108);
}
