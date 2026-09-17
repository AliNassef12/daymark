import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
const origin=process.env.TEST_ORIGIN??'http://localhost:5173';
const headers={'Content-Type':'application/json',Origin:origin,Cookie:'__sites_local_auth=1'};
async function read(){const r=await fetch(origin+'/api/workspace',{headers});assert.equal(r.status,200,await r.clone().text());return r.json()}
async function post(p,status=200){const r=await fetch(origin+'/api/workspace',{method:'POST',headers,body:JSON.stringify(p)});assert.equal(r.status,status,await r.clone().text());return r.json()}
function sql(command){return execFileSync(process.execPath,['--import','./scripts/sites-env.mjs','./node_modules/wrangler/bin/wrangler.js','d1','execute','DB','--local','--config','dist/server/wrangler.json','--persist-to','.wrangler/state','--command',command,'--json'],{encoding:'utf8'})}
const name=`Recycle fixture ${crypto.randomUUID()}`;
await post({action:'saveList',title:name,period:'Week',priority:1,deadline:null});
let d=await read();const list=d.lists.find(l=>l.title===name);
for(const title of ['Keep with list','Delete separately'])await post({action:'saveTask',title,listId:list.id,priority:1,deadline:null});
d=await read();const [first,second]=d.tasks.filter(t=>t.list_id===list.id);
await post({action:'purge',kind:'lists',id:list.id},409);
await post({action:'toggleTask',id:first.id,done:true});
await post({action:'trash',kind:'tasks',id:second.id});
d=await read();assert.equal(d.lists.find(l=>l.id===list.id).done,1);
await post({action:'trash',kind:'lists',id:list.id});
d=await read();assert.ok(!d.lists.some(l=>l.id===list.id));assert.ok(!d.tasks.some(t=>t.list_id===list.id));assert.ok(d.trash.some(t=>t.id===list.id));assert.ok(!d.trash.some(t=>t.id===second.id));
await post({action:'toggleTask',id:first.id,done:true},404);
await post({action:'restore',kind:'tasks',id:second.id},404);
await post({action:'restore',kind:'lists',id:list.id});
d=await read();assert.ok(d.tasks.some(t=>t.id===first.id));assert.ok(d.trash.some(t=>t.id===second.id));
await post({action:'restore',kind:'tasks',id:second.id});
d=await read();assert.equal(d.lists.find(l=>l.id===list.id).done,0);
await post({action:'trash',kind:'tasks',id:second.id});
await post({action:'purge',kind:'tasks',id:second.id});
await post({action:'restore',kind:'tasks',id:second.id},404);
for(const action of ['trash','restore','purge'])await post({action,kind:'lists',id:'not-owned'},404);
const form=new FormData();form.set('title',name);form.set('content','Recover my note');form.set('file',new Blob(['recoverable contents']),'recover.txt');
let response=await fetch(origin+'/api/notes',{method:'POST',headers:{Origin:origin,Cookie:headers.Cookie},body:form});assert.equal(response.status,200);const note=await response.json();
await post({action:'trash',kind:'notes',id:note.id});
assert.equal((await fetch(origin+`/api/notes?id=${note.id}`,{headers})).status,404);
await post({action:'restore',kind:'notes',id:note.id});
response=await fetch(origin+`/api/notes?id=${note.id}`,{headers});assert.equal(await response.text(),'recoverable contents');
await post({action:'trash',kind:'notes',id:note.id});
await post({action:'purge',kind:'notes',id:note.id});
await post({action:'restore',kind:'notes',id:note.id},404);
// Age only this test's list. Retention must remove both it and its child rows.
await post({action:'trash',kind:'lists',id:list.id});
sql(`UPDATE lists SET deleted_at=${Date.now()-29*86400000} WHERE id='${list.id}'`);
d=await read();assert.ok(d.trash.some(t=>t.id===list.id));
sql(`UPDATE lists SET deleted_at=${Date.now()-30*86400000-1000} WHERE id='${list.id}'`);
d=await read();assert.ok(!d.trash.some(t=>t.id===list.id));
await post({action:'restore',kind:'lists',id:list.id},404);
const results=JSON.parse(sql(`SELECT COUNT(*) AS remaining FROM tasks WHERE list_id='${list.id}'`));assert.equal(results[0].results[0].remaining,0);
console.log('PASS: list/task/note recovery, attached file recovery, parent isolation, permanent deletion, invalid ownership, 29-day retention and 30-day expiry with child cleanup.');
