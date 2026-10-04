import {
  ComecarPartidaDaConta,
  DURACAO_MINIMA_DA_PARTIDA_S,
  GANHO_POR_PARTIDA,
  NIVEIS_DO_PASSE,
  PARTIDAS_COM_GANHO_POR_DIA,
  passeAberto,
  ResgatarNivelDoPasse,
  TEMPORADA_DO_PASSE,
  TerminarPartidaDaConta,
  nivelDoPerfil,
  nivelLiberadoDoPasse,
} from '@terna/compartilhado';
import { and, count, eq, gt, gte, isNull, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { Banco } from '../banco/conexao';
import { jogadores, partidasDaConta } from '../banco/schema';
import { ehDono, ehMestre, exigirJogador, jogadorPublico, passeDe, validar } from '../http';

// O progresso da conta (progresso.ts de @terna/compartilhado): as partidas dão XP e pontos do
// passe, e os níveis liberados do passe se resgatam por XP e azios.
//
//   POST /eu/partidas               { modo }       → 201 { id }  (a partida começou)
//   POST /eu/partidas/:id/fim       { resultado }  → 200 { jogador, ganho, subiuPara }
//   POST /eu/passe/resgatar         { nivel }      → 200 { jogador, recompensa, subiuPara }
//   POST /eu/passe/recomecar                       → 200 jogador (só a conta mestre: para testar)
//
// O resultado ainda vem do jogo (como o ranking): o servidor só segura o óbvio — cada partida
// fecha uma vez, a curta demais não dá nada e só PARTIDAS_COM_GANHO_POR_DIA por dia dão ganho.
// Uma partida aberta há mais tempo que isto já não fecha (a pessoa fechou o jogo no meio).
const PARTIDA_VENCE_EM_MS = 30 * 60 * 1000;

export function rotasProgresso(app: FastifyInstance, banco: Banco, mestres: ReadonlySet<string> = new Set()): void {
  const LIMITE = { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } };

  app.post('/eu/partidas', LIMITE, async (request, reply) => {
    const jogador = await exigirJogador(banco, request, reply);
    if (!jogador) return;
    const dados = validar(ComecarPartidaDaConta, request.body, reply);
    if (!dados) return;
    const [partida] = await banco.insert(partidasDaConta).values({ jogadorId: jogador.id, modo: dados.modo }).returning({ id: partidasDaConta.id });
    return reply.code(201).send({ id: partida.id });
  });

  app.post<{ Params: { id: string } }>('/eu/partidas/:id/fim', LIMITE, async (request, reply) => {
    const jogador = await exigirJogador(banco, request, reply);
    if (!jogador) return;
    const dados = validar(TerminarPartidaDaConta, request.body, reply);
    if (!dados) return;
    if (!/^[0-9a-f-]{36}$/i.test(request.params.id)) return reply.code(404).send({ erro: 'partida não encontrada' });
    const agora = new Date();

    return banco.transaction(async (tx) => {
      // Fecha só se é desta conta, ainda está aberta e não venceu.
      const [partida] = await tx
        .update(partidasDaConta)
        .set({ terminouEm: agora, resultado: dados.resultado })
        .where(
          and(
            eq(partidasDaConta.id, request.params.id),
            eq(partidasDaConta.jogadorId, jogador.id),
            isNull(partidasDaConta.terminouEm),
            gt(partidasDaConta.comecouEm, new Date(agora.getTime() - PARTIDA_VENCE_EM_MS)),
          ),
        )
        .returning();
      if (!partida) return reply.code(409).send({ erro: 'essa partida já terminou' });

      const durou = (agora.getTime() - partida.comecouEm.getTime()) / 1000;
      const [{ hoje }] = await tx
        .select({ hoje: count() })
        .from(partidasDaConta)
        .where(
          and(
            eq(partidasDaConta.jogadorId, jogador.id),
            gte(partidasDaConta.terminouEm, new Date(agora.getTime() - 24 * 60 * 60 * 1000)),
            gt(partidasDaConta.xp, 0),
          ),
        );
      const vale = durou >= DURACAO_MINIMA_DA_PARTIDA_S && hoje < PARTIDAS_COM_GANHO_POR_DIA;
      // Acabado o passe, a partida só dá o XP do perfil.
      const base = GANHO_POR_PARTIDA[dados.resultado];
      const ganho = vale ? { xp: base.xp, pontos: passeAberto(agora) ? base.pontos : 0 } : { xp: 0, pontos: 0 };
      if (!vale) return reply.send({ jogador: jogadorPublico(jogador, mestres), ganho, subiuPara: null });

      await tx.update(partidasDaConta).set(ganho).where(eq(partidasDaConta.id, partida.id));
      const novaTemporada = jogador.passeTemporada !== TEMPORADA_DO_PASSE;
      const [atualizado] = await tx
        .update(jogadores)
        .set({
          xp: sql`${jogadores.xp} + ${ganho.xp}`,
          passeTemporada: TEMPORADA_DO_PASSE,
          passePontos: novaTemporada ? ganho.pontos : sql`${jogadores.passePontos} + ${ganho.pontos}`,
          ...(novaTemporada ? { passeResgatados: [] } : {}),
        })
        .where(eq(jogadores.id, jogador.id))
        .returning();
      const antes = nivelDoPerfil(jogador.xp).nivel;
      const depois = nivelDoPerfil(atualizado.xp).nivel;
      return reply.send({ jogador: jogadorPublico(atualizado, mestres), ganho, subiuPara: depois > antes ? depois : null });
    });
  });

  app.post('/eu/passe/resgatar', LIMITE, async (request, reply) => {
    const jogador = await exigirJogador(banco, request, reply);
    if (!jogador) return;
    const dados = validar(ResgatarNivelDoPasse, request.body, reply);
    if (!dados) return;
    const passe = passeDe(jogador);
    // O mestre tem a trilha toda liberada (para testar); os outros, até onde os pontos chegaram.
    const liberado = ehMestre(jogador, mestres) ? NIVEIS_DO_PASSE.length : nivelLiberadoDoPasse(passe.pontos);
    if (dados.nivel > liberado) return reply.code(409).send({ erro: 'esse nível do passe ainda não foi liberado' });
    if (passe.resgatados.includes(dados.nivel)) return reply.code(409).send({ erro: 'esse nível do passe já foi resgatado' });
    const recompensa = NIVEIS_DO_PASSE[dados.nivel - 1];

    return banco.transaction(async (tx) => {
      // Junta o nível na lista só se ele ainda não está lá (dois cliques seguidos resgatam uma vez).
      const resgatados = [...passe.resgatados, dados.nivel];
      const [atualizado] = await tx
        .update(jogadores)
        .set({
          xp: sql`${jogadores.xp} + ${recompensa.xp}`,
          azios: sql`${jogadores.azios} + ${recompensa.azios}`,
          passeTemporada: TEMPORADA_DO_PASSE,
          passePontos: passe.pontos,
          passeResgatados: resgatados,
        })
        .where(
          and(
            eq(jogadores.id, jogador.id),
            jogador.passeTemporada === TEMPORADA_DO_PASSE
              ? sql`not (${jogadores.passeResgatados} @> ${JSON.stringify([dados.nivel])}::jsonb)`
              : sql`true`,
          ),
        )
        .returning();
      if (!atualizado) return reply.code(409).send({ erro: 'esse nível do passe já foi resgatado' });
      const antes = nivelDoPerfil(jogador.xp).nivel;
      const depois = nivelDoPerfil(atualizado.xp).nivel;
      return reply.send({
        jogador: jogadorPublico(atualizado, mestres),
        recompensa: { xp: recompensa.xp, azios: recompensa.azios },
        subiuPara: depois > antes ? depois : null,
      });
    });
  });

  // Só a conta dona com o modo mestre: o passe volta ao começo (pontos e resgates), para testar a
  // trilha de novo. O XP e os azios ficam.
  app.post('/eu/passe/recomecar', LIMITE, async (request, reply) => {
    const jogador = await exigirJogador(banco, request, reply);
    if (!jogador) return;
    if (!ehDono(jogador, mestres) || !ehMestre(jogador, mestres)) return reply.code(403).send({ erro: 'só a conta mestre pode recomeçar o passe' });
    const [atualizado] = await banco
      .update(jogadores)
      .set({ passeTemporada: TEMPORADA_DO_PASSE, passePontos: 0, passeResgatados: [] })
      .where(eq(jogadores.id, jogador.id))
      .returning();
    return reply.send(jogadorPublico(atualizado, mestres));
  });
}
