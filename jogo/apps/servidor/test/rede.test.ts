import { describe, expect, it } from 'vitest';
import { redeDoEndereco } from '../src/partida/rede';

describe('rede do endereço', () => {
  it('no IPv4, o endereço inteiro (o do roteador)', () => {
    expect(redeDoEndereco('200.1.2.3')).toBe('200.1.2.3');
    expect(redeDoEndereco('::ffff:200.1.2.3')).toBe('200.1.2.3');
  });

  it('no IPv6, a metade da frente: aparelhos da mesma casa caem juntos', () => {
    expect(redeDoEndereco('2804:14c:65a1:4001:1c2e:9f3:aa1:7')).toBe('2804:14c:65a1:4001::/64');
    expect(redeDoEndereco('2804:14c:65a1:4001::99')).toBe('2804:14c:65a1:4001::/64');
    expect(redeDoEndereco('2804:014C:65a1:4001:0:0:0:1%eth0')).toBe('2804:14c:65a1:4001::/64');
    expect(redeDoEndereco('2804:14c:65a1:4002::1')).not.toBe(redeDoEndereco('2804:14c:65a1:4001::1'));
  });

  it('o próprio computador é uma rede só', () => {
    expect(redeDoEndereco('127.0.0.1')).toBe('local');
    expect(redeDoEndereco('::1')).toBe('local');
    expect(redeDoEndereco('::ffff:127.0.0.1')).toBe('local');
  });
});
