type DeadlineItem = {id:string;title:string;deadline:number|null;done:number};
export function deadlineWarnings(lists:DeadlineItem[], tasks:(DeadlineItem & {list_id:string})[], now:number) {
  const active = new Map(lists.filter(list => !list.done).map(list => [list.id,list]));
  return [
    ...Array.from(active.values()).map(list => ({...list,kind:'list' as const,parentTitle:null as string|null})),
    ...tasks.filter(task => !task.done && active.has(task.list_id)).map(task => ({...task,kind:'task' as const,parentTitle:active.get(task.list_id)!.title})),
  ].filter((item): item is typeof item & {deadline:number} => item.deadline!==null && item.deadline-now<=2*60*60*1000)
    .sort((a,b) => a.deadline-b.deadline);
}

export function deadlineMessage(deadline:number,now:number) {
  const minutes=Math.ceil((deadline-now)/60000);
  if(deadline<now)return 'Overdue';
  if(minutes<=0)return 'Due now';
  if(minutes<60)return `Due in ${minutes} minute${minutes===1?'':'s'}`;
  const hours=Math.floor(minutes/60), remainder=minutes%60;
  return `Due in ${hours} hour${hours===1?'':'s'}${remainder?` ${remainder} min`:''}`;
}
