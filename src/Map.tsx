import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Crosshair } from 'lucide-react';
import { sectors, type Fix, type Order, type Point, type Route } from './domain';

const duisburg:L.LatLngTuple = [51.4344,6.7623];
const latlng = (p:Point):L.LatLngTuple => [p.lat,p.lon];
type Props = {fix:Fix|null; radius:number; selected?:number|null; job?:Order|null; trip?:Route|null; onSector?:(id:number)=>void; compact?:boolean; online:boolean;
  navigating?:boolean; ahead?:Point[]; travelled?:Point[]};
export default function StreetMap({fix,radius,selected,job,trip,onSector,compact,online,navigating=false,ahead,travelled}:Props) {
  const div = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map|null>(null);
  const staticLayers = useRef<L.LayerGroup|null>(null);
  const live = useRef<L.LayerGroup|null>(null);
  const [tileError,setTileError] = useState(false);
  const [following,setFollowing] = useState(true);
  const follow=useRef(true);
  const vehicle=useRef<L.Marker|null>(null);
  const accuracy=useRef<L.Circle|null>(null);
  const lastFix=useRef<Fix|null>(null);
  const bearing=useRef(0);
  useEffect(()=>{
    const instance = L.map(div.current!,{zoomControl:!compact&&!navigating,attributionControl:true,scrollWheelZoom:!compact}).setView(duisburg,13);
    instance.on('dragstart zoomstart',event=>{
      if(event.type==='zoomstart')return;
      follow.current=false;setFollowing(false);
    });
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
    return ()=>{observer.disconnect();instance.remove();map.current=null;vehicle.current=null;accuracy.current=null;};
  },[compact,navigating]);
  useEffect(()=>{
    const group=staticLayers.current!;
    group.clearLayers();
    if (compact||navigating) return;
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
  },[radius,selected,onSector,compact,navigating]);
  useEffect(()=>{
    const group=live.current!;
    if (!fix) {group.clearLayers();vehicle.current=null;accuracy.current=null;return;}
    const previous=lastFix.current;
    if(fix.heading!==null&&Number.isFinite(fix.heading)) bearing.current=fix.heading;
    else if(previous&&Math.hypot(fix.lat-previous.lat,fix.lon-previous.lon)>0.00005){
      const r=Math.PI/180;
      bearing.current=Math.atan2(Math.sin((fix.lon-previous.lon)*r)*Math.cos(fix.lat*r),
        Math.cos(previous.lat*r)*Math.sin(fix.lat*r)-Math.sin(previous.lat*r)*Math.cos(fix.lat*r)*Math.cos((fix.lon-previous.lon)*r))/r;
    }
    lastFix.current=fix;
    if(!accuracy.current)accuracy.current=L.circle(latlng(fix),{radius:fix.accuracy,color:'#087aee',weight:1,fillOpacity:0.11,interactive:false}).addTo(group);
    accuracy.current.setLatLng(latlng(fix)).setRadius(fix.accuracy);
    if(!vehicle.current)vehicle.current=L.marker(latlng(fix),{title:'Ihr GPS-Standort',zIndexOffset:1000,icon:L.divIcon({
      className:'vehicle-pin '+(navigating?'navigation-vehicle':''),html:'<span>▲</span>',iconSize:navigating?[48,48]:[32,32],iconAnchor:navigating?[24,24]:[16,16],
    })}).addTo(group);
    vehicle.current.setLatLng(latlng(fix));
    const arrow=vehicle.current.getElement()?.querySelector('span');
    if(arrow)arrow.style.transform='rotate('+bearing.current+'deg)';
    if(navigating&&follow.current){
      const instance=map.current!;
      const zoom=fix.speed!==null&&fix.speed>22?16:17;
      const point=instance.project(latlng(fix),zoom);
      point.y-=instance.getSize().y*0.12;
      instance.setView(instance.unproject(point,zoom),zoom,{animate:true,duration:0.6});
    }
  },[fix,compact,navigating]);
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
      if(!navigating)instance.fitBounds(line.getBounds(),{padding:[22,22],maxZoom:16});
    } else if (points.length&&!navigating) {
      if (fix) points.push(latlng(fix));
      instance.fitBounds(points,{padding:[22,22],maxZoom:15});
    }
    return ()=>{layers.remove();};
    // Frame each new trip or job. GPS paints independently without resetting a manual pan.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[job?.id,trip,compact,navigating]);
  useEffect(()=>{
    if(!navigating||!ahead)return;
    const group=L.layerGroup().addTo(map.current!);
    if(travelled)L.polyline(travelled.map(latlng),{color:'#9babb8',weight:7,opacity:1}).addTo(group);
    L.polyline(ahead.map(latlng),{color:'#144890',weight:10,opacity:1}).addTo(group);
    L.polyline(ahead.map(latlng),{color:'#4d9eff',weight:6,opacity:1}).addTo(group);
    return ()=>{group.remove();};
  },[navigating,ahead,travelled]);
  return <div className={'map-wrap '+(compact?'map-square':'')+(navigating?' navigation-map':'')}>
    <div ref={div} className="leaf-map" aria-label="Straßenkarte"/>
    {!compact && <button className={'map-center '+(!following?'follow-off':'')} disabled={!fix} onClick={()=>{follow.current=true;setFollowing(true);if(fix)map.current?.setView(latlng(fix),navigating?17:16);}} aria-label="GPS-Standort zentrieren"><Crosshair size={20}/>{navigating&&!following&&<span>Folgen</span>}</button>}
    {(!online||tileError)&&<span className="tile-state">Kartenkacheln teilweise nicht verfügbar</span>}
  </div>;
}
