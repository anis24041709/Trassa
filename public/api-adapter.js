/* status badges – extend global map from index.html (avoid const redeclare) */
(function(){
  const extra={draft:'grey',new:'amber',progress:'amber',awarded:'green',cancelled:'red',pending:'amber',accepted:'green',declined:'red',withdrawn:'grey',planned:'amber',underway:'amber',done:'green',paid:'green',open:'blue'};
  if(typeof statusClass==='object' && statusClass){
    Object.assign(statusClass, extra);
  } else {
    window.statusClass = extra;
  }
})();
/* TRASSA production client adapter: replaces demo/local state with the REST API. */
const TRASSA_API = '/api';
let trassaUser = null;
let trassaCsrf = null;
let trassaConversations = [];
let trassaMessages = [];
let trassaDocs = [];
let trassaRequests = [];
let trassaOffers = [];
let trassaCurrentConversation = null;

async function api(path, options={}) {
  const method=(options.method||'GET').toUpperCase();
  if(method!=='GET' && !trassaCsrf){ try { const c=await fetch(TRASSA_API+'/csrf',{credentials:'same-origin'}); trassaCsrf=(await c.json()).csrfToken; } catch(e){} }
  const headers={ ...(options.body instanceof FormData ? {} : {'Content-Type':'application/json'}), ...(options.headers||{}) };
  if(method!=='GET' && trassaCsrf) headers['x-csrf-token']=trassaCsrf;
  const res=await fetch(TRASSA_API + path, { credentials:'same-origin', ...options, headers });
  if(res.status === 204) return null;
  const data=await res.json().catch(()=>({}));
  if(!res.ok) throw new Error(data.error || 'Serverfehler');
  return data;
}

function apiToast(msg){ showToast(msg); }
function setLoadingButton(form, loading){ const b=form?.querySelector('button[type=submit]'); if(b){b.disabled=loading;b.dataset.old=b.dataset.old||b.textContent;if(loading)b.textContent='…';else b.textContent=b.dataset.old;} }

function showAuthMessage(mode, text, isError){
  const el=document.getElementById('msg-'+mode);
  if(!el){ if(text) alert(text); return; }
  el.textContent=text||'';
  el.classList.toggle('show', !!text);
  el.style.color=isError?'#b42318':'#0f6b4c';
  el.style.background=isError?'#fef3f2':'#ecfdf3';
  el.style.border=isError?'1px solid #fecdca':'1px solid #a7f3d0';
}

async function submitAuth(event, mode){
  event.preventDefault();
  const form=event.target;
  setLoadingButton(form,true);
  showAuthMessage(mode,'');
  try{
    if(!trassaCsrf){
      const c=await fetch(TRASSA_API+'/csrf',{credentials:'same-origin'});
      trassaCsrf=(await c.json()).csrfToken;
    }
    if(mode==='login'){
      const email=form.querySelector('input[type=email]')?.value.trim()||'';
      const password=form.querySelector('input[type=password]')?.value||'';
      if(!email||!password) throw new Error('E-Mail und Passwort eingeben.');
      const out=await api('/auth/login',{method:'POST',body:JSON.stringify({email,password})});
      trassaUser=out.user;
      window.trassaUser=trassaUser;
      closeAuth();
      enterApp(trassaUser.company?.name||'');
      if(typeof window.syncPortalIdentity==='function') window.syncPortalIdentity();
      await trassaLoadDashboard();
    }else{
      const first_name=document.getElementById('reg-first-name')?.value.trim()
        || form.querySelector('#reg-first-name')?.value.trim() || '';
      const last_name=document.getElementById('reg-last-name')?.value.trim() || '';
      const company=document.getElementById('reg-company')?.value.trim()
        || form.querySelector('input[type=text]')?.value.trim() || '';
      const role=document.getElementById('register-role')?.value||'';
      const email=document.getElementById('reg-email')?.value.trim()
        || form.querySelector('input[type=email]')?.value.trim() || '';
      const password=document.getElementById('reg-password')?.value || '';
      const passwordConfirm=document.getElementById('reg-password-confirm')?.value || '';
      if(!first_name) throw new Error('Bitte Vornamen eingeben.');
      if(!last_name) throw new Error('Bitte Nachnamen eingeben.');
      if(company.length<2) throw new Error('Unternehmensname ist zu kurz.');
      if(!role) throw new Error('Bitte Unternehmensart wählen.');
      if(!email) throw new Error('E-Mail eingeben.');
      if(password.length<10) throw new Error('Passwort muss mindestens 10 Zeichen haben.');
      if(password!==passwordConfirm) throw new Error('Passwörter stimmen nicht überein.');
      const out=await api('/auth/register',{method:'POST',body:JSON.stringify({company,role,first_name,last_name,email,password})});
      trassaUser=out.user;
      window.trassaUser=trassaUser;
      closeAuth();
      enterApp(trassaUser.company?.name||company);
      if(typeof window.syncPortalIdentity==='function') window.syncPortalIdentity();
      await trassaLoadDashboard();
      if(out.emailVerificationSent===false){
        apiToast('Konto angelegt. (E-Mail-Bestätigung übersprungen – SMTP nicht konfiguriert.)');
      }else if(out.emailVerificationSent){
        apiToast('Konto angelegt. Bitte E-Mail zur Bestätigung prüfen.');
      }else{
        apiToast('Konto angelegt. Willkommen bei TRASSA!');
      }
    }
  }catch(e){
    showAuthMessage(mode, e.message||'Anmeldung fehlgeschlagen.', true);
  }finally{
    setLoadingButton(form,false);
  }
  return false;
}
window.submitAuth=submitAuth;
window.trassaSubmitAuth=submitAuth;

async function exitApp(){
  try{ await api('/auth/logout',{method:'POST'}); }catch{}
  trassaUser=null;
  window.trassaUser=null;
  document.body.classList.remove('app-mode');
  window.scrollTo(0,0);
}
window.exitApp=exitApp;

async function trassaBoot(){
  try{
    const [csrfRes, meOut]=await Promise.all([
      fetch(TRASSA_API+'/csrf',{credentials:'same-origin'}).then(r=>r.json()).catch(()=>({})),
      api('/auth/me').catch(()=>null)
    ]);
    if(csrfRes?.csrfToken) trassaCsrf=csrfRes.csrfToken;
    if(meOut?.user){
      trassaUser=meOut.user;
      window.trassaUser=trassaUser;
      enterApp(trassaUser.company?.name||trassaUser.name||'');
      if(typeof window.syncPortalIdentity==='function') window.syncPortalIdentity();
      await trassaLoadDashboard();
    }
  }catch{ /* öffentliche Startseite */ }
}

async function trassaLoadDashboard(){
  try{const d=await api('/dashboard');
    const k=document.querySelectorAll('#panel-dashboard .kpi-card .num'); [d.kpi.open,d.kpi.transports,d.kpi.offers,d.kpi.messages].forEach((v,i)=>{if(k[i])k[i].textContent=v});
    const t=translations[lang]; const labels=lang==='de'?{gewicht:'Gewicht',zeit:'Zeitraum',spur:'Spurweite'}:{gewicht:'Weight',zeit:'Timeframe',spur:'Gauge'};
    document.getElementById('dash-req-list').innerHTML=(d.requests||[]).slice(0,3).map(r=>`<div class="req-row dashboard-request-row" role="button" tabindex="0" data-request-id="${esc(r.id)}" onclick="window.openDashboardRequestDetail(this.dataset.requestId)" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();window.openDashboardRequestDetail(this.dataset.requestId)}"><div><div class="r-route">${esc(r.route)}</div><div class="r-sub">#TR-${r.public_id}</div></div><div class="r-field"><span class="k">${labels.zeit}</span>${esc(formatPeriod(r.from_date,r.to_date,r.zeit))}</div><div class="r-field"><span class="k">${labels.gewicht}</span>${esc(r.gewicht||'—')}</div><div class="r-field"><span class="k">${labels.spur}</span>—</div><div class="req-badge ${r.gefahr?'gefahr':''}">${r.gefahr?'Gefahrgut':'Offen'}</div></div>`).join('');
    document.getElementById('dash-activity-list').innerHTML=(d.activity||[]).map(a=>`<div class="activity-item"><div class="ico">${esc(a.icon)}</div><div><div class="txt">${esc(a.text)}</div><div class="time">${new Date(a.created_at).toLocaleString(lang==='de'?'de-DE':'en-GB')}</div></div></div>`).join('');
  }catch(e){console.error(e)}
}

function esc(v){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}

function formatDateDMY(value){
  if(value==null||value==='') return '—';
  // YYYY-MM-DD or ISO
  const iso=String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if(iso) return `${iso[3]}.${iso[2]}.${iso[1]}`;
  const d=new Date(value);
  if(Number.isNaN(d.getTime())){
    // already formatted or garbage – strip long GMT tails
    const s=String(value);
    if(s.length>16 && s.includes('GMT')) {
      const d2=new Date(s);
      if(!Number.isNaN(d2.getTime())) {
        const dd=String(d2.getDate()).padStart(2,'0');
        const mm=String(d2.getMonth()+1).padStart(2,'0');
        return `${dd}.${mm}.${d2.getFullYear()}`;
      }
    }
    return s;
  }
  const dd=String(d.getDate()).padStart(2,'0');
  const mm=String(d.getMonth()+1).padStart(2,'0');
  return `${dd}.${mm}.${d.getFullYear()}`;
}
function formatPeriod(from,to,fallback){
  if(from||to) return `${from?formatDateDMY(from):'—'} – ${to?formatDateDMY(to):'—'}`;
  if(fallback){
    // "date – date" possibly with GMT strings
    const parts=String(fallback).split(/\s*[–-]\s*/);
    if(parts.length===2) return `${formatDateDMY(parts[0])} – ${formatDateDMY(parts[1])}`;
    return formatDateDMY(fallback);
  }
  return '—';
}
function isYoungerThanOneDay(createdAt){
  const created=new Date(createdAt).getTime();
  return Number.isFinite(created) && (Date.now()-created) < 24*60*60*1000;
}
function requestListStatusBadge(r){
  if(r.status==='new'){
    return isYoungerThanOneDay(r.created_at)
      ? `<div class="status-badge grey">${lang==='de'?'Neu':'New'}</div>`
      : '';
  }
  const label=requestStatusLabel(r.status);
  return `<div class="status-badge ${statusClass[r.status]||'grey'}">${esc(label)}</div>`;
}

async function renderMyRequests(){
  try{
    const out=await api('/requests?mine=true');
    trassaRequests=out.requests||[];
    document.getElementById('myreq-list').innerHTML=trassaRequests.map((r,i)=>`<div class="list-row clickable" onclick="window.openRequestDetail(${i})"><div><div class="l-main">${esc(r.route)}</div><div class="l-sub">#TR-${r.public_id}</div></div><div class="l-field"><span class="k">${lang==='de'?'Erstellt':'Created'}</span>${formatDateDMY(r.created_at)}</div><div class="l-field"><span class="k">${lang==='de'?'Angebote':'Offers'}</span>${r.offers}</div>${requestListStatusBadge(r)}</div>`).join('') || `<div class="no-results">${lang==='de'?'Keine Anfragen vorhanden.':'No requests available.'}</div>`;
  }catch(e){apiToast(e.message)}
}
function requestDisplayValue(value){
  if(value===null || value===undefined || value==='') return '—';
  const t=translations[lang] || {};
  return t[value] || value;
}
function requestStatusLabel(status){
  const map=lang==='de'?{
    draft:'Entwurf',new:'Offen',progress:'In Bearbeitung',awarded:'Vergeben',cancelled:'Storniert',
    pending:'Offen',accepted:'Angenommen',declined:'Abgelehnt',withdrawn:'Zurückgezogen'
  }:{
    draft:'Draft',new:'Open',progress:'In progress',awarded:'Awarded',cancelled:'Cancelled',
    pending:'Pending',accepted:'Accepted',declined:'Declined',withdrawn:'Withdrawn'
  };
  const t=translations[lang] || {};
  return t['status_'+status] || map[status] || status || '—';
}
function renderRealRequestDetail(r, docs){
  if(!r) return;
  const locale=lang==='de'?'de-DE':'en-GB';
  const labels=lang==='de'
    ? {route:'Strecke', period:'Zeitraum', weight:'Gewicht', gauge:'Lichtraumprofil', wagon:'Wagenart', hazardous:'Gefahrgut', created:'Erstellt am', offers:'Angebote', status:'Status', yes:'Ja', no:'Nein', showOffers:'Angebote ansehen'}
    : {route:'Route', period:'Timeframe', weight:'Weight', gauge:'Loading gauge', wagon:'Wagon type', hazardous:'Hazardous goods', created:'Created on', offers:'Offers', status:'Status', yes:'Yes', no:'No', showOffers:'View offers'};
  const start=r.start_location || '';
  const destination=r.destination || '';
  const route=(start || destination) ? `${start || '—'} → ${destination || '—'}` : (r.route || '—');
  const period=(r.from_date || r.to_date) ? `${r.from_date ? formatDateDMY(r.from_date) : '—'} – ${r.to_date ? formatDateDMY(r.to_date) : '—'}` : (r.zeit || '—');
  const weight=r.gewicht || (r.weight_t ? `${r.weight_t} t` : '—');
  const created=r.created_at ? formatDateDMY(r.created_at) : '—';
  const offers=Number(r.offers || 0);
  document.getElementById('req-detail-h1').textContent=r.title || route;
  document.getElementById('req-detail-sub').textContent='#TR-'+r.public_id;
  document.getElementById('req-detail-grid').innerHTML=[
    [labels.route,route],
    [labels.period,period],
    [labels.weight,weight],
    [labels.gauge,requestDisplayValue(r.loading_gauge)],
    [labels.wagon,requestDisplayValue(r.wagon_type)],
    [labels.hazardous,r.hazardous_goods?labels.yes:labels.no],
    [labels.created,created],
    [labels.offers,offers],
    [labels.status,requestStatusLabel(r.status)]
  ].map(([k,v])=>`<div class="detail-item"><span class="k">${esc(k)}</span><div class="v">${esc(v)}</div></div>`).join('');
  document.getElementById('req-detail-desc').textContent=r.description || '—';
  const myCompanyId=trassaUser?.company?.id;
  const isOwner=r.company_id===myCompanyId;
  const canEdit=isOwner && ['draft','new','progress'].includes(r.status);
  const parts=[];
  if(offers>0){
    parts.push(`<button type="button" class="btn btn-primary" onclick="switchAppPanel('angebote')">${esc(labels.showOffers)} (${offers})</button>`);
  } else {
    parts.push(`<span class="status-badge ${statusClass[r.status]||'grey'}">${esc(requestStatusLabel(r.status))}</span>`);
  }
  if(canEdit){
    parts.push(`<button type="button" class="btn btn-ghost" onclick="startEditRequest('${esc(r.id)}')">Bearbeiten</button>`);
    parts.push(`<button type="button" class="btn btn-ghost" style="color:#dc2626;border-color:#fca5a5;" onclick="cancelRequest('${esc(r.id)}')">Stornieren</button>`);
  }
  document.getElementById('req-detail-actions').innerHTML=`<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;">${parts.join('')}</div>`;

  // Dokumente anzeigen + frisch nachladen
  const docsEl=document.getElementById('req-detail-docs');
  const uploadWrap=document.getElementById('req-detail-docs-upload');
  function paintReqDocs(list){
    window.__trassaCurrentRequestDocs=list||[];
    if(!docsEl) return;
    if(!list || !list.length){
      docsEl.innerHTML='<div class="no-results" style="padding:12px;">Keine Dokumente zu dieser Anfrage.<br><span style="font-size:12px;color:#6b7280">Laden Sie Dateien hier hoch oder unter Dokumente mit Anfrage-Verknüpfung.</span></div>';
      return;
    }
    docsEl.innerHTML=list.map(d=>`<div class="doc-row" style="cursor:pointer;" onclick="downloadDoc('${esc(d.id)}')" title="Zum Herunterladen klicken">
      <div class="d-ico">📎</div>
      <div class="d-main">
        <div class="d-name">${esc(d.original_name)}</div>
        <div class="d-meta">${Math.round((d.size_bytes||0)/1024)} KB · ${new Date(d.created_at).toLocaleDateString(lang==='de'?'de-DE':'en-GB')}</div>
      </div>
      <button type="button" class="btn btn-ghost" onclick="event.stopPropagation();downloadDoc('${esc(d.id)}')">Herunterladen</button>
    </div>`).join('');
  }
  let docList=Array.isArray(docs)&&docs.length ? docs : (window.__trassaCurrentRequestDocs||[]);
  paintReqDocs(docList);
  if(r && r.id){
    (async()=>{
      try{
        const out=await api('/requests/'+encodeURIComponent(r.id));
        paintReqDocs(out.documents||[]);
      }catch(_){
        try{
          const all=await api('/documents?request_id='+encodeURIComponent(r.id));
          paintReqDocs(all.documents||[]);
        }catch(__){}
      }
    })();
  }
  myCompanyId=trassaUser?.company?.id;
  isOwner=r && (r.company_id===myCompanyId);
  if(uploadWrap) uploadWrap.style.display=isOwner?'block':'none';
  const upBtn=document.getElementById('req-docs-upload-btn');
  if(upBtn) upBtn.style.display=isOwner?'inline-flex':'none';


}
async function openRequestDetailById(requestId, fallback=null){
  if(!requestId) return;
  try{
    const out=await api('/requests/'+encodeURIComponent(requestId));
    const r=out.request || fallback;
    if(!r) return;
    window.__trassaCurrentRequest=r;
    window.__trassaCurrentRequestDocs=out.documents||[];
    await switchAppPanel('anfrage-detail');
    renderRealRequestDetail(r, out.documents||[]);
  }catch(e){
    if(fallback){
      window.__trassaCurrentRequest=fallback;
      window.__trassaCurrentRequestDocs=[];
      await switchAppPanel('anfrage-detail');
      renderRealRequestDetail(fallback, []);
    }
    apiToast(e.message);
  }
}
async function openRequestDetail(index){
  currentRequestIndex=index;
  const listRow=trassaRequests[index];
  if(!listRow) return;
  await openRequestDetailById(listRow.id, listRow);
}
async function openDashboardRequestDetail(requestId){
  await openRequestDetailById(requestId, null);
}

async function cancelRequest(requestId){
  if(!requestId) return;
  if(!confirm(lang==='de'?'Anfrage wirklich stornieren? Offene Angebote werden abgelehnt.':'Really cancel this request? Pending offers will be declined.')) return;
  try{
    await api('/requests/'+encodeURIComponent(requestId),{method:'PATCH',body:JSON.stringify({status:'cancelled'})});
    apiToast(lang==='de'?'Anfrage storniert.':'Request cancelled.');
    await openRequestDetailById(requestId);
    if(typeof renderMyRequests==='function') await renderMyRequests();
    if(typeof trassaLoadDashboard==='function') await trassaLoadDashboard();
  }catch(e){apiToast(e.message)}
}
window.cancelRequest=cancelRequest;

async function startEditRequest(requestId){
  try{
    const out=await api('/requests/'+encodeURIComponent(requestId));
    const r=out.request;
    if(!r) return;
    if(!['draft','new','progress'].includes(r.status)){
      apiToast(lang==='de'?'Diese Anfrage kann nicht bearbeitet werden.':'This request cannot be edited.');
      return;
    }
    window.__trassaEditingRequestId=r.id;
    // Formular befüllen
    const set=(id,val)=>{const el=document.getElementById(id); if(el) el.value=val??'';};
    set('nr-start', r.start_location||'');
    set('nr-ziel', r.destination||'');
    set('nr-von', (r.from_date||'').toString().slice(0,10));
    set('nr-bis', (r.to_date||'').toString().slice(0,10));
    set('nr-gewicht', r.weight_t!=null?r.weight_t:'');
    set('nr-titel', r.title||'');
    set('nr-beschreibung', r.description||'');
    // Selects: best effort by value/text
    const setSelect=(id, value, attrMatch)=>{
      const el=document.getElementById(id);
      if(!el||value==null) return;
      const opts=[...el.options];
      let found=opts.find(o=>o.value===value || o.getAttribute('data-i18n')===value || o.text===value);
      if(!found && attrMatch) found=opts.find(o=>o.getAttribute('data-i18n')===attrMatch);
      if(found) el.value=found.value;
    };
    setSelect('nr-licht', r.loading_gauge);
    setSelect('nr-wagenart', r.wagon_type);
    setSelect('nr-gefahr', r.hazardous_goods?'ja':'nein');
    await switchAppPanel('neue-anfrage');
    // Titel anpassen
    const h1=document.querySelector('#panel-neue-anfrage .panel-title-row h1');
    const p=document.querySelector('#panel-neue-anfrage .panel-title-row p');
    if(h1) h1.textContent=lang==='de'?'Anfrage bearbeiten':'Edit request';
    if(p) p.textContent=lang==='de'?`#TR-${r.public_id}`:'';
    // Buttons: Publish becomes Speichern
    const publishBtn=document.querySelector('#panel-neue-anfrage a.btn-primary');
    if(publishBtn){
      publishBtn.textContent=lang==='de'?'Änderungen speichern':'Save changes';
      publishBtn.setAttribute('onclick','saveEditedRequest();return false;');
    }
    const draftBtn=document.querySelector('#panel-neue-anfrage a.btn-ghost');
    if(draftBtn && r.status==='draft'){
      draftBtn.style.display='';
      draftBtn.textContent=lang==='de'?'Als Entwurf speichern':'Save as draft';
      draftBtn.setAttribute('onclick','saveEditedRequest(true);return false;');
    } else if(draftBtn){
      draftBtn.style.display='none';
    }
  }catch(e){apiToast(e.message)}
}
window.startEditRequest=startEditRequest;

async function saveEditedRequest(asDraft=false){
  const id=window.__trassaEditingRequestId;
  if(!id){
    // Fallback: neue Anfrage
    return asDraft?saveDraftRequest():publishNewRequest();
  }
  if(typeof collectNewRequestData!=='function'){apiToast('Formular nicht verfügbar.');return;}
  const data=collectNewRequestData();
  if(!asDraft && (!data.start||!data.ziel||!data.titel)){
    apiToast(lang==='de'?'Bitte Pflichtfelder ausfüllen.':'Please fill required fields.');
    return;
  }
  try{
    const body={...data, status: asDraft?'draft':'new'};
    // progress behalten wenn schon progress und nicht draft
    const cur=window.__trassaCurrentRequest;
    if(cur && cur.id===id && cur.status==='progress' && !asDraft) body.status='progress';
    await api('/requests/'+encodeURIComponent(id),{method:'PATCH',body:JSON.stringify(body)});
    apiToast(lang==='de'?'Anfrage gespeichert.':'Request saved.');
    window.__trassaEditingRequestId=null;
    // Form-Titel zurücksetzen
    const h1=document.querySelector('#panel-neue-anfrage .panel-title-row h1');
    if(h1) h1.textContent=lang==='de'?'Neue Anfrage erstellen':'Create new request';
    const publishBtn=document.querySelector('#panel-neue-anfrage a.btn-primary');
    if(publishBtn){
      publishBtn.setAttribute('onclick','publishNewRequest();return false;');
      publishBtn.textContent=lang==='de'?'Anfrage veröffentlichen':'Publish request';
    }
    const draftBtn=document.querySelector('#panel-neue-anfrage a.btn-ghost');
    if(draftBtn){
      draftBtn.style.display='';
      draftBtn.setAttribute('onclick','saveDraftRequest();return false;');
    }
    await openRequestDetailById(id);
    if(typeof renderMyRequests==='function') await renderMyRequests();
  }catch(e){apiToast(e.message)}
}
window.saveEditedRequest=saveEditedRequest;

window.openRequestDetail=openRequestDetail;
window.openDashboardRequestDetail=openDashboardRequestDetail;
window.renderRealRequestDetail=renderRealRequestDetail;

async function refreshRequestDocuments(){
  const r=window.__trassaCurrentRequest;
  if(!r || !r.id){
    apiToast('Keine Anfrage geöffnet.');
    return;
  }
  const docsEl=document.getElementById('req-detail-docs');
  if(docsEl) docsEl.innerHTML='<div class="no-results" style="padding:12px;">Lade Dokumente …</div>';
  try{
    const out=await api('/requests/'+encodeURIComponent(r.id));
    const list=out.documents||[];
    window.__trassaCurrentRequestDocs=list;
    if(out.request) window.__trassaCurrentRequest=out.request;
    // reuse render
    renderRealRequestDetail(window.__trassaCurrentRequest, list);
    if(!list.length) apiToast('Keine verknüpften Dokumente. Bitte hier hochladen oder unter Dokumente verknüpfen.');
    else apiToast(list.length+' Dokument(e) geladen.');
  }catch(e){
    try{
      const all=await api('/documents?request_id='+encodeURIComponent(r.id));
      window.__trassaCurrentRequestDocs=all.documents||[];
      renderRealRequestDetail(r, all.documents||[]);
    }catch(e2){apiToast(e.message||'Dokumente konnten nicht geladen werden.');}
  }
}
window.refreshRequestDocuments=refreshRequestDocuments;


function renderMarketplaceActions(r){
  if(!r || !trassaUser || r.company_id===trassaUser.company?.id || !['new','progress'].includes(r.status)) return;
  const actions=document.getElementById('req-detail-actions');
  if(!actions) return;
  actions.innerHTML=`
    <div style="width:100%;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:18px;align-items:start;">
      <form onsubmit="return submitMarketplaceOffer(event,'${esc(r.id)}')" class="panel" style="padding:18px;">
        <h3 style="margin:0 0 14px;">Angebot abgeben</h3>
        <div class="field"><label>Preis (€)</label><input id="market-offer-price" type="number" min="0" step="0.01" required placeholder="z. B. 12500,00"></div>
        <div class="field"><label>Gültig bis</label><input id="market-offer-valid" type="date" min=""></div>
        <div class="field"><label>Ansprechpartner</label><input id="market-offer-contact" type="text" maxlength="200" placeholder="Name"></div>
        <div class="field"><label>Hinweis / Konditionen</label><textarea id="market-offer-note" maxlength="5000" placeholder="Details zum Angebot"></textarea></div>
        <button class="btn btn-primary" type="submit">Angebot senden</button>
      </form>
      <form onsubmit="return sendMarketplaceMessage(event,'${esc(r.id)}','${esc(r.company_id)}')" class="panel" style="padding:18px;">
        <h3 style="margin:0 0 14px;">Nachricht schreiben</h3>
        <p style="margin:0 0 12px;color:var(--text-dim);font-size:13px;">Direkt zum Auftraggeber dieser Anfrage.</p>
        <div class="field"><label>Nachricht</label><textarea id="market-message-body" required maxlength="5000" placeholder="Ihre Nachricht …" style="min-height:150px;"></textarea></div>
        <button class="btn btn-primary" type="submit">Nachricht senden</button>
      </form>
    </div>`;
}
async function submitMarketplaceOffer(event,requestId){
  event.preventDefault();
  const price=Number(document.getElementById('market-offer-price')?.value||0);
  if(!Number.isFinite(price)||price<0){apiToast('Bitte einen gültigen Preis eingeben.');return false;}
  try{
    await api('/requests/'+encodeURIComponent(requestId)+'/offers',{method:'POST',body:JSON.stringify({
      price_cents:Math.round(price*100),
      valid_until:document.getElementById('market-offer-valid')?.value||'',
      contact_name:document.getElementById('market-offer-contact')?.value.trim()||'',
      note:document.getElementById('market-offer-note')?.value.trim()||''
    })});
    apiToast('Angebot wurde gesendet.');
    await openMarketplaceRequest(requestId);
  }catch(e){apiToast(e.message)}
  return false;
}
async function sendMarketplaceMessage(event,requestId,ownerCompanyId){
  event.preventDefault();
  const body=document.getElementById('market-message-body')?.value.trim()||'';
  if(!body){apiToast('Bitte eine Nachricht eingeben.');return false;}
  try{
    const c=await api('/conversations',{method:'POST',body:JSON.stringify({request_id:requestId,company_id:ownerCompanyId})});
    await api('/conversations/'+encodeURIComponent(c.conversation.id)+'/messages',{method:'POST',body:JSON.stringify({body})});
    apiToast('Nachricht wurde gesendet.');
    document.getElementById('market-message-body').value='';
  }catch(e){apiToast(e.message)}
  return false;
}
async function openMarketplaceRequest(requestId){
  await openRequestDetailById(requestId,null);
  renderMarketplaceActions(window.__trassaCurrentRequest);
}
window.openMarketplaceRequest=openMarketplaceRequest;
window.submitMarketplaceOffer=submitMarketplaceOffer;
window.sendMarketplaceMessage=sendMarketplaceMessage;

async function renderMarketRequests(){
  try{
    const q=document.getElementById('m-f-search')?.value.trim()||'';
    const von=document.getElementById('m-f-von')?.value||'';
    const bis=document.getElementById('m-f-bis')?.value||'';
    const out=await api('/requests'+(q?'?q='+encodeURIComponent(q):''));
    let list=out.requests||[];
    if(von||bis){
      list=list.filter(r=>{
        const rf=(r.from_date||'').toString().slice(0,10);
        const rt=(r.to_date||'').toString().slice(0,10);
        if(von && rt && rt < von) return false;
        if(bis && rf && rf > bis) return false;
        return true;
      });
    }
    document.getElementById('m-req-list').innerHTML=list.map(r=>`<div class="req-row clickable" role="button" tabindex="0" onclick="openMarketplaceRequest('${esc(r.id)}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openMarketplaceRequest('${esc(r.id)}')}"><div><div class="r-route">${esc(r.route)}</div><div class="r-sub">#TR-${r.public_id} · ${esc(r.title)}</div></div><div class="r-field"><span class="k">Zeitraum</span>${esc((r.from_date||r.to_date)?`${r.from_date?formatDateDMY(r.from_date):'—'} – ${r.to_date?formatDateDMY(r.to_date):'—'}`:(r.zeit||'—'))}</div><div class="r-field"><span class="k">Gewicht</span>${esc(r.gewicht||'—')}</div><div class="r-field"><span class="k">Wagenart</span>${esc(requestDisplayValue(r.wagon_type))}</div><div class="req-badge ${r.gefahr?'gefahr':''}">${r.gefahr?'Gefahrgut':'Offen'}</div></div>`).join('')||'<div class="no-results">Keine Anfragen gefunden.</div>';
  }catch(e){apiToast(e.message)}
}
function populateMarketFilters(){}

async function renderOffers(){
  try{
    const out=await api('/offers');
    trassaOffers=out.offers||[];
    const myCompanyId=trassaUser?.company?.id;
    const incoming=trassaOffers.filter(o=>(o.direction==='incoming')||(o.request_company===myCompanyId&&o.provider_company_id!==myCompanyId));
    const outgoing=trassaOffers.filter(o=>(o.direction==='outgoing')||(o.provider_company_id===myCompanyId&&o.request_company!==myCompanyId));

    function rowHtml(o){
      const isRequester=o.request_company===myCompanyId || o.direction==='incoming';
      const isProvider=o.provider_company_id===myCompanyId || o.direction==='outgoing';
      let actionsHtml='';
      if(o.status==='pending'&&isRequester&&!isProvider){
        actionsHtml=`<div style="display:flex;gap:8px;"><button type="button" class="btn btn-primary" onclick="event.stopPropagation();offerActionById('${esc(o.id)}','accepted')">Annehmen</button><button type="button" class="btn btn-ghost" onclick="event.stopPropagation();offerActionById('${esc(o.id)}','declined')">Ablehnen</button></div>`;
      }else if(o.status==='pending'&&isProvider){
        actionsHtml=`<div style="display:flex;gap:8px;"><button type="button" class="btn btn-ghost" onclick="event.stopPropagation();offerActionById('${esc(o.id)}','withdrawn')">Zurückziehen</button></div>`;
      }else{
        actionsHtml=`<div class="status-badge ${statusClass[o.status]||'grey'}">${esc(offerStatusLabel(o.status))}</div>`;
      }
      const partnerLabel=isRequester?'Anbieter':'Auftraggeber';
      return `<div class="list-row clickable" data-offer-id="${esc(o.id)}" onclick="openRealOfferDetail('${esc(o.id)}')"><div><div class="l-main">${esc(o.route)}</div><div class="l-sub">${esc(partnerLabel)}: ${esc(o.partner)} · #TR-${esc(o.public_id||'')}</div></div><div class="l-field"><span class="k">Datum</span>${new Date(o.created_at||o.date).toLocaleDateString(lang==='de'?'de-DE':'en-GB')}</div><div class="l-field"><span class="k">Preis</span>${esc(o.price)}</div>${actionsHtml}</div>`;
    }

    const emptyIn='<div class="no-results">Keine eingegangenen Angebote.</div>';
    const emptyOut='<div class="no-results">Keine abgegebenen Angebote.</div>';
    const elIn=document.getElementById('offers-list-incoming');
    const elOut=document.getElementById('offers-list-outgoing');
    const elLegacy=document.getElementById('offers-list');
    if(elIn) elIn.innerHTML=incoming.length?incoming.map(rowHtml).join(''):emptyIn;
    if(elOut) elOut.innerHTML=outgoing.length?outgoing.map(rowHtml).join(''):emptyOut;
    if(elLegacy) elLegacy.innerHTML='';
    const cIn=document.getElementById('offers-incoming-count');
    const cOut=document.getElementById('offers-outgoing-count');
    if(cIn) cIn.textContent=incoming.length?`${incoming.length}`:'';
    if(cOut) cOut.textContent=outgoing.length?`${outgoing.length}`:'';
  }catch(e){apiToast(e.message)}
}

function offerStatusLabel(status){
  return ({pending:'Offen',accepted:'Angenommen',declined:'Abgelehnt',withdrawn:'Zurückgezogen'})[status]||status||'—';
}

async function offerActionById(offerId,newStatus){
  try{
    await api('/offers/'+encodeURIComponent(offerId),{method:'PATCH',body:JSON.stringify({status:newStatus})});
    const msgs={accepted:'Angebot angenommen.',declined:'Angebot abgelehnt.',withdrawn:'Angebot zurückgezogen.'};
    apiToast(msgs[newStatus]||'Status aktualisiert.');
    await renderOffers();
    await trassaLoadDashboard();
    if(currentPanel==='angebot-detail') await openRealOfferDetail(offerId);
  }catch(e){apiToast(e.message)}
}

async function offerAction(index,newStatus){
  const o=trassaOffers[index];
  if(o) return offerActionById(o.id,newStatus);
}

let offerDetailConversationId=null;

function offerDetailPriceNumber(o){
  if(Number.isFinite(Number(o?.price_cents))) return Number(o.price_cents)/100;
  const normalized=String(o?.price||'').replace(/[^0-9,.-]/g,'').replace(/\./g,'').replace(',','.');
  const value=Number(normalized);
  return Number.isFinite(value)?value:0;
}

async function ensureOfferDetailConversation(o){
  if(!o?.request_id) throw new Error('Angebot ohne Anfrage-Bezug – Chat nicht möglich.');
  const myCompanyId=trassaUser?.company?.id;
  const partnerCompanyId=o.request_company===myCompanyId
    ? (o.provider_company_id||null)
    : (o.request_company||null);
  if(!partnerCompanyId) throw new Error('Gesprächspartner fehlt.');
  const out=await api('/conversations',{method:'POST',body:JSON.stringify({request_id:o.request_id,company_id:partnerCompanyId})});
  offerDetailConversationId=out.conversation?.id||null;
  return offerDetailConversationId;
}

async function loadOfferDetailChat(o){
  const thread=document.getElementById('offer-chat-thread');
  const title=document.getElementById('offer-chat-title');
  if(title) title.textContent=`Chat mit ${o.partner||'Gesprächspartner'}`;
  if(!thread)return;
  thread.innerHTML='<div class="offer-chat-empty">Chat wird geladen …</div>';
  try{
    const conversationId=await ensureOfferDetailConversation(o);
    if(!conversationId){thread.innerHTML='<div class="offer-chat-empty">Chat konnte nicht geöffnet werden.</div>';return;}
    const out=await api('/conversations/'+encodeURIComponent(conversationId)+'/messages');
    const messages=out.messages||[];
    thread.innerHTML=messages.length?messages.map(m=>`<div class="offer-chat-message ${m.sender_user_id===trassaUser?.id?'out':'in'}">${esc(m.body)}<span class="meta">${new Date(m.created_at).toLocaleString(lang==='de'?'de-DE':'en-GB')}</span></div>`).join(''):'<div class="offer-chat-empty">Noch keine Nachrichten. Schreiben Sie die erste Nachricht.</div>';
    thread.scrollTop=thread.scrollHeight;
  }catch(e){thread.innerHTML=`<div class="offer-chat-empty">${esc(e.message)}</div>`;}
}

async function sendOfferDetailMessage(event){
  event.preventDefault();
  const input=document.getElementById('offer-chat-input');
  const body=input?.value.trim();
  const o=window.__trassaCurrentOffer;
  if(!body||!o)return false;
  try{
    if(!offerDetailConversationId) await ensureOfferDetailConversation(o);
    if(!offerDetailConversationId) throw new Error('Chat konnte nicht geöffnet werden');
    await api('/conversations/'+encodeURIComponent(offerDetailConversationId)+'/messages',{method:'POST',body:JSON.stringify({body})});
    input.value='';
    await loadOfferDetailChat(o);
  }catch(e){apiToast(e.message)}
  return false;
}
window.sendOfferDetailMessage=sendOfferDetailMessage;

async function submitOfferPriceUpdate(event){
  event.preventDefault();
  const o=window.__trassaCurrentOffer;
  if(!o)return false;
  const isRequester=o.request_company===trassaUser?.company?.id;
  if(isRequester){apiToast('Nur der Anbieter kann den Preis aktualisieren.');return false;}
  if(o.status!=='pending'){apiToast('Nur offene Angebote können aktualisiert werden.');return false;}
  const input=document.getElementById('offer-price-input');
  const value=Number(input?.value);
  if(!Number.isFinite(value)||value<0){apiToast('Bitte einen gültigen Preis eingeben.');return false;}
  try{
    await api('/offers/'+encodeURIComponent(o.id)+'/price',{method:'PATCH',body:JSON.stringify({price_cents:Math.round(value*100)})});
    apiToast('Preis wurde aktualisiert.');
    await renderOffers();
    await openRealOfferDetail(o.id);
  }catch(e){apiToast(e.message)}
  return false;
}
window.submitOfferPriceUpdate=submitOfferPriceUpdate;

function renderRealOfferDetail(o){
  const myCompanyId=trassaUser?.company?.id;
  const isRequester=o.request_company===myCompanyId;
  const isProvider=o.provider_company_id===myCompanyId;
  const transportzeit=(o.from_date||o.to_date)
    ? `${o.from_date?formatDateDMY(o.from_date):'—'} – ${o.to_date?formatDateDMY(o.to_date):'—'}`
    : '—';
  const fmtDate=(v)=>{
    if(!v)return '—';
    const d=new Date(v);
    return Number.isNaN(d.getTime())?String(v):d.toLocaleDateString(lang==='de'?'de-DE':'en-GB');
  };
  document.getElementById('offer-detail-h1').textContent=o.route||'Angebot';
  document.getElementById('offer-detail-sub').textContent=o.partner||'—';
  document.getElementById('offer-detail-grid').innerHTML=[
    ['Strecke',o.route||'—'],
    [isRequester?'Anbieter':'Auftraggeber',o.partner||'—'],
    ['Transportzeit',transportzeit],
    ['Ansprechpartner',o.contact||o.contact_name||'—'],
    ['Preis',o.price||'—'],
    ['Eingegangen am',fmtDate(o.created_at||o.date)],
    ['Gültig bis',fmtDate(o.validUntil||o.valid_until)],
    ['Status',offerStatusLabel(o.status)]
  ].map(([k,v])=>`<div class="detail-item"><span class="k">${esc(k)}</span><div class="v">${esc(v)}</div></div>`).join('');

  const priceInput=document.getElementById('offer-price-input');
  const priceSubmit=document.getElementById('offer-price-submit');
  const priceHelp=document.getElementById('offer-price-help');
  const priceForm=document.getElementById('offer-price-form');
  if(priceInput) priceInput.value=offerDetailPriceNumber(o).toFixed(2);
  const canEdit=isProvider&&o.status==='pending';
  if(priceInput) priceInput.disabled=!canEdit;
  if(priceSubmit) priceSubmit.disabled=!canEdit;
  if(priceForm) priceForm.style.opacity=canEdit?'1':'.7';
  if(priceHelp) priceHelp.textContent=canEdit
    ? 'Hier können Sie Ihren aktuellen Angebotspreis ändern und direkt speichern.'
    : (isRequester?'Der Preis kann nur vom Anbieter geändert werden.':'Nur offene Angebote können preislich aktualisiert werden.');

  const actions=document.getElementById('offer-detail-actions');
  if(actions){
    if(isRequester&&o.status==='pending'){
      actions.innerHTML=`<button type="button" class="btn btn-primary" onclick="offerActionById('${esc(o.id)}','accepted')">Annehmen</button><button type="button" class="btn btn-ghost" onclick="offerActionById('${esc(o.id)}','declined')">Ablehnen</button>`;
    }else if(isProvider&&o.status==='pending'){
      actions.innerHTML=`<button type="button" class="btn btn-ghost" onclick="offerActionById('${esc(o.id)}','withdrawn')">Angebot zurückziehen</button>`;
    }else{
      actions.innerHTML='';
    }
  }

  offerDetailConversationId=null;
  loadOfferDetailChat(o);
}

async function openRealOfferDetail(offerId){
  try{
    const out=await api('/offers/'+encodeURIComponent(offerId));
    const o=out.offer;
    if(!o)return;
    window.__trassaCurrentOffer=o;
    currentOfferIndex=trassaOffers.findIndex(x=>x.id===o.id);
    // Panel wechseln, ohne Demo-Renderer zu triggern
    currentPanel='angebot-detail';
    document.querySelectorAll('#app-nav .app-nav-item').forEach(el=>{
      el.classList.toggle('active', el.getAttribute('data-panel')==='angebote');
    });
    document.querySelectorAll('.app-main .app-panel').forEach(el=>{
      el.style.display=(el.id==='panel-angebot-detail')?'block':'none';
    });
    renderRealOfferDetail(o);
  }catch(e){apiToast(e.message)}
}
window.openRealOfferDetail=openRealOfferDetail;

async function openOfferDetail(index){
  const o=trassaOffers[index];
  if(o) return openRealOfferDetail(o.id);
}
window.openOfferDetail=openOfferDetail;

async function messageFromOfferId(offerId){
  const o=window.__trassaCurrentOffer;
  if(!o||o.id!==offerId)return;
  const input=document.getElementById('offer-chat-input');
  if(input){input.focus();input.scrollIntoView({behavior:'smooth',block:'center'});}
}
window.messageFromOfferId=messageFromOfferId;

async function messageFromOffer(index){
  const o=trassaOffers[index];
  if(o)return openRealOfferDetail(o.id);
}

async function adjustOfferPriceById(offerId){
  const o=window.__trassaCurrentOffer;
  if(!o||o.id!==offerId)return;
  const input=document.getElementById('offer-price-input');
  if(input){input.focus();input.select();input.scrollIntoView({behavior:'smooth',block:'center'});}
}
window.adjustOfferPriceById=adjustOfferPriceById;

async function adjustOfferPrice(index){
  const o=trassaOffers[index];
  if(o)return openRealOfferDetail(o.id);
}

let trassaTransports=[];

function transportStatusLabel(status){
  return ({planned:'Geplant',underway:'Unterwegs',done:'Abgeschlossen',cancelled:'Storniert'})[status]||status||'—';
}
function transportStatusClass(status){
  return ({planned:'amber',underway:'amber',done:'green',cancelled:'red',grey:'grey'})[status]||'grey';
}

async function renderTransports(){
  try{
    const out=await api('/transports');
    trassaTransports=out.transports||[];
    const list=document.getElementById('transp-list');
    if(!list)return;
    list.innerHTML=trassaTransports.map(tr=>`
      <div class="list-row cols-3 clickable" onclick="openTransportDetail('${esc(tr.id)}')">
        <div>
          <div class="l-main">${esc(tr.route)}</div>
          <div class="l-sub">#TR-${esc(tr.public_id||'—')} · ${esc(String(tr.id).slice(0,8))}…</div>
        </div>
        <div class="l-field"><span class="k">Zeitraum</span>${esc(tr.zeit||'—')}</div>
        <div class="status-badge ${transportStatusClass(tr.status)}">${esc(transportStatusLabel(tr.status))}</div>
      </div>`).join('')||'<div class="no-results">Keine Transporte vorhanden.</div>';
  }catch(e){apiToast(e.message)}
}

function closeTransportDetail(){
  const el=document.getElementById('transport-detail');
  if(el) el.style.display='none';
  window.__trassaCurrentTransport=null;
}
window.closeTransportDetail=closeTransportDetail;

function openTransportDetail(id){
  const tr=trassaTransports.find(t=>t.id===id);
  if(!tr)return;
  window.__trassaCurrentTransport=tr;
  const box=document.getElementById('transport-detail');
  if(box) box.style.display='block';
  const title=document.getElementById('transport-detail-title');
  if(title) title.textContent=tr.route||'Transport';
  const grid=document.getElementById('transport-detail-grid');
  if(grid){
    grid.innerHTML=[
      ['Strecke',tr.route||'—'],
      ['Anfrage',tr.public_id?`#TR-${tr.public_id}`:'—'],
      ['Zeitraum',tr.zeit||'—'],
      ['Status',transportStatusLabel(tr.status)]
    ].map(([k,v])=>`<div class="detail-item"><span class="k">${esc(k)}</span><div class="v">${esc(v)}</div></div>`).join('');
  }
  const actions=document.getElementById('transport-status-actions');
  if(actions){
    const opts=[
      ['planned','Geplant'],
      ['underway','Unterwegs'],
      ['done','Abgeschlossen'],
      ['cancelled','Storniert']
    ];
    actions.innerHTML=opts.map(([val,label])=>{
      const active=tr.status===val;
      return `<button type="button" class="btn ${active?'btn-primary':'btn-ghost'}" ${active?'disabled':''} onclick="updateTransportStatus('${esc(tr.id)}','${val}')">${label}</button>`;
    }).join('');
  }
  const ratingBlock=document.getElementById('transport-rating-block');
  if(ratingBlock){
    const canRate=tr.status==='done' && !tr.rated;
    ratingBlock.style.display=canRate?'block':'none';
    const hid=document.getElementById('rating-transport-id');
    if(hid) hid.value=tr.id;
  }
}
window.openTransportDetail=openTransportDetail;

async function updateTransportStatus(id,status){
  try{
    await api('/transports/'+encodeURIComponent(id),{method:'PATCH',body:JSON.stringify({status})});
    apiToast('Status aktualisiert: '+transportStatusLabel(status));
    await renderTransports();
    openTransportDetail(id);
    if(typeof trassaLoadDashboard==='function') await trassaLoadDashboard();
  }catch(e){apiToast(e.message)}
}
window.updateTransportStatus=updateTransportStatus;

async function submitTransportRating(event){
  event.preventDefault();
  const id=document.getElementById('rating-transport-id')?.value;
  if(!id)return false;
  const body={
    reliability:Number(document.getElementById('rating-reliability')?.value||5),
    communication:Number(document.getElementById('rating-communication')?.value||5),
    punctuality:Number(document.getElementById('rating-punctuality')?.value||5),
    quality:Number(document.getElementById('rating-quality')?.value||5),
    comment:document.getElementById('rating-comment')?.value.trim()||''
  };
  try{
    await api('/transports/'+encodeURIComponent(id)+'/rating',{method:'POST',body:JSON.stringify(body)});
    apiToast('Bewertung wurde gespeichert.');
    await renderTransports();
    openTransportDetail(id);
  }catch(e){apiToast(e.message)}
  return false;
}
window.submitTransportRating=submitTransportRating;

async function submitForgotPassword(event){
  event.preventDefault();
  showAuthMessage('forgot','');
  const email=document.getElementById('forgot-email')?.value.trim()||'';
  if(!email){showAuthMessage('forgot','Bitte E-Mail eingeben.',true);return false;}
  try{
    if(!trassaCsrf){
      const c=await fetch(TRASSA_API+'/csrf',{credentials:'same-origin'});
      trassaCsrf=(await c.json()).csrfToken;
    }
    const out=await api('/auth/forgot-password',{method:'POST',body:JSON.stringify({email})});
    let msg=out.message||'Wenn die Adresse existiert, wurde eine E-Mail versendet.';
    if(out.devResetUrl){
      msg+=' (SMTP nicht konfiguriert – Test-Link: '+out.devResetUrl+')';
      // Token ins Reset-Formular übernehmen
      const tok=document.getElementById('reset-token');
      if(tok && out.devResetToken) tok.value=out.devResetToken;
    }
    showAuthMessage('forgot', msg, false);
  }catch(e){showAuthMessage('forgot', e.message||'Anfrage fehlgeschlagen.', true);}
  return false;
}
window.submitForgotPassword=submitForgotPassword;

async function submitResetPassword(event){
  event.preventDefault();
  showAuthMessage('reset','');
  const token=document.getElementById('reset-token')?.value.trim()||'';
  const password=document.getElementById('reset-password')?.value||'';
  const confirm=document.getElementById('reset-password-confirm')?.value||'';
  if(!token){showAuthMessage('reset','Reset-Token fehlt. Bitte Link aus der E-Mail nutzen.',true);return false;}
  if(password.length<10){showAuthMessage('reset','Passwort muss mindestens 10 Zeichen haben.',true);return false;}
  if(password!==confirm){showAuthMessage('reset','Passwörter stimmen nicht überein.',true);return false;}
  try{
    if(!trassaCsrf){
      const c=await fetch(TRASSA_API+'/csrf',{credentials:'same-origin'});
      trassaCsrf=(await c.json()).csrfToken;
    }
    await api('/auth/reset-password',{method:'POST',body:JSON.stringify({token,password})});
    showAuthMessage('reset','Passwort wurde geändert. Sie können sich jetzt anmelden.',false);
    setTimeout(()=>{ if(typeof switchAuth==='function') switchAuth('login'); }, 1200);
  }catch(e){showAuthMessage('reset', e.message||'Zurücksetzen fehlgeschlagen.', true);}
  return false;
}
window.submitResetPassword=submitResetPassword;

function initPasswordResetFromUrl(){
  try{
    const url=new URL(window.location.href);
    const path=url.pathname||'';
    const token=url.searchParams.get('token')||'';
    if(token && (path.includes('reset-password') || url.searchParams.has('token'))){
      const tok=document.getElementById('reset-token');
      if(tok) tok.value=token;
      if(typeof openAuth==='function') openAuth('reset');
      else if(typeof switchAuth==='function'){
        document.getElementById('auth-overlay')?.classList.add('open');
        switchAuth('reset');
      }
      // URL bereinigen
      window.history.replaceState({},'', path.includes('reset-password')?'/':'/'+window.location.hash);
    }
  }catch(_){}
}


async function renderMessages(){try{const out=await api('/conversations');trassaConversations=out.conversations||[];document.getElementById('conv-list').innerHTML=trassaConversations.map((c,i)=>`<div class="conv-item ${i===0?'active':''}" onclick="selectConversation(${i})"><div class="c-name">${esc(c.names)}${c.unread?`<span class="c-unread">${c.unread}</span>`:''}</div><div class="c-last">${esc(c.last)}</div><div class="c-time">${new Date(c.last_at).toLocaleString(lang==='de'?'de-DE':'en-GB')}</div></div>`).join('')||'<div class="app-placeholder"><div class="ico">💬</div><h2>Noch keine Gespräche</h2><p>Nach einem Angebot können hier Nachrichten ausgetauscht werden.</p></div>';if(trassaConversations[0])await selectConversation(0)}catch(e){apiToast(e.message)}}
async function selectConversation(i){trassaCurrentConversation=trassaConversations[i];if(!trassaCurrentConversation)return;document.querySelectorAll('.conv-item').forEach((x,n)=>x.classList.toggle('active',n===i));const out=await api('/conversations/'+trassaCurrentConversation.id+'/messages');trassaMessages=out.messages||[];document.getElementById('conv-thread-head').textContent=trassaCurrentConversation.names;document.getElementById('conv-thread-body').innerHTML=trassaMessages.map(m=>`<div class="bubble ${m.sender_user_id===trassaUser.id?'out':'in'}">${esc(m.body)}<span class="meta mono">${new Date(m.created_at).toLocaleString(lang==='de'?'de-DE':'en-GB')}</span></div>`).join('');const b=document.getElementById('conv-thread-body');b.scrollTop=b.scrollHeight;}
async function sendMessage(event){event.preventDefault();const input=document.getElementById('msg-input');const body=input.value.trim();if(!body||!trassaCurrentConversation)return false;try{await api('/conversations/'+trassaCurrentConversation.id+'/messages',{method:'POST',body:JSON.stringify({body})});input.value='';await selectConversation(trassaConversations.indexOf(trassaCurrentConversation));}catch(e){apiToast(e.message)}return false}

async function renderDocuments(){
  try{
    const out=await api('/documents');
    trassaDocs=out.documents||[];
    // Anfragen für Verknüpfungs-Select laden
    try{
      const rq=await api('/requests?mine=true');
      const sel=document.getElementById('doc-link-request');
      if(sel){
        const cur=sel.value;
        sel.innerHTML='<option value="">— Keine Verknüpfung —</option>'+(rq.requests||[]).map(r=>`<option value="${esc(r.id)}">#TR-${esc(r.public_id)} · ${esc(r.route||r.title||'')}</option>`).join('');
        if(cur) sel.value=cur;
        if(!cur && window.__trassaCurrentRequest?.id) sel.value=window.__trassaCurrentRequest.id;
      }
    }catch(_){}
    const list=document.getElementById('doc-list');
    if(!list) return;
    list.innerHTML=trassaDocs.map(d=>`<div class="doc-row">
      <div class="d-ico">📎</div>
      <div class="d-main">
        <div class="d-name">${esc(d.original_name)}</div>
        <div class="d-meta">${Math.round((d.size_bytes||0)/1024)} KB · ${new Date(d.created_at).toLocaleDateString(lang==='de'?'de-DE':'en-GB')}${d.request_id?` · verknüpft`:''}</div>
      </div>
      ${d.request_id
        ? `<button type="button" class="btn btn-ghost" onclick="openRequestDetailById('${esc(d.request_id)}')">Zur Anfrage</button>`
        : `<button type="button" class="btn btn-ghost" onclick="linkDocToCurrentRequest('${esc(d.id)}')">An Anfrage hängen</button>`}
      <button type="button" class="btn btn-ghost" onclick="downloadDoc('${esc(d.id)}')">Herunterladen</button>
    </div>`).join('')||'<div class="no-results">Keine Dokumente vorhanden.</div>';
    bindDocUploadDrop();
  }catch(e){apiToast(e.message)}
}
async function downloadDoc(id){
  try{
    // Cookie-Session: same-origin navigation reicht
    window.location.href='/api/documents/'+encodeURIComponent(id)+'/download';
  }catch(e){apiToast(e.message)}
}
window.downloadDoc=downloadDoc;

async function uploadDocument(event){
  const input=event?.target || document.getElementById('doc-file-input');
  const file=input?.files?.[0];
  if(!file) return;
  if(file.size > 25*1024*1024){apiToast('Datei ist größer als 25 MB.');input.value='';return;}
  try{
    if(!trassaCsrf){
      const c=await fetch(TRASSA_API+'/csrf',{credentials:'same-origin'});
      trassaCsrf=(await c.json()).csrfToken;
    }
    const fd=new FormData();
    fd.append('file', file);
    // Wenn eine Anfrage geöffnet ist, Dokument direkt verknüpfen
    const rid=window.__trassaCurrentRequest?.id;
    if(rid) fd.append('request_id', rid);
    // Optional: Auswahl aus Dokumente-Panel
    const sel=document.getElementById('doc-link-request');
    if(sel && sel.value) fd.append('request_id', sel.value);
    const res=await fetch(TRASSA_API+'/documents',{
      method:'POST',
      credentials:'same-origin',
      headers:{'X-CSRF-Token':trassaCsrf||''},
      body:fd
    });
    const data=await res.json().catch(()=>({}));
    if(!res.ok) throw new Error(data.error||'Upload fehlgeschlagen');
    apiToast('Dokument hochgeladen: '+(data.document?.original_name||file.name));
    input.value='';
    await renderDocuments();
    if(rid) await openRequestDetailById(rid);
  }catch(e){apiToast(e.message||'Upload fehlgeschlagen');input.value='';}
}
window.uploadDocument=uploadDocument;

async function uploadDocumentForRequest(event){
  const input=event?.target || document.getElementById('req-doc-file-input');
  const file=input?.files?.[0];
  const requestId=window.__trassaCurrentRequest?.id;
  if(!file) return;
  if(!requestId){apiToast('Keine Anfrage ausgewählt.');return;}
  if(file.size > 25*1024*1024){apiToast('Datei ist größer als 25 MB.');input.value='';return;}
  try{
    if(!trassaCsrf){
      const c=await fetch(TRASSA_API+'/csrf',{credentials:'same-origin'});
      trassaCsrf=(await c.json()).csrfToken;
    }
    const fd=new FormData();
    fd.append('file', file);
    fd.append('request_id', requestId);
    const res=await fetch(TRASSA_API+'/documents',{
      method:'POST',
      credentials:'same-origin',
      headers:{'X-CSRF-Token':trassaCsrf||''},
      body:fd
    });
    const data=await res.json().catch(()=>({}));
    if(!res.ok) throw new Error(data.error||'Upload fehlgeschlagen');
    apiToast('Dokument zur Anfrage hochgeladen.');
    input.value='';
    await openRequestDetailById(requestId);
  }catch(e){apiToast(e.message||'Upload fehlgeschlagen');input.value='';}
}
window.uploadDocumentForRequest=uploadDocumentForRequest;



function bindDocUploadDrop(){
  const box=document.getElementById('doc-upload-box');
  if(!box || box.dataset.dropBound==='1') return;
  box.dataset.dropBound='1';
  box.addEventListener('dragover', (e)=>{e.preventDefault();box.classList.add('dragover');});
  box.addEventListener('dragleave', ()=>box.classList.remove('dragover'));
  box.addEventListener('drop', (e)=>{
    e.preventDefault();
    box.classList.remove('dragover');
    const file=e.dataTransfer?.files?.[0];
    if(!file) return;
    const input=document.getElementById('doc-file-input');
    if(!input) return;
    const dt=new DataTransfer();
    dt.items.add(file);
    input.files=dt.files;
    uploadDocument({target:input});
  });
}


async function renderBilling(){try{const out=await api('/billing');document.getElementById('bill-kpi-grid').innerHTML=`<div class="stat-card"><div class="stat-label">Rechnungen</div><div class="stat-value">${out.invoices.length}</div><div class="stat-sub">Gesamt</div></div><div class="stat-card"><div class="stat-label">Offen</div><div class="stat-value">${out.stats.open}</div><div class="stat-sub">Unbezahlt</div></div><div class="stat-card"><div class="stat-label">Bezahlt</div><div class="stat-value">${out.stats.paid}</div><div class="stat-sub">Abgeschlossen</div></div>`;document.getElementById('invoice-list').innerHTML=out.invoices.map(i=>`<tr><td class="mono">${esc(i.invoice_number)}</td><td>${esc(i.type)}</td><td>${(i.amount_cents/100).toLocaleString('de-DE',{style:'currency',currency:'EUR'})}</td><td class="mono">${esc(i.invoice_date)}</td><td><span class="status-badge ${statusClass[i.status]||'grey'}">${esc(i.status)}</span></td></tr>`).join('')}catch(e){apiToast(e.message)}}
async function loadSettings(){try{const out=await api('/settings');const c=out.company;document.getElementById('set-company').value=c.name||'';document.getElementById('set-contact').value=c.contact_name||'';document.getElementById('set-email').value=trassaUser.email||'';document.getElementById('set-phone').value=c.phone||'';const a=document.querySelector('#settings-form input[name=notification_offers]');if(a)a.checked=c.notification_offers}catch(e){apiToast(e.message)}}
async function submitSettings(event){event.preventDefault();try{await api('/settings',{method:'PATCH',body:JSON.stringify({company:document.getElementById('set-company').value.trim(),contact:document.getElementById('set-contact').value.trim(),email:document.getElementById('set-email').value.trim(),phone:document.getElementById('set-phone').value.trim(),notification_offers:true,notification_messages:true})});document.getElementById('app-company').textContent=', '+document.getElementById('set-company').value.trim();apiToast('Einstellungen gespeichert.')}catch(e){apiToast(e.message)}return false}

async function publishNewRequest(){return createRequest('new')}
async function saveDraftRequest(){return createRequest('draft')}
async function createRequest(status){
  window.__trassaCurrentRequest=null;
  if(typeof collectNewRequestData!=='function'){apiToast('Formular-Hilfe fehlt – Seite neu laden.');return}
  const data=collectNewRequestData();
  if((status==='new'&&(!data.start||!data.ziel||!data.titel))||(!data.start&&!data.ziel&&!data.titel)){
    apiToast('Bitte Pflichtfelder ausfüllen.');
    return;
  }
  try{
    await api('/requests',{method:'POST',body:JSON.stringify({...data,status})});
    apiToast(status==='new'?'Anfrage veröffentlicht.':'Entwurf gespeichert.');
    await switchAppPanel('anfragen');
  }catch(e){apiToast(e.message)}
}
window.publishNewRequest=publishNewRequest;
window.saveDraftRequest=saveDraftRequest;
window.createRequest=createRequest;
window.offerActionById=offerActionById;
window.renderOffers=renderOffers;
window.selectConversation=selectConversation;
window.sendMessage=sendMessage;

// Demo-Renderer in panelRenderers durch echte API-Funktionen ersetzen
if(typeof panelRenderers==='object'&&panelRenderers){
  panelRenderers.dashboard=function(){ if(trassaUser) trassaLoadDashboard(); };
  panelRenderers.marktplatz=function(){ if(trassaUser) renderMarketRequests(); };
  panelRenderers.anfragen=function(){ if(trassaUser) renderMyRequests(); };
  panelRenderers.angebote=function(){ if(trassaUser) renderOffers(); };
  panelRenderers.transporte=function(){ if(trassaUser) renderTransports(); };
  panelRenderers.nachrichten=function(){ if(trassaUser) renderMessages(); };
  panelRenderers.dokumente=function(){ if(trassaUser) renderDocuments(); };
  panelRenderers.abrechnung=function(){ if(trassaUser) renderBilling(); };
  panelRenderers.einstellungen=function(){ if(trassaUser) loadSettings(); };
  panelRenderers['angebot-detail']=function(){};
  panelRenderers['anfrage-detail']=function(){
    if(window.__trassaCurrentRequest) renderRealRequestDetail(window.__trassaCurrentRequest, window.__trassaCurrentRequestDocs||[]);
  };
}

const oldSwitchAppPanel=window.switchAppPanel;
window.switchAppPanel=async function(name){
  // Bei angemeldetem User: direkt API-Renderer, kein Demo-Flash
  if(trassaUser && typeof panelRenderers==='object' && panelRenderers[name] && name!=='angebot-detail'){
    currentPanel=name;
    const highlight=(typeof panelHighlightMap==='object'&&panelHighlightMap[name])||name;
    document.querySelectorAll('#app-nav .app-nav-item').forEach(el=>{
      el.classList.toggle('active', el.getAttribute('data-panel')===highlight);
    });
    document.querySelectorAll('.app-main .app-panel').forEach(el=>{
      el.style.display=(el.id==='panel-'+name)?'block':'none';
    });
    try{
      if(name==='dashboard') await trassaLoadDashboard();
      else if(name==='marktplatz') await renderMarketRequests();
      else if(name==='anfragen') await renderMyRequests();
      else if(name==='angebote') await renderOffers();
      else if(name==='transporte') await renderTransports();
      else if(name==='nachrichten') await renderMessages();
      else if(name==='dokumente') await renderDocuments();
      else if(name==='abrechnung') await renderBilling();
      else if(name==='einstellungen') await loadSettings();
      else if(panelRenderers[name]) panelRenderers[name]();
    }catch(e){ console.error(e); apiToast(e.message); }
    return;
  }
  if(typeof oldSwitchAppPanel==='function') oldSwitchAppPanel(name);
};

window.addEventListener('load', () => {
  setTimeout(trassaBoot, 0);
  setTimeout(initPasswordResetFromUrl, 50);
  const input = document.getElementById('nr-file-input');
  if (input) {
    input.addEventListener('change', async () => {
      for (const f of input.files) {
        try {
          const fd = new FormData();
          fd.append('file', f);
          await api('/documents', {method:'POST', body:fd});
        } catch (e) { apiToast(e.message); }
      }
      input.value = '';
      apiToast('Dokument(e) gespeichert.');
    });
  }
});

/* ---------- Light portal shell helpers ---------- */
(function initLightPortalShell(){
  function displayUserName(user){
    if(!user) return 'TRASSA Nutzer';
    const full = [user.first_name, user.last_name].filter(Boolean).join(' ').trim();
    if(full) return full;
    if(user.company?.contact_name) return user.company.contact_name;
    if(user.company?.name) return user.company.name;
    if(user.name) return user.name;
    if(user.email) return user.email.split('@')[0];
    return 'TRASSA Nutzer';
  }

  function syncPortalIdentity(){
    try{
      const user = window.trassaUser || null;
      const displayName = displayUserName(user);
      const role = user?.company?.role || user?.role || user?.company_role || 'Unternehmen';
      const companyEl = document.getElementById('portal-company-name');
      const roleEl = document.getElementById('portal-company-role');
      const avatarEl = document.getElementById('portal-avatar');
      if(companyEl) companyEl.textContent = displayName;
      if(roleEl) roleEl.textContent = role || 'Unternehmen';
      if(avatarEl){
        const parts = displayName.split(/\s+/).filter(Boolean);
        let initials = '';
        if(parts.length >= 2) initials = (parts[0][0] + parts[1][0]).toUpperCase();
        else if(parts.length === 1) initials = parts[0].slice(0,2).toUpperCase();
        else initials = 'TR';
        avatarEl.textContent = initials;
      }
    }catch(_){ }
  }
  window.syncPortalIdentity = syncPortalIdentity;

  document.addEventListener('DOMContentLoaded', ()=>{
    const search = document.getElementById('portal-global-search');
    if(search){
      search.addEventListener('keydown', (e)=>{
        if(e.key !== 'Enter') return;
        const q = search.value.trim();
        if(!q) return;
        try{
          switchAppPanel('marktplatz');
          const marketSearch = document.getElementById('m-f-search');
          if(marketSearch){ marketSearch.value = q; marketSearch.dispatchEvent(new Event('input',{bubbles:true})); }
        }catch(_){ }
      });
    }
    syncPortalIdentity();
    setTimeout(syncPortalIdentity, 700);
    setTimeout(syncPortalIdentity, 1800);
  });
})();

/* trassa-auth-bind */
window.trassaSubmitAuth = submitAuth;
window.submitAuth = submitAuth;
