import { z } from 'zod';

// O progresso da conta: o nível do perfil (sobe com XP), os azios (a moeda do jogo) e o passe da
// temporada (uma trilha de níveis, cada um com recompensas de XP e de azios para resgatar).
//
// De onde vem cada coisa:
// - cada partida terminada (sozinho ou online; o treino não conta) dá XP para o perfil e pontos
//   para o passe — a vitória vale mais que o empate, que vale mais que a derrota;
// - juntando PONTOS_POR_NIVEL_DO_PASSE pontos, o próximo nível da trilha fica liberado; resgatar o
//   nível dá as recompensas dele (XP, azios ou os dois);
// - o XP sobe o nível do perfil, e cada nível pede mais XP que o anterior (xpParaSubir).
// O servidor guarda tudo e é quem soma; o jogo só mostra (com as mesmas contas daqui).

// ---- O nível do perfil ----

export const NIVEL_MAXIMO = 100;

// Quanto XP o nível `nivel` pede para subir para o próximo: 120 no nível 1, 160 no 2, 200 no 3…
// (40 a mais a cada nível).
export const xpParaSubir = (nivel: number): number => 80 + 40 * nivel;

// O nível do perfil com `xp` no total, quanto dele já foi no nível atual e quanto o nível pede.
// No nível máximo, `xpParaSubir` é 0 (não sobe mais).
export function nivelDoPerfil(xp: number): { nivel: number; xpNoNivel: number; xpParaSubir: number } {
  let nivel = 1;
  let resto = Math.max(0, Math.floor(xp));
  while (nivel < NIVEL_MAXIMO && resto >= xpParaSubir(nivel)) {
    resto -= xpParaSubir(nivel);
    nivel++;
  }
  if (nivel >= NIVEL_MAXIMO) return { nivel: NIVEL_MAXIMO, xpNoNivel: 0, xpParaSubir: 0 };
  return { nivel, xpNoNivel: resto, xpParaSubir: xpParaSubir(nivel) };
}

// ---- As partidas ----

// Como a partida terminou para quem manda.
export const ResultadoDaPartida = z.enum(['vitoria', 'empate', 'derrota']);
export type ResultadoDaPartida = z.infer<typeof ResultadoDaPartida>;

// O que cada partida dá: XP para o perfil e pontos para o passe.
export const GANHO_POR_PARTIDA: Record<ResultadoDaPartida, { xp: number; pontos: number }> = {
  vitoria: { xp: 40, pontos: 30 },
  empate: { xp: 25, pontos: 20 },
  derrota: { xp: 15, pontos: 10 },
};

// Menos que isso de partida não dá nada (entrar e sair na hora não junta XP).
export const DURACAO_MINIMA_DA_PARTIDA_S = 20;
// Quantas partidas por dia dão XP e pontos (as outras contam, mas sem ganho).
export const PARTIDAS_COM_GANHO_POR_DIA = 40;

export const ModoDaPartidaDaConta = z.enum(['solo', 'online']);
export type ModoDaPartidaDaConta = z.infer<typeof ModoDaPartidaDaConta>;

// Começar: o servidor abre a partida da conta e devolve o id dela, que volta no fim.
export const ComecarPartidaDaConta = z.object({ modo: ModoDaPartidaDaConta });
export type ComecarPartidaDaConta = z.infer<typeof ComecarPartidaDaConta>;
export const PartidaDaConta = z.object({ id: z.string() });
export type PartidaDaConta = z.infer<typeof PartidaDaConta>;
export const TerminarPartidaDaConta = z.object({ resultado: ResultadoDaPartida });
export type TerminarPartidaDaConta = z.infer<typeof TerminarPartidaDaConta>;

// ---- O passe da temporada ----

// A temporada valendo: o passe é dela; virando a temporada, o passe de cada conta recomeça.
export const TEMPORADA_DO_PASSE = 1;
// O passe dura 30 dias, contados de PASSE_COMECA_EM (para trocar a data da temporada, é só mudar
// aqui). Passado o fim, as partidas deixam de dar pontos do passe (o XP do perfil segue dando) e o
// que já estava liberado ainda dá para resgatar.
export const PASSE_COMECA_EM = '2026-10-04T00:00:00-03:00';
export const DIAS_DO_PASSE = 30;
export const PASSE_TERMINA_EM = new Date(new Date(PASSE_COMECA_EM).getTime() + DIAS_DO_PASSE * 24 * 60 * 60 * 1000);
export const passeAberto = (agora: Date = new Date()): boolean => agora < PASSE_TERMINA_EM;
// Quantos dias faltam para acabar (arredondando para cima; 0: já acabou).
export const diasParaOPasseAcabar = (agora: Date = new Date()): number =>
  Math.max(0, Math.ceil((PASSE_TERMINA_EM.getTime() - agora.getTime()) / (24 * 60 * 60 * 1000)));

// Quantos pontos cada nível pede. A trilha tem 40 níveis: 4.000 pontos, uns 200 partidas — de 6 a
// 7 por dia nos 30 dias. Quem joga um pouco todo dia completa dentro do prazo; quem joga de vez
// em quando fica pelo meio do caminho.
export const PONTOS_POR_NIVEL_DO_PASSE = 100;

export interface RecompensaDoPasse {
  xp: number;
  azios: number;
}

// A trilha: as recompensas de cada nível (o índice 0 é o nível 1). Os níveis comuns alternam
// azios e XP e crescem a cada 10; a cada 5, um nível maior com os dois; o último é o maior de todos.
export const NIVEIS_DO_PASSE: readonly RecompensaDoPasse[] = Array.from({ length: 40 }, (_, i) => {
  const nivel = i + 1;
  if (nivel === 40) return { xp: 800, azios: 700 };
  if (nivel % 10 === 0) return { xp: 300 + 50 * (nivel / 10 - 1), azios: 250 + 50 * (nivel / 10 - 1) };
  if (nivel % 5 === 0) return { xp: 200 + 25 * Math.floor(i / 10), azios: 150 + 25 * Math.floor(i / 10) };
  return nivel % 2 === 1 ? { xp: 0, azios: 40 + 10 * Math.floor(i / 10) } : { xp: 80 + 20 * Math.floor(i / 10), azios: 0 };
});

// Até que nível da trilha os pontos já liberaram (0: nenhum).
export const nivelLiberadoDoPasse = (pontos: number): number =>
  Math.min(NIVEIS_DO_PASSE.length, Math.floor(Math.max(0, pontos) / PONTOS_POR_NIVEL_DO_PASSE));

// O passe da conta: de que temporada é, os pontos juntados e os níveis já resgatados.
export const PasseDaConta = z.object({
  temporada: z.number().int(),
  pontos: z.number().int(),
  resgatados: z.array(z.number().int()),
});
export type PasseDaConta = z.infer<typeof PasseDaConta>;

export const PASSE_VAZIO: PasseDaConta = { temporada: TEMPORADA_DO_PASSE, pontos: 0, resgatados: [] };

export const ResgatarNivelDoPasse = z.object({ nivel: z.number().int().min(1).max(NIVEIS_DO_PASSE.length) });
export type ResgatarNivelDoPasse = z.infer<typeof ResgatarNivelDoPasse>;
