import {
  ConfirmarEmail,
  CriarConta,
  ERRO_EMAIL_NAO_CONFIRMADO,
  Entrar,
  ModoMestre,
  PedirCodigo,
  TrocarIcone,
  TrocarNome,
  TrocarSenha,
} from '@terna/compartilhado';
import { and, eq, ne, or } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply } from 'fastify';
import {
  ERRO_DO_CODIGO,
  ESPERA_REENVIO_S,
  apagarCodigo,
  conferirCodigo,
  esperaParaReenviar,
  novoCodigo,
  type MotivoCodigo,
} from '../auth/codigos';
import { conferirSenha, gastarTempoComoSeConferisse, gerarHashSenha } from '../auth/senha';
import { criarSessao, encerrarSessao, tokenDoCabecalho } from '../auth/sessoes';
import type { Banco } from '../banco/conexao';
import { jogadores, sessoes } from '../banco/schema';
import type { Correio } from '../email/correio';
import { emailDoCodigo } from '../email/modelos';
import { ehDono, exigirJogador, jogadorPublico, nomeLivreEm, validar } from '../http';

// Contas e sessões. Criar conta é em duas etapas: o cadastro (nome, e-mail e senha) manda um
// código de 6 números para o e-mail, e a conta só entra depois de o código voltar
// (/contas/confirmar), que já abre a sessão. Esqueceu a senha: um código no e-mail troca a senha.
//
//   POST /contas            { nome, email, senha }   → 201 { email, reenviarEm }
//   POST /contas/confirmar  { email, codigo }        → 200 sessão
//   POST /contas/reenviar   { email }                → 200 { email, reenviarEm }
//   POST /sessoes           { login, senha }         → 200 sessão (403 sem o e-mail confirmado)
//   POST /senha/esqueci     { email }                → 200 { email, reenviarEm }
//   POST /senha/trocar      { email, codigo, senha } → 200 sessão
//   DELETE /sessoes, GET /eu
//   PUT /eu/nome    { nome }    → 200 jogador (409: o nome é de outro, ou o prazo de trocar não
//                                 passou — DIAS_ENTRE_TROCAS_DE_NOME, menos para o mestre)
//   PUT /eu/icone   { icone }   → 200 jogador
//   PUT /eu/mestre  { ligado }  → 200 jogador (só a conta dona; 403 para as outras)
//   GET /teste/codigo?email=...  → { codigo } — só com `codigosNaTela` (o servidor em casa, sem
//                                  e-mail de verdade): a tela do código mostra o código

export interface OpcoesContas {
  diasSessao: number;
  tentativasPorMinuto: number;
  correio: Correio;
  urlDoJogo: string;
  // Os e-mails das contas mestre (em minúsculas).
  mestres?: ReadonlySet<string>;
  // Liga /teste/codigo: só no servidor em casa (PGlite) e sem o Brevo. Nunca em produção.
  codigosNaTela?: boolean;
}

type Jogador = typeof jogadores.$inferSelect;

export function rotasContas(app: FastifyInstance, banco: Banco, opcoes: OpcoesContas): void {
  const { diasSessao, tentativasPorMinuto, correio, urlDoJogo, mestres = new Set<string>(), codigosNaTela = false } = opcoes;
  const publico = (jogador: Jogador) => jogadorPublico(jogador, mestres);
  // Poucas tentativas por minuto, por IP: segura quem tenta adivinhar senha ou código e quem
  // quer usar o jogo para encher a caixa de e-mail dos outros.
  const LIMITE = { config: { rateLimit: { max: tentativasPorMinuto, timeWindow: '1 minute' } } };

  const sessaoDe = async (jogador: Jogador) => {
    const sessao = await criarSessao(banco, jogador.id, diasSessao);
    return { token: sessao.token, expiraEm: sessao.expiraEm.toISOString(), jogador: publico(jogador) };
  };

  // Manda um código novo, se já passou o tempo desde o último (senão, não manda: o de antes
  // continua valendo). Devolve em quantos segundos dá para pedir outro. O e-mail não saindo, o
  // código é apagado (dá para pedir outro na hora) e o erro sobe.
  const mandarCodigo = async (jogador: Jogador, motivo: MotivoCodigo): Promise<number> => {
    const espera = await esperaParaReenviar(banco, jogador.id, motivo);
    if (espera > 0) return espera;
    const codigo = await novoCodigo(banco, jogador.id, motivo);
    const email = emailDoCodigo({ nome: jogador.nome, codigo, motivo, urlDoJogo });
    try {
      await correio.enviar({ para: jogador.email ?? '', nomePara: jogador.nome, codigo, ...email });
    } catch (erro) {
      await apagarCodigo(banco, jogador.id, motivo);
      throw erro;
    }
    return ESPERA_REENVIO_S;
  };

  // O e-mail não saiu: avisa com um erro que a pessoa entende (o detalhe vai para o log).
  const falhaNoEnvio = (reply: FastifyReply, erro: unknown) => {
    reply.log.error({ erro }, 'não consegui mandar o e-mail do código');
    return reply.code(502).send({ erro: 'não conseguimos mandar o e-mail agora; tente de novo em instantes' });
  };

  const porEmail = async (email: string): Promise<Jogador | undefined> =>
    (await banco.select().from(jogadores).where(eq(jogadores.email, email)).limit(1))[0];

  app.post('/contas', LIMITE, async (request, reply) => {
    const dados = validar(CriarConta, request.body, reply);
    if (!dados) return;
    const nomeNormalizado = dados.nome.toLowerCase();
    const existente = await porEmail(dados.email);
    if (existente?.emailConfirmadoEm) return reply.code(409).send({ erro: 'esse e-mail já tem conta: entre com a senha' });

    // O nome não pode ser de outra conta (o cadastro pela metade com este mesmo e-mail não conta:
    // é a mesma pessoa tentando de novo).
    const [outro] = await banco
      .select({ id: jogadores.id })
      .from(jogadores)
      .where(
        existente
          ? and(eq(jogadores.nomeNormalizado, nomeNormalizado), ne(jogadores.id, existente.id))
          : eq(jogadores.nomeNormalizado, nomeNormalizado),
      )
      .limit(1);
    if (outro) return reply.code(409).send({ erro: 'esse nome já está em uso' });

    const senhaHash = await gerarHashSenha(dados.senha);
    // Cadastrou de novo sem ter confirmado: atualiza o nome e a senha do cadastro que esperava.
    const [jogador] = existente
      ? await banco.update(jogadores).set({ nome: dados.nome, nomeNormalizado, senhaHash }).where(eq(jogadores.id, existente.id)).returning()
      : await banco.insert(jogadores).values({ nome: dados.nome, nomeNormalizado, email: dados.email, senhaHash }).returning();
    try {
      const reenviarEm = await mandarCodigo(jogador, 'confirmar');
      return reply.code(201).send({ email: dados.email, reenviarEm });
    } catch (erro) {
      return falhaNoEnvio(reply, erro);
    }
  });

  app.post('/contas/confirmar', LIMITE, async (request, reply) => {
    const dados = validar(ConfirmarEmail, request.body, reply);
    if (!dados) return;
    const jogador = await porEmail(dados.email);
    if (!jogador) return reply.code(404).send({ erro: 'não achamos cadastro com esse e-mail' });
    if (jogador.emailConfirmadoEm) return reply.code(409).send({ erro: 'esse e-mail já foi confirmado: entre com a senha' });
    const conferencia = await conferirCodigo(banco, jogador.id, 'confirmar', dados.codigo);
    if (conferencia !== 'certo') return reply.code(400).send({ erro: ERRO_DO_CODIGO[conferencia] });
    const [confirmado] = await banco.update(jogadores).set({ emailConfirmadoEm: new Date() }).where(eq(jogadores.id, jogador.id)).returning();
    return reply.send(await sessaoDe(confirmado));
  });

  app.post('/contas/reenviar', LIMITE, async (request, reply) => {
    const dados = validar(PedirCodigo, request.body, reply);
    if (!dados) return;
    const jogador = await porEmail(dados.email);
    if (!jogador) return reply.code(404).send({ erro: 'não achamos cadastro com esse e-mail' });
    if (jogador.emailConfirmadoEm) return reply.code(409).send({ erro: 'esse e-mail já foi confirmado: entre com a senha' });
    try {
      return reply.send({ email: dados.email, reenviarEm: await mandarCodigo(jogador, 'confirmar') });
    } catch (erro) {
      return falhaNoEnvio(reply, erro);
    }
  });

  app.post('/sessoes', LIMITE, async (request, reply) => {
    const dados = validar(Entrar, request.body, reply);
    if (!dados) return;
    const login = dados.login.toLowerCase();
    const [jogador] = await banco
      .select()
      .from(jogadores)
      .where(or(eq(jogadores.nomeNormalizado, login), eq(jogadores.email, login)))
      .limit(1);
    if (!jogador) {
      await gastarTempoComoSeConferisse(dados.senha);
      return reply.code(401).send({ erro: 'e-mail ou senha incorretos' });
    }
    if (!(await conferirSenha(dados.senha, jogador.senhaHash))) {
      return reply.code(401).send({ erro: 'e-mail ou senha incorretos' });
    }
    // Senha certa, mas o cadastro ficou pela metade: manda um código (se já não mandou há pouco)
    // e o jogo abre a tela do código.
    if (!jogador.emailConfirmadoEm) {
      try {
        await mandarCodigo(jogador, 'confirmar');
      } catch (erro) {
        return falhaNoEnvio(reply, erro);
      }
      return reply.code(403).send({ erro: ERRO_EMAIL_NAO_CONFIRMADO });
    }
    return reply.send(await sessaoDe(jogador));
  });

  // Esqueceu a senha. Responde igual com ou sem conta (não revela quais e-mails têm conta).
  app.post('/senha/esqueci', LIMITE, async (request, reply) => {
    const dados = validar(PedirCodigo, request.body, reply);
    if (!dados) return;
    const jogador = await porEmail(dados.email);
    if (!jogador) return reply.send({ email: dados.email, reenviarEm: ESPERA_REENVIO_S });
    try {
      return reply.send({ email: dados.email, reenviarEm: await mandarCodigo(jogador, 'senha') });
    } catch (erro) {
      return falhaNoEnvio(reply, erro);
    }
  });

  // Troca a senha com o código: as sessões abertas em outros lugares acabam e esta já entra. O
  // código chegou no e-mail, então o e-mail fica confirmado também.
  app.post('/senha/trocar', LIMITE, async (request, reply) => {
    const dados = validar(TrocarSenha, request.body, reply);
    if (!dados) return;
    const jogador = await porEmail(dados.email);
    if (!jogador) return reply.code(400).send({ erro: ERRO_DO_CODIGO.nenhum });
    const conferencia = await conferirCodigo(banco, jogador.id, 'senha', dados.codigo);
    if (conferencia !== 'certo') return reply.code(400).send({ erro: ERRO_DO_CODIGO[conferencia] });
    const [atualizado] = await banco
      .update(jogadores)
      .set({ senhaHash: await gerarHashSenha(dados.senha), emailConfirmadoEm: jogador.emailConfirmadoEm ?? new Date() })
      .where(eq(jogadores.id, jogador.id))
      .returning();
    await banco.delete(sessoes).where(eq(sessoes.jogadorId, jogador.id));
    return reply.send(await sessaoDe(atualizado));
  });

  app.delete('/sessoes', async (request, reply) => {
    const token = tokenDoCabecalho(request.headers.authorization);
    if (token) await encerrarSessao(banco, token);
    return reply.code(204).send();
  });

  app.get('/eu', async (request, reply) => {
    const jogador = await exigirJogador(banco, request, reply);
    if (!jogador) return;
    return reply.send(publico(jogador));
  });

  // O perfil.
  app.put('/eu/nome', LIMITE, async (request, reply) => {
    const jogador = await exigirJogador(banco, request, reply);
    if (!jogador) return;
    const dados = validar(TrocarNome, request.body, reply);
    if (!dados) return;
    if (dados.nome === jogador.nome) return reply.send(publico(jogador));
    const livre = nomeLivreEm(jogador, mestres);
    if (livre) {
      const dias = Math.ceil((livre.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
      return reply.code(409).send({ erro: `você poderá trocar o nome de novo em ${dias} ${dias === 1 ? 'dia' : 'dias'}` });
    }
    const nomeNormalizado = dados.nome.toLowerCase();
    const [outro] = await banco
      .select({ id: jogadores.id })
      .from(jogadores)
      .where(and(eq(jogadores.nomeNormalizado, nomeNormalizado), ne(jogadores.id, jogador.id)))
      .limit(1);
    if (outro) return reply.code(409).send({ erro: 'esse nome já está em uso' });
    const [atualizado] = await banco
      .update(jogadores)
      .set({ nome: dados.nome, nomeNormalizado, nomeTrocadoEm: new Date() })
      .where(eq(jogadores.id, jogador.id))
      .returning();
    return reply.send(publico(atualizado));
  });

  app.put('/eu/icone', LIMITE, async (request, reply) => {
    const jogador = await exigirJogador(banco, request, reply);
    if (!jogador) return;
    const dados = validar(TrocarIcone, request.body, reply);
    if (!dados) return;
    const [atualizado] = await banco.update(jogadores).set({ icone: dados.icone }).where(eq(jogadores.id, jogador.id)).returning();
    return reply.send(publico(atualizado));
  });

  app.put('/eu/mestre', LIMITE, async (request, reply) => {
    const jogador = await exigirJogador(banco, request, reply);
    if (!jogador) return;
    const dados = validar(ModoMestre, request.body, reply);
    if (!dados) return;
    if (!ehDono(jogador, mestres)) return reply.code(403).send({ erro: 'só a conta dona do jogo tem o modo mestre' });
    const [atualizado] = await banco.update(jogadores).set({ modoMestre: dados.ligado }).where(eq(jogadores.id, jogador.id)).returning();
    return reply.send(publico(atualizado));
  });

  // O jogo rodando em casa, sem e-mail de verdade: o último código mandado para o e-mail, para a
  // tela do código mostrar (em vez de procurar no terminal do servidor).
  if (codigosNaTela && correio.ultimoCodigo) {
    const ultimoCodigo = correio.ultimoCodigo;
    app.get('/teste/codigo', async (request, reply) => {
      const dados = validar(PedirCodigo, request.query, reply);
      if (!dados) return;
      const codigo = ultimoCodigo(dados.email);
      if (!codigo) return reply.code(404).send({ erro: 'nenhum código mandado para esse e-mail' });
      return reply.send({ codigo });
    });
  }
}
