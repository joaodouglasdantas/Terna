const canvas = document.getElementById('jogo');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

const LARGURA = canvas.width;
const ALTURA = canvas.height;
const ALTURA_CHAO = 3 * TILE;
const Y_CHAO = ALTURA - ALTURA_CHAO;

const FOLGA_TUFOS = 4;
const chao = criarChao(LARGURA, ALTURA_CHAO, FOLGA_TUFOS);

const spritePersonagem = criarSprite(SPRITE_PERSONAGEM, PALETA_PERSONAGEM);

const VELOCIDADE = 90; // pixels por segundo
const FORCA_PULO = 220; // pixels por segundo
const GRAVIDADE = 640; // pixels por segundo²
const Y_INICIAL = Y_CHAO - spritePersonagem.height;

const personagem = {
  x: 60,
  y: Y_INICIAL,
  vx: 0,
  vy: 0,
  direcao: 1, // 1 = direita, -1 = esquerda
  noChao: true,
};

const teclas = {};
window.addEventListener('keydown', (evento) => {
  teclas[evento.code] = true;
});
window.addEventListener('keyup', (evento) => {
  teclas[evento.code] = false;
});

const ceu = ctx.createLinearGradient(0, 0, 0, Y_CHAO);
ceu.addColorStop(0, '#5fb4f0');
ceu.addColorStop(1, '#bfe6ff');

const fundo = criarFundo(LARGURA, Y_CHAO);
const vegetacao = criarVegetacao(LARGURA, ALTURA, Y_CHAO);
const sol = criarSol(36);
const SOL_X = LARGURA - 70;
const SOL_Y = 46;

function criarSol(diametro) {
  const canvasSol = document.createElement('canvas');
  canvasSol.width = diametro;
  canvasSol.height = diametro;
  const ctxSol = canvasSol.getContext('2d');
  const raio = diametro / 2;

  ctxSol.fillStyle = '#ffe066';
  ctxSol.beginPath();
  ctxSol.arc(raio, raio, raio - 4, 0, Math.PI * 2);
  ctxSol.fill();

  ctxSol.fillStyle = '#fff3b0';
  ctxSol.beginPath();
  ctxSol.arc(raio, raio, raio - 8, 0, Math.PI * 2);
  ctxSol.fill();

  return canvasSol;
}

function atualizar(dt) {
  const esquerda = teclas['ArrowLeft'] || teclas['KeyA'];
  const direita = teclas['ArrowRight'] || teclas['KeyD'];
  const pular = teclas['Space'] || teclas['ArrowUp'] || teclas['KeyW'];

  personagem.vx = 0;
  if (esquerda) {
    personagem.vx = -VELOCIDADE;
    personagem.direcao = -1;
  }
  if (direita) {
    personagem.vx = VELOCIDADE;
    personagem.direcao = 1;
  }

  if (pular && personagem.noChao) {
    personagem.vy = -FORCA_PULO;
    personagem.noChao = false;
  }

  personagem.vy += GRAVIDADE * dt;
  personagem.x += personagem.vx * dt;
  personagem.y += personagem.vy * dt;

  personagem.x = Math.max(0, Math.min(LARGURA - spritePersonagem.width, personagem.x));

  if (personagem.y >= Y_INICIAL) {
    personagem.y = Y_INICIAL;
    personagem.vy = 0;
    personagem.noChao = true;
  }
}

function desenhar() {
  ctx.fillStyle = ceu;
  ctx.fillRect(0, 0, LARGURA, ALTURA);
  ctx.drawImage(sol, SOL_X - sol.width / 2, SOL_Y - sol.height / 2);
  ctx.drawImage(fundo, 0, 0);
  ctx.drawImage(chao, 0, Y_CHAO - FOLGA_TUFOS);
  ctx.drawImage(vegetacao, 0, 0);

  ctx.save();
  if (personagem.direcao === -1) {
    ctx.translate(personagem.x + spritePersonagem.width, personagem.y);
    ctx.scale(-1, 1);
    ctx.drawImage(spritePersonagem, 0, 0);
  } else {
    ctx.drawImage(spritePersonagem, personagem.x, personagem.y);
  }
  ctx.restore();
}

let ultimoTempo = 0;
function loop(tempoAtual) {
  const dt = ultimoTempo ? Math.min((tempoAtual - ultimoTempo) / 1000, 1 / 30) : 0;
  ultimoTempo = tempoAtual;

  atualizar(dt);
  desenhar();
  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
