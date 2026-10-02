import { describe, expect, it } from 'vitest';
import { Salas } from '../src/partida/salas';
import { criarTurn, soTurn } from '../src/partida/turn';

// A resposta do Cloudflare, no formato do painel.
const RESPOSTA = {
  iceServers: [
    {
      urls: [
        'stun:stun.cloudflare.com:3478',
        'turn:turn.cloudflare.com:3478?transport=udp',
        'turn:turn.cloudflare.com:3478?transport=tcp',
        'turns:turn.cloudflare.com:5349?transport=tcp',
        'turn:turn.cloudflare.com:53?transport=udp',
      ],
      username: 'u',
      credential: 'c',
    },
  ],
};

function conexaoFalsa() {
  const recebidas: unknown[] = [];
  return { recebidas, conexao: { send: (d: string) => recebidas.push(JSON.parse(d)), close: () => undefined } };
}

describe('TURN do Cloudflare', () => {
  it('fica só com os TURN, sem o STUN e sem a porta 53', () => {
    expect(soTurn(RESPOSTA)).toEqual([
      {
        urls: [
          'turn:turn.cloudflare.com:3478?transport=udp',
          'turn:turn.cloudflare.com:3478?transport=tcp',
          'turns:turn.cloudflare.com:5349?transport=tcp',
        ],
        username: 'u',
        credential: 'c',
      },
    ]);
    expect(soTurn({ iceServers: RESPOSTA.iceServers[0] })).toHaveLength(1);
    expect(soTurn({})).toBeNull();
  });

  it('pede as credenciais com a chave e as entrega', async () => {
    let pedido: { url: string; init?: RequestInit } | null = null;
    const buscar = (async (url: string, init?: RequestInit) => {
      pedido = { url, init };
      return new Response(JSON.stringify(RESPOSTA), { status: 201 });
    }) as typeof fetch;
    const turn = criarTurn({ id: 'k1', token: 't1' }, { buscar });
    await new Promise((r) => setTimeout(r, 0));
    expect(pedido!.url).toBe('https://rtc.live.cloudflare.com/v1/turn/keys/k1/credentials/generate-ice-servers');
    expect((pedido!.init?.headers as Record<string, string>).authorization).toBe('Bearer t1');
    expect(turn.servidores()?.[0].username).toBe('u');
    turn.parar();
  });

  it('sem a chave, ou com o Cloudflare fora, não manda nada', async () => {
    expect(criarTurn(null).servidores()).toBeNull();
    const avisos: unknown[] = [];
    const turn = criarTurn(
      { id: 'k', token: 't' },
      { buscar: (async () => new Response('', { status: 500 })) as typeof fetch, registro: { warn: (o) => avisos.push(o) } },
    );
    await new Promise((r) => setTimeout(r, 0));
    expect(turn.servidores()).toBeNull();
    expect(avisos).toHaveLength(1);
    turn.parar();
  });

  it('a sala manda os servidores TURN junto com a escolha', () => {
    const ice = soTurn(RESPOSTA);
    const salas = new Salas({ gerarCodigo: () => 'K7P2Q', ice: () => ice });
    const a = conexaoFalsa();
    const b = conexaoFalsa();
    const ana = salas.criar('Ana', a.conexao);
    const bia = salas.entrar('K7P2Q', 'Bia', b.conexao);
    expect(a.recebidas.at(-1)).toMatchObject({ tipo: 'escolher', direto: true, internet: true, ice });
    expect(b.recebidas.at(-1)).toMatchObject({ tipo: 'escolher', direto: true, internet: true, ice });
    if (ana) salas.sair(ana);
    if (bia) salas.sair(bia);
  });
});
