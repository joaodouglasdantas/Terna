// A rede de um endereço, para achar quem pode jogar na mesma rede (a de casa, da escola, do
// trabalho) sem código: todo mundo dela sai para a internet pelo mesmo IPv4 (o do roteador). No
// IPv6 cada aparelho tem o seu endereço, mas a rede é a mesma metade da frente (o /64). O próprio
// computador (127.0.0.1, ::1) conta como uma rede só: é o jogo rodando em desenvolvimento.

export function redeDoEndereco(ip: string): string {
  const semZona = ip.split('%')[0].toLowerCase();
  const v4 = semZona.startsWith('::ffff:') ? semZona.slice(7) : semZona;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(v4)) return v4.startsWith('127.') ? 'local' : v4;
  if (semZona === '::1') return 'local';
  const pedacos = semZona.split('::');
  if (pedacos.length > 2) return semZona;
  const antes = pedacos[0] ? pedacos[0].split(':') : [];
  const depois = pedacos.length === 2 && pedacos[1] ? pedacos[1].split(':') : [];
  const meio = pedacos.length === 2 ? Array<string>(Math.max(0, 8 - antes.length - depois.length)).fill('0') : [];
  const grupos = [...antes, ...meio, ...depois];
  if (grupos.length !== 8 || grupos.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return semZona;
  return `${grupos
    .slice(0, 4)
    .map((g) => parseInt(g, 16).toString(16))
    .join(':')}::/64`;
}
