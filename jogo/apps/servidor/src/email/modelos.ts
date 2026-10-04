// Os e-mails do jogo, com a cara do Terna: a noite da floresta no fundo, a caixa de madeira com
// a moldura dourada das telas do jogo e o código em blocos, um número em cada. Feito do jeito que
// os leitores de e-mail aceitam: tabelas e estilo direto em cada peça (o Gmail e o Outlook
// ignoram quase todo o resto). A letra é a Tiny5, a do jogo, onde o leitor carrega fontes; nos
// outros, uma monoespaçada. A logo vem do site publicado (`urlDoJogo`/email/logo.png); com as
// imagens bloqueadas, aparece o nome em texto no lugar.

import { VALIDADE_CODIGO_MIN, type MotivoCodigo } from '../auth/codigos';

export interface EmailPronto {
  assunto: string;
  html: string;
  texto: string;
}

const COR = {
  noite: '#0e0b07',
  madeira: '#1f150d',
  madeiraClara: '#2c1e12',
  moldura: '#9a6a3a',
  dourado: '#efdca2',
  douradoEscuro: '#c9a55a',
  tinta: '#fbf3e4',
  suave: '#c9b89c',
  apagada: '#8f7f68',
  verde: '#7fd66b',
  verdeClaro: '#c8f5b0',
  verdeEscuro: '#2f7a3a',
};

const LETRA = "'Tiny5', 'Courier New', Courier, monospace";
const LETRA_TEXTO = "'Trebuchet MS', 'Segoe UI', Arial, sans-serif";

const escapar = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);

const TEXTOS: Record<MotivoCodigo, { assunto: string; titulo: string; frase: string; acao: string }> = {
  confirmar: {
    assunto: 'Seu código para entrar no Terna',
    titulo: 'Bem-vindo à floresta!',
    frase: 'Falta só um passo para a sua conta ficar pronta. Digite este código no jogo:',
    acao: 'Depois disso, você já cai direto numa partida de treino para aprender a jogar.',
  },
  senha: {
    assunto: 'Código para trocar a senha do Terna',
    titulo: 'Trocar a senha',
    frase: 'Recebemos um pedido para trocar a senha da sua conta. Digite este código no jogo:',
    acao: 'Com ele, você escolhe a senha nova e entra na hora.',
  },
};

// Os números do código, cada um num bloco de madeira com borda dourada.
function blocosDoCodigo(codigo: string): string {
  const blocos = [...codigo]
    .map(
      (n) => `<td style="padding:0 4px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
          <td align="center" valign="middle" width="44" height="56" style="width:44px;height:56px;background:${COR.madeiraClara};border:3px solid ${COR.douradoEscuro};border-bottom:6px solid ${COR.moldura};font-family:${LETRA};font-size:34px;line-height:56px;color:${COR.verdeClaro};text-align:center;">${n}</td>
        </tr></table>
      </td>`,
    )
    .join('');
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"><tr>${blocos}</tr></table>`;
}

export function emailDoCodigo({
  nome,
  codigo,
  motivo,
  urlDoJogo,
}: {
  nome: string;
  codigo: string;
  motivo: MotivoCodigo;
  urlDoJogo: string;
}): EmailPronto {
  const t = TEXTOS[motivo];
  const site = urlDoJogo.replace(/\/+$/, '');
  const nomeHtml = escapar(nome);
  const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>${escapar(t.assunto)}</title>
<link href="https://fonts.googleapis.com/css2?family=Tiny5&display=swap" rel="stylesheet">
<style>
  @media (max-width: 520px) {
    .caixa { padding: 24px 18px !important; }
    .titulo { font-size: 26px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:${COR.noite};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${COR.noite};">Seu código do Terna: ${codigo} (vale por ${VALIDADE_CODIGO_MIN} minutos)&#8199;&#65279;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${COR.noite};background-image:radial-gradient(ellipse at 50% 0%, #2a2016 0%, ${COR.noite} 70%);">
  <tr>
    <td align="center" style="padding:32px 12px 40px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;">
        <tr>
          <td align="center" style="padding:0 0 8px;">
            <a href="${site}" target="_blank" style="text-decoration:none;">
              <img src="${site}/email/logo.png" width="300" alt="TERNA" style="display:block;width:300px;max-width:70%;height:auto;border:0;font-family:${LETRA};font-size:40px;letter-spacing:6px;color:${COR.dourado};">
            </a>
          </td>
        </tr>
        <tr>
          <td style="background:${COR.noite};padding:3px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:3px solid ${COR.moldura};background:${COR.madeira};">
              <tr>
                <td class="caixa" style="padding:32px 32px 28px;border:2px solid #4e3a22;background:${COR.madeira};background-image:linear-gradient(to bottom, rgba(154,106,58,0.30), rgba(0,0,0,0) 90px);">
                  <h1 class="titulo" style="margin:0 0 6px;font-family:${LETRA};font-weight:normal;font-size:30px;line-height:1.15;letter-spacing:2px;text-transform:uppercase;color:${COR.tinta};text-align:center;text-shadow:0 3px 0 #4e3016;">${escapar(t.titulo)}</h1>
                  <p style="margin:0 0 22px;font-family:${LETRA};font-size:16px;color:${COR.verde};text-align:center;letter-spacing:1px;">Olá, ${nomeHtml}!</p>
                  <p style="margin:0 0 22px;font-family:${LETRA_TEXTO};font-size:16px;line-height:1.55;color:${COR.suave};text-align:center;">${t.frase}</p>
                  ${blocosDoCodigo(codigo)}
                  <p style="margin:18px 0 0;font-family:${LETRA};font-size:13px;color:${COR.apagada};text-align:center;letter-spacing:1px;text-transform:uppercase;">Vale por ${VALIDADE_CODIGO_MIN} minutos</p>
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:26px 0 0;">
                    <tr><td style="border-top:2px dashed #4e3a22;font-size:0;line-height:0;">&nbsp;</td></tr>
                  </table>
                  <p style="margin:20px 0 0;font-family:${LETRA_TEXTO};font-size:15px;line-height:1.55;color:${COR.suave};text-align:center;">${t.acao}</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:22px 16px 0;">
            <p style="margin:0 0 10px;font-family:${LETRA_TEXTO};font-size:13px;line-height:1.5;color:${COR.apagada};">Não foi você? Pode ignorar este e-mail: sem o código, ninguém entra na sua conta.</p>
            <p style="margin:0;font-family:${LETRA};font-size:13px;letter-spacing:1px;color:${COR.moldura};">TERNA · <a href="${site}" target="_blank" style="color:${COR.douradoEscuro};text-decoration:none;">${escapar(site.replace(/^https?:\/\//, ''))}</a></p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;

  const texto = [
    `${t.titulo}`,
    '',
    `Olá, ${nome}!`,
    '',
    t.frase,
    '',
    `    ${codigo}`,
    '',
    `O código vale por ${VALIDADE_CODIGO_MIN} minutos. ${t.acao}`,
    '',
    'Não foi você? Pode ignorar este e-mail: sem o código, ninguém entra na sua conta.',
    '',
    `Terna · ${site}`,
  ].join('\n');

  return { assunto: t.assunto, html, texto };
}
