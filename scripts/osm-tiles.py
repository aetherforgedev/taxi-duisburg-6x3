"""Normalize raw OSM API map extracts into the catalog builder's input format."""
import json
import sys
from pathlib import Path

source = {}
for filename in sys.argv[2:]:
    for element in json.loads(Path(filename).read_text(encoding='utf-8'))['elements']:
        source[(element['type'],element['id'])] = element

selected = []
for element in source.values():
    tags = element.get('tags', {})
    if not (tags.get('addr:street') or tags.get('amenity') == 'taxi' or (tags.get('highway') and tags.get('name'))):
        continue
    if element['type'] == 'way':
        nodes = [source.get(('node',node)) for node in element['nodes']]
        if all(nodes):
            geometry = [{key: node[key] for key in ('lat','lon')} for node in nodes]
            element['geometry'] = geometry
            if geometry:
                element['center'] = {key: sum(p[key] for p in geometry)/len(geometry) for key in ('lat','lon')}
    selected.append(element)
Path(sys.argv[1]).write_text(json.dumps({'elements':selected}),encoding='utf-8')
