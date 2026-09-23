// Os quadros vêm de assets/personagem.png, gerado a partir do SpriteBase.png por
// ferramentas/gerar-personagem.js. Personagem desenhado virado para a direita.

function carregarAnimacoesPersonagem() {
  return new Promise((resolve, reject) => {
    const folha = new Image();
    folha.onload = () => {
      const animacoes = {};
      Object.entries(QUADROS_PERSONAGEM).forEach(([nome, quadros]) => {
        animacoes[nome] = quadros.map((q) => {
          const canvas = document.createElement('canvas');
          canvas.width = q.w;
          canvas.height = q.h;
          canvas.getContext('2d').drawImage(folha, q.x, q.y, q.w, q.h, 0, 0, q.w, q.h);
          return { imagem: canvas, eixo: q.ax };
        });
      });
      resolve(animacoes);
    };
    folha.onerror = () => reject(new Error('não foi possível carregar assets/personagem.png'));
    folha.src = 'assets/personagem.png';
  });
}
