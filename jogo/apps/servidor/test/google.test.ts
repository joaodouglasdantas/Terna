import { generateKeyPairSync, sign, type KeyObject } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { conferidorGoogle, sugerirNome, type IdentidadeGoogle } from '../src/auth/google';
import type { ConexaoBanco } from '../src/banco/conexao';
import { jogadores } from '../src/banco/schema';
import { criarConta, emailDe, novoServidor } from './ajuda';

const CLIENT_ID = 'teste.apps.googleusercontent.com';
const AGORA = 1_800_000_000_000; // ms

// Um par de chaves como as do Google, com o JWKS público e um assinador de tokens.
function chaveDoGoogle(kid: string): { jwk: Record<string, unknown>; privada: KeyObject } {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  return { jwk: { ...publicKey.export({ format: 'jwk' }), kid, alg: 'RS256', use: 'sig' }, privada: privateKey };
}

const b64 = (valor: unknown): string => Buffer.from(JSON.stringify(valor)).toString('base64url');

function token(privada: KeyObject, kid: string, corpo: Record<string, unknown>): string {
  const cabeca = b64({ alg: 'RS256', kid, typ: 'JWT' });
  const meio = b64(corpo);
  return `${cabeca}.${meio}.${sign('RSA-SHA256', Buffer.from(`${cabeca}.${meio}`), privada).toString('base64url')}`;
}

const corpoBom = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  iss: 'https://accounts.google.com',
  aud: CLIENT_ID,
  sub: '1234567890',
  email: 'Maria@Gmail.com',
  email_verified: true,
  name: 'Maria da Silva',
  iat: AGORA / 1000 - 10,
  exp: AGORA / 1000 + 3600,
  ...extra,
});

describe('conferir o token do Google', () => {
  const a = chaveDoGoogle('chave-a');
  const b = chaveDoGoogle('chave-b');
  let publicadas = [a.jwk];
  let buscas = 0;
  let agora = AGORA;
  const buscar = (async () => {
    buscas++;
    return new Response(JSON.stringify({ keys: publicadas }), { headers: { 'cache-control': 'public, max-age=3600' } });
  }) as typeof fetch;
  const conferir = conferidorGoogle(CLIENT_ID, { buscar, agora: () => agora });

  it('aceita o token certo e devolve a conta (e-mail em minúsculas)', async () => {
    expect(await conferir(token(a.privada, 'chave-a', corpoBom()))).toEqual({ sub: '1234567890', email: 'maria@gmail.com', nome: 'Maria da Silva' });
  });

  it('recusa outro jogo, vencido, e-mail não verificado, outro emissor e assinatura falsa', async () => {
    expect(await conferir(token(a.privada, 'chave-a', corpoBom({ aud: 'outro-jogo' })))).toBeNull();
    expect(await conferir(token(a.privada, 'chave-a', corpoBom({ exp: AGORA / 1000 - 3600 })))).toBeNull();
    expect(await conferir(token(a.privada, 'chave-a', corpoBom({ email_verified: false })))).toBeNull();
    expect(await conferir(token(a.privada, 'chave-a', corpoBom({ iss: 'https://mal.example' })))).toBeNull();
    // Assinado com outra chave, mas dizendo que é a "chave-a".
    expect(await conferir(token(b.privada, 'chave-a', corpoBom()))).toBeNull();
    expect(await conferir('isso.nao.e-um-token')).toBeNull();
  });

  it('guarda as chaves e busca de novo quando o Google troca', async () => {
    const antes = buscas;
    await conferir(token(a.privada, 'chave-a', corpoBom()));
    expect(buscas).toBe(antes); // ainda valem

    publicadas = [a.jwk, b.jwk];
    agora += 2 * 60_000; // passou o minuto mínimo entre buscas
    expect(await conferir(token(b.privada, 'chave-b', corpoBom()))).not.toBeNull();
    expect(buscas).toBe(antes + 1);
  });
});

describe('sugerir o nome de jogador', () => {
  it('tira do nome da conta Google', () => {
    expect(sugerirNome('Maria da Silva', 'm@x.com')).toBe('MariaDaSilva');
    expect(sugerirNome('João Pedro Albuquerque', 'j@x.com')).toBe('JoãoPedroAlb');
    expect(sugerirNome('', 'zeca.dev@gmail.com')).toBe('zecaDev');
    expect(sugerirNome('Li', 'li@x.com')).toBe('Jogador');
  });
});

describe('POST /sessoes/google', () => {
  let app: FastifyInstance;
  let conexao: ConexaoBanco;
  // O Google de mentira: a "credencial" é o nome de uma conta daqui.
  const contas: Record<string, IdentidadeGoogle> = {
    'cred-ana-google-123456': { sub: 'g-ana', email: 'ana@gmail.com', nome: 'Ana Clara' },
    'cred-bia-google-123456': { sub: 'g-bia', email: emailDe('BiaSenha'), nome: 'Bia' },
    'cred-caio-google-12345': { sub: 'g-caio', email: 'caio@exemplo.com', nome: 'Caio' },
    'cred-dani-google-12345': { sub: 'g-dani', email: 'dani@gmail.com', nome: 'Ana Clara' },
  };
  const entrar = (credencial: string, nome?: string) =>
    app.inject({ method: 'POST', url: '/api/sessoes/google', payload: nome ? { credencial, nome } : { credencial } });

  beforeAll(async () => {
    ({ app, conexao } = await novoServidor({ conferirGoogle: async (c) => contas[c] ?? null }));
  });
  afterAll(async () => {
    await app.close();
    await conexao.fechar();
  });

  it('desligado sem o Client ID', async () => {
    const { app: sem, conexao: c } = await novoServidor();
    const r = await sem.inject({ method: 'POST', url: '/api/sessoes/google', payload: { credencial: 'cred-ana-google-123456' } });
    expect(r.statusCode).toBe(503);
    await sem.close();
    await c.fechar();
  });

  it('recusa o token que o Google não confirma', async () => {
    expect((await entrar('cred-de-ninguem-12345')).statusCode).toBe(401);
  });

  it('conta nova: pede o nome, cria, e da próxima vez só entra', async () => {
    const pedido = await entrar('cred-ana-google-123456');
    expect(pedido.statusCode).toBe(200);
    expect(pedido.json()).toEqual({ precisaDeNome: true, sugestao: 'AnaClara', email: 'ana@gmail.com' });

    const criada = await entrar('cred-ana-google-123456', 'AnaClara');
    expect(criada.statusCode).toBe(201);
    const { jogador, token } = criada.json();
    expect(jogador.nome).toBe('AnaClara');
    expect(jogador.primeiraTrocaDeNome).toBe(true);
    const eu = await app.inject({ method: 'GET', url: '/api/eu', headers: { authorization: `Bearer ${token}` } });
    expect(eu.json().id).toBe(jogador.id);

    const [linha] = await conexao.banco.select().from(jogadores).where(eq(jogadores.id, jogador.id));
    expect(linha.emailConfirmadoEm).not.toBeNull();
    expect(linha.googleId).toBe('g-ana');

    const deNovo = await entrar('cred-ana-google-123456');
    expect(deNovo.statusCode).toBe(200);
    expect(deNovo.json().jogador.id).toBe(jogador.id);
  });

  it('o nome da conta nova não pode ser de outro', async () => {
    const r = await entrar('cred-dani-google-12345', 'anaclara');
    expect(r.statusCode).toBe(409);
    expect(r.json().erro).toBe('esse nome já está em uso');
  });

  it('liga a conta Google à conta de e-mail e senha que já existia (e a senha continua valendo)', async () => {
    await criarConta(app, 'BiaSenha', 'senha-da-bia-1');
    const r = await entrar('cred-bia-google-123456');
    expect(r.statusCode).toBe(200);
    expect(r.json().jogador.nome).toBe('BiaSenha');
    const comSenha = await app.inject({ method: 'POST', url: '/api/sessoes', payload: { login: emailDe('BiaSenha'), senha: 'senha-da-bia-1' } });
    expect(comSenha.statusCode).toBe(200);
    expect(comSenha.json().jogador.id).toBe(r.json().jogador.id);
  });

  it('cadastro pela metade com o e-mail: quem o começou perde a senha, o dono do e-mail entra', async () => {
    const cadastro = await app.inject({
      method: 'POST',
      url: '/api/contas',
      payload: { nome: 'Intruso', email: 'caio@exemplo.com', senha: 'senha-do-intruso' },
    });
    expect(cadastro.statusCode).toBe(201);
    const r = await entrar('cred-caio-google-12345');
    expect(r.statusCode).toBe(200);
    const intruso = await app.inject({ method: 'POST', url: '/api/sessoes', payload: { login: 'caio@exemplo.com', senha: 'senha-do-intruso' } });
    expect(intruso.statusCode).toBe(401);
  });
});
