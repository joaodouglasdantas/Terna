// Tela do Multiplayer: criar uma sala (o servidor dá um código para passar ao outro jogador) ou
// entrar numa com o código. Termina quando os dois estão na sala — a partida começou — ou com
// null, se a pessoa voltar.

import { CodigoSala, TAMANHO_CODIGO, type Lado, type PedidoPartida } from '@terna/compartilhado';
import { conectarPartida, type ConexaoPartida } from '../rede/partida';
import { anexarCena } from './cena';
import { botao, elemento, palco, sairComEsmaecer } from './dom';

export interface EscolhaOnline {
  modo: 'online';
  nome: string;
  oponente: string;
  lado: Lado;
  restanteMs: number;
  conexao: ConexaoPartida;
}

const SEM_SERVIDOR = 'Não consegui falar com o servidor. Tente de novo.';

export function telaMultiplayer(nome: string): Promise<EscolhaOnline | null> {
  return new Promise((resolver) => {
    const tela = elemento('section', 'inicio-tela inicio-multi-tela');
    const caixa = elemento('div', 'inicio-caixa');
    tela.append(caixa);
    let conexao: ConexaoPartida | null = null;

    const terminar = (escolha: EscolhaOnline | null): void => {
      window.removeEventListener('keydown', aoTeclar);
      if (escolha) void sairComEsmaecer(tela).then(() => resolver(escolha));
      else resolver(null);
    };
    // Esc volta um passo: da espera para a escolha, da escolha para a tela inicial.
    let voltar = (): void => terminar(null);
    const aoTeclar = (evento: KeyboardEvent): void => {
      if (evento.code === 'Escape') {
        evento.preventDefault();
        voltar();
      }
    };
    window.addEventListener('keydown', aoTeclar);

    // Abre a conexão e espera a partida começar. `aoCriar` recebe o código (só quem cria).
    const conectar = (pedido: PedidoPartida, aoCriar: (codigo: string) => void, aoFalhar: (erro: string) => void): void => {
      const c = conectarPartida(pedido);
      conexao = c;
      c.ouvir(
        (m) => {
          if (m.tipo === 'sala-criada') aoCriar(m.codigo);
          if (m.tipo === 'comecou') {
            terminar({ modo: 'online', nome, oponente: m.oponente, lado: m.lado, restanteMs: m.restanteMs, conexao: c });
          }
        },
        (erro) => {
          conexao = null;
          aoFalhar(erro ? primeiraMaiuscula(erro) : SEM_SERVIDOR);
        },
      );
    };

    // Primeira vista: criar sala ou entrar com código.
    const escolher = (erro = '', codigoDigitado = ''): void => {
      voltar = () => terminar(null);
      const titulo = elemento('h1', 'inicio-titulo', 'Multiplayer');
      const sub = elemento('p', 'inicio-sub', '1v1 · partida de 5 minutos');

      const criar = botao('Criar sala', 'inicio-botao', () => {
        esperando('');
        conectar(
          { acao: 'criar', nome },
          (codigo) => esperando(codigo),
          (e) => escolher(e),
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
        entrando(codigo.data);
        conectar(
          { acao: 'entrar', nome, codigo: codigo.data },
          () => undefined,
          (e) => escolher(e, codigo.data),
        );
      });
      campo.addEventListener('keydown', (evento) => {
        if (evento.code === 'Enter') entrar.click();
      });
      linha.append(campo, entrar);

      const mensagem = elemento('p', 'inicio-erro', erro);
      mensagem.setAttribute('aria-live', 'polite');
      const voltarBotao = botao('Voltar', 'inicio-botao inicio-botao-claro', () => voltar());
      caixa.replaceChildren(titulo, sub, criar, ou, linha, mensagem, voltarBotao);
      // As árvores da tela inicial passam para cá (e voltam com ela).
      anexarCena(tela);
      palco().replaceChildren(tela);
      (codigoDigitado ? campo : criar).focus();
    };

    const cancelar = (): void => {
      conexao?.fechar();
      conexao = null;
      escolher();
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
      caixa.replaceChildren(...partes);
      (caixa.querySelector('button') as HTMLButtonElement | null)?.focus();
    };

    const entrando = (codigo: string): void => {
      voltar = () => {
        conexao?.fechar();
        conexao = null;
        escolher('', codigo);
      };
      caixa.replaceChildren(
        elemento('h1', 'inicio-titulo', 'Entrando…'),
        elemento('p', 'inicio-sub', `Sala ${codigo}`),
        botao('Cancelar', 'inicio-botao inicio-botao-claro', voltar),
      );
    };

    escolher();
  });
}

function primeiraMaiuscula(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1) + (/[.!?]$/.test(texto) ? '' : '.');
}
