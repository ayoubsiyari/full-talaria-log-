"use client";
// Unified Admin Dashboard — controls users, feature flags, security logs, system metrics
import React, { useState, useEffect, useCallback } from "react";
import { Shield, Users, Zap, Server, RefreshCw, Plus, Trash2, Edit, X, CheckCircle, AlertTriangle, Download, Database, BarChart3, Activity, MessageSquare, ExternalLink, GraduationCap, Upload } from "lucide-react";
import { LanguageToggle } from "@/components/LanguageToggle";
import { DASHBOARD_MODULE_LABELS } from "@/lib/dashboardAccess";

// helpers
// Auth hardening: journal JWT rides on the httpOnly cookie (sent same-origin);
// we attach the CSRF token for writes instead of a Bearer header.
import { journalCsrfToken } from "@/lib/journalApi";
const jh =()=>{ const c=journalCsrfToken(); return { "Content-Type":"application/json", ...(c?{ "X-CSRF-TOKEN":c }:{}) } as HeadersInit; };
const fmt=(n?:number)=>(n??0).toLocaleString();
const fmtGB=(b?:number)=>b?(b/1e9).toFixed(1)+" GB":"—";

// tiny ui
function Stat({label,value,color}:{label:string;value:string|number;color:string}){
  return <div className="rounded-xl border border-white/10 bg-white/5 p-4"><div className={`text-xs font-medium uppercase tracking-wide ${color}`}>{label}</div><div className="mt-1 text-2xl font-bold text-white">{value}</div></div>;
}
function Bar({pct,color}:{pct:number;color:string}){
  return <div className="w-full bg-white/10 rounded-full h-1.5 mt-1"><div className={`h-1.5 rounded-full ${color}`} style={{width:`${Math.min(pct??0,100)}%`}}/></div>;
}
function Pill({ok,label}:{ok:boolean;label:string}){
  return <span className={`rounded-full px-2 py-0.5 text-xs ${ok?"bg-green-500/20 text-green-300":"bg-red-500/20 text-red-300"}`}>{label}</span>;
}

type URow={
  id:number;
  email:string;
  full_name?:string;
  name?:string;
  role?:string;
  is_admin?:boolean;
  has_journal_access?:boolean;
  dashboard_modules?: Record<string, boolean>;
  has_active_subscription?: boolean;
  subscription_status?:string|null;
  is_active?:boolean;
  created_at?:string;
  trades_count?:number;
  max_trading_sessions?: number;
  max_tickers_per_session?: number;
  max_supporting_tickers_per_session?: number;
  max_personal_live_journals?: number;
  max_prop_live_journals?: number;
  entitlements_override?: boolean;
};

function PaymentCell({ u, admin }: { u: URow; admin: boolean }) {
  if (admin) return <span className="text-white/35 text-xs">—</span>;
  if (u.has_active_subscription)
    return <Pill ok label={u.subscription_status === "trialing" ? "Trial" : "Paid"} />;
  if (u.has_journal_access)
    return <span className="rounded-full px-2 py-0.5 text-xs bg-amber-500/15 text-amber-200 border border-amber-500/25">Manual</span>;
  return <Pill ok={false} label="No payment" />;
}
type Flag={id:number;name:string;enabled:boolean;description?:string;category?:string};
type Log ={timestamp:string;action:string;details:string};
type Metrics={cpu?:{percent:number};memory?:{used:number;total:number;percent:number};disk?:{used:number;total:number;percent:number};uptime?:{formatted:string}};

const TABS=[
  {id:"overview",label:"Overview",      Icon:BarChart3},
  {id:"users",   label:"Users",          Icon:Users},
  {id:"mentorship",label:"Mentorship",   Icon:GraduationCap},
  {id:"support", label:"Support",        Icon:MessageSquare},
  {id:"flags",   label:"Feature Flags",  Icon:Zap},
  {id:"security",label:"Security Logs",  Icon:Shield},
  {id:"system",  label:"System",         Icon:Server},
] as const;
type Tab=typeof TABS[number]["id"];

export default function AdminDashboard() {
  const [checking,   setChecking]   = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [tab,        setTab]        = useState<Tab>("overview");
  const [loading,    setLoading]    = useState(false);
  const [flash,      setFlash]      = useState<{text:string;ok:boolean}|null>(null);
  const [stats,      setStats]      = useState<Record<string,number>>({});
  const [users,      setUsers]      = useState<URow[]>([]);
  const [flags,      setFlags]      = useState<Flag[]>([]);
  const [logs,       setLogs]       = useState<Log[]>([]);
  const [metrics,    setMetrics]    = useState<Metrics>({});
  const [search,     setSearch]     = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [cEmail,setCEmail]=useState(""); const [cName,setCName]=useState(""); const [cPwd,setCPwd]=useState(""); const [cAdmin,setCAdmin]=useState(false);
  const [editing, setEditing]=useState<URow|null>(null);
  const [eAdmin,  setEAdmin] =useState(false); const [eJournal,setEJournal]=useState(false); const [eActive,setEActive]=useState(true);
  const [eModules, setEModules] = useState<Record<string, boolean>>({});
  const [eMaxSessions, setEMaxSessions] = useState("5");
  const [eMaxTickers, setEMaxTickers] = useState("5");
  const [eMaxSupporting, setEMaxSupporting] = useState("5");
  const [eMaxPersonalJournals, setEMaxPersonalJournals] = useState("5");
  const [eMaxPropJournals, setEMaxPropJournals] = useState("5");

  const msg=(text:string,ok=true)=>{setFlash({text,ok});setTimeout(()=>setFlash(null),3000);};
  const isAdm=(u:URow)=>!!(u.is_admin||u.role==="admin");

  useEffect(()=>{
    (async()=>{
      try{
        const r=await fetch("/api/auth/me",{credentials:"include",cache:"no-store"});
        if(!r.ok){window.location.replace("/login/?next=/dashboard/admin/");return;}
        const d=await r.json().catch(()=>null);
        if(d?.user?.role!=="admin"){window.location.replace("/");return;}
        setAuthorized(true);
      }catch{window.location.replace("/login/?next=/dashboard/admin/");}
      finally{setChecking(false);}
    })();
  },[]);

  const load=useCallback(async()=>{
    if(!authorized)return;
    setLoading(true);
    try{
      const[sR,uR,fR,lR,mR]=await Promise.allSettled([
        fetch("/journal/api/admin/dashboard/enhanced",{headers:jh()}).then(r=>r.json()),
        fetch("/journal/api/admin/users?per_page=1000", {headers:jh()}).then(r=>r.json()),
        fetch("/journal/api/feature-flags",             {headers:jh()}).then(r=>r.json()),
        fetch("/journal/api/admin/logs?limit=100",      {headers:jh()}).then(r=>r.json()),
        fetch("/journal/api/admin/system/metrics",      {headers:jh()}).then(r=>r.json()),
      ]);
      if(sR.status==="fulfilled"){
        const v=sR.value??{};
        setStats({...v,...(typeof v.statistics==="object"&&v.statistics?v.statistics:{})});
      }
      if(uR.status==="fulfilled")setUsers(uR.value?.users??[]);
      if(fR.status==="fulfilled")setFlags(fR.value?.flags??[]);
      if(lR.status==="fulfilled")setLogs(lR.value?.logs??[]);
      if(mR.status==="fulfilled")setMetrics(mR.value??{});
    }finally{setLoading(false);}
  },[authorized]);
  useEffect(()=>{load();},[load]);

  async function createUser(){
    if(!cEmail||!cPwd)return;
    const r=await fetch("/journal/api/admin/users",{method:"POST",headers:jh(),body:JSON.stringify({email:cEmail,full_name:cName,password:cPwd,is_admin:cAdmin,has_journal_access:true})});
    const d=await r.json().catch(()=>null);
    if(r.ok){msg("User created");setShowCreate(false);setCEmail("");setCName("");setCPwd("");setCAdmin(false);load();}else msg(d?.error??"Failed",false);
  }
  async function saveUser(){
    if(!editing)return;
    const grants: Record<string, boolean> = {};
    if (!eJournal) {
      for (const [k, v] of Object.entries(eModules)) {
        if (v) grants[k] = true;
      }
    }
    const r=await fetch(`/journal/api/admin/users/${editing.id}`,{method:"PUT",headers:jh(),body:JSON.stringify({
      is_admin:eAdmin,
      has_journal_access:eJournal,
      is_active:eActive,
      dashboard_module_grants: grants,
      max_trading_sessions: Math.max(0, parseInt(eMaxSessions, 10) || 0),
      max_tickers_per_session: Math.max(0, parseInt(eMaxTickers, 10) || 0),
      max_supporting_tickers_per_session: Math.max(0, parseInt(eMaxSupporting, 10) || 0),
      max_personal_live_journals: Math.max(0, parseInt(eMaxPersonalJournals, 10) || 0),
      max_prop_live_journals: Math.max(0, parseInt(eMaxPropJournals, 10) || 0),
    })});
    if(r.ok){msg("Saved — user should refresh the dashboard or log in again.");setEditing(null);load();}else msg("Failed",false);
  }
  async function deleteUser(id:number){
    if(!confirm("Delete this user permanently?"))return;
    const r=await fetch(`/journal/api/admin/users/${id}`,{method:"DELETE",headers:jh()});
    if(r.ok){msg("Deleted");load();}else msg("Failed",false);
  }
  async function toggleFlag(f:Flag){
    const r=await fetch(`/journal/api/feature-flags/${f.name}`,{method:"PATCH",headers:jh(),body:JSON.stringify({enabled:!f.enabled})});
    if(r.ok)setFlags(p=>p.map(x=>x.id===f.id?{...x,enabled:!x.enabled}:x));else msg("Toggle failed",false);
  }

  if(checking)return <div className="p-8 text-white/50 text-sm">Checking permissions…</div>;
  if(!authorized)return null;

  const filtered=users.filter(u=>u.email?.toLowerCase().includes(search.toLowerCase())||(u.full_name??u.name??"").toLowerCase().includes(search.toLowerCase()));
  const noPaymentCount=users.filter(u=>!isAdm(u)&&!u.has_active_subscription&&!u.has_journal_access).length;

  return (
    <div className="space-y-5">
      {/* header */}
      <div className="rounded-2xl border border-white/10 bg-[#0b0b16]/60 p-5 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="rounded-xl border border-white/10 bg-white/5 p-2.5"><Shield className="h-5 w-5 text-blue-300"/></div>
          <div><h1 className="text-xl font-bold">Admin Dashboard</h1><p className="text-xs text-white/40">Full project control — users · features · security · system</p></div>
        </div>
        <div className="flex items-center gap-2">
          <LanguageToggle className="text-xs px-3 py-1.5" />
          <a href="/dashboard/admin/datasets/" className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs hover:bg-white/10 transition"><Database className="h-3.5 w-3.5"/>Datasets</a>
          <a href="/dashboard/?view=sessions" className="flex items-center gap-1.5 rounded-full border border-blue-500/35 bg-blue-500/10 px-3 py-1.5 text-xs text-blue-200 hover:bg-blue-500/20 transition"><Activity className="h-3.5 w-3.5"/>Trading app</a>
          <button onClick={load} className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs hover:bg-white/10 transition"><RefreshCw className={`h-3.5 w-3.5 ${loading?"animate-spin":""}`}/>Refresh</button>
        </div>
      </div>

      {flash&&<div className={`rounded-xl px-4 py-2.5 text-sm flex items-center gap-2 ${flash.ok?"bg-green-500/15 border border-green-500/30 text-green-300":"bg-red-500/15 border border-red-500/30 text-red-300"}`}>{flash.ok?<CheckCircle className="h-4 w-4"/>:<AlertTriangle className="h-4 w-4"/>}{flash.text}</div>}

      {/* tabs */}
      <div className="flex gap-1.5 flex-wrap">
        {TABS.map(({id,label,Icon})=>(
          <button key={id} onClick={()=>setTab(id)} className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm transition ${tab===id?"bg-blue-500/20 border border-blue-500/40 text-blue-300":"border border-white/10 bg-white/5 text-white/60 hover:bg-white/10"}`}>
            <Icon className="h-3.5 w-3.5"/>{label}
          </button>
        ))}
      </div>

      {/* OVERVIEW */}
      {tab==="overview"&&(
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <Stat label="Users"     value={fmt(stats.total_users)}       color="text-blue-400"/>
            <Stat label="Trades"    value={fmt(stats.total_trades)}      color="text-green-400"/>
            <Stat label="New (30d)" value={fmt(stats.active_users_30d??stats.active_users)}  color="text-cyan-400"/>
            <Stat label="Admins"    value={fmt(stats.admin_users_count??stats.admin_users)} color="text-purple-400"/>
            <Stat label="No payment" value={fmt(stats.users_no_payment??noPaymentCount)} color="text-amber-400"/>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="text-xs font-semibold text-white/40 uppercase tracking-wide mb-3">Latest Users</div>
              {users.slice(0,8).map(u=>(
                <div key={u.id} className="flex items-center justify-between gap-2 py-1.5 border-b border-white/5 last:border-0">
                  <span className="text-sm truncate min-w-0">{u.email}</span>
                  <div className="flex gap-1 flex-shrink-0 items-center flex-wrap justify-end">
                    <PaymentCell u={u} admin={isAdm(u)}/>
                    {isAdm(u)&&<Pill ok label="admin"/>}
                  </div>
                </div>
              ))}
              {!users.length&&<p className="text-white/30 text-sm">No data</p>}
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
              <div className="text-xs font-semibold text-white/40 uppercase tracking-wide mb-1">System Health</div>
              {metrics.cpu&&<div><div className="flex justify-between text-xs"><span className="text-white/50">CPU</span><span>{metrics.cpu.percent.toFixed(1)}%</span></div><Bar pct={metrics.cpu.percent} color="bg-blue-400"/></div>}
              {metrics.memory&&<div><div className="flex justify-between text-xs"><span className="text-white/50">Memory</span><span>{fmtGB(metrics.memory.used)} / {fmtGB(metrics.memory.total)}</span></div><Bar pct={metrics.memory.percent} color="bg-cyan-400"/></div>}
              {metrics.disk&&<div><div className="flex justify-between text-xs"><span className="text-white/50">Disk</span><span>{fmtGB(metrics.disk.used)} / {fmtGB(metrics.disk.total)}</span></div><Bar pct={metrics.disk.percent} color="bg-purple-400"/></div>}
              {metrics.uptime&&<div className="text-xs text-white/30">Uptime: {metrics.uptime.formatted}</div>}
              {!metrics.cpu&&<p className="text-white/30 text-sm">Loading…</p>}
            </div>
          </div>
        </div>
      )}

      {/* USERS */}
      {tab==="users"&&(
        <div className="space-y-3">
          <div className="flex gap-2 flex-wrap">
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search email or name…" className="flex-1 min-w-48 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-blue-400/50"/>
            <button onClick={()=>setShowCreate(true)} className="flex items-center gap-1.5 rounded-xl border border-blue-400/30 bg-blue-500/10 px-4 py-2 text-sm text-blue-300 hover:bg-blue-500/20 transition"><Plus className="h-4 w-4"/>New User</button>
            <a href="/journal/api/admin/users/export?format=csv" download className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/60 hover:bg-white/10 transition"><Download className="h-4 w-4"/>Export CSV</a>
          </div>
          {showCreate&&(
            <div className="rounded-xl border border-white/20 bg-[#0d0f1e] p-5 space-y-3">
              <div className="flex items-center justify-between"><h3 className="font-semibold">Create User</h3><button onClick={()=>setShowCreate(false)}><X className="h-4 w-4 text-white/40 hover:text-white"/></button></div>
              <div className="grid md:grid-cols-2 gap-3">
                <input value={cName}  onChange={e=>setCName(e.target.value)}  placeholder="Full name"  className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"/>
                <input value={cEmail} onChange={e=>setCEmail(e.target.value)} placeholder="Email *"    className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"/>
                <input value={cPwd}   onChange={e=>setCPwd(e.target.value)}   type="password" placeholder="Password *" className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"/>
                <label className="flex items-center gap-2 text-sm text-white/70 px-2"><input type="checkbox" checked={cAdmin} onChange={e=>setCAdmin(e.target.checked)}/> Admin</label>
              </div>
              <button onClick={createUser} className="rounded-xl bg-blue-600 px-6 py-2 text-sm font-medium hover:bg-blue-500 transition">Create</button>
            </div>
          )}
          {editing&&(
            <div className="rounded-xl border border-white/20 bg-[#0d0f1e] p-5 space-y-3">
              <div className="flex items-center justify-between"><h3 className="font-semibold text-sm truncate">Edit — {editing.email}</h3><button onClick={()=>setEditing(null)}><X className="h-4 w-4 text-white/40 hover:text-white"/></button></div>
              <div className="flex flex-wrap gap-5 text-sm text-white/70">
                <label className="flex items-center gap-2"><input type="checkbox" checked={eAdmin}   onChange={e=>setEAdmin(e.target.checked)}/> Admin</label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={eJournal} onChange={e=>{setEJournal(e.target.checked); if(e.target.checked){const all:Record<string,boolean>={};Object.keys(DASHBOARD_MODULE_LABELS).forEach(k=>{all[k]=true});setEModules(all);}}}/> Full access (all sections)</label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={eActive}  onChange={e=>setEActive(e.target.checked)}/> Active</label>
              </div>
              {!eJournal && (
                <div className="mt-3 pt-3 border-t border-white/10">
                  <p className="text-xs text-white/40 mb-2">Partial access — enable only the sections this user should see:</p>
                  <div className="flex flex-wrap gap-3">
                    {Object.entries(DASHBOARD_MODULE_LABELS).map(([key, label]) => (
                      <label key={key} className="flex items-center gap-2 text-xs text-white/70">
                        <input type="checkbox" checked={!!eModules[key]} onChange={ev=>setEModules(p=>({...p,[key]:ev.target.checked}))}/>
                        {label}
                      </label>
                    ))}
                  </div>
                </div>
              )}
              <div className="mt-3 pt-3 border-t border-white/10">
                <p className="text-xs text-white/40 mb-2">Backtest limits (per user):</p>
                <div className="grid sm:grid-cols-3 gap-3">
                  <label className="text-xs text-white/60">
                    Max sessions
                    <input type="number" min={0} max={100} value={eMaxSessions} onChange={e=>setEMaxSessions(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"/>
                  </label>
                  <label className="text-xs text-white/60">
                    Max trading tickers / session
                    <input type="number" min={0} max={100} value={eMaxTickers} onChange={e=>setEMaxTickers(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"/>
                  </label>
                  <label className="text-xs text-white/60">
                    Max supporting tickers / session
                    <input type="number" min={0} max={100} value={eMaxSupporting} onChange={e=>setEMaxSupporting(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"/>
                  </label>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-white/10">
                <p className="text-xs text-white/40 mb-2">Live journal limits (per user):</p>
                <div className="grid sm:grid-cols-2 gap-3">
                  <label className="text-xs text-white/60">
                    Max personal live journals
                    <input type="number" min={0} max={100} value={eMaxPersonalJournals} onChange={e=>setEMaxPersonalJournals(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"/>
                  </label>
                  <label className="text-xs text-white/60">
                    Max prop journals
                    <input type="number" min={0} max={100} value={eMaxPropJournals} onChange={e=>setEMaxPropJournals(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"/>
                  </label>
                </div>
                <p className="text-[11px] text-white/30 mt-2">0 = unlimited. Saving any limit marks this user as custom entitlements (same as backtest caps).</p>
              </div>
              <button onClick={saveUser} className="rounded-xl bg-blue-600 px-6 py-2 text-sm font-medium hover:bg-blue-500 transition">Save Changes</button>
            </div>
          )}
          <div className="rounded-xl border border-white/10 overflow-x-auto">
            <table className="w-full text-sm min-w-[760px]">
              <thead className="bg-white/5 text-white/40 text-xs uppercase tracking-wide">
                <tr>{["ID","Email / Name","Role","Journal","Payment","Backtest limits","Journal limits","Trades","Joined",""].map(h=><th key={h} className={`px-4 py-2.5 ${h?"text-left":"text-right"}`}>{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filtered.map(u=>(
                  <tr key={u.id} className="hover:bg-white/5 transition-colors">
                    <td className="px-4 py-2.5 text-white/30 font-mono text-xs">{u.id}</td>
                    <td className="px-4 py-2.5"><div>{u.email}</div>{(u.full_name??u.name)&&<div className="text-xs text-white/30">{u.full_name??u.name}</div>}</td>
                    <td className="px-4 py-2.5"><Pill ok={isAdm(u)} label={isAdm(u)?"admin":"user"}/></td>
                    <td className="px-4 py-2.5"><Pill ok={!!u.has_journal_access} label={u.has_journal_access?"✓":"✗"}/></td>
                    <td className="px-4 py-2.5 whitespace-nowrap"><PaymentCell u={u} admin={isAdm(u)}/></td>
                    <td className="px-4 py-2.5 text-white/40 text-xs whitespace-nowrap">
                      {isAdm(u) ? "—" : `${u.max_trading_sessions ?? 5} sess · ${u.max_tickers_per_session ?? 5} trd · ${u.max_supporting_tickers_per_session ?? 5} sup`}
                    </td>
                    <td className="px-4 py-2.5 text-white/40 text-xs whitespace-nowrap">
                      {isAdm(u) ? "—" : `${u.max_personal_live_journals ?? 5} personal · ${u.max_prop_live_journals ?? 5} prop${u.entitlements_override ? " *" : ""}`}
                    </td>
                    <td className="px-4 py-2.5 text-white/40">{u.trades_count??"—"}</td>
                    <td className="px-4 py-2.5 text-white/30 text-xs">{u.created_at?new Date(u.created_at).toLocaleDateString():"—"}</td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={()=>{setEditing(u);setEAdmin(isAdm(u));setEJournal(!!u.has_journal_access);setEActive(u.is_active??true);setEModules(u.dashboard_modules??{});setEMaxSessions(String(u.max_trading_sessions??5));setEMaxTickers(String(u.max_tickers_per_session??5));setEMaxSupporting(String(u.max_supporting_tickers_per_session??5));setEMaxPersonalJournals(String(u.max_personal_live_journals??5));setEMaxPropJournals(String(u.max_prop_live_journals??5));}} className="p-1.5 rounded-lg hover:bg-white/10 transition text-white/40 hover:text-white"><Edit className="h-3.5 w-3.5"/></button>
                        <button onClick={()=>deleteUser(u.id)} className="p-1.5 rounded-lg hover:bg-red-500/20 transition text-white/40 hover:text-red-400"><Trash2 className="h-3.5 w-3.5"/></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!filtered.length&&<div className="py-8 text-center text-white/30 text-sm">No users found</div>}
          </div>
          <div className="text-xs text-white/30">{filtered.length} of {users.length} users</div>
        </div>
      )}

      {/* MENTORSHIP */}
      {tab==="mentorship"&&<MentorshipTab msg={msg}/>}

      {/* SUPPORT — full ticket desk lives on chart admin */}
      {tab==="support"&&(
        <div className="rounded-xl border border-white/10 bg-white/5 p-6 space-y-4">
          <h2 className="text-lg font-semibold text-white">Support tickets</h2>
          <p className="text-sm text-white/50 max-w-xl">
            The live ticket inbox (SLA, categories, canned replies, CRM context, export) runs on the chart admin
            dashboard. Open it in a new tab to manage conversations.
          </p>
          <a
            href="/chart/admin-dashboard.html#sec-support"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-5 py-2.5 text-sm font-medium text-emerald-200 hover:bg-emerald-500/20 transition"
          >
            <MessageSquare className="h-4 w-4" />
            Open support inbox
            <ExternalLink className="h-3.5 w-3.5 opacity-70" />
          </a>
        </div>
      )}

      {/* FEATURE FLAGS */}
      {tab==="flags"&&(
        <div className="space-y-2">
          <p className="text-xs text-white/40 mb-3">Toggle journal features for all users. Changes apply immediately.</p>
          {["core","analytics","advanced","admin","test"].map(cat=>{
            const group=flags.filter(f=>f.category===cat);
            if(!group.length)return null;
            return(
              <div key={cat} className="rounded-xl border border-white/10 overflow-hidden">
                <div className="bg-white/5 px-4 py-2 text-xs font-semibold text-white/40 uppercase tracking-wide">{cat}</div>
                {group.map(f=>(
                  <div key={f.id} className="flex items-center justify-between px-4 py-3 border-t border-white/5 hover:bg-white/5 transition">
                    <div><div className="text-sm font-medium">{f.name}</div>{f.description&&<div className="text-xs text-white/30 mt-0.5">{f.description}</div>}</div>
                    <button onClick={()=>toggleFlag(f)} className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${f.enabled?"bg-blue-500":"bg-white/20"}`}>
                      <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${f.enabled?"translate-x-4":"translate-x-1"}`}/>
                    </button>
                  </div>
                ))}
              </div>
            );
          })}
          {!flags.length&&<div className="py-8 text-center text-white/30 text-sm">No feature flags found.</div>}
        </div>
      )}

      {/* SECURITY LOGS */}
      {tab==="security"&&(
        <div className="rounded-xl border border-white/10 overflow-hidden">
          <div className="bg-white/5 px-4 py-2.5 flex items-center justify-between text-xs font-semibold text-white/40 uppercase tracking-wide">
            <span>Security & Admin Logs</span><span className="text-white/30 normal-case">{logs.length} entries</span>
          </div>
          <div className="max-h-[500px] overflow-y-auto divide-y divide-white/5">
            {logs.map((l,i)=>(
              <div key={i} className="px-4 py-2.5 flex items-start gap-3 hover:bg-white/5 transition">
                <span className={`mt-0.5 rounded-full px-2 py-0.5 text-xs font-mono whitespace-nowrap flex-shrink-0 ${l.action?.includes("BLOCK")?"bg-red-500/20 text-red-300":l.action?.includes("LOGIN")||l.action?.includes("AUTH")?"bg-yellow-500/20 text-yellow-300":"bg-white/10 text-white/50"}`}>{l.action}</span>
                <div className="min-w-0"><div className="text-sm truncate">{l.details}</div><div className="text-xs text-white/30">{l.timestamp}</div></div>
              </div>
            ))}
            {!logs.length&&<div className="py-8 text-center text-white/30 text-sm">No logs found.</div>}
          </div>
        </div>
      )}

      {/* SYSTEM */}
      {tab==="system"&&(
        <div className="grid md:grid-cols-2 gap-4">
          <div className="rounded-xl border border-white/10 bg-white/5 p-5 space-y-4">
            <div className="text-xs font-semibold text-white/40 uppercase tracking-wide">Resources</div>
            {metrics.cpu&&<div><div className="flex justify-between text-sm mb-1"><span className="text-white/60">CPU</span><span className="font-mono">{metrics.cpu.percent.toFixed(1)}%</span></div><Bar pct={metrics.cpu.percent} color="bg-blue-400"/></div>}
            {metrics.memory&&<div><div className="flex justify-between text-sm mb-1"><span className="text-white/60">Memory</span><span className="font-mono">{metrics.memory.percent.toFixed(1)}%  ({fmtGB(metrics.memory.used)} / {fmtGB(metrics.memory.total)})</span></div><Bar pct={metrics.memory.percent} color="bg-cyan-400"/></div>}
            {metrics.disk&&<div><div className="flex justify-between text-sm mb-1"><span className="text-white/60">Disk</span><span className="font-mono">{fmtGB(metrics.disk.used)} / {fmtGB(metrics.disk.total)}</span></div><Bar pct={metrics.disk.percent} color="bg-purple-400"/></div>}
            {metrics.uptime&&<div className="text-sm text-white/50">Uptime: <span className="text-white font-mono">{metrics.uptime.formatted}</span></div>}
            {!metrics.cpu&&<p className="text-white/30 text-sm">Loading system metrics…</p>}
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-5 space-y-3">
            <div className="text-xs font-semibold text-white/40 uppercase tracking-wide">Services</div>
            {[
              {label:"Journal Backend", url:"/journal/api/auth/me",    method:"GET"},
              {label:"Chart API",       url:"/api/status",             method:"GET"},
            ].map(s=><ServiceCheck key={s.label} label={s.label} url={s.url}/>)}
            <div className="pt-2 space-y-2 text-xs">
              <div className="text-white/40 font-semibold uppercase tracking-wide">Quick Links</div>
              <a href="/dashboard/admin/datasets/" className="flex items-center gap-2 text-white/60 hover:text-white transition"><Database className="h-3.5 w-3.5"/>Dataset Control (Chart)</a>
              <a href="/dashboard/sessions/"       className="flex items-center gap-2 text-white/60 hover:text-white transition"><Activity className="h-3.5 w-3.5"/>Trading Sessions</a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

type Cohort={id:number;name:string;description?:string;member_count:number;default_modules:Record<string,boolean>;created_at?:string};
type Member={id:number;email:string;full_name?:string;role?:string;is_active?:boolean;has_journal_access?:boolean;dashboard_modules:Record<string,boolean>;access_expires_at?:string|null};
const MODULE_KEYS=Object.keys(DASHBOARD_MODULE_LABELS);

function ModulePicker({value,onToggle}:{value:Record<string,boolean>;onToggle:(k:string,v:boolean)=>void}){
  return(
    <div className="flex flex-wrap gap-3">
      {Object.entries(DASHBOARD_MODULE_LABELS).map(([key,label])=>(
        <label key={key} className="flex items-center gap-2 text-xs text-white/70">
          <input type="checkbox" checked={!!value[key]} onChange={e=>onToggle(key,e.target.checked)}/>
          {label as string}
        </label>
      ))}
    </div>
  );
}

function MentorshipTab({msg}:{msg:(t:string,ok?:boolean)=>void}){
  const [cohorts,setCohorts]=useState<Cohort[]>([]);
  const [selectedId,setSelectedId]=useState<number|null>(null);
  const [members,setMembers]=useState<Member[]>([]);
  const [cohortDefaults,setCohortDefaults]=useState<Record<string,boolean>>({});
  const [busy,setBusy]=useState(false);
  // import form
  const [cohortName,setCohortName]=useState("");
  const [defaultModules,setDefaultModules]=useState<Record<string,boolean>>({backtest:true,journal:true});
  const [expiry,setExpiry]=useState("");
  const [file,setFile]=useState<File|null>(null);

  const modulesToList=(m:Record<string,boolean>)=>MODULE_KEYS.filter(k=>m[k]);

  const loadCohorts=useCallback(async()=>{
    try{
      const r=await fetch("/journal/api/admin/mentorship/cohorts",{headers:jh()});
      const d=await r.json().catch(()=>null);
      if(r.ok)setCohorts(d?.cohorts??[]);
    }catch{/* ignore */}
  },[]);
  useEffect(()=>{loadCohorts();},[loadCohorts]);

  const loadMembers=useCallback(async(id:number)=>{
    setSelectedId(id);
    try{
      const r=await fetch(`/journal/api/admin/mentorship/cohorts/${id}/members`,{headers:jh()});
      const d=await r.json().catch(()=>null);
      if(r.ok){setMembers(d?.members??[]);setCohortDefaults(d?.cohort?.default_modules??{});}
    }catch{msg("Failed to load members",false);}
  },[msg]);

  async function doImport(){
    if(!cohortName.trim()){msg("Cohort name is required",false);return;}
    if(!file){msg("Choose a CSV file",false);return;}
    setBusy(true);
    try{
      const fd=new FormData();
      fd.append("file",file);
      fd.append("cohort_name",cohortName.trim());
      fd.append("default_modules",JSON.stringify(modulesToList(defaultModules)));
      if(expiry)fd.append("access_expires_at",expiry);
      // Don't set Content-Type manually — browser adds the multipart boundary.
      const c=journalCsrfToken();
      const r=await fetch("/journal/api/admin/mentorship/import",{method:"POST",headers:c?{"X-CSRF-TOKEN":c}:{},body:fd});
      const d=await r.json().catch(()=>null);
      if(r.ok){
        msg(`Imported ${d?.imported_count??0}, skipped ${d?.skipped_count??0}${d?.error_count?`, ${d.error_count} errors`:""}`);
        setFile(null);setCohortName("");
        await loadCohorts();
        if(d?.cohort?.id)loadMembers(d.cohort.id);
      }else msg(d?.error??"Import failed",false);
    }catch{msg("Import failed",false);}
    finally{setBusy(false);}
  }

  async function applyCohortModules(){
    if(selectedId==null)return;
    setBusy(true);
    try{
      const r=await fetch(`/journal/api/admin/mentorship/cohorts/${selectedId}/modules`,{method:"PATCH",headers:jh(),body:JSON.stringify({modules:modulesToList(cohortDefaults),apply_to_members:true})});
      const d=await r.json().catch(()=>null);
      if(r.ok){msg(`Applied to ${d?.members_updated??0} member(s) — they should re-login to refresh`);loadMembers(selectedId);loadCohorts();}
      else msg(d?.error??"Failed",false);
    }catch{msg("Failed",false);}
    finally{setBusy(false);}
  }

  async function toggleMember(m:Member,key:string,val:boolean){
    const next={...m.dashboard_modules,[key]:val};
    const grants=MODULE_KEYS.filter(k=>next[k]);
    setMembers(p=>p.map(x=>x.id===m.id?{...x,dashboard_modules:next}:x));
    try{
      const r=await fetch(`/journal/api/admin/users/${m.id}`,{method:"PUT",headers:jh(),body:JSON.stringify({has_journal_access:false,dashboard_module_grants:Object.fromEntries(grants.map(k=>[k,true]))})});
      if(!r.ok)throw new Error();
    }catch{msg("Failed to update member",false);if(selectedId!=null)loadMembers(selectedId);}
  }

  const selected=cohorts.find(c=>c.id===selectedId)||null;

  return(
    <div className="space-y-5">
      <div className="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-4">
        <div className="flex items-center gap-2"><Upload className="h-4 w-4 text-blue-300"/><h2 className="text-sm font-semibold text-white">Import mentorship students</h2></div>
        <div className="grid md:grid-cols-2 gap-3">
          <label className="text-xs text-white/60">Cohort name
            <input value={cohortName} onChange={e=>setCohortName(e.target.value)} placeholder="e.g. March Mentorship" className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"/>
          </label>
          <label className="text-xs text-white/60">Access expires (optional)
            <input type="date" value={expiry} onChange={e=>setExpiry(e.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"/>
          </label>
        </div>
        <div>
          <p className="text-xs text-white/40 mb-2">Default sections these students can see (per-row `modules` column in the CSV overrides this):</p>
          <ModulePicker value={defaultModules} onToggle={(k,v)=>setDefaultModules(p=>({...p,[k]:v}))}/>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <input type="file" accept=".csv,.xlsx,.xls" onChange={e=>setFile(e.target.files?.[0]??null)} className="text-xs text-white/60 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-500/20 file:px-3 file:py-1.5 file:text-blue-200 file:text-xs"/>
          <button disabled={busy} onClick={doImport} className="flex items-center gap-1.5 rounded-xl border border-blue-400/30 bg-blue-500/10 px-4 py-2 text-sm text-blue-300 hover:bg-blue-500/20 transition disabled:opacity-40"><Upload className="h-4 w-4"/>Import</button>
          <a href="/journal/api/admin/mentorship/download-template" download className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/60 hover:bg-white/10 transition"><Download className="h-4 w-4"/>Template</a>
        </div>
        <p className="text-[11px] text-white/30">CSV columns: email, password, full_name, phone, country, modules. Passwords must be 8+ chars. Existing emails are skipped.</p>
      </div>

      <div className="grid lg:grid-cols-[260px_1fr] gap-4">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-3 space-y-1">
          <div className="text-xs font-semibold text-white/40 uppercase tracking-wide px-2 py-1">Cohorts</div>
          {cohorts.map(c=>(
            <button key={c.id} onClick={()=>loadMembers(c.id)} className={`w-full text-left rounded-lg px-3 py-2 text-sm transition ${selectedId===c.id?"bg-blue-500/20 text-blue-200":"text-white/70 hover:bg-white/5"}`}>
              <div className="truncate">{c.name}</div>
              <div className="text-[11px] text-white/30">{c.member_count} member{c.member_count===1?"":"s"}</div>
            </button>
          ))}
          {!cohorts.length&&<p className="px-2 py-2 text-xs text-white/30">No cohorts yet. Import students to create one.</p>}
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-4">
          {!selected&&<p className="text-sm text-white/30 py-8 text-center">Select a cohort to view its roster.</p>}
          {selected&&(
            <>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div><h3 className="text-sm font-semibold text-white">{selected.name}</h3><p className="text-xs text-white/30">{members.length} member{members.length===1?"":"s"}</p></div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-3 space-y-2">
                <p className="text-xs text-white/40">Cohort default sections — apply to every member at once:</p>
                <ModulePicker value={cohortDefaults} onToggle={(k,v)=>setCohortDefaults(p=>({...p,[k]:v}))}/>
                <button disabled={busy} onClick={applyCohortModules} className="rounded-lg border border-amber-400/30 bg-amber-500/10 px-4 py-1.5 text-xs text-amber-200 hover:bg-amber-500/20 transition disabled:opacity-40">Apply to all members</button>
              </div>
              <div className="rounded-xl border border-white/10 overflow-x-auto">
                <table className="w-full text-sm min-w-[640px]">
                  <thead className="bg-white/5 text-white/40 text-xs uppercase tracking-wide">
                    <tr><th className="px-3 py-2 text-left">Student</th>{MODULE_KEYS.map(k=><th key={k} className="px-2 py-2 text-center">{(DASHBOARD_MODULE_LABELS as Record<string,string>)[k]}</th>)}</tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {members.map(m=>(
                      <tr key={m.id} className="hover:bg-white/5 transition">
                        <td className="px-3 py-2"><div className="truncate max-w-[220px]">{m.email}</div>{m.full_name&&<div className="text-[11px] text-white/30">{m.full_name}</div>}{m.has_journal_access&&<span className="text-[10px] text-amber-300">full access</span>}</td>
                        {MODULE_KEYS.map(k=>(
                          <td key={k} className="px-2 py-2 text-center">
                            <input type="checkbox" disabled={m.has_journal_access||m.role==="admin"} checked={!!m.dashboard_modules[k]} onChange={e=>toggleMember(m,k,e.target.checked)}/>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!members.length&&<div className="py-6 text-center text-white/30 text-sm">No members in this cohort.</div>}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ServiceCheck({label,url}:{label:string;url:string}){
  const[status,setStatus]=React.useState<"checking"|"up"|"down">("checking");
  useEffect(()=>{
    fetch(url,{credentials:"include"}).then(r=>setStatus(r.ok?"up":"down")).catch(()=>setStatus("down"));
  },[url]);
  return(
    <div className="flex items-center justify-between text-sm">
      <span className="text-white/70">{label}</span>
      <span className={`flex items-center gap-1.5 text-xs font-mono ${status==="up"?"text-green-400":status==="down"?"text-red-400":"text-white/30"}`}>
        <span className={`inline-block h-2 w-2 rounded-full ${status==="up"?"bg-green-400":status==="down"?"bg-red-400":"bg-white/20"}`}/>
        {status==="checking"?"…":status}
      </span>
    </div>
  );
}
