"""Build local catalogs from the original sources and a separately supplied OSM extract."""
import json
import re
import sys
from math import hypot, cos, radians
from collections import defaultdict
from pathlib import Path

def normalized(value):
    value = re.sub(r'str\.?(?=$|[\s/])', 'strasse', value.casefold())
    return re.sub(r'[^a-z0-9]', '', value.translate(str.maketrans({'ä':'a','ö':'o','ü':'u','ß':'ss'})))

sectors = []
for line in Path(sys.argv[1]).read_text(encoding='utf-8').splitlines():
    row = re.match(r'^\s*(\d+)\s+(.+)', line)
    if not row:
        if line.strip() == 'Sparkasse':
            sectors[-1]['name'] += ' Sparkasse'
        elif line.strip() == 'Platz':
            sectors[-1]['address'] += 'Platz'
        continue
    number = int(row[1])
    items = re.split(r'\s{2,}', row[2].strip())
    if len(items) == 1 and items[0].startswith('Mittelmeiderich '):
        items = items[0].split(' ', 1)
    if len(items) == 2 and items[0].startswith('Mittelmeiderich '):
        items = [*items[0].split(' ', 1), items[1]]
    if items == ['Bedarfshalteplatz']:
        items = ['', items[0], '']
    district, name, address = items
    sectors.append(dict(id=number, district=district, name=name, address=address, radius=150))

pickups = []
for line in Path(sys.argv[2]).read_text(encoding='utf-8-sig').splitlines():
    line = line.strip()
    if not line or line.endswith(':'):
        continue
    name, sep, address = line.partition(' = ')
    pickups.append(dict(id=str(len(pickups)+1), name=name, address=address if sep else name))

elements = json.loads(Path(sys.argv[3]).read_text(encoding='utf-8'))['elements'] if len(sys.argv)>3 and Path(sys.argv[3]).exists() else []
streets, addresses, stands = defaultdict(list), defaultdict(list), []
for item in elements:
    tags = item.get('tags', {})
    point = item.get('center', item)
    if 'lat' not in point:
        continue
    obj = dict(lat=point['lat'], lon=point['lon'], source=f"https://www.openstreetmap.org/{item['type']}/{item['id']}")
    if tags.get('highway') and tags.get('name'):
        streets[normalized(tags['name'])].append((obj, item.get('nodes', []), item.get('geometry', [])))
    if tags.get('addr:street') and tags.get('addr:housenumber'):
        addresses[(normalized(tags['addr:street']), tags['addr:housenumber'])].append(obj)
    if tags.get('amenity') == 'taxi':
        stands.append((obj, normalized(tags.get('name', '')), normalized(tags.get('addr:street', ''))))

def exact_address(address):
    match = re.fullmatch(r'(.+?) (\d+(?:[a-zA-Z]|[–-]\d+)?)', address.split(',')[0])
    if not match:
        return None
    matches = addresses[(normalized(match[1]), match[2].replace('–','-'))]
    if not matches:
        matches = addresses[(normalized(match[1]), match[2])]
    if matches:
        first = matches[0]
        if all(abs(other['lat']-first['lat']) < 0.00022 and abs(other['lon']-first['lon']) < 0.00032 for other in matches):
            return first

def crossing(address):
    a, b = map(normalized, address.split('/'))
    matches = {}
    for _, nodes, coords in streets[a]:
        if len(nodes) != len(coords):
            continue
        for node, point in zip(nodes, coords):
            for _, other, _coords in streets[b]:
                if node in other:
                    matches[node] = point
    if matches:
        node, point = next(iter(sorted(matches.items())))
        if all(abs(p['lat']-point['lat']) < 0.00055 and abs(p['lon']-point['lon']) < 0.0008 for p in matches.values()):
            return dict(**point, source=f'https://www.openstreetmap.org/node/{node}')

def metres_to_way(point, geometry):
    scale = cos(radians(point['lat']))
    xy = [((p['lon']-point['lon'])*scale,p['lat']-point['lat']) for p in geometry]
    best = float('inf')
    for (x,y),(x2,y2) in zip(xy,xy[1:]):
        dx,dy = x2-x,y2-y
        length = dx*dx+dy*dy
        t = min(1,max(0,-(x*dx+y*dy)/length)) if length else 0
        best = min(best,hypot(x+t*dx,y+t*dy)*111195)
    return best

def mapped_stand(address):
    segments = streets[normalized(address)]
    candidates = [p for p,_,_ in stands
                  if any(abs(center['lat']-p['lat']) < 0.015
                         and abs(center['lon']-p['lon']) < 0.02
                         and metres_to_way(p,geometry) < 25
                         for center,_,geometry in segments)]
    return candidates[0] if len(candidates) == 1 else None

for sector in sectors:
    address = sector['address']
    point = exact_address(address) or (crossing(address) if address.count('/') == 1 else None)
    if sector['id'] == 81:
        # Duisburger Straße also exists in Rheinhausen. Use the reviewed override.
        point = None
        address = ''
    if point is None and address:
        candidates = [p for p,n,s in stands if normalized(address) in (n,s)]
        if len(candidates) == 1:
            point = candidates[0]
        elif not candidates:
            point = mapped_stand(address)
    sector['point'] = point
    sector['active'] = bool(point)
    sector['review'] = None if point else ('Standort prüfen' if sector['address'] else 'Kein Standort angegeben')

for pickup in pickups:
    address = pickup['address']
    short = address.split(',')[0]
    point = exact_address(address)
    if pickup['name'].startswith('REWE Parkplatz'):
        point = None
        pickup['note'] = 'Die OSM-Adressmarkierung bezeichnet einen Imbiss. Parkplatz prüfen.'
    if pickup['name'] == 'Fressnapf' and not point:
        pickup['note'] = 'Die angegebene Filialadresse ist nicht eindeutig belegt.'
    if not point and short == pickup['name']:
        candidates = [
            dict(**node, source=f'https://www.openstreetmap.org/node/{osm_id}')
            for _, ids, geometry in streets[normalized(short)]
            for osm_id,node in zip(ids,geometry)
            if 51.390 <= node['lat'] <= 51.418 and 6.743 <= node['lon'] <= 6.797
        ]
        if candidates:
            point = sorted(candidates, key=lambda p: p['source'])[len(candidates)//2]
            anchors = {
                'Düsseldorfer Straße': (51.404,6.763), 'Wanheimer Straße': (51.409,6.750),
                'Kalkweg': (51.410,6.781), 'Wedauer Straße': (51.395,6.775),
            }
            if short in anchors:
                lat, lon = anchors[short]
                point = min(candidates,key=lambda p: (p['lat']-lat)**2+(p['lon']-lon)**2)
            if point:
                pickup['note'] = 'Straßenabschnitt aus OpenStreetMap'
    pickup['point'] = point

for filename, data in [('sectors', sectors), ('pickups', pickups)]:
    Path('src', filename+'.json').write_text(json.dumps(data, ensure_ascii=False, indent=2)+'\n', encoding='utf8', newline='\n')
    print(filename, len(data), sum(bool(x['point']) for x in data))
