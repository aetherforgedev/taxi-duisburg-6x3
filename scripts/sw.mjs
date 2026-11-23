import {createHash} from 'node:crypto';
import {readFile,readdir,writeFile} from 'node:fs/promises';
const files=(await readdir('dist',{recursive:true,withFileTypes:true})).filter(entry=>entry.isFile()&&entry.name!=='sw.js')
  .map(entry=>entry.parentPath.replaceAll('\\','/').replace(/^dist\/?/,'')+(entry.parentPath==='dist'?'':'/')+entry.name).sort();
const hash=createHash('sha256');
for(const file of files)hash.update(await readFile('dist/'+file));
const release=hash.digest('hex').slice(0,16);
await writeFile('dist/sw.js',`
const PREFIX='taxi-6x3-'+self.registration.scope+'-';
const NAME=PREFIX+${JSON.stringify(release)};
const FILES=${JSON.stringify(files)};
self.addEventListener('install', event=>event.waitUntil((async()=>{
  const cache=await caches.open(NAME);
  await cache.addAll(FILES.map(path=>new URL(path,self.registration.scope)));
})()));
self.addEventListener('activate', event=>event.waitUntil((async()=>{
  for (const key of await caches.keys()) if(key.startsWith(PREFIX)&&key!==NAME)await caches.delete(key);
  await self.clients.claim();
})()));
self.addEventListener('fetch', event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=='GET'||!url.href.startsWith(self.registration.scope))return;
  if(event.request.mode==='navigate'){
    event.respondWith((async()=>{
      const cache=await caches.open(NAME);
      return await cache.match(new URL('index.html',self.registration.scope))||
        await fetch(event.request).catch(()=>cache.match(new URL('offline.html',self.registration.scope)));
    })());
  }else if(FILES.includes(url.href.slice(self.registration.scope.length))){
    // This cache contains only release-owned static files. Vite and some hosts
    // vary asset responses by Origin, which differs for module fetches.
    event.respondWith(caches.open(NAME).then(cache=>cache.match(url.href,{ignoreVary:true})).then(hit=>hit||fetch(event.request)));
  }
});
`);
