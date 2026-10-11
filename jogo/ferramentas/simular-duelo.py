"""Simulador de duelo do Terna, para o balanceamento (BALANCEAMENTO.md explica).

Uso (na pasta jogo/):  python3 ferramentas/simular-duelo.py            # os números de agora (lutas de até 3 min, armas abaixo dos poderes)
                       python3 ferramentas/simular-duelo.py antesarmas # os de antes de as armas ficarem abaixo dos poderes (crítico da espada: 60)
                       python3 ferramentas/simular-duelo.py antes3min  # os de antes de a luta encurtar para até 3 min (2,5 a 3 min, até 4)
                       python3 ferramentas/simular-duelo.py anterior   # os de antes do dano subir ~25% (lutas de 3 a 4 min)
                       python3 ferramentas/simular-duelo.py antes      # os de antes do primeiro balanceamento
                       python3 ferramentas/simular-duelo.py furia      # com a Fúria, antes da Flor
                       (acrescente `mais` para 2000 duelos de cada em vez de 600)

A meta (outubro de 2026): a luta entre dois do mesmo nível quase sempre acaba em até 3 min (as
rápidas e as médias, a coluna "até 3 min"); os 3 a 5 min do relógio ficam para as lutas difíceis ou
peculiares, e passar de 4 é raro (a coluna "> 4 min"). Quem vence segue perto de 50% × 50%.
A Margo (sem arma do chão nem soco: a rolada, o Bumerangue, a Farinha e o Ganso Raivoso) entra nos
duelos dos números de agora; os conjuntos de antes são sem ela.

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
 'porDano': 0.215,
 'porDano_grow': 0.3,
 'duracaoPartida': 300,
 'engajado': 4.0,
 'longe': 3.0,
 'pegarArma': 0.125,
 # As armas são a segunda opção: o crítico delas (x1,5 na cabeça: 39 e 33) fica abaixo de um uso
 # inteiro de qualquer poder (o mais fraco, o Chicote com o veneno: 15 + 7 x 5 = 50).
 'espada': {'dano': 26, 'recarga': 1.15, 'ocupa': 0.34, 'p': 0.45},
 'arco': {'dano': 22, 'recarga': 1.4, 'ocupa': 0.4, 'p': 0.35},
 'durabilidade': 30,
 'soco': {'dano': 4, 'recarga': 0.45, 'ocupa': 0.25, 'p': 0.45},
 'chicote': {'dano': 15, 'recarga': 1.4, 'ocupa': 0.44, 'p': 0.4, 'custo': 2},
 # cura 2/7: no jogo, cada pinguinho de 7 devolve 2 (VENENO.cura 0,3, arredondado).
 'veneno': {'dano': 7, 'intervalo': 0.5, 'duracao': 2.5, 'cura': 2 / 7},
 'raizes': {'dano': 25, 'rodas': 3, 'recarga': 9, 'ocupa': 0.5, 'p': 0.35, 'custo': 6, 'prende': 2.4},
 'furia': {'dano': 250, 'recarga': 3, 'ocupa': 0.4, 'p': 0.35, 'pPreso': 0.9, 'custo': 100, 'cura': 100},
 # A Flor Carnívora (a ult da Leslie no lugar da Fúria): brota, segue o outro (longe, por baixo
 # da terra) e cospe de longe, esteja a luta perto ou não. 'antes': segundos até a primeira
 # cusparada. 'p' 0,6 (era 0,35): cada cusparada é um par de bolas, uma baixa e uma alta, a
 # 320 px/s (era uma, a 230) — o pulo simples não escapa; só o pulo duplo na hora, ou sair do
 # alcance. O par fere uma vez só.
 'flor': {'dano': 46, 'envenena': True, 'duracao': 14, 'intervalo': 1.6, 'antes': 1.6, 'recarga': 3, 'ocupa': 0.4, 'p': 0.6, 'custo': 100},
 'aves': {'dano': 95, 'bicada': 12, 'recarga': 6.5, 'ocupa': 0.35, 'p': 0.35, 'custo': 2, 'tira': 2.0},
 'vento': {'tique': 0.3, 'dano': 8, 'duracao': 3.6, 'recarga': 8, 'p': 0.5, 'custo': 3, 'atrapalha': 0.5},
 'golem': {'duracao': 30, 'recarga': 10, 'defesa': 0.4, 'custo': 100},
 'salto': {'dano': 241, 'recarga': 5, 'ocupa': 1.25, 'p': 0.35},
 'investida': {'dano': 225, 'recarga': 6, 'ocupa': 1.3, 'p': 0.35},
 'pedra': {'dano': 215, 'lascas': 112, 'recarga': 5, 'ocupa': 0.6, 'p': 0.3, 'pLascas': 0.3},
 'anjo': {'duracao': 35, 'recarga': 8, 'custo': 100},
 'impacto': {'dano': 150, 'explosoes': 3, 'recarga': 4, 'ocupa': 0.35, 'p': 0.3},
 'rajada': {'dano': 113, 'coracoes': 2, 'recarga': 8, 'ocupa': 0.3, 'p': 0.3, 'encanto': 1.5},
 'julgamento': {'dano': 598, 'recarga': 18, 'ocupa': 0.3, 'p': 0.35, 'pPreso': 0.9},
 'porDano_anjo': 0.62,
 # A Margo: sem arma do chão nem soco; a rolada (o rolo de massa) é a arma dela.
 'porDano_margo': 0.27,
 'rolo': {'dano': 25, 'recarga': 0.6, 'ocupa': 0.42, 'p': 0.45},
 # Acerta na ida e na volta (a volta, um pouco menos: o outro já está esperto); sem o rolo na mão
 # enquanto ele voa ('voando').
 'bumerangue': {'dano': 48, 'recarga': 4, 'ocupa': 0.35, 'p': 0.35, 'pVolta': 0.3, 'voando': 1.2, 'custo': 2},
 # O saco ('p') e a nuvem: 'pNuvem' a chance de o outro ficar nela, 'dentro' quanto tempo fica
 # (cada 'tique' tira 'danoTique') e, enfarinhado ('lento' s), ele é acertado mais ('mais').
 'farinha': {'dano': 30, 'recarga': 9, 'ocupa': 0.4, 'p': 0.3, 'custo': 6, 'pNuvem': 0.55, 'dentro': 1.6, 'tique': 0.5, 'danoTique': 8, 'lento': 2.0, 'mais': 1.3},
 # O Ganso Raivoso: corre atrás (rápido: vale perto ou longe) e bica; 'p' por bicada, engajado ou
 # não ('pLonge': o outro foge para longe e pula por cima mais).
 'ganso': {'duracao': 9, 'estufa': 0.45, 'intervalo': 0.38, 'dano': 22, 'p': 0.5, 'pLonge': 0.4, 'recarga': 3, 'ocupa': 0.4, 'custo': 100}}


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
        self.ganso = 0.0  # segundos que o Ganso Raivoso ainda fica bravo
        self.gansoTique = 0.0
        self.lento = 0.0  # enfarinhado: quem ataca acerta mais
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
    # forma base: arma na mão, soco ou os poderes (a Margo: o rolo e os dela)
    if l.h == 'margo':
        if l.pronto('rolo'):
            d = c['rolo']
            out.append(('rolo', d['dano'] * d['p'], d['ocupa']))
        d = c['bumerangue']
        if l.pronto('bumerangue') and l.energia >= d['custo']:
            out.append(('bumerangue', d['dano'] * (d['p'] + d['pVolta']), d['ocupa']))
        d = c['farinha']
        if l.pronto('farinha') and l.energia >= d['custo']:
            out.append(('farinha', d['dano'] * d['p'] + d['pNuvem'] * d['dentro'] / d['tique'] * d['danoTique'] + 15, d['ocupa']))
        d = c['ganso']
        if l.energia >= d['custo'] and l.pronto('ganso') and l.ganso <= 0:
            out.append(('ganso', 9999, d['ocupa']))
        return out
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


def pegou(o, p):
    """A chance de acertar quem está enfarinhado (lento, sem arranco) sobe."""
    if o.preso > 0:
        return max(p, 0.9)
    return min(0.9, p * o.cfg['farinha']['mais']) if o.lento > 0 else p


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
    if nome == 'rolo':
        d = c['rolo']
        l.rec['rolo'] = d['recarga']
        l.ocupado = d['ocupa']
        if rng.random() < pegou(o, d['p']):
            ferir(l, o, d['dano'], 'rolo')
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
    elif nome == 'bumerangue':
        for pp in (p, d['pVolta']):
            if rng.random() < pegou(o, pp):
                ferir(l, o, d['dano'], 'bumerangue')
        l.rec['rolo'] = max(l.rec.get('rolo', 0), d['voando'])
    elif nome == 'farinha':
        if rng.random() < pegou(o, p):
            ferir(l, o, d['dano'], 'farinha')
        if rng.random() < d['pNuvem']:
            for _ in range(int(d['dentro'] / d['tique'])):
                ferir(l, o, d['danoTique'], 'farinha')
            o.lento = max(o.lento, d['lento'])
    elif nome == 'ganso':
        l.ganso = d['duracao'] + d['estufa']
        l.gansoTique = d['estufa']
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
    l.lento = max(0, l.lento - dt)
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
    # o Ganso Raivoso bicando (corre atrás: vale perto ou longe)
    if l.ganso > 0:
        l.ganso -= dt
        l.gansoTique -= dt
        if l.gansoTique <= 0 and l.ganso > 0:
            d = c['ganso']
            l.gansoTique += d['intervalo']
            if not voando(o, rng) and rng.random() < pegou(o, d['p'] if engajado else d['pLonge']):
                ferir(l, o, d['dano'], 'ganso')
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
    elif l.forma == 'base' and l.h != 'margo' and rng.random() < c['pegarArma'] * dt:
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


def relatorio(cfg, herois=('leslie', 'grow', 'margo', 'anjo'), n=400, seed=1):
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
                'ate3_%': 100 * sum(t <= 180 for t in tempos) / n,
                'mais4_%': 100 * sum(t > 240 for t in tempos) / n,
                'ko_%': 100 * ko / n,
                'vitA_%': 100 * vit['a'] / n,
                'vitB_%': 100 * vit['b'] / n,
                'fontesA': {f: round(d / n) for (h, f), d in fontes.items() if h == ha},
            })
    return linhas


# Os de antes de as armas ficarem abaixo dos poderes (a luta já era de até 3 min, mas o crítico da
# espada, 60, e o do arco, 51, passavam do Chicote inteiro, 43, e as armas davam de 30% a 34% do
# dano da Leslie e do Anjo).
ANTES_DAS_ARMAS = copy.deepcopy(NUMEROS)
for chave, valor in {
    'espada': {'dano': 40}, 'arco': {'dano': 34}, 'soco': {'dano': 6}, 'chicote': {'dano': 13},
    'veneno': {'dano': 6, 'cura': 1 / 3}, 'raizes': {'dano': 22}, 'flor': {'dano': 40},
    'aves': {'dano': 83, 'bicada': 10}, 'vento': {'dano': 7}, 'salto': {'dano': 210}, 'investida': {'dano': 196},
    'pedra': {'dano': 187, 'lascas': 97}, 'impacto': {'dano': 130}, 'rajada': {'dano': 98}, 'julgamento': {'dano': 520},
}.items():
    ANTES_DAS_ARMAS[chave].update(valor)
ANTES_DAS_ARMAS['porDano'] = 0.2
ANTES_DAS_ARMAS['porDano_anjo'] = 0.45


# Os de antes de a luta encurtar para até 3 min (o dano de ~25% a mais: a luta durava 2,5 a 3 min e
# quase nunca passava de 4, mas só 66% das Leslie × Grow acabavam em até 3 min, e 45% das Grow × Grow).
ANTES_DOS_3MIN = copy.deepcopy(ANTES_DAS_ARMAS)
for chave, valor in {
    'espada': {'dano': 33}, 'arco': {'dano': 28}, 'soco': {'dano': 5}, 'chicote': {'dano': 11},
    'veneno': {'dano': 5, 'cura': 0.4}, 'raizes': {'dano': 18}, 'flor': {'dano': 29},
    'aves': {'dano': 69, 'bicada': 8}, 'vento': {'dano': 6}, 'salto': {'dano': 175}, 'investida': {'dano': 163},
    'pedra': {'dano': 156, 'lascas': 81}, 'impacto': {'dano': 100}, 'rajada': {'dano': 75}, 'julgamento': {'dano': 400},
}.items():
    ANTES_DOS_3MIN[chave].update(valor)


# Os de antes de o dano subir ~25% (a luta durava 3 a 4 min).
ANTERIOR = copy.deepcopy(ANTES_DOS_3MIN)
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
    print(f"{'duelo':16s} {'mediana':>8s} {'90%**':>7s} {'até 3 min':>10s} {'> 4 min':>8s} {'por KO':>7s} {'vence A':>8s} {'vence B':>8s} {'armas*':>7s}  dano de A por fonte (média)")
    herois = ('leslie', 'grow', 'margo', 'anjo') if cfg.get('rolo') else ('leslie', 'grow', 'anjo')  # os de antes não têm a Margo
    for l in relatorio(cfg, herois, n=n):
        f = l['fontesA']
        tot = sum(f.values()) or 1
        armas = (f.get('espada', 0) + f.get('arco', 0) + f.get('soco', 0) + f.get('rolo', 0)) / tot
        fontes = ', '.join(f'{k} {v}' for k, v in sorted(f.items(), key=lambda x: -x[1]))
        print(f"{l['duelo']:16s} {l['mediana_s']:6.0f} s {l['p90_s']:5.0f} s {l['ate3_%']:9.0f}% {l['mais4_%']:7.1f}% {l['ko_%']:6.1f}% {l['vitA_%']:7.0f}% {l['vitB_%']:7.0f}% {100 * armas:6.0f}%  {fontes}")
    print('* a parte do dano de A que veio da espada, do arco e do soco (na Margo, do rolo)')
    print('** 9 de cada 10 lutas acabam até este tempo')


if __name__ == '__main__':
    import sys
    args = sys.argv[1:]
    conjuntos = {'antesarmas': ANTES_DAS_ARMAS, 'antes3min': ANTES_DOS_3MIN, 'anterior': ANTERIOR, 'antes': ANTES, 'furia': FURIA}
    escolhido = next((conjuntos[a] for a in args if a in conjuntos), NUMEROS)
    imprimir(escolhido, n=2000 if 'mais' in args else 600)
