// Tela do Multiplayer, com dois jeitos de jogar:
// - Na mesma rede: um hospeda a partida e o outro, no mesmo Wi-Fi (ou cabo), a vê numa lista que
//   se atualiza sozinha e entra com um clique, sem código. Os dois computadores se ligam direto
//   (rede/direto.ts): na rede de casa, quase sem atraso.
// - Pela internet: criar uma sala (o servidor dá um código para passar ao outro jogador) ou
//   entrar numa com o código.
// Com os dois na sala, abre a tela de seleção de personagem (a mesma do Singleplayer), e termina
// quando os dois escolheram — a partida começou — ou de volta à tela inicial: a pessoa voltou,
// ou a sala caiu na escolha (saiu alguém, o tempo de escolher acabou, a rede caiu), com o aviso.

import { CodigoSala, TAMANHO_CODIGO, type Heroi, type Lado, type PartidaNaRede, type PedidoPartida } from '@terna/compartilhado';
import { buscarPartidasNaRede, conectarPartida, type ConexaoPartida } from '../rede/partida';
import { anexarCena } from './cena';
import { botao, elemento, mostrarTela } from './dom';
import { telaSelecao } from './selecao';

export interface EscolhaOnline {
  modo: 'online';
  nome: string;
  oponente: string;
  lado: Lado;
  restanteMs: number;
  heroi: Heroi;
  heroiOponente: Heroi;
  comecouEm: number; // performance.now() do aviso de que começou (o carregamento conta dele)
  conexao: ConexaoPartida;
}

// Como a tela termina: a partida começou, ou de volta à tela inicial (com `aviso`, a sala caiu).
export type FimDoMultiplayer = { tipo: 'jogar'; escolha: EscolhaOnline } | { tipo: 'voltar'; aviso?: string };

const SEM_SERVIDOR = 'Não consegui falar com o servidor. Tente de novo.';
const PROCURAR_MS = 2500; // a lista das partidas na rede se atualiza sozinha a cada tanto

export function telaMultiplayer(nome: string): Promise<FimDoMultiplayer> {
  return new Promise((resolver) => {
    const tela = elemento('section', 'inicio-tela inicio-multi-tela');
    const caixa = elemento('div', 'inicio-caixa');
    tela.append(caixa);
    let conexao: ConexaoPartida | null = null;
    // Para onde voltar da seleção de personagem (a sala acabou, ou a pessoa saiu dela).
    let modo: 'rede' | 'internet' = 'rede';
    let busca: ReturnType<typeof setInterval> | null = null;
    const pararBusca = (): void => {
      if (busca) clearInterval(busca);
      busca = null;
    };

    const terminar = (): void => {
      pararBusca();
      window.removeEventListener('keydown', aoTeclar);
      resolver({ tipo: 'voltar' });
    };
    // Esc volta um passo: da espera para o modo, do modo para a primeira vista, dela para a
    // tela inicial.
    let voltar = (): void => terminar();
    const aoTeclar = (evento: KeyboardEvent): void => {
      if (evento.code === 'Escape') {
        evento.preventDefault();
        voltar();
      }
    };
    window.addEventListener('keydown', aoTeclar);

    // Põe as partes na caixa, com as árvores da tela inicial atrás (elas passam para cá e voltam
    // com ela); voltando da seleção, a tela volta para o palco.
    const mostrar = (...partes: HTMLElement[]): void => {
      caixa.replaceChildren(...partes);
      anexarCena(tela);
      mostrarTela(tela);
    };
    const voltarAoModo = (erro = ''): void => (modo === 'rede' ? naRede(erro) : internet(erro));

    // Os dois na sala: a seleção de personagem. Os dois escolheram, a partida começa; saiu da
    // sala, ou ela caiu, de volta à tela inicial (a sala não existe mais).
    const selecionar = (c: ConexaoPartida, oponente: string, prazoAte: number): void => {
      pararBusca();
      window.removeEventListener('keydown', aoTeclar);
      void telaSelecao({ conexao: c, oponente, prazoAte }).then((r) => {
        if (r.tipo === 'comecou') return resolver({ tipo: 'jogar', escolha: { modo: 'online', nome, ...r.partida, conexao: c } });
        conexao = null;
        resolver({ tipo: 'voltar', aviso: r.tipo === 'caiu' ? r.aviso : undefined });
      });
    };

    // Abre a conexão e espera o outro jogador. `aoCriar` recebe o código (só quem cria ou hospeda).
    const conectar = (pedido: PedidoPartida, aoCriar: (codigo: string) => void, aoFalhar: (erro: string) => void): void => {
      const c = conectarPartida(pedido);
      conexao = c;
      c.ouvir(
        (m) => {
          if (m.tipo === 'sala-criada') aoCriar(m.codigo);
          if (m.tipo === 'escolher') selecionar(c, m.oponente, performance.now() + m.prazoMs);
        },
        (erro) => {
          conexao = null;
          aoFalhar(erro ? primeiraMaiuscula(erro) : SEM_SERVIDOR);
        },
      );
    };
    const cancelar = (): void => {
      conexao?.fechar();
      conexao = null;
      voltarAoModo();
    };

    // Primeira vista: os dois jeitos de jogar.
    const inicio = (): void => {
      pararBusca();
      voltar = () => terminar();
      const rede = botao('Na mesma rede', 'inicio-botao', () => naRede());
      const internetBotao = botao('Pela internet', 'inicio-botao', () => internet());
      mostrar(
        elemento('h1', 'inicio-titulo', 'Multiplayer'),
        elemento('p', 'inicio-sub', '1v1 · partida de 5 minutos'),
        rede,
        elemento('p', 'inicio-sub inicio-modo-dica', 'No mesmo Wi-Fi: um hospeda e o outro entra, sem código.'),
        internetBotao,
        elemento('p', 'inicio-sub inicio-modo-dica', 'Longe um do outro: com o código da sala.'),
        botao('Voltar', 'inicio-botao inicio-botao-claro', () => voltar()),
      );
      rede.focus();
    };

    // Na mesma rede: hospedar, ou entrar numa das partidas que alguém da rede hospedou.
    const naRede = (erro = ''): void => {
      modo = 'rede';
      voltar = inicio;
      const hospedar = botao('Hospedar partida', 'inicio-botao', () => {
        pararBusca();
        hospedando(false);
        conectar(
          { acao: 'hospedar', nome },
          () => hospedando(true),
          (e) => naRede(e),
        );
      });
      const lista = elemento('div', 'inicio-rede-lista');
      lista.setAttribute('aria-live', 'polite');
      const procurando = elemento('p', 'inicio-aguarde', 'Procurando partidas na sua rede…');
      lista.append(procurando);
      const mensagem = elemento('p', 'inicio-erro', erro);
      mensagem.setAttribute('aria-live', 'polite');
      mostrar(
        elemento('h1', 'inicio-titulo', 'Na mesma rede'),
        elemento('p', 'inicio-sub', 'Quem está no mesmo Wi-Fi (ou cabo) vê a partida que você hospedar.'),
        hospedar,
        elemento('p', 'inicio-ou', 'ou entre numa partida da sua rede'),
        lista,
        mensagem,
        botao('Voltar', 'inicio-botao inicio-botao-claro', () => voltar()),
      );
      hospedar.focus();

      // A lista só é refeita quando muda (o foco num botão dela não se perde a cada busca).
      let mostradas = '';
      const mostrarPartidas = (partidas: PartidaNaRede[] | null): void => {
        const chave = partidas ? JSON.stringify(partidas) : 'falhou';
        if (chave === mostradas) return;
        mostradas = chave;
        if (!partidas) {
          lista.replaceChildren(elemento('p', 'inicio-aguarde', 'Não consegui procurar agora; tentando de novo…'));
        } else if (partidas.length === 0) {
          lista.replaceChildren(elemento('p', 'inicio-aguarde', 'Nenhuma partida na sua rede ainda. Se ninguém hospedou, hospede você.'));
        } else {
          lista.replaceChildren(
            ...partidas.map(({ codigo, anfitriao }) =>
              botao(`Jogar com ${anfitriao}`, 'inicio-botao inicio-botao-claro', () => {
                pararBusca();
                entrando(`Partida de ${anfitriao}`);
                conectar(
                  { acao: 'entrar', nome, codigo },
                  () => undefined,
                  (e) => naRede(e),
                );
              }),
            ),
          );
        }
      };
      // Uma resposta que chega depois de sair da tela não mexe em nada.
      const procurar = (): void => {
        buscarPartidasNaRede().then(
          (partidas) => {
            if (busca) mostrarPartidas(partidas);
          },
          () => {
            if (busca) mostrarPartidas(null);
          },
        );
      };
      pararBusca();
      busca = setInterval(procurar, PROCURAR_MS);
      procurar();
    };

    // Hospedando: esperando alguém da rede entrar pela lista.
    const hospedando = (pronta: boolean): void => {
      voltar = cancelar;
      const partes: HTMLElement[] = [elemento('h1', 'inicio-titulo', pronta ? 'Sua partida' : 'Hospedando…')];
      if (pronta) {
        partes.push(
          elemento('p', 'inicio-sub', `Quem estiver na mesma rede vê "Jogar com ${nome}" em Multiplayer → Na mesma rede.`),
          elemento('p', 'inicio-aguarde', 'Esperando alguém da sua rede entrar…'),
        );
      }
      const cancelarBotao = botao('Cancelar', 'inicio-botao inicio-botao-claro', cancelar);
      mostrar(...partes, cancelarBotao);
      cancelarBotao.focus();
    };

    // Pela internet: criar uma sala com código ou entrar numa com o código.
    const internet = (erro = '', codigoDigitado = ''): void => {
      pararBusca();
      modo = 'internet';
      voltar = inicio;
      const titulo = elemento('h1', 'inicio-titulo', 'Pela internet');
      const sub = elemento('p', 'inicio-sub', 'Crie uma sala e passe o código, ou entre com o de alguém.');

      const criar = botao('Criar sala', 'inicio-botao', () => {
        esperando('');
        conectar(
          { acao: 'criar', nome },
          (codigo) => esperando(codigo),
          (e) => internet(e),
        );
      });

      const ou = elemento('p', 'inicio-ou', 'ou entre com um código');
      const linha = elemento('div', 'inicio-linha-codigo');
      const campo = elemento('input', 'inicio-entrada inicio-entrada-codigo');
      campo.type = 'text';
      campo.maxLength = TAMANHO_CODIGO;
      campo.autocomplete = 'off';
      campo.spellcheck = false;
      campo.placeholder = 'CÓDIGO';
      campo.value = codigoDigitado;
      campo.setAttribute('aria-label', 'Código da sala');
      campo.addEventListener('input', () => {
        campo.value = campo.value.toUpperCase();
        mensagem.textContent = '';
      });
      const entrar = botao('Entrar', 'inicio-botao', () => {
        const codigo = CodigoSala.safeParse(campo.value);
        if (!codigo.success) {
          mensagem.textContent = `O código tem ${TAMANHO_CODIGO} letras e números.`;
          campo.focus();
          return;
        }
        entrando(`Sala ${codigo.data}`, codigo.data);
        conectar(
          { acao: 'entrar', nome, codigo: codigo.data },
          () => undefined,
          (e) => internet(e, codigo.data),
        );
      });
      campo.addEventListener('keydown', (evento) => {
        if (evento.code === 'Enter') entrar.click();
      });
      linha.append(campo, entrar);

      const mensagem = elemento('p', 'inicio-erro', erro);
      mensagem.setAttribute('aria-live', 'polite');
      const voltarBotao = botao('Voltar', 'inicio-botao inicio-botao-claro', () => voltar());
      mostrar(titulo, sub, criar, ou, linha, mensagem, voltarBotao);
      (codigoDigitado ? campo : criar).focus();
    };

    // Sala criada: mostra o código e espera o outro jogador.
    const esperando = (codigo: string): void => {
      voltar = cancelar;
      const titulo = elemento('h1', 'inicio-titulo', codigo ? 'Sua sala' : 'Criando a sala…');
      const partes: HTMLElement[] = [titulo];
      if (codigo) {
        const mostrado = elemento('p', 'inicio-codigo', codigo);
        mostrado.setAttribute('aria-label', `Código ${codigo.split('').join(' ')}`);
        const dica = elemento('p', 'inicio-sub', 'Passe este código para o outro jogador.');
        const copiado = elemento('p', 'inicio-sub inicio-copiado');
        copiado.setAttribute('aria-live', 'polite');
        const copiar = botao('Copiar código', 'inicio-botao inicio-botao-claro', () => {
          navigator.clipboard?.writeText(codigo).then(
            () => (copiado.textContent = 'Código copiado!'),
            () => (copiado.textContent = 'Não deu para copiar; passe o código escrito.'),
          );
        });
        partes.push(mostrado, dica, copiar, copiado, elemento('p', 'inicio-aguarde', 'Esperando o outro jogador…'));
      }
      partes.push(botao('Cancelar', 'inicio-botao inicio-botao-claro', cancelar));
      mostrar(...partes);
      (caixa.querySelector('button') as HTMLButtonElement | null)?.focus();
    };

    // Entrando numa sala: `onde` diz qual; `codigo`, voltando, fica no campo (pela internet).
    const entrando = (onde: string, codigo = ''): void => {
      voltar = () => {
        conexao?.fechar();
        conexao = null;
        if (modo === 'internet') internet('', codigo);
        else naRede();
      };
      mostrar(
        elemento('h1', 'inicio-titulo', 'Entrando…'),
        elemento('p', 'inicio-sub', onde),
        botao('Cancelar', 'inicio-botao inicio-botao-claro', () => voltar()),
      );
    };

    inicio();
  });
}

function primeiraMaiuscula(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1) + (/[.!?]$/.test(texto) ? '' : '.');
}
