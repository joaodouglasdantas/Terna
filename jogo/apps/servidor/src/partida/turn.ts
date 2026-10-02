// As credenciais do TURN do Cloudflare: o servidor de retransmissão que salva a partida quando
// a ligação direta entre os dois não abre (o NAT da operadora, comum no 4G, não deixa). Sem ele,
// tudo ia até o servidor do jogo nos EUA e voltava (ping de 300 ms); com ele, passa por um
// servidor do Cloudflare perto dos dois (no Brasil, para quem está no Brasil).
//
// A chave (TURN_KEY_ID e TURN_KEY_API_TOKEN, do painel do Cloudflare) fica só aqui no servidor;
// os jogadores recebem credenciais que vencem sozinhas (VALIDADE_S), pedidas de novo bem antes
// de vencer. Sem a chave, ou com o Cloudflare fora do ar, o jogo segue como antes (só o STUN).

import type { ServidorIce } from '@terna/compartilhado';

const VALIDADE_S = 24 * 60 * 60; // as credenciais valem um dia…
const RENOVAR_MS = 12 * 60 * 60 * 1000; // …e são renovadas na metade
const TENTAR_DE_NOVO_MS = 5 * 60 * 1000; // deu errado: tenta de novo daqui a pouco

export interface Turn {
  // Os servidores TURN para mandar aos jogadores agora (null: ainda não tem, ou sem a chave).
  servidores(): ServidorIce[] | null;
  parar(): void;
}

interface Registro {
  warn(objeto: unknown, mensagem?: string): void;
}

export function criarTurn(
  chave: { id: string; token: string } | null,
  { buscar = fetch, registro }: { buscar?: typeof fetch; registro?: Registro } = {},
): Turn {
  let atuais: ServidorIce[] | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let parado = false;
  if (!chave) return { servidores: () => null, parar: () => undefined };

  const agendar = (ms: number): void => {
    if (parado) return;
    timer = setTimeout(() => void renovar(), ms);
    timer.unref?.();
  };
  const renovar = async (): Promise<void> => {
    try {
      const resposta = await buscar(`https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(chave.id)}/credentials/generate-ice-servers`, {
        method: 'POST',
        headers: { authorization: `Bearer ${chave.token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ ttl: VALIDADE_S }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!resposta.ok) throw new Error(`Cloudflare respondeu ${resposta.status}`);
      atuais = soTurn((await resposta.json()) as { iceServers?: unknown });
      agendar(RENOVAR_MS);
    } catch (erro) {
      registro?.warn({ erro: String(erro) }, 'não consegui as credenciais do TURN');
      agendar(TENTAR_DE_NOVO_MS);
    }
  };
  void renovar();
  return {
    servidores: () => atuais,
    parar() {
      parado = true;
      if (timer) clearTimeout(timer);
    },
  };
}

// Da resposta do Cloudflare, só os TURN (o STUN o jogo já tem). As URLs na porta 53 ficam de
// fora: os navegadores bloqueiam essa porta, e tentar nela só atrasa a ligação.
export function soTurn(resposta: { iceServers?: unknown }): ServidorIce[] | null {
  const lista = Array.isArray(resposta.iceServers) ? resposta.iceServers : resposta.iceServers ? [resposta.iceServers] : [];
  const turn: ServidorIce[] = [];
  for (const item of lista as { urls?: unknown; username?: unknown; credential?: unknown }[]) {
    if (typeof item?.username !== 'string' || typeof item.credential !== 'string') continue;
    const urls = (Array.isArray(item.urls) ? item.urls : [item.urls]).filter(
      (u): u is string => typeof u === 'string' && /^turns?:/.test(u) && !/:53(\?|$)/.test(u),
    );
    if (urls.length) turn.push({ urls: urls.slice(0, 8), username: item.username, credential: item.credential });
  }
  return turn.length ? turn.slice(0, 8) : null;
}
