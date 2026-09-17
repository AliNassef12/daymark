import {identity,db,bucket,fail,title,priority,deadline,owned,HttpError,dirty,syncMail} from '../../../lib/server';
import {purgeExpired,purgeItem,RETENTION_MS} from '../../../lib/recycle';
export async function GET(){try{const user=await identity();await purgeExpired(db(),bucket());const mailReady=await syncMail(user);const results=await db().batch([db().prepare('SELECT * FROM lists WHERE owner=? AND deleted_at IS NULL').bind(user.userId),db().prepare('SELECT id,list_id,title,priority,deadline,done FROM tasks WHERE owner=? AND deleted_at IS NULL AND list_id IN (SELECT id FROM lists WHERE deleted_at IS NULL)').bind(user.userId),db().prepare('SELECT id,title,content,filename,size FROM notes WHERE owner=? AND deleted_at IS NULL ORDER BY rowid DESC').bind(user.userId)]);const trash=await db().prepare("SELECT id,title,'lists' AS kind,deleted_at,NULL AS parent_title FROM lists WHERE owner=? AND deleted_at>? UNION ALL SELECT t.id,t.title,'tasks',t.deleted_at,l.title FROM tasks t JOIN lists l ON l.id=t.list_id WHERE t.owner=? AND t.deleted_at>? AND l.deleted_at IS NULL UNION ALL SELECT id,title,'notes',deleted_at,NULL FROM notes WHERE owner=? AND deleted_at>? ORDER BY deleted_at DESC").bind(user.userId,Date.now()-RETENTION_MS,user.userId,Date.now()-RETENTION_MS,user.userId,Date.now()-RETENTION_MS).all();return Response.json({trash:trash.results,user,lists:results[0].results,tasks:results[1].results,notes:results[2].results,mailReady},{headers:{'Cache-Control':'no-store'}})}catch(e){return fail(e)}}
export async function POST(request:Request){try{const user=await identity(request);if(Number(request.headers.get('content-length'))>20000)throw new HttpError('This request is too large.',413);const p=await request.json() as Record<string,any>;const owner=user.userId;await purgeExpired(db(),bucket());const statements:D1PreparedStatement[]=[];
if(p.action==='saveList'){const name=title(p.title),rank=priority(p.priority),due=deadline(p.deadline);if(!['General','Year','Month','Week','Day'].includes(p.period))throw new HttpError('Choose a valid list type.');if(p.id){await owned('lists',p.id,owner);statements.push(db().prepare('UPDATE lists SET title=?,period=?,priority=?,deadline=? WHERE id=? AND owner=?').bind(name,p.period,rank,due,p.id,owner))}else statements.push(db().prepare('INSERT INTO lists(id,owner,title,period,priority,deadline) VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(),owner,name,p.period,rank,due))}
else if(p.action==='saveTask'){const name=title(p.title),rank=priority(p.priority),due=deadline(p.deadline);const list=await owned('lists',p.listId,owner);if(p.id){const task=await owned('tasks',p.id,owner);if(task.list_id!==list.id)throw new HttpError('Task does not belong to this list.');statements.push(db().prepare('UPDATE tasks SET title=?,priority=?,deadline=? WHERE id=? AND owner=?').bind(name,rank,due,p.id,owner))}else{statements.push(db().prepare('INSERT INTO tasks(id,owner,list_id,title,priority,deadline) VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(),owner,list.id,name,rank,due));statements.push(db().prepare('UPDATE lists SET done=0 WHERE id=? AND owner=?').bind(list.id,owner))}}
else if(p.action==='toggleTask'){if(typeof p.done!=='boolean')throw new HttpError('Choose a completion state.');const task=await owned('tasks',p.id,owner);statements.push(db().prepare('UPDATE tasks SET done=? WHERE id=? AND owner=?').bind(Number(p.done),p.id,owner));statements.push(db().prepare('UPDATE lists SET done=CASE WHEN EXISTS(SELECT 1 FROM tasks WHERE list_id=? AND deleted_at IS NULL AND done=0) THEN 0 ELSE 1 END WHERE id=? AND owner=?').bind(task.list_id,task.list_id,owner))}
else if(p.action==='setListImportant'){if(typeof p.important!=='boolean')throw new HttpError('Choose an importance state.');await owned('lists',p.id,owner);await db().prepare('UPDATE lists SET important=? WHERE id=? AND owner=? AND deleted_at IS NULL').bind(Number(p.important),p.id,owner).run();return Response.json({ok:true})}
else if(p.action==='setListDone'){if(typeof p.done!=='boolean')throw new HttpError('Choose a completion state.');await owned('lists',p.id,owner);statements.push(db().prepare('UPDATE lists SET done=? WHERE id=? AND owner=?').bind(Number(p.done),p.id,owner));statements.push(db().prepare('UPDATE tasks SET done=? WHERE list_id=? AND owner=? AND deleted_at IS NULL').bind(Number(p.done),p.id,owner))}
else if(['trash','restore','purge'].includes(p.action)){
 if(!['lists','tasks','notes'].includes(p.kind)||typeof p.id!=='string')throw new HttpError('Choose a valid item.');
 const table=p.kind as 'lists'|'tasks'|'notes';
 const row=await db().prepare(`SELECT * FROM ${table} WHERE id=? AND owner=?`).bind(p.id,owner).first<Record<string,any>>();
 if(!row)throw new HttpError('This item was not found.',404);
 if(row.deleted_at!==null&&row.deleted_at<=Date.now()-RETENTION_MS)throw new HttpError('This item has expired.',410);
 if(table==='tasks')await owned('lists',row.list_id,owner);
 if(p.action==='trash'){
  if(row.deleted_at!==null)throw new HttpError('This item is already in the recycle bin.',409);
  statements.push(db().prepare(`UPDATE ${table} SET deleted_at=? WHERE id=? AND owner=?`).bind(Date.now(),p.id,owner));
  if(table==='tasks')statements.push(db().prepare('UPDATE lists SET done=CASE WHEN EXISTS(SELECT 1 FROM tasks WHERE list_id=? AND deleted_at IS NULL) AND NOT EXISTS(SELECT 1 FROM tasks WHERE list_id=? AND deleted_at IS NULL AND done=0) THEN 1 ELSE 0 END WHERE id=? AND owner=?').bind(row.list_id,row.list_id,row.list_id,owner));
 }else{
  if(row.deleted_at===null)throw new HttpError('This item is not in the recycle bin.',409);
  if(p.action==='purge')await purgeItem(db(),bucket(),table,p.id,owner);
  else {
   statements.push(db().prepare(`UPDATE ${table} SET deleted_at=NULL WHERE id=? AND owner=?`).bind(p.id,owner));
   if(table==='tasks'&&!row.done)statements.push(db().prepare('UPDATE lists SET done=0 WHERE id=? AND owner=?').bind(row.list_id,owner));
  }
 }
}
else throw new HttpError('Unknown action.');statements.push(dirty(owner));await db().batch(statements);const mailReady=await syncMail(user);return Response.json({ok:true,mailReady})}catch(e){return fail(e)}}

