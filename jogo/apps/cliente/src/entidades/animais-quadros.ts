// Sprites dos animais, desenhados a partir das referências: coelho e sapo copiados
// pixel a pixel; o veado redesenhado como o veado-mateiro (pernas refeitas por quadro, em
// animais.ts); o esquilo redesenhado em metade do tamanho, com as cores da referência.
// Todos virados para a direita. Cada caractere é 1 pixel e '.' é transparente; `eixo` é a
// coluna do centro do corpo, que fica sobre o `x` do animal (os pés ficam na última linha).
// Nenhum tem contorno preto em volta do corpo (o 'o' que sobrou é só olho, boca e detalhe).

// Um quadro: as linhas de pixels e a coluna do centro do corpo.
export interface QuadroAnimal {
  eixo: number;
  linhas: string[];
}

export const PALETA_ESQUILO = { o: '#120806', b: '#856155', d: '#b2805b', c: '#e9b58d', e: '#fee0ae' };

export const QUADROS_ESQUILO: Record<'sentado' | 'correndo', QuadroAnimal[]> = {
  sentado: [
    { eixo: 9, linhas: [
      '..........b.b..',
      '.bbbb....bddd..',
      '.bbbbb...bddod.',
      '...bbb..bdeeee.',
      '....bb...eee...',
      '....bb..bdee...',
      '...bbbbddeec...',
      '...bbbddddcc...',
      '...bbbddddd....',
      '....bbbddcc....',
    ] },
    { eixo: 9, linhas: [
      '..........b.b..',
      '.bbbb....bddd..',
      '.bbbbb...bddod.',
      '...bbb..bdeeee.',
      '....bb...eee...',
      '....bbbbddeec..',
      '...bbbbddddcc..',
      '...bbbdddddd...',
      '...bbbbddddc...',
    ] },
  ],
  correndo: [
    { eixo: 11, linhas: [
      '..bbb.............',
      '.bbbbb............',
      '.bb..bb......b.b..',
      '......bb.....bdd..',
      '........bdddddod..',
      '........bddddddee.',
      '.......ddddddee...',
      '......ccddcc......',
      '.....cc.....cc....',
    ] },
    { eixo: 11, linhas: [
      '..bbb.............',
      '.bbbbb............',
      '.bb..bb...........',
      '......bb.....b.b..',
      '.......b.....bdd..',
      '.......bdddddode..',
      '.......bddddddeee.',
      '........dddddde...',
      '.........ccccc....',
    ] },
  ],
};

export const PALETA_COELHO = { o: '#222230', b: '#fafcf9', c: '#c9dbf2', e: '#d6566b' };

// sentado → impulso (esticado para cima, ainda com as patas no chão) → salto (esticado no ar).
export const QUADROS_COELHO: Record<'sentado' | 'impulso' | 'salto', QuadroAnimal> = {
  sentado: { eixo: 7, linhas: [
    '.......bb.cc..',
    '.......bb.cc..',
    '.......bb.cc..',
    '.......bbbbb..',
    '.......bbbbbb.',
    '.bb....bbbbbb.',
    '.bbbbbbbbebbe.',
    '..cbbbbbbbbbb.',
    '..bbbbbbcbbb..',
    '..bbcbbbbcc...',
    '..bbbccbbbb...',
    '...bbbbcbbbb..',
  ] },
  impulso: { eixo: 7, linhas: [
    '.......bb.cc..',
    '.......bb.cc..',
    '.......bb.cc..',
    '.......bbbbb..',
    '.......bbbbbb.',
    '.......bbbbbb.',
    '.......bbebbe.',
    '......bbbbbbb.',
    '.bb..bbbcbbb..',
    '.bbbbbbbbcc...',
    '..cbbbcbbbb...',
    '..bbbbbcbbbb..',
    '..bbbbb.......',
    '..bbbc........',
    '...bb.........',
    '...b..........',
    '...b..........',
  ] },
  salto: { eixo: 10, linhas: [
    '..........bb.cc..',
    '..........bb.cc..',
    '..........bb.cc..',
    '..........bbbbb..',
    '..........bbbbbb.',
    '....bb....bbbbbb.',
    '....bbbbbbbbebbe.',
    '.....cbbbbbbbbbb.',
    '.....bbbbbbcbbb..',
    '....bbbcbbbbcc...',
    '...bbbb..bbbbb...',
    '.bbbbb.....bbb...',
    '............cb...',
  ] },
};

export const PALETA_SAPO = { o: '#020304', c: '#95dd3f', d: '#5fc412', e: '#f95352', f: '#fdeb6d', h: '#730631' };

export const QUADROS_SAPO: Record<'parado' | 'pulo' | 'papo' | 'boca' | 'agachado', QuadroAnimal> = {
  parado: { eixo: 6, linhas: [
    '.....cc.cc...',
    '....dccccc...',
    '...dccoccoc..',
    '..dcceccccec.',
    '.ddcccffffff.',
    '.dddcffffff..',
    '.dccdcffff...',
    '..ccc.c..d...',
  ] },
  pulo: { eixo: 9, linhas: [
    '........cc.cc...',
    '.......dcoccoc..',
    '......dceccccec.',
    '.....dcccffffff.',
    '....dddcffffff..',
    '....ddddcffff...',
    '...ccddd..c..d..',
    '...cc...........',
    '..cc............',
    '.cc.............',
  ] },
  papo: { eixo: 6, linhas: [
    '....cc........',
    '....coec......',
    '..cccccffff...',
    '..ccocffffff..',
    '...cecfffffff.',
    '...ccffffffff.',
    '..dccffffffff.',
    '.ddccffffffff.',
    '.dddcfffffff..',
    '.dccdcfffff...',
    '..ccc.c..d....',
  ] }, // coaxando
  boca: { eixo: 6, linhas: [
    '......cc....',
    '....cccoec..',
    '....cocchh..',
    '....cechhh..',
    '..dcccfeehh.',
    '.ddccffeehf.',
    '.dddcfffff..',
    '.dccdcffff..',
  ] },
  agachado: { eixo: 6, linhas: [
    '.....cc.cc...',
    '..ddccoccoc..',
    '.dddceccccec.',
    '.dccdcffffff.',
  ] },
};

// O veado (veado-mateiro, da mata brasileira): pelagem cor de ferrugem, sem pintas, a cabeça um
// pouco mais escura, chifres curtos em espeto (sem galhos), orelha grande clara por dentro, uma
// marquinha clara acima do olho, queixo e garganta claros e o rabo curto, branco por baixo.
export const PALETA_VEADO = {
  a: '#d9c9a3', // chifre
  b: '#c2703f', // lombo, onde bate a luz
  c: '#7a3a1c', // sombra
  d: '#4d2210', // sombra funda, focinho
  f: '#8f4524', // cabeça
  g: '#a8582d', // corpo
  h: '#ecd6b8', // dentro da orelha
  i: '#26120a', // olho, nariz
  j: '#ecdcc0', // garganta e peito
  k: '#d2976a', // barriga
  l: '#1e0c06', // casco
  m: '#f6eee0', // branco: acima do olho, queixo, rabo
};

// Corpo do veado até a barriga; as pernas são desenhadas por cima em cada quadro.
export const CORPO_VEADO: Record<'frente' | 'tras', string[]> = {
  frente: [
    '..............................',
    '..............................',
    '.....................a..a.....',
    '.....................a..a.....',
    '......................a.a.....',
    '......................a.a.....',
    '..................cc.fffff....',
    '.................chhcffffff...',
    '..................cccfffmiff..',
    '.....................ffffffff.',
    '.....................fffffffdi',
    '.....................fffffmmm.',
    '.....................ggffmm...',
    '.....................gggggj...',
    '.....................cggggj...',
    '....................ccggggj...',
    '......................ddcgb...',
    '.....cc...............dcggb...',
    '.....mgcbbbbbb........ccggb...',
    '.....mmcggggggbb......cgggb...',
    '.......ccgggggggbbb.bbcgggb...',
    '......dcgggggggggggbgggggkb...',
    '.....dccgggggggggggggggggkb...',
    '.....dcggggggggggggggggggbb...',
    '.....dcgggggggggggggggggkk....',
    '......cgggggkkgggggggggekk....',
    '......cgggkkkcgggggdgggek.....',
    '......cggkkkccgggggdggegk.....',
    '......ckgkkcc.....dcggekk.....',
  ],
  // olhando para trás, por cima do lombo
  tras: [
    '.................................',
    '.................................',
    '.......................a..a......',
    '.......................a..a......',
    '.......................a.a.......',
    '.......................a.a.......',
    '......................fffff.cc...',
    '.....................ffffffchhc..',
    '....................ffimfffccc...',
    '...................ffffffff......',
    '..................idfffffff......',
    '...................mmmfffff......',
    '.....................mmffgg......',
    '.....................gggggj......',
    '.....................gggggj......',
    '.....................gggggjc.....',
    '......................ddcgb......',
    '.....cc...............dcggb......',
    '.....mgcbbbbbb........ccggb......',
    '.....mmcggggggbb......cgggb......',
    '.......ccgggggggbbb.bbcgggb......',
    '......dcgggggggggggbgggggkb......',
    '.....dccgggggggggggggggggkb......',
    '.....dcggggggggggggggggggbb......',
    '.....dcgggggggggggggggggkk.......',
    '......cgggggkkgggggggggekk.......',
    '......cgggkkkcgggggdgggek........',
    '......cggkkkccgggggdggegk........',
    '......ckgkkcc.....dcggekk........',
  ],
};

// Pássaro no chão ou num galho, com as cores de CORES_PASSARO (mundo/cenario.ts) e pés (P).
export const QUADROS_AVE_POUSADA = {
  pousado: [
    '......HH..',
    '.....HHEY.',
    '..BBBBBH..',
    '.BWWWWBL..',
    'TWwwWWLL..',
    'T..LLLL...',
    '....P.P...',
  ],
  bicando: [
    '..........',
    '..........',
    '..BBBBB...',
    '.BWWWWBHH.',
    'TWwwWWLHHE',
    'T..LLLL.HY',
    '....P.P...',
  ],
};

// Asa (A), borda da asa (a) e corpo (b).
export const QUADROS_BORBOLETA = {
  aberta: [
    'aA.Aa',
    'AAbAA',
    '.AbA.',
  ],
  fechada: [
    '.A.A.',
    '.AbA.',
    '..b..',
  ],
};

export const CORES_BORBOLETA = [
  { A: '#f5d547', a: '#c9962a' },
  { A: '#f08a24', a: '#3a2418' },
  { A: '#f4f1e8', a: '#a9a397' },
  { A: '#6cb4ee', a: '#2f5f9a' },
];
