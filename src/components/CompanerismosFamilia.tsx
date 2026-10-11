import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { deshacerPareja, guardarPareja, subscribeParejas } from '../services/parejasService';
import { nombreConInicialMaterna } from '../utils/nombreCorto';
import { MAX_PAREJA, MIN_PAREJA, companerosDe, vistaFamilia, type GrupoVista } from '../utils/parejasTrabajo';
import type { Familia, ParejaTrabajo, Participante } from '../types';

/** Lista compartida de compañerismos de trabajo (una sola conexión, ver parejasService). */
export function useParejas(): ParejaTrabajo[] {
  const [parejas, setParejas] = useState<ParejaTrabajo[]>([]);
  useEffect(() => subscribeParejas(setParejas), []);
  return parejas;
}

function GeneroTag({ genero }: { genero: Participante['genero'] }) {
  return (
    <span
      aria-label={genero === 'H' ? 'Hombre' : 'Mujer'}
      className={`shrink-0 w-5 h-5 rounded-full text-[10px] font-extrabold flex items-center justify-center ${
        genero === 'H' ? 'bg-sky-100 text-sky-700' : 'bg-pink-100 text-pink-700'
      }`}
    >
      {genero === 'H' ? 'H' : 'M'}
    </span>
  );
}

const Persona = memo(function Persona({ p }: { p: Participante }) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <GeneroTag genero={p.genero} />
      <span className="text-sm font-semibold truncate">{nombreConInicialMaterna(p.nombres, p.apellidos)}</span>
      {p.asignacion === 'Logístico' && (
        <span className="text-[11px] font-bold text-amber-700 bg-amber-100 rounded-full px-1.5 py-0.5 shrink-0">Logístico</span>
      )}
    </div>
  );
});

interface Aviso {
  texto: string;
  deshacer: () => void;
}

/**
 * Compañerismos de trabajo dentro de una familia (2 o 3 integrantes que
 * trabajan juntos). Los arma el auxiliar de la familia o un coordinador
 * general; el resto solo los ve. No son oficiales: se cambian cuando haga falta.
 */
export default function CompanerismosFamilia({
  fam,
  miembros,
  parejas,
  correo,
  puedeEditar,
}: {
  fam: Familia;
  miembros: Participante[];
  parejas: ParejaTrabajo[];
  correo: string;
  puedeEditar: boolean;
}) {
  const vista = useMemo(() => vistaFamilia(fam, parejas, miembros), [fam, parejas, miembros]);
  // `editando`: null = cerrado; { id: null } = armando uno nuevo; { id } = cambiando uno existente.
  const [editando, setEditando] = useState<{ id: string | null } | null>(null);
  const [sel, setSel] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const temporizador = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Al cambiar de familia se cierra todo lo abierto.
  useEffect(() => {
    setEditando(null);
    setSel([]);
    setError('');
  }, [fam.id]);
  useEffect(() => () => clearTimeout(temporizador.current), []);

  const mostrarAviso = useCallback((a: Aviso) => {
    clearTimeout(temporizador.current);
    setAviso(a);
    temporizador.current = setTimeout(() => setAviso(null), 5000);
  }, []);

  const parejasRef = useRef(parejas);
  parejasRef.current = parejas;

  function abrir(grupo: GrupoVista | null) {
    setEditando({ id: grupo?.id ?? null });
    setSel(grupo ? grupo.personas.map((p) => p.id) : []);
    setError('');
  }
  function cerrar() {
    setEditando(null);
    setSel([]);
    setError('');
  }
  function alternar(id: string) {
    setError('');
    setSel((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : prev.length >= MAX_PAREJA ? prev : [...prev, id]));
  }

  async function guardar() {
    if (!editando || guardando) return;
    const grupoPrevio = editando.id ? vista.grupos.find((g) => g.id === editando.id) : undefined;
    setGuardando(true);
    try {
      const nueva = await guardarPareja(fam, editando.id, sel, parejasRef.current, correo);
      cerrar();
      mostrarAviso({
        texto: editando.id ? 'Compañerismo cambiado' : 'Compañerismo armado',
        deshacer: () => {
          setAviso(null);
          const previo = grupoPrevio ? grupoPrevio.personas.map((p) => p.id) : null;
          if (previo) void guardarPareja(fam, nueva.id, previo, parejasRef.current, correo);
          else void deshacerPareja(nueva, correo);
        },
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGuardando(false);
    }
  }

  function quitar(grupo: GrupoVista) {
    const previo: ParejaTrabajo = { id: grupo.id, familiaId: fam.id, miembros: grupo.personas.map((p) => p.id) };
    void deshacerPareja(previo, correo);
    mostrarAviso({
      texto: 'Compañerismo deshecho',
      deshacer: () => {
        setAviso(null);
        void guardarPareja(fam, previo.id, previo.miembros, parejasRef.current.filter((x) => x.id !== previo.id), correo);
      },
    });
  }

  // En el selector: quienes no tienen compañero + los del grupo que se está cambiando.
  const opciones = useMemo(() => {
    if (!editando) return [];
    const propios = new Set(editando.id ? (vista.grupos.find((g) => g.id === editando.id)?.personas ?? []).map((p) => p.id) : []);
    const libres = vista.sinCompanero;
    const delGrupo = miembros.filter((p) => propios.has(p.id));
    return [...delGrupo, ...libres];
  }, [editando, vista, miembros]);

  if (miembros.length < MIN_PAREJA && vista.grupos.length === 0) {
    return (
      <div className="bg-white rounded-2xl p-4 shadow-sm">
        <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1">Compañerismos</div>
        <div className="text-xs text-slate-500">Hacen falta al menos 2 integrantes en la compañía para armar compañerismos.</div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm">
      <div className="flex items-center gap-2 mb-1">
        <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wide flex-1">
          Compañerismos ({vista.grupos.length})
        </div>
        {puedeEditar && !editando && (
          <button
            onClick={() => abrir(null)}
            disabled={vista.sinCompanero.length < MIN_PAREJA}
            className="min-h-[44px] px-3 text-xs font-bold text-primary bg-primary/10 rounded-lg disabled:opacity-40"
          >
            + Armar
          </button>
        )}
      </div>
      <div className="text-[11px] text-slate-500 mb-2.5">Quiénes trabajan juntos en esta compañía. Aún no es oficial: se puede cambiar.</div>

      {vista.grupos.map((g) => (
        <div key={g.id} className="rounded-xl bg-slate-50 border-l-[3px] border-primary px-3 py-2 mb-2">
          <div className="flex items-start gap-2">
            <div className="flex-1 min-w-0 flex flex-col gap-1">
              {g.personas.map((p) => (
                <Persona key={p.id} p={p} />
              ))}
              {g.personas.length === 3 && <div className="text-[11px] font-bold text-slate-500">Trío</div>}
            </div>
            {puedeEditar && !editando && (
              <div className="flex gap-1 shrink-0">
                <button onClick={() => abrir(g)} className="min-h-[44px] px-3 text-xs font-bold text-primary bg-primary/10 rounded-lg">
                  Cambiar
                </button>
                <button onClick={() => quitar(g)} className="min-h-[44px] px-3 text-xs font-bold text-red-600 bg-red-50 rounded-lg">
                  Deshacer
                </button>
              </div>
            )}
          </div>
        </div>
      ))}
      {vista.grupos.length === 0 && !editando && <div className="text-xs text-slate-500 text-center py-1.5">Aún no hay compañerismos.</div>}

      {editando && (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 mb-2">
          <div className="text-sm font-bold mb-0.5">{editando.id ? 'Cambiar compañerismo' : 'Armar compañerismo'}</div>
          <div className="text-[11px] text-slate-500 mb-2">
            Toca a {MIN_PAREJA} personas (o {MAX_PAREJA} si son impares). Pueden ser del mismo sexo.
          </div>
          <div className="flex flex-wrap gap-1.5">
            {opciones.map((p) => {
              const on = sel.includes(p.id);
              return (
                <button
                  key={p.id}
                  aria-pressed={on}
                  onClick={() => alternar(p.id)}
                  className={`min-h-[44px] px-3 rounded-xl text-sm font-semibold border-2 flex items-center gap-2 ${
                    on ? 'bg-primary text-white border-primary' : 'bg-white text-slate-700 border-slate-200'
                  }`}
                >
                  <GeneroTag genero={p.genero} />
                  {nombreConInicialMaterna(p.nombres, p.apellidos)}
                </button>
              );
            })}
          </div>
          {error && <div className="text-xs text-red-500 font-semibold mt-2">❌ {error}</div>}
          <div className="flex gap-2 mt-3">
            <button
              onClick={guardar}
              disabled={sel.length < MIN_PAREJA || guardando}
              className="flex-1 min-h-[44px] bg-primary text-white font-bold rounded-xl text-sm disabled:opacity-40"
            >
              Guardar ({sel.length})
            </button>
            <button onClick={cerrar} className="flex-1 min-h-[44px] bg-slate-100 text-slate-600 font-bold rounded-xl text-sm">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {vista.sinCompanero.length > 0 && miembros.length > 0 && (
        <div className="mt-1">
          <div className="text-[11px] font-bold text-slate-500 mb-1">Sin compañero ({vista.sinCompanero.length})</div>
          <div className="flex flex-wrap gap-1.5">
            {vista.sinCompanero.map((p) => (
              <span key={p.id} className="inline-flex items-center gap-1.5 bg-amber-50 text-amber-800 rounded-full pl-1 pr-2.5 py-1 text-xs font-semibold">
                <GeneroTag genero={p.genero} />
                {nombreConInicialMaterna(p.nombres, p.apellidos)}
              </span>
            ))}
          </div>
        </div>
      )}

      {aviso && (
        <div
          role="status"
          aria-live="polite"
          className="fixed left-4 right-4 bottom-20 z-30 mx-auto max-w-md bg-slate-900 text-white rounded-xl pl-4 pr-1 flex items-center gap-2 shadow-lg"
        >
          <span className="flex-1 text-sm py-2.5 truncate">{aviso.texto}</span>
          <button onClick={aviso.deshacer} className="min-h-[44px] px-4 text-sm font-extrabold text-accent">
            Deshacer
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Línea "Trabaja con" para la ficha de Búsqueda. Solo se monta con la ficha
 * abierta y de alguien que tiene compañía, así que la lectura de parejas
 * (compartida y casi vacía) no ocurre al entrar a Búsqueda.
 */
export function TrabajaCon({ persona, participantes }: { persona: Participante; participantes: Participante[] }) {
  const parejas = useParejas();
  const companeros = useMemo(
    () => companerosDe(persona, parejas, new Map(participantes.map((p) => [p.id, p]))),
    [persona, parejas, participantes]
  );
  return (
    <div className="flex gap-2.5 text-sm">
      <span className="w-5 text-center">🤝</span>
      <span className="w-24 text-xs text-slate-500 shrink-0 mt-0.5">Trabaja con</span>
      <span className="font-medium">
        {companeros.length ? companeros.map((c) => nombreConInicialMaterna(c.nombres, c.apellidos)).join(' y ') : 'Sin compañero'}
      </span>
    </div>
  );
}
