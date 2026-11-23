"""Extract the Duisburg bounding box from a Geofabrik PBF. Requires osmium."""
import json
import sys
from pathlib import Path
import osmium

def point(location):
    return {'lat': location.lat, 'lon': location.lon}

def inside(location):
    return location.valid() and 51.34 <= location.lat <= 51.59 and 6.61 <= location.lon <= 6.86

def relevant(tags):
    return tags.get('addr:street') or tags.get('amenity') == 'taxi' or (tags.get('highway') and tags.get('name'))

class Reader(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.elements = []

    def node(self, node):
        if inside(node.location) and relevant(node.tags):
            self.elements.append(dict(type='node',id=node.id,tags=dict(node.tags),**point(node.location)))

    def way(self, way):
        if not relevant(way.tags):
            return
        nodes = list(way.nodes)
        if not any(inside(node.location) for node in nodes) or not all(node.location.valid() for node in nodes):
            return
        geometry = [point(node.location) for node in nodes]
        center = {key:sum(p[key] for p in geometry)/len(geometry) for key in ('lat','lon')}
        self.elements.append(dict(type='way',id=way.id,tags=dict(way.tags),geometry=geometry,center=center,nodes=[n.ref for n in nodes]))

reader = Reader()
reader.apply_file(sys.argv[1],locations=True,idx='flex_mem')
Path(sys.argv[2]).write_text(json.dumps({'elements':reader.elements}),encoding='utf-8')
