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

async function submitAuth(event, mode){
  event.preventDefault(); const form=event.target; setLoadingButton(form,true);
  try{
    if(mode==='login'){
      const inputs=form.querySelectorAll('input');
      const out=await api('/auth/login',{method:'POST',body:JSON.stringify({email:inputs[0].value.trim(),password:inputs[1].value})});
      trassaUser=out.user; closeAuth(); enterApp(trassaUser.company?.name || ''); await trassaLoadDashboard();
    }else{
      const text=form.querySelector('input[type=text]').value.trim(); const role=document.getElementById('register-role').value;
      const inputs=form.querySelectorAll('input'); const out=await api('/auth/register',{method:'POST',body:JSON.stringify({company:text,role,email:inputs[1].value.trim(),password:inputs[2].value})});
      trassaUser=out.user; closeAuth(); enterApp(trassaUser.company?.name || text); await trassaLoadDashboard();
    }
  }catch(e){ alert(e.message); } finally{ setLoadingButton(form,false); }
  return false;
}

async function exitApp(){ try{await api('/auth/logout',{method:'POST'});}catch{} trassaUser=null; document.body.classList.remove('app-mode'); window.scrollTo(0,0); }

async function trassaBoot(){
  try{ const out=await api('/auth/me'); trassaUser=out.user; enterApp(trassaUser.name || trassaUser.company?.name || ''); }
  catch{ /* public mode */ }
}

async function trassaLoadDashboard(){
  try{const d=await api('/dashboard');
    const k=document.querySelectorAll('#panel-dashboard .kpi-card .num'); [d.kpi.open,d.kpi.transports,d.kpi.offers,d.kpi.messages].forEach((v,i)=>{if(k[i])k[i].textContent=v});
    const t=translations[lang]; const labels=lang==='de'?{gewicht:'Gewicht',zeit:'Zeitraum',spur:'Spurweite'}:{gewicht:'Weight',zeit:'Timeframe',spur:'Gauge'};
    document.getElementById('dash-req-list').innerHTML=(d.requests||[]).slice(0,3).map(r=>`<div class="req-row"><div><div class="r-route">${esc(r.route)}</div><div class="r-sub">#TR-${r.public_id}</div></div><div class="r-field"><span class="k">${labels.zeit}</span>${esc(r.zeit||'—')}</div><div class="r-field"><span class="k">${labels.gewicht}</span>${esc(r.gewicht||'—')}</div><div class="r-field"><span class="k">${labels.spur}</span>—</div><div class="req-badge ${r.gefahr?'gefahr':''}">${r.gefahr?'Gefahrgut':'Offen'}</div></div>`).join('');
    document.getElementById('dash-activity-list').innerHTML=(d.activity||[]).map(a=>`<div class="activity-item"><div class="ico">${esc(a.icon)}</div><div><div class="txt">${esc(a.text)}</div><div class="time">${new Date(a.created_at).toLocaleString(lang==='de'?'de-DE':'en-GB')}</div></div></div>`).join('');
  }catch(e){console.error(e)}
}

function esc(v){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}

function formatDateDMY(value){
  if(!value) return '—';
  const raw=String(value).slice(0,10);
  const m=raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(m) return `${m[3]}.${m[2]}.${m[1]}`;
  const d=new Date(value);
  if(Number.isNaN(d.getTime())) return String(value);
  const dd=String(d.getDate()).padStart(2,'0');
  const mm=String(d.getMonth()+1).padStart(2,'0');
  return `${dd}.${mm}.${d.getFullYear()}`;
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
  const t=translations[lang] || {};
  return t['status_'+status] || status || '—';
}
function renderRealRequestDetail(r){
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
  document.getElementById('req-detail-actions').innerHTML=offers>0
    ? `<button type="button" class="btn btn-primary" onclick="switchAppPanel('angebote')">${esc(labels.showOffers)} (${offers})</button>`
    : `<span class="status-badge ${statusClass[r.status]||'grey'}">${esc(requestStatusLabel(r.status))}</span>`;
}
async function openRequestDetail(index){
  currentRequestIndex=index;
  const listRow=trassaRequests[index];
  if(!listRow) return;
  try{
    // Fetch the selected row again by database UUID so the detail screen always
    // uses the authoritative PostgreSQL record, not any legacy demo array.
    const out=await api('/requests/'+encodeURIComponent(listRow.id));
    const r=out.request || listRow;
    window.__trassaCurrentRequest=r;
    await switchAppPanel('anfrage-detail');
    renderRealRequestDetail(r);
  }catch(e){
    window.__trassaCurrentRequest=listRow;
    await switchAppPanel('anfrage-detail');
    renderRealRequestDetail(listRow);
    apiToast(e.message);
  }
}
window.openRequestDetail=openRequestDetail;
window.renderRealRequestDetail=renderRealRequestDetail;

async function renderMarketRequests(){
  try{const q=document.getElementById('m-f-search')?.value.trim()||'';const out=await api('/requests'+(q?'?q='+encodeURIComponent(q):''));const list=out.requests||[];document.getElementById('m-req-list').innerHTML=list.map(r=>`<div class="req-row"><div><div class="r-route">${esc(r.route)}</div><div class="r-sub">#TR-${r.public_id} · ${esc(r.title)}</div></div><div class="r-field"><span class="k">Zeitraum</span>${esc(r.zeit||'—')}</div><div class="r-field"><span class="k">Gewicht</span>${esc(r.gewicht||'—')}</div><div class="r-field"><span class="k">Wagenart</span>${esc(r.wagon_type||'—')}</div><div class="req-badge ${r.gefahr?'gefahr':''}">${r.gefahr?'Gefahrgut':'Offen'}</div></div>`).join('')||'<div class="no-results">Keine Anfragen gefunden.</div>';}catch(e){apiToast(e.message)}
}
function populateMarketFilters(){}

async function renderOffers(){
  try{const out=await api('/offers');trassaOffers=out.offers||[];document.getElementById('offers-list').innerHTML=trassaOffers.map((o,i)=>`<div class="list-row clickable" onclick="openOfferDetail(${i})"><div><div class="l-main">${esc(o.route)}</div><div class="l-sub">${esc(o.partner)}</div></div><div class="l-field"><span class="k">Datum</span>${new Date(o.created_at||o.date).toLocaleDateString(lang==='de'?'de-DE':'en-GB')}</div><div class="l-field"><span class="k">Preis</span>${esc(o.price)}</div>${o.status==='pending'&&o.request_company===trassaUser?.company?.id?`<div style="display:flex;gap:8px;"><button type="button" class="btn btn-primary" onclick="event.stopPropagation();offerAction(${i},'accepted')">Annehmen</button><button type="button" class="btn btn-ghost" onclick="event.stopPropagation();offerAction(${i},'declined')">Ablehnen</button></div>`:`<div class="status-badge ${statusClass[o.status]||'grey'}">${esc(o.status)}</div>`}</div>`).join('')||'<div class="no-results">Keine Angebote vorhanden.</div>';}catch(e){apiToast(e.message)}
}
async function offerAction(index,newStatus){try{await api('/offers/'+trassaOffers[index].id,{method:'PATCH',body:JSON.stringify({status:newStatus})});apiToast(newStatus==='accepted'?'Angebot angenommen.':'Angebot abgelehnt.');await renderOffers();await trassaLoadDashboard();}catch(e){apiToast(e.message)}}
async function openOfferDetail(index){currentOfferIndex=index;const o=trassaOffers[index];if(!o)return;document.getElementById('offer-detail-h1').textContent=o.route;document.getElementById('offer-detail-sub').textContent=o.partner;document.getElementById('offer-detail-grid').innerHTML=[['Strecke',o.route],['Anbieter',o.partner],['Preis',o.price],['Eingegangen am',new Date(o.created_at||o.date).toLocaleDateString(lang==='de'?'de-DE':'en-GB')],['Ansprechpartner',o.contact||'—'],['Gültig bis',o.validUntil||'—'],['Status',o.status]].map(([k,v])=>`<div class="detail-item"><span class="k">${esc(k)}</span><div class="v">${esc(v)}</div></div>`).join('');document.getElementById('offer-detail-note').textContent=o.note||'—';document.getElementById('offer-detail-actions').innerHTML=o.status==='pending'?`<button type="button" class="btn btn-primary" onclick="offerAction(${index},'accepted')">Annehmen</button><button type="button" class="btn btn-ghost" onclick="offerAction(${index},'declined')">Ablehnen</button>`:`<span class="status-badge ${statusClass[o.status]||'grey'}">${esc(o.status)}</span>`;switchAppPanel('angebot-detail')}

async function renderTransports(){try{const out=await api('/transports');document.getElementById('transp-list').innerHTML=(out.transports||[]).map(tr=>`<div class="list-row cols-3"><div><div class="l-main">${esc(tr.route)}</div><div class="l-sub">${esc(tr.id)}</div></div><div class="l-field"><span class="k">Zeitraum</span>${esc(tr.zeit||'—')}</div><div class="status-badge ${statusClass[tr.status]||'grey'}">${esc(tr.status)}</div></div>`).join('')||'<div class="no-results">Keine Transporte vorhanden.</div>'}catch(e){apiToast(e.message)}}

async function renderMessages(){try{const out=await api('/conversations');trassaConversations=out.conversations||[];document.getElementById('conv-list').innerHTML=trassaConversations.map((c,i)=>`<div class="conv-item ${i===0?'active':''}" onclick="selectConversation(${i})"><div class="c-name">${esc(c.names)}${c.unread?`<span class="c-unread">${c.unread}</span>`:''}</div><div class="c-last">${esc(c.last)}</div><div class="c-time">${new Date(c.last_at).toLocaleString(lang==='de'?'de-DE':'en-GB')}</div></div>`).join('')||'<div class="app-placeholder"><div class="ico">💬</div><h2>Noch keine Gespräche</h2><p>Nach einem Angebot können hier Nachrichten ausgetauscht werden.</p></div>';if(trassaConversations[0])await selectConversation(0)}catch(e){apiToast(e.message)}}
async function selectConversation(i){trassaCurrentConversation=trassaConversations[i];if(!trassaCurrentConversation)return;document.querySelectorAll('.conv-item').forEach((x,n)=>x.classList.toggle('active',n===i));const out=await api('/conversations/'+trassaCurrentConversation.id+'/messages');trassaMessages=out.messages||[];document.getElementById('conv-thread-head').textContent=trassaCurrentConversation.names;document.getElementById('conv-thread-body').innerHTML=trassaMessages.map(m=>`<div class="bubble ${m.sender_user_id===trassaUser.id?'out':'in'}">${esc(m.body)}<span class="meta mono">${new Date(m.created_at).toLocaleString(lang==='de'?'de-DE':'en-GB')}</span></div>`).join('');const b=document.getElementById('conv-thread-body');b.scrollTop=b.scrollHeight;}
async function sendMessage(event){event.preventDefault();const input=document.getElementById('msg-input');const body=input.value.trim();if(!body||!trassaCurrentConversation)return false;try{await api('/conversations/'+trassaCurrentConversation.id+'/messages',{method:'POST',body:JSON.stringify({body})});input.value='';await selectConversation(trassaConversations.indexOf(trassaCurrentConversation));}catch(e){apiToast(e.message)}return false}

async function renderDocuments(){try{const out=await api('/documents');trassaDocs=out.documents||[];document.getElementById('doc-list').innerHTML=trassaDocs.map(d=>`<div class="doc-row"><div class="d-ico">📎</div><div class="d-main"><div class="d-name">${esc(d.original_name)}</div><div class="d-meta">${Math.round(d.size_bytes/1024)} KB · ${new Date(d.created_at).toLocaleDateString(lang==='de'?'de-DE':'en-GB')}</div></div><button type="button" class="btn btn-ghost" onclick="downloadDoc('${d.id}')">Herunterladen</button></div>`).join('')||'<div class="no-results">Keine Dokumente vorhanden.</div>'}catch(e){apiToast(e.message)}}
async function downloadDoc(id){window.open('/api/documents/'+id+'/download','_blank')}

async function renderBilling(){try{const out=await api('/billing');document.getElementById('bill-kpi-grid').innerHTML=`<div class="stat-card"><div class="stat-label">Rechnungen</div><div class="stat-value">${out.invoices.length}</div><div class="stat-sub">Gesamt</div></div><div class="stat-card"><div class="stat-label">Offen</div><div class="stat-value">${out.stats.open}</div><div class="stat-sub">Unbezahlt</div></div><div class="stat-card"><div class="stat-label">Bezahlt</div><div class="stat-value">${out.stats.paid}</div><div class="stat-sub">Abgeschlossen</div></div>`;document.getElementById('invoice-list').innerHTML=out.invoices.map(i=>`<tr><td class="mono">${esc(i.invoice_number)}</td><td>${esc(i.type)}</td><td>${(i.amount_cents/100).toLocaleString('de-DE',{style:'currency',currency:'EUR'})}</td><td class="mono">${esc(i.invoice_date)}</td><td><span class="status-badge ${statusClass[i.status]||'grey'}">${esc(i.status)}</span></td></tr>`).join('')}catch(e){apiToast(e.message)}}
async function loadSettings(){try{const out=await api('/settings');const c=out.company;document.getElementById('set-company').value=c.name||'';document.getElementById('set-contact').value=c.contact_name||'';document.getElementById('set-email').value=trassaUser.email||'';document.getElementById('set-phone').value=c.phone||'';const a=document.querySelector('#settings-form input[name=notification_offers]');if(a)a.checked=c.notification_offers}catch(e){apiToast(e.message)}}
async function submitSettings(event){event.preventDefault();try{await api('/settings',{method:'PATCH',body:JSON.stringify({company:document.getElementById('set-company').value.trim(),contact:document.getElementById('set-contact').value.trim(),email:document.getElementById('set-email').value.trim(),phone:document.getElementById('set-phone').value.trim(),notification_offers:true,notification_messages:true})});document.getElementById('app-company').textContent=', '+document.getElementById('set-company').value.trim();apiToast('Einstellungen gespeichert.')}catch(e){apiToast(e.message)}return false}

async function publishNewRequest(){return createRequest('new')}
async function saveDraftRequest(){return createRequest('draft')}
async function createRequest(status){window.__trassaCurrentRequest=null;const data=collectNewRequestData();if((status==='new'&&(!data.start||!data.ziel||!data.titel))||(!data.start&&!data.ziel&&!data.titel)){apiToast('Bitte Pflichtfelder ausfüllen.');return}try{await api('/requests',{method:'POST',body:JSON.stringify({...data,status})});apiToast(status==='new'?'Anfrage veröffentlicht.':'Entwurf gespeichert.');switchAppPanel('anfragen');}catch(e){apiToast(e.message)}}

const oldSwitchAppPanel=window.switchAppPanel;
window.switchAppPanel=async function(name){oldSwitchAppPanel(name);if(!trassaUser)return;try{if(name==='dashboard')await trassaLoadDashboard();if(name==='marktplatz')await renderMarketRequests();if(name==='anfragen')await renderMyRequests();if(name==='angebote')await renderOffers();if(name==='transporte')await renderTransports();if(name==='nachrichten')await renderMessages();if(name==='dokumente')await renderDocuments();if(name==='abrechnung')await renderBilling();if(name==='einstellungen')await loadSettings();}catch(e){console.error(e)}};

window.addEventListener('load', () => {
  setTimeout(trassaBoot, 0);
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
  function syncPortalIdentity(){
    try{
      const user = window.trassaUser || null;
      const company = user?.company?.name || user?.company_name || user?.name || document.getElementById('app-company')?.textContent?.replace(/^\s*[·—-]?\s*/, '') || 'TRASSA Nutzer';
      const role = user?.company?.role || user?.role || user?.company_role || 'Unternehmen';
      const companyEl = document.getElementById('portal-company-name');
      const roleEl = document.getElementById('portal-company-role');
      const avatarEl = document.getElementById('portal-avatar');
      if(companyEl) companyEl.textContent = company || 'TRASSA Nutzer';
      if(roleEl) roleEl.textContent = role || 'Unternehmen';
      if(avatarEl){
        const initials = String(company || 'TR').split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]).join('').toUpperCase();
        avatarEl.textContent = initials || 'TR';
      }
    }catch(_){ }
  }

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
