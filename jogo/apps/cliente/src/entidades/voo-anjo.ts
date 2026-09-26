// O voo do anjo com pairada: ele pula, para no alto por um instante, batendo as asas e podendo
// andar para os lados, e depois desce planando sozinho, sem precisar segurar o botão. Segurar o
// pulo só decide a altura (toque rápido = paira baixo; segurado = paira alto, ~85 px). Apertar
// de novo no ar fecha as asas e ele despenca; apertar mais uma vez abre, e as asas freiam a queda
// até voltar a planar.
//
// Mudança encaixotada: com PAIRAR_NO_AR = false volta o voo antigo (sobe e só plana enquanto
// segura o botão; soltou, despenca) — o personagem.ts chama este arquivo em dois pontos, e
// nada mais depende dele. Os controles são os mesmos do voo antigo, então a rede e a CPU não
// mudam.

export const PAIRAR_NO_AR = true;

export const VOO = {
  pairar: 1.5, // segundos parado no alto do pulo
  queda: 30, // px/s: a descida planando (a mesma do voo antigo)
  freio: 1200, // px/s²: abrindo as asas no meio de uma queda rápida, elas freiam até planar
};

export interface Voo {
  pairando: number; // segundos de pairada que ainda restam neste voo
  asasFechadas: boolean; // apertou no ar: despenca até abrir de novo ou pisar no chão
}

export function criarVoo(): Voo {
  return { pairando: 0, asasFechadas: false };
}

// Saiu do chão pulando, de anjo: o voo novo começa com a pairada inteira.
export function decolar(v: Voo): void {
  v.pairando = VOO.pairar;
  v.asasFechadas = false;
}

// Um quadro do anjo no ar: a velocidade vertical nova e se está planando (as asas abertas
// segurando o ar — o personagem usa para o quadro do sprite e a batida das asas).
// `apertou`: o botão de pulo acabou de ser apertado, já no ar.
export function voarNoAr(
  v: Voo,
  vy: number,
  apertou: boolean,
  gravidade: number,
  dt: number,
): { vy: number; planando: boolean } {
  if (apertou) {
    v.asasFechadas = !v.asasFechadas;
    // Reabriu: sem outra pairada, só a descida planando.
    if (!v.asasFechadas) v.pairando = 0;
  }
  // Subindo, ou com as asas fechadas: a gravidade inteira.
  if (v.asasFechadas || vy < 0) return { vy: vy + gravidade * dt, planando: false };
  // No alto: fica parado enquanto dura a pairada.
  if (v.pairando > 0) {
    v.pairando = Math.max(0, v.pairando - dt);
    return { vy: 0, planando: true };
  }
  // Depois, desce planando: do alto a gravidade leva à queda lenta sem tranco; vindo de uma
  // queda rápida (reabriu as asas), elas freiam.
  const nova = vy < VOO.queda ? Math.min(VOO.queda, vy + gravidade * dt) : Math.max(VOO.queda, vy - VOO.freio * dt);
  return { vy: nova, planando: true };
}
