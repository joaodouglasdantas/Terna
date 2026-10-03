// Quem leva os e-mails do jogo (os códigos de confirmação e de troca de senha).
// - Brevo: a API HTTP do Brevo (plano grátis: 300 e-mails por dia). O Render grátis bloqueia as
//   portas de SMTP, então o envio é por HTTP. A chave sai do painel do Brevo (SMTP & API → API
//   Keys) e o remetente precisa estar verificado lá (Senders, Domains & Dedicated IPs → Senders).
// - Terminal: sem a chave, o e-mail não sai; o código aparece no terminal do servidor. Serve para
//   desenvolver e testar sem mandar e-mail de verdade.

export interface Mensagem {
  para: string;
  nomePara?: string;
  assunto: string;
  html: string;
  texto: string;
}

export interface Correio {
  readonly tipo: 'brevo' | 'terminal' | 'teste';
  enviar(mensagem: Mensagem): Promise<void>;
}

export interface ConfigBrevo {
  chave: string;
  remetente: string; // o e-mail verificado no Brevo
  nomeRemetente: string;
}

const ENDERECO_BREVO = 'https://api.brevo.com/v3/smtp/email';
const PRAZO_ENVIO_MS = 15_000;

export function correioBrevo(config: ConfigBrevo, buscar: typeof fetch = fetch): Correio {
  return {
    tipo: 'brevo',
    async enviar({ para, nomePara, assunto, html, texto }) {
      const resposta = await buscar(ENDERECO_BREVO, {
        method: 'POST',
        headers: { 'api-key': config.chave, 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({
          sender: { email: config.remetente, name: config.nomeRemetente },
          to: [nomePara ? { email: para, name: nomePara } : { email: para }],
          subject: assunto,
          htmlContent: html,
          textContent: texto,
        }),
        signal: AbortSignal.timeout(PRAZO_ENVIO_MS),
      });
      if (!resposta.ok) {
        const detalhe = await resposta.text().catch(() => '');
        throw new Error(`o Brevo recusou o e-mail (${resposta.status}): ${detalhe.slice(0, 300)}`);
      }
    },
  };
}

export interface Registro {
  warn(objeto: object, mensagem: string): void;
}

// Sem chave do Brevo: mostra no terminal para quem ia e o texto (com o código), com as quebras de
// linha de verdade (o log do servidor as escaparia).
export function correioDoTerminal(registro: Registro = { warn: (o, m) => console.warn(`\n${m}\n`) }): Correio {
  return {
    tipo: 'terminal',
    async enviar({ para, assunto, texto }) {
      const linha = '-'.repeat(60);
      registro.warn({ para, assunto }, `${linha}\nE-MAIL NÃO ENVIADO (falta BREVO_API_KEY): para ${para}\nAssunto: ${assunto}\n\n${texto}\n${linha}`);
    },
  };
}

// Para os testes: guarda as mensagens em vez de mandar.
export function correioDeTeste(): Correio & { caixa: Mensagem[]; ultimoCodigo(para: string): string } {
  const caixa: Mensagem[] = [];
  return {
    tipo: 'teste',
    caixa,
    async enviar(mensagem) {
      caixa.push(mensagem);
    },
    ultimoCodigo(para) {
      const mensagem = caixa.findLast((m) => m.para === para);
      const codigo = mensagem?.texto.match(/\b\d{6}\b/)?.[0];
      if (!codigo) throw new Error(`nenhum código mandado para ${para}`);
      return codigo;
    },
  };
}
