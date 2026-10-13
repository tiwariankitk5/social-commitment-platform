import { useEffect, useMemo, useState } from 'react'
import {
  Activity as ActivityIcon, AlertTriangle, ArrowDownRight, ArrowRight, Bell,
  CalendarDays, CheckCircle2, ChevronRight, CircleDot, Clock3, GitBranch,
  LayoutDashboard, ListChecks, Plus, RefreshCw, ShieldCheck, Users, X,
  ClipboardList, Search, Check, XCircle, UserRound
} from 'lucide-react'
import api from './api'

const fmtDate = v => v ? new Date(v + (String(v).length === 10 ? 'T12:00:00' : '')).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'}) : 'No deadline'
const initials = s => (s || '?').split(/\s+/).map(x=>x[0]).join('').slice(0,2).toUpperCase()
const statusLabel = s => ({PROPOSED:'Proposed', ACCEPTED:'Accepted', IN_PROGRESS:'In progress', COMPLETED:'Completed', OVERDUE:'Overdue', CANCELLED:'Cancelled', REPLACEMENT_REQUESTED:'Replacement requested', REASSIGNED:'Reassigned', BLOCKED:'Blocked', AT_RISK:'At risk'}[s] || s || 'Unknown')
const statusClass = s => (s || '').toLowerCase().replaceAll('_','-')

function App() {
  const [page,setPage] = useState('Dashboard')
  const [plans,setPlans] = useState([])
  const [selected,setSelected] = useState(null)
  const [commitments,setCommitments] = useState([])
  const [planCommitments,setPlanCommitments] = useState([])
  const [dashboard,setDashboard] = useState({plans:0,commitments:0,completed:0,overdue:0,affected:0,pendingReplacements:0})
  const [activity,setActivity] = useState([])
  const [notifications,setNotifications] = useState([])
  const [dependencies,setDependencies] = useState([])
  const [replacements,setReplacements] = useState([])
  const [impact,setImpact] = useState(null)
  const [loading,setLoading] = useState(true)
  const [error,setError] = useState('')
  const [query,setQuery] = useState('')
  const [modal,setModal] = useState('')
  const [busy,setBusy] = useState(false)
  const [planForm,setPlanForm] = useState({title:'',description:'',category:'Trip',organizer:'Aman',startDate:'',endDate:''})
  const [commitForm,setCommitForm] = useState({title:'',description:'',owner:'Aman',deadline:'',priority:'MEDIUM'})
  const [depForm,setDepForm] = useState({prerequisiteId:'',dependentId:''})
  const [replaceForm,setReplaceForm] = useState({requester:'Aman',reason:'Unable to complete this commitment.'})
  const [selectedCommitment,setSelectedCommitment] = useState(null)

  async function loadAll() {
    setLoading(true); setError('')
    try {
      const [p,d,n,r,c,a] = await Promise.all([api.get('/plans'),api.get('/dashboard'),api.get('/notifications'),api.get('/replacements'),api.get('/commitments'),api.get('/activity')])
      setPlans(p.data); setDashboard(d.data); setNotifications(n.data); setReplacements(r.data); setCommitments(c.data); setActivity(a.data)
      if (selected && page!=='Activity') await loadPlan(selected.id)
      else if (p.data.length) await loadPlan(p.data[0].id)
    } catch (e) {
      setError(e.response?.data?.error || 'Cannot connect to the backend. Start the Spring Boot API and PostgreSQL, then retry.')
    } finally { setLoading(false) }
  }
  async function loadPlan(id) {
    try {
      const [p,c,a,deps] = await Promise.all([
        api.get(`/plans/${id}`), api.get(`/plans/${id}/commitments`), api.get(`/plans/${id}/activity`), api.get(`/plans/${id}/dependencies`)
      ])
      setSelected(p.data); setPlanCommitments(c.data); setActivity(a.data); setDependencies(deps.data)
    } catch(e) { setError(e.response?.data?.error || 'Could not load this plan.') }
  }
  useEffect(()=>{ loadAll() },[])
  useEffect(()=>{ if(page==='Dashboard' || page==='Plans' || page==='Commitments' || page==='Notifications' || page==='Activity') loadAll() },[page])

  const filteredPlans = useMemo(()=>plans.filter(p => `${p.title} ${p.category} ${p.organizer}`.toLowerCase().includes(query.toLowerCase())),[plans,query])
  const activeCommitments = commitments.filter(c=>!['COMPLETED','CANCELLED'].includes(c.status)).length
  const completedPct = commitments.length ? Math.round(commitments.filter(c=>c.status==='COMPLETED').length/commitments.length*100) : 0
  const byId = id => commitments.find(c=>c.id===Number(id))
  const doAction = async fn => { setBusy(true); setError(''); try { await fn(); await loadAll(); if(selected) await loadPlan(selected.id); setModal('') } catch(e) { setError(e.response?.data?.error || e.response?.data?.message || 'Action failed. Please check the fields and try again.') } finally { setBusy(false) } }

  async function createPlan(e) {
    e.preventDefault()
    let createdPlan
    await doAction(async()=>{ const r=await api.post('/plans',planForm); createdPlan=r.data; setPlanForm({title:'',description:'',category:'Trip',organizer:'Aman',startDate:'',endDate:''}) })
    if (createdPlan) { await openPlan(createdPlan); setPage('Plan Workspace') }
  }
  async function createCommitment(e) {
    e.preventDefault()
    if(!selected) return
    await doAction(async()=>{ await api.post(`/plans/${selected.id}/commitments`,commitForm); setCommitForm({title:'',description:'',owner:'Aman',deadline:'',priority:'MEDIUM'}) })
  }
  async function addDependency(e) {
    e.preventDefault()
    await doAction(async()=>{ await api.post('/dependencies',{prerequisiteId:Number(depForm.prerequisiteId),dependentId:Number(depForm.dependentId)}) })
  }
  async function changeStatus(c,status) {
    await doAction(async()=>{ await api.patch(`/commitments/${c.id}/status`,{status,actor:'Demo User',reason:'Updated during prototype demonstration'}) })
  }
  async function cancelAndImpact(c) {
    await doAction(async()=>{ await api.patch(`/commitments/${c.id}/status`,{status:'CANCELLED',actor:'Demo Organizer',reason:'Demonstration of dependency impact'}) })
    const r = await api.get(`/commitments/${c.id}/impact`)
    setImpact(r.data)
    setModal('impact')
  }
  async function requestReplacement(e) {
    e.preventDefault()
    await doAction(async()=>{ await api.post('/replacements',{commitmentId:selectedCommitment.id,...replaceForm}) })
  }
  async function decideReplacement(r,decision) {
    const owner = decision==='APPROVE' ? window.prompt('New owner name?','Neha') : ''
    if(decision==='APPROVE' && !owner) return
    await doAction(async()=>{ await api.patch(`/replacements/${r.id}`,{reviewer:'Demo Organizer',decision,newOwner:owner}) })
  }
  async function markRead(n) { await doAction(async()=>{ await api.patch(`/notifications/${n.id}/read`) }) }

  const nav = [
    {label:'Dashboard',icon:LayoutDashboard},
    {label:'Plans',icon:CalendarDays},
    {label:'Commitments',icon:ListChecks},
    {label:'Dependencies',icon:GitBranch},
    {label:'Notifications',icon:Bell,badge:notifications.filter(n=>!n.read).length},
    {label:'Activity',icon:ActivityIcon}
  ]
  const openPlan = async p => { await loadPlan(p.id); setPage('Plan Workspace') }
  const titleForPage = page==='Plan Workspace' ? selected?.title || 'Plan Workspace' : page
  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><ShieldCheck size={21}/></div><div><strong>Commitment</strong><span>PLATFORM</span></div></div>
      <div className="workspace-label">WORKSPACE</div>
      <nav>{nav.map(n=><button key={n.label} className={`nav-item ${page===n.label?'active':''}`} onClick={()=>setPage(n.label)}><n.icon size={18}/><span>{n.label}</span>{n.badge>0&&<b className="nav-badge">{n.badge}</b>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="profile-mini"><div className="avatar">AK</div><div><strong>Aman Kumar</strong><span>Demo organizer</span></div><ChevronRight size={15}/></div><div className="build-tag"><span className="pulse"></span> Prototype environment</div></div>
    </aside>
    <main className="main">
      <header className="topbar"><div className="crumb">Workspace <ChevronRight size={14}/> <strong>{titleForPage}</strong></div><div className="top-actions"><div className="env-pill"><span className="pulse"></span> Demo mode</div><button className="icon-btn" title="Refresh data" onClick={loadAll}><RefreshCw size={17}/></button><button className="icon-btn notification-btn" title="Notifications" onClick={()=>setPage('Notifications')}><Bell size={18}/>{notifications.some(n=>!n.read)&&<i/>}</button><div className="avatar small">AK</div></div></header>
      <section className="content">
        {error&&<div className="alert"><AlertTriangle size={17}/><span>{error}</span><button onClick={()=>setError('')}><X size={15}/></button></div>}
        {loading&&<div className="loading"><span className="spinner"/> Loading workspace…</div>}
        {!loading&&page==='Dashboard'&&<DashboardPage dashboard={dashboard} plans={plans} commitments={commitments} onPlan={openPlan} onCreate={()=>setModal('plan')} onPage={setPage}/>}
        {!loading&&page==='Plans'&&<div className="page-stack"><PageHeading eyebrow="YOUR WORKSPACE" title="Plans" subtitle="Coordinate people, responsibilities, and deadlines." action={<button className="primary-btn" onClick={()=>setModal('plan')}><Plus size={16}/> Create plan</button>}/><div className="toolbar"><div className="search-box"><Search size={16}/><input placeholder="Search plans…" value={query} onChange={e=>setQuery(e.target.value)}/></div><span className="muted">{filteredPlans.length} plans</span></div><div className="plan-grid">{filteredPlans.map(p=><PlanCard key={p.id} plan={p} onClick={()=>openPlan(p)} commitments={commitments}/>)}</div>{!filteredPlans.length&&<Empty title="No plans found" detail="Create a plan to start turning promises into trackable commitments."/>}</div>}
        {!loading&&page==='Plan Workspace'&&selected&&<PlanWorkspace plan={selected} commitments={planCommitments} dependencies={dependencies} activity={activity} onAdd={()=>setModal('commitment')} onAddDep={()=>setModal('dependency')} onStatus={changeStatus} onCancel={cancelAndImpact} onReplace={c=>{setSelectedCommitment(c);setModal('replacement')}} onShowImpact={async c=>{const r=await api.get(`/commitments/${c.id}/impact`);setImpact(r.data);setModal('impact')}}/>}
        {!loading&&page==='Commitments'&&<div className="page-stack"><PageHeading eyebrow="ALL RESPONSIBILITIES" title="Commitments" subtitle="Track ownership, deadlines, and status across your workspace."/><CommitmentTable commitments={commitments} onStatus={changeStatus} onCancel={cancelAndImpact} onReplace={c=>{setSelectedCommitment(c);setModal('replacement')}}/></div>}
        {!loading&&page==='Dependencies'&&selected&&<div className="page-stack"><PageHeading eyebrow="COMMITMENT GRAPH" title="Dependencies" subtitle="Understand prerequisites and downstream impact."/><PlanWorkspace plan={selected} commitments={planCommitments} dependencies={dependencies} activity={activity} onAdd={()=>setModal('commitment')} onAddDep={()=>setModal('dependency')} onStatus={changeStatus} onCancel={cancelAndImpact} onReplace={c=>{setSelectedCommitment(c);setModal('replacement')}} onShowImpact={async c=>{const r=await api.get(`/commitments/${c.id}/impact`);setImpact(r.data);setModal('impact')}} compact/></div>}
        {!loading&&page==='Notifications'&&<div className="page-stack"><PageHeading eyebrow="UPDATES" title="Notifications" subtitle="Important changes that need attention."/><div className="list-panel">{notifications.map(n=><div className={`notification-row ${n.read?'read':''}`} key={n.id}><div className="notification-symbol"><Bell size={17}/></div><div className="notification-body"><strong>{n.title}</strong><p>{n.message}</p><span>{fmtDate(n.createdAt?.slice(0,10))}</span></div>{!n.read&&<button className="secondary-btn small-btn" onClick={()=>markRead(n)}>Mark read</button>}</div>)}{!notifications.length&&<Empty title="You're all caught up" detail="Notifications appear when commitments change or deadlines need attention."/>}</div></div>}
        {!loading&&page==='Activity'&&<div className="page-stack"><PageHeading eyebrow="AUDIT TRAIL" title="Activity history" subtitle="A chronological record of important plan changes."/><ActivityList activity={activity} empty={!activity.length}/></div>}
      </section>
    </main>
    {modal&&<Modal title={{plan:'Create a plan',commitment:'Add commitment',dependency:'Connect commitments',replacement:'Request replacement',impact:'Dependency impact'}[modal]||'Details'} onClose={()=>setModal('')}>
      {modal==='plan'&&<form className="form-grid" onSubmit={createPlan}><Field label="Plan title" required><input required value={planForm.title} onChange={e=>setPlanForm({...planForm,title:e.target.value})} placeholder="e.g. Manali Group Trip"/></Field><Field label="Category"><select value={planForm.category} onChange={e=>setPlanForm({...planForm,category:e.target.value})}>{['Trip','College Project','Hackathon','Sports','Event','Volunteer','Other'].map(x=><option key={x}>{x}</option>)}</select></Field><Field label="Organizer"><input value={planForm.organizer} onChange={e=>setPlanForm({...planForm,organizer:e.target.value})}/></Field><Field label="Start date"><input type="date" value={planForm.startDate} onChange={e=>setPlanForm({...planForm,startDate:e.target.value})}/></Field><Field label="End date"><input type="date" value={planForm.endDate} onChange={e=>setPlanForm({...planForm,endDate:e.target.value})}/></Field><Field label="Description" wide><textarea rows="3" value={planForm.description} onChange={e=>setPlanForm({...planForm,description:e.target.value})} placeholder="What is this group planning?"/></Field><div className="form-footer"><button type="button" className="secondary-btn" onClick={()=>setModal('')}>Cancel</button><button className="primary-btn" disabled={busy}>{busy?'Creating…':'Create plan'}</button></div></form>}
      {modal==='commitment'&&<form className="form-grid" onSubmit={createCommitment}><Field label="Commitment title" required><input required value={commitForm.title} onChange={e=>setCommitForm({...commitForm,title:e.target.value})} placeholder="Book transportation"/></Field><Field label="Owner" required><input required value={commitForm.owner} onChange={e=>setCommitForm({...commitForm,owner:e.target.value})}/></Field><Field label="Deadline"><input type="date" value={commitForm.deadline} onChange={e=>setCommitForm({...commitForm,deadline:e.target.value})}/></Field><Field label="Priority"><select value={commitForm.priority} onChange={e=>setCommitForm({...commitForm,priority:e.target.value})}>{['LOW','MEDIUM','HIGH','CRITICAL'].map(x=><option key={x} value={x}>{x}</option>)}</select></Field><Field label="Description" wide><textarea rows="3" value={commitForm.description} onChange={e=>setCommitForm({...commitForm,description:e.target.value})}/></Field><div className="form-footer"><button type="button" className="secondary-btn" onClick={()=>setModal('')}>Cancel</button><button className="primary-btn" disabled={busy||!selected}>Add commitment</button></div></form>}
      {modal==='dependency'&&<form className="form-grid" onSubmit={addDependency}><Field label="Prerequisite" wide required><select required value={depForm.prerequisiteId} onChange={e=>setDepForm({...depForm,prerequisiteId:e.target.value})}><option value="">Choose prerequisite…</option>{commitments.map(c=><option key={c.id} value={c.id}>{c.title}</option>)}</select></Field><div className="relation-arrow"><ArrowDownRight size={18}/> must be completed before</div><Field label="Dependent commitment" wide required><select required value={depForm.dependentId} onChange={e=>setDepForm({...depForm,dependentId:e.target.value})}><option value="">Choose dependent…</option>{commitments.map(c=><option key={c.id} value={c.id}>{c.title}</option>)}</select></Field><p className="form-help">Dependencies must connect commitments in the same plan. Cycles are rejected.</p><div className="form-footer"><button type="button" className="secondary-btn" onClick={()=>setModal('')}>Cancel</button><button className="primary-btn" disabled={busy}>Create dependency</button></div></form>}
      {modal==='replacement'&&selectedCommitment&&<form className="form-grid" onSubmit={requestReplacement}><div className="context-box" ><strong>{selectedCommitment.title}</strong><span>Currently assigned to {selectedCommitment.owner}</span></div><Field label="Requester" required><input required value={replaceForm.requester} onChange={e=>setReplaceForm({...replaceForm,requester:e.target.value})}/></Field><Field label="Reason" wide required><textarea required rows="3" value={replaceForm.reason} onChange={e=>setReplaceForm({...replaceForm,reason:e.target.value})}/></Field><div className="form-footer"><button type="button" className="secondary-btn" onClick={()=>setModal('')}>Cancel</button><button className="primary-btn" disabled={busy}>Submit request</button></div></form>}
      {modal==='impact'&&impact&&<div className="impact-modal"><div className="impact-source"><span className="eyebrow">SOURCE COMMITMENT</span><strong>{impact.source?.title}</strong><StatusBadge status={impact.source?.status}/></div><div className="impact-summary"><AlertTriangle size={18}/><span>{impact.summary}</span></div>{impact.affected?.map((c,i)=><div className="impact-item" key={c.id}><div className="impact-step">{i+1}</div><div className="impact-text"><strong>{c.title}</strong><span>{c.owner} · {c.impactReason||'Downstream commitment'}</span></div><StatusBadge status={c.status}/></div>)}{!impact.count&&<Empty title="No downstream commitments" detail="This commitment has no dependent items."/>}<div className="form-footer"><button className="primary-btn" onClick={()=>setModal('')}>Done</button></div></div>}
    </Modal>}
  </div>
}

function DashboardPage({dashboard,plans,commitments,onPlan,onCreate,onPage}) {
  const recent=plans.slice(0,3)
  return <div className="page-stack">
    <div className="welcome-row"><div><div className="eyebrow">TUESDAY, YOUR WORKSPACE</div><h1>Good to see you, Aman <span>👋</span></h1><p>Make group plans clearer. Turn promises into commitments.</p></div><button className="primary-btn" onClick={onCreate}><Plus size={16}/> Create plan</button></div>
    <div className="metric-grid"><Metric icon={CalendarDays} label="Active plans" value={dashboard.plans} tone="blue" note="Across your workspace"/><Metric icon={ListChecks} label="Total commitments" value={dashboard.commitments} tone="violet" note="Assigned responsibilities"/><Metric icon={CheckCircle2} label="Completed" value={dashboard.completed} tone="green" note="Successfully fulfilled"/><Metric icon={AlertTriangle} label="Overdue / affected" value={Number(dashboard.overdue)+Number(dashboard.affected)} tone="amber" note={`${dashboard.affected} dependency risks`}/></div>
    <div className="dashboard-columns"><div className="panel"><div className="panel-heading"><div><h2>Recent plans</h2><p>Pick up where your group left off.</p></div><button className="text-btn" onClick={()=>onPage('Plans')}>View all <ArrowRight size={14}/></button></div>{recent.map(p=><PlanRow key={p.id} plan={p} onClick={()=>onPlan(p)}/>)}{!recent.length&&<Empty title="Start with a plan" detail="Create a plan to give your group a shared place for commitments."/>}</div><div className="panel focus-panel"><div className="focus-icon"><ShieldCheck size={21}/></div><h2>Accountability, made visible.</h2><p>When a commitment changes, understand what else might be affected and who needs to act.</p><div className="focus-stat"><div><span>Awaiting replacement</span><strong>{dashboard.pendingReplacements}</strong></div><ChevronRight size={17}/></div><button className="secondary-btn full" onClick={()=>onPage('Dependencies')}>Explore dependencies <ArrowRight size={15}/></button></div></div>
    <div className="panel"><div className="panel-heading"><div><h2>Commitment overview</h2><p>Latest responsibilities across the workspace.</p></div><button className="text-btn" onClick={()=>onPage('Commitments')}>All commitments <ArrowRight size={14}/></button></div><CommitmentTable commitments={commitments.slice(0,5)} compact/></div>
  </div>
}

function Metric({icon:Icon,label,value,tone,note}) { return <div className="metric-card"><div className={`metric-icon ${tone}`}><Icon size={19}/></div><div className="metric-label">{label}</div><div className="metric-value">{value}</div><div className="metric-note">{note}</div></div> }
function PageHeading({eyebrow,title,subtitle,action}) { return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{subtitle}</p></div>{action}</div> }
function PlanCard({plan,onClick}) { return <button className="plan-card" onClick={onClick}><div className="plan-card-top"><div className="plan-icon"><CalendarDays size={19}/></div><span className="plan-category">{plan.category}</span></div><h3>{plan.title}</h3><p>{plan.description||'A shared plan with trackable commitments and clear ownership.'}</p><div className="plan-card-bottom"><div className="avatar-stack"><span>{initials(plan.organizer)}</span><span>SC</span></div><span>{plan.organizer||'Organizer'}</span><ChevronRight size={16}/></div></button> }
function PlanRow({plan,onClick}) { return <button className="plan-row" onClick={onClick}><div className="plan-icon"><CalendarDays size={18}/></div><div className="plan-row-main"><strong>{plan.title}</strong><span>{plan.category} · {plan.organizer||'Organizer'}</span></div><span className="status-badge active">{plan.status||'ACTIVE'}</span><ChevronRight size={17}/></button> }
function StatusBadge({status}) { return <span className={`status-badge ${statusClass(status)}`}>{statusLabel(status)}</span> }
function CommitmentTable({commitments,onStatus,onCancel,onReplace,compact=false}) {
  if(!commitments?.length) return <Empty title="No commitments yet" detail="Add responsibilities to a plan and assign an owner and deadline."/>
  return <div className="table-wrap"><table><thead><tr><th>Commitment</th><th>Owner</th><th>Deadline</th><th>Status</th>{!compact&&<th>Actions</th>}</tr></thead><tbody>{commitments.map(c=><tr key={c.id}><td><div className="commitment-name"><span className={`priority-dot ${String(c.priority).toLowerCase()}`}></span><div><strong>{c.title}</strong><span>{c.affected?'Dependency impact detected':c.description||'No description'}</span></div></div></td><td><div className="owner-cell"><span className="avatar tiny">{initials(c.owner)}</span>{c.owner}</div></td><td><span className={c.status==='OVERDUE'?'date-overdue':''}>{fmtDate(c.deadline)}</span></td><td><StatusBadge status={c.status}/></td>{!compact&&<td><div className="row-actions"><select aria-label="Update status" value={c.status} onChange={e=>onStatus(c,e.target.value)}><option value={c.status}>{statusLabel(c.status)}</option>{['ACCEPTED','IN_PROGRESS','COMPLETED','OVERDUE','CANCELLED'].filter(s=>s!==c.status).map(s=><option key={s} value={s}>{statusLabel(s)}</option>)}</select>{onCancel&&<button className="mini-icon danger" title="Cancel and show impact" onClick={()=>onCancel(c)}><AlertTriangle size={15}/></button>}{onReplace&&<button className="mini-icon" title="Request replacement" onClick={()=>onReplace(c)}><Users size={15}/></button>}</div></td>}</tr>)}</tbody></table></div>
}
function PlanWorkspace({plan,commitments,dependencies,activity,onAdd,onAddDep,onStatus,onCancel,onReplace,onShowImpact,compact=false}) {
  if(!plan) return <Empty title="Select or create a plan" detail="Choose a plan to inspect its commitments and dependencies."/>
  const nameById=id=>commitments.find(c=>c.id===id)?.title||`Commitment #${id}`
  return <div className="page-stack"><PageHeading eyebrow={`${plan.category||'PLAN'} · ${plan.status||'ACTIVE'}`} title={plan.title} subtitle={plan.description||'A shared space for plans, responsibilities, and accountability.'} action={<button className="primary-btn" onClick={onAdd}><Plus size={16}/> Add commitment</button>}/><div className="plan-overview-strip"><div><span>Organizer</span><strong>{plan.organizer||'Organizer'}</strong></div><div><span>Start date</span><strong>{fmtDate(plan.startDate)}</strong></div><div><span>End date</span><strong>{fmtDate(plan.endDate)}</strong></div><div><span>Commitments</span><strong>{commitments.length}</strong></div><div><span>Completion</span><strong>{commitments.length?Math.round(commitments.filter(c=>c.status==='COMPLETED').length/commitments.length*100):0}%</strong></div></div><div className="panel"><div className="panel-heading"><div><h2>Commitments</h2><p>Who owns what, and what needs attention.</p></div><button className="secondary-btn" onClick={onAddDep}><GitBranch size={15}/> Connect dependency</button></div><CommitmentTable commitments={commitments} onStatus={onStatus} onCancel={onCancel} onReplace={onReplace}/></div><div className="panel"><div className="panel-heading"><div><h2>Dependency map</h2><p>Prerequisites and downstream responsibilities.</p></div><GitBranch size={18}/></div>{dependencies.length?<div className="dependency-list">{dependencies.map(d=><div className="dependency-row" key={d.id}><div className="dependency-node"><CircleDot size={16}/><span>{nameById(d.prerequisiteId)}</span></div><div className="dependency-connector"><ArrowRight size={17}/><span>must happen before</span></div><div className="dependency-node"><CircleDot size={16}/><span>{nameById(d.dependentId)}</span></div><button className="mini-icon" title="Analyze impact" onClick={()=>onShowImpact?.(byIdLocal(commitments,d.prerequisiteId))}><ArrowDownRight size={16}/></button></div>)}</div>:<Empty title="No dependencies yet" detail="Connect two commitments to define what must happen first."/>}</div>{!compact&&<div className="panel"><div className="panel-heading"><div><h2>Recent activity</h2><p>Changes recorded for this plan.</p></div><ActivityIcon size={18}/></div><ActivityList activity={activity} empty={!activity.length}/></div>}</div>
}
function byIdLocal(items,id){return items.find(c=>c.id===id)}
function ActivityList({activity,empty}) { return empty?<Empty title="No activity yet" detail="Plan and commitment changes will appear here."/>:<div className="activity-list">{activity.map(a=><div className="activity-row" key={a.id}><div className="activity-dot"><ActivityIcon size={14}/></div><div className="activity-content"><strong>{(a.action||'ACTIVITY').replaceAll('_',' ')}</strong><p>{a.details}</p><span>{a.actor||'System'} · {a.createdAt?new Date(a.createdAt).toLocaleString('en-IN'):'Just now'}</span></div></div>)}</div> }
function Empty({title,detail}) { return <div className="empty-state"><div className="empty-icon"><ClipboardList size={20}/></div><strong>{title}</strong><p>{detail}</p></div> }
function Field({label,children,wide,required}) { return <label className={`field ${wide?'wide':''}`}><span>{label}{required&&<b> *</b>}</span>{children}</label> }
function Modal({title,children,onClose}) { return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}><div className="modal"><div className="modal-heading"><h2>{title}</h2><button className="icon-btn" onClick={onClose}><X size={18}/></button></div>{children}</div></div> }

export default App
