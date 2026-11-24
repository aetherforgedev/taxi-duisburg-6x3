import { distance, type Point, type Route, type Settings } from './domain';

export function offerDelay(settings:Settings, random=Math.random) {
  const min=settings.intervalMin??settings.interval;
  const max=Math.max(min,settings.intervalMax??settings.interval);
  return (min+Math.floor(random()*(max-min+1)))*1000;
}
export function routeLengths(points:Point[]) {
  const lengths=[0];
  for(let i=1;i<points.length;i++) lengths.push(lengths[i-1]+distance(points[i-1],points[i]));
  return lengths;
}
export function projectRoute(fix:Point, points:Point[], lengths=routeLengths(points), previous?:number) {
  let best={offset:0,offRoute:Infinity,point:points[0],segment:0};
  let bestScore=Infinity;
  const scale=Math.cos(fix.lat*Math.PI/180)*111195;
  for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i];
    const x=(a.lon-fix.lon)*scale,y=(a.lat-fix.lat)*111195;
    const dx=(b.lon-a.lon)*scale,dy=(b.lat-a.lat)*111195;
    const size=dx*dx+dy*dy;
    const t=size?Math.max(0,Math.min(1,-(x*dx+y*dy)/size)):0;
    const offRoute=Math.hypot(x+t*dx,y+t*dy);
    const offset=lengths[i-1]+t*(lengths[i]-lengths[i-1]);
    // Prefer the nearby part of the route at crossings, without hiding a deviation.
    const score=offRoute+(previous===undefined?0:Math.min(40,Math.abs(offset-previous)*0.08));
    if(score<bestScore){
      bestScore=score;
      best={offset,offRoute,point:{lat:a.lat+t*(b.lat-a.lat),lon:a.lon+t*(b.lon-a.lon)},segment:i-1};
    }
  }
  return best;
}
export function guidance(route:Route, fix:Point, previous?:number) {
  const lengths=routeLengths(route.points);
  const projection=projectRoute(fix,route.points,lengths,previous);
  const offsets=route.steps.map(step=>step.offset??projectRoute(step,route.points,lengths).offset);
  let next=offsets.findIndex((offset,index)=>index>0&&offset>projection.offset+1);
  if(next<0)next=route.steps.length-1;
  const remaining=Math.max(0,lengths.at(-1)!-projection.offset);
  const arrived=remaining<35&&distance(fix,route.points.at(-1)!)<45;
  const current=Math.max(0,next-1);
  const segmentLength=Math.max(1,(offsets[current+1]??lengths.at(-1)!)-offsets[current]);
  const fraction=Math.max(0,Math.min(1,1-(projection.offset-offsets[current])/segmentLength));
  const timed=route.steps[current]?.duration;
  const seconds=timed===undefined
    ? route.duration*remaining/Math.max(1,lengths.at(-1)!)
    : timed*fraction+route.steps.slice(current+1).reduce((sum,step)=>sum+(step.duration??0),0);
  return {...projection,remaining,seconds,arrived,next,
    toTurn:Math.max(0,(offsets[next]??lengths.at(-1)!)-projection.offset),
    step:route.steps[next],after:route.steps[next+1],
    currentStreet:route.steps[current]?.street,
    travelled:[...route.points.slice(0,projection.segment+1),projection.point],
    ahead:[projection.point,...route.points.slice(projection.segment+1)],
  };
}
