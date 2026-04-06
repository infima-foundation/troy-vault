"use client";

import { useEffect, useRef, useState, useCallback } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const ACCEPTED_EXTENSIONS = ".jpg,.jpeg,.png,.heic,.heif,.webp,.mp4,.mov,.pdf,.docx,.txt,.mp3,.m4a";
const ACCEPTED_MIME = new Set([
  "image/jpeg","image/png","image/heic","image/heif","image/webp",
  "video/mp4","video/quicktime",
  "application/pdf","text/plain","audio/mpeg","audio/mp4",
]);

type FilterType = "all" | "photo" | "video";
type ViewType = "grid" | "timeline";

interface AssetSummary {
  id: string; filename: string; file_type: "photo"|"video"|"audio"|"document";
  mime_type: string; size_bytes: number; captured_at: string | null;
  ingested_at: string; thumbnail_path: string | null; lat: number|null; lon: number|null;
}
interface AssetDetail extends AssetSummary {
  camera_make: string|null; camera_model: string|null;
  metadata_json: Record<string,unknown>|null;
  tags: {key:string;value:string;confidence:number|null;source:string}[];
  faces: {id:string;cluster_id:string|null;bbox:unknown}[];
}
type FileStatus = "pending"|"uploading"|"done"|"error";
interface UploadItem { id:string; file:File; status:FileStatus; progress:number; error?:string; }

function formatMonthYear(s:string|null):string {
  if(!s) return "Unknown date";
  return new Date(s).toLocaleDateString("en-US",{month:"long",year:"numeric"});
}
function formatDate(s:string|null):string {
  if(!s) return "—";
  return new Date(s).toLocaleDateString("en-US",{year:"numeric",month:"short",day:"numeric"});
}
function formatBytes(b:number):string {
  if(b<1024) return `${b} B`;
  if(b<1024*1024) return `${(b/1024).toFixed(1)} KB`;
  return `${(b/(1024*1024)).toFixed(1)} MB`;
}
function sortByDate(a:AssetSummary,b:AssetSummary):number {
  return new Date(b.captured_at??b.ingested_at).getTime()-new Date(a.captured_at??a.ingested_at).getTime();
}
function groupByMonth(assets:AssetSummary[]):[string,AssetSummary[]][] {
  const map=new Map<string,AssetSummary[]>();
  for(const a of assets){
    const k=formatMonthYear(a.captured_at??a.ingested_at);
    map.set(k,[...(map.get(k)??[]),a]);
  }
  return Array.from(map.entries());
}
function filterAccepted(files:FileList|File[]):File[] {
  return Array.from(files).filter(f=>ACCEPTED_MIME.has(f.type)||f.type==="");
}
function xhrUpload(file:File,onProgress:(p:number)=>void):Promise<Record<string,unknown>> {
  return new Promise((resolve,reject)=>{
    const xhr=new XMLHttpRequest();
    const form=new FormData();
    form.append("file",file);
    xhr.upload.addEventListener("progress",e=>{if(e.lengthComputable)onProgress(Math.round(e.loaded/e.total*100));});
    xhr.addEventListener("load",()=>{
      let body:Record<string,unknown>={};
      try{body=JSON.parse(xhr.responseText);}catch{ /* ignore */ }
      if(xhr.status>=200&&xhr.status<300)resolve(body);
      else reject(new Error((body.detail as string)??`HTTP ${xhr.status}`));
    });
    xhr.addEventListener("error",()=>reject(new Error("Network error")));
    xhr.open("POST",`${API_URL}/api/v1/ingest`);
    xhr.send(form);
  });
}

function UploadModal({ initialFiles, onClose, onComplete }:
  { initialFiles:File[]; onClose:()=>void; onComplete:()=>Promise<void>; }) {
  const [items,setItems]=useState<UploadItem[]>(()=>initialFiles.map(f=>({id:crypto.randomUUID(),file:f,status:"pending",progress:0})));
  const [uploading,setUploading]=useState(false);
  const [allDone,setAllDone]=useState(false);
  const fileInputRef=useRef<HTMLInputElement>(null);
  useEffect(()=>{const h=(e:KeyboardEvent)=>{if(e.key==="Escape"&&!uploading)onClose();};window.addEventListener("keydown",h);return()=>window.removeEventListener("keydown",h);},[onClose,uploading]);
  function addFiles(files:FileList|File[]){const a=filterAccepted(files);setItems(p=>[...p,...a.map(f=>({id:crypto.randomUUID(),file:f,status:"pending" as FileStatus,progress:0}))]);  }
  async function startUpload(){setUploading(true);let ok=true;for(const item of items){if(item.status==="done")continue;setItems(p=>p.map(i=>i.id===item.id?{...i,status:"uploading",progress:0}:i));try{await xhrUpload(item.file,pct=>setItems(p=>p.map(i=>i.id===item.id?{...i,progress:pct}:i)));setItems(p=>p.map(i=>i.id===item.id?{...i,status:"done",progress:100}:i));}catch(err){ok=false;setItems(p=>p.map(i=>i.id===item.id?{...i,status:"error",error:(err as Error).message}:i));}}setUploading(false);setAllDone(true);if(ok){await onComplete();onClose();}}
  const doneCount=items.filter(i=>i.status==="done").length;
  const errCount=items.filter(i=>i.status==="error").length;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={()=>{if(!uploading)onClose();}}>
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden" onClick={e=>e.stopPropagation()} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();addFiles(e.dataTransfer.files);}}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <span className="font-semibold text-gray-900 text-sm">{uploading?`Uploading…`:allDone?`Done — ${doneCount} uploaded${errCount>0?`, ${errCount} failed`:""}`:`${items.length} file${items.length!==1?"s":""} selected`}</span>
          {!uploading&&<button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg></button>}
        </div>
        {items.length===0&&(<div className="mx-5 my-5 flex flex-col items-center justify-center border-2 border-dashed border-gray-200 rounded-xl py-10 text-center cursor-pointer hover:border-gray-300 hover:bg-gray-50 transition-colors" onClick={()=>fileInputRef.current?.click()}><svg className="w-10 h-10 text-gray-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/></svg><p className="text-gray-500 text-sm font-medium">Drop files here or click to browse</p><p className="text-gray-400 text-xs mt-1.5">JPG · PNG · HEIC · WebP · MP4 · MOV</p></div>)}
        {items.length>0&&(<div className="overflow-y-auto max-h-64 px-5 py-3 space-y-2">{items.map(item=>(<div key={item.id} className="flex items-center gap-3"><div className="w-7 h-7 shrink-0 flex items-center justify-center">{item.status==="done"&&<svg className="w-5 h-5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/></svg>}{item.status==="error"&&<svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>}{item.status==="uploading"&&<div className="w-4 h-4 border-2 border-gray-200 border-t-gray-600 rounded-full animate-spin"/>}{item.status==="pending"&&<div className="w-4 h-4 rounded-full border-2 border-gray-200"/>}</div><div className="flex-1 min-w-0"><div className="flex items-baseline justify-between gap-2"><span className="text-sm text-gray-800 truncate">{item.file.name}</span><span className="text-xs text-gray-400 shrink-0">{formatBytes(item.file.size)}</span></div>{item.status==="error"&&<p className="text-xs text-red-500 mt-0.5 truncate">{item.error}</p>}{(item.status==="uploading"||item.status==="pending")&&<div className="mt-1.5 h-1 bg-gray-100 rounded-full overflow-hidden"><div className="h-full bg-gray-400 rounded-full transition-all duration-150" style={{width:`${item.progress}%`}}/></div>}</div>{item.status==="pending"&&!uploading&&<button onClick={()=>setItems(p=>p.filter(i=>i.id!==item.id))} className="shrink-0 p-1 text-gray-300 hover:text-gray-500 transition-colors"><svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg></button>}</div>))}</div>)}
        <div className="px-5 py-4 border-t border-gray-100 flex items-center justify-between gap-3">{!uploading&&!allDone?<button onClick={()=>fileInputRef.current?.click()} className="text-sm text-gray-400 hover:text-gray-600 transition-colors">+ Add more</button>:<span/>}{allDone?<button onClick={async()=>{await onComplete();onClose();}} className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm transition-colors">Close</button>:<button onClick={startUpload} disabled={uploading||items.length===0} className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">{uploading?"Uploading…":`Upload ${items.length} file${items.length!==1?"s":""}`}</button>}</div>
      </div>
      <input ref={fileInputRef} type="file" multiple accept={ACCEPTED_EXTENSIONS} className="hidden" onChange={e=>{if(e.target.files)addFiles(e.target.files);e.target.value="";}}/>
    </div>
  );
}

function DragOverlay({visible}:{visible:boolean}){
  if(!visible)return null;
  return(<div className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-white/90 backdrop-blur-sm pointer-events-none border-4 border-dashed border-gray-300 m-3 rounded-2xl"><svg className="w-12 h-12 text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/></svg><p className="text-lg font-semibold text-gray-700">Drop to add to your vault</p><p className="text-sm text-gray-400 mt-1">Photos · Videos · Documents · Audio</p></div>);
}

function FloatingUploadButton({onClick}:{onClick:()=>void}){
  return(<button onClick={onClick} title="Upload" className="fixed bottom-6 right-6 z-40 w-12 h-12 rounded-full bg-gray-900 text-white shadow-lg hover:bg-gray-700 hover:scale-105 active:scale-95 transition-all flex items-center justify-center"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/></svg></button>);
}

function DetailModal({assetId,onClose}:{assetId:string;onClose:()=>void}){
  const [detail,setDetail]=useState<AssetDetail|null>(null);
  useEffect(()=>{fetch(`${API_URL}/api/v1/assets/${assetId}`).then(r=>r.json()).then(setDetail).catch(()=>{});},[assetId]);
  useEffect(()=>{const h=(e:KeyboardEvent)=>{if(e.key==="Escape")onClose();};window.addEventListener("keydown",h);return()=>window.removeEventListener("keydown",h);},[onClose]);
  return(
    <div className="fixed inset-0 z-50 flex bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="relative m-auto flex w-full max-w-5xl max-h-[90vh] rounded-2xl overflow-hidden bg-white shadow-2xl" onClick={e=>e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-3 right-3 z-10 p-1.5 rounded-full bg-black/10 hover:bg-black/20 text-gray-600 transition-colors"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg></button>
        <div className="flex-1 flex items-center justify-center bg-gray-50 min-h-[400px]">
          {detail?.file_type==="photo"?
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={`${API_URL}/api/v1/assets/${assetId}/thumbnail`} alt={detail?.filename??""} className="max-h-[90vh] max-w-full object-contain"/>:
            <div className="flex flex-col items-center gap-3 text-gray-400"><div className="w-16 h-16 rounded-2xl bg-gray-200 flex items-center justify-center"><svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.723v6.554a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg></div><p className="text-sm">{detail?.filename}</p></div>}
        </div>
        <aside className="w-64 shrink-0 border-l border-gray-100 bg-white overflow-y-auto p-5 space-y-4">
          {!detail?<div className="space-y-3">{Array.from({length:5}).map((_,i)=><div key={i} className="h-4 bg-gray-100 rounded animate-pulse"/>)}</div>:(
            <>
              <div><p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1">Filename</p><p className="text-sm text-gray-800 break-all">{detail.filename}</p></div>
              <div><p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1">Date</p><p className="text-sm text-gray-700">{detail.captured_at?new Date(detail.captured_at).toLocaleString():"—"}</p></div>
              {(detail.camera_make||detail.camera_model)&&<div><p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1">Camera</p><p className="text-sm text-gray-700">{[detail.camera_make,detail.camera_model].filter(Boolean).join(" ")}</p></div>}
              {detail.lat!=null&&<div><p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1">Location</p><p className="text-sm text-gray-700 font-mono">{detail.lat.toFixed(5)}, {detail.lon?.toFixed(5)}</p></div>}
              <div><p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1">Size</p><p className="text-sm text-gray-700">{formatBytes(detail.size_bytes)}</p></div>
              {detail.tags.length>0&&<div><p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-2">Tags</p><div className="flex flex-wrap gap-1.5">{detail.tags.map((t,i)=><span key={i} className="px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-600">{t.key}: {t.value}</span>)}</div></div>}
            </>
          )}
        </aside>
      </div>
    </div>
  );
}

export default function LibraryPage(){
  const [assets,setAssets]=useState<AssetSummary[]>([]);
  const [loading,setLoading]=useState(true);
  const [filter,setFilter]=useState<FilterType>("all");
  const [view,setView]=useState<ViewType>("grid");
  const [selectedId,setSelectedId]=useState<string|null>(null);
  const [showUpload,setShowUpload]=useState(false);
  const [uploadFiles,setUploadFiles]=useState<File[]>([]);
  const [dragging,setDragging]=useState(false);
  const dragRef=useRef(0);

  const loadAssets=useCallback(async()=>{
    try{
      const [pr,vr]=await Promise.all([
        fetch(`${API_URL}/api/v1/assets?file_type=photo&page=1&page_size=200`),
        fetch(`${API_URL}/api/v1/assets?file_type=video&page=1&page_size=200`),
      ]);
      const [pd,vd]=await Promise.all([pr.json(),vr.json()]);
      setAssets([...(pd.items??[]),...(vd.items??[])].sort(sortByDate));
    }catch{ /* ignore */ }finally{setLoading(false);}
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

  const filtered=filter==="all"?assets:assets.filter(a=>a.file_type===filter);
  const groups=groupByMonth(filtered);

  return(
    <div className="min-h-full bg-white">
      {/* Top bar */}
      <div className="sticky top-0 z-20 bg-white border-b border-gray-100 px-8 py-4 flex items-center gap-4">
        <h1 className="text-base font-semibold text-gray-900 mr-2">Photos &amp; Videos</h1>
        {/* Filter pills */}
        <div className="flex items-center gap-1.5">
          {(["all","photo","video"] as FilterType[]).map(f=>(
            <button key={f} onClick={()=>setFilter(f)} className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${filter===f?"bg-gray-900 text-white":"bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
              {f==="all"?"All":f==="photo"?"Photos":"Videos"}
            </button>
          ))}
        </div>
        {/* Sub-nav */}
        <div className="flex items-center gap-1 ml-2 border-l border-gray-200 pl-4">
          {[{label:"All",href:null},{label:"Places",soon:true},{label:"Faces",soon:true},{label:"Years",soon:true}].map(({label,soon})=>(
            <button key={label} disabled={soon} title={soon?"Coming soon":undefined} className={`px-2.5 py-1 rounded-lg text-xs transition-colors ${soon?"text-gray-300 cursor-default":"text-gray-500 hover:bg-gray-50 hover:text-gray-700"}`}>
              {label}{soon&&<span className="ml-1 text-[9px] font-medium text-gray-300">Soon</span>}
            </button>
          ))}
        </div>
        {/* View toggle */}
        <div className="ml-auto flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
          <button onClick={()=>setView("grid")} className={`p-1.5 rounded-md transition-colors ${view==="grid"?"bg-white shadow-sm text-gray-700":"text-gray-400 hover:text-gray-600"}`}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"/></svg>
          </button>
          <button onClick={()=>setView("timeline")} className={`p-1.5 rounded-md transition-colors ${view==="timeline"?"bg-white shadow-sm text-gray-700":"text-gray-400 hover:text-gray-600"}`}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M4 6h16M4 10h16M4 14h16M4 18h16"/></svg>
          </button>
        </div>
        {!loading&&<span className="text-xs text-gray-400 ml-2">{filtered.length}</span>}
      </div>

      {/* Content */}
      {loading?(
        <div className="px-8 py-8 space-y-8">{[1,2].map(g=><div key={g}><div className="h-4 w-28 bg-gray-100 rounded mb-4 animate-pulse"/><div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-9 gap-1">{Array.from({length:18}).map((_,i)=><div key={i} className="aspect-square bg-gray-100 rounded animate-pulse"/>)}</div></div>)}</div>
      ):filtered.length===0?(
        <div className="flex flex-col items-center justify-center min-h-[50vh] text-center px-8">
          <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mb-4"><svg className="w-7 h-7 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg></div>
          <p className="text-gray-600 font-medium mb-1">No media yet</p>
          <p className="text-sm text-gray-400 mb-5">Upload photos and videos to see them here</p>
          <button onClick={()=>{setUploadFiles([]);setShowUpload(true);}} className="px-4 py-2 rounded-xl bg-gray-900 text-white text-sm hover:bg-gray-700 transition-colors">Upload files</button>
        </div>
      ):view==="grid"?(
        <div className="px-8 py-6 space-y-10">
          {groups.map(([month,group])=>(
            <section key={month}>
              <h2 className="text-sm font-semibold text-gray-500 mb-3 sticky top-[65px] bg-white py-1 z-10">{month}</h2>
              <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-9 gap-1">
                {group.map(a=>(
                  <button key={a.id} onClick={()=>setSelectedId(a.id)} className="relative aspect-square overflow-hidden rounded-lg bg-gray-100 group focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400">
                    {a.file_type==="photo"?
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={`${API_URL}/api/v1/assets/${a.id}/thumbnail`} alt={a.filename} className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105" loading="lazy"/>:
                      <div className="w-full h-full flex items-center justify-center bg-gray-200"><div className="w-7 h-7 rounded-full bg-gray-300 flex items-center justify-center"><svg className="w-3.5 h-3.5 text-gray-500 ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></div></div>}
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-150"/>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      ):(
        <div className="px-8 py-6 space-y-8">
          {groups.map(([month,group])=>(
            <section key={month}>
              <h2 className="text-sm font-semibold text-gray-500 mb-3 sticky top-[65px] bg-white py-1 z-10">{month}</h2>
              <div className="space-y-1">
                {group.map(a=>(
                  <button key={a.id} onClick={()=>setSelectedId(a.id)} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50 transition-colors text-left group">
                    <div className="w-10 h-10 rounded-lg overflow-hidden bg-gray-100 shrink-0">
                      {a.file_type==="photo"?
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img src={`${API_URL}/api/v1/assets/${a.id}/thumbnail`} alt={a.filename} className="w-full h-full object-cover"/>:
                        <div className="w-full h-full flex items-center justify-center bg-gray-200"><svg className="w-4 h-4 text-gray-400 ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></div>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-800 truncate">{a.filename}</p>
                      <p className="text-xs text-gray-400">{formatDate(a.captured_at??a.ingested_at)}</p>
                    </div>
                    <span className="text-xs text-gray-400 shrink-0">{formatBytes(a.size_bytes)}</span>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {selectedId&&<DetailModal assetId={selectedId} onClose={()=>setSelectedId(null)}/>}
      {showUpload&&<UploadModal initialFiles={uploadFiles} onClose={()=>setShowUpload(false)} onComplete={loadAssets}/>}
      <DragOverlay visible={dragging&&!showUpload}/>
      <FloatingUploadButton onClick={()=>{setUploadFiles([]);setShowUpload(true);}}/>
    </div>
  );
}
