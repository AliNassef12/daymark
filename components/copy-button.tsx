'use client';
import {useState} from 'react';
import {Copy,Check} from 'lucide-react';

export function CopyButton({content,label='Copy content'}:{content:string;label?:string}) {
 const [status,setStatus]=useState('');
 const [busy,setBusy]=useState(false);
 async function copy() {
  setBusy(true);setStatus('');
  try {await navigator.clipboard.writeText(content);setStatus('Copied!');}
  catch {setStatus('Could not copy. Select the content and copy it manually.');}
  finally {setBusy(false);}
 }
 return <div className="copy-control"><button type="button" className="text-button" aria-label={label} disabled={!content||busy} onClick={copy}>{status==='Copied!'?<Check size={16}/>:<Copy size={16}/>}Copy</button><span className="copy-status" role="status">{status}</span></div>;
}
