import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { useAvisoDeshacer } from './AvisoDeshacer';
import InfoSheet, { BotonInfo } from './InfoSheet';
import Plegable from './Plegable';
import { deshacerPareja, deshacerParejasLote, guardarPareja, guardarParejasLote, subscribeParejas } from '../services/parejasService';
import { nombreConInicialMaterna } from '../utils/nombreCorto';
import {
  MAX_PAREJA,
  MIN_PAREJA,
  companerosDe,
  estacasDistintas,
  otraPropuesta,
  sugerirParejas,
  vistaFamilia,
  type GrupoVista,
  type PropuestaParejas,
} from '../utils/parejasTrabajo';
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
      role="img"
      aria-label={genero === 'H' ? 'Hombre' : 'Mujer'}
      className={`shrink-0 w-5 h-5 rounded-full text-[11px] font-extrabold flex items-center justify-center ${
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
        <span className="text-xs font-bold text-amber-700 bg-amber-100 rounded-full px-1.5 py-0.5 shrink-0">Logístico</span>
      )}
    </div>
  );
});

/**
 * Compañerismos de trabajo dentro de una compañía (2 o 3 integrantes que
 * trabajan juntos). Los arma el auxiliar de la familia o un coordinador
 * general; el resto solo los ve. No son oficiales: se cambian cuando haga falta.
 */
export default function CompanerismosFamilia({
  fam,
  miembros,
  parejas,
  correo,
  puedeEditar,
  abierto,
  onToggle,
}: {
  fam: Familia;
  miembros: Participante[];
  parejas: ParejaTrabajo[];
  correo: string;
  puedeEditar: boolean;
  abierto: boolean;
  onToggle: () => void;
}) {
  const vista = useMemo(() => vistaFamilia(fam, parejas, miembros), [fam, parejas, miembros]);
  // `editando`: null = cerrado; { id: null } = armando uno nuevo; { id } = cambiando uno existente.
  const [editando, setEditando] = useState<{ id: string | null } | null>(null);
  const [sel, setSel] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const { mostrar: mostrarAviso, nodo: avisoNodo } = useAvisoDeshacer();
  // Vista previa de "Sugerir": null = cerrada.
  const [propuesta, setPropuesta] = useState<PropuestaParejas | null>(null);
  const [sinOtra, setSinOtra] = useState(false);
  const [infoSugerir, setInfoSugerir] = useState(false);

  // Al cambiar de familia se cierra todo lo abierto.
  useEffect(() => {
    setEditando(null);
    setSel([]);
    setError('');
    setPropuesta(null);
    setSinOtra(false);
  }, [fam.id]);

  // Si mientras se mira la vista previa alguien más arma o separa un compañerismo
  // (otro auxiliar, otro celular), la propuesta se recalcula con la gente que
  // de verdad sigue sin compañero, en vez de ofrecer algo que ya no se puede aplicar.
  useEffect(() => {
    if (!propuesta) return;
    const libres = new Set(vista.sinCompanero.map((p) => p.id));
    if (propuesta.grupos.every((g) => g.every((p) => libres.has(p.id)))) return;
    const nueva = sugerirParejas(vista.sinCompanero, propuesta.semilla);
    setPropuesta(nueva.grupos.length ? nueva : null);
  }, [propuesta, vista.sinCompanero]);

  const parejasRef = useRef(parejas);
  parejasRef.current = parejas;

  function abrir(grupo: GrupoVista | null) {
    setPropuesta(null);
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
      mostrarAviso(editando.id ? 'Compañerismo cambiado' : 'Compañerismo armado', () => {
        const previo = grupoPrevio ? grupoPrevio.personas.map((p) => p.id) : null;
        if (previo) void guardarPareja(fam, nueva.id, previo, parejasRef.current, correo);
        else void deshacerPareja(nueva, correo);
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
    mostrarAviso('Compañerismo separado', () => {
      void guardarPareja(fam, previo.id, previo.miembros, parejasRef.current.filter((x) => x.id !== previo.id), correo);
    });
  }

  function abrirSugerencia() {
    const p = sugerirParejas(vista.sinCompanero, 0);
    if (!p.grupos.length) return;
    setEditando(null);
    setSel([]);
    setError('');
    setSinOtra(false);
    setPropuesta(p);
  }
  function cerrarSugerencia() {
    setPropuesta(null);
    setSinOtra(false);
    setError('');
  }
  function verOtra() {
    if (!propuesta) return;
    const otra = otraPropuesta(vista.sinCompanero, propuesta);
    setError('');
    setSinOtra(!otra);
    if (otra) setPropuesta(otra);
  }
  async function aplicarSugerencia() {
    if (!propuesta || guardando) return;
    setGuardando(true);
    try {
      const nuevas = await guardarParejasLote(fam, propuesta.grupos.map((g) => g.map((p) => p.id)), parejasRef.current, correo);
      cerrarSugerencia();
      mostrarAviso(nuevas.length === 1 ? 'Compañerismo armado' : `${nuevas.length} compañerismos armados`, () => {
        void deshacerParejasLote(nuevas, correo);
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGuardando(false);
    }
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
        <div className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Compañerismos</div>
        <div className="text-xs text-slate-500">Se necesitan 2 integrantes para armar compañerismos.</div>
      </div>
    );
  }

  const editor = editando && (
    <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 mb-2">
      <div className="text-sm font-bold mb-0.5">{editando.id ? 'Cambiar compañerismo' : 'Armar compañerismo'}</div>
      <div className="text-xs text-slate-500 mb-2">Elige {MIN_PAREJA} o {MAX_PAREJA} personas.</div>
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
      {sel.length === MAX_PAREJA && <div className="text-xs text-slate-500 mt-2">Máximo {MAX_PAREJA} personas.</div>}
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
  );

  // Lo que se lee sin abrir: si falta gente por emparejar (en ámbar) o que todo está listo.
  const sin = vista.sinCompanero.length;
  const resumen =
    miembros.length === 0 ? (
      'Sin integrantes todavía'
    ) : sin > 0 ? (
      <span className="text-amber-700">{sin} sin compañero</span>
    ) : vista.grupos.length > 0 ? (
      'Todos con compañero'
    ) : (
      'Aún no hay compañerismos'
    );

  const panelSugerencia = propuesta && (
    <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 mb-2">
      <div className="flex items-center gap-2 mb-0.5">
        <div className="text-sm font-bold flex-1">Propuesta de compañerismos</div>
        <BotonInfo onClick={() => setInfoSugerir(true)} etiqueta="Cómo se arma la propuesta" />
      </div>
      <div className="text-xs text-slate-500 mb-2">
        {propuesta.grupos.length} {propuesta.grupos.length === 1 ? 'compañerismo' : 'compañerismos'} ·{' '}
        {propuesta.grupos.filter((g) => estacasDistintas(g)).length} con estacas distintas
      </div>
      {propuesta.grupos.map((g) => (
        <div key={g.map((p) => p.id).join('+')} className="rounded-xl bg-white border-l-[3px] border-primary px-3 py-2.5 mb-2">
          <div className="flex flex-col gap-1.5">
            {g.map((p) => (
              <div key={p.id} className="flex items-center gap-2 min-w-0">
                <GeneroTag genero={p.genero} />
                <div className="min-w-0">
                  <div className="text-sm font-semibold truncate">{nombreConInicialMaterna(p.nombres, p.apellidos)}</div>
                  <div className="text-xs text-slate-500 truncate">{p.estaca || 'Sin estaca'}</div>
                </div>
              </div>
            ))}
          </div>
          {(g.length === 3 || !estacasDistintas(g)) && (
            <div className="text-xs font-bold text-slate-500 mt-1.5">
              {[g.length === 3 ? 'Trío' : '', !estacasDistintas(g) ? 'Misma estaca' : ''].filter(Boolean).join(' · ')}
            </div>
          )}
        </div>
      ))}
      {propuesta.sobrantes.length > 0 && (
        <div className="text-xs text-slate-500 mb-2">
          Quedan sin compañero: {propuesta.sobrantes.map((p) => nombreConInicialMaterna(p.nombres, p.apellidos)).join(', ')}.
        </div>
      )}
      {sinOtra && <div className="text-xs text-slate-500 mb-2">No hay otra combinación igual de buena que esta.</div>}
      {error && <div className="text-xs text-red-500 font-semibold mb-2">❌ {error}</div>}
      <button
        onClick={aplicarSugerencia}
        disabled={guardando}
        className="w-full min-h-[44px] bg-primary text-white font-bold rounded-xl text-sm disabled:opacity-40"
      >
        Aplicar ({propuesta.grupos.length})
      </button>
      <div className="flex gap-2 mt-2">
        <button onClick={verOtra} disabled={guardando} className="flex-1 min-h-[44px] bg-primary/10 text-primary font-bold rounded-xl text-sm disabled:opacity-40">
          Otra propuesta
        </button>
        <button onClick={cerrarSugerencia} disabled={guardando} className="flex-1 min-h-[44px] bg-slate-100 text-slate-600 font-bold rounded-xl text-sm">
          Cancelar
        </button>
      </div>
    </div>
  );

  return (
    <>
    <Plegable icono="🤝" titulo={`Compañerismos (${vista.grupos.length})`} resumen={resumen} abierto={abierto} onToggle={onToggle}>
      {puedeEditar && !editando && !propuesta && (
        <div className="flex gap-2 mb-2">
          <button
            onClick={abrirSugerencia}
            disabled={vista.sinCompanero.length < MIN_PAREJA}
            className="flex-1 min-h-[44px] px-3 text-xs font-bold text-primary bg-primary/10 rounded-lg disabled:opacity-40"
          >
            ✨ Sugerir
          </button>
          <button
            onClick={() => abrir(null)}
            disabled={vista.sinCompanero.length < MIN_PAREJA}
            className="flex-1 min-h-[44px] px-3 text-xs font-bold text-primary bg-primary/10 rounded-lg disabled:opacity-40"
          >
            + Armar
          </button>
        </div>
      )}
      {puedeEditar && !editando && !propuesta && miembros.length > 0 && vista.sinCompanero.length < MIN_PAREJA && (
        <div className="text-xs text-slate-500 mb-2">
          {vista.sinCompanero.length === 0
            ? 'Todos tienen compañero. Para armar otro, separa uno o añade integrantes.'
            : 'Solo queda 1 sin compañero: añade a alguien más o cámbialo a un compañerismo.'}
        </div>
      )}
      {panelSugerencia}
      {editando && editando.id === null && editor}

      {vista.grupos.map((g) =>
        editando?.id === g.id ? (
          <div key={g.id}>{editor}</div>
        ) : (
        <div key={g.id} className="rounded-xl bg-slate-50 border-l-[3px] border-primary px-3 py-2.5 mb-2">
          <div className="flex flex-col gap-1.5">
            {g.personas.map((p) => (
              <Persona key={p.id} p={p} />
            ))}
            {g.personas.length === 3 && <div className="text-xs font-bold text-slate-500">Trío</div>}
          </div>
          {puedeEditar && !editando && !propuesta && (
            <div className="flex gap-2 mt-2.5">
              <button onClick={() => abrir(g)} className="flex-1 min-h-[44px] text-xs font-bold text-primary bg-primary/10 rounded-lg">
                Cambiar
              </button>
              <button onClick={() => quitar(g)} className="min-h-[44px] px-5 text-xs font-bold text-red-600 bg-red-50 rounded-lg">
                Separar
              </button>
            </div>
          )}
        </div>
        )
      )}
      {vista.grupos.length === 0 && !editando && <div className="text-xs text-slate-500 text-center py-1.5">Aún no hay compañerismos.</div>}

      {vista.sinCompanero.length > 0 && miembros.length > 0 && (
        <div className="mt-1">
          <div className="text-xs font-bold text-slate-500 mb-1">Sin compañero ({vista.sinCompanero.length})</div>
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

    </Plegable>
      {avisoNodo}
      {infoSugerir && (
        <InfoSheet titulo="¿Cómo se arma la propuesta?" onClose={() => setInfoSugerir(false)}>
          <ul className="text-sm text-slate-600 space-y-2 list-disc pl-5">
            <li>Solo usa a quienes todavía no tienen compañero. Los compañerismos que ya armaste no se tocan.</li>
            <li>Junta hombre con mujer. Si sobran del mismo sexo, quedan entre ellos.</li>
            <li>Si la cantidad es impar, sale un solo trío.</li>
            <li>A igualdad de sexo, prefiere juntar personas de estacas distintas.</li>
            <li>Con "Otra propuesta" ves otra combinación igual de buena. Al aplicar, todo se guarda junto y puedes deshacerlo de una vez.</li>
          </ul>
        </InfoSheet>
      )}
    </>
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
