// A Margo, a vovó do rolo de massa, e o ganso dela. Idosa, ela não dá soco e não pega as armas que
// caem do céu: a única arma dela é o rolo de massa, sempre na mão. O primeiro quadrinho do painel
// (o do soco, nos outros) é o rolo; o botão direito passa por ele e pelos três poderes, como na
// Leslie e no Grow. Ela não se transforma: na ult, quem se transforma é o ganso, e ela continua
// usando o rolo e os outros poderes.
// Distâncias em pixels, tempos em segundos, velocidades em px/s.
//
// A energia pixy (poderes.ts): começa vazia e enche com o dano que ela dá. O 1 e o 2 gastam quase
// nada; o Ganso Raivoso pede a barra cheia.
//
// - Rolo (no lugar do soco): a rolada, uma pancada curta com o rolo para a frente. Mais forte que o
//   soco e que o golpe de espada — é a arma dela, e ela não pega as do chão —, mas abaixo de um uso
//   inteiro de qualquer poder (armas-vs-poderes.test.ts).
//
// Balanceamento (BALANCEAMENTO.md): no simulador, ela fica perto de 50% contra cada um, e a luta
// dentro da meta de até 3 minutos. O Ganso Raivoso é o que mais tira (como a Flor da Leslie).
// - 1 · Bumerangue: ela arremessa o rolo girando na direção do cursor; ele vai até o alcance e
//   volta para a mão dela, como um bumerangue. Acerta na ida e acerta na volta (cada passada fere
//   uma vez quem pega). Enquanto ele voa, a mão está vazia: sem a rolada até ele voltar.
// - 2 · Farinha: um saco de farinha jogado em arco; onde ele cai (no chão ou em alguém), estoura numa
//   nuvem branca que fica um tempo no chão. Quem está nela fica enfarinhado: anda mais devagar, não
//   dá o arranco e perde um pouquinho de vida de tempos em tempos (e ainda um tempinho depois de
//   sair). Dá-se a volta por fora ou sai-se pulando.
// - 3 · Ganso Raivoso: só com a barra cheia. O ganso dela fica bravo e sai correndo, muito rápido,
//   atrás do outro, bicando sem parar quem está perto do chão. Não dá para ferir o ganso: é pular
//   por cima dele e fugir, até a raiva passar (aí ele volta correndo para a Margo).

export const PODERES_MARGO = ['bumerangue', 'farinha', 'ganso'] as const;

// A rolada: o rolo vai de trás da cabeça para a frente (a fileira ATTACK da folha); no meio do
// movimento (`acerta`, de 0 a 1 do golpe), a ponta confere quem está na frente até `alcance` do
// ombro. Sem crítico: o dano é fixo, como o do soco.
export const ROLO = {
  nome: 'Rolo de Massa',
  dano: 25, // abaixo de um uso inteiro de qualquer poder (o mais fraco, o Chicote: 50)
  recarga: 0.6, // entre duas roladas
  golpe: 0.42, // o movimento inteiro
  acerta: [0.3, 0.7] as const,
  alcance: 17, // do ombro até a ponta do rolo, esticado
};

export const BUMERANGUE = {
  nome: 'Bumerangue de Rolo',
  dano: 48, // por passada: na ida e na volta (um uso inteiro, os dois acertando: 96)
  recarga: 4,
  alcance: 150, // até onde ele vai, da mão
  velocidade: 270, // indo
  volta: 300, // voltando para a mão dela
  raio: 4, // o rolo girando, para o acerto
  maximo: 3, // segundos voando, no máximo (se não alcançar a mão, cai nela de qualquer jeito)
};

export const FARINHA = {
  nome: 'Saco de Farinha',
  dano: 30, // o saco acertando em cheio
  recarga: 9,
  velocidade: 230, // o saco saindo da mão
  gravidade: 420,
  alcance: 170, // até onde ela mira, na horizontal
  raio: 26, // a nuvem, para cada lado
  altura: 40, // a nuvem pega quem está com os pés até esta altura do chão
  duracao: 3.5, // segundos da nuvem no chão
  tique: 0.5, // segundos entre uma lasquinha e outra, de quem está dentro
  danoTique: 8, // por lasquinha: até 56 ficando o tempo todo
  lento: 0.55, // enfarinhado: anda a esta parte da velocidade (e não dá o arranco)
  depois: 0.9, // segundos que continua enfarinhado depois de sair da nuvem
};

// O Ganso Raivoso. O ganso estufa (`estufa`), corre atrás do outro a `velocidade` (a gente anda a
// 90; o arranco vai a 300, mas por pouco tempo) e, perto dele (`alcance` do corpo) e com ele
// perto do chão (os pés até `altura`), bica a cada `intervalo`. A raiva dura `duracao`; aí ele
// volta para a Margo.
export const GANSO = {
  nome: 'Ganso Raivoso',
  recarga: 3, // curta: quem segura o especial é a barra de energia
  estufa: 0.45,
  duracao: 9,
  velocidade: 165,
  alcance: 8,
  altura: 16,
  intervalo: 0.38,
  dano: 22, // por bicada: ~23 bicadas se ele ficar grudado o tempo todo (até ~500)
  volta: 180, // voltando para ela, depois da raiva
};
