import assert from 'node:assert/strict';
const origin=process.env.TEST_ORIGIN??'http://localhost:5173';
const headers={'Content-Type':'application/json',Origin:origin,Cookie:'__sites_local_auth=1'};
async function read(){const r=await fetch(origin+'/api/workspace',{headers});assert.equal(r.status,200);return r.json()}
async function post(p,expected=200){const r=await fetch(origin+'/api/workspace',{method:'POST',headers,body:JSON.stringify(p)});assert.equal(r.status,expected,await r.clone().text());return r.json()}
const run=Date.now();
assert.equal((await fetch(origin+'/api/workspace')).status,401);
assert.equal((await fetch(origin+'/api/workspace',{headers:{'oai-authenticated-user-id':'spoof','oai-authenticated-user-email':'spoof@example.com'}})).status,401);
assert.equal((await fetch(origin+'/api/workspace',{method:'POST',headers:{...headers,Origin:'https://evil.example'},body:'{}'})).status,403);
for(const period of ['General','Year','Month','Week','Day'])await post({action:'saveList',title:`${period} integration ${run}`,period,priority:1,deadline:null});
let data=await read();const list=data.lists.find(l=>l.title===`Week integration ${run}`);assert.ok(list);
await post({action:'saveList',id:'not-owned',title:'No access',period:'Week',priority:0,deadline:null},404);
await post({action:'saveList',title:'Invalid',period:'Week',priority:9,deadline:null},400);
for(const priority of [2,0,1])await post({action:'saveTask',listId:list.id,title:`Priority ${priority}`,priority,deadline:Date.now()+7100000});
data=await read();const tasks=data.tasks.filter(t=>t.list_id===list.id);assert.equal(tasks.length,3);
for(const task of tasks)await post({action:'toggleTask',id:task.id,done:true});
data=await read();assert.equal(data.lists.find(l=>l.id===list.id).done,1);assert.equal(data.tasks.filter(t=>t.list_id===list.id).length,3);
await post({action:'toggleTask',id:tasks[0].id,done:false});data=await read();assert.equal(data.lists.find(l=>l.id===list.id).done,0);
await post({action:'setListDone',id:list.id,done:true});await post({action:'setListDone',id:list.id,done:false});data=await read();assert.ok(data.tasks.filter(t=>t.list_id===list.id).every(t=>!t.done));
await post({action:'saveTask',id:tasks[0].id,listId:list.id,title:'Edited task',priority:0,deadline:null});
const form=new FormData();form.set('title','Private test document');form.set('content','Remember the essentials.');form.set('file',new Blob(['Private fixture\n']),'check.txt');
let r=await fetch(origin+'/api/notes',{method:'POST',headers:{Origin:origin,Cookie:headers.Cookie},body:form});assert.equal(r.status,200,await r.clone().text());const note=await r.json();
r=await fetch(origin+`/api/notes?id=${note.id}`,{headers});assert.equal(r.status,200);assert.equal(await r.text(),'Private fixture\n');assert.ok(r.headers.get('content-disposition').startsWith('attachment'));
assert.equal((await fetch(origin+`/api/notes?id=${note.id}`)).status,401);
console.log('PASS: auth, spoofed identity, CSRF, five periods, priorities, optional deadlines, completion/reopen preservation, editing, private uploads/downloads. Local fixture data only.');
