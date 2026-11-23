import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Crosshair } from 'lucide-react';
import { sectors, type Fix, type Order, type Point, type Route } from './domain';

const duisburg:L.LatLngTuple = [51.4344,6.7623];
const latlng = (p:Point):L.LatLngTuple => [p.lat,p.lon];
type Props = {fix:Fix|null; radius:number; selected?:number|null; job?:Order|null; trip?:Route|null; onSector?:(id:number)=>void; compact?:boolean; online:boolean};
export default function StreetMap({fix,radius,selected,job,trip,onSector,compact,online}:Props) {
  const div = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map|null>(null);
  const staticLayers = useRef<L.LayerGroup|null>(null);
  const live = useRef<L.LayerGroup|null>(null);
  const [tileError,setTileError] = useState(false);
  useEffect(()=>{
    const instance = L.map(div.current!,{zoomControl:!compact,attributionControl:true,scrollWheelZoom:!compact}).setView(duisburg,13);
    const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{
      maxZoom:19, attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · <a href="https://www.openstreetmap.org/fixthemap">Karte korrigieren</a>',
    }).addTo(instance);
    tiles.on('tileerror',()=>setTileError(true));
    tiles.on('load',()=>{if (div.current?.querySelector('.leaflet-tile-loaded')) setTileError(false);});
    staticLayers.current=L.layerGroup().addTo(instance);
    live.current=L.layerGroup().addTo(instance);
    map.current=instance;
    const observer = new ResizeObserver(()=>instance.invalidateSize());
    observer.observe(div.current!);
    return ()=>{observer.disconnect();instance.remove();map.current=null;};
  },[compact]);
  useEffect(()=>{
    const group=staticLayers.current!;
    group.clearLayers();
    if (compact) return;
    for (const sector of sectors) {
      if (!sector.point) continue;
      const current=sector.id===selected;
      L.circle(latlng(sector.point),{radius,color:current?'#36d799':'#04a6a3',weight:1,fillOpacity:0.12,interactive:false}).addTo(group);
      const marker=L.marker(latlng(sector.point),{
        title:sector.name,icon:L.divIcon({className:'sector-pin',html:String(sector.id),iconSize:[30,30],iconAnchor:[15,15]}),
      }).addTo(group);
      const label = document.createElement('div');
      const title = document.createElement('strong');
      title.textContent=sector.id+' – '+sector.name;
      label.append(title,document.createElement('br'),sector.address,document.createElement('br'),'Taxen: 0 · fester Anzeigewert');
      if (onSector) {
        const button=document.createElement('button');
        button.textContent='Sektordetails';
        button.onclick=()=>onSector(sector.id);
        label.append(document.createElement('br'),button);
      }
      marker.bindPopup(label);
    }
  },[radius,selected,onSector,compact]);
  useEffect(()=>{
    const group=live.current!;
    group.clearLayers();
    if (!fix) return;
    const heading = Number.isFinite(fix.heading) ? fix.heading : 0;
    L.circle(latlng(fix),{radius:fix.accuracy,color:'#087aee',weight:1,fillOpacity:0.11,interactive:false}).addTo(group);
    L.marker(latlng(fix),{title:'Ihr GPS-Standort',icon:L.divIcon({
      className:'vehicle-pin',html:'<span style="transform:rotate('+heading+'deg)">▲</span>',iconSize:[32,32],iconAnchor:[16,16],
    })}).addTo(group);
  },[fix,compact]);
  useEffect(()=>{
    const instance=map.current!;
    const layers=L.layerGroup().addTo(instance);
    const points:L.LatLngTuple[]=[];
    if (job) for (const [stop,label,color] of [[job.pickup,'A','#ffc83d'],[job.destination,'Z','#24c9b4']] as const) {
      if (!stop || (label==='Z' && compact)) continue;
      const p=latlng(stop.point);
      points.push(p);
      const el=document.createElement('span');
      el.textContent=stop.label;
      L.circleMarker(p,{color:'#171b1d',fillColor:color,fillOpacity:1,radius:9,weight:2}).addTo(layers).bindTooltip(el);
    }
    if (trip) {
      const line=L.polyline(trip.points.map(latlng),{color:'#1b71f0',weight:5,opacity:0.88}).addTo(layers);
      instance.fitBounds(line.getBounds(),{padding:[22,22],maxZoom:16});
    } else if (points.length) {
      if (fix) points.push(latlng(fix));
      instance.fitBounds(points,{padding:[22,22],maxZoom:15});
    }
    return ()=>{layers.remove();};
    // Frame each new trip or job. GPS paints independently without resetting a manual pan.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[job?.id,trip,compact]);
  return <div className={'map-wrap '+(compact?'map-square':'')}>
    <div ref={div} className="leaf-map" aria-label="Straßenkarte"/>
    {!compact && <button className="map-center" disabled={!fix} onClick={()=>fix&&map.current?.setView(latlng(fix),16)} aria-label="GPS-Standort zentrieren"><Crosshair size={20}/></button>}
    {(!online||tileError)&&<span className="tile-state">Kartenkacheln teilweise nicht verfügbar</span>}
  </div>;
}
