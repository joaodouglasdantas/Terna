// Sprites dos animais, desenhados a partir das referências: coelho, sapo e cervo copiados
// pixel a pixel (o cervo com a cabeça virada para a frente e as pernas refeitas por quadro,
// em animais.ts); o esquilo redesenhado em metade do tamanho, com as cores da referência.
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

export const PALETA_CERVO = {
  a: '#cd633d',
  b: '#ab5233',
  c: '#70422a',
  d: '#5e2c1a',
  e: '#b8896f',
  f: '#e24e0f',
  g: '#8b624c',
  h: '#f49974',
  i: '#432418',
  j: '#f0c185',
  k: '#d2a775',
  l: '#260f07',
};

// Corpo do cervo até a barriga; as pernas são desenhadas por cima em cada quadro.
export const CORPO_CERVO: Record<'frente' | 'tras', string[]> = {
  frente: [
    '..............................',
    '......................a.......',
    '..............a.......a.a.....',
    '...............a......bbb.....',
    '...............bb......c......',
    '..............a.c....cdd......',
    '...............ccc.d..dee.....',
    '.................cdd...ef.....',
    '..................dd...gf.....',
    '.................gggg.ccgg....',
    '..................hfggcgggg...',
    '...................hfggggigg..',
    '....................ggggghgggi',
    '....................ggggfhhggg',
    '....................gcggfffgg.',
    '....................ggggdgg...',
    '......................ddcgj...',
    '.....jc...............dcggj...',
    '.....jgcjeejee........ccggj...',
    '.....jjcejeejeje......cgggj...',
    '.......ccggkjeejeje.eecgggj...',
    '......dcggkegggkegjejggggkj...',
    '.....dccggggkgkgeekggggggkj...',
    '.....dcgggggggggkggggggggjj...',
    '.....dcgggggggggggggggggkj....',
    '......cgggggeegggggggggekj....',
    '......cgggeeeckgggkdgggej.....',
    '......cggeeecckjjjkdggegj.....',
    '......cegeecc.....dcggekj.....',
  ],
  // a pose da referência: cabeça virada para trás
  tras: [
    '.................................',
    '........................a........',
    '......................a.a.......a',
    '......................bbb......a.',
    '.......................c......bb.',
    '.......................ddc....c.a',
    '......................eed..d.ccc.',
    '......................fe...ddc...',
    '......................fg...dd....',
    '.....................ggcc.gggg...',
    '....................ggggcggfh....',
    '...................ggiggggfh.....',
    '.................iggghggggg......',
    '.................ggghhfgggg......',
    '..................ggfffggcg......',
    '....................ggggdgg......',
    '......................ddcgj......',
    '.....jc...............dcggj......',
    '.....jgcjeejee........ccggj......',
    '.....jjcejeejeje......cgggj......',
    '.......ccggkjeejeje.eecgggj......',
    '......dcggkegggkegjejggggkj......',
    '.....dccggggkgkgeekggggggkj......',
    '.....dcgggggggggkggggggggjj......',
    '.....dcgggggggggggggggggkj.......',
    '......cgggggeegggggggggekj.......',
    '......cgggeeeckgggkdgggej........',
    '......cggeeecckjjjkdggegj........',
    '......cegeecc.....dcggekj........',
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
