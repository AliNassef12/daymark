'use client';
import {CopyButton} from './copy-button';
import {useState} from 'react';

type Theme = 'dark' | 'light' | 'monokai';
type Format = 'text' | 'code';
// Render tokens as React text nodes so saved markup is never executed.
export function CodeBlock({content,theme='dark'}:{content:string;theme?:Theme}) {
 const tokens = content.split(/("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\/\*[\s\S]*?\*\/|\/\/[^\n]*|#[^\n]*|\b(?:const|let|var|function|return|if|else|for|while|class|new|import|export|from|async|await|try|catch|throw|def|print|in|None|True|False|true|false|null|SELECT|FROM|WHERE|INSERT|UPDATE|DELETE|AND|OR)\b|\b\d+(?:\.\d+)?\b)/g);
 return <pre className={`code-block theme-${theme}`}><code>{tokens.map((token,i)=>{
  if(i%2===0)return token;
  const kind=/^["'`]/.test(token)?'string':/^(\/\/|\/\*|#)/.test(token)?'comment':/^\d/.test(token)?'number':'keyword';
  return <span className={`syntax-${kind}`} key={i}>{token}</span>;
 })}</code></pre>;
}

export function NoteEditor({initial}:{initial?:{content?:string;format?:Format;theme?:Theme}}) {
 const [format,setFormat]=useState<Format>(initial?.format??'text');
 const [theme,setTheme]=useState<Theme>(initial?.theme??'dark');
 const [content,setContent]=useState(initial?.content??'');
 return <>
  <div className="form-row">
   <label className="field">Type<select name="format" value={format} onChange={e=>setFormat(e.target.value as Format)}><option value="text">Text</option><option value="code">Code</option></select></label>
   {format==='code'?<label className="field">Code theme<select name="theme" value={theme} onChange={e=>setTheme(e.target.value as Theme)}><option value="dark">Dark</option><option value="light">Light</option><option value="monokai">Monokai</option></select></label>:<input type="hidden" name="theme" value={theme}/>}
  </div>
  <label className="field">{format==='code'?'Code':'Text'}<textarea className={format==='code'?`code-editor theme-${theme}`:'plain-text'} spellCheck={format==='text'} autoCapitalize={format==='code'?'off':'sentences'} autoCorrect={format==='code'?'off':'on'} name="content" maxLength={20000} value={content} onChange={e=>setContent(e.target.value)} placeholder={format==='code'?'Paste your code here…':'Write something you want to keep…'}/><small>Up to 20,000 characters.</small></label>
  <CopyButton content={content}/>
  {format==='code'&&<div className="code-preview"><div className="eyebrow">Syntax preview</div><CodeBlock content={content||'// Your code preview'} theme={theme}/></div>}
 </>;
}
