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

async function renderMyRequests(){
  try{const out=await api('/requests?mine=true');trassaRequests=out.requests||[];document.getElementById('myreq-list').innerHTML=trassaRequests.map((r,i)=>`<div class="list-row clickable" onclick="openRequestDetail(${i})"><div><div class="l-main">${esc(r.route)}</div><div class="l-sub">#TR-${r.public_id}</div></div><div class="l-field"><span class="k">Erstellt</span>${new Date(r.created_at).toLocaleDateString(lang==='de'?'de-DE':'en-GB')}</div><div class="l-field"><span class="k">Angebote</span>${r.offers}</div><div class="status-badge ${statusClass[r.status]||'grey'}">${esc(r.status)}</div></div>`).join('') || '<div class="no-results">Keine Anfragen vorhanden.</div>';}catch(e){apiToast(e.message)}
}
async function openRequestDetail(index){ currentRequestIndex=index; const r=trassaRequests[index]; if(!r)return; document.getElementById('req-detail-h1').textContent=r.title||r.route;document.getElementById('req-detail-sub').textContent='#TR-'+r.public_id;document.getElementById('req-detail-grid').innerHTML=[['Strecke',r.route],['Zeitraum',r.zeit],['Gewicht',r.gewicht],['Lichtraumprofil',r.loading_gauge||'—'],['Wagenart',r.wagon_type||'—'],['Gefahrgut',r.hazardous_goods?'Ja':'Nein'],['Erstellt am',new Date(r.created_at).toLocaleDateString(lang==='de'?'de-DE':'en-GB')],['Angebote',r.offers],['Status',r.status]].map(([k,v])=>`<div class="detail-item"><span class="k">${esc(k)}</span><div class="v">${esc(v)}</div></div>`).join('');document.getElementById('req-detail-desc').textContent=r.description||'—';document.getElementById('req-detail-actions').innerHTML=r.offers>0?`<button type="button" class="btn btn-primary" onclick="switchAppPanel('angebote')">Angebote ansehen (${r.offers})</button>`:`<span class="status-badge ${statusClass[r.status]||'grey'}">${esc(r.status)}</span>`;switchAppPanel('anfrage-detail'); }

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
async function createRequest(status){const data=collectNewRequestData();if((status==='new'&&(!data.start||!data.ziel||!data.titel))||(!data.start&&!data.ziel&&!data.titel)){apiToast('Bitte Pflichtfelder ausfüllen.');return}try{await api('/requests',{method:'POST',body:JSON.stringify({...data,status})});apiToast(status==='new'?'Anfrage veröffentlicht.':'Entwurf gespeichert.');switchAppPanel('anfragen');}catch(e){apiToast(e.message)}}

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
