import assert from 'node:assert/strict';
const origin=process.env.TEST_ORIGIN??'http://localhost:5173';
const headers={Origin:origin,Cookie:'__sites_local_auth=1'};
const content='  const message = "hello";\r\n\t// keep indentation\r\n';
const form=new FormData();form.set('title','Theme test');form.set('content',content);
let id;
async function save(status=200){const r=await fetch(origin+'/api/notes',{method:'POST',headers,body:form});assert.equal(r.status,status,await r.clone().text());return r.json()}
async function read(){const r=await fetch(origin+'/api/workspace',{headers});assert.equal(r.status,200);return (await r.json()).notes.find(n=>n.id===id)}
try {
 ({id}=await save());form.set('id',id);assert.equal((await read()).format,'text');
 for(const theme of ['dark','light','monokai']){form.set('format','code');form.set('theme',theme);await save();const n=await read();assert.equal(n.format,'code');assert.equal(n.theme,theme);assert.equal(n.content,content);}
 form.set('theme','invalid');await save(400);assert.equal((await read()).theme,'monokai');
 form.set('theme','light');form.set('format','text');await save();assert.equal((await read()).format,'text');assert.equal((await read()).content,content);
 async function mark(important,expected=200,noteId=id){const r=await fetch(origin+'/api/workspace',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({action:'setNoteImportant',id:noteId,important})});assert.equal(r.status,expected);}
 assert.equal((await read()).important,0);
 await mark(true);assert.equal((await read()).important,1);
 await save();assert.equal((await read()).important,1);
 await mark('yes',400);await mark(true,404,'missing-note');
 await mark(false);assert.equal((await read()).important,0);assert.equal((await read()).content,content);
 console.log('PASS: text default, code mode, all themes persist, invalid theme rejected, switching preserves content, Important toggle and validation.');
} finally {
 if(id)for(const action of ['trash','purge']){const r=await fetch(origin+'/api/workspace',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({action,kind:'notes',id})});assert.equal(r.status,200);}
}
