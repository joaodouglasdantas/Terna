// O perfil da conta, na tela inicial: um botão no canto de cima com o ícone e o nome, que abre o
// painel do perfil por cima da tela. No painel:
// - o ícone: os ícones de perfil (ICONES de @terna/compartilhado; hoje, os comuns), o escolhido
//   marcado — clicou, trocou;
// - o código do jogador (único, para identificar a conta), com o botão de copiar;
// - o nome: a primeira troca é grátis (na hora: quem escolheu o nome no cadastro não espera); as
//   outras respeitam a regra (DIAS_ENTRE_TROCAS_DE_NOME entre uma e outra; o servidor diz quando
//   fica livre de novo) — a conta mestre troca quando quiser;
// - o modo mestre, só na conta dona do jogo: desligado, ela joga como uma conta comum (com os
//   prazos e sem os atalhos de teste), para testar o que todo mundo vê;
// - sair da conta.
// Cada mudança vai para o servidor e a conta guardada neste navegador é atualizada (sessao.ts).

import { DIAS_ENTRE_TROCAS_DE_NOME, ICONES, NomeJogador, type IdIcone, type Jogador } from '@terna/compartilhado';
import urlFlorDeChapeu from '../assets/icones/flor-de-chapeu.webp';
import urlGolemDoNinho from '../assets/icones/golem-do-ninho.webp';
import { api, ErroApi } from '../rede/api';
import { atualizarConta, contaAtual } from '../save/sessao';
import { botao, elemento } from './dom';

export const URL_DOS_ICONES: Record<IdIcone, string> = {
  'flor-de-chapeu': urlFlorDeChapeu,
  'golem-do-ninho': urlGolemDoNinho,
};

export function imagemDoIcone(id: IdIcone, classe: string): HTMLImageElement {
  const img = elemento('img', classe);
  img.src = URL_DOS_ICONES[id];
  img.alt = '';
  img.draggable = false;
  return img;
}

const NOME_DO_TIPO = { comum: 'Comum' } as const;

export interface Perfil {
  botao: HTMLButtonElement;
  painel: HTMLElement;
  abrir(): void;
  fechar(): void;
}

const mensagemDe = (erro: unknown): string =>
  erro instanceof ErroApi ? erro.message.charAt(0).toUpperCase() + erro.message.slice(1) : 'Algo deu errado; tente de novo.';

// Quantos dias faltam até `quando` (arredondando para cima) e o dia, para mostrar.
function prazo(quando: string): { dias: number; dia: string } {
  const data = new Date(quando);
  const dias = Math.max(1, Math.ceil((data.getTime() - Date.now()) / (24 * 60 * 60 * 1000)));
  const dia = data.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  return { dias, dia };
}

// `aoSair`: o botão de sair da conta. `aoAbrir`/`aoFechar`: a tela de trás para de ouvir o
// teclado enquanto o painel está aberto (o Enter no campo do nome não pode começar a partida).
export function criarPerfil(opcoes: { aoSair: () => void; aoAbrir?: () => void; aoFechar?: () => void }): Perfil {
  const conta = (): Jogador | null => contaAtual();

  // O botão do canto: o ícone, o nome e o selo de mestre.
  const botaoDoPerfil = elemento('button', 'inicio-perfil-botao');
  botaoDoPerfil.type = 'button';
  botaoDoPerfil.setAttribute('aria-haspopup', 'dialog');
  const iconeDoBotao = elemento('img', 'inicio-perfil-icone');
  iconeDoBotao.alt = '';
  iconeDoBotao.draggable = false;
  const nomeDoBotao = elemento('span', 'inicio-perfil-nome');
  const seloDoBotao = elemento('span', 'inicio-conta-selo', 'Mestre');
  const textoDoBotao = elemento('span', 'inicio-perfil-texto');
  textoDoBotao.append(elemento('span', 'inicio-perfil-rotulo', 'Perfil'), nomeDoBotao);
  botaoDoPerfil.append(iconeDoBotao, textoDoBotao, seloDoBotao);

  // O painel.
  const painel = elemento('div', 'inicio-perfil');
  painel.hidden = true;
  painel.setAttribute('role', 'dialog');
  painel.setAttribute('aria-modal', 'true');
  painel.setAttribute('aria-label', 'Perfil');
  const caixa = elemento('div', 'inicio-caixa inicio-perfil-caixa');
  const fecharX = botao('×', 'inicio-perfil-fechar', () => fechar());
  fecharX.setAttribute('aria-label', 'Fechar o perfil');

  // O topo: o ícone grande, o nome e o que a conta é.
  const iconeGrande = elemento('img', 'inicio-perfil-icone-grande');
  iconeGrande.alt = '';
  iconeGrande.draggable = false;
  const nomeGrande = elemento('p', 'inicio-perfil-nome-grande');
  const tipoDaConta = elemento('p', 'inicio-perfil-tipo');
  // O código do jogador, com o botão de copiar.
  const linhaDoCodigo = elemento('p', 'inicio-perfil-codigo');
  const codigo = elemento('span', 'inicio-perfil-codigo-valor');
  const copiar = botao('Copiar', 'inicio-perfil-copiar', () => {
    const texto = conta()?.codigo;
    if (!texto) return;
    void navigator.clipboard
      ?.writeText(texto)
      .then(() => {
        copiar.textContent = 'Copiado!';
        window.setTimeout(() => (copiar.textContent = 'Copiar'), 1500);
      })
      .catch(() => undefined);
  });
  copiar.setAttribute('aria-label', 'Copiar o código do jogador');
  linhaDoCodigo.append(elemento('span', 'inicio-perfil-codigo-rotulo', 'Código'), codigo, copiar);
  const topo = elemento('div', 'inicio-perfil-topo');
  const quem = elemento('div', 'inicio-perfil-quem');
  quem.append(nomeGrande, tipoDaConta, linhaDoCodigo);
  topo.append(iconeGrande, quem);

  // O ícone.
  const erroDoIcone = elemento('p', 'inicio-erro');
  erroDoIcone.setAttribute('role', 'alert');
  const grade = elemento('div', 'inicio-perfil-icones');
  const botoesDosIcones = ICONES.map((icone) => {
    const b = elemento('button', 'inicio-perfil-opcao');
    b.type = 'button';
    b.title = icone.nome;
    b.append(imagemDoIcone(icone.id, 'inicio-perfil-opcao-img'), elemento('span', 'inicio-perfil-opcao-nome', icone.nome));
    b.append(elemento('span', `inicio-perfil-tag inicio-perfil-tag-${icone.tipo}`, NOME_DO_TIPO[icone.tipo]));
    b.addEventListener('click', () => {
      const atual = conta();
      if (!atual || atual.icone === icone.id || ocupado) return;
      ocupado = true;
      erroDoIcone.textContent = '';
      api
        .trocarIcone(icone.id)
        .then((nova) => {
          atualizarConta(nova);
          mostrar();
        })
        .catch((erro: unknown) => (erroDoIcone.textContent = mensagemDe(erro)))
        .finally(() => (ocupado = false));
    });
    grade.append(b);
    return { id: icone.id, b };
  });
  const secaoDoIcone = secao('Ícone', grade, erroDoIcone);

  // O nome.
  const formNome = elemento('form', 'inicio-perfil-form-nome');
  formNome.noValidate = true;
  const campoNome = elemento('input', 'inicio-entrada inicio-perfil-campo');
  campoNome.id = 'perfil-nome';
  campoNome.maxLength = 12;
  campoNome.autocomplete = 'off';
  campoNome.spellcheck = false;
  const salvarNome = elemento('button', 'inicio-botao inicio-perfil-salvar', 'Salvar');
  salvarNome.type = 'submit';
  formNome.append(campoNome, salvarNome);
  const regraDoNome = elemento('p', 'inicio-perfil-regra');
  const erroDoNome = elemento('p', 'inicio-erro');
  erroDoNome.setAttribute('role', 'alert');
  const secaoDoNome = secao('Nome', formNome, regraDoNome, erroDoNome);
  secaoDoNome.querySelector('h3')?.replaceWith(rotulo('Nome', campoNome.id));
  formNome.addEventListener('submit', (evento) => {
    evento.preventDefault();
    const atual = conta();
    if (!atual || ocupado) return;
    const valido = NomeJogador.safeParse(campoNome.value);
    if (!valido.success) {
      erroDoNome.textContent = mensagemDe(new ErroApi(400, valido.error.issues[0]?.message ?? 'nome inválido'));
      return;
    }
    if (valido.data === atual.nome) return;
    ocupado = true;
    erroDoNome.textContent = '';
    salvarNome.disabled = true;
    api
      .trocarNome(valido.data)
      .then((nova) => {
        atualizarConta(nova);
        mostrar();
        regraDoNome.textContent = 'Nome trocado! ' + regraDoNome.textContent;
      })
      .catch((erro: unknown) => (erroDoNome.textContent = mensagemDe(erro)))
      .finally(() => {
        ocupado = false;
        salvarNome.disabled = campoNome.disabled || campoNome.value.trim() === conta()?.nome;
      });
  });
  campoNome.addEventListener('input', () => {
    erroDoNome.textContent = '';
    salvarNome.disabled = campoNome.disabled || campoNome.value.trim() === conta()?.nome;
  });

  // O modo mestre (só o dono).
  const chave = elemento('button', 'inicio-perfil-chave');
  chave.type = 'button';
  chave.setAttribute('role', 'switch');
  const explicaMestre = elemento('p', 'inicio-perfil-regra');
  const erroDoMestre = elemento('p', 'inicio-erro');
  erroDoMestre.setAttribute('role', 'alert');
  const linhaMestre = elemento('div', 'inicio-perfil-linha');
  linhaMestre.append(chave, explicaMestre);
  const secaoDoMestre = secao('Modo mestre', linhaMestre, erroDoMestre);
  chave.addEventListener('click', () => {
    const atual = conta();
    if (!atual?.dono || ocupado) return;
    ocupado = true;
    erroDoMestre.textContent = '';
    api
      .modoMestre(!atual.mestre)
      .then((nova) => {
        atualizarConta(nova);
        mostrar();
      })
      .catch((erro: unknown) => (erroDoMestre.textContent = mensagemDe(erro)))
      .finally(() => (ocupado = false));
  });

  const sair = botao('Sair da conta', 'inicio-link inicio-perfil-sair', () => {
    fechar();
    opcoes.aoSair();
  });

  caixa.append(fecharX, elemento('h2', 'inicio-titulo inicio-perfil-titulo', 'Perfil'), topo, secaoDoIcone, secaoDoNome, secaoDoMestre, sair);
  painel.append(caixa);

  let ocupado = false;

  // Mostra a conta como está. `campo`: põe o nome atual no campo (não ao terminar de salvar com
  // erro, para a pessoa corrigir o que digitou).
  function mostrar(campo = true): void {
    const atual = conta();
    if (!atual) return;
    const url = URL_DOS_ICONES[atual.icone];
    iconeDoBotao.src = url;
    iconeGrande.src = url;
    nomeDoBotao.textContent = atual.nome;
    nomeGrande.textContent = atual.nome;
    codigo.textContent = atual.codigo ? `#${atual.codigo}` : '';
    linhaDoCodigo.hidden = !atual.codigo;
    seloDoBotao.hidden = !atual.mestre;
    tipoDaConta.replaceChildren();
    if (atual.mestre) tipoDaConta.append(elemento('span', 'inicio-conta-selo', 'Mestre'), ' tudo liberado, sem prazos');
    else if (atual.dono) tipoDaConta.append('Conta dona, jogando como comum');
    else tipoDaConta.append('Conta comum');
    for (const { id, b } of botoesDosIcones) {
      const escolhido = id === atual.icone;
      b.classList.toggle('inicio-perfil-opcao-escolhida', escolhido);
      b.setAttribute('aria-pressed', String(escolhido));
    }
    // O nome: livre, ou o prazo até a próxima troca.
    if (campo) campoNome.value = atual.nome;
    const travado = atual.nomeLivreEm !== null;
    campoNome.disabled = travado;
    salvarNome.disabled = travado || campoNome.value.trim() === atual.nome;
    if (atual.mestre) regraDoNome.textContent = 'Conta mestre: troque quando quiser.';
    else if (atual.primeiraTrocaDeNome) {
      regraDoNome.textContent = `A primeira troca é grátis: pode trocar agora. Depois, só a cada ${DIAS_ENTRE_TROCAS_DE_NOME} dias.`;
    }
    else if (travado && atual.nomeLivreEm) {
      const { dias, dia } = prazo(atual.nomeLivreEm);
      regraDoNome.textContent = `Você poderá trocar de novo em ${dias} ${dias === 1 ? 'dia' : 'dias'} (dia ${dia}).`;
    } else regraDoNome.textContent = `Depois de trocar, só dá para trocar de novo em ${DIAS_ENTRE_TROCAS_DE_NOME} dias.`;
    // O modo mestre.
    secaoDoMestre.hidden = !atual.dono;
    chave.setAttribute('aria-checked', String(atual.mestre));
    chave.classList.toggle('inicio-perfil-chave-ligada', atual.mestre);
    chave.textContent = atual.mestre ? 'Ligado' : 'Desligado';
    explicaMestre.textContent = atual.mestre
      ? 'Tudo liberado para testar: o Anjo, os atalhos K, L e H e o nome sem prazo. Desligue para jogar como uma conta comum.'
      : 'Jogando como uma conta comum, com as mesmas regras de todo mundo. Ligue para voltar a ter tudo liberado.';
  }

  const aoTeclar = (evento: KeyboardEvent): void => {
    if (evento.code === 'Escape') {
      evento.preventDefault();
      fechar();
    }
  };

  function abrir(): void {
    if (!painel.hidden) return;
    erroDoIcone.textContent = '';
    erroDoNome.textContent = '';
    erroDoMestre.textContent = '';
    mostrar();
    painel.hidden = false;
    opcoes.aoAbrir?.();
    window.addEventListener('keydown', aoTeclar);
    fecharX.focus();
  }

  function fechar(): void {
    if (painel.hidden) return;
    painel.hidden = true;
    window.removeEventListener('keydown', aoTeclar);
    opcoes.aoFechar?.();
    mostrar();
    botaoDoPerfil.focus();
  }

  // Clicou fora da caixa: fecha.
  painel.addEventListener('click', (evento) => {
    if (evento.target === painel) fechar();
  });
  botaoDoPerfil.addEventListener('click', abrir);
  mostrar();
  return { botao: botaoDoPerfil, painel, abrir, fechar };
}

function rotulo(texto: string, para: string): HTMLLabelElement {
  const r = elemento('label', 'inicio-perfil-secao-titulo', texto);
  r.htmlFor = para;
  return r;
}

function secao(titulo: string, ...conteudo: HTMLElement[]): HTMLElement {
  const s = elemento('section', 'inicio-perfil-secao');
  s.append(elemento('h3', 'inicio-perfil-secao-titulo', titulo), ...conteudo);
  return s;
}
