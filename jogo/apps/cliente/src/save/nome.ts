// O nome que a pessoa escolheu na tela inicial, lembrado neste navegador. Sem conta: é só um
// apelido. Se o navegador não deixa guardar (aba anônima, armazenamento bloqueado), o jogo
// segue e pergunta de novo da próxima vez.

import { Apelido } from '@terna/compartilhado';

const CHAVE = 'terna:nome';

export function lerNome(): string {
  try {
    const guardado = localStorage.getItem(CHAVE);
    const valido = Apelido.safeParse(guardado);
    return valido.success ? valido.data : '';
  } catch {
    return '';
  }
}

export function guardarNome(nome: string): void {
  try {
    localStorage.setItem(CHAVE, nome);
  } catch {
    // sem armazenamento: vale só nesta visita
  }
}
