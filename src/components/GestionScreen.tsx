import { useEffect, useMemo, useState } from 'react';
import AuditTimeline from './AuditTimeline';
import { FAMILY_COLORS } from '../data/colors';
import {
  addCompanerismo,
  addConsejeroToFamilia,
  addFamilia,
  deleteFamilia,
  isConsejero,
  isCoordAux,
  removeCompanerismo,
  removeConsejeroFromFamilia,
  subscribeCompanerismo,
  subscribeFamilias,
  updateFamiliaMeta,
} from '../services/familiasService';
import { deshacerReparto, ejecutarReparto, subscribeRepartoActivo } from '../services/repartoFamiliasService';
import {
  calcularCandidatosPorRol,
  calcularEdad,
  calcularEstadisticas,
  repartoCompleto,
  type CandidatoReparto,
  type FuenteReparto,
} from '../utils/repartoFamilias';
import { downloadBlob, generarRepartoPdf } from '../utils/repartoPdf';
import { generarPresentacionHtml } from '../utils/repartoPresentacion';
import { subscribeAllAsistencia } from '../services/asistenciaService';
import { EVENTO_NOMBRE } from '../data/evento';
import { crearNocheHogar, marcarAsistenciaNocheHogar, subscribeNochesHogar } from '../services/nochesHogarService';
import { updateParticipante } from '../services/participantsService';
import { addCapacitacion, deleteCapacitacion } from '../services/capacitacionesService';
import { createStaffAccount, setUsuarioActivo, subscribeUsuarios } from '../services/authService';
import { useScrollDirection } from '../utils/useScrollDirection';
import { ASIGNACIONES, type Asignacion, type Asistencia, type Capacitacion, type Companerismo, type Familia, type NocheHogar, type Participante, type RepartoFamiliasActivo, type SessionUser, type Usuario } from '../types';
import { validateEmail } from '../utils/validation';

type SubTab = 'familias' | 'reparto' | 'roles' | 'capacitaciones' | 'usuarios';

export default function GestionScreen({
  user,
  participantes,
  capacitaciones,
  onNavHiddenChange,
}: {
  user: SessionUser;
  participantes: Participante[];
  capacitaciones: Capacitacion[];
  onNavHiddenChange: (hidden: boolean) => void;
}) {
  const handleScroll = useScrollDirection(onNavHiddenChange);
  const [sub, setSub] = useState<SubTab>('familias');
  const [familias, setFamilias] = useState<Familia[]>([]);
  const [companerismo, setCompanerismo] = useState<Companerismo[]>([]);
  const [asistencia, setAsistencia] = useState<Asistencia[]>([]);

  useEffect(() => {
    const u1 = subscribeFamilias(setFamilias);
    const u2 = subscribeCompanerismo(setCompanerismo);
    const u3 = subscribeAllAsistencia(setAsistencia);
    return () => {
      u1();
      u2();
      u3();
    };
  }, []);

  return (
    <div className="flex flex-col h-full">
      <div className="flex bg-white border-b border-slate-200 shrink-0 overflow-x-auto">
        {(
          [
            ['familias', '👥 Familias'],
            ...(user.canRepartirFamilias ? [['reparto', '🔀 Reparto'] as const] : []),
            ['roles', '🎭 Roles'],
            ['capacitaciones', '📅 Capacitaciones'],
            ...(user.canEditAll ? [['usuarios', '🔑 Usuarios'] as const] : []),
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setSub(id)}
            className={`flex-1 py-2.5 text-xs font-bold border-b-2 whitespace-nowrap px-2 ${sub === id ? 'border-primary text-primary' : 'border-transparent text-slate-500'}`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-4 pb-24" onScroll={handleScroll}>
        {sub === 'familias' && (
          <FamiliasTab user={user} participantes={participantes} familias={familias} companerismo={companerismo} />
        )}
        {sub === 'reparto' && user.canRepartirFamilias && (
          <RepartoTab
            user={user}
            participantes={participantes}
            capacitaciones={capacitaciones}
            familias={familias}
            companerismo={companerismo}
            asistencia={asistencia}
          />
        )}
        {sub === 'roles' && <RolesTab user={user} participantes={participantes} />}
        {sub === 'capacitaciones' && <CapacitacionesTab user={user} capacitaciones={capacitaciones} />}
        {sub === 'usuarios' && user.canEditAll && <UsuariosTab user={user} />}
      </div>
    </div>
  );
}

// ── Familias + Compañerismo ─────────────────────────────────────────────────
function FamiliasTab({
  user,
  participantes,
  familias,
  companerismo,
}: {
  user: SessionUser;
  participantes: Participante[];
  familias: Familia[];
  companerismo: Companerismo[];
}) {
  const [selId, setSelId] = useState('');
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('');
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');

  const fam = familias.find((f) => f.id === selId) || null;
  const usedColorIds = familias.map((f) => f.colorId).filter(Boolean);
  const assignedIds = new Set(familias.flatMap((f) => f.consejeros));
  const eligibles = participantes.filter((p) => isConsejero(p) && !assignedIds.has(p.id));
  const results = useMemo(
    () => (search.length >= 2 ? eligibles.filter((p) => `${p.nombres} ${p.apellidos}`.toLowerCase().includes(search.toLowerCase())).slice(0, 6) : []),
    [search, eligibles]
  );
  const famMembers = fam ? participantes.filter((p) => fam.consejeros.includes(p.id)) : [];
  const famCp = fam ? companerismo.filter((c) => c.familiaId === fam.id) : [];
  const coordAux = participantes.filter(isCoordAux);
  const [detail, setDetail] = useState<Participante | null>(null);

  // Un Coordinador Auxiliar solo administra SU propia familia — nunca ve el
  // selector ni puede navegar a otras. Se fuerza apenas se conoce su
  // familiaId (viene de la sesión, resuelto en el login).
  const forcedFamilyId = user.isAuxiliar ? user.familiaId || '' : '';
  useEffect(() => {
    if (forcedFamilyId) setSelId(forcedFamilyId);
  }, [forcedFamilyId]);

  async function handleCreate() {
    const f = await addFamilia(newName.trim(), newColor, familias, user.correo);
    setSelId(f.id);
    setCreating(false);
    setNewName('');
    setNewColor('');
  }

  async function handleDelete() {
    if (!fam) return;
    if (!confirm(`¿Eliminar ${fam.customName || fam.nombre}? Se desvincularán ${fam.consejeros.length} consejero(s).`)) return;
    await deleteFamilia(fam, user.correo);
    setSelId('');
  }

  async function handleAdd(p: Participante) {
    if (!fam) return;
    try {
      await addConsejeroToFamilia(fam, p, user.correo);
      setSearch('');
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {user.isAuxiliar ? (
        forcedFamilyId ? (
          <div className="bg-primary/5 border border-primary/15 rounded-2xl px-4 py-3 text-sm font-bold text-primary">
            🔒 Administrando: {fam?.customName || fam?.nombre || 'tu familia'}
          </div>
        ) : (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3.5 text-sm text-amber-800">
            Todavía no estás asignado a ninguna familia. Pide a un Coordinador General que te añada como consejero de
            la familia que vas a apoyar.
          </div>
        )
      ) : (
        <div className="flex gap-2">
          <select className="input flex-1" value={selId} onChange={(e) => setSelId(e.target.value)}>
            <option value="">— Elige una familia —</option>
            {familias.map((f) => (
              <option key={f.id} value={f.id}>{f.customName || f.nombre} ({f.consejeros.length})</option>
            ))}
          </select>
          {user.canEditAll && (
            <button onClick={() => setCreating(true)} className="bg-primary text-white text-sm font-bold rounded-xl px-4">
              + Nueva
            </button>
          )}
        </div>
      )}

      {creating && (
        <div className="bg-white rounded-2xl p-4 shadow-sm flex flex-col gap-3">
          <div className="text-sm font-bold">Nueva familia</div>
          <input className="input" placeholder="Alias (opcional)" value={newName} onChange={(e) => setNewName(e.target.value)} />
          <div className="grid grid-cols-4 gap-2">
            {FAMILY_COLORS.map((c) => {
              const used = usedColorIds.includes(c.id);
              return (
                <button
                  key={c.id}
                  disabled={used}
                  onClick={() => setNewColor(newColor === c.id ? '' : c.id)}
                  className="aspect-square rounded-xl border-[3px]"
                  style={{ background: c.hex, opacity: used ? 0.3 : 1, borderColor: newColor === c.id ? '#1a1a1a' : 'transparent' }}
                />
              );
            })}
          </div>
          <div className="flex gap-2">
            <button onClick={handleCreate} className="flex-1 bg-primary text-white font-bold rounded-xl py-2.5 text-sm">Crear</button>
            <button onClick={() => setCreating(false)} className="flex-1 bg-slate-100 text-slate-600 font-bold rounded-xl py-2.5 text-sm">Cancelar</button>
          </div>
        </div>
      )}

      {fam && (
        <>
          <div className="bg-white rounded-2xl p-4 shadow-sm flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl shrink-0" style={{ background: FAMILY_COLORS.find((c) => c.id === fam.colorId)?.hex || '#E0E0E0' }} />
            <div className="flex-1">
              <div className="font-extrabold">{fam.customName || fam.nombre}</div>
              {fam.customName && <div className="text-xs text-slate-500">{fam.nombre}</div>}
            </div>
            {user.canEditAll && (
              <RenameButton
                current={fam.customName}
                onSave={(v) => updateFamiliaMeta(fam.id, { customName: v }, user.correo)}
              />
            )}
          </div>

          <CompanerismoCard fam={fam} cps={famCp} participantes={participantes} coordAux={coordAux} user={user} />

          <NochesHogarCard fam={fam} miembros={famMembers} user={user} />

          <div className="bg-white rounded-2xl p-4 shadow-sm">
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-2">Consejeros ({famMembers.length})</div>
            {famMembers.map((p) => (
              <div key={p.id} className="flex items-center gap-2 bg-slate-50 rounded-xl px-3 py-2 mb-1.5">
                <button onClick={() => setDetail(p)} className="flex-1 text-left text-sm font-semibold">{p.nombres} {p.apellidos}</button>
                <span className="text-[10px] text-slate-500">{p.estaca}</span>
                <button onClick={() => removeConsejeroFromFamilia(fam, p.id, user.correo)} className="text-red-500 text-xs font-bold bg-red-50 rounded-lg px-2 py-1">
                  ✕
                </button>
              </div>
            ))}
            {famMembers.length === 0 && <div className="text-xs text-slate-500 text-center py-2">Sin consejeros asignados</div>}

            <div className="mt-3 pt-3 border-t border-slate-100">
              <div className="text-[11px] text-slate-500 mb-1.5">Solo participantes con asignación exacta <strong>Consejero</strong> son elegibles.</div>
              <input className="input" placeholder="Buscar consejero sin familia…" value={search} onChange={(e) => setSearch(e.target.value)} />
              {error && <div className="text-xs text-red-500 font-semibold mt-1.5">❌ {error}</div>}
              {results.map((p) => (
                <div key={p.id} className="flex items-center gap-2 bg-primary/5 rounded-xl px-3 py-2 mt-1.5">
                  <div className="flex-1 text-sm font-semibold">{p.nombres} {p.apellidos}</div>
                  <button onClick={() => handleAdd(p)} className="bg-primary text-white text-xs font-bold rounded-lg px-2.5 py-1.5">+ Añadir</button>
                </div>
              ))}
            </div>
          </div>

          {user.canEditAll && (
            <button onClick={handleDelete} className="border-2 border-red-200 text-red-600 font-bold rounded-xl py-2.5 text-sm">
              🗑️ Eliminar familia
            </button>
          )}
        </>
      )}

      {familias.length === 0 && !creating && (
        <div className="bg-white rounded-2xl p-6 text-center shadow-sm">
          <div className="text-3xl mb-2">👥</div>
          <div className="text-sm font-bold mb-1">No hay familias creadas</div>
          <div className="text-xs text-slate-500">Crea la primera para organizar consejeros y compañerismos.</div>
        </div>
      )}

      {detail && (
        <div className="fixed inset-0 bg-black/40 flex items-end z-50" onClick={(e) => e.target === e.currentTarget && setDetail(null)}>
          <div className="bg-white rounded-t-3xl w-full max-w-[850px] mx-auto p-5 max-h-[80vh] overflow-y-auto">
            <div className="font-extrabold text-lg mb-0.5">{detail.nombres} {detail.apellidos}</div>
            <div className="text-xs text-slate-500 mb-4">{detail.asignacion || 'Sin rol'}</div>
            {[
              ['📞', 'Teléfono', detail.telefono],
              ['✉️', 'Correo', detail.correo],
              ['⛪', 'Estaca', detail.estaca],
              ['📍', 'Barrio', detail.barrio],
              ['👤', 'Género', detail.genero === 'H' ? 'Hombre' : 'Mujer'],
            ].map(([icon, label, val]) => (
              <div key={label} className="flex gap-2.5 py-1.5 border-b border-slate-100 text-sm">
                <span className="w-5 text-center">{icon}</span>
                <span className="w-20 text-slate-500 text-xs shrink-0 mt-0.5">{label}</span>
                <span className="font-medium">{val}</span>
              </div>
            ))}
            <div className="mt-4">
              <AuditTimeline participanteId={detail.id} />
            </div>
            <button onClick={() => setDetail(null)} className="w-full mt-3 bg-slate-100 text-slate-600 font-bold rounded-xl py-2.5 text-sm">
              Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Reparto automático de Compañías ─────────────────────────────────────────
// Ver src/utils/repartoFamilias.ts para el algoritmo (puro, sin Firestore) y
// src/services/repartoFamiliasService.ts para la persistencia + deshacer.
function RepartoTab({
  user,
  participantes,
  capacitaciones,
  familias,
  companerismo,
  asistencia,
}: {
  user: SessionUser;
  participantes: Participante[];
  capacitaciones: Capacitacion[];
  familias: Familia[];
  companerismo: Companerismo[];
  asistencia: Asistencia[];
}) {
  const [modoFuente, setModoFuente] = useState<'capacitacion' | 'todos'>('capacitacion');
  const [capacitacionId, setCapacitacionId] = useState('');
  const [preview, setPreview] = useState<Record<string, CandidatoReparto[]> | null>(null);
  const [activo, setActivo] = useState<RepartoFamiliasActivo | null | undefined>(undefined); // undefined = todavía cargando
  const [busy, setBusy] = useState(false);
  const [descargando, setDescargando] = useState<'pdf' | 'presentacion' | null>(null);

  useEffect(() => subscribeRepartoActivo(setActivo), []);

  const capsOrdenadas = useMemo(
    () => [...capacitaciones].sort((a, b) => `${a.fecha}${a.hora}`.localeCompare(`${b.fecha}${b.hora}`)),
    [capacitaciones]
  );
  const capacitacion = capsOrdenadas.find((c) => c.id === capacitacionId) || null;
  const fuenteLista: boolean = modoFuente === 'todos' || !!capacitacion;

  function calcular() {
    if (!familias.length || !fuenteLista) return;
    const fuente: FuenteReparto = modoFuente === 'todos' ? { modo: 'todos' } : { modo: 'capacitacion', capacitacionId: capacitacion!.id };
    const referencia = modoFuente === 'todos' ? new Date() : new Date(`${capacitacion!.fecha}T00:00:00`);
    const familiaIds = familias.map((f) => f.id);
    const consejeros = calcularCandidatosPorRol(participantes, asistencia, fuente, 'Consejero', referencia);
    const logisticos = calcularCandidatosPorRol(participantes, asistencia, fuente, 'Logístico', referencia);
    setPreview(repartoCompleto(consejeros, logisticos, familiaIds));
  }

  async function confirmar() {
    if (!preview) return;
    setBusy(true);
    try {
      const porParticipante: Record<string, Participante[]> = {};
      Object.entries(preview).forEach(([famId, cands]) => (porParticipante[famId] = cands.map((c) => c.participante)));
      const fuenteId = modoFuente === 'todos' ? 'todos-los-registrados' : capacitacion!.id;
      await ejecutarReparto(porParticipante, familias, fuenteId, user.correo);
      setPreview(null);
    } finally {
      setBusy(false);
    }
  }

  async function deshacer() {
    setBusy(true);
    try {
      await deshacerReparto(familias, user.correo);
    } finally {
      setBusy(false);
    }
  }

  function datosPorFamilia() {
    return familias.map((familia) => ({
      familia,
      companerismo: companerismo.filter((c) => c.familiaId === familia.id),
      participantes: participantes.filter((p) => familia.consejeros.includes(p.id)),
    }));
  }

  async function descargarPdf() {
    setDescargando('pdf');
    try {
      const datos = datosPorFamilia().map((d) => {
        const cands: CandidatoReparto[] = d.participantes.map((p) => ({ participante: p, edad: calcularEdad(p.fechaNacimiento, new Date()) }));
        return { ...d, stats: calcularEstadisticas(cands) };
      });
      const blob = await generarRepartoPdf(datos, participantes, EVENTO_NOMBRE, 'Regocíjate en Cristo');
      downloadBlob(blob, `companias-fsy-2027-${new Date().toISOString().slice(0, 10)}.pdf`);
    } finally {
      setDescargando(null);
    }
  }

  function verPresentacion() {
    setDescargando('presentacion');
    try {
      const html = generarPresentacionHtml(datosPorFamilia(), participantes, EVENTO_NOMBRE, 'Regocíjate en Cristo');
      const blob = new Blob([html], { type: 'text/html' });
      downloadBlob(blob, `presentacion-companias-fsy-2027-${new Date().toISOString().slice(0, 10)}.html`);
    } finally {
      setDescargando(null);
    }
  }

  // Vista previa: lo ya asignado a mano en cada familia + lo que el
  // algoritmo propone añadir — así el admin ve el balance REAL resultante,
  // no solo la porción nueva.
  function statsCombinadas(familiaId: string): { stats: ReturnType<typeof calcularEstadisticas>; nuevos: number } {
    const familia = familias.find((f) => f.id === familiaId);
    const actuales: CandidatoReparto[] = (familia ? participantes.filter((p) => familia.consejeros.includes(p.id)) : []).map((p) => ({
      participante: p,
      edad: calcularEdad(p.fechaNacimiento, new Date()),
    }));
    const nuevos = preview?.[familiaId] || [];
    return { stats: calcularEstadisticas([...actuales, ...nuevos]), nuevos: nuevos.length };
  }

  if (activo === undefined) {
    return <div className="text-center text-sm text-slate-500 py-8">Cargando…</div>;
  }

  if (activo) {
    return (
      <div className="flex flex-col gap-3">
        <div className="bg-primary/5 border border-primary/15 rounded-2xl px-4 py-3.5">
          <div className="text-sm font-bold text-primary">✅ Reparto activo</div>
          <div className="text-xs text-slate-600 mt-1">
            {activo.asignados.length} personas repartidas el {new Date(activo.timestamp).toLocaleString('es-PE')}. Para volver a
            calcularlo con otra fuente, primero deshazlo.
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {familias.map((f) => (
            <FamiliaBalanceCard key={f.id} familia={f} participantes={participantes} />
          ))}
        </div>

        <div className="flex gap-2">
          <button
            onClick={deshacer}
            disabled={busy}
            className="flex-1 border-2 border-red-200 text-red-600 font-bold rounded-xl py-2.5 text-sm disabled:opacity-50"
          >
            {busy ? 'Deshaciendo…' : '↩️ Deshacer reparto'}
          </button>
          <button
            onClick={descargarPdf}
            disabled={!!descargando}
            className="flex-1 bg-primary text-white font-bold rounded-xl py-2.5 text-sm disabled:opacity-50"
          >
            {descargando === 'pdf' ? 'Generando…' : '📄 PDF'}
          </button>
          <button
            onClick={verPresentacion}
            disabled={!!descargando}
            className="flex-1 bg-blue-500 text-white font-bold rounded-xl py-2.5 text-sm disabled:opacity-50"
            title="Descarga un HTML autocontenido — ábrelo en el navegador del proyector, sin internet ni login"
          >
            {descargando === 'presentacion' ? 'Generando…' : '🎬 Presentación'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="bg-white rounded-2xl p-4 shadow-sm flex flex-col gap-3">
        <div className="text-sm font-bold">Reparto automático de Compañías</div>
        <div className="text-xs text-slate-500">
          Reparte a los Consejeros (prioridad: sexo parejo → estaca no concentrada → edad distribuida) y luego a los
          Logísticos como relleno, sobre las mismas 4 compañías. Quien ya tenga una compañía asignada a mano queda
          fuera — no se le mueve.
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => { setModoFuente('capacitacion'); setPreview(null); }}
            className={`flex-1 text-xs font-bold rounded-xl py-2 border-[1.5px] ${modoFuente === 'capacitacion' ? 'bg-primary/10 border-primary text-primary' : 'bg-white border-slate-200 text-slate-500'}`}
          >
            Por capacitación
          </button>
          <button
            onClick={() => { setModoFuente('todos'); setPreview(null); }}
            className={`flex-1 text-xs font-bold rounded-xl py-2 border-[1.5px] ${modoFuente === 'todos' ? 'bg-primary/10 border-primary text-primary' : 'bg-white border-slate-200 text-slate-500'}`}
          >
            Todos los registrados
          </button>
        </div>

        {modoFuente === 'capacitacion' ? (
          <select className="input" value={capacitacionId} onChange={(e) => { setCapacitacionId(e.target.value); setPreview(null); }}>
            <option value="">— Elige la capacitación —</option>
            {capsOrdenadas.map((c) => (
              <option key={c.id} value={c.id}>{c.label} — {c.fecha}</option>
            ))}
          </select>
        ) : (
          <div className="text-[11px] text-slate-500 bg-slate-50 rounded-lg px-3 py-2">
            Sin filtrar por asistencia — entran todos los Consejeros y Logísticos registrados que todavía no tienen compañía.
          </div>
        )}

        <button
          onClick={calcular}
          disabled={!fuenteLista || !familias.length}
          className="bg-primary text-white font-bold rounded-xl py-2.5 text-sm disabled:opacity-40"
        >
          Calcular reparto
        </button>
        {!familias.length && <div className="text-xs text-amber-700">Crea al menos una compañía en la pestaña Familias primero.</div>}
      </div>

      {preview && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {familias.map((f) => {
              const { stats, nuevos } = statsCombinadas(f.id);
              return <FamiliaStatsCard key={f.id} familia={f} stats={stats} nuevos={nuevos} />;
            })}
          </div>
          <button
            onClick={confirmar}
            disabled={busy}
            className="bg-primary text-white font-bold rounded-xl py-3 text-sm disabled:opacity-50"
          >
            {busy ? 'Guardando…' : '✅ Confirmar reparto'}
          </button>
        </>
      )}
    </div>
  );
}

function statColorHex(familia: Familia): string {
  return FAMILY_COLORS.find((c) => c.id === familia.colorId)?.hex || '#94A3B8';
}

function FamiliaStatsCard({
  familia,
  stats,
  nuevos,
}: {
  familia: Familia;
  stats: ReturnType<typeof calcularEstadisticas>;
  nuevos: number;
}) {
  return (
    <div className="bg-white rounded-2xl p-3.5 shadow-sm border-t-[3px]" style={{ borderTopColor: statColorHex(familia) }}>
      <div className="font-extrabold text-sm mb-1">{familia.customName || familia.nombre}</div>
      <div className="text-[11px] text-emerald-600 font-bold mb-2">+{nuevos} nuevo(s) propuesto(s)</div>
      <div className="text-xs text-slate-600 space-y-0.5">
        <div>Total: <strong>{stats.total}</strong> · H: {stats.hombres} · M: {stats.mujeres}</div>
        <div>Edad — prom: {stats.edadPromedio} · mediana: {stats.edadMediana} · moda: {stats.edadModa ?? '—'}</div>
        <div className="pt-1 text-[10px] text-slate-500">
          Ventanilla {stats.porEstaca.Ventanilla} · P. Piedra {stats.porEstaca['Puente Piedra']} · Pro Lima{' '}
          {stats.porEstaca['Pro Lima']} · Otros {stats.porEstaca.Otros}
        </div>
      </div>
    </div>
  );
}

function FamiliaBalanceCard({ familia, participantes }: { familia: Familia; participantes: Participante[] }) {
  const miembros = participantes.filter((p) => familia.consejeros.includes(p.id));
  const cands: CandidatoReparto[] = miembros.map((p) => ({ participante: p, edad: calcularEdad(p.fechaNacimiento, new Date()) }));
  const stats = calcularEstadisticas(cands);
  return (
    <div className="bg-white rounded-2xl p-3.5 shadow-sm border-t-[3px]" style={{ borderTopColor: statColorHex(familia) }}>
      <div className="font-extrabold text-sm mb-2">{familia.customName || familia.nombre}</div>
      <div className="text-xs text-slate-600 space-y-0.5">
        <div>Total: <strong>{stats.total}</strong> · H: {stats.hombres} · M: {stats.mujeres}</div>
        <div className="pt-1 text-[10px] text-slate-500">
          Ventanilla {stats.porEstaca.Ventanilla} · P. Piedra {stats.porEstaca['Puente Piedra']} · Pro Lima{' '}
          {stats.porEstaca['Pro Lima']} · Otros {stats.porEstaca.Otros}
        </div>
      </div>
    </div>
  );
}

function NochesHogarCard({ fam, miembros, user }: { fam: Familia; miembros: Participante[]; user: SessionUser }) {
  const [noches, setNoches] = useState<NocheHogar[]>([]);
  const [planning, setPlanning] = useState(false);
  const [fecha, setFecha] = useState('');
  const [titulo, setTitulo] = useState('Noche de Hogar');

  useEffect(() => subscribeNochesHogar(fam.id, setNoches), [fam.id]);

  async function crear() {
    if (!fecha) return;
    await crearNocheHogar(fam.id, fecha, titulo, user.correo);
    setPlanning(false);
    setFecha('');
    setTitulo('Noche de Hogar');
  }

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border-l-4 border-accent">
      <div className="flex items-center gap-2 mb-2.5">
        <span className="text-xl">🏠</span>
        <div className="flex-1">
          <div className="text-sm font-extrabold">Noches de Hogar</div>
          <div className="text-[11px] text-slate-500">Planifica y mide asistencia interna de esta familia.</div>
        </div>
        <button onClick={() => setPlanning((v) => !v)} className="text-xs font-bold text-primary bg-primary/10 rounded-lg px-2.5 py-1.5">
          {planning ? 'Cerrar' : 'Planificar'}
        </button>
      </div>

      {planning && (
        <div className="flex flex-col gap-2 mb-3">
          <input className="input" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          <input className="input" placeholder="Título" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
          <button onClick={crear} className="bg-primary text-white font-bold rounded-xl py-2.5 text-sm">Guardar Noche de Hogar</button>
        </div>
      )}

      {noches.length === 0 && <div className="text-xs text-slate-500 text-center py-2">Aún no hay Noches de Hogar planificadas.</div>}

      {[...noches].reverse().map((noche) => (
        <div key={noche.id} className="bg-slate-50 rounded-xl p-3 mt-2">
          <div className="flex justify-between text-xs mb-2">
            <strong className="text-primary">{noche.titulo}</strong>
            <span className="text-slate-500">{noche.fecha}</span>
          </div>
          <div className="flex flex-col gap-1.5">
            {miembros.map((p) => {
              const checked = noche.asistencia[p.id] === 'presente';
              return (
                <button
                  key={p.id}
                  onClick={() => marcarAsistenciaNocheHogar(noche, p.id, checked ? 'ausente' : 'presente', user.correo)}
                  className={`flex justify-between items-center rounded-lg px-2.5 py-1.5 text-xs border ${
                    checked ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-white border-slate-200'
                  }`}
                >
                  <span>{p.nombres} {p.apellidos}</span>
                  <strong>{checked ? '✅ Presente' : '○ Marcar'}</strong>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function CompanerismoCard({
  fam,
  cps,
  participantes,
  coordAux,
  user,
}: {
  fam: Familia;
  cps: Companerismo[];
  participantes: Participante[];
  coordAux: Participante[];
  user: SessionUser;
}) {
  const [adding, setAdding] = useState(false);
  const [q1, setQ1] = useState('');
  const [q2, setQ2] = useState('');
  const [sel1, setSel1] = useState<Participante | null>(null);
  const [sel2, setSel2] = useState<Participante | null>(null);
  const [error, setError] = useState('');

  async function confirm() {
    try {
      await addCompanerismo(fam.id, sel1, sel2, user.correo);
      setSel1(null);
      setSel2(null);
      setAdding(false);
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm">
      <div className="flex items-center mb-2">
        <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wide flex-1">Compañerismos — Coord. Auxiliares</div>
        <button onClick={() => setAdding((v) => !v)} className="text-xs font-bold text-primary bg-primary/10 rounded-lg px-2 py-1">
          {adding ? 'Cancelar' : '+ Añadir'}
        </button>
      </div>
      {cps.map((cp) => {
        const p1 = participantes.find((p) => p.id === cp.p1Id);
        const p2 = participantes.find((p) => p.id === cp.p2Id);
        return (
          <div key={cp.id} className="flex items-center gap-2 bg-slate-50 border-l-[3px] border-primary rounded-xl px-3 py-2 mb-1.5">
            <div className="flex-1 text-xs">
              <div>🤝 P1: {p1 ? `${p1.nombres} ${p1.apellidos}` : 'Sin asignar'}</div>
              <div>🤝 P2: {p2 ? `${p2.nombres} ${p2.apellidos}` : 'Sin asignar'}</div>
            </div>
            <button onClick={() => removeCompanerismo(cp.id, user.correo)} className="text-red-500 text-xs font-bold bg-red-50 rounded-lg px-2 py-1">✕</button>
          </div>
        );
      })}
      {cps.length === 0 && !adding && <div className="text-xs text-slate-500 text-center py-1">Sin compañerismos asignados</div>}

      {adding && (
        <div className="pt-2 border-t border-slate-100 mt-2 flex flex-col gap-2">
          {error && <div className="text-xs text-red-500 font-semibold">❌ {error}</div>}
          {[{ sel: sel1, setSel: setSel1, q: q1, setQ: setQ1, label: 'Coordinador 1' }, { sel: sel2, setSel: setSel2, q: q2, setQ: setQ2, label: 'Coordinador 2' }].map(
            ({ sel, setSel, q, setQ, label }) => (
              <div key={label}>
                <div className="text-[11px] text-slate-500 font-semibold mb-1">{label} (opcional)</div>
                {sel ? (
                  <div className="flex items-center gap-2 bg-primary/10 rounded-xl px-3 py-2">
                    <span className="flex-1 text-sm font-semibold text-primary">{sel.nombres} {sel.apellidos}</span>
                    <button onClick={() => setSel(null)} className="text-slate-500">✕</button>
                  </div>
                ) : (
                  <input className="input" placeholder="Buscar Coord. Auxiliar…" value={q} onChange={(e) => setQ(e.target.value)} />
                )}
                {!sel && q.length >= 2 && (
                  <div className="border border-primary rounded-xl mt-1 overflow-hidden">
                    {coordAux
                      .filter((p) => `${p.nombres} ${p.apellidos}`.toLowerCase().includes(q.toLowerCase()))
                      .slice(0, 5)
                      .map((p) => (
                        <div key={p.id} onClick={() => setSel(p)} className="px-3 py-2 text-sm border-b border-slate-100 last:border-0">
                          {p.nombres} {p.apellidos}
                        </div>
                      ))}
                  </div>
                )}
              </div>
            )
          )}
          <button onClick={confirm} className="bg-primary text-white font-bold rounded-xl py-2.5 text-sm mt-1">✓ Guardar compañerismo</button>
        </div>
      )}
    </div>
  );
}

function RenameButton({ current, onSave }: { current: string; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState(current);
  if (!editing) {
    return (
      <button onClick={() => setEditing(true)} className="text-xs font-bold text-primary bg-primary/10 rounded-lg px-2.5 py-1.5">
        ✏️ Renombrar
      </button>
    );
  }
  return (
    <div className="flex gap-1">
      <input className="input py-1.5 text-sm" value={v} onChange={(e) => setV(e.target.value)} autoFocus />
      <button
        onClick={() => {
          onSave(v.trim());
          setEditing(false);
        }}
        className="bg-primary text-white text-xs font-bold rounded-lg px-2"
      >
        OK
      </button>
    </div>
  );
}

// ── Roles ────────────────────────────────────────────────────────────────
function RolesTab({ user, participantes }: { user: SessionUser; participantes: Participante[] }) {
  const [editing, setEditing] = useState<Participante | null>(null);

  return (
    <div className="flex flex-col gap-2">
      {ASIGNACIONES.map((rol) => {
        const members = participantes.filter((p) => p.asignacion === rol);
        return (
          <details key={rol} className="bg-white rounded-2xl p-3.5 shadow-sm">
            <summary className="flex items-center gap-2 cursor-pointer list-none">
              <span className="flex-1 text-sm font-bold">{rol}</span>
              <span className="bg-primary/10 text-primary text-xs font-bold rounded-full px-2.5 py-0.5">{members.length}</span>
            </summary>
            <div className="mt-2.5 pt-2.5 border-t border-slate-100 flex flex-col gap-1.5">
              {members.length === 0 && <div className="text-xs text-slate-500 text-center py-1">Sin asignados</div>}
              {members.map((p) =>
                user.canChangeRoles ? (
                  <button
                    key={p.id}
                    onClick={() => setEditing(p)}
                    className="flex items-center gap-2 bg-slate-50 rounded-xl px-3 py-2 text-left"
                  >
                    <span className="flex-1 text-sm font-semibold">{p.nombres} {p.apellidos}</span>
                    <span className="text-xs text-primary font-bold">Cambiar ›</span>
                  </button>
                ) : (
                  <div key={p.id} className="flex items-center gap-2 bg-slate-50 rounded-xl px-3 py-2">
                    <span className="flex-1 text-sm font-semibold">{p.nombres} {p.apellidos}</span>
                  </div>
                )
              )}
            </div>
          </details>
        );
      })}

      {editing && (
        <div className="fixed inset-0 bg-black/40 flex items-end z-50" onClick={(e) => e.target === e.currentTarget && setEditing(null)}>
          <div className="bg-white rounded-t-3xl w-full max-w-[850px] mx-auto p-5 max-h-[80vh] overflow-y-auto">
            <div className="text-sm font-bold mb-3">Cambiar rol — {editing.nombres} {editing.apellidos}</div>
            <div className="flex flex-col gap-2">
              {ASIGNACIONES.map((rol) => (
                <button
                  key={rol}
                  onClick={async () => {
                    await updateParticipante(editing.id, { asignacion: rol as Asignacion }, user.correo);
                    setEditing(null);
                  }}
                  className={`text-left rounded-xl px-4 py-2.5 text-sm font-semibold border-1.5 ${
                    editing.asignacion === rol ? 'bg-primary/10 border-primary text-primary' : 'border-slate-200'
                  }`}
                >
                  {rol}
                </button>
              ))}
            </div>
            <button onClick={() => setEditing(null)} className="w-full mt-3 bg-slate-100 text-slate-600 font-bold rounded-xl py-2.5 text-sm">
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Capacitaciones (admin) ──────────────────────────────────────────────────
// Confirmación de eliminar en 2 pasos: tocar "Eliminar" la arma (cambia de
// ícono a un aviso explícito) por unos segundos; solo si se toca DE NUEVO en
// esa ventana se ejecuta el borrado. Sin modal nuevo, sin input de texto —
// evita el borrado accidental (el caso real que motivó esto) sin la fricción
// de escribir una palabra de confirmación para una acción que un admin hace
// seguido. Si no se confirma a tiempo, vuelve solo al estado normal.
const CONFIRM_WINDOW_MS = 4000;

function CapacitacionesTab({ user, capacitaciones }: { user: SessionUser; capacitaciones: Capacitacion[] }) {
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState('');
  const [fecha, setFecha] = useState('');
  const [hora, setHora] = useState('09:00');
  const [horaFin, setHoraFin] = useState('');
  const [lugar, setLugar] = useState('');
  const [armedId, setArmedId] = useState<string | null>(null);

  // Próximas primero — antes se mostraban en el orden en que Firestore las
  // devuelve (no garantizado, en la práctica se veía como alfabético por
  // label), lo que no ayuda a ubicar rápido "la de este sábado".
  const ordenadas = useMemo(
    () => [...capacitaciones].sort((a, b) => `${a.fecha}${a.hora}`.localeCompare(`${b.fecha}${b.hora}`)),
    [capacitaciones]
  );

  useEffect(() => {
    if (!armedId) return;
    const t = setTimeout(() => setArmedId(null), CONFIRM_WINDOW_MS);
    return () => clearTimeout(t);
  }, [armedId]);

  function handleDeleteClick(c: Capacitacion) {
    if (armedId === c.id) {
      setArmedId(null);
      deleteCapacitacion(c.id, user.correo);
    } else {
      setArmedId(c.id);
    }
  }

  async function submit() {
    if (!fecha) return;
    // horaFin: cadena vacía si se deja en blanco, NUNCA `undefined` — a
    // diferencia de CONFEJAS 2026 (su app hermana), este proyecto no tiene
    // un stripUndefined() antes de setDoc, y Firestore rechaza cualquier
    // campo con valor `undefined` con un error genérico. Como el resto del
    // modelo (asignacionAnterior, familiaId) ya usa '' como "sin dato", se
    // sigue el mismo patrón acá en vez de portar ese helper para un solo campo.
    await addCapacitacion(
      { label: label || `Capacitación — ${fecha}`, fecha, hora, horaFin, lugar: lugar || 'Por confirmar', oficial: true },
      user.correo
    );
    setAdding(false);
    setLabel('');
    setFecha('');
    setHoraFin('');
    setLugar('');
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Sesiones programadas</div>
        {user.canEditAll && (
          <button onClick={() => setAdding(true)} className="bg-primary text-white text-xs font-bold rounded-lg px-3 py-1.5">+ Añadir</button>
        )}
      </div>

      {adding && (
        <div className="bg-white rounded-2xl p-4 shadow-sm flex flex-col gap-2">
          <input className="input" placeholder="Nombre (opcional)" value={label} onChange={(e) => setLabel(e.target.value)} />
          <input className="input" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          <div className="flex gap-2">
            <div className="flex-1">
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Hora inicio</div>
              <input className="input" type="time" value={hora} onChange={(e) => setHora(e.target.value)} />
            </div>
            <div className="flex-1">
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Hora final (opcional)</div>
              <input className="input" type="time" value={horaFin} onChange={(e) => setHoraFin(e.target.value)} />
            </div>
          </div>
          {/* Solo aparece si hay otra capacitación el mismo día — cubre el
              caso real que motivó agregar horaFin: dos sesiones un mismo
              sábado, y sin hora final no hay forma de saber en el Home si
              la de la mañana ya terminó o si "está en curso" toda la tarde. */}
          {fecha && !horaFin && capacitaciones.filter((c) => c.fecha === fecha).length > 0 && (
            <div className="text-[11px] text-amber-700 bg-amber-50 rounded-lg px-2.5 py-2">
              ⚠️ Ya hay otra capacitación este mismo día — pon la hora final para que el Home no las confunda.
            </div>
          )}
          <input className="input" placeholder="Lugar" value={lugar} onChange={(e) => setLugar(e.target.value)} />
          <div className="flex gap-2">
            <button onClick={submit} className="flex-1 bg-primary text-white font-bold rounded-xl py-2.5 text-sm">Confirmar</button>
            <button onClick={() => setAdding(false)} className="flex-1 bg-slate-100 text-slate-600 font-bold rounded-xl py-2.5 text-sm">Cancelar</button>
          </div>
        </div>
      )}

      {capacitaciones.length === 0 && !adding && (
        <div className="bg-white rounded-2xl p-6 text-center shadow-sm">
          <div className="text-3xl mb-2">📅</div>
          <div className="text-sm font-bold">Sin capacitaciones programadas</div>
        </div>
      )}

      {ordenadas.map((c) => {
        const armed = armedId === c.id;
        return (
          <div
            key={c.id}
            className={`bg-white rounded-2xl p-3.5 shadow-sm flex items-center gap-3 border ${armed ? 'border-red-200' : 'border-transparent'}`}
          >
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-lg shrink-0">📅</div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold truncate">{c.label}</div>
              <div className="text-[11px] text-slate-500">{c.fecha} · {c.hora}{c.horaFin ? `–${c.horaFin}` : ''} · {c.lugar}</div>
            </div>
            {user.canEditAll && (
              armed ? (
                <button
                  onClick={() => handleDeleteClick(c)}
                  className="shrink-0 text-red-700 text-[11px] font-bold bg-red-100 rounded-lg px-2.5 py-1.5 max-w-[130px] text-right leading-tight"
                >
                  ¿Eliminar y perder su asistencia registrada?
                </button>
              ) : (
                <button
                  onClick={() => handleDeleteClick(c)}
                  className="shrink-0 text-red-500 text-xs font-bold bg-red-50 rounded-lg px-2 py-1.5"
                >
                  ✕
                </button>
              )
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Usuarios (staff) ─────────────────────────────────────────────────────────
const ROLES_STAFF = ['Coordinador General', 'Logística', 'Coordinador Auxiliar'] as const;

function UsuariosTab({ user }: { user: SessionUser }) {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [creando, setCreando] = useState(false);
  const [correo, setCorreo] = useState('');
  const [rol, setRol] = useState<(typeof ROLES_STAFF)[number]>('Coordinador Auxiliar');
  const [estaca, setEstaca] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => subscribeUsuarios(setUsuarios), []);

  const yaExiste = usuarios.some((u) => u.correo.toLowerCase().trim() === correo.toLowerCase().trim());

  async function crear() {
    setError('');
    if (!validateEmail(correo)) return setError('Ingresa un correo válido.');
    if (yaExiste) return setError('Ya existe una cuenta con ese correo.');
    setSaving(true);
    try {
      await createStaffAccount(correo, rol, rol === 'Coordinador Auxiliar' ? estaca : '', user.correo);
      setCreando(false);
      setCorreo('');
      setEstaca('');
      setRol('Coordinador Auxiliar');
    } catch {
      setError('No se pudo crear la cuenta. Intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Cuentas de staff</div>
        <button onClick={() => setCreando(true)} className="bg-primary text-white text-xs font-bold rounded-lg px-3 py-1.5">
          + Añadir
        </button>
      </div>

      {creando && (
        <div className="bg-white rounded-2xl p-4 shadow-sm flex flex-col gap-3">
          <div className="text-sm font-bold">Nueva cuenta de staff</div>
          <div>
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1">Correo</div>
            <input className="input" type="email" placeholder="correo@ejemplo.com" value={correo} onChange={(e) => setCorreo(e.target.value)} />
          </div>
          <div>
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1">Rol</div>
            <select className="input" value={rol} onChange={(e) => setRol(e.target.value as (typeof ROLES_STAFF)[number])}>
              {ROLES_STAFF.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
          {rol === 'Coordinador Auxiliar' && (
            <div>
              <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1">Estaca</div>
              <input className="input" placeholder="Ej: Ventanilla" value={estaca} onChange={(e) => setEstaca(e.target.value)} />
            </div>
          )}
          {error && <div className="text-xs text-red-500 font-semibold">❌ {error}</div>}
          <div className="text-[11px] text-slate-500">
            La persona entra con este correo y cualquier contraseña — la app le va a pedir crear la suya en el primer acceso.
          </div>
          <div className="flex gap-2">
            <button onClick={crear} disabled={saving} className="flex-1 bg-primary text-white font-bold rounded-xl py-2.5 text-sm disabled:opacity-50">
              {saving ? 'Creando…' : 'Crear cuenta'}
            </button>
            <button onClick={() => { setCreando(false); setError(''); }} className="flex-1 bg-slate-100 text-slate-600 font-bold rounded-xl py-2.5 text-sm">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {usuarios.length === 0 && !creando && (
        <div className="bg-white rounded-2xl p-6 text-center shadow-sm">
          <div className="text-3xl mb-2">🔑</div>
          <div className="text-sm font-bold mb-1">Sin cuentas de staff todavía</div>
          <div className="text-xs text-slate-500">Crea la primera con el botón de arriba.</div>
        </div>
      )}

      {usuarios.map((u) => (
        <div key={u.correo} className="bg-white rounded-2xl p-3.5 shadow-sm flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/10 text-primary font-bold text-sm flex items-center justify-center shrink-0">
            {u.correo[0]?.toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold truncate">{u.correo}</div>
            <div className="text-[11px] text-slate-500">
              {u.rol}
              {u.estaca && ` · ${u.estaca}`}
              {!u.passwordHash && ' · aún no entró'}
            </div>
          </div>
          {u.correo !== user.correo && (
            <button
              onClick={() => setUsuarioActivo(u.correo, !u.activo, user.correo)}
              className={`text-xs font-bold rounded-lg px-2.5 py-1.5 shrink-0 ${
                u.activo ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-700'
              }`}
            >
              {u.activo ? 'Desactivar' : 'Activar'}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
