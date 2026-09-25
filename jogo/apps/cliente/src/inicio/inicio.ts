// Telas de antes do jogo: primeiro a de carregamento, uma barra de progresso que confere o
// servidor, o banco e a arte (e deixa o servidor grátis acordar); depois a inicial, com a logo e
// o botão de jogar. São páginas comuns por cima do canvas: a logo é uma imagem grande e o texto
// precisa ficar nítido, o que o canvas de 480×270 ampliado não daria.

import logoUrl from '../assets/logo.png';
import logoSimplesUrl from '../assets/logo-simples.webp';
import { checarBanco, checarServidor } from '../rede/saude';
import './inicio.css';

// Cada etapa da barra é uma checagem de verdade, com um nome do mundo do jogo no lugar do nome
// técnico. A barra anda por elas em ordem, mas as checagens correm todas ao mesmo tempo.
type Falha = 'arte' | 'rede';
type Resultado = { ok: true } | { ok: false; falha: Falha };

interface Etapa {
  frase: string;
  resultado: Promise<Resultado>;
}

const TEMPO_MINIMO_ETAPA = 700; // ms que cada frase fica na tela, mesmo que a checagem seja instantânea
const AVISO_DEMORA = 6000; // ms numa etapa até avisar que o mundo pode estar acordando
const PAUSA_PRONTO = 450; // ms com a barra cheia antes de abrir a tela inicial

interface Opcoes<C, H> {
  carregarCenario: () => Promise<C>;
  carregarHerois: () => Promise<H>;
  // Chamado quando a tela inicial abre, com a arte já carregada: o cenário passa a rodar atrás
  // dela. A promessa de `abrirInicio` só termina quando a pessoa aperta Jogar.
  aoAbrirTitulo: (cenario: C, herois: H, online: boolean) => void;
}

function elemento<K extends keyof HTMLElementTagNameMap>(tag: K, classe: string, texto?: string): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  el.className = classe;
  if (texto !== undefined) el.textContent = texto;
  return el;
}

function botao(texto: string, classe: string, aoClicar: () => void): HTMLButtonElement {
  const b = elemento('button', classe, texto);
  b.type = 'button';
  b.addEventListener('click', aoClicar);
  return b;
}

function imagemDaLogo(classe: string): HTMLImageElement {
  const logo = elemento('img', classe);
  logo.src = logoUrl;
  logo.alt = 'Terna';
  logo.draggable = false;
  return logo;
}

// A logo simples (só as letras, em branco) do carregamento. A imagem tem margem vazia em volta
// das letras: a moldura tem a proporção só das letras e corta o resto (ver inicio.css).
function logoSimples(): HTMLElement {
  const moldura = elemento('div', 'inicio-logo-simples');
  const img = elemento('img', '');
  img.src = logoSimplesUrl;
  img.alt = 'Terna';
  img.draggable = false;
  moldura.append(img);
  return moldura;
}

const esperar = (ms: number): Promise<void> => new Promise((resolver) => setTimeout(resolver, ms));

// Guarda o valor carregado e transforma o sucesso/erro em Resultado.
function carregar<T>(carregador: () => Promise<T>, guardar: (valor: T) => void): Promise<Resultado> {
  return carregador().then(
    (valor): Resultado => {
      guardar(valor);
      return { ok: true };
    },
    (erro: unknown): Resultado => {
      console.error(erro);
      return { ok: false, falha: 'arte' };
    },
  );
}

// A tela de carregamento. Devolve o que foi carregado e se dá para jogar online, quando a pessoa
// pode seguir (sozinha, se tudo deu certo; com um clique, se algo falhou).
function carregamento<C, H>(
  palco: HTMLElement,
  opcoes: Pick<Opcoes<C, H>, 'carregarCenario' | 'carregarHerois'>,
): Promise<{ cenario: C; herois: H; online: boolean }> {
  return new Promise((resolver) => {
    const tela = elemento('section', 'inicio-tela inicio-carregando');
    const barra = elemento('div', 'inicio-barra');
    barra.setAttribute('role', 'progressbar');
    barra.setAttribute('aria-label', 'Carregando');
    barra.setAttribute('aria-valuemin', '0');
    barra.setAttribute('aria-valuemax', '100');
    const preenchido = elemento('div', 'inicio-barra-cheia');
    barra.append(preenchido);
    const frase = elemento('p', 'inicio-frase');
    frase.setAttribute('aria-live', 'polite');
    const aviso = elemento('p', 'inicio-aviso');
    const acoes = elemento('div', 'inicio-acoes');
    tela.append(logoSimples(), barra, frase, aviso, acoes);
    palco.replaceChildren(tela);

    let cenario: C | undefined;
    let herois: H | undefined;

    const rodar = async (): Promise<void> => {
      acoes.replaceChildren();
      aviso.textContent = '';
      delete tela.dataset.estado;

      const servidor = checarServidor();
      const etapas: Etapa[] = [
        { frase: 'Colocando grama no chão', resultado: carregar(opcoes.carregarCenario, (v) => (cenario = v)) },
        { frase: 'Chamando os heróis', resultado: carregar(opcoes.carregarHerois, (v) => (herois = v)) },
        { frase: 'Afiando as armas', resultado: servidor.then((r) => (r.ok ? r : { ok: false, falha: 'rede' })) },
        {
          frase: 'Abrindo o baú de memórias',
          // O banco só se confere com o servidor de pé.
          resultado: servidor
            .then((r) => (r.ok ? checarBanco() : r))
            .then((r) => (r.ok ? r : { ok: false, falha: 'rede' })),
        },
      ];

      // A barra: `feitas` etapas cheias e a atual enchendo devagar enquanto a checagem não volta
      // (sem nunca completar a etapa por conta própria). A largura persegue esse alvo.
      let feitas = 0;
      let inicioEtapa = performance.now();
      let parada = false;
      let mostrado = 0;
      const animar = (agora: number): void => {
        const correndo = parada ? 0 : 0.85 * (1 - Math.exp(-(agora - inicioEtapa) / 1500));
        const alvo = Math.min(1, (feitas + correndo) / etapas.length);
        mostrado += (alvo - mostrado) * 0.15;
        preenchido.style.width = `${(mostrado * 100).toFixed(2)}%`;
        barra.setAttribute('aria-valuenow', String(Math.round(mostrado * 100)));
        if (!parada && agora - inicioEtapa > AVISO_DEMORA) {
          aviso.textContent = 'O mundo está acordando… isso pode levar até um minuto.';
        }
        if (!parada || Math.abs(alvo - mostrado) > 0.001) requestAnimationFrame(animar);
      };
      requestAnimationFrame(animar);

      for (const etapa of etapas) {
        frase.textContent = `${etapa.frase}…`;
        barra.setAttribute('aria-valuetext', etapa.frase);
        inicioEtapa = performance.now();
        const [resultado] = await Promise.all([etapa.resultado, esperar(TEMPO_MINIMO_ETAPA)]);
        aviso.textContent = '';
        if (!resultado.ok) {
          parada = true;
          falhou(resultado.falha);
          return;
        }
        feitas++;
      }
      parada = true;
      frase.textContent = 'Tudo pronto!';
      barra.setAttribute('aria-valuetext', 'Tudo pronto');
      await esperar(PAUSA_PRONTO);
      // As duas primeiras etapas são a arte: chegando aqui, as duas carregaram.
      resolver({ cenario: cenario as C, herois: herois as H, online: true });
    };

    const falhou = (falha: Falha): void => {
      tela.dataset.estado = 'falhou';
      const tentarDeNovo = botao('Tentar de novo', 'inicio-botao inicio-botao-claro', () => void rodar());
      if (falha === 'rede' && cenario !== undefined && herois !== undefined) {
        // Só o online falhou: o jogo roda sozinho, então dá para seguir sem ele.
        const [c, h] = [cenario, herois];
        frase.textContent = 'O mundo online não respondeu';
        aviso.textContent = 'Dá para jogar mesmo assim, mas sem salvar na conta nem jogar com outras pessoas.';
        acoes.append(
          botao('Jogar offline', 'inicio-botao', () => resolver({ cenario: c, herois: h, online: false })),
          tentarDeNovo,
        );
      } else {
        frase.textContent = 'As imagens do jogo não carregaram';
        aviso.textContent = 'Sem elas não dá para abrir o jogo. Confira a conexão e tente de novo.';
        acoes.append(tentarDeNovo);
      }
      tentarDeNovo.focus({ preventScroll: true });
    };

    void rodar();
  });
}

// A tela inicial: a logo e os modos de jogo. Termina quando a pessoa escolhe Singleplayer (você
// e o sósia, o jogo de hoje); o Multiplayer aparece apagado, avisando que vem aí.
function titulo(palco: HTMLElement, online: boolean): Promise<void> {
  return new Promise((resolver) => {
    const tela = elemento('section', 'inicio-tela inicio-titulo-tela');

    const jogar = botao('Singleplayer', 'inicio-botao inicio-jogar', () => {
      window.removeEventListener('keydown', aoTeclar);
      tela.classList.add('inicio-saindo');
      // Dá tempo do esmaecer terminar antes de tirar a tela do lugar.
      setTimeout(() => {
        tela.remove();
        resolver();
      }, 350);
    });
    const aoTeclar = (evento: KeyboardEvent): void => {
      if (evento.code === 'Enter' || evento.code === 'Space') {
        evento.preventDefault();
        jogar.click();
      }
    };
    window.addEventListener('keydown', aoTeclar);

    // Desabilitado de verdade (não recebe foco nem clique); o "Em breve" faz parte do nome.
    const multiplayer = elemento('button', 'inicio-botao inicio-multiplayer');
    multiplayer.type = 'button';
    multiplayer.disabled = true;
    multiplayer.setAttribute('aria-label', 'Multiplayer, em breve');
    multiplayer.append('Multiplayer', elemento('span', 'inicio-em-breve', 'Em breve'));

    const modos = elemento('div', 'inicio-modos');
    modos.append(jogar, multiplayer);
    const estado = elemento('p', 'inicio-conexao', online ? 'Online' : 'Offline');
    estado.dataset.online = String(online);
    tela.append(imagemDaLogo('inicio-logo'), modos, estado);
    palco.replaceChildren(tela);
    jogar.focus();
  });
}

export async function abrirInicio<C, H>({ carregarCenario, carregarHerois, aoAbrirTitulo }: Opcoes<C, H>): Promise<void> {
  const palco = document.getElementById('inicio');
  if (!palco) throw new Error('faltou o <div id="inicio"> na página');
  const { cenario, herois, online } = await carregamento(palco, { carregarCenario, carregarHerois });
  aoAbrirTitulo(cenario, herois, online);
  await titulo(palco, online);
}
