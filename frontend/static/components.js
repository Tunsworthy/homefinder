(function(){
  const HF = {}
  // Helpers
  HF.escapeHtml = function(s){ if (s===null || typeof s==='undefined') return ''; const str=String(s); return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;') }
  HF.stripHtml = function(s){ if (s===null || typeof s==='undefined') return ''; return String(s).replace(/<[^>]*>/g,'') }
  HF.parseTimeRange = function(timeStr){
    if(!timeStr) return null;
    const normalized = timeStr.replace(/[\u2013\u2014]/g,'-'); // replace en/em dash
    const parts = normalized.split('-').map(s=>s.trim());
    return parts.length===2 ? {start:parts[0], end:parts[1]} : {start:normalized, end:null}
  }
  HF.convertTo24Hour = function(time12h){ if(!time12h) return ''; const match = time12h.match(/(\d{1,2}):(\d{2})\s*(am|pm)/i); if(!match) return time12h; let [_, hours, minutes, period] = match; hours = parseInt(hours); if(period.toLowerCase()==='pm' && hours!==12) hours+=12; if(period.toLowerCase()==='am' && hours===12) hours=0; return `${String(hours).padStart(2,'0')}:${minutes}` }
  HF.getNextInspection = function(inspections){
    if(!inspections||!Array.isArray(inspections)||inspections.length===0) return null;
    const now = new Date();
    const dayMap={'monday':1,'tuesday':2,'wednesday':3,'thursday':4,'friday':5,'saturday':6,'sunday':0};
    for(const insp of inspections){
      const dayStr = (insp.day||'').toLowerCase();
      const dayMatch = dayStr.match(/monday|tuesday|wednesday|thursday|friday|saturday|sunday/);
      const dayKey = dayMatch ? dayMatch[0] : null;
      const dayNum=dayKey? dayMap[dayKey] : undefined;
      if(dayNum===undefined) continue;
      const timeRange=HF.parseTimeRange(insp.time);
      if(!timeRange) continue;
      let nextDate=new Date(now);
      const currentDay=now.getDay();
      const daysUntil=(dayNum-currentDay+7)%7;
      nextDate.setDate(now.getDate()+(daysUntil===0?7:daysUntil));
      const time24=HF.convertTo24Hour(timeRange.start);
      const parts = time24.split(':');
      if(parts.length<2) continue;
      const [h,m]=parts;
      nextDate.setHours(parseInt(h,10),parseInt(m,10),0,0);
      if(nextDate>now) return {day:insp.day, time:insp.time, date:nextDate}
    }
    return null
  }
  HF.setToggleVisual = function(btn, on, color){ if(!btn) return; btn.classList.remove('bg-green-600','bg-red-600','bg-gray-200','bg-gray-100','text-white','text-gray-800'); if(on){ let c='bg-green-600'; if(color==='blue') c='bg-blue-600'; if(color==='red') c='bg-red-600'; btn.classList.add(c,'text-white') } else { btn.classList.add('bg-gray-200','text-gray-800') } }

  // Tooltip
  let tooltipEl=null
  HF.ensureTooltip = function(){ if(!tooltipEl){ tooltipEl=document.createElement('div'); tooltipEl.className='z-50 p-2 bg-white border rounded shadow text-sm max-w-xs'; tooltipEl.style.position='absolute'; tooltipEl.style.display='none'; document.body.appendChild(tooltipEl) } }
  HF.showTooltip = function(x,y,html){ HF.ensureTooltip(); tooltipEl.innerHTML=html; tooltipEl.style.left=(x+12)+'px'; tooltipEl.style.top=(y+12)+'px'; tooltipEl.style.display='block' }
  HF.moveTooltip = function(x,y){ if(tooltipEl){ tooltipEl.style.left=(x+12)+'px'; tooltipEl.style.top=(y+12)+'px' } }
  HF.hideTooltip = function(){ if(tooltipEl) tooltipEl.style.display='none' }

  // Commute helpers
  HF.buildGoogleMapsLink = function(origin, destination, mode){ try{ const qs=new URLSearchParams(); qs.set('api','1'); if(origin) qs.set('origin', origin); if(destination) qs.set('destination', destination); if(mode) qs.set('travelmode', mode==='transit'?'transit':mode); return `https://www.google.com/maps/dir/?${qs.toString()}` }catch(e){ return '#' } }
  HF.commuteNameToIcon = function(name){ if(!name) return '🚆'; const n=name.toString().toLowerCase(); if(n.includes('work')||n.includes('office')||n.includes('job')) return '💼'; if(n.includes('church')||n.includes('chapel')||n.includes('temple')) return '⛪'; if(n.includes('school')||n.includes('uni')||n.includes('college')) return '🎓'; if(n.includes('gym')||n.includes('fitness')) return '🏋️'; if(n.includes('shop')||n.includes('grocery')||n.includes('supermarket')) return '🛒'; if(n.includes('park')||n.includes('walk')) return '🚶'; if(n.includes('drive')||n.includes('car')||n.includes('driving')) return '🚗'; return '🚆' }
  HF.loadAndRenderCommutes = async function(listingId, containerEl, item){ if(!listingId||!containerEl) return; try{ const res=await fetch(`/commute/${listingId}.json`); if(!res.ok) return; const j=await res.json(); const commutes=j&&j.commutes?j.commutes:[]; if(!commutes.length) return; containerEl.innerHTML=''; for(const c of commutes){ const name=c.name||(c.destination||''); const mode=(c.mode||(c.result&&c.result.raw_response&&c.result.raw_response.request&&c.result.raw_response.request.travelMode)||'transit').toLowerCase(); const icon=HF.commuteNameToIcon(name); let minsLabel=''; try{ const rr=c.result&&c.result.raw_response; const dur=rr&&rr.routes&&rr.routes[0]&&rr.routes[0].legs&&rr.routes[0].legs[0]&&rr.routes[0].legs[0].duration&&rr.routes[0].legs[0].duration.value; if(dur) minsLabel=`${Math.round(dur/60)} min`; else if(c.result&&c.result.summary) minsLabel=c.result.summary }catch(e){ minsLabel=c.result&&c.result.summary?c.result.summary:'' } const badge=document.createElement('a'); badge.className='commute-badge inline-block mr-2 px-2 py-1 rounded text-sm bg-gray-100 hover:bg-gray-200 text-gray-800'; badge.href=HF.buildGoogleMapsLink(item.address||'', c.destination||'', mode); badge.target='_blank'; let summaryText=''; if(c.result&&c.result.summary){ if(typeof c.result.summary==='string') summaryText=c.result.summary; else if(c.result.summary.duration_text) summaryText=c.result.summary.duration_text; else summaryText=JSON.stringify(c.result.summary) } let nearestStr=''; let nearestObj=c.result&&c.result.nearest_station; if(nearestObj){ if(typeof nearestObj==='string') nearestStr=nearestObj; else if(nearestObj.name){ const mins=nearestObj.walking_seconds?Math.round((nearestObj.walking_seconds||0)/60):null; nearestStr=nearestObj.name+(mins?` (${mins} min walk)`: '') } else { nearestStr=JSON.stringify(nearestObj) } } badge.innerHTML=`${icon} <strong class="mr-1">${minsLabel||''}</strong>`; badge.addEventListener('mouseenter',(e)=>{ let stepsHtml=''; try{ const rr=c.result&&c.result.raw_response; const leg=rr&&rr.routes&&rr.routes[0]&&rr.routes[0].legs&&rr.routes[0].legs[0]; if(leg&&Array.isArray(leg.steps)){ for(const s of leg.steps){ const m=(s.travel_mode||(s.transit_details?'TRANSIT':'')) .toUpperCase(); const instr=HF.stripHtml(s.html_instructions||s.instructions||s.summary||''); const dur=(s.duration&&s.duration.text)?s.duration.text:(s.duration&&typeof s.duration.value==='number'?Math.round(s.duration.value/60)+' mins':''); if(m==='WALKING'){ stepsHtml+=`<div class="text-xs text-gray-700">Walk ${HF.escapeHtml(dur)} — ${HF.escapeHtml(instr)}</div>` } else if(m==='TRANSIT'){ const td=s.transit_details||{}; const line=td.line||{}; const vehicle=(line.vehicle&&line.vehicle.type)?line.vehicle.type:(line.short_name||line.name||'Transit'); const nameLabel=line.short_name||line.name||''; const headsign=td.headsign?` → ${HF.escapeHtml(HF.stripHtml(td.headsign))}`:''; const stops=td.num_stops?` (${td.num_stops} stops)`:''; stepsHtml+=`<div class="text-xs text-gray-700">${HF.escapeHtml(vehicle)} ${HF.escapeHtml(nameLabel)} ${HF.escapeHtml(dur)}${headsign}${stops}</div>` } else { stepsHtml+=`<div class="text-xs text-gray-700">${HF.escapeHtml(m)} ${HF.escapeHtml(dur)} — ${HF.escapeHtml(instr)}</div>` } } } else { stepsHtml=`<div class="text-xs text-gray-700">${HF.escapeHtml(summaryText||'')}</div>` } }catch(err){ stepsHtml=`<div class="text-xs text-gray-700">${HF.escapeHtml(summaryText||'')}</div>` } HF.showTooltip(e.pageX,e.pageY,`<div class="font-medium">${HF.escapeHtml(name)}</div>${stepsHtml}`) }); badge.addEventListener('mousemove',(e)=>HF.moveTooltip(e.pageX,e.pageY)); badge.addEventListener('mouseleave',HF.hideTooltip); containerEl.appendChild(badge); if(nearestStr){ const nbadge=document.createElement('a'); nbadge.className='nearest-badge inline-block mr-2 px-2 py-1 rounded text-sm bg-blue-50 hover:bg-blue-100 text-blue-700'; const stationTarget=(nearestObj&&nearestObj.name)?nearestObj.name:nearestStr; nbadge.href=HF.buildGoogleMapsLink(item.address||'', stationTarget, 'walking'); nbadge.target='_blank'; nbadge.innerHTML=`🚉 <span class="text-xs">${HF.escapeHtml(nearestStr)}</span>`; nbadge.addEventListener('mouseenter',(e)=>HF.showTooltip(e.pageX,e.pageY,`<div class="font-medium">Nearest station</div><div class="text-xs">${HF.escapeHtml(nearestStr)}</div>`)); nbadge.addEventListener('mousemove',(e)=>HF.moveTooltip(e.pageX,e.pageY)); nbadge.addEventListener('mouseleave',HF.hideTooltip); containerEl.appendChild(nbadge) } } if(j&&j.nearest_station){ const ns=j.nearest_station; if(ns&&(ns.walking_seconds||ns.walking_seconds===0)){ const mins=(typeof ns.walking_seconds==='number')?Math.round(ns.walking_seconds/60)+' mins':''; const nsBadge=document.createElement('a'); nsBadge.className='inline-block px-2 py-1 mr-2 mb-1 text-sm bg-yellow-100 rounded nearest-station-badge'; const origin=j.address|| (item&&item.address)||''; const destination=ns.name||''; nsBadge.href=HF.buildGoogleMapsLink(origin,destination,'walking'); nsBadge.target='_blank'; nsBadge.rel='noopener noreferrer'; nsBadge.title=destination+(mins?` — ${mins}`:''); nsBadge.innerHTML=`<span class="mr-1">🚶 🚆</span> <span class="font-medium">${HF.escapeHtml(mins)}</span>`; containerEl.appendChild(nsBadge) } } }catch(e){ console.error('commute load failed', e) } }

  // Votes
  HF.buildScoreHtml = function(person, currentScore){ let html='<div class="inline-flex items-center gap-1">'; for(let s=1;s<=5;s++){ const sel=(currentScore&&Number(currentScore)===s)?'bg-yellow-500 text-white':'bg-white'; html+=`<div class="score-circle w-6 h-6 rounded-full border flex items-center justify-center text-xs cursor-pointer ${sel}" data-score="${s}" data-person="${person}">${s}</div>` } html+='</div>'; return html }
  HF.attachScoreHandlers = function(parentEl, person, id){ if(!parentEl) return; parentEl.querySelectorAll('.score-circle').forEach(sc=>{ sc.addEventListener('click', async (ev)=>{ ev.preventDefault(); ev.stopPropagation(); const score=Number(sc.getAttribute('data-score')); const payload={}; if(person==='tom'){ payload.tom=true; payload.tom_score=score } else { payload.mq=true; payload.mq_score=score } try{ const resp=await fetch(`/api/listing/${id}/vote`, {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload)}); const j=await resp.json().catch(()=>null); if(j&&j.ok){ parentEl.querySelectorAll('.score-circle').forEach(c=>c.classList.remove('bg-yellow-500','text-white')); const sel=parentEl.querySelector(`.score-circle[data-score="${score}"]`); if(sel) sel.classList.add('bg-yellow-500','text-white') } }catch(e){ console.error('score save failed', e) } }) }) }
  HF.initVoteButtons = function(containerEl, item){ if(!containerEl) return; const id=item.id; const tomYes=containerEl.querySelector('.tom-yes'), tomNo=containerEl.querySelector('.tom-no'), mqYes=containerEl.querySelector('.mq-yes'), mqNo=containerEl.querySelector('.mq-no'); HF.setToggleVisual(tomYes, item.tom===true, 'green'); HF.setToggleVisual(tomNo, item.tom===false, 'red'); HF.setToggleVisual(mqYes, item.mq===true, 'green'); HF.setToggleVisual(mqNo, item.mq===false, 'red'); const tomScore=containerEl.querySelector('.tom-score'), mqScore=containerEl.querySelector('.mq-score'); if(tomScore){ tomScore.innerHTML=(item.tom===true)?HF.buildScoreHtml('tom', item.tom_score):''; tomScore.style.display=(item.tom===true)?'inline-block':'none'; HF.attachScoreHandlers(tomScore,'tom',id) } if(mqScore){ mqScore.innerHTML=(item.mq===true)?HF.buildScoreHtml('mq', item.mq_score):''; mqScore.style.display=(item.mq===true)?'inline-block':'none'; HF.attachScoreHandlers(mqScore,'mq',id) } containerEl.querySelectorAll('.vote-btn').forEach(btn=>{ btn.addEventListener('click', async (ev)=>{ ev.preventDefault(); ev.stopPropagation(); const person=btn.getAttribute('data-person'); const val=btn.getAttribute('data-val')==='true'; try{ const resp=await fetch(`/api/listing/${id}/vote`, {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({[person]: val})}); const j=await resp.json().catch(()=>({})); const tVal=(typeof j.tom!=='undefined')?j.tom:null; const mVal=(typeof j.mq!=='undefined')?j.mq:null; HF.setToggleVisual(tomYes, tVal===true, 'green'); HF.setToggleVisual(tomNo, tVal===false, 'red'); HF.setToggleVisual(mqYes, mVal===true, 'green'); HF.setToggleVisual(mqNo, mVal===false, 'red'); if(typeof tVal!=='undefined' && tomScore){ if(tVal===true && (!tomScore.innerHTML||tomScore.innerHTML.trim()==='')) tomScore.innerHTML=HF.buildScoreHtml('tom', j.tom_score); tomScore.style.display=(tVal===true)?'inline-block':'none'; HF.attachScoreHandlers(tomScore,'tom',id) } if(typeof mVal!=='undefined' && mqScore){ if(mVal===true && (!mqScore.innerHTML||mqScore.innerHTML.trim()==='')) mqScore.innerHTML=HF.buildScoreHtml('mq', j.mq_score); mqScore.style.display=(mVal===true)?'inline-block':'none'; HF.attachScoreHandlers(mqScore,'mq',id) } }catch(e){ console.error('vote failed', e) } }) }) }

  // Navbar
  HF.renderNavbar = function(pageTitle){ 
    const nav = document.getElementById('navbar') || document.createElement('nav')
    nav.id = 'navbar'
    nav.className = 'bg-white shadow sticky top-0 z-40'
    nav.innerHTML = `<div class="max-w-6xl mx-auto px-4 py-3 flex items-center gap-4"><div class="relative"><button id="nav-menu-toggle" class="p-2 hover:bg-gray-100 rounded" aria-label="Menu"><i class="fa-solid fa-bars text-lg"></i></button><div id="nav-menu" class="hidden absolute left-0 mt-2 w-48 bg-white border rounded shadow z-50"><a href="/" class="block px-4 py-2 hover:bg-gray-100 text-sm">List View</a><a href="/map" class="block px-4 py-2 hover:bg-gray-100 text-sm">Map View</a><a href="/plan" class="block px-4 py-2 hover:bg-gray-100 text-sm">Inspection Planner</a></div></div><h1 class="text-xl font-semibold">${HF.escapeHtml(pageTitle||'Housefinder')}</h1></div>`
    if (!document.getElementById('navbar')) document.body.insertBefore(nav, document.body.firstChild)
    const toggle = document.getElementById('nav-menu-toggle')
    const menu = document.getElementById('nav-menu')
    if (toggle && menu) {
      toggle.addEventListener('click', () => menu.classList.toggle('hidden'))
      document.querySelectorAll('#nav-menu a').forEach(link => {
        link.addEventListener('click', () => menu.classList.add('hidden'))
      })
    }
  }

  // Comments
  HF.makeCommentsHtml = function(comments, mode){ const list = Array.isArray(comments)? comments.slice(): []; let subset = list; if(mode==='top3'){ subset = list.slice(0,3) } else if(mode==='latest'){ subset = list.slice(0,1) } const body = subset.length? subset.map(c=>`<div class="comment-item text-sm border rounded p-2 mb-1 flex items-start justify-between" data-cid="${HF.escapeHtml(c.id)}"><div class="comment-body flex-1 min-w-0"><strong>${c.person==='tom'?'Tom':'MQ'}:</strong><div class="comment-main min-w-0"><span class="comment-text ml-2 block break-words">${HF.escapeHtml(c.text).replace(/\n/g,'<br>')}</span></div><div class="comment-ts text-xs text-gray-400 mt-1">${new Date((c.ts||0)*1000).toLocaleString()}</div></div><div class="ml-3 flex items-center flex-shrink-0"><button class="edit-comment text-xs ml-2 px-2 py-1" title="Edit">✏️</button><button class="del-comment text-xs ml-1 px-2 py-1 text-red-500" title="Delete">🗑️</button></div></div>`).join('') : '<div class="text-sm text-gray-500">No comments</div>'
    return `<div class="existing-comments">${body}</div>` }

  // Workflow Status
  HF.getStatusBadge = function(workflowStatus){ const status = workflowStatus || 'active'; const statusConfig = { 'active': {label: 'Active', color: 'bg-gray-200 text-gray-800'}, 'reviewed': {label: 'Reviewed', color: 'bg-blue-100 text-blue-800'}, 'enquiry_sent': {label: 'Enquiry Sent', color: 'bg-purple-100 text-purple-800'}, 'inspection_planned': {label: 'Inspection Planned', color: 'bg-yellow-100 text-yellow-800'}, 'inspected': {label: 'Inspected', color: 'bg-orange-100 text-orange-800'}, 'thinking': {label: 'Thinking', color: 'bg-indigo-100 text-indigo-800'}, 'offer': {label: 'Offer', color: 'bg-green-100 text-green-800'}, 'rejected': {label: 'Rejected', color: 'bg-red-100 text-red-800'} }; const config = statusConfig[status] || statusConfig['active']; return `<span class="inline-block px-2 py-1 rounded text-xs font-medium ${config.color}">${config.label}</span>` }

  HF.initCommentEditor = function(containerEl, listingId){ if(!containerEl) return; // toggle
    const toggle = containerEl.querySelector('.toggle-new-comment'); const area = containerEl.querySelector('.new-comment-area'); const input = containerEl.querySelector('.new-comment-input')
    if(toggle && area){ toggle.addEventListener('click', ()=>{ const vis=area.classList.contains('hidden'); area.classList.toggle('hidden', !vis); toggle.setAttribute('aria-expanded', vis?'true':'false'); if(vis && input) input.focus() }) }
    // add
    containerEl.querySelectorAll('.new-comment-save').forEach(btn=>{ btn.addEventListener('click', async ()=>{ const person=btn.getAttribute('data-person'); const text=input? (input.value||'') : ''; if(!text.trim()) return; try{ const resp=await fetch(`/api/listing/${listingId}/comment`, {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({person, text})}); const j=await resp.json().catch(()=>null); if(j&&j.ok){ if(input) input.value=''; if(area) area.classList.add('hidden'); // prepend
            const listEl = containerEl.querySelector('.existing-comments'); if(listEl){ const tmp = document.createElement('div'); tmp.innerHTML = HF.makeCommentsHtml([{...j.comment}, ...[]], 'latest'); const first = tmp.querySelector('.comment-item'); if(first) listEl.prepend(first) }
          } }catch(e){ console.error('create failed', e) } }) })
    // edit/delete
    function wireCommentRow(wrapper){ const editBtn=wrapper.querySelector('.edit-comment'); const delBtn=wrapper.querySelector('.del-comment'); const cid=wrapper.getAttribute('data-cid'); const txtEl=wrapper.querySelector('.comment-text'); if(editBtn){ editBtn.addEventListener('click', async (ev)=>{ ev.preventDefault(); if(editBtn.dataset.editing==='true'){ const newText=txtEl.innerText||''; try{ const resp=await fetch(`/api/listing/${listingId}/comment/${cid}`, {method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({text:newText})}); const j=await resp.json().catch(()=>null); if(!(j&&j.ok)) return }catch(e){ console.error('edit failed', e) } txtEl.contentEditable='false'; txtEl.classList.remove('inline-editing'); editBtn.dataset.editing='false'; editBtn.textContent='✏️' } else { editBtn.dataset.editing='true'; editBtn.textContent='✓'; txtEl.dataset.origText=txtEl.innerText||''; txtEl.contentEditable='true'; txtEl.classList.add('inline-editing'); txtEl.focus() } }) }
      if(delBtn){ delBtn.addEventListener('click', async (ev)=>{ ev.preventDefault(); if(!confirm('Delete comment?')) return; try{ const resp=await fetch(`/api/listing/${listingId}/comment/${cid}`, {method:'DELETE'}); const j=await resp.json().catch(()=>null); if(j&&j.ok) wrapper.remove() }catch(e){ console.error('delete failed', e) } }) } }
    containerEl.querySelectorAll('.comment-item').forEach(wireCommentRow)
  }

  // Render listing content. Returns the created element if node is null, otherwise fills node.
  HF.renderListingContent = function(node, item, options){ const opts = Object.assign({commentsMode:'none', showDomain:true, compact:false, showLinks:true, includeCommentEditor:false, skipImages:false}, options||{})
    const el = node || document.createElement('div')
    let imgHtml = ''
    if(!opts.skipImages){
      if(item.images && item.images.length > 1){ imgHtml = `<div class="relative group"><div class="carousel-container" data-carousel-id="${item.id}">${item.images.map((img,idx)=>`<img src="${img}" class="carousel-image w-full ${opts.compact?'h-40':'h-48'} object-cover rounded mb-2 ${idx===0?'active':''}" data-carousel-id="${item.id}" data-image-index="${idx}" style="display:${idx===0?'block':'none'}">`).join('')}</div><div class="absolute inset-y-0 left-0 flex items-center pl-2"><button class="carousel-prev bg-black bg-opacity-50 text-white p-2 rounded-l rounded text-sm" data-carousel-id="${item.id}">←</button></div><div class="absolute inset-y-0 right-0 flex items-center pr-2"><button class="carousel-next bg-black bg-opacity-50 text-white p-2 rounded-r rounded text-sm" data-carousel-id="${item.id}">→</button></div><div class="absolute bottom-2 left-2 bg-black bg-opacity-50 text-white text-xs px-2 py-1 rounded">${item.images.length} photos</div></div>` } else if(item.image){ imgHtml = `<img src="${item.image}" class="w-full ${opts.compact?'h-40':'h-48'} object-cover rounded mb-2" alt="">` }
    }
    const price = item.price ? `<div class="text-sm text-gray-800">${HF.escapeHtml(item.price)}</div>` : ''
    const stats = `<div class="flex items-center gap-4 text-sm text-gray-700">${item.bedrooms?`<span>🛏 ${item.bedrooms}</span>`:''}${item.bathrooms?`<span>🛁 ${item.bathrooms}</span>`:''}</div>`
    const nextInsp = HF.getNextInspection(item.inspections)
    const inspectionSection = nextInsp ? `<div class="mt-2 p-2 bg-blue-50 rounded flex items-center justify-between"><div class="text-xs"><div class="font-medium">Next Inspection</div><div>${HF.escapeHtml(nextInsp.day)} ${HF.escapeHtml(nextInsp.time)}</div></div><button class="add-to-plan-btn px-2 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700" data-listing-id="${item.id}" data-day="${HF.escapeHtml(nextInsp.day)}" data-time="${HF.escapeHtml(nextInsp.time)}">Add to Plan</button></div>` : ''
    const statusBadge = HF.getStatusBadge(item.workflow_status)
    const viewDetailsLink = opts.showLinks ? `<a href="/listing/${item.id}" class="px-2 py-1 rounded text-xs bg-blue-600 text-white hover:bg-blue-700">📋 View details</a>` : ''
    const domainLink = (opts.showDomain && item.url) ? `<a href="${item.url}" target="_blank" class="px-2 py-1 rounded text-xs bg-gray-700 text-white hover:bg-gray-800">🏠 Domain</a>` : ''
    const actionButtons = (viewDetailsLink || domainLink) ? `<div class="mt-2 flex gap-2">${viewDetailsLink}${domainLink}</div>` : ''
    const votesSection = `<div class="mt-2"><div class="flex items-center gap-2 mb-1"><div class="w-14 text-xs">Tom</div><button class="vote-btn tom-yes px-2 py-1 rounded text-xs bg-gray-200" data-person="tom" data-val="true">Yes</button><button class="vote-btn tom-no px-2 py-1 rounded text-xs bg-gray-200" data-person="tom" data-val="false">No</button><div class="tom-score ml-2"></div></div><div class="flex items-center gap-2"><div class="w-14 text-xs">MQ</div><button class="vote-btn mq-yes px-2 py-1 rounded text-xs bg-gray-200" data-person="mq" data-val="true">Yes</button><button class="vote-btn mq-no px-2 py-1 rounded text-xs bg-gray-200" data-person="mq" data-val="false">No</button><div class="mq-score ml-2"></div></div></div>`
    const commentsSection = (opts.commentsMode && opts.commentsMode!=='none') ? `<div class="comments-block mt-2"><div class="font-medium text-sm">Comments</div>${HF.makeCommentsHtml(item.comments||[], opts.commentsMode)}${(opts.commentsMode==='top3' && (item.comments||[]).length>3)?`<div class="mt-1"><a class="text-sm text-blue-600" href="/listing/${item.id}">View more</a></div>`:''}${opts.includeCommentEditor?`<div class="new-comment mt-2"><button class="toggle-new-comment inline-flex items-center px-2 py-1 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded" aria-expanded="false">💬 Add comment</button><div class="new-comment-area hidden mt-2"><textarea class="new-comment-input w-full p-2 border rounded" placeholder="Leave a comment..."></textarea><div class="mt-2 flex justify-end gap-2"><button class="new-comment-save px-3 py-1 bg-blue-200 rounded" data-person="tom">Save Tom</button><button class="new-comment-save px-3 py-1 bg-indigo-200 rounded" data-person="mq">Save MQ</button></div></div></div>`:''}</div>` : ''
    el.innerHTML = `${imgHtml}<div class="flex items-center justify-between mb-1"><div class="font-medium text-sm">${HF.escapeHtml(item.address||'')}</div>${statusBadge}</div>${price}${stats}<div class="commutes-container mt-2"></div>${actionButtons}${votesSection}${inspectionSection}${commentsSection}`
    return el
  }

  // Add to Plan Modal
  HF.pendingInspection = null
  HF.showAddToPlanModal = function(listingId, day, time){ HF.pendingInspection = {listingId, day, time}; const timeRange=HF.parseTimeRange(time); let openTime='', closeTime=''; if(timeRange){ openTime=HF.convertTo24Hour(timeRange.start); closeTime=timeRange.end?HF.convertTo24Hour(timeRange.end):'' } const displayEl=document.getElementById('inspection-day-display'); if(displayEl) displayEl.textContent=`${day} ${time}`; const openEl=document.getElementById('inspection-open-time'); if(openEl) openEl.value=openTime; const closeEl=document.getElementById('inspection-close-time'); if(closeEl) closeEl.value=closeTime; document.getElementById('add-inspection-modal').classList.remove('hidden'); HF.loadPlansIntoDropdown() }
  HF.hideAddToPlanModal = function(){ document.getElementById('add-inspection-modal').classList.add('hidden'); HF.pendingInspection=null }
  HF.loadPlansIntoDropdown = async function(){ try{ const res=await fetch('/api/inspection-plans'); const j=await res.json(); const select=document.getElementById('plan-select') || document.getElementById('plan-select-detail'); if(!select) return; select.innerHTML='<option value="">Select existing plan...</option>'; if(j.ok&&j.plans){ Object.values(j.plans).forEach(p=>{ select.innerHTML+=`<option value="${p.id}">${HF.escapeHtml(p.name)} (${p.date||'No date'})</option>` }) } }catch(e){ console.error('load plans failed', e) } };
  HF.wireAddToPlanButtons = function(){ document.querySelectorAll('.add-to-plan-btn').forEach(btn=>{ if(btn.dataset.wired==='true') return; btn.dataset.wired='true'; btn.addEventListener('click',(e)=>{ e.preventDefault(); e.stopPropagation(); const listingId=btn.dataset.listingId; const day=btn.dataset.day; const time=btn.dataset.time; HF.showAddToPlanModal(listingId, day, time) }) }) };

  // Modal actions (list/map views)
  HF.initPlanModal = function(){
    const addBtn = document.getElementById('plan-modal-add')
    if (addBtn) {
      addBtn.addEventListener('click', async () => {
        if (!HF.pendingInspection) return
        try {
          const res = await fetch('/api/inspection-plans')
          const data = await res.json()
          const plans = data.plans || {}

          const select = document.getElementById('plan-select') || document.getElementById('plan-select-detail')
          const selectedPlanId = select ? select.value : ''
          const newPlanNameEl = document.getElementById('new-plan-name') || document.getElementById('new-plan-name-detail')
          const newPlanName = newPlanNameEl ? newPlanNameEl.value.trim() : ''
          const newPlanDateEl = document.getElementById('new-plan-date') || document.getElementById('new-plan-date-detail')
          const newPlanDate = newPlanDateEl ? newPlanDateEl.value : ''
          const openTimeEl = document.getElementById('inspection-open-time')
          const closeTimeEl = document.getElementById('inspection-close-time')
          const openTime = openTimeEl ? openTimeEl.value : ''
          const closeTime = closeTimeEl ? closeTimeEl.value : ''

          let planToUpdate = null
          if (selectedPlanId && plans[selectedPlanId]) {
            planToUpdate = plans[selectedPlanId]
            if (planToUpdate.stops.find(s => s.listing_id === HF.pendingInspection.listingId)) {
              alert('This listing is already in the selected plan')
              return
            }
            planToUpdate.stops.push({ listing_id: HF.pendingInspection.listingId, open_time: openTime || null, close_time: closeTime || null })
            planToUpdate.updated_at = new Date().toISOString()
          } else if (newPlanName) {
            const planId = 'plan_' + Date.now()
            planToUpdate = { id: planId, name: newPlanName, date: newPlanDate, mode: 'driving', stops: [{ listing_id: HF.pendingInspection.listingId, open_time: openTime || null, close_time: closeTime || null }], updated_at: new Date().toISOString() }
          } else {
            alert('Please select an existing plan or enter a name for a new plan')
            return
          }

          await fetch('/api/inspection-plans', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(planToUpdate) })
          alert(`Added to plan: ${planToUpdate.name}`)
          HF.hideAddToPlanModal()
        } catch (e) {
          alert('Error adding to plan: ' + e.message)
        }
      })
    }

    const cancelBtn = document.getElementById('plan-modal-cancel') || document.getElementById('plan-modal-cancel-detail')
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => HF.hideAddToPlanModal())
    }

    const modalBackdrop = document.getElementById('add-inspection-modal')
    if (modalBackdrop) {
      modalBackdrop.addEventListener('click', (e) => { if (e.target.id === 'add-inspection-modal') HF.hideAddToPlanModal() })
    }
  };

  // Initialize modal wiring as soon as script loads
  HF.initPlanModal()

  // Carousel navigation wiring
  HF.setupCarousels = function(){
    document.querySelectorAll('.carousel-prev, .carousel-next').forEach(button => {
      if (button.dataset.bound === 'true') return;
      button.dataset.bound = 'true';
      button.addEventListener('click', (e) => {
        e.preventDefault(); e.stopPropagation();
        const carouselId = button.dataset.carouselId;
        const container = document.querySelector(`.carousel-container[data-carousel-id="${carouselId}"]`);
        if (!container) return;
        const allImgs = container.querySelectorAll('.carousel-image');
        const currentImg = container.querySelector('.carousel-image.active');
        if (!currentImg || allImgs.length === 0) return;
        const currentIndex = Number(currentImg.dataset.imageIndex);
        const isNext = button.classList.contains('carousel-next');
        const newIndex = isNext ? (currentIndex + 1) % allImgs.length : (currentIndex - 1 + allImgs.length) % allImgs.length;
        currentImg.classList.remove('active'); currentImg.style.display = 'none';
        allImgs[newIndex].classList.add('active'); allImgs[newIndex].style.display = 'block';
      });
    });
  }

  window.HF = HF
})()
