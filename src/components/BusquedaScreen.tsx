import { useMemo, useState } from 'react';
import { ESTACAS_PRINCIPALES, FILTRO_OTRAS, estacaEnFiltro } from '../data/estacas';
import { updateParticipante } from '../services/participantsService';
import { fuzzyIncludes } from '../utils/search';
import { nombreCorto } from '../utils/nombreCorto';
import { habilidadesParaMostrar, tieneExperienciaAudiovisual } from '../utils/audiovisual';
import { useScrollDirection } from '../utils/useScrollDirection';
import { ASIGNACIONES, EXPERIENCIA_PREVIA_LABEL, type Asignacion, type Disponibilidad, type Genero, type Participante, type SessionUser } from '../types';

function matches(p: Participante, query: string): boolean {
  return fuzzyIncludes(`${p.nombres} ${p.apellidos} ${p.estaca} ${p.barrio}`, query);
}

const DISPONIBILIDAD_LABEL: Record<Disponibilidad, string> = {
  si: 'Sí, disponible',
  no_creo: 'No cree poder',
  no_se: 'Aún no lo sabe',
};

export default function BusquedaScreen({
  user,
  participantes,
  onNavHiddenChange,
}: {
  user: SessionUser;
  participantes: Participante[];
  onNavHiddenChange: (hidden: boolean) => void;
}) {
  const handleScroll = useScrollDirection(onNavHiddenChange);
  const [query, setQuery] = useState('');
  const [filterEstaca, setFilterEstaca] = useState('');
  const [soloAudiovisual, setSoloAudiovisual] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Participante | null>(null);
  const PAGE_SIZE = 20;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const MIN_QUERY = 3;
  // Se repite en varios lugares (mostrar resultados, mostrar el contador,
  // qué mensaje de "vacío" usar) — un chip de estaca o el filtro de
  // audiovisual son acciones explícitas, igual que escribir 3 letras.
  const hayFiltroActivo = !!filterEstaca || soloAudiovisual;

  const allResults = useMemo(() => {
    // No mostrar a todo el roster de una sola vez sin ningún filtro —
    // recién aparecen resultados al escribir al menos 3 letras, o al tocar
    // un chip de estaca / el filtro de audiovisual (acciones explícitas,
    // funcionan aunque el buscador esté vacío).
    if (query.trim().length < MIN_QUERY && !hayFiltroActivo) return [];
    let list = participantes.filter((p) => matches(p, query));
    if (filterEstaca) list = list.filter((p) => estacaEnFiltro(p.estaca, filterEstaca));
    if (soloAudiovisual) list = list.filter((p) => tieneExperienciaAudiovisual(p.audiovisualHabilidades));
    return list;
  }, [participantes, query, filterEstaca, soloAudiovisual, hayFiltroActivo]);
  // Montar cientos de filas de una sola vez (cada una con su propio botón
  // expandible) es el mismo problema real que ya documentó CONFEJAS 2026 a
  // los 500 participantes — se pagina en tandas desde el principio en vez
  // de esperar a redescubrirlo cuando crezca el roster.
  const results = allResults.slice(0, visibleCount);

  return (
    <div className="flex flex-col h-full">
      <div className="sticky top-0 bg-[#F4F6FA]/95 backdrop-blur px-4 pt-3 pb-2 border-b border-slate-200 z-10">
        <input
          className="input mb-2"
          placeholder="🔍 Buscar por nombre, estaca o barrio…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setExpandedId(null);
            setVisibleCount(PAGE_SIZE);
          }}
        />
        <div className="flex gap-2 items-center">
          <div className="flex gap-2 overflow-x-auto pb-1 flex-1">
            <Chip active={!filterEstaca} onClick={() => { setFilterEstaca(''); setVisibleCount(PAGE_SIZE); }}>
              Todas
            </Chip>
            {ESTACAS_PRINCIPALES.map((e) => (
              <Chip key={e} active={filterEstaca === e} onClick={() => { setFilterEstaca(filterEstaca === e ? '' : e); setVisibleCount(PAGE_SIZE); }}>
                {e}
              </Chip>
            ))}
            <Chip active={filterEstaca === FILTRO_OTRAS} onClick={() => { setFilterEstaca(filterEstaca === FILTRO_OTRAS ? '' : FILTRO_OTRAS); setVisibleCount(PAGE_SIZE); }}>
              Otras
            </Chip>
          </div>
          <button
            onClick={() => { setSoloAudiovisual((v) => !v); setVisibleCount(PAGE_SIZE); }}
            title="Solo con experiencia en audiovisuales"
            className={`shrink-0 text-xs font-bold rounded-full px-3.5 py-2.5 whitespace-nowrap border-[1.5px] ${
              soloAudiovisual ? 'bg-accent border-accent text-primary' : 'bg-white border-slate-200 text-slate-600'
            }`}
          >
            🎬 AV
          </button>
        </div>
        {(query.trim().length >= MIN_QUERY || hayFiltroActivo) && (
          <div className="text-[11px] text-slate-500 mt-1">
            {allResults.length} resultado{allResults.length !== 1 ? 's' : ''}
          </div>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-4 pb-24 flex flex-col gap-2" onScroll={handleScroll}>
        {results.map((p) => {
          const open = expandedId === p.id;
          return (
            <div key={p.id} className="bg-white rounded-2xl shadow-sm overflow-hidden shrink-0">
              <button
                onClick={() => setExpandedId(open ? null : p.id)}
                className="w-full flex items-center gap-3 px-3.5 py-3 text-left"
              >
                <Avatar nombres={p.nombres} apellidos={p.apellidos} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold truncate">{nombreCorto(p.nombres, p.apellidos)}</div>
                  <div className="text-[11px] text-slate-500 truncate">📱 {p.telefono} · ⛪ {p.estaca}</div>
                  <div className="flex gap-1.5 mt-1.5 flex-wrap">
                    <Badge>{p.estaca}</Badge>
                    {p.asignacion && <Badge accent>{p.asignacion}</Badge>}
                  </div>
                </div>
                <span className={`text-slate-300 transition-transform ${open ? 'rotate-90' : ''}`}>›</span>
              </button>

              {open && (
                <div className="px-3.5 pb-3.5 pt-1 border-t border-slate-100 flex flex-col gap-2">
                  <Row icon="🎂" label="Nacimiento" value={p.fechaNacimiento || 'No registrado'} />
                  <Row icon="📞" label="Teléfono" value={p.telefono} />
                  <Row icon="✉️" label="Correo" value={p.correo} />
                  <Row icon="⛪" label="Estaca" value={p.estaca} />
                  <Row icon="📍" label="Barrio" value={p.barrio} />
                  <Row icon="👤" label="Género" value={p.genero === 'H' ? 'Hombre' : 'Mujer'} />
                  <Row icon="🎖️" label="Experiencia" value={EXPERIENCIA_PREVIA_LABEL[p.experienciaPrevia] || 'No registrado'} />
                  <Row icon="📋" label="Asignación" value={p.asignacion || 'Sin asignar'} />
                  <Row icon="✅" label="Disponibilidad" value={DISPONIBILIDAD_LABEL[p.disponibilidad] || 'No registrado'} />
                  <Row
                    icon="🎬"
                    label="Habilidad AV"
                    value={habilidadesParaMostrar(p.audiovisualHabilidades).length ? habilidadesParaMostrar(p.audiovisualHabilidades).join(', ') : 'Ninguna registrada'}
                  />
                  <Row
                    icon="📷"
                    label="Equipo AV"
                    value={{ si: 'Sí, tiene equipo', algo: 'Tiene algo', no: 'No tiene equipo', '': 'No contestado' }[p.audiovisualEquipo || '']}
                  />
                  <Row
                    icon="🔒"
                    label="Consentimiento"
                    value={p.consentimientoDatosFecha ? `Aceptado (${p.consentimientoDatosFecha.slice(0, 10)})` : 'Pendiente'}
                  />
                  {user.canEditAll && (
                    <button
                      onClick={() => setEditing(p)}
                      className="mt-1 bg-primary/10 text-primary font-bold rounded-xl py-2 text-sm"
                    >
                      ✏️ Editar ficha
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {results.length === 0 && query.trim().length < MIN_QUERY && !hayFiltroActivo && (
          <div className="bg-white rounded-2xl p-6 text-center shadow-sm">
            <div className="text-3xl mb-2">🔍</div>
            <div className="text-sm text-slate-500">
              Escribe al menos 3 letras (nombre, estaca o barrio), o elige una estaca arriba.
            </div>
          </div>
        )}
        {results.length === 0 && (query.trim().length >= MIN_QUERY || hayFiltroActivo) && (
          <div className="bg-white rounded-2xl p-6 text-center shadow-sm">
            <div className="text-3xl mb-2">🔍</div>
            <div className="text-sm text-slate-500">Sin resultados para esta búsqueda.</div>
          </div>
        )}
        {allResults.length > visibleCount && (
          <button
            onClick={() => setVisibleCount((v) => v + PAGE_SIZE)}
            className="bg-white border-[1.5px] border-primary/20 text-primary font-bold rounded-2xl py-3 text-sm shadow-sm"
          >
            Cargar {Math.min(PAGE_SIZE, allResults.length - visibleCount)} más ({allResults.length - visibleCount} restantes)
          </button>
        )}
      </div>

      {editing && (
        <EditSheet participante={editing} adminCorreo={user.correo} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}

function EditSheet({
  participante,
  adminCorreo,
  onClose,
}: {
  participante: Participante;
  adminCorreo: string;
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    nombres: participante.nombres,
    apellidos: participante.apellidos,
    telefono: participante.telefono,
    correo: participante.correo,
    genero: participante.genero,
    asignacion: participante.asignacion,
    disponibilidad: participante.disponibilidad,
  });
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await updateParticipante(participante.id, form, adminCorreo);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end z-50" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-t-3xl w-full max-w-[850px] mx-auto p-5 max-h-[85vh] overflow-y-auto">
        <div className="font-extrabold text-lg mb-4">✏️ Editar ficha</div>
        <div className="flex flex-col gap-3">
          {(['nombres', 'apellidos', 'telefono', 'correo'] as const).map((k) => (
            <div key={k}>
              <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1">{k}</div>
              <input className="input" value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
            </div>
          ))}
          <div>
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1">Género</div>
            <select className="input" value={form.genero} onChange={(e) => setForm({ ...form, genero: e.target.value as Genero })}>
              <option value="H">Hombre</option>
              <option value="M">Mujer</option>
            </select>
          </div>
          <div>
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1">Asignación</div>
            <select className="input" value={form.asignacion} onChange={(e) => setForm({ ...form, asignacion: e.target.value as Asignacion })}>
              {ASIGNACIONES.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>
          <div>
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1">Disponibilidad</div>
            <select className="input" value={form.disponibilidad} onChange={(e) => setForm({ ...form, disponibilidad: e.target.value as Disponibilidad })}>
              <option value="si">Sí, disponible</option>
              <option value="no_creo">No cree poder</option>
              <option value="no_se">Aún no lo sabe</option>
            </select>
          </div>
          <div className="flex gap-2 mt-2">
            <button onClick={save} disabled={saving} className="flex-1 bg-primary text-white font-bold rounded-xl py-3 disabled:opacity-50">
              {saving ? 'Guardando…' : '💾 Guardar'}
            </button>
            <button onClick={onClose} className="flex-1 bg-slate-100 text-slate-600 font-bold rounded-xl py-3">
              Cancelar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Avatar({ nombres, apellidos }: { nombres: string; apellidos: string }) {
  const initials = `${(nombres[0] || '').toUpperCase()}${(apellidos[0] || '').toUpperCase()}`;
  return (
    <div className="w-10 h-10 rounded-full bg-primary text-white font-bold text-sm flex items-center justify-center shrink-0">
      {initials}
    </div>
  );
}
function Badge({ children, accent }: { children: React.ReactNode; accent?: boolean }) {
  return (
    <span
      className={`text-[10px] font-bold rounded-full px-2 py-0.5 ${accent ? 'bg-primary/10 text-primary' : 'bg-slate-100 text-slate-500'}`}
    >
      {children}
    </span>
  );
}
function Row({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="flex gap-2.5 text-sm">
      <span className="w-5 text-center">{icon}</span>
      <span className="w-24 text-xs text-slate-500 shrink-0 mt-0.5">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 text-xs font-bold rounded-full px-3.5 py-2.5 whitespace-nowrap ${
        active ? 'bg-primary text-white' : 'bg-white text-slate-500 border border-slate-200'
      }`}
    >
      {children}
    </button>
  );
}
