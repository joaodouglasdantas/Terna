// O fantasma do seu personagem, online: ele onde o outro jogador o via. É o que os poderes e os
// golpes do outro conferem aqui, para o dano que ele viu acertar na tela dele contar de verdade.
//
// O porquê: cada um confere o que acerta o próprio personagem (efeitos.ts), mas o golpe do outro
// sai lá, na tela dele, contra o boneco que ele vê de você — e esse boneco anda um pouco atrás de
// você. Na horizontal, quase nada (o boneco é adiantado pela velocidade, e a correção suaviza uns
// 0,06 s); na vertical, a viagem inteira (o pulo só começa lá quando o botão chega). E o golpe só
// chega aqui depois da viagem. Conferido contra você agora, o golpe que ele viu pegar errava: era
// o dano que não contava. Conferido contra o fantasma — você uns tantos milissegundos atrás, os
// mesmos que ele via —, conta.
//
// O fantasma lê a posição (x, y, a velocidade na vertical, se está no chão) de um histórico curto
// do seu personagem; todo o resto (a vida, o veneno, as raízes, o empurrão, a defesa do golem…) é
// o seu personagem mesmo: o que o golpe faz com o fantasma acontece com você. Carregado pelas
// águias, a posição é a de agora (são elas que mandam no corpo). O atraso tem um teto: com a rede
// muito lenta, quem desvia ainda escapa.

import { CORPO_REAL } from './efeitos';
import type { Personagem } from './personagem';

// Quanto a correção do boneco do outro atrasa a posição na horizontal (partida.ts: CORRIGIR = 18
// por segundo, ~0,06 s) e quanto o estado espera para sair depois de um botão (ENVIO_MINIMO_MS).
const SUAVIZACAO = 0.06;
const SAIDA_DO_ESTADO = 0.03;
// Tetos do atraso (s): na horizontal e na vertical.
const MAXIMO = { x: 0.3, y: 0.4 };
const GUARDA = 0.6; // segundos de histórico

interface Amostra {
  t: number; // segundos (performance.now)
  x: number;
  y: number;
  vy: number;
  noChao: boolean;
}

const POSICAO = new Set<PropertyKey>(['x', 'y', 'vy', 'noChao']);

export interface Fantasma {
  // O corpo que os golpes do outro conferem (o mesmo objeto a partida inteira).
  corpo: Personagem;
  // Guarda onde o seu personagem está agora (uma vez por passo da partida).
  gravar(agora: number): void;
  // A viagem de um estado entre vocês dois (s): daí sai o atraso do fantasma.
  ajustar(viagem: number): void;
  // O atraso de agora, em segundos (para os testes e a tela).
  atraso(): { x: number; y: number };
}

export function criarFantasma(real: Personagem): Fantasma {
  const historico: Amostra[] = [];
  let atraso = { x: 0, y: 0 };
  let agora = 0;

  // A posição no instante `t`, entre as duas amostras em volta (a mais velha, se for antes delas).
  const em = (t: number): Amostra | null => {
    if (!historico.length) return null;
    if (t >= historico[historico.length - 1].t) return historico[historico.length - 1];
    for (let i = historico.length - 1; i > 0; i--) {
      const a = historico[i - 1];
      const b = historico[i];
      if (t < a.t) continue;
      const k = b.t > a.t ? (t - a.t) / (b.t - a.t) : 1;
      return { t, x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, vy: a.vy, noChao: a.noChao };
    }
    return historico[0];
  };

  const passado = (chave: PropertyKey): unknown => {
    // Carregado pelas águias: são elas que mandam no corpo, e ele está onde está.
    if (real.levado > 0) return undefined;
    const amostra = em(agora - (chave === 'x' ? atraso.x : atraso.y));
    return amostra ? amostra[chave as keyof Amostra] : undefined;
  };

  const corpo = new Proxy(real, {
    get(alvo, chave) {
      if (chave === CORPO_REAL) return alvo;
      if (POSICAO.has(chave)) {
        const valor = passado(chave);
        if (valor !== undefined) return valor;
      }
      return Reflect.get(alvo, chave);
    },
    // O que o golpe muda (a vida, o empurrão, a posição quando as águias levam) é no corpo de verdade.
    set(alvo, chave, valor) {
      return Reflect.set(alvo, chave, valor);
    },
  });

  return {
    corpo,
    gravar(t) {
      agora = t;
      historico.push({ t, x: real.x, y: real.y, vy: real.vy, noChao: real.noChao });
      while (historico.length > 2 && historico[1].t < t - GUARDA) historico.shift();
    },
    ajustar(viagem) {
      const v = Math.max(0, viagem);
      atraso = {
        x: Math.min(MAXIMO.x, v + SUAVIZACAO),
        y: Math.min(MAXIMO.y, 2 * v + SAIDA_DO_ESTADO),
      };
    },
    atraso: () => ({ ...atraso }),
  };
}
