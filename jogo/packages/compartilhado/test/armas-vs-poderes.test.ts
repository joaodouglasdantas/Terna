import { describe, expect, it } from 'vitest';
import {
  ARCO,
  BUMERANGUE,
  FARINHA,
  GANSO,
  ROLO,
  CHICOTE,
  ESPADA,
  FLOR,
  IMPACTO,
  INVESTIDA,
  JULGAMENTO,
  PEDRA,
  RAIZES,
  RAJADA,
  REVOADA,
  SALTO,
  SOCO,
  VENENO,
  VENTO,
  danoNaZona,
} from '../src';

// Um uso inteiro de cada poder, com tudo acertando (a conta do BALANCEAMENTO.md): vários poderes são
// feitos de golpes pequenos (o veneno, as rodas, as cusparadas), então o que conta é o uso todo.
const USOS: Record<string, number> = {
  'Chicote (o acerto e o veneno)': CHICOTE.dano + VENENO.dano * Math.floor(VENENO.duracao / VENENO.intervalo),
  'Raízes (as três rodas)': RAIZES.dano * RAIZES.rodas,
  'Flor Carnívora (as cusparadas)': FLOR.tiro.dano * Math.floor(FLOR.duracao / FLOR.intervalo),
  'Revoada de Águias (o tombo)': REVOADA.dano,
  'Vendaval (soprando o tempo todo)': VENTO.dano * Math.floor(VENTO.duracao / VENTO.tique),
  'Salto Esmagador': SALTO.dano,
  Investida: INVESTIDA.dano,
  'Pedra (em cheio)': PEDRA.dano,
  'Impacto Angelical (a fileira)': IMPACTO.dano * IMPACTO.explosoes,
  'Rajada de Amor (os dois corações)': RAJADA.dano * 2,
  'Julgamento Celestial': JULGAMENTO.dano,
  'Bumerangue de Rolo (a ida e a volta)': BUMERANGUE.dano * 2,
  'Saco de Farinha (o saco e a nuvem toda)': FARINHA.dano + FARINHA.danoTique * Math.floor(FARINHA.duracao / FARINHA.tique),
  'Ganso Raivoso (bicando o tempo todo)': GANSO.dano * Math.floor(GANSO.duracao / GANSO.intervalo),
};

describe('as armas do chão são a segunda opção: os poderes é que carregam a luta', () => {
  for (const arma of [ESPADA, ARCO]) {
    it(`${arma.nome}: até o crítico na cabeça tira menos que um uso inteiro de qualquer poder`, () => {
      const critico = danoNaZona(arma.dano, 'cabeca');
      for (const [poder, uso] of Object.entries(USOS)) expect(critico, poder).toBeLessThan(uso);
    });
  }

  it('o soco é o ataque mais fraco do jogo: menos que qualquer arma, até sem o crítico', () => {
    expect(SOCO.dano).toBeLessThan(Math.min(ESPADA.dano, ARCO.dano));
  });

  it('a rolada da Margo (a arma dela, no lugar do soco) também fica abaixo de qualquer poder', () => {
    for (const [poder, uso] of Object.entries(USOS)) expect(ROLO.dano, poder).toBeLessThan(uso);
    expect(ROLO.dano).toBeGreaterThan(SOCO.dano);
  });

  it('o poder mais fraco continua sendo o Chicote (é ele a régua das armas)', () => {
    const [mais_fraco] = Object.entries(USOS).sort((a, b) => a[1] - b[1])[0];
    expect(mais_fraco).toBe('Chicote (o acerto e o veneno)');
  });
});
