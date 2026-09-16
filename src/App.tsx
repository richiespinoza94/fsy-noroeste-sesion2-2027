import { lazy, Suspense, useEffect, useState } from 'react';
import HomeScreen from './components/HomeScreen';
import LoginScreen from './components/LoginScreen';
import { isFirebaseConfigured } from './firebase';
import { getStoredSession, logout } from './services/authService';
import { subscribeCapacitaciones } from './services/capacitacionesService';
import { subscribeParticipantes } from './services/participantsService';
import { EVENTO_NOMBRE } from './data/evento';
import type { Capacitacion, Participante, SessionUser } from './types';

// Code-splitting: Login y Home se cargan de entrada (son lo primero que ve
// cualquiera), todo lo demás se descarga bajo demanda — mismo patrón que ya
// usa CONFEJAS 2026 (ver su CONTEXTO.md, sección 2). Antes de este cambio,
// una sola persona entrando a hacer login descargaba TODO: las 4 pestañas de
// staff, el wizard de registro público y el check-in rápido, aunque nunca
// fuera a usar la mayoría en esa visita — 832KB de un tirón.
const PublicEntry = lazy(() => import('./components/PublicEntry'));
const AutoCheckInScreen = lazy(() => import('./components/AutoCheckInScreen'));
const AsistenciaScreen = lazy(() => import('./components/AsistenciaScreen'));
const BusquedaScreen = lazy(() => import('./components/BusquedaScreen'));
const GestionScreen = lazy(() => import('./components/GestionScreen'));
const ReportesScreen = lazy(() => import('./components/ReportesScreen'));

function PantallaCargando() {
  return (
    // `h-full`, no `min-h-screen`: este fallback se renderiza dentro de
    // <main>, que ya tiene su altura acotada — forzar 100vh acá desbordaba
    // el contenedor.
    <div className="h-full min-h-[50vh] flex items-center justify-center">
      <div className="spinner" />
    </div>
  );
}

type Tab = 'home' | 'asistencia' | 'busqueda' | 'gestion' | 'reportes';

// Mismo patrón que el backend Apps Script: ?page=registro es la vista pública,
// cualquier otra cosa es el Staff App con login.
function isRegistroPage(): boolean {
  return new URLSearchParams(window.location.search).get('page') === 'registro';
}

// ?page=asistencia va directo al check-in rápido, sin pasar por la pregunta
// "¿es tu primera vez?" — es el destino del QR que recepción comparte: ya
// se sabe que quien lo escanea necesita marcar asistencia, no elegir.
function isAsistenciaPage(): boolean {
  return new URLSearchParams(window.location.search).get('page') === 'asistencia';
}

export default function App() {
  if (isRegistroPage()) {
    return (
      <Suspense fallback={<PantallaCargando />}>
        <PublicEntry />
      </Suspense>
    );
  }
  if (isAsistenciaPage()) {
    return (
      <Suspense fallback={<PantallaCargando />}>
        <AutoCheckInScreen onBack={() => { window.location.href = '/?page=registro'; }} />
      </Suspense>
    );
  }
  return <StaffApp />;
}

function StaffApp() {
  const [user, setUser] = useState<SessionUser | null>(() => getStoredSession());
  const [tab, setTab] = useState<Tab>('home');
  const [participantes, setParticipantes] = useState<Participante[]>([]);
  const [capacitaciones, setCapacitaciones] = useState<Capacitacion[]>([]);
  // "Cargando" y "vacío" son estados distintos — mismo patrón que ya se usa
  // en AutoCheckInScreen: sin esto, el Home muestra "0 registrados" y "sin
  // capacitaciones" por un instante justo después de entrar, antes de que
  // Firestore entregue los datos reales.
  const [participantesLoaded, setParticipantesLoaded] = useState(false);
  const [capacitacionesLoaded, setCapacitacionesLoaded] = useState(false);
  const cargandoDatos = !participantesLoaded || !capacitacionesLoaded;
  const [navHidden, setNavHidden] = useState(false);
  useEffect(() => setNavHidden(false), [tab]);

  useEffect(() => {
    if (!user) return;
    setParticipantesLoaded(false);
    setCapacitacionesLoaded(false);
    const unsub1 = subscribeParticipantes((items) => {
      setParticipantes(items);
      setParticipantesLoaded(true);
    });
    const unsub2 = subscribeCapacitaciones((items) => {
      setCapacitaciones(items);
      setCapacitacionesLoaded(true);
    });
    return () => {
      unsub1();
      unsub2();
    };
  }, [user]);

  if (!user) return <LoginScreen onSuccess={setUser} />;

  // Menú inferior que se esconde al bajar en la lista y reaparece al subir
  // — mismo patrón que YouTube/Instagram. `navHidden` vive acá arriba
  // porque el menú es un solo elemento compartido por las 5 pantallas, no
  // algo que cada una controle por su cuenta.
  const navProps = { onNavHiddenChange: setNavHidden };

  return (
    // Altura acotada en TODO tamaño de pantalla, no solo desktop — antes
    // solo `sm:h-[calc(100vh-48px)]` tenía límite; en celular el shell
    // crecía libre con el contenido (`min-h-screen` es un mínimo, no un
    // techo), así que la página entera se alargaba con la lista y el menú
    // inferior quedaba al final de una página larguísima en vez de fijo
    // abajo. `dvh` (dynamic viewport height) en vez de `vh` a propósito:
    // es la unidad pensada para el problema real de móvil donde la barra
    // de direcciones de Safari/Chrome aparece y desaparece cambiando el
    // alto disponible — `vh` se calcula mal en ese caso, `dvh` no.
    // `relative` es necesario para que el <nav> (ahora `absolute`) flote
    // anclado a ESTE contenedor y no a toda la ventana.
    <div className="h-dvh sm:h-[calc(100dvh-48px)] relative flex flex-col max-w-[850px] mx-auto bg-[#F4F6FA] sm:my-6 sm:rounded-3xl sm:shadow-2xl overflow-hidden">
      {!isFirebaseConfigured && (
        <div className="bg-amber-100 text-amber-800 text-xs font-semibold text-center py-1.5">
          ⚠️ Modo local — sin conexión a Firestore, los datos no se guardan entre sesiones.
        </div>
      )}

      <header className="bg-gradient-to-br from-primary to-primary-dark text-white px-4 py-3 flex items-center gap-3">
        <div className="flex-1">
          <div className="font-extrabold text-sm">Gestión FSY 2027</div>
          <div className="text-[10px] font-bold text-accent tracking-wide">{EVENTO_NOMBRE.toUpperCase()} · CONSEJEROS</div>
        </div>
        <button
          onClick={() => {
            logout();
            setUser(null);
          }}
          className="bg-white/15 text-[11px] font-bold px-2.5 py-1.5 rounded-lg"
        >
          Salir 🚪
        </button>
      </header>

      {/* `overflow-hidden`, NO `overflow-y-auto`: cada pantalla hija maneja
          su propio scroll interno (para dejar su encabezado fijo). Si
          <main> también scrollea, quedan dos scrolls anidados peleándose —
          el hijo con `h-full` mide contra un padre que a su vez crece, y el
          contenido termina recortado en escritorio apenas la lista pasa del
          alto de la pantalla. `min-h-0` sigue siendo necesario para que
          <main> pueda encogerse dentro del flex padre. */}
      <main className="flex-1 min-h-0 overflow-hidden">
        {tab === 'home' && (
          <HomeScreen
            user={user}
            participantes={participantes}
            capacitaciones={capacitaciones}
            cargando={cargandoDatos}
            onNavigate={setTab}
            {...navProps}
          />
        )}
        {tab !== 'home' && (
          <Suspense fallback={<PantallaCargando />}>
            {tab === 'asistencia' && (
              <AsistenciaScreen user={user} participantes={participantes} capacitaciones={capacitaciones} {...navProps} />
            )}
            {tab === 'busqueda' && <BusquedaScreen user={user} participantes={participantes} {...navProps} />}
            {tab === 'gestion' && (
              <GestionScreen user={user} participantes={participantes} capacitaciones={capacitaciones} {...navProps} />
            )}
            {tab === 'reportes' && user.canViewReports && (
              <ReportesScreen participantes={participantes} capacitaciones={capacitaciones} {...navProps} />
            )}
          </Suspense>
        )}
      </main>

      <nav
        className={`absolute bottom-0 left-0 right-0 z-20 bg-white border-t border-slate-200 flex shrink-0 transition-transform duration-300 ${
          navHidden ? 'translate-y-full' : 'translate-y-0'
        }`}
      >
        {(
          [
            { id: 'home', icon: '🏠', label: 'Inicio' },
            { id: 'busqueda', icon: '🔍', label: 'Búsqueda' },
            { id: 'asistencia', icon: '✅', label: 'Asistencia' },
            { id: 'gestion', icon: '⚙️', label: 'Gestión' },
            ...(user.canViewReports ? [{ id: 'reportes', icon: '📊', label: 'Reportes' } as const] : []),
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 py-2.5 flex flex-col items-center gap-0.5 ${tab === t.id ? 'text-primary' : 'text-slate-500'}`}
          >
            <span className="text-lg">{t.icon}</span>
            <span className="text-[10px] font-bold">{t.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
