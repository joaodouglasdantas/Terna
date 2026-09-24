import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';

// Hash de senha com scrypt (vem no Node, sem dependência nativa para compilar no Windows).
// Formato guardado: scrypt$N$r$p$sal$hash, então dá para subir o custo no futuro sem
// invalidar as senhas antigas.
const PARAMETROS = { N: 16384, r: 8, p: 1 };
const TAMANHO = 64;

function derivar(senha: string, sal: Buffer, opcoes: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(senha.normalize('NFKC'), sal, TAMANHO, { ...opcoes, maxmem: 64 * 1024 * 1024 }, (erro, chave) =>
      erro ? reject(erro) : resolve(chave),
    );
  });
}

export async function gerarHashSenha(senha: string): Promise<string> {
  const sal = randomBytes(16);
  const hash = await derivar(senha, sal, PARAMETROS);
  const { N, r, p } = PARAMETROS;
  return ['scrypt', N, r, p, sal.toString('base64'), hash.toString('base64')].join('$');
}

export async function conferirSenha(senha: string, guardado: string): Promise<boolean> {
  const [algoritmo, N, r, p, sal, hash] = guardado.split('$');
  if (algoritmo !== 'scrypt' || !sal || !hash) return false;
  const esperado = Buffer.from(hash, 'base64');
  const obtido = await derivar(senha, Buffer.from(sal, 'base64'), { N: Number(N), r: Number(r), p: Number(p) });
  return obtido.length === esperado.length && timingSafeEqual(obtido, esperado);
}

// Para quem tenta entrar com um nome que não existe levar o mesmo tempo de quem erra a
// senha (não dá para descobrir quais nomes existem pelo tempo de resposta).
let hashFalso: Promise<string> | null = null;
export async function gastarTempoComoSeConferisse(senha: string): Promise<void> {
  hashFalso ??= gerarHashSenha('senha-que-nao-existe');
  await conferirSenha(senha, await hashFalso);
}
