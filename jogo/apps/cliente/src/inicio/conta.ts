// A tela da conta, antes da tela inicial: entrar com e-mail e senha, criar conta, o código que
// chega no e-mail e o "esqueci a senha". O Terna é online e a conta é obrigatória. Termina com a
// pessoa dentro da conta; `nova` diz se ela acabou de confirmar o cadastro (aí vem o tutorial).
//
// Entrar com o Google (nas duas abas, embaixo do botão principal, depois de um "ou"): o botão
// oficial do Google (google.ts). A conta Google que já tem conta (ou cujo e-mail já tem) entra
// direto; a nova escolhe o nome de jogador (com a sugestão do nome da conta Google) e entra.
//
// Criar conta: nome, e-mail, senha e a senha de novo → o servidor manda um código de 6 números →
// digitado o código, a conta está pronta e já entra. Entrar com um cadastro que nunca confirmou o
// e-mail também cai na tela do código (o servidor manda um novo). Esqueceu a senha: o código do
// e-mail e a senha nova (duas vezes), e entra.
//
// A tela: só a caixa, no meio da caverna escura (caverna.ts), com duas tochas grandes acesas
// subindo do chão, uma de cada lado (tocha.ts), as abas Entrar / Criar conta no alto da caixa, o
// botão da música no canto (como na tela inicial) e a versão no outro. Os campos de senha têm o
// olho para mostrar o que foi digitado e avisam do Caps Lock; o de criar mostra a força da senha
// e se a repetida bate.
//
// No jogo rodando em casa (npm run dev, servidor sem e-mail de verdade), a tela do código mostra o
// código que o servidor gerou — o e-mail não sai do localhost (rotas/contas.ts: /teste/codigo).
//
// Cada vista é um <form>: o Enter envia, e o navegador oferece guardar a senha (e preenche o
// código que chega no celular, onde dá). Esc volta para a vista de entrar.

import {
  CodigoEmail,
  CriarConta,
  ERRO_EMAIL_NAO_CONFIRMADO,
  Email,
  NomeJogador,
  Senha,
  TAMANHO_CODIGO_EMAIL,
  type Jogador,
  type RespostaGoogle,
  type Sessao,
} from '@terna/compartilhado';
import type { z } from 'zod';
import { api, ErroApi } from '../rede/api';
import { guardarSessao } from '../save/sessao';
import { VERSAO } from '../versao';
import { criarCaverna } from './caverna';
import { esconderCena } from './cena';
import { botao, elemento, mostrarTela, sairComEsmaecer, TELA_OPACA } from './dom';
import { botaoDoGoogle, googleLigado } from './google';
import { botaoDaMusica } from './musica';
import { criarTocha } from './tocha';

const SUBIDA_DAS_TOCHAS_MS = 900; // o CSS (inicio-tocha-sobe) usa o mesmo
const ACENDER_S = 0.8; // segundos do fogo crescendo depois que a tocha chega

export interface Entrou {
  jogador: Jogador;
  nova: boolean; // acabou de confirmar o cadastro
}

// "esse nome já está em uso" → "Esse nome já está em uso."
const frase = (texto: string): string => {
  const t = texto.trim();
  return `${t.charAt(0).toUpperCase()}${t.slice(1)}${/[.!?]$/.test(t) ? '' : '.'}`;
};

const mensagemDoErro = (erro: unknown): string =>
  frase(erro instanceof ErroApi ? erro.message : 'algo deu errado; tente de novo');

// O primeiro problema de um valor no esquema, pronto para mostrar.
function problema<T>(esquema: z.ZodType<T>, valor: unknown): string | null {
  const r = esquema.safeParse(valor);
  return r.success ? null : frase(r.error.issues[0]?.message ?? 'valor inválido');
}

// ---- Peças ----

// Um ícone em pixels ('#' aceso), na cor do texto.
function iconeDePixels(linhas: string[], classe: string): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${linhas[0].length} ${linhas.length}`);
  svg.setAttribute('class', classe);
  svg.setAttribute('aria-hidden', 'true');
  linhas.forEach((linha, y) => {
    for (const trecho of linha.matchAll(/#+/g)) {
      const r = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      r.setAttribute('x', String(trecho.index));
      r.setAttribute('y', String(y));
      r.setAttribute('width', String(trecho[0].length));
      r.setAttribute('height', '1');
      svg.append(r);
    }
  });
  return svg;
}

// O olho aberto (mostrando a senha) e fechado (escondendo).
const OLHO_ABERTO = ['...#####...', '.##.....##.', '#...###...#', '#..#####..#', '#...###...#', '.##.....##.', '...#####...'];
const OLHO_FECHADO = ['...........', '...........', '#.........#', '.##.....##.', '...#####...', '..#..#..#..', '.#...#...#.'];

// Um campo: o bloco com o rótulo (e, do lado, o contador ou o "Esqueci a senha"), a entrada e a
// linha de baixo. O <label> é só o texto, ligado à entrada pelo id: os botões do lado ficam fora
// dele (dentro, clicar no rótulo apertaria o botão).
interface Campo {
  rotulo: HTMLElement;
  entrada: HTMLInputElement;
  aviso: HTMLSpanElement; // a linha embaixo do campo (dica, Caps Lock, se a senha bate)
}

let proximoId = 0;

function campo(texto: string, tipo: string, autocompletar: string, extra: Partial<HTMLInputElement> = {}): Campo {
  const rotulo = elemento('div', 'inicio-campo');
  const cabeca = elemento('span', 'inicio-campo-cabeca');
  const id = `conta-campo-${++proximoId}`;
  const nome = elemento('label', 'inicio-rotulo', texto);
  nome.htmlFor = id;
  cabeca.append(nome);
  const entrada = elemento('input', 'inicio-entrada');
  entrada.id = id;
  entrada.type = tipo;
  entrada.setAttribute('autocomplete', autocompletar);
  entrada.spellcheck = false;
  entrada.autocapitalize = 'off';
  Object.assign(entrada, extra);
  const aviso = elemento('span', 'inicio-campo-dica');
  aviso.setAttribute('aria-live', 'polite');
  rotulo.append(cabeca, entrada, aviso);
  return { rotulo, entrada, aviso };
}

// A senha: com o olho para mostrar ou esconder o que foi digitado, e o aviso do Caps Lock.
function campoDeSenha(texto: string, autocompletar: string, placeholder = ''): Campo {
  const c = campo(texto, 'password', autocompletar, { maxLength: 200, placeholder });
  const caixa = elemento('span', 'inicio-senha');
  c.entrada.replaceWith(caixa);
  const olho = elemento('button', 'inicio-olho');
  olho.type = 'button';
  const pintar = (): void => {
    const mostrando = c.entrada.type === 'text';
    olho.replaceChildren(iconeDePixels(mostrando ? OLHO_ABERTO : OLHO_FECHADO, 'inicio-olho-icone'));
    olho.setAttribute('aria-label', mostrando ? 'Esconder a senha' : 'Mostrar a senha');
    olho.setAttribute('aria-pressed', String(mostrando));
    olho.title = mostrando ? 'Esconder a senha' : 'Mostrar a senha';
  };
  olho.addEventListener('click', (evento) => {
    evento.preventDefault();
    c.entrada.type = c.entrada.type === 'password' ? 'text' : 'password';
    pintar();
    c.entrada.focus({ preventScroll: true });
  });
  // O clique no olho não tira o foco do campo (nem fecha o teclado no celular).
  olho.addEventListener('pointerdown', (evento) => evento.preventDefault());
  pintar();
  caixa.append(c.entrada, olho);
  // Caps Lock: avisa embaixo do campo enquanto estiver ligado.
  const capsLock = (evento: KeyboardEvent): void => {
    const ligado = evento.getModifierState?.('CapsLock') ?? false;
    c.rotulo.classList.toggle('inicio-campo-caps', ligado);
  };
  c.entrada.addEventListener('keydown', capsLock);
  c.entrada.addEventListener('keyup', capsLock);
  c.entrada.addEventListener('blur', () => c.rotulo.classList.remove('inicio-campo-caps'));
  c.rotulo.append(elemento('span', 'inicio-campo-caps-aviso', 'Caps Lock ligado'));
  return c;
}

// Quão difícil de adivinhar: 0 (curta demais) a 3. Só informa; o mínimo é 8 caracteres.
function forcaDaSenha(senha: string): 0 | 1 | 2 | 3 {
  if (senha.length < 8) return 0;
  const tipos = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(senha)).length;
  let pontos = 1;
  if (senha.length >= 12) pontos++;
  if (tipos >= 3) pontos++;
  return Math.min(3, pontos) as 1 | 2 | 3;
}

const NOME_DA_FORCA = ['Curta demais', 'Fraca', 'Boa', 'Forte'];

// A barrinha de força embaixo da senha nova.
function medidorDeForca(senha: Campo): HTMLElement {
  const medidor = elemento('span', 'inicio-forca');
  const barras = [0, 1, 2].map(() => elemento('span', 'inicio-forca-barra'));
  const nome = elemento('span', 'inicio-forca-nome');
  medidor.append(...barras, nome);
  const pintar = (): void => {
    const valor = senha.entrada.value;
    const forca = forcaDaSenha(valor);
    medidor.dataset.forca = String(forca);
    medidor.hidden = !valor;
    nome.textContent = NOME_DA_FORCA[forca];
    barras.forEach((b, i) => b.classList.toggle('inicio-forca-cheia', i < forca));
  };
  senha.entrada.addEventListener('input', pintar);
  pintar();
  return medidor;
}

// A senha de novo: diz embaixo se bate com a primeira.
function ligarRepetida(senha: Campo, repetida: Campo): void {
  const pintar = (): void => {
    const r = repetida.entrada.value;
    if (!r) {
      repetida.aviso.textContent = '';
      delete repetida.rotulo.dataset.bate;
      return;
    }
    const bate = r === senha.entrada.value;
    repetida.rotulo.dataset.bate = String(bate);
    repetida.aviso.textContent = bate ? '✓ As senhas batem' : 'As senhas não batem';
  };
  senha.entrada.addEventListener('input', pintar);
  repetida.entrada.addEventListener('input', pintar);
}

// O código: um campo só, grande, com os números espaçados (como os blocos do e-mail).
function campoDoCodigo(): Campo {
  const c = campo('Código', 'text', 'one-time-code', {
    inputMode: 'numeric',
    maxLength: TAMANHO_CODIGO_EMAIL,
    placeholder: '······',
    pattern: '[0-9]*',
  });
  c.entrada.classList.add('inicio-codigo-email');
  c.entrada.setAttribute('aria-label', `Código de ${TAMANHO_CODIGO_EMAIL} números`);
  // Só números (colando "123 456" ou com o texto do e-mail junto, fica só o código).
  c.entrada.addEventListener('input', () => {
    const numeros = c.entrada.value.replace(/\D/g, '').slice(0, TAMANHO_CODIGO_EMAIL);
    if (numeros !== c.entrada.value) c.entrada.value = numeros;
  });
  return c;
}

const relogio = (s: number): string => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

// ---- A tela ----

export function telaConta(aviso = ''): Promise<Entrou> {
  return new Promise((resolver) => {
    // Opaca (dom.ts): a caverna cobre o jogo todo e aparece do escuro. Sem isso a cortina abria antes
    // de a caverna chegar e a partida que roda atrás aparecia por um instante.
    const tela = elemento('section', `inicio-tela ${TELA_OPACA} inicio-multi-tela inicio-conta-tela`);
    const caixa = elemento('div', 'inicio-caixa inicio-conta-caixa');
    const centro = elemento('div', 'inicio-conta-centro');
    centro.append(caixa);
    // As tochas sobem do chão e, chegando, o fogo acende.
    const tochas = [criarTocha('esquerda'), criarTocha('direita')];
    const atalhos = elemento('div', 'inicio-atalhos');
    atalhos.append(botaoDaMusica('inicio-botao inicio-botao-claro inicio-atalho'));
    // O fundo é a caverna (caverna.ts), com as tochas dentro dela: ela escurece e ficam as luzes
    // do fogo. A floresta dos menus sai daqui (volta na tela inicial).
    const caverna = criarCaverna(tochas);
    tela.append(caverna.el, centro, atalhos, elemento('p', 'inicio-versao', VERSAO));
    esconderCena();
    mostrarTela(tela);

    const comeco = performance.now();
    let anterior = comeco;
    const animar = (agora: number): void => {
      if (!tela.isConnected) return;
      const dt = Math.min(0.1, (agora - anterior) / 1000);
      anterior = agora;
      const acesa = Math.max(0, Math.min(1, (agora - comeco - SUBIDA_DAS_TOCHAS_MS * 0.6) / 1000 / ACENDER_S));
      for (const t of tochas) t.quadro(dt, acesa);
      caverna.quadro(dt);
      requestAnimationFrame(animar);
    };
    requestAnimationFrame(animar);

    let acabou = false;
    let relogioDoReenvio = 0;
    let buscaDoCodigo = 0;
    const pararRelogios = (): void => {
      clearInterval(relogioDoReenvio);
      clearTimeout(buscaDoCodigo);
    };

    const terminar = (sessao: Sessao, nova: boolean, lembrar = true): void => {
      if (acabou) return;
      acabou = true;
      pararRelogios();
      window.removeEventListener('keydown', aoTeclar);
      guardarSessao(sessao, lembrar);
      void sairComEsmaecer(tela).then(() => resolver({ jogador: sessao.jogador, nova }));
    };

    let voltar: (() => void) | null = null;
    const aoTeclar = (evento: KeyboardEvent): void => {
      if (evento.code === 'Escape' && voltar) {
        evento.preventDefault();
        voltar();
      }
    };
    window.addEventListener('keydown', aoTeclar);

    // As abas do alto da caixa, nas vistas de entrar e de criar conta.
    const abas = (ativa: 'entrar' | 'criar', email: () => string): HTMLElement => {
      const lista = elemento('div', 'inicio-conta-abas');
      lista.setAttribute('role', 'tablist');
      const aba = (texto: string, qual: 'entrar' | 'criar', abrir: () => void): HTMLButtonElement => {
        const b = botao(texto, 'inicio-conta-aba', () => {
          if (qual !== ativa) abrir();
        });
        b.setAttribute('role', 'tab');
        b.setAttribute('aria-selected', String(qual === ativa));
        return b;
      };
      lista.append(aba('Entrar', 'entrar', () => entrar(email())), aba('Criar conta', 'criar', () => criar(email())));
      return lista;
    };

    // Monta uma vista: as abas (se houver), o título, o texto, o formulário (com o erro embaixo e
    // o botão principal) e o que vem depois.
    const vista = (opcoes: {
      abas?: HTMLElement;
      titulo?: string;
      sub?: string | HTMLElement;
      campos: (Campo | HTMLElement)[];
      principal: string;
      enviar: (pronto: (erro?: string) => void) => void;
      depois?: HTMLElement[];
      voltarPara?: (() => void) | null;
      longa?: boolean; // muitos campos: a caixa fica mais justa, para caber sem rolar
    }): { erro: HTMLParagraphElement; form: HTMLFormElement } => {
      pararRelogios();
      tela.classList.toggle('inicio-conta-longa', Boolean(opcoes.longa));
      voltar = opcoes.voltarPara ?? null;
      const form = elemento('form', 'inicio-conta-form');
      form.noValidate = true; // as mensagens são as do jogo, não as do navegador
      const erro = elemento('p', 'inicio-erro');
      erro.setAttribute('role', 'alert');
      const principal = elemento('button', 'inicio-botao inicio-conta-principal', opcoes.principal);
      principal.type = 'submit';
      const campos = opcoes.campos.filter((c): c is Campo => 'entrada' in c);
      form.append(...opcoes.campos.map((c) => ('rotulo' in c ? c.rotulo : c)), erro, principal);
      let esperando = false;
      form.addEventListener('submit', (evento) => {
        evento.preventDefault();
        if (esperando) return;
        esperando = true;
        erro.textContent = '';
        principal.disabled = true;
        principal.dataset.esperando = 'true';
        opcoes.enviar((mensagem) => {
          esperando = false;
          principal.disabled = false;
          delete principal.dataset.esperando;
          if (mensagem) erro.textContent = mensagem;
        });
      });
      for (const c of campos) c.entrada.addEventListener('input', () => (erro.textContent = ''));
      const partes: HTMLElement[] = [];
      if (opcoes.abas) partes.push(opcoes.abas);
      if (opcoes.titulo) partes.push(elemento('h1', 'inicio-titulo', opcoes.titulo));
      if (typeof opcoes.sub === 'string') partes.push(elemento('p', 'inicio-sub', opcoes.sub));
      else if (opcoes.sub) partes.push(opcoes.sub);
      partes.push(form, ...(opcoes.depois ?? []));
      caixa.replaceChildren(...partes);
      (campos.find((c) => !c.entrada.value) ?? campos[0])?.entrada.focus({ preventScroll: true });
      return { erro, form };
    };

    const link = (texto: string, aoClicar: () => void): HTMLButtonElement => botao(texto, 'inicio-link', aoClicar);

    // ---- Com o Google ----
    // O "ou" e o botão do Google, embaixo do botão principal (nada, sem o Client ID). `erro`: onde
    // a vista mostra o erro; `lembrar`: o "Manter conectado" da vista.
    const comGoogle = (erro: () => HTMLParagraphElement, lembrar: () => boolean): HTMLElement[] => {
      if (!googleLigado()) return [];
      const ou = elemento('p', 'inicio-conta-ou');
      ou.append(elemento('span', '', 'ou'));
      const lugar = botaoDoGoogle(
        (credencial) => {
          erro().textContent = '';
          lugar.dataset.esperando = 'true';
          api.entrarComGoogle({ credencial }).then(
            (r) => {
              delete lugar.dataset.esperando;
              seguirComGoogle(r, credencial, lembrar());
            },
            (e: unknown) => {
              delete lugar.dataset.esperando;
              erro().textContent = mensagemDoErro(e);
            },
          );
        },
        () => {
          ou.hidden = true;
          lugar.hidden = true;
        },
      );
      return [ou, lugar];
    };

    // Entrou (a conta já existia) ou, conta nova, a vista do nome.
    const seguirComGoogle = (r: RespostaGoogle, credencial: string, lembrar: boolean): void => {
      if ('token' in r) return terminar(r, false, lembrar);
      nomeDoGoogle(credencial, r.email, r.sugestao, lembrar);
    };

    // ---- Conta nova pelo Google: o nome de jogador ----
    const nomeDoGoogle = (credencial: string, email: string, sugestao: string, lembrar: boolean): void => {
      const nome = campo('Nome de jogador', 'text', 'nickname', { maxLength: 12, placeholder: 'Como te chamam?', value: sugestao });
      const contador = elemento('span', 'inicio-campo-contador', `${sugestao.length}/12`);
      nome.rotulo.querySelector('.inicio-campo-cabeca')?.append(contador);
      nome.aviso.textContent = 'Aparece em cima do seu personagem. A primeira troca depois é grátis.';
      nome.entrada.addEventListener('input', () => (contador.textContent = `${nome.entrada.value.length}/12`));
      const sub = elemento('p', 'inicio-sub');
      sub.append('Falta só o nome para a conta de ', elemento('strong', 'inicio-conta-email', email), '.');
      vista({
        titulo: 'Escolha seu nome',
        sub,
        campos: [nome],
        principal: 'Criar conta',
        voltarPara: () => entrar(),
        depois: [botao('Voltar', 'inicio-botao inicio-botao-claro', () => entrar())],
        enviar: (pronto) => {
          const errado = problema(NomeJogador, nome.entrada.value);
          if (errado) return pronto(errado);
          api.entrarComGoogle({ credencial, nome: NomeJogador.parse(nome.entrada.value) }).then(
            (r) => ('token' in r ? terminar(r, true, lembrar) : pronto('Algo deu errado; tente de novo.')),
            // O token do Google vence em uma hora: vencido, volta para entrar e clicar de novo.
            (e: unknown) =>
              e instanceof ErroApi && e.status === 401 ? entrar('', 'O tempo para criar a conta acabou. Clique em Continuar com o Google de novo.') : pronto(mensagemDoErro(e)),
          );
        },
      });
      nome.entrada.select();
    };

    // ---- Entrar ----
    const entrar = (emailInicial = '', avisoInicial = ''): void => {
      const email = campo('E-mail', 'email', 'username', { placeholder: 'voce@exemplo.com', value: emailInicial, maxLength: 254 });
      const senha = campoDeSenha('Senha', 'current-password');
      const esqueci = link('Esqueci a senha', () => esqueciSenha(email.entrada.value.trim()));
      esqueci.classList.add('inicio-conta-esqueci');
      senha.rotulo.querySelector('.inicio-campo-cabeca')?.append(esqueci);
      // Manter conectado: a sessão fica para as próximas visitas (senão, só até fechar a aba).
      const manter = elemento('label', 'inicio-marcar');
      const marca = elemento('input', '');
      marca.type = 'checkbox';
      marca.checked = true;
      manter.append(marca, elemento('span', '', 'Manter conectado neste computador'));
      const { erro } = vista({
        abas: abas('entrar', () => email.entrada.value.trim()),
        sub: 'Bem-vindo de volta! Entre para jogar.',
        campos: [email, senha, manter],
        principal: 'Entrar',
        depois: comGoogle(() => erro, () => marca.checked),
        enviar: (pronto) => {
          const login = email.entrada.value.trim();
          if (!login) return pronto('Escreva seu e-mail.');
          if (!senha.entrada.value) return pronto('Escreva sua senha.');
          api.entrar({ login, senha: senha.entrada.value }).then(
            (sessao) => terminar(sessao, false, marca.checked),
            (e: unknown) => {
              // A conta existe mas o e-mail nunca foi confirmado: o código novo já foi mandado.
              if (e instanceof ErroApi && e.status === 403 && e.message === ERRO_EMAIL_NAO_CONFIRMADO) {
                const confirmado = Email.safeParse(login);
                return codigo(confirmado.success ? confirmado.data : login, 'Sua conta ainda não foi confirmada. Mandamos um código novo para o seu e-mail.');
              }
              pronto(mensagemDoErro(e));
            },
          );
        },
      });
      if (avisoInicial) erro.textContent = avisoInicial;
    };

    // ---- Criar conta ----
    const criar = (emailInicial = ''): void => {
      const nome = campo('Nome de jogador', 'text', 'nickname', { maxLength: 12, placeholder: 'Como te chamam?' });
      const contador = elemento('span', 'inicio-campo-contador', '0/12');
      nome.rotulo.querySelector('.inicio-campo-cabeca')?.append(contador);
      nome.aviso.textContent = 'Aparece em cima do seu personagem. A primeira troca depois é grátis.';
      nome.entrada.addEventListener('input', () => (contador.textContent = `${nome.entrada.value.length}/12`));
      const email = campo('E-mail', 'email', 'email', { placeholder: 'voce@exemplo.com', value: emailInicial, maxLength: 254 });
      const senha = campoDeSenha('Senha', 'new-password', 'Pelo menos 8 caracteres');
      senha.aviso.replaceWith(medidorDeForca(senha));
      const repetida = campoDeSenha('Repetir a senha', 'new-password', 'A mesma senha de novo');
      ligarRepetida(senha, repetida);
      const { erro } = vista({
        abas: abas('criar', () => email.entrada.value.trim()),
        sub: 'Crie sua conta: leva menos de um minuto.',
        campos: [nome, email, senha, repetida],
        principal: 'Criar conta',
        longa: true,
        depois: comGoogle(() => erro, () => true),
        voltarPara: () => entrar(email.entrada.value.trim()),
        enviar: (pronto) => {
          const dados = { nome: nome.entrada.value, email: email.entrada.value, senha: senha.entrada.value };
          const errado = problema(NomeJogador, dados.nome) ?? problema(Email, dados.email) ?? problema(Senha, dados.senha);
          if (errado) return pronto(errado);
          if (repetida.entrada.value !== dados.senha) return pronto('As duas senhas não batem.');
          api.criarConta(CriarConta.parse(dados)).then(
            (r) => codigo(r.email, undefined, r.reenviarEm),
            (e: unknown) => pronto(mensagemDoErro(e)),
          );
        },
      });
    };

    // Mostra o tempo até poder pedir outro código no botão (e o acende quando chegar a hora).
    const contarReenvio = (b: HTMLButtonElement, texto: string, segundos: number): void => {
      clearInterval(relogioDoReenvio);
      let falta = Math.max(0, Math.round(segundos));
      const pintar = (): void => {
        b.disabled = falta > 0;
        b.textContent = falta > 0 ? `${texto} (${relogio(falta)})` : texto;
      };
      pintar();
      relogioDoReenvio = window.setInterval(() => {
        falta = Math.max(0, falta - 1);
        pintar();
        if (falta === 0) clearInterval(relogioDoReenvio);
      }, 1000);
    };

    // Só no jogo em casa: o servidor sem e-mail de verdade diz o código, e a tela mostra. No site
    // publicado isto nem existe (o import.meta.env.DEV some do build).
    const mostrarCodigoDeTeste = (email: string, lugar: HTMLElement, usar: (codigo: string) => void): void => {
      if (!import.meta.env.DEV) return;
      let tentativas = 0;
      let mostrado = '';
      const buscar = (): void => {
        api.codigoDeTeste(email).then(
          (codigo) => {
            if (codigo !== mostrado) {
              mostrado = codigo;
              const usarBotao = botao('Usar', 'inicio-botao inicio-conta-teste-usar', () => usar(codigo));
              const texto = elemento('span', 'inicio-conta-teste-texto');
              texto.append('Teste em casa: o e-mail não sai do localhost. Seu código é ', elemento('strong', '', codigo), '.');
              lugar.replaceChildren(texto, usarBotao);
              lugar.hidden = false;
            }
            buscaDoCodigo = window.setTimeout(buscar, 2000); // um código novo (reenviar) aparece também
          },
          () => {
            // 404 (servidor de verdade, ou com o Brevo): não é o modo de teste. Tenta mais um pouco
            // no começo (o código pode estar saindo) e desiste.
            if (++tentativas < 4) buscaDoCodigo = window.setTimeout(buscar, 1000);
          },
        );
      };
      buscar();
    };

    // ---- O código do cadastro ----
    const codigo = (email: string, avisoInicial?: string, reenviarEm = 60): void => {
      const c = campoDoCodigo();
      const reenviar = link('Reenviar código', () => {
        reenviar.disabled = true;
        api.reenviarCodigo(email).then(
          (r) => {
            erro.textContent = '';
            avisoDoEnvio.textContent = r.reenviarEm >= 60 ? 'Código novo enviado! O anterior não vale mais.' : 'O código anterior ainda vale.';
            contarReenvio(reenviar, 'Reenviar código', r.reenviarEm);
          },
          (e: unknown) => {
            erro.textContent = mensagemDoErro(e);
            reenviar.disabled = false;
          },
        );
      });
      const avisoDoEnvio = elemento('p', 'inicio-conta-aviso', avisoInicial ?? 'Não chegou? Olhe no spam ou nas promoções.');
      avisoDoEnvio.setAttribute('aria-live', 'polite');
      const sub = elemento('p', 'inicio-sub');
      sub.append('Mandamos um código de 6 números para ', elemento('strong', 'inicio-conta-email', email), '.');
      const teste = elemento('div', 'inicio-conta-teste');
      teste.hidden = true;
      const { erro, form } = vista({
        titulo: 'Olhe seu e-mail',
        sub,
        campos: [teste, c],
        principal: 'Confirmar',
        voltarPara: () => entrar(email),
        depois: [avisoDoEnvio, reenviar, botao('Trocar e-mail', 'inicio-botao inicio-botao-claro', () => criar(email))],
        enviar: (pronto) => {
          const errado = problema(CodigoEmail, c.entrada.value);
          if (errado) return pronto(errado);
          api.confirmarEmail({ email, codigo: c.entrada.value }).then(
            (sessao) => terminar(sessao, true),
            (e: unknown) => {
              c.entrada.select();
              pronto(mensagemDoErro(e));
            },
          );
        },
      });
      contarReenvio(reenviar, 'Reenviar código', reenviarEm);
      // Os 6 números digitados (ou colados): confirma sozinho.
      c.entrada.addEventListener('input', () => {
        if (c.entrada.value.length === TAMANHO_CODIGO_EMAIL) form.requestSubmit();
      });
      mostrarCodigoDeTeste(email, teste, (cod) => {
        c.entrada.value = cod;
        form.requestSubmit();
      });
    };

    // ---- Esqueci a senha: o e-mail ----
    const esqueciSenha = (emailInicial = ''): void => {
      const email = campo('E-mail', 'email', 'username', { placeholder: 'voce@exemplo.com', value: emailInicial, maxLength: 254 });
      vista({
        titulo: 'Esqueci a senha',
        sub: 'Mandamos um código para o seu e-mail e você escolhe uma senha nova.',
        campos: [email],
        principal: 'Mandar código',
        voltarPara: () => entrar(email.entrada.value.trim()),
        depois: [botao('Voltar', 'inicio-botao inicio-botao-claro', () => entrar(email.entrada.value.trim()))],
        enviar: (pronto) => {
          const errado = problema(Email, email.entrada.value);
          if (errado) return pronto(errado);
          api.esqueciSenha(Email.parse(email.entrada.value)).then(
            (r) => novaSenha(r.email, r.reenviarEm),
            (e: unknown) => pronto(mensagemDoErro(e)),
          );
        },
      });
    };

    // ---- Esqueci a senha: o código e a senha nova ----
    const novaSenha = (email: string, reenviarEm: number): void => {
      const c = campoDoCodigo();
      const senha = campoDeSenha('Senha nova', 'new-password', 'Pelo menos 8 caracteres');
      senha.aviso.replaceWith(medidorDeForca(senha));
      const repetida = campoDeSenha('Repetir a senha nova', 'new-password', 'A mesma senha de novo');
      ligarRepetida(senha, repetida);
      const usuario = elemento('input', '');
      // Para o gerenciador de senhas saber de qual conta é a senha nova.
      Object.assign(usuario, { type: 'email', value: email, hidden: true, autocomplete: 'username' });
      const reenviar = link('Reenviar código', () => {
        reenviar.disabled = true;
        api.esqueciSenha(email).then(
          (r) => contarReenvio(reenviar, 'Reenviar código', r.reenviarEm),
          (e: unknown) => {
            erro.textContent = mensagemDoErro(e);
            reenviar.disabled = false;
          },
        );
      });
      const sub = elemento('p', 'inicio-sub');
      sub.append('Se houver conta com ', elemento('strong', 'inicio-conta-email', email), ', o código chega em instantes.');
      const teste = elemento('div', 'inicio-conta-teste');
      teste.hidden = true;
      const { erro } = vista({
        titulo: 'Senha nova',
        sub,
        campos: [usuario, teste, c, senha, repetida],
        principal: 'Trocar e entrar',
        longa: true,
        voltarPara: () => entrar(email),
        depois: [reenviar, botao('Voltar', 'inicio-botao inicio-botao-claro', () => entrar(email))],
        enviar: (pronto) => {
          const errado = problema(CodigoEmail, c.entrada.value) ?? problema(Senha, senha.entrada.value);
          if (errado) return pronto(errado);
          if (repetida.entrada.value !== senha.entrada.value) return pronto('As duas senhas não batem.');
          api.trocarSenha({ email, codigo: c.entrada.value, senha: senha.entrada.value }).then(
            (sessao) => terminar(sessao, false),
            (e: unknown) => pronto(mensagemDoErro(e)),
          );
        },
      });
      contarReenvio(reenviar, 'Reenviar código', reenviarEm);
      mostrarCodigoDeTeste(email, teste, (cod) => {
        c.entrada.value = cod;
        senha.entrada.focus();
      });
    };

    entrar('', aviso);
  });
}
