// A tela da conta, antes da tela inicial: entrar com e-mail e senha, criar conta, o código que
// chega no e-mail e o "esqueci a senha". Com o servidor no ar, a conta é obrigatória (sem ele, o
// jogo segue offline com o apelido, como antes: main.ts). Termina com a pessoa dentro da conta;
// `nova` diz se ela acabou de confirmar o cadastro (aí vem o tutorial).
//
// Criar conta: nome, e-mail e senha → o servidor manda um código de 6 números → digitado o
// código, a conta está pronta e já entra. Entrar com um cadastro que nunca confirmou o e-mail
// também cai na tela do código (o servidor manda um novo). Esqueceu a senha: o código do e-mail e
// a senha nova, e entra.
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
  type Sessao,
} from '@terna/compartilhado';
import type { z } from 'zod';
import { api, ErroApi } from '../rede/api';
import { guardarSessao } from '../save/sessao';
import { anexarCena } from './cena';
import { botao, elemento, imagemDaLogo, mostrarTela, sairComEsmaecer } from './dom';

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

interface Campo {
  rotulo: HTMLLabelElement;
  entrada: HTMLInputElement;
}

function campo(texto: string, tipo: string, autocompletar: string, extra: Partial<HTMLInputElement> = {}): Campo {
  const rotulo = elemento('label', 'inicio-campo');
  const entrada = elemento('input', 'inicio-entrada');
  entrada.type = tipo;
  entrada.setAttribute('autocomplete', autocompletar);
  entrada.spellcheck = false;
  entrada.autocapitalize = 'off';
  Object.assign(entrada, extra);
  rotulo.append(elemento('span', 'inicio-rotulo', texto), entrada);
  return { rotulo, entrada };
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

export function telaConta(aviso = ''): Promise<Entrou> {
  return new Promise((resolver) => {
    const tela = elemento('section', 'inicio-tela inicio-multi-tela inicio-conta-tela');
    const logo = imagemDaLogo('inicio-conta-logo');
    const caixa = elemento('div', 'inicio-caixa inicio-conta-caixa');
    tela.append(logo, caixa);
    anexarCena(tela, true);
    mostrarTela(tela);

    let acabou = false;
    let relogioDoReenvio = 0;
    const pararRelogio = (): void => clearInterval(relogioDoReenvio);

    const terminar = (sessao: Sessao, nova: boolean): void => {
      if (acabou) return;
      acabou = true;
      pararRelogio();
      window.removeEventListener('keydown', aoTeclar);
      guardarSessao(sessao);
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

    // Monta uma vista: o título, o texto, o formulário (com o erro embaixo e o botão principal) e
    // os botões de baixo. `enviar` recebe o botão para mostrar que está esperando.
    const vista = (opcoes: {
      titulo: string;
      sub?: string;
      campos: Campo[];
      principal: string;
      enviar: (pronto: (erro?: string) => void) => void;
      depois?: HTMLElement[];
      voltarPara?: (() => void) | null;
    }): { erro: HTMLParagraphElement; principal: HTMLButtonElement } => {
      pararRelogio();
      voltar = opcoes.voltarPara ?? null;
      const form = elemento('form', 'inicio-conta-form');
      form.noValidate = true; // as mensagens são as do jogo, não as do navegador
      const erro = elemento('p', 'inicio-erro');
      erro.setAttribute('role', 'alert');
      const principal = elemento('button', 'inicio-botao', opcoes.principal);
      principal.type = 'submit';
      form.append(...opcoes.campos.map((c) => c.rotulo), erro, principal);
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
      for (const c of opcoes.campos) c.entrada.addEventListener('input', () => (erro.textContent = ''));
      const partes: HTMLElement[] = [elemento('h1', 'inicio-titulo', opcoes.titulo)];
      if (opcoes.sub) partes.push(elemento('p', 'inicio-sub', opcoes.sub));
      partes.push(form, ...(opcoes.depois ?? []));
      caixa.replaceChildren(...partes);
      (opcoes.campos.find((c) => !c.entrada.value) ?? opcoes.campos[0])?.entrada.focus({ preventScroll: true });
      return { erro, principal };
    };

    const link = (texto: string, aoClicar: () => void): HTMLButtonElement => botao(texto, 'inicio-link', aoClicar);
    const separador = (): HTMLElement => elemento('p', 'inicio-ou', 'ou');

    // ---- Entrar ----
    const entrar = (emailInicial = '', avisoInicial = ''): void => {
      const email = campo('E-mail', 'email', 'username', { placeholder: 'voce@exemplo.com', value: emailInicial, maxLength: 254 });
      const senha = campo('Senha', 'password', 'current-password', { maxLength: 200 });
      const { erro } = vista({
        titulo: 'Entrar',
        sub: 'Entre na sua conta para jogar.',
        campos: [email, senha],
        principal: 'Entrar',
        depois: [
          link('Esqueci a senha', () => esqueci(email.entrada.value.trim())),
          separador(),
          botao('Criar conta', 'inicio-botao inicio-botao-claro', () => criar(email.entrada.value.trim())),
        ],
        enviar: (pronto) => {
          const login = email.entrada.value.trim();
          if (!login) return pronto('Escreva seu e-mail.');
          if (!senha.entrada.value) return pronto('Escreva sua senha.');
          api.entrar({ login, senha: senha.entrada.value }).then(
            (sessao) => terminar(sessao, false),
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
      const dicaNome = elemento('span', 'inicio-campo-dica', 'Aparece em cima do seu personagem na partida.');
      nome.rotulo.append(dicaNome);
      const email = campo('E-mail', 'email', 'email', { placeholder: 'voce@exemplo.com', value: emailInicial, maxLength: 254 });
      const senha = campo('Senha', 'password', 'new-password', { maxLength: 200, placeholder: 'Pelo menos 8 caracteres' });
      vista({
        titulo: 'Criar conta',
        sub: 'Vamos mandar um código para o seu e-mail.',
        campos: [nome, email, senha],
        principal: 'Criar conta',
        voltarPara: () => entrar(email.entrada.value.trim()),
        depois: [separador(), botao('Já tenho conta', 'inicio-botao inicio-botao-claro', () => entrar(email.entrada.value.trim()))],
        enviar: (pronto) => {
          const dados = { nome: nome.entrada.value, email: email.entrada.value, senha: senha.entrada.value };
          const errado =
            problema(NomeJogador, dados.nome) ?? problema(Email, dados.email) ?? problema(Senha, dados.senha);
          if (errado) return pronto(errado);
          const valido = CriarConta.parse(dados);
          api.criarConta(valido).then(
            (r) => codigo(r.email, undefined, r.reenviarEm),
            (e: unknown) => pronto(mensagemDoErro(e)),
          );
        },
      });
    };

    // Mostra o tempo até poder pedir outro código no botão (e o acende quando chegar a hora).
    const contarReenvio = (b: HTMLButtonElement, texto: string, segundos: number): void => {
      pararRelogio();
      let falta = Math.max(0, Math.round(segundos));
      const pintar = (): void => {
        b.disabled = falta > 0;
        b.textContent = falta > 0 ? `${texto} (${relogio(falta)})` : texto;
      };
      pintar();
      relogioDoReenvio = window.setInterval(() => {
        falta = Math.max(0, falta - 1);
        pintar();
        if (falta === 0) pararRelogio();
      }, 1000);
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
      const { erro } = vista({
        titulo: 'Olhe seu e-mail',
        campos: [c],
        principal: 'Confirmar',
        voltarPara: () => entrar(email),
        depois: [avisoDoEnvio, reenviar, separador(), botao('Trocar e-mail', 'inicio-botao inicio-botao-claro', () => criar(email))],
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
      caixa.querySelector('h1')?.after(sub);
      contarReenvio(reenviar, 'Reenviar código', reenviarEm);
      // Os 6 números digitados (ou colados): confirma sozinho.
      c.entrada.addEventListener('input', () => {
        if (c.entrada.value.length === TAMANHO_CODIGO_EMAIL) c.entrada.form?.requestSubmit();
      });
    };

    // ---- Esqueci a senha: o e-mail ----
    const esqueci = (emailInicial = ''): void => {
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
          const valido = Email.parse(email.entrada.value);
          api.esqueciSenha(valido).then(
            (r) => novaSenha(r.email, r.reenviarEm),
            (e: unknown) => pronto(mensagemDoErro(e)),
          );
        },
      });
    };

    // ---- Esqueci a senha: o código e a senha nova ----
    const novaSenha = (email: string, reenviarEm: number): void => {
      const c = campoDoCodigo();
      const senha = campo('Senha nova', 'password', 'new-password', { maxLength: 200, placeholder: 'Pelo menos 8 caracteres' });
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
      const { erro } = vista({
        titulo: 'Senha nova',
        campos: [c, senha],
        principal: 'Trocar e entrar',
        voltarPara: () => entrar(email),
        depois: [reenviar, separador(), botao('Voltar', 'inicio-botao inicio-botao-claro', () => entrar(email))],
        enviar: (pronto) => {
          const errado = problema(CodigoEmail, c.entrada.value) ?? problema(Senha, senha.entrada.value);
          if (errado) return pronto(errado);
          api.trocarSenha({ email, codigo: c.entrada.value, senha: senha.entrada.value }).then(
            (sessao) => terminar(sessao, false),
            (e: unknown) => pronto(mensagemDoErro(e)),
          );
        },
      });
      caixa.querySelector('h1')?.after(sub);
      caixa.querySelector('form')?.prepend(usuario);
      contarReenvio(reenviar, 'Reenviar código', reenviarEm);
    };

    entrar('', aviso);
  });
}
