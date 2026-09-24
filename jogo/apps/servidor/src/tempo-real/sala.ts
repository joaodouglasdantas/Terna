import { MUNDO, MensagemDoCliente, type JogadorNoMundo, type MensagemDoServidor } from '@terna/compartilhado';

// O que a sala precisa de uma conexão: mandar texto e fechar. (O WebSocket do `ws` serve.)
export interface Conexao {
  send(dados: string): void;
  close(codigo?: number, motivo?: string): void;
}

// Mensagens por segundo que um jogador pode mandar; o excesso é ignorado. Cada posição
// recebida é repassada a todos os outros, e o plano grátis do Render inclui só 5 GB de
// saída por mês: o cliente deve mandar posição no máximo ~10 vezes por segundo, e só
// quando o personagem se mexe.
const LIMITE_POR_SEGUNDO = 15;

interface Presente {
  jogador: JogadorNoMundo;
  conexao: Conexao;
  janela: number; // segundo atual (para o limite)
  mensagens: number; // mensagens neste segundo
}

// Todos os jogadores conectados ao mesmo mundo. Por enquanto há um mundo só; com mais
// mapas, cada um vira uma Sala.
export class Sala {
  private presentes = new Map<string, Presente>();

  get quantidade(): number {
    return this.presentes.size;
  }

  entrar(id: string, nome: string, conexao: Conexao): void {
    // A mesma conta abrindo o jogo de novo derruba a conexão antiga.
    this.presentes.get(id)?.conexao.close(4000, 'conectado em outro lugar');
    this.presentes.delete(id);

    const jogador: JogadorNoMundo = { id, nome, x: MUNDO / 2, y: 0, direcao: 1, animacao: 'parado' };
    const outros = [...this.presentes.values()].map((p) => p.jogador);
    this.presentes.set(id, { jogador, conexao, janela: 0, mensagens: 0 });
    this.mandar(conexao, { tipo: 'bem-vindo', id, jogadores: outros });
    this.espalhar({ tipo: 'entrou', jogador }, id);
  }

  sair(id: string, conexao: Conexao): void {
    // Só remove se for a conexão atual (a antiga, derrubada, não tira a nova da sala).
    if (this.presentes.get(id)?.conexao !== conexao) return;
    this.presentes.delete(id);
    this.espalhar({ tipo: 'saiu', id });
  }

  receber(id: string, texto: string): void {
    const presente = this.presentes.get(id);
    if (!presente) return;
    const segundo = Math.floor(Date.now() / 1000);
    if (segundo !== presente.janela) {
      presente.janela = segundo;
      presente.mensagens = 0;
    }
    if (++presente.mensagens > LIMITE_POR_SEGUNDO) return;

    let json: unknown;
    try {
      json = JSON.parse(texto);
    } catch {
      return this.mandar(presente.conexao, { tipo: 'erro', erro: 'mensagem não é JSON' });
    }
    const mensagem = MensagemDoCliente.safeParse(json);
    if (!mensagem.success) return this.mandar(presente.conexao, { tipo: 'erro', erro: 'mensagem inválida' });

    const m = mensagem.data;
    if (m.tipo === 'ping') return this.mandar(presente.conexao, { tipo: 'pong', t: m.t });
    if (m.tipo === 'posicao') {
      const { x, y, direcao, animacao } = m;
      Object.assign(presente.jogador, { x, y, direcao, animacao });
      this.espalhar({ tipo: 'posicao', id, x, y, direcao, animacao }, id);
    }
  }

  private mandar(conexao: Conexao, mensagem: MensagemDoServidor): void {
    conexao.send(JSON.stringify(mensagem));
  }

  private espalhar(mensagem: MensagemDoServidor, exceto?: string): void {
    const texto = JSON.stringify(mensagem);
    for (const [id, p] of this.presentes) if (id !== exceto) p.conexao.send(texto);
  }
}
