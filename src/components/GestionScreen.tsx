import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAvisoDeshacer } from './AvisoDeshacer';
import AuditTimeline from './AuditTimeline';
import InfoSheet, { BotonInfo } from './InfoSheet';
import HistorialTab from './HistorialTab';
import CompanerismosFamilia, { useParejas } from './CompanerismosFamilia';
import { FAMILY_COLORS } from '../data/colors';
import {
  addCompanerismo,
  addConsejeroToFamilia,
  addFamilia,
  deleteFamilia,
  familiasDeAuxiliar,
  isConsejero,
  isLogistico,
  isCoordAux,
  removeCompanerismo,
  removeConsejeroFromFamilia,
  subscribeCompanerismo,
  subscribeFamilias,
  updateFamiliaMeta,
} from '../services/familiasService';
import { deshacerReparto, ejecutarReparto, subscribeHistorialReparto } from '../services/repartoFamiliasService';
import {
  calcularCandidatosPorRol,
  calcularEdad,
  calcularEstadisticas,
  calcularEstadoFamilia,
  participaRegular,
  repartoCompleto,
  type CandidatoReparto,
  type EstadoFamilia,
  type FuenteReparto,
} from '../utils/repartoFamilias';
import { downloadBlob, generarRepartoPdf } from '../utils/repartoPdf';
import { generarPresentacionHtml } from '../utils/repartoPresentacion';
import { subscribeAllAsistencia } from '../services/asistenciaService';
import { EVENTO_NOMBRE } from '../data/evento';
import { crearNocheHogar, editarNocheHogar, eliminarNocheHogar, marcarAsistenciaNocheHogar, marcarVariosNocheHogar, restaurarNocheHogar, subscribeNochesHogar } from '../services/nochesHogarService';
import { ordenarParaVista, resumenNoche, sumarDias } from '../utils/nochesHogar';
import { updateParticipante } from '../services/participantsService';
import { addCapacitacion, deleteCapacitacion, setTipoCapacitacion } from '../services/capacitacionesService';
import { hoyLocalISO, infoTipo, tipoDe } from '../utils/tiposEvento';
import { fechaAmigable, partesFecha, rangoHora } from '../utils/fechaAmigable';
import { createStaffAccount, restablecerContrasena, setUsuarioActivo, subscribeUsuarios } from '../services/authService';
import { useScrollDirection } from '../utils/useScrollDirection';
import { ASIGNACIONES, TIPOS_EVENTO, type Asignacion, type Asistencia, type Capacitacion, type Companerismo, type EstadoAsistencia, type Familia, type NocheHogar, type ParejaTrabajo, type Participante, type RepartoFamiliasRegistro, type SessionUser, type TipoEvento, type Usuario } from '../types';
import { validateEmail } from '../utils/validation';
import { nombreConInicialMaterna, nombreCorto } from '../utils/nombreCorto';
import { resumenCompaneros } from '../utils/parejasTrabajo';
import { infoCompanias, nombreCompania } from '../utils/companias';
import ScrollX from './ScrollX';

// Reparto automático de compañías: ya no se va a usar. La sección queda oculta (no
// borrada) por si hiciera falta de nuevo — basta poner esto en `true`.
const REPARTO_VISIBLE = false;

type SubTab = 'familias' | 'reparto' | 'roles' | 'capacitaciones' | 'usuarios' | 'historial';

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
  // Bajando por una lista, el menú inferior y la franja de compañías se esconden; al subir un poco, vuelven.
  const [bajando, setBajando] = useState(false);
  const alCambiarScroll = useCallback(
    (oculto: boolean) => {
      setBajando(oculto);
      onNavHiddenChange(oculto);
    },
    [onNavHiddenChange]
  );
  const handleScroll = useScrollDirection(alCambiarScroll);
  const [sub, setSub] = useState<SubTab>('familias');
  useEffect(() => setBajando(false), [sub]);
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
      <div className="bg-white border-b border-slate-200 shrink-0">
      <ScrollX seguir={sub} className="flex">
        {(
          [
            ['familias', '👥 Compañías'],
            ...(REPARTO_VISIBLE && user.canRepartirFamilias ? [['reparto', '🔀 Reparto'] as const] : []),
            ['roles', '🎭 Roles'],
            // El Coordinador Auxiliar solo ve Familias (la suya) y Roles.
            ...(!user.isAuxiliar ? [['capacitaciones', '📅 Capacitaciones'] as const] : []),
            ...(user.canEditAll ? [['usuarios', '🔑 Usuarios'] as const, ['historial', '🕘 Historial'] as const] : []),
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setSub(id)}
            aria-current={sub === id ? 'true' : undefined}
            className={`flex-1 py-2.5 text-xs font-bold border-b-2 whitespace-nowrap px-2 ${sub === id ? 'border-primary text-primary' : 'border-transparent text-slate-500'}`}
          >
            {label}
          </button>
        ))}
      </ScrollX>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-4 pb-24" onScroll={handleScroll}>
        {sub === 'familias' && (
          <FamiliasTab user={user} participantes={participantes} familias={familias} companerismo={companerismo} ocultarFranja={bajando} />
        )}
        {sub === 'reparto' && REPARTO_VISIBLE && user.canRepartirFamilias && (
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
        {sub === 'capacitaciones' && !user.isAuxiliar && <CapacitacionesTab user={user} capacitaciones={capacitaciones} />}
        {sub === 'usuarios' && user.canEditAll && <UsuariosTab user={user} participantes={participantes} />}
        {sub === 'historial' && user.canEditAll && <HistorialTab participantes={participantes} capacitaciones={capacitaciones} familias={familias} />}
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
  ocultarFranja,
}: {
  user: SessionUser;
  participantes: Participante[];
  familias: Familia[];
  companerismo: Companerismo[];
  /** Bajando por la lista: la franja de compañías se esconde y deja solo una línea del color de la compañía. */
  ocultarFranja: boolean;
}) {
  const [selId, setSelId] = useState('');
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('');
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');

  // Un Coordinador Auxiliar solo ve las familias donde está en un compañerismo
  // (ver familiasDeAuxiliar). Para él, `visibles` reemplaza a `familias` en
  // todo lo que se MUESTRA; `familias` completo sigue usándose solo para
  // calcular quién está sin compañía (assignedIds).
  const visibles = useMemo(
    () => (user.isAuxiliar ? familiasDeAuxiliar(user.participantId, companerismo, familias) : familias),
    [user.isAuxiliar, user.participantId, companerismo, familias]
  );
  const fam = visibles.find((f) => f.id === selId) || null;
  const usedColorIds = familias.map((f) => f.colorId).filter(Boolean);
  const assignedIds = new Set(familias.flatMap((f) => f.consejeros));
  const eligibles = participantes.filter((p) => (isConsejero(p) || isLogistico(p)) && !assignedIds.has(p.id));
  const results = useMemo(
    () => (search.length >= 2 ? eligibles.filter((p) => `${p.nombres} ${p.apellidos}`.toLowerCase().includes(search.toLowerCase())).slice(0, 6) : []),
    [search, eligibles]
  );
  const famMembers = fam ? participantes.filter((p) => fam.consejeros.includes(p.id)) : [];
  const famCp = fam ? companerismo.filter((c) => c.familiaId === fam.id) : [];
  const coordAux = participantes.filter(isCoordAux);
  const [detail, setDetail] = useState<Participante | null>(null);
  const parejas = useParejas();
  const { mostrar: mostrarAviso, nodo: avisoNodo } = useAvisoDeshacer();
  // Para "Deshacer" tras quitar a alguien: se lee la compañía ACTUAL, no la de cuando se tocó.
  const familiasRef = useRef(familias);
  familiasRef.current = familias;
  const [integrantesAbierto, setIntegrantesAbierto] = useState(false);
  const [infoParticipa, setInfoParticipa] = useState(false);
  // Marcan: los Coordinadores Auxiliares (de su compañía) y el Coordinador General. El resto solo ve la marca.
  const puedeMarcar = user.canChangeRoles || user.isAuxiliar;
  const participan = famMembers.filter(participaRegular).length;
  useEffect(() => {
    setIntegrantesAbierto(false);
    setSearch('');
    setError('');
  }, [selId]);
  const companiasInfo = useMemo(() => infoCompanias(visibles), [visibles]);
  const unicaDelAuxiliar = user.isAuxiliar && visibles.length === 1;

  // Si el auxiliar tiene una sola familia, queda seleccionada sola.
  const soloUnaId = user.isAuxiliar && visibles.length === 1 ? visibles[0].id : '';
  useEffect(() => {
    if (soloUnaId) setSelId(soloUnaId);
  }, [soloUnaId]);

  async function handleCreate() {
    const f = await addFamilia(newName.trim(), newColor, familias, user.correo);
    setSelId(f.id);
    setCreating(false);
    setNewName('');
    setNewColor('');
  }

  async function handleDelete() {
    if (!fam) return;
    if (!confirm(`¿Eliminar ${nombreCompania(fam)}? Se desvincularán ${fam.consejeros.length} integrante(s).`)) return;
    await deleteFamilia(fam, user.correo);
    setSelId('');
  }

  async function handleQuitar(p: Participante) {
    if (!fam) return;
    const f = fam;
    await removeConsejeroFromFamilia(f, p.id, user.correo);
    mostrarAviso(`${nombreCorto(p.nombres, p.apellidos)} salió de ${nombreCompania(f)}`, () => {
      const actual = familiasRef.current.find((x) => x.id === f.id) ?? f;
      if (!actual.consejeros.includes(p.id)) void addConsejeroToFamilia(actual, p, user.correo);
    });
  }

  async function handleParticipa(p: Participante) {
    const nuevo = !participaRegular(p);
    const guardar = (valor: boolean) => updateParticipante(p.id, { participaRegular: valor }, user.correo);
    try {
      await guardar(nuevo);
      setError('');
      mostrarAviso(`${nombreCorto(p.nombres, p.apellidos)} ${nuevo ? 'vuelve a contar para el reparto' : 'ya no cuenta para el reparto'}`, () => void guardar(!nuevo));
    } catch {
      setError('No se pudo guardar. Revisa tu conexión e inténtalo otra vez.');
    }
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
      {user.isAuxiliar && visibles.length === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3.5 text-sm text-amber-800">
          {user.participantId
            ? 'Todavía no estás asignado a ninguna compañía. Pide a un Coordinador General que te añada como Coordinador Auxiliar de la compañía que vas a apoyar.'
            : 'Tu correo no coincide con ningún participante registrado, así que no podemos ubicar tu compañía. Pide a un Coordinador General que revise tu cuenta.'}
        </div>
      )}

      {/* Vista general: cada tarjeta abre su compañía. Con una compañía abierta,
          las tarjetas dan paso a los chips de abajo (mismo patrón que Asistencia). */}
      {!fam && visibles.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          {visibles.map((f) => (
            <FamiliaBalanceCard key={f.id} familia={f} participantes={participantes} parejas={parejas} onOpen={() => setSelId(f.id)} />
          ))}
        </div>
      )}
      {!fam && user.canEditAll && !creating && (
        <button onClick={() => setCreating(true)} className="min-h-[44px] bg-primary text-white text-sm font-bold rounded-xl">
          + Nueva compañía
        </button>
      )}

      {fam && !unicaDelAuxiliar && (
        <div
          inert={ocultarFranja}
          className={`sticky -top-4 z-10 -mx-4 -mt-4 bg-bg transition-transform duration-200 motion-reduce:transition-none ${ocultarFranja ? '-translate-y-full' : ''}`}
        >
        <ScrollX seguir={fam?.id ?? ""} className="px-4 pt-4 pb-2 flex gap-2" role="group" aria-label="Elegir compañía">
          {[{ id: '', label: 'Todas', nombre: 'Todas las compañías' }, ...visibles.map((f) => ({ id: f.id, label: String(companiasInfo.get(f.id)?.numero ?? ''), nombre: nombreCompania(f) }))].map((o) => {
            const activo = (fam?.id ?? '') === o.id;
            const info = companiasInfo.get(o.id);
            return (
              <button
                key={o.id || 'todas'}
                aria-pressed={activo}
                aria-label={o.nombre}
                onClick={() => setSelId(o.id)}
                className={`shrink-0 min-h-[44px] min-w-[44px] px-3.5 rounded-full text-sm font-bold border inline-flex items-center justify-center gap-1.5 ${
                  activo ? 'bg-primary text-white border-primary' : 'bg-white text-slate-700 border-slate-200'
                }`}
              >
                {info && <span className="w-2.5 h-2.5 rounded-full ring-1 ring-slate-400" style={{ background: info.hex }} aria-hidden="true" />}
                {o.label}
              </button>
            );
          })}
          {user.canEditAll && (
            <button onClick={() => setCreating(true)} aria-label="Nueva compañía" className="shrink-0 min-h-[44px] min-w-[44px] px-3.5 rounded-full text-sm font-bold border border-dashed border-slate-300 text-slate-600 bg-white">
              +
            </button>
          )}
        </ScrollX>
          {/* Con la franja escondida, esta línea recuerda en qué compañía estás. */}
          <div
            aria-hidden="true"
            className={`absolute left-0 right-0 top-full h-1 transition-opacity duration-200 ${ocultarFranja ? 'opacity-100' : 'opacity-0'}`}
            style={{ background: companiasInfo.get(fam.id)?.hex }}
          />
        </div>
      )}

      {creating && (
        <div className="bg-white rounded-2xl p-4 shadow-sm flex flex-col gap-3">
          <div className="text-sm font-bold">Nueva compañía</div>
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
              <div className="font-extrabold">{nombreCompania(fam)}</div>
              {fam.customName && fam.customName !== nombreCompania({ customName: '', nombre: fam.nombre }) && (
                <div className="text-xs text-slate-500">{nombreCompania({ customName: '', nombre: fam.nombre })}</div>
              )}
            </div>
            {user.canEditAll && (
              <RenameButton
                current={fam.customName}
                onSave={(v) => updateFamiliaMeta(fam.id, { customName: v }, user.correo)}
              />
            )}
          </div>

          <CompanerismoCard fam={fam} cps={famCp} participantes={participantes} coordAux={coordAux} user={user} readOnly={user.isAuxiliar} />

          <CompanerismosFamilia
            fam={fam}
            miembros={famMembers}
            parejas={parejas}
            correo={user.correo}
            puedeEditar={user.canEditAll || user.isAuxiliar}
          />

          <NochesHogarCard fam={fam} miembros={famMembers} user={user} />

          <div className="bg-white rounded-2xl shadow-sm">
            <button
              onClick={() => setIntegrantesAbierto((v) => !v)}
              aria-expanded={integrantesAbierto}
              className="w-full min-h-[48px] px-4 flex items-center gap-2 text-left"
            >
              <span className="flex-1 text-xs font-bold text-slate-500 uppercase tracking-wide">Integrantes ({famMembers.length}){famMembers.length > 0 && ` · ${participan} participan`}</span>
              <span className={`text-slate-400 transition-transform ${integrantesAbierto ? 'rotate-90' : ''}`} aria-hidden="true">›</span>
            </button>
            {integrantesAbierto && (
              <div className="px-4 pb-4">
                <input className="input" placeholder="Añadir integrante…" value={search} onChange={(e) => setSearch(e.target.value)} />
                {error && <div className="text-xs text-red-500 font-semibold mt-1.5">❌ {error}</div>}
                {search.length >= 2 && results.length === 0 && (
                  <div className="text-xs text-slate-500 mt-1.5">Sin resultados. Solo aparecen Consejeros o Logísticos que aún no tienen compañía.</div>
                )}
                {results.map((p) => (
                  <div key={p.id} className="flex items-center gap-2 bg-primary/5 rounded-xl px-3 py-2 mt-1.5">
                    <div className="flex-1 min-w-0 text-sm font-semibold">
                      {nombreConInicialMaterna(p.nombres, p.apellidos)}
                      {isLogistico(p) && (
                        <span className="ml-1.5 text-xs font-bold text-amber-700 bg-amber-100 rounded-full px-1.5 py-0.5 align-middle">Logístico</span>
                      )}
                    </div>
                    <button onClick={() => handleAdd(p)} className="min-h-[44px] px-3 bg-primary text-white text-xs font-bold rounded-lg">+ Añadir</button>
                  </div>
                ))}

                <div className="mt-3 flex flex-col gap-1.5">
                  {famMembers.length > 0 && (
                    <div className="flex items-center gap-2 pl-1 pr-1">
                      <div className="flex-1 text-xs text-slate-600">
                        <strong>{participan} de {famMembers.length}</strong> participan con regularidad
                      </div>
                      <BotonInfo onClick={() => setInfoParticipa(true)} etiqueta="Qué significa Participa" />
                    </div>
                  )}
                  {famMembers.map((p) => {
                    const participa = participaRegular(p);
                    const pastilla = (
                      <span
                        className={`h-8 px-2.5 rounded-full text-xs font-bold flex items-center whitespace-nowrap border ${
                          participa ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-white text-slate-500 border-slate-300'
                        }`}
                      >
                        {participa ? '✓ Participa' : 'No participa'}
                      </span>
                    );
                    return (
                      <div key={p.id} className="flex items-center gap-1 bg-slate-50 rounded-xl pl-3">
                        <button onClick={() => setDetail(p)} className="flex-1 min-w-0 text-left py-2">
                          <span className="block text-sm font-semibold truncate">{nombreConInicialMaterna(p.nombres, p.apellidos)}</span>
                          <span className="block text-xs text-slate-500 truncate">
                            {[p.asignacion !== 'Consejero' ? p.asignacion || 'Sin rol' : '', p.estaca].filter(Boolean).join(' · ')}
                          </span>
                        </button>
                        {puedeMarcar ? (
                          <button
                            onClick={() => void handleParticipa(p)}
                            aria-pressed={participa}
                            aria-label={`${nombreCorto(p.nombres, p.apellidos)} participa con regularidad`}
                            className="shrink-0 min-h-[44px] flex items-center"
                          >
                            {pastilla}
                          </button>
                        ) : (
                          <div className="shrink-0 flex items-center">{pastilla}</div>
                        )}
                        <button
                          onClick={() => handleQuitar(p)}
                          aria-label={`Quitar a ${nombreCorto(p.nombres, p.apellidos)} de la compañía`}
                          className="shrink-0 w-11 h-11 flex items-center justify-center text-red-500 font-bold"
                        >
                          ✕
                        </button>
                      </div>
                    );
                  })}
                  {famMembers.length === 0 && <div className="text-xs text-slate-500 text-center py-2">Sin integrantes todavía</div>}
                </div>
              </div>
            )}
          </div>

          {user.canEditAll && (
            <button onClick={handleDelete} className="border-2 border-red-200 text-red-600 font-bold rounded-xl py-2.5 text-sm">
              🗑️ Eliminar compañía
            </button>
          )}
        </>
      )}

      {familias.length === 0 && !creating && !user.isAuxiliar && (
        <div className="bg-white rounded-2xl p-6 text-center shadow-sm">
          <div className="text-3xl mb-2">👥</div>
          <div className="text-sm font-bold mb-1">No hay compañías creadas</div>
        </div>
      )}

      {avisoNodo}

      {infoParticipa && (
        <InfoSheet titulo="¿Quién cuenta para el reparto?" onClose={() => setInfoParticipa(false)}>
          <ul className="text-sm text-slate-600 space-y-2 list-disc pl-5">
            <li>Marcan con <strong>✓ Participa</strong> a quienes vienen con regularidad. Solo ellos cuentan cuando se reparte a la gente nueva: cada persona va a la compañía que tiene menos participantes, cuidando que haya parejo de hombres y mujeres.</li>
            <li>Quien llega nuevo a una compañía entra marcado, sin que hagas nada.</li>
            <li>Si alguien dejó de venir, toca su botón: sigue en la compañía, solo deja de contar. Si vuelve, tócalo otra vez.</li>
            <li>Justo después de tocar puedes deshacerlo.</li>
          </ul>
        </InfoSheet>
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
  // Historial de TODAS las corridas (más reciente primero) — ya no "un
  // único activo que bloquea volver a calcular". El reparto se corre
  // varias veces a lo largo de las semanas según va llegando gente nueva;
  // cada corrida solo toca a quien todavía no tiene compañía, así que
  // nunca se pisan entre sí. "Deshacer" siempre actúa sobre historial[0].
  const [historial, setHistorial] = useState<RepartoFamiliasRegistro[] | undefined>(undefined); // undefined = todavía cargando
  const [busy, setBusy] = useState(false);
  const [descargando, setDescargando] = useState<'pdf' | 'presentacion' | null>(null);
  const [errorConfirmar, setErrorConfirmar] = useState('');

  useEffect(() => subscribeHistorialReparto(setHistorial), []);

  const capsOrdenadas = useMemo(
    () => [...capacitaciones].sort((a, b) => `${a.fecha}${a.hora}`.localeCompare(`${b.fecha}${b.hora}`)),
    [capacitaciones]
  );
  const capacitacion = capsOrdenadas.find((c) => c.id === capacitacionId) || null;
  const fuenteLista: boolean = modoFuente === 'todos' || !!capacitacion;

  // El estado REAL de cada compañía ahora mismo — de repartos anteriores,
  // asignaciones a mano, o ambos mezclados — es lo que alimenta al
  // algoritmo para que la corrida nueva siga pareja con lo que ya existe.
  function estadosActuales(): EstadoFamilia[] {
    return familias.map((f) => calcularEstadoFamilia(f.id, participantes.filter((p) => f.consejeros.includes(p.id))));
  }

  function calcular() {
    if (!familias.length || !fuenteLista) return;
    const fuente: FuenteReparto = modoFuente === 'todos' ? { modo: 'todos' } : { modo: 'capacitacion', capacitacionId: capacitacion!.id };
    const referencia = modoFuente === 'todos' ? new Date() : new Date(`${capacitacion!.fecha}T00:00:00`);
    const consejeros = calcularCandidatosPorRol(participantes, asistencia, fuente, 'Consejero', referencia);
    const logisticos = calcularCandidatosPorRol(participantes, asistencia, fuente, 'Logístico', referencia);
    setPreview(repartoCompleto(consejeros, logisticos, estadosActuales()));
  }

  async function confirmar() {
    if (!preview) return;
    setBusy(true);
    setErrorConfirmar('');
    try {
      // Usa el familiaId MÁS ACTUAL de cada persona (no el que tenía guardado
      // el preview, que pudo quedar desactualizado si alguien la movió a
      // mano entre "Calcular" y "Confirmar") — así el snapshot para deshacer
      // siempre refleja el estado real justo antes de escribir.
      const porParticipante: Record<string, Participante[]> = {};
      Object.entries(preview).forEach(([famId, cands]) => {
        porParticipante[famId] = cands.map((c) => participantes.find((p) => p.id === c.participante.id) || c.participante);
      });
      const fuenteId = modoFuente === 'todos' ? 'todos-los-registrados' : capacitacion!.id;
      await ejecutarReparto(porParticipante, familias, fuenteId, user.correo);
      setPreview(null);
    } catch (e) {
      setErrorConfirmar((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function deshacer() {
    const ultimo = historial?.[0];
    if (!ultimo) return;
    setBusy(true);
    try {
      await deshacerReparto(ultimo, familias, user.correo);
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

  async function verPresentacion() {
    setDescargando('presentacion');
    try {
      const html = await generarPresentacionHtml(datosPorFamilia(), participantes);
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

  if (historial === undefined) {
    return <div className="text-center text-sm text-slate-500 py-8">Cargando…</div>;
  }

  const ultimo = historial[0] || null;

  return (
    <div className="flex flex-col gap-3">
      {/* Historial — ya no bloquea volver a calcular, solo informa y permite
          deshacer la corrida más reciente. El reparto se corre varias veces
          a lo largo de las semanas según va llegando gente nueva. */}
      {ultimo && (
        <div className="bg-primary/5 border border-primary/15 rounded-2xl px-4 py-3.5 flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-bold text-primary">Última corrida</div>
            <div className="text-xs text-slate-600 mt-0.5">
              {ultimo.asignados.length} persona(s) repartidas el {new Date(ultimo.timestamp).toLocaleString('es-PE')}
              {historial.length > 1 && ` · ${historial.length} corridas en el historial`}
            </div>
          </div>
          <button
            onClick={deshacer}
            disabled={busy}
            className="shrink-0 border-2 border-red-200 text-red-600 font-bold rounded-xl px-3 py-2 text-xs disabled:opacity-50"
          >
            {busy ? 'Deshaciendo…' : '↩️ Deshacer'}
          </button>
        </div>
      )}

      <div className="bg-white rounded-2xl p-4 shadow-sm flex flex-col gap-3">
        <div className="text-sm font-bold">Reparto automático de Compañías</div>
        <div className="text-xs text-slate-500">
          Reparte a los Consejeros (prioridad: sexo parejo → estaca no concentrada → edad distribuida) y luego a los
          Logísticos como relleno, sobre las mismas 4 compañías — siempre tomando en cuenta lo que cada compañía YA
          tiene (de corridas anteriores o asignado a mano), no desde cero. Quien ya tenga una compañía asignada queda
          fuera — no se le mueve. Para saber cuántas personas tiene cada compañía solo se cuenta a quienes tienen <strong>✓ Participa</strong> (lo marcan los Coordinadores Auxiliares en Integrantes). <strong>No incluye</strong> Coordinador General, Coordinador Auxiliar, Coordinador
          Logístico, Matrimonio Logístico, Audiovisuales ni Comité de Bienvenida — esos roles no entran al reparto
          automático aunque el nombre se parezca.
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
              <option key={c.id} value={c.id}>{c.label} — {fechaAmigable(c.fecha, hoyLocalISO())}</option>
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
        {!familias.length && <div className="text-xs text-amber-700">Crea al menos una compañía en la pestaña Compañías primero.</div>}
      </div>

      {preview ? (
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
          {errorConfirmar && <div className="text-xs text-red-600 font-semibold bg-red-50 rounded-xl px-3 py-2.5">❌ {errorConfirmar}</div>}
        </>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {familias.map((f) => (
            <FamiliaBalanceCard key={f.id} familia={f} participantes={participantes} />
          ))}
        </div>
      )}

      {/* PDF y Presentación — siempre disponibles, no solo justo después de
          correr el reparto, porque la idea es que se use cuando haya que
          imprimir/proyectar, en cualquier momento. */}
      <div className="flex gap-2">
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
      <div className="font-extrabold text-sm mb-1">{nombreCompania(familia)}</div>
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

function FamiliaBalanceCard({
  familia,
  participantes,
  parejas,
  onOpen,
}: {
  familia: Familia;
  participantes: Participante[];
  parejas?: ParejaTrabajo[];
  onOpen?: () => void;
}) {
  const miembros = participantes.filter((p) => familia.consejeros.includes(p.id));
  const cands: CandidatoReparto[] = miembros.map((p) => ({ participante: p, edad: calcularEdad(p.fechaNacimiento, new Date()) }));
  const stats = calcularEstadisticas(cands);
  const comp = parejas ? resumenCompaneros(familia, parejas, miembros) : null;
  const clases = 'bg-white rounded-2xl p-3.5 shadow-sm border-t-[3px] text-left w-full flex flex-col justify-start'; // un <button> centra su contenido en vertical: sin esto, la tarjeta más baja de la fila queda desalineada
  const cuerpo = (
    <>
      <div className="flex items-center mb-2">
        <span className="flex-1 font-extrabold text-sm">{nombreCompania(familia)}</span>
        {onOpen && <span className="text-slate-400" aria-hidden="true">›</span>}
      </div>
      <div className="text-xs text-slate-600 space-y-0.5">
        <div>Total: <strong>{stats.total}</strong> · H: {stats.hombres} · M: {stats.mujeres}</div>
        {comp && miembros.length > 0 && (
          <div>
            Compañerismos: <strong>{comp.grupos}</strong>
            {comp.sinCompanero > 0 && <span className="text-amber-700 font-semibold"> · {comp.sinCompanero} sin compañero</span>}
          </div>
        )}
        <div className="pt-1 text-slate-500">
          Ventanilla {stats.porEstaca.Ventanilla} · P. Piedra {stats.porEstaca['Puente Piedra']} · Pro Lima{' '}
          {stats.porEstaca['Pro Lima']} · Otros {stats.porEstaca.Otros}
        </div>
      </div>
    </>
  );
  return onOpen ? (
    <button onClick={onOpen} aria-label={`Abrir ${nombreCompania(familia)}`} className={clases} style={{ borderTopColor: statColorHex(familia) }}>
      {cuerpo}
    </button>
  ) : (
    <div className={clases} style={{ borderTopColor: statColorHex(familia) }}>
      {cuerpo}
    </div>
  );
}

const NOCHES_PAGINA = 5;
const tituloVisible = (t: string) => t.replace(/\bFamilia\b/g, 'Compañía');

function NochesHogarCard({ fam, miembros, user }: { fam: Familia; miembros: Participante[]; user: SessionUser }) {
  const [noches, setNoches] = useState<NocheHogar[]>([]);
  // `formulario`: null = cerrado · 'nueva' = planificar · id = editando esa noche.
  const [formulario, setFormulario] = useState<string | null>(null);
  const [fecha, setFecha] = useState('');
  const [titulo, setTitulo] = useState('Noche de Hogar');
  const [abierta, setAbierta] = useState<string | null | undefined>(undefined); // undefined = la primera de la lista
  const [visibles, setVisibles] = useState(NOCHES_PAGINA);
  const { mostrar: mostrarAviso, nodo: avisoNodo } = useAvisoDeshacer();

  useEffect(() => subscribeNochesHogar(fam.id, setNoches), [fam.id]);
  useEffect(() => {
    setFormulario(null);
    setAbierta(undefined);
    setVisibles(NOCHES_PAGINA);
  }, [fam.id]);

  const hoy = hoyLocalISO();
  const lista = useMemo(() => ordenarParaVista(noches, hoy), [noches, hoy]);
  // Solo una noche abierta a la vez: con una por semana hasta enero son ~14, y todas abiertas serían cientos de filas.
  const abiertaId = abierta === undefined ? lista[0]?.id ?? null : abierta;

  function abrirFormulario(id: 'nueva' | NocheHogar) {
    if (id === 'nueva') {
      setFecha(hoy);
      setTitulo('Noche de Hogar');
      setFormulario('nueva');
    } else {
      setFecha(id.fecha);
      setTitulo(tituloVisible(id.titulo));
      setFormulario(id.id);
    }
  }

  async function guardar() {
    if (!fecha) return;
    if (formulario === 'nueva') {
      const nueva = await crearNocheHogar(fam.id, fecha, titulo, user.correo);
      setAbierta(nueva.id);
    } else {
      const noche = noches.find((n) => n.id === formulario);
      if (noche) await editarNocheHogar(noche, fecha, titulo, user.correo);
    }
    setFormulario(null);
  }

  async function marcar(noche: NocheHogar, id: string, estado: EstadoAsistencia) {
    await marcarAsistenciaNocheHogar(noche, id, estado, user.correo);
  }

  async function todosPresentes(noche: NocheHogar) {
    const antes: Record<string, EstadoAsistencia> = {};
    const despues: Record<string, EstadoAsistencia> = {};
    for (const m of miembros) {
      const e = noche.asistencia[m.id];
      if (e === 'presente' || e === 'justificado') continue; // a quien está justificado no se le pisa
      antes[m.id] = e ?? 'ausente';
      despues[m.id] = 'presente';
    }
    if (!Object.keys(despues).length) return;
    await marcarVariosNocheHogar(noche, despues, user.correo);
    mostrarAviso(`${Object.keys(despues).length} marcados presentes`, () => void marcarVariosNocheHogar(noche, antes, user.correo));
  }

  async function eliminar(noche: NocheHogar) {
    await eliminarNocheHogar(noche, user.correo);
    mostrarAviso('Noche de Hogar eliminada', () => void restaurarNocheHogar(noche, user.correo));
  }

  const formularioNode = formulario && (
    <div className="flex flex-col gap-2 mb-3 bg-slate-50 rounded-xl p-3">
      <label className="text-xs font-bold text-slate-600" htmlFor="noche-fecha">Fecha</label>
      <div className="flex gap-2">
        <input id="noche-fecha" className="input flex-1" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        <button type="button" onClick={() => setFecha(hoy)} className="min-h-[44px] px-3 text-xs font-bold text-primary bg-primary/10 rounded-lg">Hoy</button>
        <button type="button" onClick={() => setFecha(sumarDias(hoy, 1))} className="min-h-[44px] px-3 text-xs font-bold text-primary bg-primary/10 rounded-lg">Mañana</button>
      </div>
      <label className="text-xs font-bold text-slate-600" htmlFor="noche-titulo">Título</label>
      <input id="noche-titulo" className="input" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
      <div className="flex gap-2">
        <button onClick={guardar} disabled={!fecha} className="flex-1 min-h-[44px] bg-primary text-white font-bold rounded-xl text-sm disabled:opacity-40">
          {formulario === 'nueva' ? 'Guardar Noche de Hogar' : 'Guardar cambios'}
        </button>
        <button onClick={() => setFormulario(null)} className="min-h-[44px] px-4 bg-slate-100 text-slate-600 font-bold rounded-xl text-sm">Cancelar</button>
      </div>
    </div>
  );

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm">
      <div className="flex items-center gap-2 mb-2.5">
        <span className="text-xl" aria-hidden="true">🏠</span>
        <div className="flex-1">
          <div className="text-sm font-extrabold">Noches de Hogar{noches.length > 0 ? ` (${noches.length})` : ''}</div>
          <div className="text-xs text-slate-500">Registro interno de la compañía</div>
        </div>
        {formulario !== 'nueva' && (
          <button onClick={() => abrirFormulario('nueva')} className="min-h-[44px] text-xs font-bold text-primary bg-primary/10 rounded-lg px-3">
            + Planificar
          </button>
        )}
      </div>

      {formulario === 'nueva' && formularioNode}

      {noches.length === 0 && formulario !== 'nueva' && (
        <button onClick={() => abrirFormulario('nueva')} className="w-full min-h-[44px] text-sm font-bold text-primary border-2 border-dashed border-primary/30 rounded-xl">
          Planifica la primera Noche de Hogar
        </button>
      )}

      <div className="flex flex-col gap-2">
        {lista.slice(0, visibles).map((noche) => {
          const r = resumenNoche(noche.asistencia, miembros);
          const f = partesFecha(noche.fecha);
          const esHoy = noche.fecha === hoy;
          const futura = noche.fecha > hoy;
          const sinMarcas = r.presentes + r.justificados === 0;
          const abierto = abiertaId === noche.id;
          return (
            <div key={noche.id} className={`rounded-xl border ${esHoy ? 'border-accent bg-amber-50/40' : 'border-slate-200 bg-slate-50'}`}>
              <button
                onClick={() => setAbierta(abierto ? null : noche.id)}
                aria-expanded={abierto}
                className="w-full min-h-[56px] flex items-center gap-3 px-3 py-2 text-left"
              >
                {f && (
                  <span className={`shrink-0 w-12 rounded-lg text-center py-1 leading-none ${esHoy ? 'bg-accent text-primary' : 'bg-white text-primary border border-slate-200'}`}>
                    <span className="block text-xs font-bold uppercase">{f.dia}</span>
                    <span className="block text-lg font-extrabold tabular-nums">{f.num}</span>
                    <span className="block text-xs font-bold uppercase">{f.mes}</span>
                  </span>
                )}
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-bold leading-snug">{tituloVisible(noche.titulo)}</span>
                  <span className="block text-xs text-slate-500">
                    {esHoy ? 'Hoy · ' : ''}
                    {futura ? 'Por venir' : sinMarcas ? 'Sin marcas' : `${r.presentes} de ${r.total} presentes${r.justificados ? ` · ${r.justificados} justif.` : ''}`}
                  </span>
                </span>
                {!futura && !sinMarcas && <span className="shrink-0 text-lg font-extrabold text-primary tabular-nums">{r.pct}%</span>}
                <span className={`shrink-0 text-slate-500 transition-transform motion-reduce:transition-none ${abierto ? 'rotate-90' : ''}`} aria-hidden="true">›</span>
              </button>

              {abierto && (
                <div className="px-3 pb-3">
                  {formulario === noche.id ? (
                    formularioNode
                  ) : (
                    <>
                      <div
                        className="flex h-2.5 rounded-full overflow-hidden bg-slate-200"
                        role="img"
                        aria-label={`${r.presentes} presentes, ${r.justificados} justificados y ${r.porMarcar} por marcar, de ${r.total}`}
                      >
                        {r.total > 0 && (
                          <>
                            <div style={{ width: `${(r.presentes / r.total) * 100}%`, background: '#0E2954' }} />
                            <div style={{ width: `${(r.justificados / r.total) * 100}%`, background: '#E8A33A' }} />
                          </>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <div className="flex-1 text-xs text-slate-500 tabular-nums">
                          ✓ {r.presentes} · J {r.justificados} · ○ {r.porMarcar}
                        </div>
                        {r.porMarcar > 0 && (
                          <button onClick={() => void todosPresentes(noche)} className="min-h-[44px] px-3 text-xs font-bold text-primary bg-primary/10 rounded-lg">
                            ✓ Todos presentes
                          </button>
                        )}
                      </div>
                      <div className="flex flex-col gap-1.5 mt-1">
                        {miembros.map((p) => {
                          const e = noche.asistencia[p.id];
                          const presente = e === 'presente';
                          const justif = e === 'justificado';
                          return (
                            <div key={p.id} className={`flex items-center rounded-lg border ${presente ? 'bg-emerald-50 border-emerald-200' : justif ? 'bg-amber-50 border-amber-200' : 'bg-white border-slate-200'}`}>
                              <button
                                onClick={() => void marcar(noche, p.id, presente ? 'ausente' : 'presente')}
                                aria-pressed={presente}
                                className="flex-1 min-w-0 min-h-[48px] flex items-center gap-3 pl-3 text-left"
                              >
                                <span
                                  className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-sm font-extrabold ${
                                    presente ? 'bg-emerald-600 text-white' : justif ? 'bg-amber-600 text-white' : 'border-2 border-slate-300 text-transparent'
                                  }`}
                                  aria-hidden="true"
                                >
                                  {justif ? 'J' : '✓'}
                                </span>
                                <span className="min-w-0 text-sm font-semibold">{nombreCorto(p.nombres, p.apellidos)}</span>
                              </button>
                              <button
                                onClick={() => void marcar(noche, p.id, justif ? 'ausente' : 'justificado')}
                                aria-pressed={justif}
                                aria-label={`Justificado: ${nombreCorto(p.nombres, p.apellidos)}`}
                                className={`shrink-0 w-12 min-h-[48px] text-xs font-extrabold ${justif ? 'text-amber-800' : 'text-slate-500'}`}
                              >
                                J
                              </button>
                            </div>
                          );
                        })}
                        {miembros.length === 0 && <div className="text-xs text-slate-500 text-center py-2">Esta compañía aún no tiene integrantes.</div>}
                      </div>
                      <div className="flex gap-2 mt-2">
                        <button onClick={() => abrirFormulario(noche)} className="flex-1 min-h-[44px] text-xs font-bold text-primary bg-primary/10 rounded-lg">
                          ✏️ Editar fecha o título
                        </button>
                        <button onClick={() => void eliminar(noche)} className="min-h-[44px] px-4 text-xs font-bold text-red-600 bg-red-50 rounded-lg">
                          Eliminar
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {lista.length > visibles && (
          <button onClick={() => setVisibles((n) => n + NOCHES_PAGINA)} className="min-h-[44px] text-xs font-bold text-primary bg-white border-[1.5px] border-slate-200 rounded-xl">
            Ver {Math.min(NOCHES_PAGINA, lista.length - visibles)} más · {lista.length - visibles} restantes
          </button>
        )}
      </div>
      {avisoNodo}
    </div>
  );
}

function CompanerismoCard({
  fam,
  cps,
  participantes,
  coordAux,
  user,
  readOnly = false,
}: {
  fam: Familia;
  cps: Companerismo[];
  participantes: Participante[];
  coordAux: Participante[];
  user: SessionUser;
  // El auxiliar ve el compañerismo pero no lo edita: si pudiera, podría
  // añadirse a otra familia (y ganar acceso a ella) o quitarse de la suya.
  readOnly?: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [q1, setQ1] = useState('');
  const [q2, setQ2] = useState('');
  const [sel1, setSel1] = useState<Participante | null>(null);
  const [sel2, setSel2] = useState<Participante | null>(null);
  const [error, setError] = useState('');
  const { mostrar: mostrarAviso, nodo: avisoNodo } = useAvisoDeshacer();

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
        <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wide flex-1">Coordinadores Auxiliares</div>
        {!readOnly && (
          <button onClick={() => setAdding((v) => !v)} className="text-xs font-bold text-primary bg-primary/10 rounded-lg px-2 py-1">
            {adding ? 'Cancelar' : '+ Añadir'}
          </button>
        )}
      </div>
      {cps.map((cp) => {
        const p1 = participantes.find((p) => p.id === cp.p1Id);
        const p2 = participantes.find((p) => p.id === cp.p2Id);
        return (
          <div key={cp.id} className="flex items-center gap-2 bg-slate-50 border-l-[3px] border-primary rounded-xl px-3 py-2 mb-1.5">
            <div className="flex-1 text-xs">
              <div>🤝 {p1 ? nombreCorto(p1.nombres, p1.apellidos) : 'Sin asignar'}</div>
              <div>🤝 {p2 ? nombreCorto(p2.nombres, p2.apellidos) : 'Sin asignar'}</div>
            </div>
            {!readOnly && (
              <button
                aria-label="Quitar coordinadores auxiliares"
                onClick={async () => {
                  await removeCompanerismo(cp.id, user.correo);
                  mostrarAviso('Coordinadores auxiliares quitados', () => {
                    void addCompanerismo(fam.id, p1 ?? null, p2 ?? null, user.correo);
                  });
                }}
                className="min-h-[44px] px-3 text-red-600 text-xs font-bold bg-red-50 rounded-lg"
              >
                Quitar
              </button>
            )}
          </div>
        );
      })}
      {cps.length === 0 && !adding && <div className="text-xs text-slate-500 text-center py-1">Sin coordinadores auxiliares asignados</div>}
      {avisoNodo}

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
  const [tipo, setTipo] = useState<TipoEvento>('capacitacion');
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
      { label: label || `${infoTipo(tipo).label} — ${fecha}`, fecha, hora, horaFin, lugar: lugar || 'Por confirmar', oficial: true, tipo },
      user.correo
    );
    setAdding(false);
    setLabel('');
    setFecha('');
    setHoraFin('');
    setLugar('');
    setTipo('capacitacion');
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
          <select className="input" value={tipo} onChange={(e) => setTipo(e.target.value as TipoEvento)} aria-label="Tipo de evento">
            {TIPOS_EVENTO.map((t) => (
              <option key={t.id} value={t.id}>{t.icon} {t.label}</option>
            ))}
          </select>
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
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-lg shrink-0">{infoTipo(tipoDe(c)).icon}</div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold truncate">{c.label}</div>
              <div className="text-xs text-slate-500">{fechaAmigable(c.fecha, hoyLocalISO())} · {rangoHora(c.hora, c.horaFin)} · {c.lugar}</div>
              {/* Tipo editable en el lugar: select nativo (en celular abre el
                  selector del sistema, sin armar un modal propio). Los eventos
                  viejos sin tipo aparecen como Capacitación. */}
              {user.canEditAll ? (
                <select
                  className="input !py-1.5 !px-2 mt-1.5 !w-auto font-semibold"
                  value={tipoDe(c)}
                  onChange={(e) => setTipoCapacitacion(c.id, e.target.value as TipoEvento, user.correo)}
                  aria-label={`Tipo de ${c.label}`}
                >
                  {TIPOS_EVENTO.map((t) => (
                    <option key={t.id} value={t.id}>{t.icon} {t.label}</option>
                  ))}
                </select>
              ) : (
                <div className="text-[11px] font-semibold text-primary mt-0.5">{infoTipo(tipoDe(c)).label}</div>
              )}
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

function UsuariosTab({ user, participantes }: { user: SessionUser; participantes: Participante[] }) {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [creando, setCreando] = useState(false);
  const [correo, setCorreo] = useState('');
  const [rol, setRol] = useState<(typeof ROLES_STAFF)[number]>('Coordinador Auxiliar');
  const [estaca, setEstaca] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const { mostrar: mostrarAviso, nodo: avisoNodo } = useAvisoDeshacer();
  // Hoja de acciones de una cuenta: se abre al tocar su fila. paso: menu → confirmar → listo.
  const [abierta, setAbierta] = useState('');
  const [paso, setPaso] = useState<'menu' | 'confirmar' | 'listo'>('menu');
  const [trabajando, setTrabajando] = useState(false);
  const [errorAccion, setErrorAccion] = useState('');
  const puedeRestablecer = user.rol.toLowerCase().trim() === 'coordinador general';
  const cuenta = usuarios.find((x) => x.correo === abierta);
  const cerrarHoja = () => {
    setAbierta('');
    setPaso('menu');
    setErrorAccion('');
  };

  async function restablecer(u: Usuario) {
    setTrabajando(true);
    setErrorAccion('');
    try {
      await restablecerContrasena(u.correo, user.correo);
      setPaso('listo');
    } catch (e) {
      setErrorAccion(e instanceof Error ? e.message : 'No se pudo restablecer. Intenta de nuevo.');
    } finally {
      setTrabajando(false);
    }
  }

  useEffect(() => subscribeUsuarios(setUsuarios), []);

  // Para un Coordinador Auxiliar el correo de la cuenta TIENE que ser el
  // mismo con el que se registró: así la app lo reconoce y ubica su familia.
  const participanteConEseCorreo = participantes.find((p) => p.correo.toLowerCase().trim() === correo.toLowerCase().trim());

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
        <div className="text-xs font-bold text-slate-500 uppercase tracking-wide">Cuentas de staff</div>
        <button onClick={() => setCreando(true)} className="bg-primary text-white text-xs font-bold rounded-lg px-3 py-1.5">
          + Añadir
        </button>
      </div>

      {creando && (
        <div className="bg-white rounded-2xl p-4 shadow-sm flex flex-col gap-3">
          <div className="text-sm font-bold">Nueva cuenta de staff</div>
          <div>
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Correo</div>
            <input className="input" type="email" placeholder="correo@ejemplo.com" value={correo} onChange={(e) => setCorreo(e.target.value)} />
          </div>
          <div>
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Rol</div>
            <select className="input" value={rol} onChange={(e) => setRol(e.target.value as (typeof ROLES_STAFF)[number])}>
              {ROLES_STAFF.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
          {rol === 'Coordinador Auxiliar' && validateEmail(correo) && (
            <div className={`text-xs font-semibold rounded-xl px-3 py-2 ${participanteConEseCorreo ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-800'}`}>
              {participanteConEseCorreo
                ? `✅ Coincide con ${participanteConEseCorreo.nombres} ${participanteConEseCorreo.apellidos} (${participanteConEseCorreo.asignacion || 'sin rol'}). Recuerda añadirlo en el compañerismo de su familia.`
                : '⚠️ Ningún participante se registró con este correo: no podrá ver su compañía hasta que coincida.'}
            </div>
          )}
          {rol === 'Coordinador Auxiliar' && (
            <div>
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Estaca</div>
              <input className="input" placeholder="Ej: Ventanilla" value={estaca} onChange={(e) => setEstaca(e.target.value)} />
            </div>
          )}
          {error && <div className="text-xs text-red-500 font-semibold">❌ {error}</div>}
          <div className="text-xs text-slate-500">
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

      {usuarios.map((u) => {
        const propia = u.correo === user.correo;
        const contenido = (
          <>
            <div className="w-10 h-10 rounded-full bg-primary/10 text-primary font-bold text-sm flex items-center justify-center shrink-0">
              {u.correo[0]?.toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold break-all">{u.correo}</div>
              <div className="text-xs text-slate-500">
                {u.rol}
                {u.estaca && ` · ${u.estaca}`}
                {!u.passwordHash && ' · aún no entró'}
              </div>
            </div>
            {propia ? (
              <span className="shrink-0 text-xs font-bold text-primary bg-primary/10 rounded-full px-2.5 py-1">Tú</span>
            ) : (
              <>
                {!u.activo && <span className="shrink-0 text-xs font-bold text-slate-600 bg-slate-200 rounded-full px-2.5 py-1">Desactivada</span>}
                <span className="shrink-0 text-slate-500" aria-hidden="true">›</span>
              </>
            )}
          </>
        );
        return propia ? (
          <div key={u.correo} className="bg-white rounded-2xl p-3.5 shadow-sm flex items-center gap-3">{contenido}</div>
        ) : (
          <button
            key={u.correo}
            onClick={() => { setAbierta(u.correo); setPaso('menu'); setErrorAccion(''); }}
            aria-label={`Opciones de la cuenta ${u.correo}`}
            className="bg-white rounded-2xl p-3.5 shadow-sm flex items-center gap-3 text-left w-full min-h-[64px]"
          >
            {contenido}
          </button>
        );
      })}

      {cuenta && (
        <InfoSheet titulo="Cuenta de staff" onClose={cerrarHoja} cerrar={paso === 'listo' ? 'Listo' : 'Cerrar'}>
          <div className="bg-slate-50 rounded-xl p-3 mb-3">
            <div className="text-sm font-bold break-all">{cuenta.correo}</div>
            <div className="text-xs text-slate-500 mt-0.5">
              {cuenta.rol}
              {cuenta.estaca && ` · ${cuenta.estaca}`} · {cuenta.activo ? 'Activa' : 'Desactivada'}
            </div>
          </div>

          {paso === 'menu' && (
            <div className="flex flex-col gap-2">
              {puedeRestablecer && (
                cuenta.passwordHash ? (
                  <button onClick={() => setPaso('confirmar')} className="min-h-[56px] rounded-xl bg-primary/5 px-4 text-left">
                    <span className="block text-sm font-bold text-primary">🔑 Restablecer contraseña</span>
                    <span className="block text-xs text-slate-500">Borra la actual; la persona crea una nueva al entrar.</span>
                  </button>
                ) : (
                  <div className="rounded-xl bg-slate-50 px-4 py-3 text-xs text-slate-500">
                    🔑 Aún no ha creado su contraseña, así que no hay nada que restablecer.
                  </div>
                )
              )}
              <button
                onClick={() => {
                  const activar = !cuenta.activo;
                  void setUsuarioActivo(cuenta.correo, activar, user.correo);
                  mostrarAviso(activar ? `Cuenta activada: ${cuenta.correo}` : `Cuenta desactivada: ${cuenta.correo}`, () => void setUsuarioActivo(cuenta.correo, !activar, user.correo));
                  cerrarHoja();
                }}
                className={`min-h-[56px] rounded-xl px-4 text-left text-sm font-bold ${cuenta.activo ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-700'}`}
              >
                {cuenta.activo ? 'Desactivar cuenta' : 'Activar cuenta'}
                <span className="block text-xs font-normal text-slate-500">
                  {cuenta.activo ? 'No podrá entrar hasta que la actives de nuevo.' : 'Podrá volver a entrar con su contraseña.'}
                </span>
              </button>
            </div>
          )}

          {paso === 'confirmar' && (
            <div className="flex flex-col gap-3">
              <div className="text-sm text-slate-700">
                ¿Restablecer la contraseña de <strong className="break-all">{cuenta.correo}</strong>? Su contraseña actual dejará de funcionar y podrá crear una nueva al entrar con su correo.
              </div>
              {errorAccion && <div className="text-xs text-red-600 font-semibold">❌ {errorAccion}</div>}
              <div className="flex gap-2">
                <button
                  onClick={() => void restablecer(cuenta)}
                  disabled={trabajando}
                  className="flex-1 min-h-[48px] bg-red-600 text-white font-bold rounded-xl text-sm disabled:opacity-50"
                >
                  {trabajando ? 'Restableciendo…' : 'Sí, restablecer'}
                </button>
                <button onClick={() => { setPaso('menu'); setErrorAccion(''); }} disabled={trabajando} className="min-h-[48px] px-4 bg-slate-100 text-slate-700 font-bold rounded-xl text-sm">
                  Volver
                </button>
              </div>
            </div>
          )}

          {paso === 'listo' && (
            <div role="status" className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-sm text-emerald-800">
              ✅ <strong>Contraseña restablecida.</strong> Pídele que entre ahora con su correo y cree una nueva. Hasta que lo haga, la cuenta queda sin contraseña.
            </div>
          )}
        </InfoSheet>
      )}

      {avisoNodo}
    </div>
  );
}
