"use client";

import { useEffect, useRef, useState, useCallback } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const ACCEPTED_EXTENSIONS = ".pdf,.docx,.doc,.odt,.txt,.md,.html,.jpg,.jpeg,.png,.heic,.webp,.mp4,.mov,.mp3,.m4a";
const ACCEPTED_MIME = new Set([
  "application/pdf","application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword","application/vnd.oasis.opendocument.text",
  "text/plain","text/markdown","text/html",
  "image/jpeg","image/png","image/heic","image/webp","video/mp4","video/quicktime","audio/mpeg","audio/mp4",
]);

type TabType = "all"|"pdf"|"docx"|"txt";
type SortType = "date"|"name"|"size"|"type";

interface AssetSummary {
  id:string; filename:string; file_type:string; mime_type:string; size_bytes:number;
  captured_at:string|null; ingested_at:string; thumbnail_path:string|null;
  lat:number|null; lon:number|null;
  metadata_json:{summary?:string;text_length?:number}|null;
}
interface AssetDetail extends AssetSummary {
  camera_make:string|null; camera_model:string|null;
  tags:{key:string;value:string;confidence:number|null;source:string}[];
  faces:unknown[];
}
type FileStatus="pending"|"uploading"|"done"|"error";
interface UploadItem{id:string;file:File;status:FileStatus;progress:number;error?:string;}

function formatBytes(b:number):string{if(b<1024)return`${b} B`;if(b<1024*1024)return`${(b/1024).toFixed(1)} KB`;return`${(b/(1024*1024)).toFixed(1)} MB`;}
function formatDate(s:string|null):string{if(!s)return"—";return new Date(s).toLocaleDateString("en-US",{year:"numeric",month:"short",day:"numeric"});}
function filterAccepted(files:FileList|File[]):File[]{return Array.from(files).filter(f=>ACCEPTED_MIME.has(f.type)||f.type==="");}
function xhrUpload(file:File,onProgress:(p:number)=>void):Promise<Record<string,unknown>>{return new Promise((resolve,reject)=>{const xhr=new XMLHttpRequest();const form=new FormData();form.append("file",file);xhr.upload.addEventListener("progress",e=>{if(e.lengthComputable)onProgress(Math.round(e.loaded/e.total*100));});xhr.addEventListener("load",()=>{let body:Record<string,unknown>={};try{body=JSON.parse(xhr.responseText);}catch{/* ignore */}if(xhr.status>=200&&xhr.status<300)resolve(body);else reject(new Error((body.detail as string)??`HTTP ${xhr.status}`));});xhr.addEventListener("error",()=>reject(new Error("Network error")));xhr.open("POST",`${API_URL}/api/v1/ingest`);xhr.send(form);});}

function typeBadge(mime:string):{label:string;cls:string}{
  if(mime==="application/pdf")return{label:"PDF",cls:"bg-red-50 text-red-600 border-red-200"};
  if(mime.includes("word")||mime.includes("document"))return{label:"DOCX",cls:"bg-blue-50 text-blue-600 border-blue-200"};
  if(mime.startsWith("text/"))return{label:"TXT",cls:"bg-gray-100 text-gray-600 border-gray-200"};
  if(mime.startsWith("image/"))return{label:"IMG",cls:"bg-purple-50 text-purple-600 border-purple-200"};
  if(mime.startsWith("audio/"))return{label:"AUD",cls:"bg-violet-50 text-violet-600 border-violet-200"};
  return{label:"FILE",cls:"bg-gray-100 text-gray-500 border-gray-200"};
}

function matchesTab(mime:string,tab:TabType):boolean{
  if(tab==="all")return true;
  if(tab==="pdf")return mime==="application/pdf";
  if(tab==="docx")return mime.includes("word")||mime.includes("document");
  if(tab==="txt")return mime.startsWith("text/");
  return true;
}

function applySort(items:AssetSummary[],sort:SortType):AssetSummary[]{
  return [...items].sort((a,b)=>{
    if(sort==="name")return a.filename.localeCompare(b.filename);
    if(sort==="size")return b.size_bytes-a.size_bytes;
    if(sort==="type")return a.mime_type.localeCompare(b.mime_type);
    return new Date(b.ingested_at).getTime()-new Date(a.ingested_at).getTime();
  });
}

function UploadModal({initialFiles,onClose,onComplete}:{initialFiles:File[];onClose:()=>void;onComplete:()=>Promise<void>;}){
  const [items,setItems]=useState<UploadItem[]>(()=>initialFiles.map(f=>({id:crypto.randomUUID(),file:f,status:"pending",progress:0})));
  const [uploading,setUploading]=useState(false);const [allDone,setAllDone]=useState(false);const fileInputRef=useRef<HTMLInputElement>(null);
  useEffect(()=>{const h=(e:KeyboardEvent)=>{if(e.key==="Escape"&&!uploading)onClose();};window.addEventListener("keydown",h);return()=>window.removeEventListener("keydown",h);},[onClose,uploading]);
  function addFiles(files:FileList|File[]){setItems(p=>[...p,...filterAccepted(files).map(f=>({id:crypto.randomUUID(),file:f,status:"pending" as FileStatus,progress:0}))]);}
  async function startUpload(){setUploading(true);let ok=true;for(const item of items){if(item.status==="done")continue;setItems(p=>p.map(i=>i.id===item.id?{...i,status:"uploading",progress:0}:i));try{await xhrUpload(item.file,pct=>setItems(p=>p.map(i=>i.id===item.id?{...i,progress:pct}:i)));setItems(p=>p.map(i=>i.id===item.id?{...i,status:"done",progress:100}:i));}catch(err){ok=false;setItems(p=>p.map(i=>i.id===item.id?{...i,status:"error",error:(err as Error).message}:i));}}setUploading(false);setAllDone(true);if(ok){await onComplete();onClose();}}
  const doneCount=items.filter(i=>i.status==="done").length,errCount=items.filter(i=>i.status==="error").length;
  return(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={()=>{if(!uploading)onClose();}}>
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden" onClick={e=>e.stopPropagation()} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();addFiles(e.dataTransfer.files);}}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100"><span className="font-semibold text-gray-900 text-sm">{uploading?"Uploading…":allDone?`Done — ${doneCount} uploaded${errCount>0?`, ${errCount} failed`:""}`:`${items.length} file${items.length!==1?"s":""} selected`}</span>{!uploading&&<button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg></button>}</div>
        {items.length===0&&<div className="mx-5 my-5 flex flex-col items-center justify-center border-2 border-dashed border-gray-200 rounded-xl py-10 text-center cursor-pointer hover:border-gray-300 hover:bg-gray-50 transition-colors" onClick={()=>fileInputRef.current?.click()}><svg className="w-10 h-10 text-gray-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/></svg><p className="text-gray-500 text-sm font-medium">Drop files here or click to browse</p><p className="text-gray-400 text-xs mt-1.5">PDF · DOCX · TXT · MD</p></div>}
        {items.length>0&&<div className="overflow-y-auto max-h-64 px-5 py-3 space-y-2">{items.map(item=><div key={item.id} className="flex items-center gap-3"><div className="w-7 h-7 shrink-0 flex items-center justify-center">{item.status==="done"&&<svg className="w-5 h-5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/></svg>}{item.status==="error"&&<svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>}{item.status==="uploading"&&<div className="w-4 h-4 border-2 border-gray-200 border-t-gray-600 rounded-full animate-spin"/>}{item.status==="pending"&&<div className="w-4 h-4 rounded-full border-2 border-gray-200"/>}</div><div className="flex-1 min-w-0"><div className="flex items-baseline justify-between gap-2"><span className="text-sm text-gray-800 truncate">{item.file.name}</span><span className="text-xs text-gray-400 shrink-0">{formatBytes(item.file.size)}</span></div>{item.status==="error"&&<p className="text-xs text-red-500 mt-0.5 truncate">{item.error}</p>}{(item.status==="uploading"||item.status==="pending")&&<div className="mt-1.5 h-1 bg-gray-100 rounded-full overflow-hidden"><div className="h-full bg-gray-400 rounded-full transition-all duration-150" style={{width:`${item.progress}%`}}/></div>}</div>{item.status==="pending"&&!uploading&&<button onClick={()=>setItems(p=>p.filter(i=>i.id!==item.id))} className="shrink-0 p-1 text-gray-300 hover:text-gray-500 transition-colors"><svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg></button>}</div>)}</div>}
        <div className="px-5 py-4 border-t border-gray-100 flex items-center justify-between gap-3">{!uploading&&!allDone?<button onClick={()=>fileInputRef.current?.click()} className="text-sm text-gray-400 hover:text-gray-600 transition-colors">+ Add more</button>:<span/>}{allDone?<button onClick={async()=>{await onComplete();onClose();}} className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm transition-colors">Close</button>:<button onClick={startUpload} disabled={uploading||items.length===0} className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">{uploading?"Uploading…":`Upload ${items.length} file${items.length!==1?"s":""}`}</button>}</div>
      </div>
      <input ref={fileInputRef} type="file" multiple accept={ACCEPTED_EXTENSIONS} className="hidden" onChange={e=>{if(e.target.files)addFiles(e.target.files);e.target.value="";}}/>
    </div>
  );
}

function DragOverlay({visible}:{visible:boolean}){if(!visible)return null;return<div className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-white/90 backdrop-blur-sm pointer-events-none border-4 border-dashed border-gray-300 m-3 rounded-2xl"><svg className="w-12 h-12 text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/></svg><p className="text-lg font-semibold text-gray-700">Drop to add to your vault</p></div>;}

function FloatingUploadButton({onClick}:{onClick:()=>void}){return<button onClick={onClick} title="Upload" className="fixed bottom-6 right-6 z-40 w-12 h-12 rounded-full bg-gray-900 text-white shadow-lg hover:bg-gray-700 hover:scale-105 active:scale-95 transition-all flex items-center justify-center"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/></svg></button>;}

function DetailPanel({assetId,onClose}:{assetId:string;onClose:()=>void}){
  const [detail,setDetail]=useState<AssetDetail|null>(null);
  useEffect(()=>{setDetail(null);fetch(`${API_URL}/api/v1/assets/${assetId}`).then(r=>r.json()).then(setDetail).catch(()=>{});},[assetId]);
  return(
    <aside className="w-72 shrink-0 border-l border-gray-100 bg-white flex flex-col overflow-y-auto">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Info</span>
        <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg></button>
      </div>
      <div className="p-5 space-y-4 flex-1">
        {!detail?<div className="space-y-3">{Array.from({length:6}).map((_,i)=><div key={i} className="h-4 bg-gray-100 rounded animate-pulse"/>)}</div>:(
          <>
            <div><p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1">Filename</p><p className="text-sm text-gray-800 break-all">{detail.filename}</p></div>
            <div><p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1">Added</p><p className="text-sm text-gray-700">{formatDate(detail.ingested_at)}</p></div>
            <div><p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1">Size</p><p className="text-sm text-gray-700">{formatBytes(detail.size_bytes)}</p></div>
            {detail.metadata_json?.text_length!=null&&<div><p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1">Characters</p><p className="text-sm text-gray-700">{(detail.metadata_json.text_length as number).toLocaleString()}</p></div>}
            {detail.metadata_json?.summary&&<div><p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1">Summary</p><p className="text-sm text-gray-600 leading-relaxed">{String(detail.metadata_json.summary)}</p></div>}
            {detail.tags.length>0&&<div><p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-2">Tags</p><div className="flex flex-wrap gap-1.5">{detail.tags.map((t,i)=><span key={i} className="px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-600 border border-gray-200">{t.key}: {t.value}</span>)}</div></div>}
          </>
        )}
      </div>
    </aside>
  );
}

export default function DocumentsPage(){
  const [assets,setAssets]=useState<AssetSummary[]>([]);
  const [loading,setLoading]=useState(true);
  const [tab,setTab]=useState<TabType>("all");
  const [sort,setSort]=useState<SortType>("date");
  const [selectedId,setSelectedId]=useState<string|null>(null);
  const [selectedIds,setSelectedIds]=useState<Set<string>>(new Set());
  const [showUpload,setShowUpload]=useState(false);
  const [uploadFiles,setUploadFiles]=useState<File[]>([]);
  const [dragging,setDragging]=useState(false);
  const dragRef=useRef(0);

  const loadAssets=useCallback(async()=>{
    try{const data=await fetch(`${API_URL}/api/v1/assets?file_type=document&page=1&page_size=200`).then(r=>r.json());setAssets(data.items??[]);}
    catch{ /* ignore */ }finally{setLoading(false);}
  },[]);

  useEffect(()=>{loadAssets();},[loadAssets]);

  useEffect(()=>{
    const onEnter=(e:DragEvent)=>{if(!e.dataTransfer?.types.includes("Files"))return;dragRef.current++;setDragging(true);};
    const onLeave=(e:DragEvent)=>{if(e.relatedTarget!==null)return;dragRef.current=0;setDragging(false);};
    const onOver=(e:DragEvent)=>e.preventDefault();
    const onDrop=(e:DragEvent)=>{e.preventDefault();dragRef.current=0;setDragging(false);if(!e.dataTransfer?.files.length)return;const a=filterAccepted(e.dataTransfer.files);if(!a.length)return;setUploadFiles(a);setShowUpload(true);};
    document.addEventListener("dragenter",onEnter);document.addEventListener("dragleave",onLeave);document.addEventListener("dragover",onOver);document.addEventListener("drop",onDrop);
    return()=>{document.removeEventListener("dragenter",onEnter);document.removeEventListener("dragleave",onLeave);document.removeEventListener("dragover",onOver);document.removeEventListener("drop",onDrop);};
  },[]);

  const visible=applySort(assets.filter(a=>matchesTab(a.mime_type,tab)),sort);

  function toggleSelect(id:string){setSelectedIds(prev=>{const n=new Set(prev);n.has(id)?n.delete(id):n.add(id);return n;});}

  return(
    <div className="flex h-full bg-white">
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {/* Top bar */}
        <div className="sticky top-0 z-20 bg-white border-b border-gray-100 px-8 py-4 flex items-center gap-4">
          <h1 className="text-base font-semibold text-gray-900">Documents</h1>
          <div className="flex items-center gap-1">
            {(["all","pdf","docx","txt"] as TabType[]).map(t=>(
              <button key={t} onClick={()=>setTab(t)} className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${tab===t?"bg-gray-900 text-white":"bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                {t==="all"?"All":t.toUpperCase()}
              </button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-2">
            {selectedIds.size>0&&<span className="text-xs text-gray-500 font-medium">{selectedIds.size} selected</span>}
            <select value={sort} onChange={e=>setSort(e.target.value as SortType)} className="text-xs text-gray-600 border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:border-gray-400 transition-colors">
              <option value="date">Date Added</option>
              <option value="name">Name</option>
              <option value="size">Size</option>
              <option value="type">Type</option>
            </select>
            {!loading&&<span className="text-xs text-gray-400">{visible.length}</span>}
          </div>
        </div>

        {/* List */}
        <div className="flex-1 px-4 py-2">
          {loading?(
            <div className="space-y-1 pt-2">{Array.from({length:8}).map((_,i)=><div key={i} className="flex items-center gap-3 px-4 py-3"><div className="w-9 h-9 rounded-lg bg-gray-100 animate-pulse shrink-0"/><div className="flex-1 space-y-2"><div className="h-4 bg-gray-100 rounded animate-pulse"/><div className="h-3 w-2/3 bg-gray-50 rounded animate-pulse"/></div></div>)}</div>
          ):visible.length===0?(
            <div className="flex flex-col items-center justify-center min-h-[50vh] text-center"><div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mb-4"><svg className="w-7 h-7 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg></div><p className="text-gray-600 font-medium mb-1">No documents yet</p><p className="text-sm text-gray-400 mb-5">Upload PDF, Word, or text files</p><button onClick={()=>{setUploadFiles([]);setShowUpload(true);}} className="px-4 py-2 rounded-xl bg-gray-900 text-white text-sm hover:bg-gray-700 transition-colors">Upload files</button></div>
          ):(
            <div>
              {/* Header row */}
              <div className="flex items-center gap-3 px-4 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-widest border-b border-gray-100">
                <div className="w-9 shrink-0"/>
                <div className="flex-1">Name</div>
                <div className="hidden sm:block w-16 text-center">Type</div>
                <div className="hidden md:block w-28 text-right">Date</div>
                <div className="hidden md:block w-20 text-right">Size</div>
              </div>
              {visible.map(asset=>{
                const{label,cls}=typeBadge(asset.mime_type);
                const checked=selectedIds.has(asset.id);
                return(
                  <div key={asset.id} className={`group flex items-center gap-3 px-4 py-3 rounded-xl transition-colors cursor-pointer ${selectedId===asset.id?"bg-blue-50":checked?"bg-blue-50/50":"hover:bg-gray-50"}`} onClick={()=>setSelectedId(asset.id===selectedId?null:asset.id)}>
                    {/* Checkbox (shows on hover or when checked) */}
                    <div className="w-9 shrink-0 flex items-center justify-center" onClick={e=>{e.stopPropagation();toggleSelect(asset.id);}}>
                      <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-all ${checked?"border-blue-500 bg-blue-500":"border-gray-300 opacity-0 group-hover:opacity-100"}`}>
                        {checked&&<svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7"/></svg>}
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-800 font-medium truncate">{asset.filename}</p>
                      {asset.metadata_json?.summary&&<p className="text-xs text-gray-400 truncate mt-0.5">{asset.metadata_json.summary}</p>}
                    </div>
                    <div className="hidden sm:flex w-16 justify-center">
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-semibold border ${cls}`}>{label}</span>
                    </div>
                    <div className="hidden md:block w-28 text-right text-xs text-gray-400">{formatDate(asset.ingested_at)}</div>
                    <div className="hidden md:block w-20 text-right text-xs text-gray-400">{formatBytes(asset.size_bytes)}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {selectedId&&<DetailPanel assetId={selectedId} onClose={()=>setSelectedId(null)}/>}
      {showUpload&&<UploadModal initialFiles={uploadFiles} onClose={()=>setShowUpload(false)} onComplete={loadAssets}/>}
      <DragOverlay visible={dragging&&!showUpload}/>
      <FloatingUploadButton onClick={()=>{setUploadFiles([]);setShowUpload(true);}}/>
    </div>
  );
}
