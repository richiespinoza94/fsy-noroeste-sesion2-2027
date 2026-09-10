import { lazy, Suspense, useEffect, useState } from 'react';
import HomeScreen from './components/HomeScreen';
import LoginScreen from './components/LoginScreen';
import { isFirebaseConfigured } from './firebase';
import { getStoredSession, logout } from './services/authService';
import { subscribeCapacitaciones } from './services/capacitacionesService';
import { subscribeParticipantes } from './services/participantsService';
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
    <div className="min-h-screen flex items-center justify-center">
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

  return (
    // `min-h-screen` solo hasta `sm`: a partir de ahí el contenedor pasa a
    // altura FIJA con scroll interno. Antes las dos convivían y `min-height`
    // le ganaba a `height` (regla de CSS), así que en escritorio el
    // contenedor medía 100vh en vez del calc pedido — más alto que su
    // espacio real y, con `sm:overflow-hidden`, recortaba las últimas filas
    // por la mitad. En móvil nunca se vio porque las clases `sm:` no aplican.
    <div className="min-h-screen sm:min-h-0 flex flex-col max-w-[850px] mx-auto bg-[#F4F6FA] sm:my-6 sm:rounded-3xl sm:shadow-2xl sm:overflow-hidden sm:h-[calc(100vh-48px)]">
      {!isFirebaseConfigured && (
        <div className="bg-amber-100 text-amber-800 text-xs font-semibold text-center py-1.5">
          ⚠️ Modo local — sin conexión a Firestore, los datos no se guardan entre sesiones.
        </div>
      )}

      <header className="bg-gradient-to-br from-primary to-primary-dark text-white px-4 py-3 flex items-center gap-3">
        <div className="flex-1">
          <div className="font-extrabold text-sm">Gestión FSY 2027</div>
          <div className="text-[10px] font-bold text-accent tracking-wide">PREPARACIÓN DE CONSEJEROS</div>
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

      <main className="flex-1 overflow-y-auto">
        {tab === 'home' && (
          <HomeScreen user={user} participantes={participantes} capacitaciones={capacitaciones} cargando={cargandoDatos} onNavigate={setTab} />
        )}
        {tab !== 'home' && (
          <Suspense fallback={<PantallaCargando />}>
            {tab === 'asistencia' && (
              <AsistenciaScreen user={user} participantes={participantes} capacitaciones={capacitaciones} />
            )}
            {tab === 'busqueda' && <BusquedaScreen user={user} participantes={participantes} />}
            {tab === 'gestion' && (
              <GestionScreen user={user} participantes={participantes} capacitaciones={capacitaciones} />
            )}
            {tab === 'reportes' && user.canViewReports && (
              <ReportesScreen participantes={participantes} capacitaciones={capacitaciones} />
            )}
          </Suspense>
        )}
      </main>

      <nav className="bg-white border-t border-slate-200 flex shrink-0">
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
