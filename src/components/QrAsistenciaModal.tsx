import { useEffect, useRef, useState } from 'react';
import { drawShareCard, ensureCanvasFonts } from '../utils/qrShareCard';

function checkInUrl(): string {
  return `${window.location.origin}/?page=asistencia`;
}

export default function QrAsistenciaModal({ onClose }: { onClose: () => void }) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState('');
  const cancelled = useRef(false);
  // La tarjeta compartible se genera EN SEGUNDO PLANO apenas el QR está
  // listo, no cuando la persona toca "Compartir".
  //
  // Motivo (iOS): Safari exige que navigator.share() se llame dentro de la
  // misma tanda del gesto que lo originó ("transient user activation").
  // Generar la imagen en ese momento implica varios `await` (cargar
  // fuentes, canvas.toBlob) — si alguno tarda más que esa ventana, iOS
  // rechaza la llamada con NotAllowedError. Eso hace fallar "Compartir" de
  // forma INTERMITENTE en iPhone: funciona si todo está rápido, falla si
  // algo tarda. Con el blob ya listo de antes, navigator.share() se llama
  // sin ningún await de por medio.
  const shareBlobRef = useRef<Blob | null>(null);

  useEffect(() => {
    cancelled.current = false;
    shareBlobRef.current = null;
    import('qrcode')
      .then((QRCode) =>
        QRCode.toDataURL(checkInUrl(), { width: 960, margin: 1, errorCorrectionLevel: 'H' }).then((url) => {
          if (!cancelled.current) setQrDataUrl(url);
        })
      )
      .catch(() => {
        if (!cancelled.current) setError('No se pudo generar el código QR.');
      });
    return () => {
      cancelled.current = true;
    };
  }, []);

  useEffect(() => {
    if (!qrDataUrl) return;
    let stale = false;
    buildShareBlob(qrDataUrl)
      .then((blob) => {
        if (!stale) shareBlobRef.current = blob;
      })
      .catch(() => {});
    return () => {
      stale = true;
    };
  }, [qrDataUrl]);

  function loadImageEl(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  async function buildShareBlob(qrUrl: string): Promise<Blob> {
    const [qrImage] = await Promise.all([loadImageEl(qrUrl), ensureCanvasFonts()]);
    const canvas = document.createElement('canvas');
    canvas.width = 1080;
    canvas.height = 1080;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Sin contexto de canvas');
    drawShareCard(ctx, qrImage, 1080);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('No se pudo generar la imagen.');
    return blob;
  }

  function triggerDownload(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    // Firefox (y algunos navegadores móviles) ignoran .click() en un
    // elemento que no está insertado en el documento — la descarga no
    // ocurre y no hay ningún error que lo delate. Insertarlo, hacer click
    // y quitarlo es el patrón que funciona en todos los navegadores.
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /**
   * Comparte por la Web Share API nativa (abre el selector del sistema:
   * WhatsApp, lo que el celular tenga instalado) — sin agregar ninguna
   * librería, es lo que el navegador ya trae. En desktop, la mayoría de
   * navegadores no soportan esto — cae directo al mensaje de "descarga la
   * imagen" en vez de fallar en silencio.
   */
  async function handleShare() {
    if (!qrDataUrl || sharing) return;
    const shareText = `Marca tu asistencia a la preparación FSY 2027 aquí: ${checkInUrl()}`;

    const ready = shareBlobRef.current;
    if (ready) {
      const file = new File([ready], 'qr-asistencia-fsy-2027.png', { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: 'Marca tu asistencia — FSY 2027', text: shareText });
        } catch (err) {
          if ((err as Error)?.name !== 'AbortError') setError('No se pudo compartir. Intenta de nuevo.');
        }
        return;
      }
    }

    setSharing(true);
    try {
      const blob = ready || (await buildShareBlob(qrDataUrl));
      shareBlobRef.current = blob;
      const file = new File([blob], 'qr-asistencia-fsy-2027.png', { type: 'image/png' });

      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Marca tu asistencia — FSY 2027', text: shareText });
      } else if (navigator.share) {
        triggerDownload(blob, 'qr-asistencia-fsy-2027.png');
        await navigator.share({ title: 'Marca tu asistencia — FSY 2027', text: shareText, url: checkInUrl() });
      } else {
        triggerDownload(blob, 'qr-asistencia-fsy-2027.png');
        setError('Tu navegador no tiene selector de compartir — se descargó la imagen para que la compartas a mano.');
      }
    } catch (err) {
      if ((err as Error)?.name !== 'AbortError') {
        setError('No se pudo compartir. Intenta de nuevo.');
      }
    } finally {
      setSharing(false);
    }
  }

  async function handleDownload() {
    if (!qrDataUrl || downloading) return;
    setDownloading(true);
    setError('');
    try {
      const blob = shareBlobRef.current || (await buildShareBlob(qrDataUrl));
      triggerDownload(blob, 'qr-asistencia-fsy-2027.png');
    } catch {
      setError('No se pudo generar la imagen. Intenta de nuevo.');
    } finally {
      setDownloading(false);
    }
  }

  // Escape y bloqueo de scroll para la vista de pantalla completa — es su
  // propio overlay (necesita ocupar todo el viewport), así que necesita su
  // propio manejo de teclado/scroll en vez de heredarlo del modal normal.
  useEffect(() => {
    if (!fullscreen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setFullscreen(false);
    }
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [fullscreen]);

  if (fullscreen && qrDataUrl) {
    return (
      <div className="fixed inset-0 bg-primary-dark z-[70] flex flex-col items-center justify-center p-6" role="dialog" aria-modal="true">
        <button
          onClick={() => setFullscreen(false)}
          className="absolute top-5 right-5 w-11 h-11 rounded-full bg-white/15 text-white text-xl flex items-center justify-center"
          aria-label="Cerrar pantalla completa"
        >
          ✕
        </button>
        <div className="bg-white rounded-3xl p-6">
          <img src={qrDataUrl} alt="Código QR para marcar asistencia" className="w-full max-w-sm" />
        </div>
        <div className="text-white font-extrabold text-lg mt-5 text-center">Marca tu asistencia</div>
        <div className="text-white/70 text-sm mt-1 text-center">Escanea con la cámara de tu celular</div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end z-50" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-t-3xl w-full max-w-[500px] mx-auto p-6 text-center">
        <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-4" />
        <div className="font-extrabold text-lg text-primary mb-0.5">QR de asistencia</div>
        <div className="text-xs text-slate-500 mb-4">Compártelo o muéstralo para que la gente marque su propia asistencia</div>

        <div className="bg-slate-50 rounded-2xl p-5 mb-4 flex items-center justify-center min-h-[220px]">
          {qrDataUrl ? (
            <img src={qrDataUrl} alt="Código QR para marcar asistencia" className="w-48 h-48" />
          ) : (
            <div className="spinner" />
          )}
        </div>

        {error && <div className="text-xs text-red-500 font-semibold mb-3">❌ {error}</div>}

        <button
          disabled={!qrDataUrl || sharing}
          onClick={handleShare}
          className="w-full bg-primary text-white font-bold rounded-xl py-3.5 mb-2.5 disabled:opacity-50"
        >
          {sharing ? 'Preparando…' : '📤 Compartir'}
        </button>

        <div className="grid grid-cols-2 gap-2.5 mb-3">
          <button
            disabled={!qrDataUrl}
            onClick={() => setFullscreen(true)}
            className="border-[1.5px] border-primary text-primary font-bold rounded-xl py-3 text-sm disabled:opacity-50"
          >
            Pantalla completa
          </button>
          <button
            disabled={!qrDataUrl || downloading}
            onClick={handleDownload}
            className="border-[1.5px] border-primary text-primary font-bold rounded-xl py-3 text-sm disabled:opacity-50"
          >
            {downloading ? 'Generando…' : 'Descargar'}
          </button>
        </div>

        <button onClick={onClose} className="w-full text-slate-500 font-semibold text-sm py-2">
          Cerrar
        </button>
      </div>
    </div>
  );
}
