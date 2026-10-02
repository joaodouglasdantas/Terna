"""Simulador de duelo do Terna, para o balanceamento (BALANCEAMENTO.md explica).

Uso (na pasta jogo/):  python3 ferramentas/simular-duelo.py           # os números de agora
                       python3 ferramentas/simular-duelo.py anterior  # os de antes do dano subir (lutas de 3 a 4 min)
                       python3 ferramentas/simular-duelo.py antes     # os de antes do primeiro balanceamento
                       python3 ferramentas/simular-duelo.py furia     # com a Fúria, antes da Flor

Os números do jogo ficam em packages/compartilhado/src/conteudo/*.ts; aqui eles estão copiados em
NUMEROS (mudou lá, mude aqui também). 'p' (a chance de acertar), 'ocupa', 'engajado', 'longe',
'pegarArma' e os valores de controle ('tira', 'atrapalha', 'prende', 'esquivaAnjo') são do modelo,
não do jogo.

Modelo (o mesmo para todos, então compara os kits entre si):
- A luta alterna trechos "engajados" (os dois perto, trocando golpes) e "reposicionando" (ninguém
  acerta nada). Médias: 4 s engajado, 3 s longe (~57% do tempo engajado).
- Engajado, cada um, quando está livre (não está no meio de um golpe/poder), escolhe a ação pronta
  com mais dano esperado por segundo ocupado; a ult sai quando a barra enche.
- Cada ação acerta com uma chance fixa (a de dois jogadores do mesmo nível, com os avisos e as
  esquivas que o jogo dá). Controle (raízes, encanto, águias, vento) muda as chances de quem sofre.
- Armas: sem arma, chance de pegar uma por segundo (as quedas do céu); dura 30 s na mão.
- Energia pixy: `porDano` × vida tirada (depois da defesa do golem).
"""
import random
import copy
import statistics

NUMEROS = {'vida': 2500,
 'porDano': 0.2,
 'porDano_grow': 0.3,
 'duracaoPartida': 300,
 'engajado': 4.0,
 'longe': 3.0,
 'pegarArma': 0.125,
 'espada': {'dano': 33, 'recarga': 1.15, 'ocupa': 0.34, 'p': 0.45},
 'arco': {'dano': 28, 'recarga': 1.4, 'ocupa': 0.4, 'p': 0.35},
 'durabilidade': 30,
 'soco': {'dano': 5, 'recarga': 0.45, 'ocupa': 0.25, 'p': 0.45},
 'chicote': {'dano': 11, 'recarga': 1.4, 'ocupa': 0.44, 'p': 0.4, 'custo': 2},
 # cura 0,4: no jogo, cada pinguinho de 5 devolve 2 (arredondado).
 'veneno': {'dano': 5, 'intervalo': 0.5, 'duracao': 2.5, 'cura': 0.4},
 'raizes': {'dano': 18, 'rodas': 3, 'recarga': 9, 'ocupa': 0.5, 'p': 0.35, 'custo': 6, 'prende': 2.4},
 'furia': {'dano': 250, 'recarga': 3, 'ocupa': 0.4, 'p': 0.35, 'pPreso': 0.9, 'custo': 100, 'cura': 100},
 # A Flor Carnívora (a ult da Leslie no lugar da Fúria): brota, segue o outro (longe, por baixo
 # da terra) e cospe de longe, esteja a luta perto ou não. 'antes': segundos até a primeira
 # cusparada. 'p' 0,6 (era 0,35): cada cusparada é um par de bolas, uma baixa e uma alta, a
 # 320 px/s (era uma, a 230) — o pulo simples não escapa; só o pulo duplo na hora, ou sair do
 # alcance. O par fere uma vez só.
 'flor': {'dano': 29, 'envenena': True, 'duracao': 14, 'intervalo': 1.6, 'antes': 1.6, 'recarga': 3, 'ocupa': 0.4, 'p': 0.6, 'custo': 100},
 'aves': {'dano': 69, 'bicada': 8, 'recarga': 6.5, 'ocupa': 0.35, 'p': 0.35, 'custo': 2, 'tira': 2.0},
 'vento': {'tique': 0.3, 'dano': 6, 'duracao': 3.6, 'recarga': 8, 'p': 0.5, 'custo': 3, 'atrapalha': 0.5},
 'golem': {'duracao': 30, 'recarga': 10, 'defesa': 0.4, 'custo': 100},
 'salto': {'dano': 175, 'recarga': 5, 'ocupa': 1.25, 'p': 0.35},
 'investida': {'dano': 163, 'recarga': 6, 'ocupa': 1.3, 'p': 0.35},
 'pedra': {'dano': 156, 'lascas': 81, 'recarga': 5, 'ocupa': 0.6, 'p': 0.3, 'pLascas': 0.3},
 'anjo': {'duracao': 35, 'recarga': 8, 'custo': 100},
 'impacto': {'dano': 100, 'explosoes': 3, 'recarga': 4, 'ocupa': 0.35, 'p': 0.3},
 'rajada': {'dano': 75, 'coracoes': 2, 'recarga': 8, 'ocupa': 0.3, 'p': 0.3, 'encanto': 1.5},
 'julgamento': {'dano': 400, 'recarga': 18, 'ocupa': 0.3, 'p': 0.35, 'pPreso': 0.9},
 'porDano_anjo': 0.45}


class Lutador:
    def __init__(self, heroi, cfg, rng):
        self.h = heroi
        self.cfg = cfg
        self.rng = rng
        self.vida = cfg['vida']
        self.energia = 0.0
        self.arma = None  # (tipo, durabilidade)
        self.rec = {}  # recargas
        self.ocupado = 0.0
        self.forma = 'base'
        self.formaResta = 0.0
        self.formaRecarga = 0.0
        self.preso = 0.0  # não anda: quem ataca acerta mais
        self.fora = 0.0  # levado/enfeitiçado: não ataca
        self.atrapalhado = 0.0  # no vento: ataca menos
        self.veneno = 0.0
        self.venenoTique = 0.0
        self.venenoDono = None
        self.flor = 0.0  # segundos que a flor carnívora ainda fica de pé
        self.florTique = 0.0
        self.canal = 0.0  # soprando
        self.canalTique = 0.0
        self.danoFeito = 0.0
        self.porFonte = {}

    def pronto(self, k):
        return self.rec.get(k, 0) <= 0

    def porDano(self):
        return self.cfg.get('porDano_' + self.h, self.cfg['porDano'])

    def defesa(self):
        return self.cfg['golem']['defesa'] if self.forma == 'golem' else 0.0


def voando(alvo, rng):
    # O anjo voa: do chão é mais difícil acertar ele.
    return alvo.forma == 'anjo' and rng.random() < alvo.cfg.get('esquivaAnjo', 0.25)


def ferir(atq, alvo, dano, fonte):
    real = dano * (1 - alvo.defesa())
    real = min(real, alvo.vida)
    alvo.vida -= real
    atq.danoFeito += real
    atq.porFonte[fonte] = atq.porFonte.get(fonte, 0) + real
    if atq.forma == 'base':  # de anjo/golem a barra não carrega
        atq.energia = min(100, atq.energia + real * atq.porDano())


def acoes(l):
    """Ações que o lutador pode usar agora: (nome, dano esperado, ocupa)."""
    c = l.cfg
    out = []
    if l.forma == 'golem':
        for k in ('salto', 'investida', 'pedra'):
            if l.pronto(k):
                d = c[k]
                esp = d['dano'] * d['p'] + (d.get('lascas', 0) * (1 - d['p']) * d.get('pLascas', 0))
                out.append((k, esp, d['ocupa']))
        return out
    if l.forma == 'anjo':
        for k in ('impacto', 'rajada', 'julgamento'):
            if l.pronto(k):
                d = c[k]
                n = d.get('explosoes', d.get('coracoes', 1))
                out.append((k, d['dano'] * d['p'] * n, d['ocupa']))
        return out
    # forma base: arma na mão, soco ou os poderes
    if l.arma:
        tipo = l.arma[0]
        if l.pronto('arma'):
            d = c[tipo]
            out.append(('arma', d['dano'] * d['p'], d['ocupa']))
    elif c['soco'] and l.pronto('soco'):
        d = c['soco']
        out.append(('soco', d['dano'] * d['p'], d['ocupa']))
    if l.h == 'leslie':
        for k in ('chicote', 'raizes'):
            d = c[k]
            if l.pronto(k) and l.energia >= d['custo']:
                if k == 'chicote':
                    v = c['veneno']
                    esp = (d['dano'] + v['dano'] * v['duracao'] / v['intervalo']) * d['p']
                else:
                    esp = d['dano'] * d['rodas'] * d['p'] * 0.8 + 40  # vale pelo que prende
                # guarda energia para a Fúria quando já está perto
                if l.energia - d['custo'] < 70 and l.energia >= 70:
                    continue
                out.append((k, esp, d['ocupa']))
        ult = 'flor' if c.get('flor') else 'furia'
        if l.energia >= c[ult]['custo'] and l.pronto(ult) and l.flor <= 0:
            out.append((ult, 9999, c[ult]['ocupa']))
    if l.h == 'grow':
        d = c['aves']
        if l.pronto('aves') and l.energia >= d['custo']:
            out.append(('aves', d['dano'] * d['p'] + 15, d['ocupa']))
        d = c['vento']
        if l.pronto('vento') and l.energia >= d['custo']:
            out.append(('vento', d['dano'] * d['duracao'] / d['tique'] * d['p'] + 10, 1.0))
        if l.energia >= c['golem']['custo'] and l.formaRecarga <= 0:
            out.append(('virar', 9999, 0.6))
    if l.h == 'anjo':
        if l.energia >= c['anjo']['custo'] and l.formaRecarga <= 0:
            out.append(('virar', 9999, 0.6))
    return out


def agir(l, o, nome, rng):
    c = l.cfg
    if voando(o, rng) and nome not in ('virar', 'vento'):
        # errou (ele estava no alto); o golpe sai do mesmo jeito
        d = c['soco'] if nome == 'soco' else c[l.arma[0]] if nome == 'arma' else c.get(nome, {})
        if nome == 'arma':
            l.rec['arma'] = d['recarga']
        else:
            l.rec[nome] = d.get('recarga', 0)
        l.ocupado = d.get('ocupa', 0.4)
        if 'custo' in d:
            l.energia -= d['custo']
        return
    if nome == 'arma':
        tipo = l.arma[0]
        d = c[tipo]
        l.rec['arma'] = d['recarga']
        l.ocupado = d['ocupa']
        p = 0.9 if o.preso > 0 else d['p']
        if rng.random() < p:
            ferir(l, o, d['dano'], tipo)
        return
    if nome == 'soco':
        d = c['soco']
        l.rec['soco'] = d['recarga']
        l.ocupado = d['ocupa']
        p = 0.9 if o.preso > 0 else d['p']
        if rng.random() < p:
            ferir(l, o, d['dano'], 'soco')
        return
    if nome == 'virar':
        l.energia = 0
        l.arma = None
        l.ocupado = 0.6
        if l.h == 'grow':
            l.forma, l.formaResta = 'golem', c['golem']['duracao']
        else:
            l.forma, l.formaResta = 'anjo', c['anjo']['duracao']
        return
    d = c[nome]
    l.rec[nome] = d['recarga']
    l.ocupado = d.get('ocupa', 0.4)
    if 'custo' in d:
        l.energia -= d['custo']
    pBase = d.get('p', 0.35)
    p = d.get('pPreso', 0.9) if o.preso > 0 else pBase
    if o.fora > 0 and nome in ('julgamento', 'impacto', 'furia'):
        p = 0.9  # enfeitiçado anda até você
    if nome == 'chicote':
        if rng.random() < p:
            ferir(l, o, d['dano'], 'chicote')
            o.veneno = c['veneno']['duracao']
            o.venenoDono = l
            o.venenoTique = c['veneno']['intervalo']
    elif nome == 'raizes':
        acertou = False
        for i in range(d['rodas']):
            pr = p if not acertou else 0.8
            if rng.random() < pr:
                ferir(l, o, d['dano'], 'raizes')
                acertou = True
                o.preso = max(o.preso, [1.1, 1.6, 2.4][i])
    elif nome == 'furia':
        if rng.random() < p:
            ferir(l, o, d['dano'], 'furia')
        l.vida = min(c['vida'], l.vida + d['cura'])
    elif nome == 'flor':
        l.flor = d['duracao'] + d['antes']
        l.florTique = d['antes']
    elif nome == 'aves':
        if rng.random() < p:
            if o.forma == 'golem':
                ferir(l, o, d['bicada'], 'aves')
            else:
                ferir(l, o, d['dano'], 'aves')
                o.fora = max(o.fora, d['tira'])
    elif nome == 'vento':
        l.canal = d['duracao']
        l.canalTique = d['tique']
        l.ocupado = d['duracao'] * 0.7
    elif nome in ('salto', 'investida'):
        if rng.random() < p:
            ferir(l, o, d['dano'], nome)
    elif nome == 'pedra':
        if rng.random() < p:
            ferir(l, o, d['dano'], 'pedra')
        elif rng.random() < d['pLascas']:
            ferir(l, o, d['lascas'], 'pedra')
    elif nome == 'impacto':
        for _ in range(d['explosoes']):
            if rng.random() < p:
                ferir(l, o, d['dano'], 'impacto')
    elif nome == 'rajada':
        n = 0
        for _ in range(d['coracoes']):
            if rng.random() < p:
                ferir(l, o, d['dano'], 'rajada')
                n += 1
        if n:
            o.fora = max(o.fora, d['encanto'] * n)
    elif nome == 'julgamento':
        if rng.random() < p:
            ferir(l, o, d['dano'], 'julgamento')


def passo(l, o, dt, engajado, rng):
    c = l.cfg
    for k in list(l.rec):
        l.rec[k] = max(0, l.rec[k] - dt)
    l.ocupado = max(0, l.ocupado - dt)
    l.preso = max(0, l.preso - dt)
    l.fora = max(0, l.fora - dt)
    l.formaRecarga = max(0, l.formaRecarga - dt)
    if l.forma != 'base':
        l.formaResta -= dt
        l.energia = 100 * max(0, l.formaResta) / (c['golem' if l.forma == 'golem' else 'anjo']['duracao'])
        if l.formaResta <= 0:
            l.forma = 'base'
            l.energia = 0
            l.formaRecarga = c['golem' if l.h == 'grow' else 'anjo']['recarga']
    # veneno em mim
    if l.veneno > 0:
        l.veneno -= dt
        l.venenoTique -= dt
        if l.venenoTique <= 0:
            l.venenoTique += c['veneno']['intervalo']
            antes = l.vida
            ferir(l.venenoDono, l, c['veneno']['dano'], 'veneno')
            # O chicote cura a Leslie em metade do que o veneno tirou.
            dono = l.venenoDono
            dono.vida = min(c['vida'], dono.vida + (antes - l.vida) * c['veneno'].get('cura', 0))
    # a flor carnívora cuspindo (segue o outro: vale perto ou longe)
    if l.flor > 0:
        l.flor -= dt
        l.florTique -= dt
        if l.florTique <= 0 and l.flor > 0:
            d = c['flor']
            l.florTique += d['intervalo']
            p = 0.9 if o.preso > 0 else d['p']
            if not voando(o, rng) and rng.random() < p:
                ferir(l, o, d['dano'], 'flor')
                if d.get('envenena'):  # a bola deixa envenenado, como o chicote
                    o.veneno = c['veneno']['duracao']
                    o.venenoDono = l
                    o.venenoTique = c['veneno']['intervalo']
    # soprando
    if l.canal > 0:
        l.canal -= dt
        l.canalTique -= dt
        if engajado:
            o.fora = max(o.fora, 0)  # não tira de ação, só atrapalha
            o.atrapalhado = 0.3
        if l.canalTique <= 0:
            l.canalTique += c['vento']['tique']
            if engajado and rng.random() < c['vento']['p']:
                ferir(l, o, c['vento']['dano'], 'vento')
    o.atrapalhado = max(0, o.atrapalhado - dt)
    # arma
    if l.arma:
        t, dur = l.arma
        dur -= dt
        l.arma = (t, dur) if dur > 0 else None
    elif l.forma == 'base' and rng.random() < c['pegarArma'] * dt:
        l.arma = (rng.choice(['espada', 'arco']), c['durabilidade'])
        l.rec['arma'] = 0
    if not engajado or l.ocupado > 0 or l.fora > 0 or l.vida <= 0:
        return
    if l.atrapalhado > 0 and rng.random() < c['vento']['atrapalha']:
        return
    opcoes = acoes(l)
    if not opcoes:
        return
    nome = max(opcoes, key=lambda a: a[1] / max(0.3, a[2]))[0]
    agir(l, o, nome, rng)


def duelo(ha, hb, cfg, rng):
    a, b = Lutador(ha, cfg, rng), Lutador(hb, cfg, rng)
    t, dt = 0.0, 0.05
    engajado = False
    troca = rng.expovariate(1 / cfg['longe'])
    while t < cfg['duracaoPartida']:
        t += dt
        troca -= dt
        if troca <= 0:
            engajado = not engajado
            troca = rng.expovariate(1 / (cfg['engajado'] if engajado else cfg['longe']))
        ordem = [(a, b), (b, a)] if rng.random() < 0.5 else [(b, a), (a, b)]
        for l, o in ordem:
            passo(l, o, dt, engajado, rng)
        if a.vida <= 0 or b.vida <= 0:
            break
    if a.vida <= 0 and b.vida <= 0:
        v = None
    elif b.vida <= 0:
        v = 'a'
    elif a.vida <= 0:
        v = 'b'
    else:
        v = 'a' if a.vida > b.vida else 'b' if b.vida > a.vida else None  # no tempo: mais vida
    return t, v, a.vida <= 0 or b.vida <= 0, a, b


def relatorio(cfg, herois=('leslie', 'grow', 'anjo'), n=400, seed=1):
    rng = random.Random(seed)
    linhas = []
    for i, ha in enumerate(herois):
        for hb in herois[i:]:
            tempos, vit, ko = [], {'a': 0, 'b': 0, None: 0}, 0
            fontes = {}
            for _ in range(n):
                t, v, k, a, b = duelo(ha, hb, cfg, rng)
                tempos.append(t)
                vit[v] += 1
                ko += k
                for f, d in a.porFonte.items():
                    fontes[(ha, f)] = fontes.get((ha, f), 0) + d
            tempos.sort()
            linhas.append({
                'duelo': f'{ha} x {hb}',
                'mediana_s': statistics.median(tempos),
                'p90_s': tempos[int(0.9 * (n - 1))],
                'ko_%': 100 * ko / n,
                'vitA_%': 100 * vit['a'] / n,
                'vitB_%': 100 * vit['b'] / n,
                'fontesA': {f: round(d / n) for (h, f), d in fontes.items() if h == ha},
            })
    return linhas


# Os de antes de o dano subir ~25% (a luta durava 3 a 4 min; agora ~2,5 a 3 e quase nunca passa de 4).
ANTERIOR = copy.deepcopy(NUMEROS)
for chave, valor in {
    'espada': {'dano': 26}, 'arco': {'dano': 22}, 'soco': {'dano': 4}, 'chicote': {'dano': 8},
    'veneno': {'dano': 4, 'cura': 0.5}, 'raizes': {'dano': 14}, 'flor': {'dano': 23},
    'aves': {'dano': 55, 'bicada': 6}, 'vento': {'dano': 5}, 'salto': {'dano': 140}, 'investida': {'dano': 130},
    'pedra': {'dano': 125, 'lascas': 65}, 'impacto': {'dano': 80}, 'rajada': {'dano': 60}, 'julgamento': {'dano': 320},
}.items():
    ANTERIOR[chave].update(valor)


# Os números de antes do balanceamento (vida 1000), para comparar.
ANTES = copy.deepcopy(ANTERIOR)
for chave, valor in {
    'vida': 1000, 'porDano': 0.3, 'porDano_grow': 0.4, 'porDano_anjo': 0.3, 'soco': None,
    'espada': {'dano': 35, 'recarga': 0.6}, 'arco': {'dano': 30, 'recarga': 0.9},
    'chicote': {'custo': 10, 'dano': 10}, 'veneno': {'dano': 6, 'cura': 0, 'duracao': 3}, 'raizes': {'custo': 25}, 'flor': None,
    'furia': {'dano': 180, 'cura': 60}, 'aves': {'dano': 20}, 'vento': {'dano': 2},
    'salto': {'dano': 100}, 'investida': {'dano': 80}, 'pedra': {'dano': 95, 'lascas': 50},
    'anjo': {'duracao': 25, 'recarga': 10}, 'impacto': {'dano': 50}, 'rajada': {'dano': 40},
    'julgamento': {'dano': 230, 'recarga': 22},
}.items():
    if isinstance(valor, dict):
        ANTES[chave].update(valor)
    else:
        ANTES[chave] = valor


# Os de logo antes da Flor Carnívora: a Fúria da Floresta (com a cura) e o chicote sem cura.
FURIA = copy.deepcopy(ANTERIOR)
FURIA['flor'] = None
FURIA['veneno'].update({'cura': 0, 'duracao': 3})
FURIA['chicote']['dano'] = 10


def imprimir(cfg, n=600):
    print(f"{'duelo':16s} {'mediana':>8s} {'90%**':>7s} {'por KO':>7s} {'vence A':>8s} {'vence B':>8s} {'armas*':>7s}  dano de A por fonte (média)")
    for l in relatorio(cfg, n=n):
        f = l['fontesA']
        tot = sum(f.values()) or 1
        armas = (f.get('espada', 0) + f.get('arco', 0) + f.get('soco', 0)) / tot
        fontes = ', '.join(f'{k} {v}' for k, v in sorted(f.items(), key=lambda x: -x[1]))
        print(f"{l['duelo']:16s} {l['mediana_s']:6.0f} s {l['p90_s']:5.0f} s {l['ko_%']:6.1f}% {l['vitA_%']:7.0f}% {l['vitB_%']:7.0f}% {100 * armas:6.0f}%  {fontes}")
    print('* a parte do dano de A que veio da espada, do arco e do soco')
    print('** 9 de cada 10 lutas acabam até este tempo')


if __name__ == '__main__':
    import sys
    args = sys.argv[1:]
    imprimir(ANTERIOR if 'anterior' in args else ANTES if 'antes' in args else FURIA if 'furia' in args else NUMEROS, n=2000 if 'mais' in args else 600)
