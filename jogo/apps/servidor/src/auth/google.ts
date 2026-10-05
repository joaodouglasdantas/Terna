// Entrar com o Google. Duas provas servem, e as duas são conferidas com o Google:
// - o `acesso` (access token) que a janelinha do Google devolve ao botão do jogo: o servidor pergunta
//   ao próprio Google (tokeninfo) de que app ele é — tem que ser do Terna (`aud` = o Client ID), não
//   vencido e com o e-mail verificado — e pega o nome da conta (userinfo);
// - a `credencial` (ID token, um JWT assinado pelo Google) do botão pronto do Google, conferida
//   aqui sem biblioteca nova, só com o crypto do Node:
// - a assinatura (RS256) bate com uma das chaves públicas do Google (o JWKS, guardado pelo tempo
//   que o Google manda no Cache-Control; uma chave desconhecida busca de novo, no máximo a cada
//   minuto);
// - foi emitido pelo Google (`iss`) para o NOSSO jogo (`aud` = o Client ID) e não venceu (`exp`);
// - o e-mail foi verificado pelo Google (`email_verified`).
// Só então devolve quem é: o `sub` (o id fixo da conta Google), o e-mail e o nome.

import { createPublicKey, verify, type JsonWebKey, type KeyObject } from 'node:crypto';

export interface IdentidadeGoogle {
  sub: string;
  email: string; // em minúsculas
  nome: string; // o nome da conta Google (pode vir vazio)
}

// Confere a prova; null se não for de uma conta Google para este jogo.
export interface ProvaGoogle {
  credencial?: string;
  acesso?: string;
}
export type ConferirGoogle = (prova: ProvaGoogle) => Promise<IdentidadeGoogle | null>;

const ENDERECO_DAS_CHAVES = 'https://www.googleapis.com/oauth2/v3/certs';
const ENDERECO_DO_TOKENINFO = 'https://oauth2.googleapis.com/tokeninfo';
const ENDERECO_DO_USERINFO = 'https://openidconnect.googleapis.com/v1/userinfo';
const EMISSORES = new Set(['accounts.google.com', 'https://accounts.google.com']);
const FOLGA_S = 60; // diferença aceita entre o relógio do servidor e o do Google
const BUSCA_MINIMA_MS = 60_000; // chave desconhecida: no máximo uma busca por minuto

interface Chaves {
  porId: Map<string, KeyObject>;
  ate: number; // até quando valem (ms)
  buscadoEm: number;
}

const base64url = (texto: string): Buffer => Buffer.from(texto, 'base64url');

function lerJson(parte: string): Record<string, unknown> | null {
  try {
    const valor: unknown = JSON.parse(base64url(parte).toString('utf8'));
    return valor && typeof valor === 'object' ? (valor as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

// `buscar`: o fetch (os testes trocam por um que devolve chaves de mentira). `agora` em ms.
export function conferidorGoogle(
  clientId: string,
  opcoes: { buscar?: typeof fetch; agora?: () => number } = {},
): ConferirGoogle {
  const buscar = opcoes.buscar ?? fetch;
  const agora = opcoes.agora ?? Date.now;
  let chaves: Chaves | null = null;
  let buscando: Promise<Chaves | null> | null = null;

  const buscarChaves = (): Promise<Chaves | null> => {
    buscando ??= (async () => {
      try {
        const resposta = await buscar(ENDERECO_DAS_CHAVES);
        if (!resposta.ok) return chaves;
        const corpo = (await resposta.json()) as { keys?: (JsonWebKey & { kid?: string })[] };
        const porId = new Map<string, KeyObject>();
        for (const jwk of corpo.keys ?? []) {
          if (jwk.kid && jwk.kty === 'RSA') porId.set(jwk.kid, createPublicKey({ key: jwk, format: 'jwk' }));
        }
        const idade = /max-age=(\d+)/.exec(resposta.headers.get('cache-control') ?? '');
        const segundos = idade ? Number(idade[1]) : 3600;
        chaves = { porId, ate: agora() + segundos * 1000, buscadoEm: agora() };
        return chaves;
      } catch {
        return chaves; // sem rede agora: fica com as que tinha
      } finally {
        buscando = null;
      }
    })();
    return buscando;
  };

  const chave = async (kid: string): Promise<KeyObject | null> => {
    if (!chaves || agora() >= chaves.ate) await buscarChaves();
    const achada = chaves?.porId.get(kid);
    if (achada) return achada;
    // O Google troca as chaves de tempos em tempos: uma desconhecida busca de novo (sem martelar).
    if (!chaves || agora() - chaves.buscadoEm >= BUSCA_MINIMA_MS) await buscarChaves();
    return chaves?.porId.get(kid) ?? null;
  };

  // O acesso da janelinha: o Google diz de que app é e de quem é.
  const conferirAcesso = async (acesso: string): Promise<IdentidadeGoogle | null> => {
    try {
      const resposta = await buscar(`${ENDERECO_DO_TOKENINFO}?access_token=${encodeURIComponent(acesso)}`);
      if (!resposta.ok) return null;
      const info = (await resposta.json()) as Record<string, unknown>;
      if (info.aud !== clientId) return null; // um acesso de outro app não entra aqui
      if (info.azp !== undefined && info.azp !== clientId) return null;
      if (Number(info.expires_in ?? 0) <= 0) return null;
      if (typeof info.sub !== 'string' || !info.sub) return null;
      if (typeof info.email !== 'string' || !(info.email_verified === true || info.email_verified === 'true')) return null;
      // O nome não vem no tokeninfo: vem do userinfo (sem ele, a sugestão sai do e-mail).
      let nome = '';
      try {
        const perfil = await buscar(ENDERECO_DO_USERINFO, { headers: { authorization: `Bearer ${acesso}` } });
        if (perfil.ok) {
          const dados = (await perfil.json()) as Record<string, unknown>;
          if (dados.sub === info.sub && typeof dados.name === 'string') nome = dados.name;
        }
      } catch {
        // fica sem o nome
      }
      return { sub: info.sub, email: info.email.trim().toLowerCase(), nome };
    } catch {
      return null;
    }
  };

  return async ({ credencial, acesso }) => {
    if (acesso) return conferirAcesso(acesso);
    if (!credencial) return null;
    const partes = credencial.split('.');
    if (partes.length !== 3) return null;
    const [cabecaB64, corpoB64, assinaturaB64] = partes;
    const cabeca = lerJson(cabecaB64);
    const corpo = lerJson(corpoB64);
    if (!cabeca || !corpo || cabeca.alg !== 'RS256' || typeof cabeca.kid !== 'string') return null;

    const publica = await chave(cabeca.kid);
    if (!publica) return null;
    const assinada = Buffer.from(`${cabecaB64}.${corpoB64}`);
    if (!verify('RSA-SHA256', assinada, publica, base64url(assinaturaB64))) return null;

    const s = agora() / 1000;
    if (typeof corpo.iss !== 'string' || !EMISSORES.has(corpo.iss)) return null;
    if (corpo.aud !== clientId) return null;
    if (typeof corpo.exp !== 'number' || corpo.exp + FOLGA_S < s) return null;
    if (typeof corpo.iat === 'number' && corpo.iat - FOLGA_S > s) return null;
    if (typeof corpo.sub !== 'string' || !corpo.sub) return null;
    if (typeof corpo.email !== 'string' || corpo.email_verified !== true) return null;
    return {
      sub: corpo.sub,
      email: corpo.email.trim().toLowerCase(),
      nome: typeof corpo.name === 'string' ? corpo.name : '',
    };
  };
}

// Um nome de jogador a partir do nome da conta Google: só letras, números, _ e -, de 3 a 12
// (NomeJogador). "Maria da Silva" → "MariaDaSilva"; sem nada que sirva, "Jogador".
export function sugerirNome(nomeGoogle: string, email: string): string {
  const palavras = (nomeGoogle || email.split('@')[0] || '')
    .normalize('NFKC')
    .split(/[^\p{L}\p{N}_-]+/u)
    .filter(Boolean);
  const junto = palavras.map((p, i) => (i === 0 ? p : p.charAt(0).toUpperCase() + p.slice(1))).join('');
  const nome = [...junto].slice(0, 12).join('');
  return nome.length >= 3 ? nome : 'Jogador';
}
