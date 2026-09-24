// Save do jogo com o mesmo jeito de usar dos dois lados: sem conta, fica no navegador
// (localStorage); com conta, vai para o servidor e abre em qualquer máquina.

import { DadosSave, atualizarSave } from '@terna/compartilhado';
import { api, tokenAtual } from '../rede/api';

const CHAVE_LOCAL = (slot: number): string => `terna:save:${slot}`;

export interface ArmazenamentoSimples {
  getItem(chave: string): string | null;
  setItem(chave: string, valor: string): void;
}

function armazenamentoLocal(): ArmazenamentoSimples | null {
  try {
    return window.localStorage;
  } catch {
    return null; // janela anônima ou armazenamento bloqueado: segue sem save local
  }
}

export function gravarLocal(slot: number, dados: DadosSave, armazenamento = armazenamentoLocal()): void {
  armazenamento?.setItem(CHAVE_LOCAL(slot), JSON.stringify(DadosSave.parse(dados)));
}

export function carregarLocal(slot: number, armazenamento = armazenamentoLocal()): DadosSave | null {
  const texto = armazenamento?.getItem(CHAVE_LOCAL(slot));
  if (!texto) return null;
  try {
    return atualizarSave(JSON.parse(texto));
  } catch {
    return null; // save corrompido ou de um formato que não existe mais
  }
}

export async function gravar(slot: number, dados: DadosSave): Promise<void> {
  if (tokenAtual()) await api.gravarSave(slot, dados);
  else gravarLocal(slot, dados);
}

export async function carregar(slot: number): Promise<DadosSave | null> {
  if (!tokenAtual()) return carregarLocal(slot);
  try {
    return (await api.carregarSave(slot)).dados;
  } catch {
    return null;
  }
}
