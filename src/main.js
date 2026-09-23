const canvas = document.getElementById('jogo');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

const LARGURA = canvas.width;
const ALTURA = canvas.height;
const ALTURA_CHAO = 3 * TILE;
const Y_CHAO = ALTURA - ALTURA_CHAO;

const FOLGA_TUFOS = 4;
const chao = criarChao(MUNDO, ALTURA_CHAO, FOLGA_TUFOS);

let ANIMACOES = null;
let folhaCenario = null;

const DURACAO_QUADRO = {
  parado: 0.6,
  andando: 0.11,
  subindo: 0.2,
  caindo: 0.2,
  deitado: 1.1,
};

const VELOCIDADE = 90; // pixels por segundo
const FORCA_PULO = 300; // pixels por segundo — segurando o botão, sobe ~70px
const CORTE_PULO = 90; // pixels por segundo — ao soltar na subida, a velocidade cai para isto
const GRAVIDADE = 640; // pixels por segundo²
const SEGUIR_CAMERA = 5; // quanto maior, mais rápido a câmera alcança o personagem

// `x` é o eixo do corpo e `y` a linha dos pés: os quadros variam de largura e altura, o apoio não.
// Começa no meio do mapa, com espaço para andar para os dois lados.
const personagem = {
  x: MUNDO / 2,
  y: Y_CHAO,
  vx: 0,
  vy: 0,
  direcao: 1, // 1 = direita, -1 = esquerda
  noChao: true,
  deitado: false,
  pularSegurado: false,
  animacao: 'parado',
  quadro: 0,
  tempoQuadro: 0,
};

// `x` é a borda esquerda da tela no mapa (0 a MUNDO - LARGURA).
const camera = { x: (MUNDO - LARGURA) / 2 };

function animacaoDoEstado() {
  if (personagem.deitado) return 'deitado';
  if (!personagem.noChao) return personagem.vy < 0 ? 'subindo' : 'caindo';
  return personagem.vx !== 0 ? 'andando' : 'parado';
}

function avancarAnimacao(dt) {
  const animacao = animacaoDoEstado();
  if (animacao !== personagem.animacao) {
    personagem.animacao = animacao;
    personagem.quadro = 0;
    personagem.tempoQuadro = 0;
    return;
  }

  personagem.tempoQuadro += dt;
  const passo = DURACAO_QUADRO[animacao];
  if (personagem.tempoQuadro >= passo) {
    personagem.tempoQuadro -= passo;
    personagem.quadro = (personagem.quadro + 1) % ANIMACOES[animacao].length;
  }
}

function spriteAtual() {
  return ANIMACOES[personagem.animacao][personagem.quadro];
}

const teclas = {};
window.addEventListener('keydown', (evento) => {
  teclas[evento.code] = true;
});
window.addEventListener('keyup', (evento) => {
  teclas[evento.code] = false;
});

function atualizar(dt) {
  const esquerda = teclas['ArrowLeft'] || teclas['KeyA'];
  const direita = teclas['ArrowRight'] || teclas['KeyD'];
  const pular = teclas['Space'] || teclas['ArrowUp'] || teclas['KeyW'];
  const baixo = teclas['ArrowDown'] || teclas['KeyS'];

  // Só deita com os pés no chão; deitado não anda nem pula.
  personagem.deitado = Boolean(baixo) && personagem.noChao;

  personagem.vx = 0;
  if (!personagem.deitado) {
    if (esquerda) {
      personagem.vx = -VELOCIDADE;
      personagem.direcao = -1;
    }
    if (direita) {
      personagem.vx = VELOCIDADE;
      personagem.direcao = 1;
    }
    // Só pula ao apertar de novo: segurar o botão no pouso não emenda outro pulo.
    if (pular && !personagem.pularSegurado && personagem.noChao) {
      personagem.vy = -FORCA_PULO;
      personagem.noChao = false;
    }
  }

  // Soltar o botão ainda na subida corta o impulso: toque rápido = pulo curto, segurar = pulo alto.
  if (!pular && personagem.vy < -CORTE_PULO) {
    personagem.vy = -CORTE_PULO;
  }
  personagem.pularSegurado = Boolean(pular);

  personagem.vy += GRAVIDADE * dt;
  personagem.x += personagem.vx * dt;
  personagem.y += personagem.vy * dt;

  if (personagem.y >= Y_CHAO) {
    personagem.y = Y_CHAO;
    personagem.vy = 0;
    personagem.noChao = true;
  }

  avancarAnimacao(dt);
  const { imagem, eixo } = spriteAtual();
  const esquerdaDoEixo = personagem.direcao === 1 ? eixo : imagem.width - eixo;
  personagem.x = Math.max(esquerdaDoEixo, Math.min(MUNDO - (imagem.width - esquerdaDoEixo), personagem.x));

  // A câmera persegue o personagem com suavidade, mantendo-o no meio da tela, e para nas
  // bordas do mapa: ali quem anda até a beirada é o personagem.
  const alvo = Math.max(0, Math.min(MUNDO - LARGURA, personagem.x - LARGURA / 2));
  camera.x += (alvo - camera.x) * Math.min(1, dt * SEGUIR_CAMERA);
  atualizarPassaros(dt, LARGURA, Math.round(camera.x));
  atualizarAnimais(dt, personagem, Math.round(camera.x), LARGURA);
  atualizarMinhocas(dt);
}

// `tempo` em segundos desde o início: move sol, nuvens, o balanço das árvores e a luz.
// O fundo é desenhado em coordenadas de tela, com paralaxe; chão, plantas da frente e o
// personagem em coordenadas do mapa, deslocados pela câmera.
function desenhar(tempo) {
  const camX = Math.round(camera.x);
  const luz = luzDoSol(tempo, LARGURA);
  desenharFundo(ctx, folhaCenario, tempo, luz, camX, LARGURA, ALTURA, Y_CHAO);

  ctx.save();
  ctx.translate(-camX, 0);
  ctx.drawImage(chao, 0, Y_CHAO - FOLGA_TUFOS);
  desenharMinhocas(ctx, camX, LARGURA);
  desenharVegetacao(ctx, folhaCenario, tempo, luz, Y_CHAO, camX, LARGURA);
  desenharAnimais(ctx, luz, tempo, camX, LARGURA);

  const { imagem, eixo } = spriteAtual();
  const x = Math.round(personagem.x);
  const topo = Math.round(personagem.y) - imagem.height;

  // A sombra fica no chão durante o pulo, menor e mais fraca quanto mais alto ele está.
  const alturaPulo = Y_CHAO - personagem.y;
  const perto = Math.max(0.3, 1 - alturaPulo / 90);
  desenharSombra(ctx, luz, personagem.x, Y_CHAO, 18 * perto, perto);

  ctx.save();
  if (personagem.direcao === -1) {
    ctx.translate(x + eixo, topo);
    ctx.scale(-1, 1);
    ctx.drawImage(imagem, 0, 0);
  } else {
    ctx.drawImage(imagem, x - eixo, topo);
  }
  ctx.restore();
  desenharAnimaisNoAr(ctx, luz, tempo, camX, LARGURA);
  ctx.restore();

  desenharLuz(ctx, luz, LARGURA, ALTURA);
}

let ultimoTempo = 0;
function loop(tempoAtual) {
  const dt = ultimoTempo ? Math.min((tempoAtual - ultimoTempo) / 1000, 1 / 30) : 0;
  ultimoTempo = tempoAtual;

  atualizar(dt);
  desenhar(tempoAtual / 1000);
  requestAnimationFrame(loop);
}

Promise.all([carregarAnimacoesPersonagem(), carregarFolhaCenario()]).then(([animacoes, folha]) => {
  ANIMACOES = animacoes;
  folhaCenario = folha;
  prepararAnimais(folha, Y_CHAO);
  prepararMinhocas(Y_CHAO, ALTURA_CHAO);
  requestAnimationFrame(loop);
});
