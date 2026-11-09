// Regras de prazo/status usadas pela API e pelos e-mails (o front tem a mesma lógica em app.js).

export const FUSO = 'America/Sao_Paulo';
export const STATUS = { a_fazer: 'A fazer', fazendo: 'Fazendo', concluido: 'Concluído' };
export const DIAS_SEMANA = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];

/** Data, hora e dia da semana agora, no horário de Brasília. */
export function agoraSP(base = new Date()) {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', hourCycle: 'h23', weekday: 'short',
    }).formatToParts(base).map((p) => [p.type, p.value]),
  );
  const dias = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    data: `${partes.year}-${partes.month}-${partes.day}`,
    hora: Number(partes.hour),
    diaSemana: dias[partes.weekday],
  };
}

export function fmtData(iso) {
  if (!iso) return '';
  const [a, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}

export function fmtDataCurta(iso) {
  if (!iso) return '';
  const [, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}`;
}

/** Próximo dia N (>= hoje) para atividades do tipo "15 de cada mês". */
export function proximaRecorrencia(dia, hojeIso) {
  let [a, m, d] = hojeIso.split('-').map(Number);
  const ultimoDia = (ano, mes) => new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  let alvo = Math.min(dia, ultimoDia(a, m));
  if (alvo < d) {
    m += 1;
    if (m > 12) { m = 1; a += 1; }
    alvo = Math.min(dia, ultimoDia(a, m));
  }
  return `${a}-${String(m).padStart(2, '0')}-${String(alvo).padStart(2, '0')}`;
}

export function prazoEfetivo(at, hoje) {
  if (at.prazo) return at.prazo;
  if (at.dia_recorrente) return proximaRecorrencia(at.dia_recorrente, hoje);
  return null;
}

export function estaAtrasada(at, hoje) {
  return at.status !== 'concluido' && Boolean(at.prazo) && at.prazo < hoje;
}

export function dataAlterada(at) {
  return Boolean(at.prazo_original) && at.prazo !== at.prazo_original;
}

export function textoPrazo(at) {
  if (at.dia_recorrente && !at.prazo) return `todo dia ${at.dia_recorrente}`;
  return at.prazo ? fmtData(at.prazo) : 'sem prazo definido';
}
