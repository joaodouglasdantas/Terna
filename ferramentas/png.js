// Leitura e escrita de PNG RGBA 8 bits sem dependências, usadas pelos geradores de sprites.

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function lerPng(arquivo) {
  const buf = fs.readFileSync(arquivo);
  let off = 8;
  let largura = 0;
  let altura = 0;
  const partes = [];
  while (off < buf.length) {
    const tam = buf.readUInt32BE(off);
    const tipo = buf.toString('ascii', off + 4, off + 8);
    if (tipo === 'IHDR') {
      largura = buf.readUInt32BE(off + 8);
      altura = buf.readUInt32BE(off + 12);
      if (buf[off + 16] !== 8 || buf[off + 17] !== 6 || buf[off + 20] !== 0) {
        throw new Error('o PNG precisa ser RGBA 8 bits sem entrelaçamento');
      }
    }
    if (tipo === 'IDAT') partes.push(buf.subarray(off + 8, off + 8 + tam));
    if (tipo === 'IEND') break;
    off += 12 + tam;
  }
  const bruto = zlib.inflateSync(Buffer.concat(partes));
  const passo = largura * 4;
  const px = Buffer.alloc(largura * altura * 4);
  for (let y = 0; y < altura; y++) {
    const filtro = bruto[y * (passo + 1)];
    const ini = y * (passo + 1) + 1;
    for (let x = 0; x < passo; x++) {
      const a = x >= 4 ? px[y * passo + x - 4] : 0;
      const b = y > 0 ? px[(y - 1) * passo + x] : 0;
      const c = x >= 4 && y > 0 ? px[(y - 1) * passo + x - 4] : 0;
      let v = bruto[ini + x];
      if (filtro === 1) v += a;
      else if (filtro === 2) v += b;
      else if (filtro === 3) v += (a + b) >> 1;
      else if (filtro === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      px[y * passo + x] = v & 255;
    }
  }
  return { largura, altura, px };
}

const TABELA_CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = TABELA_CRC[(c ^ byte) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function escreverPng(arquivo, largura, altura, px) {
  const bloco = (tipo, dados) => {
    const tam = Buffer.alloc(4);
    tam.writeUInt32BE(dados.length);
    const corpo = Buffer.concat([Buffer.from(tipo, 'ascii'), dados]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(corpo));
    return Buffer.concat([tam, corpo, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(largura, 0);
  ihdr.writeUInt32BE(altura, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const linhas = Buffer.alloc(altura * (largura * 4 + 1));
  for (let y = 0; y < altura; y++) {
    px.copy(linhas, y * (largura * 4 + 1) + 1, y * largura * 4, (y + 1) * largura * 4);
  }
  fs.mkdirSync(path.dirname(arquivo), { recursive: true });
  fs.writeFileSync(
    arquivo,
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      bloco('IHDR', ihdr),
      bloco('IDAT', zlib.deflateSync(linhas, { level: 9 })),
      bloco('IEND', Buffer.alloc(0)),
    ]),
  );
}

module.exports = { lerPng, escreverPng };
