// Cada caractere é 1 pixel; '.' é transparente. Personagem virado para a direita.
const SPRITE_PERSONAGEM = [
  '...KKKKK....',
  '..KHHHHHK...',
  '.KHHHHHHHK..',
  '.KHHSSSSSK..',
  '.KHSSSSESK..',
  '.KHSSSSESK..',
  '.KSSSSSSSK..',
  '..KSSSSSK...',
  '..KKRRRRKK..',
  '.KRRRRRRRRK.',
  '.KRRRRRRRRK.',
  '.KSKRRRRKSK.',
  '.KKKrrrrKKK.',
  '..KBBBBBBK..',
  '..KBBBBBBK..',
  '..KBBKKBBK..',
  '..KBBKKBBK..',
  '..KBBKKBBK..',
  '.KOOOKKOOOK.',
  '.KKKKKKKKKK.',
];

const PALETA_PERSONAGEM = {
  K: '#2b1d14',
  H: '#5a3418',
  S: '#f2c29b',
  E: '#1b1b24',
  R: '#d9453a',
  r: '#a8322a',
  B: '#3a5bbf',
  O: '#4a2e1a',
};

function criarSprite(linhas, paleta) {
  const canvas = document.createElement('canvas');
  canvas.width = linhas[0].length;
  canvas.height = linhas.length;
  const ctx = canvas.getContext('2d');
  linhas.forEach((linha, y) => {
    [...linha].forEach((simbolo, x) => {
      const cor = paleta[simbolo];
      if (cor) {
        ctx.fillStyle = cor;
        ctx.fillRect(x, y, 1, 1);
      }
    });
  });
  return canvas;
}
