// O batimento de cada conexão da partida: um ping do WebSocket a cada `batidaMs` (o navegador
// responde sozinho, sem código do jogo). Serve para três coisas:
// - medir quanto tempo leva a ida e a volta de cada jogador até aqui: com isso o outro adianta o
//   estado que chega pelo atraso da viagem, confere os golpes onde estava quando eles saíram, e
//   cada um vê o ping na tela (salas.ts). Uma batida por segundo: o atraso acompanha a rede de
//   perto, e o ping custa uns poucos bytes;
// - manter a conexão viva nas telas paradas (a espera do convidado, a escolha do personagem): o
//   proxy na frente do Render fecha conexão muda em ~100 s;
// - perceber a conexão que caiu sem avisar (Wi-Fi que some, notebook fechado): sem resposta por
//   `semRespostaMs`, ela é derrubada e a sala avisa o outro na hora, em vez de ele ficar jogando
//   contra um boneco parado até o TCP desistir, minutos depois.

export const BATIDA_MS = 1000;
export const SEM_RESPOSTA_MS = 10_000;

// O que o batimento precisa do WebSocket (o do `ws` serve).
export interface Pulsante {
  ping(): void;
  terminate(): void;
  on(evento: 'pong', ouvir: () => void): unknown;
}

// Começa a bater; devolve a função que para (chame quando a conexão fechar).
export function vigiarConexao(
  socket: Pulsante,
  aoMedir: (idaEVoltaMs: number) => void,
  { batidaMs = BATIDA_MS, semRespostaMs = SEM_RESPOSTA_MS } = {},
): () => void {
  let enviadoEm: number | null = null; // o ping esperando resposta
  let ultimaResposta = Date.now();
  socket.on('pong', () => {
    const agora = Date.now();
    ultimaResposta = agora;
    if (enviadoEm !== null) aoMedir(agora - enviadoEm);
    enviadoEm = null;
  });
  const timer = setInterval(() => {
    const agora = Date.now();
    if (agora - ultimaResposta > semRespostaMs) {
      clearInterval(timer);
      socket.terminate();
      return;
    }
    // Um ping de cada vez: a resposta é sempre deste.
    if (enviadoEm !== null) return;
    enviadoEm = agora;
    try {
      socket.ping();
    } catch {
      // fechando: o 'close' da conexão para o batimento
    }
  }, batidaMs);
  return () => clearInterval(timer);
}
