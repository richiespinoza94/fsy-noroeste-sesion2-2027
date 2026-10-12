import { useEffect, useMemo, useState } from 'react';
import { ESTACAS_PRINCIPALES, FILTRO_OTRAS, estacaEnFiltro } from '../data/estacas';
import { subscribeAllAsistencia } from '../services/asistenciaService';
import { buildAsistenciaCsv, buildRegistroCsv, downloadCsv } from '../utils/csvExport';
import { calcularCompromiso } from '../utils/compromiso';
import { calcularAsistenciaPorCapacitacion, medianaAsistencia, promedioAsistencia, soloOcurridas } from '../utils/asistenciaStats';
import { contarPorTipo, filtrarPorTipos, hoyLocalISO, infoTipo, tipoDe } from '../utils/tiposEvento';
import { calcularSeguimiento, CATEGORIAS_SEGUIMIENTO, type CategoriaSeguimiento } from '../utils/seguimiento';
import { tieneExperienciaAudiovisual } from '../utils/audiovisual';
import { useScrollDirection } from '../utils/useScrollDirection';
import { nombreCorto } from '../utils/nombreCorto';
import { fechaAmigable } from '../utils/fechaAmigable';
import { familiasDeAuxiliar, subscribeCompanerismo, subscribeFamilias } from '../services/familiasService';
import { ASIGNACIONES, type Asistencia, type Capacitacion, type Companerismo, type Familia, type Participante, type SessionUser, type TipoEvento } from '../types';
import MetricCard from './MetricCard';
import InfoSheet, { BotonInfo } from './InfoSheet';

type SubTab = 'general' | 'compromiso' | 'seguimiento';

export default function ReportesScreen({
  user,
  participantes: todos,
  capacitaciones,
  subInicial,
  onNavHiddenChange,
}: {
  user: SessionUser;
  participantes: Participante[];
  capacitaciones: Capacitacion[];
  subInicial?: SubTab;
  onNavHiddenChange: (hidden: boolean) => void;
}) {
  const handleScroll = useScrollDirection(onNavHiddenChange);
  const [sub, setSub] = useState<SubTab>(subInicial ?? 'general');
  const [asistencia, setAsistencia] = useState<Asistencia[]>([]);
  const [filterEstaca, setFilterEstaca] = useState('');
  const [soloAudiovisual, setSoloAudiovisual] = useState(false);
  // Filtro por tipo de evento, de selección múltiple (ej. capacitaciones +
  // bailes). Vacío = TODOS los eventos, que es el valor por defecto: cada
  // evento importa, el filtro solo sirve para acotar cuando hace falta.
  const [tiposSel, setTiposSel] = useState<TipoEvento[]>([]);
  // Cuántos de cada grupo de seguimiento se muestran (el resto, bajo "Ver más").
  // Hoja ⓘ de Seguimiento: 'todas' desde el encabezado, o el grupo tocado (sale primero).
  const [infoSeguimiento, setInfoSeguimiento] = useState<CategoriaSeguimiento | 'todas' | null>(null);
  const [seguimientoVisible, setSeguimientoVisible] = useState<Record<string, number>>({});
  // El detalle muestra solo los más recientes y se amplía bajo demanda — con
  // muchos eventos la lista completa obligaba a bajar y bajar.
  const DETALLE_PAGINA = 5;
  const [detalleVisible, setDetalleVisible] = useState(DETALLE_PAGINA);

  useEffect(() => subscribeAllAsistencia(setAsistencia), []);

  // Un Coordinador Auxiliar ve los reportes SOLO de los integrantes de sus
  // familias: todo lo de abajo (métricas, estacas, compromiso, CSV) se
  // calcula sobre `participantes`, así que basta con acotarlo acá.
  const [familias, setFamilias] = useState<Familia[]>([]);
  const [companerismo, setCompanerismo] = useState<Companerismo[]>([]);
  useEffect(() => {
    if (!user.isAuxiliar) return;
    const u1 = subscribeFamilias(setFamilias);
    const u2 = subscribeCompanerismo(setCompanerismo);
    return () => {
      u1();
      u2();
    };
  }, [user.isAuxiliar]);
  const participantes = useMemo(() => {
    if (!user.isAuxiliar) return todos;
    const ids = new Set(familiasDeAuxiliar(user.participantId, companerismo, familias).flatMap((f) => f.consejeros));
    return todos.filter((p) => ids.has(p.id));
  }, [todos, user.isAuxiliar, user.participantId, companerismo, familias]);

  const segmento = participantes
    .filter((p) => !filterEstaca || estacaEnFiltro(p.estaca, filterEstaca))
    .filter((p) => !soloAudiovisual || tieneExperienciaAudiovisual(p.audiovisualHabilidades));
  const confirmados = segmento.filter((p) => p.disponibilidad === 'si').length;

  const tiposPresentes = useMemo(() => contarPorTipo(capacitaciones), [capacitaciones]);
  // Descarta tipos elegidos que ya no existen (se borró o reclasificó el último evento de ese tipo).
  const tiposActivos = useMemo(
    () => tiposSel.filter((t) => tiposPresentes.some((x) => x.tipo === t)),
    [tiposSel, tiposPresentes]
  );
  function alternarTipo(t: TipoEvento) {
    const nuevo = tiposActivos.includes(t) ? tiposActivos.filter((x) => x !== t) : [...tiposActivos, t];
    // Elegir todos los tipos que existen equivale a no filtrar.
    setTiposSel(nuevo.length === tiposPresentes.length ? [] : nuevo);
    setDetalleVisible(DETALLE_PAGINA);
  }
  const etiquetaFiltro =
    tiposActivos.length === 0 ? 'Todos los eventos' : tiposActivos.map((t) => infoTipo(t).label).join(' + ');

  const capsOrdenadas = useMemo(
    () =>
      [...filtrarPorTipos(capacitaciones, tiposActivos)].sort((a, b) => `${a.fecha}${a.hora}`.localeCompare(`${b.fecha}${b.hora}`)),
    [capacitaciones, tiposActivos]
  );

  // Extraído a utils/asistenciaStats.ts — lo usa también HomeScreen para la
  // tarjeta de "asistencia en vivo / última capacitación", ya no vive
  // duplicado en 2 componentes.
  const attByCap = useMemo(
    () => calcularAsistenciaPorCapacitacion(segmento, capsOrdenadas, asistencia),
    [segmento, capsOrdenadas, asistencia]
  );
  const avgAtt = useMemo(() => promedioAsistencia(attByCap), [attByCap]);
  const medAtt = useMemo(() => medianaAsistencia(attByCap), [attByCap]);
  // Solo lo que ya ocurrió (o ya tiene marcas), del más reciente al más viejo.
  const ocurridas = useMemo(() => soloOcurridas(attByCap, hoyLocalISO()), [attByCap]);
  const detalle = useMemo(() => [...ocurridas].reverse(), [ocurridas]);
  const proximasSinMarcas = attByCap.length - ocurridas.length;
  // El gráfico muestra las últimas 10: con más barras se vuelve un scroll horizontal infinito.
  const GRAFICO_MAX = 10;
  const grafico = useMemo(() => ocurridas.slice(-GRAFICO_MAX), [ocurridas]);

  const byEstaca = [
    ...ESTACAS_PRINCIPALES.map((e) => ({ estaca: e, n: participantes.filter((p) => p.estaca === e).length })),
    { estaca: 'Otras estacas', n: participantes.filter((p) => !ESTACAS_PRINCIPALES.includes(p.estaca)).length },
  ]
    .filter((x) => x.n > 0)
    // De mayor a menor; "Otras estacas" (un cajón de varias) siempre al final.
    .sort((a, b) => Number(a.estaca === 'Otras estacas') - Number(b.estaca === 'Otras estacas') || b.n - a.n);
  // De mayor a menor; en empate, el orden de siempre de los roles (sort estable).
  const byRol = ASIGNACIONES.map((r) => ({ rol: r, n: segmento.filter((p) => p.asignacion === r).length }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n);

  // Compromiso por persona: quién se preparó con tiempo y con constancia,
  // no solo quién "asistió más" en números absolutos — ordenado por tasa de
  // asistencia sobre lo que realmente pudo hacer (sin tasa aún = al final).
  const compromiso = useMemo(
    () =>
      segmento
        .map((p) => ({ p, c: calcularCompromiso(p, capsOrdenadas, asistencia) }))
        .sort((a, b) => (b.c.tasaAsistencia ?? -1) - (a.c.tasaAsistencia ?? -1)),
    [segmento, capsOrdenadas, asistencia]
  );

  // Seguimiento / retención — usa los mismos eventos filtrados y el mismo segmento.
  const seguimiento = useMemo(
    () => calcularSeguimiento(segmento, capsOrdenadas, asistencia),
    [segmento, capsOrdenadas, asistencia]
  );

  const hoy = hoyLocalISO();

  return (
    <div className="h-full overflow-y-auto p-4 pb-24 flex flex-col gap-4" onScroll={handleScroll}>
      <div className="flex bg-white rounded-xl p-1 shadow-sm">
        <button
          onClick={() => setSub('general')}
          className={`flex-1 py-2 text-xs font-bold rounded-lg ${sub === 'general' ? 'bg-primary text-white' : 'text-slate-500'}`}
        >
          📊 General
        </button>
        <button
          onClick={() => setSub('compromiso')}
          className={`flex-1 py-2 text-xs font-bold rounded-lg ${sub === 'compromiso' ? 'bg-primary text-white' : 'text-slate-500'}`}
        >
          🎯 Compromiso
        </button>
        <button
          onClick={() => setSub('seguimiento')}
          className={`flex-1 py-2 text-xs font-bold rounded-lg whitespace-nowrap relative ${sub === 'seguimiento' ? 'bg-primary text-white' : 'text-slate-500'}`}
        >
          🔔 Seguimiento
          {seguimiento.length > 0 && (
            <span
              className="absolute -top-1.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-[#C62828] text-white text-xs leading-[18px] text-center"
              aria-label={`${seguimiento.length} personas por contactar`}
            >
              {seguimiento.length}
            </span>
          )}
        </button>
      </div>

      {/* Solo aparece si hay 2+ tipos de evento: con uno solo sería un filtro inútil.
          Selección múltiple: tocar un tipo lo suma o lo quita; "Todos" (sin
          ninguno elegido) es el valor por defecto. */}
      {tiposPresentes.length > 1 && (
        <div className="flex gap-2 overflow-x-auto -mx-4 px-4 pb-0.5" role="group" aria-label="Filtrar por tipo de evento">
          {[{ tipo: 'todos' as const, n: capacitaciones.length }, ...tiposPresentes].map(({ tipo, n }) => {
            const activo = tipo === 'todos' ? tiposActivos.length === 0 : tiposActivos.includes(tipo);
            return (
              <button
                key={tipo}
                aria-pressed={activo}
                onClick={() => {
                  if (tipo === 'todos') {
                    setTiposSel([]);
                    setDetalleVisible(DETALLE_PAGINA);
                  } else alternarTipo(tipo);
                }}
                className={`shrink-0 min-h-[40px] text-xs font-bold rounded-full px-3.5 whitespace-nowrap border-[1.5px] ${
                  activo ? 'bg-primary border-primary text-white' : 'bg-white border-slate-200 text-slate-600'
                }`}
              >
                {tipo === 'todos' ? 'Todos' : `${infoTipo(tipo).icon} ${infoTipo(tipo).label}`} · {n}
              </button>
            );
          })}
        </div>
      )}

      <div className="flex gap-2">
        <select className="input flex-1" value={filterEstaca} onChange={(e) => setFilterEstaca(e.target.value)}>
          <option value="">Todas las estacas</option>
          {ESTACAS_PRINCIPALES.map((e) => (
            <option key={e} value={e}>{e}</option>
          ))}
          <option value={FILTRO_OTRAS}>Otras</option>
        </select>
        <button
          onClick={() => setSoloAudiovisual((v) => !v)}
          title="Solo consejeros con experiencia en audiovisuales"
          className={`shrink-0 text-xs font-bold rounded-xl px-3 whitespace-nowrap border-[1.5px] ${
            soloAudiovisual ? 'bg-accent border-accent text-primary' : 'bg-white border-slate-200 text-slate-600'
          }`}
        >
          🎬 AV
        </button>
        <button
          onClick={() => {
            // El reporte descargado cambia según la pestaña activa — antes
            // siempre bajaba la matriz de asistencia (pensada para
            // Compromiso) aunque se descargara desde General, y encima
            // ignoraba los filtros de estaca/audiovisual (usaba
            // `participantes` completo, no `segmento`). Los dos se arreglan
            // acá: siempre `segmento` (el filtrado), y el tipo de reporte
            // según `sub`.
            const fecha = new Date().toISOString().slice(0, 10);
            if (sub === 'general') {
              downloadCsv(buildRegistroCsv(segmento), `registro-fsy-2027-${fecha}.csv`);
            } else {
              downloadCsv(buildAsistenciaCsv(segmento, capsOrdenadas, asistencia), `asistencia-fsy-2027-${fecha}.csv`);
            }
          }}
          className="shrink-0 bg-primary text-white font-bold text-xs rounded-xl px-3 flex items-center gap-1.5"
          title={
            sub === 'general'
              ? 'Descargar CSV con todos los datos del formulario de registro (del segmento filtrado)'
              : 'Descargar CSV con la asistencia de cada participante a cada capacitación (del segmento filtrado)'
          }
        >
          📥 CSV
        </button>
      </div>
      {soloAudiovisual && (
        <div className="text-xs text-slate-500 px-1 -mt-2">
          Mostrando solo consejeros con experiencia audiovisual real ({segmento.length} de{' '}
          {filterEstaca ? participantes.filter((p) => estacaEnFiltro(p.estaca, filterEstaca)).length : participantes.length}).
        </div>
      )}

      {sub === 'general' && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <MetricCard label="Consejeros del segmento" value={segmento.length} color="#0E2954" icon="👥" />
            <MetricCard label="Confirmados" value={confirmados} color="#4CAF50" icon="✅" />
            <MetricCard
              label="Asistencia promedio"
              value={`${avgAtt}%`}
              color="#E8863A"
              icon="📈"
              sub={`Mediana ${medAtt}%`}
            />
            <MetricCard
              label={tiposActivos.length === 1 ? infoTipo(tiposActivos[0]).plural : 'Eventos'}
              value={capsOrdenadas.length}
              color="#9C27B0"
              icon={tiposActivos.length === 1 ? infoTipo(tiposActivos[0]).icon : '📅'}
            />
          </div>

      {grafico.length > 0 && (
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">
            Tendencia de asistencia{tiposActivos.length > 0 ? ` · ${etiquetaFiltro}` : ''}{ocurridas.length > GRAFICO_MAX ? ` · últimas ${GRAFICO_MAX} de ${ocurridas.length}` : ''}
          </div>
          {/* Una fila por evento (nombre completo + barra + %): cabe en cualquier
              ancho, sin scroll horizontal ni texto diminuto. */}
          <ul className="flex flex-col gap-3">
            {grafico.map((d) => {
              const sinDatos = d.registros === 0;
              return (
                <li key={d.cap.id}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-semibold leading-snug">{infoTipo(tipoDe(d.cap)).icon} {d.cap.label}</span>
                    <span className="shrink-0 text-xs text-slate-500">{fechaAmigable(d.cap.fecha, hoy)}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <div
                      className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden"
                      role="img"
                      aria-label={sinDatos ? 'Sin marcas todavía' : `${d.pct}% de asistencia`}
                    >
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${Math.max(d.pct, sinDatos ? 0 : 2)}%`, background: '#0E2954' }}
                      />
                    </div>
                    <span className="w-11 shrink-0 text-right text-sm font-extrabold tabular-nums" style={{ color: sinDatos ? '#8899B0' : '#0E2954' }}>
                      {sinDatos ? '—' : `${d.pct}%`}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="text-xs font-bold text-slate-500 uppercase tracking-wide px-1">Detalle · más recientes primero</div>
      <div className="flex flex-col gap-2">
        {detalle.slice(0, detalleVisible).map((d) => (
          <div key={d.cap.id} className="bg-white rounded-2xl p-3 shadow-sm">
            <div className="text-sm font-bold leading-snug">{infoTipo(tipoDe(d.cap)).icon} {d.cap.label}</div>
            <div className="text-xs text-slate-500">{fechaAmigable(d.cap.fecha, hoy)} · {d.registros} registros</div>
            <div className="grid grid-cols-4 gap-1.5 mt-2 text-xs">
              <Mark label={`✓ ${d.presentes}`} bg="#E8F5E9" fg="#2E7D32" />
              <Mark label={`✕ ${d.ausentes}`} bg="#FFEBEE" fg="#C62828" />
              <Mark label={`J ${d.justificados}`} bg="#FFF3E0" fg="#EF6C00" />
              <Mark label={`○ ${d.sinMarca}`} bg="#F5F5F5" fg="#757575" />
            </div>
          </div>
        ))}
        {detalle.length > detalleVisible && (
          <button
            onClick={() => setDetalleVisible((n) => n + DETALLE_PAGINA * 2)}
            className="bg-white border-[1.5px] border-slate-200 text-primary text-xs font-bold rounded-xl py-3 min-h-[44px]"
          >
            {detalle.length - detalleVisible <= DETALLE_PAGINA * 2 ? `Ver ${detalle.length - detalleVisible} más` : `Ver ${DETALLE_PAGINA * 2} más · ${detalle.length - detalleVisible} restantes`}
          </button>
        )}
        {detalle.length > DETALLE_PAGINA && detalleVisible >= detalle.length && (
          <button
            onClick={() => setDetalleVisible(DETALLE_PAGINA)}
            className="text-slate-500 text-xs font-bold py-2"
          >
            Ver menos
          </button>
        )}
        {proximasSinMarcas > 0 && (
          <div className="text-xs text-slate-500 text-center">+ {proximasSinMarcas} programada(s) sin marcas todavía</div>
        )}
        {attByCap.length === 0 && <div className="text-xs text-slate-500 text-center py-4">Sin eventos todavía.</div>}
      </div>

      <div className="text-xs font-bold text-slate-500 uppercase tracking-wide px-1">Por estaca</div>
      <div className="flex flex-col gap-1.5">
        {byEstaca.map(({ estaca, n }) => {
          const pct = participantes.length ? Math.round((n / participantes.length) * 100) : 0;
          return (
            <div key={estaca} className="bg-white rounded-xl px-3.5 py-2.5 shadow-sm">
              <div className="flex justify-between text-xs mb-1">
                <span className="font-semibold">{estaca}</span>
                <span className="text-slate-500">{n} ({pct}%)</span>
              </div>
              <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>

      <div className="text-xs font-bold text-slate-500 uppercase tracking-wide px-1">Por rol</div>
      <div className="grid grid-cols-2 gap-2">
        {byRol.map(({ rol, n }) => (
          <div key={rol} className="bg-white rounded-xl px-3 py-2.5 shadow-sm">
            <div className="text-lg font-extrabold text-primary">{n}</div>
            <div className="text-xs text-slate-500 font-semibold">{rol}</div>
          </div>
        ))}
      </div>
        </>
      )}

      {sub === 'seguimiento' && (
        <>
          <div className="flex items-center gap-2 px-1">
            <div className="flex-1 text-xs font-bold text-slate-500 uppercase tracking-wide">A quién escribirle · {etiquetaFiltro}</div>
            <BotonInfo onClick={() => setInfoSeguimiento('todas')} etiqueta="Qué significa cada lista" />
          </div>
          {seguimiento.length === 0 && (
            <div className="bg-white rounded-2xl p-6 text-center shadow-sm">
              <div className="text-3xl mb-2">🎉</div>
              <div className="text-sm font-bold mb-1">Nadie requiere seguimiento por ahora</div>
              <div className="text-xs text-slate-500">Con estos filtros no hay faltas que atender.</div>
            </div>
          )}
          {CATEGORIAS_SEGUIMIENTO.map((cat) => {
            const items = seguimiento.filter((i) => i.categoria === cat.id);
            if (items.length === 0) return null;
            const visibles = seguimientoVisible[cat.id] ?? 5;
            return (
              <div key={cat.id} className="bg-white rounded-2xl p-4 shadow-sm border-t-[3px]" style={{ borderTopColor: cat.color }}>
                <div className="flex items-start gap-2">
                  <span className="text-xl leading-none">{cat.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-extrabold leading-tight">{cat.titulo}</div>
                  </div>
                  <span className="shrink-0 text-xs font-bold rounded-full px-2.5 py-0.5 bg-slate-100 text-slate-700">{items.length}</span>
                  <BotonInfo onClick={() => setInfoSeguimiento(cat.id)} etiqueta={`Qué significa: ${cat.titulo}`} />
                </div>
                <div className="divide-y divide-slate-100 mt-2">
                  {items.slice(0, visibles).map((i) => {
                    const tel = i.participante.telefono.replace(/\D/g, '');
                    return (
                      <div key={i.participante.id} className="flex items-center gap-2 py-2.5">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-bold truncate">{nombreCorto(i.participante.nombres, i.participante.apellidos)}</div>
                          <div className="text-xs text-slate-500 leading-snug">{i.detalle}</div>
                          <div className="text-xs text-slate-400">{i.participante.estaca}</div>
                        </div>
                        {tel && (
                          <a
                            href={`https://wa.me/51${tel}`}
                            target="_blank"
                            rel="noopener"
                            className="shrink-0 text-xs font-bold text-primary bg-primary/5 rounded-lg px-3 py-2.5 min-h-[44px] flex items-center"
                          >
                            💬 Escribir
                          </a>
                        )}
                      </div>
                    );
                  })}
                </div>
                {items.length > visibles && (
                  <button
                    onClick={() => setSeguimientoVisible((v) => ({ ...v, [cat.id]: visibles + 10 }))}
                    className="w-full mt-1 text-primary text-xs font-bold py-2.5 min-h-[44px]"
                  >
                    Ver {Math.min(10, items.length - visibles)} más · {items.length - visibles} restantes
                  </button>
                )}
              </div>
            );
          })}
          {infoSeguimiento && (
            <InfoSheet titulo="¿Qué significa cada lista?" onClose={() => setInfoSeguimiento(null)}>
              <div className="flex flex-col gap-3">
                {[...CATEGORIAS_SEGUIMIENTO]
                  .sort((a, b) => Number(b.id === infoSeguimiento) - Number(a.id === infoSeguimiento))
                  .map((cat) => (
                    <div key={cat.id} className="flex gap-3 rounded-xl bg-slate-50 p-3 border-l-4" style={{ borderLeftColor: cat.color }}>
                      <span className="text-xl leading-none" aria-hidden="true">{cat.icon}</span>
                      <div>
                        <div className="text-sm font-extrabold">{cat.titulo}</div>
                        <div className="text-sm text-slate-600 mt-0.5">{cat.regla}</div>
                      </div>
                    </div>
                  ))}
              </div>
              <div className="text-sm font-bold mt-4 mb-1">Para todas las listas</div>
              <ul className="text-sm text-slate-600 list-disc pl-5 space-y-1">
                <li>Cada persona aparece en una sola lista.</li>
                <li>Solo cuentan eventos que ya terminaron.</li>
                <li>Una falta justificada no cuenta como falta.</li>
                <li>Un evento solo cuenta para quien ya estaba registrado cuando ocurrió.</li>
              </ul>
            </InfoSheet>
          )}
        </>
      )}

      {sub === 'compromiso' && (
        <>
          <div className="text-xs text-slate-500 px-1">Ordenado por asistencia desde que cada quien se registró.</div>
          <div className="flex flex-col gap-2">
            {compromiso.map(({ p, c }) => (
              <div key={p.id} className="bg-white rounded-2xl p-3.5 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-bold flex items-center gap-1.5">
                      <span className="truncate">{nombreCorto(p.nombres, p.apellidos)}</span>
                      {c.rachaPerfecta && (
                        <span className="shrink-0" title="Asistió a todas las capacitaciones desde que se registró">🔥</span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500">{p.estaca}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-lg font-extrabold text-primary">
                      {c.tasaAsistencia === null ? '—' : `${Math.round(c.tasaAsistencia * 100)}%`}
                    </div>
                    <div className="text-xs text-slate-500">{c.asistencias}/{c.elegibles} asistencias</div>
                  </div>
                </div>
                <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100 text-xs text-slate-500">
                  <span>{c.asistencias} asistencias totales · {c.inasistencias} inasistencias</span>
                  <span>Elegible en {c.elegibles}/{c.totalCapacitaciones} del programa</span>
                </div>
              </div>
            ))}
            {compromiso.length === 0 && <div className="text-xs text-slate-500 text-center py-4">Sin participantes en este segmento.</div>}
          </div>
        </>
      )}
    </div>
  );
}

function Mark({ label, bg, fg }: { label: string; bg: string; fg: string }) {
  return (
    <span className="rounded-full py-1 font-bold text-center tabular-nums" style={{ background: bg, color: fg }}>
      {label}
    </span>
  );
}

