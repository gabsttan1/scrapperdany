#!/usr/bin/env python3
"""Coleta resultados públicos da LottoTrivo e calcula atrasos observados.

Instalar: pip install requests
Executar: python coletor_lottotrivo.py
Carga histórica: python coletor_lottotrivo.py --dias 30

ATENÇÃO: rankings calculados somente sobre sorteios efetivamente armazenados.
"""
import argparse
import json
import os
import time
from datetime import datetime, timedelta, date
from pathlib import Path
from zoneinfo import ZoneInfo
import requests

TZ = ZoneInfo('America/Sao_Paulo')
URL = 'https://api.lottotrivo.com/results'
NOMES = ['Avestruz','Águia','Burro','Borboleta','Cachorro','Cabra','Carneiro','Camelo','Cobra','Coelho','Cavalo','Elefante','Galo','Gato','Jacaré','Leão','Macaco','Porco','Pavão','Peru','Touro','Tigre','Urso','Veado','Vaca']


def grupo(milhar):
    dezena = int(str(milhar)[-2:])
    return 25 if dezena == 0 else ((dezena - 1) // 4) + 1


def obter(session, dia):
    resp = session.get(URL, params={'date': dia.isoformat()}, timeout=25)
    resp.raise_for_status()
    body = resp.json()
    if not isinstance(body, dict) or not isinstance(body.get('draws'), list):
        raise ValueError('Resposta da LottoTrivo não contém lista draws')
    return body['draws']


def normalizar(draw):
    if draw.get('status') != 'completed':
        return None
    instante = draw.get('datetime')
    if not instante:
        return None
    dt = datetime.fromisoformat(instante)
    if dt.tzinfo is None:
        raise ValueError('Sorteio sem fuso horário')
    dt = dt.astimezone(TZ)
    premios = {}
    for p in draw.get('prizes', []):
        try:
            pos = int(p['posicao'])
            num = str(p['numero']).strip()
            if 1 <= pos <= 10 and num.isdigit() and len(num) <= 4:
                premios[pos] = num.zfill(4)
        except (KeyError, TypeError, ValueError):
            continue
    if not all(p in premios for p in range(1, 6)):
        return None
    return {'id': str(draw.get('id') or dt.strftime('%Y%m%d%H%M%S')),
            'datetime': dt.isoformat(), 'horario': draw.get('horario') or dt.strftime('%H:%M'),
            'premios': [{'posicao': p, 'numero': n, 'grupo': f'{grupo(n):02d}'} for p,n in sorted(premios.items())]}


def calc_atrasos(sorteios):
    resultado = []
    # Um sorteio = uma extração, mesmo que haja dez prêmios.
    for modo in ('cabeca', 'primeiro_ao_quinto'):
        for g in range(1, 26):
            indice = None
            ultima = None
            for i in range(len(sorteios) - 1, -1, -1):
                s = sorteios[i]
                pr = s['premios']
                selecionados = pr[:1] if modo == 'cabeca' else [p for p in pr if p['posicao'] <= 5]
                if any(int(p['grupo']) == g for p in selecionados):
                    indice, ultima = i, s
                    break
            atraso = len(sorteios) - 1 - indice if indice is not None else len(sorteios)
            dias = None
            if ultima:
                dias = (datetime.fromisoformat(sorteios[-1]['datetime']).date() - datetime.fromisoformat(ultima['datetime']).date()).days
            resultado.append({'banca':'LottoTrivo','pagina':'lottotrivo','modalidade':modo,
                              'bicho':NOMES[g-1], 'grupo':f'{g:02d}',
                              'dezenas':'-'.join(f'{x%100:02d}' for x in range((g-1)*4+1, g*4+1)),
                              'atraso_sorteios':atraso,'dias_sem_sair':dias,
                              'ultima_data_hora':ultima['datetime'] if ultima else None,
                              'ultima_extracao':ultima['horario'] if ultima else None,
                              'ultima_milhar': next((p['numero'] for p in (ultima['premios'] if ultima else []) if int(p['grupo'])==g and (modo!='cabeca' or p['posicao']==1)),None),
                              'historico_insuficiente':ultima is None,
                              'nivel':None, 'recorde':None, 'media':None})
    for modo in ('cabeca', 'primeiro_ao_quinto'):
        filtrados = [r for r in resultado if r['modalidade']==modo]
        filtrados.sort(key=lambda r:(-r['atraso_sorteios'],r['grupo']))
        for i, r in enumerate(filtrados, 1):
            r['posicao']=i
    return resultado


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--dias', type=int, default=2, help='Quantos dias consultar incluindo hoje (padrão 2)')
    parser.add_argument('--pasta', '--saida', dest='pasta', default='resultado')
    args=parser.parse_args()
    if not 1 <= args.dias <= 366:
        parser.error('--dias deve estar entre 1 e 366')
    pasta=Path(args.pasta); pasta.mkdir(parents=True,exist_ok=True)
    arquivo=pasta/'lottotrivo_historico.json'
    antigos=json.loads(arquivo.read_text(encoding='utf-8')) if arquivo.exists() else {'draws':[]}
    unicos={s['datetime']:s for s in antigos.get('draws', [])}
    sessao=requests.Session()
    sessao.headers.update({
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36',
        'Accept': '*/*',
        'Accept-Language': 'pt-BR,pt;q=0.9',
        'Origin': 'https://lottotrivo.com',
        'Referer': 'https://lottotrivo.com/',
    })
    hoje=datetime.now(TZ).date()
    falhas=[]; novos=0
    for delta in range(args.dias - 1, -1, -1):
        dia=hoje-timedelta(days=delta)
        try:
            for draw in obter(sessao,dia):
                item=normalizar(draw)
                if item:
                    if item['datetime'] not in unicos: novos+=1
                    unicos[item['datetime']]=item
            print('OK:',dia)
        except (requests.RequestException,ValueError,KeyError,TypeError) as e:
            if isinstance(e, requests.HTTPError) and e.response is not None and e.response.status_code == 403:
                print('AVISO: API retornou 403. Pode exigir sessão/autorização ou bloquear clientes automatizados.')
            falhas.append({'data':dia.isoformat(),'erro':str(e)})
            print('ERRO:',dia,e)
        time.sleep(0.4)
    sorteios=sorted(unicos.values(),key=lambda x:x['datetime'])
    if not sorteios:
        raise SystemExit('Nenhum sorteio disponível; arquivos anteriores preservados.')
    metadata={'banca':'LottoTrivo', 'total_sorteios':len(sorteios),
              'primeiro_sorteio':sorteios[0]['datetime'],'ultimo_sorteio':sorteios[-1]['datetime'],
              'atualizado_em':datetime.now(TZ).isoformat(timespec='seconds'),
              'falhas':falhas}
    arquivo.write_text(json.dumps({**metadata,'draws':sorteios},ensure_ascii=False,indent=2),encoding='utf-8')
    (pasta/'lottotrivo_atrasados.json').write_text(json.dumps({**metadata,'dados':calc_atrasos(sorteios),'observacao':'Atrasos calculados somente com sorteios coletados; não representam histórico completo quando a base é recente.'},ensure_ascii=False,indent=2),encoding='utf-8')
    print(f'Sorteios: {len(sorteios)} | Novos: {novos} | Falhas de consulta: {len(falhas)}')
    if falhas: raise SystemExit(1)

if __name__ == '__main__':
    main()
