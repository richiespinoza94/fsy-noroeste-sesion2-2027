import { useEffect, useState } from 'react';
import AsistenciaScreen from './components/AsistenciaScreen';
import BusquedaScreen from './components/BusquedaScreen';
import GestionScreen from './components/GestionScreen';
import HomeScreen from './components/HomeScreen';
import LoginScreen from './components/LoginScreen';
import PublicEntry from './components/PublicEntry';
import ReportesScreen from './components/ReportesScreen';
import { isFirebaseConfigured } from './firebase';
import { getStoredSession, logout } from './services/authService';
import { subscribeCapacitaciones } from './services/capacitacionesService';
import { subscribeParticipantes } from './services/participantsService';
import type { Capacitacion, Participante, SessionUser } from './types';

type Tab = 'home' | 'asistencia' | 'busqueda' | 'gestion' | 'reportes';

// Mismo patrón que el backend Apps Script: ?page=registro es la vista pública,
// cualquier otra cosa es el Staff App con login.
function isRegistroPage(): boolean {
  return new URLSearchParams(window.location.search).get('page') === 'registro';
}

export default function App() {
  if (isRegistroPage()) return <PublicEntry />;
  return <StaffApp />;
}

function StaffApp() {
  const [user, setUser] = useState<SessionUser | null>(() => getStoredSession());
  const [tab, setTab] = useState<Tab>('home');
  const [participantes, setParticipantes] = useState<Participante[]>([]);
  const [capacitaciones, setCapacitaciones] = useState<Capacitacion[]>([]);

  useEffect(() => {
    if (!user) return;
    const unsub1 = subscribeParticipantes(setParticipantes);
    const unsub2 = subscribeCapacitaciones(setCapacitaciones);
    return () => {
      unsub1();
      unsub2();
    };
  }, [user]);

  if (!user) return <LoginScreen onSuccess={setUser} />;

  return (
    <div className="min-h-screen flex flex-col max-w-[850px] mx-auto bg-[#F4F6FA] sm:my-6 sm:rounded-3xl sm:shadow-2xl sm:overflow-hidden sm:h-[calc(100vh-48px)]">
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
          <HomeScreen user={user} participantes={participantes} capacitaciones={capacitaciones} onNavigate={setTab} />
        )}
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
