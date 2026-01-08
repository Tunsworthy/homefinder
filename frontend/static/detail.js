// Helpers reused from list/map views
function escapeHtml(s) { if (s === null || typeof s === 'undefined') return ''; const str = String(s); return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;') }
function stripHtml(s) { if (s === null || typeof s === 'undefined') return ''; return String(s).replace(/<[^>]*>/g,'') }
function setToggleVisual(btn, on, color) {
  if (!btn) return
  btn.classList.remove('bg-green-600','bg-red-600','bg-gray-200','bg-gray-100','text-white','text-gray-800')
  if (on) { let c = 'bg-green-600'; if (color==='red') c='bg-red-600'; btn.classList.add(c,'text-white') } else { btn.classList.add('bg-gray-200','text-gray-800') }
}
let tooltipEl = null
function ensureTooltip(){ if (!tooltipEl){ tooltipEl=document.createElement('div'); tooltipEl.className='z-50 p-2 bg-white border rounded shadow text-sm max-w-xs'; tooltipEl.style.position='absolute'; tooltipEl.style.display='none'; document.body.appendChild(tooltipEl) } }
function showTooltip(x,y,html){ ensureTooltip(); tooltipEl.innerHTML=html; tooltipEl.style.left=(x+12)+'px'; tooltipEl.style.top=(y+12)+'px'; tooltipEl.style.display='block' }
function moveTooltip(x,y){ if (tooltipEl){ tooltipEl.style.left=(x+12)+'px'; tooltipEl.style.top=(y+12)+'px' } }
function hideTooltip(){ if (tooltipEl) tooltipEl.style.display='none' }
function buildGoogleMapsLink(origin, destination, mode){ try{ const qs=new URLSearchParams(); qs.set('api','1'); if(origin) qs.set('origin',origin); if(destination) qs.set('destination',destination); if(mode) qs.set('travelmode', mode==='transit'?'transit':mode); return `https://www.google.com/maps/dir/?${qs.toString()}` }catch(e){ return '#' } }
function commuteNameToIcon(name){ if(!name) return '🚆'; const n=name.toString().toLowerCase(); if(n.includes('work')||n.includes('office')||n.includes('job')) return '💼'; if(n.includes('church')||n.includes('chapel')||n.includes('temple')) return '⛪'; if(n.includes('school')||n.includes('uni')||n.includes('college')) return '🎓'; if(n.includes('gym')||n.includes('fitness')) return '🏋️'; if(n.includes('shop')||n.includes('grocery')||n.includes('supermarket')) return '🛒'; if(n.includes('park')||n.includes('walk')) return '🚶'; if(n.includes('drive')||n.includes('car')||n.includes('driving')) return '🚗'; return '🚆' }
async function loadAndRenderCommutes(listingId, containerEl, item){
  if(!listingId||!containerEl) return
  try{
    const res=await fetch(`/commute/${listingId}.json`); if(!res.ok) return; const j=await res.json(); const commutes=j&&j.commutes?j.commutes:[]; if(!commutes.length) return; containerEl.innerHTML=''
    for(const c of commutes){
      const name=c.name||(c.destination||''); const mode=(c.mode||(c.result&&c.result.raw_response&&c.result.raw_response.request&&c.result.raw_response.request.travelMode)||'transit').toLowerCase(); let icon=commuteNameToIcon(name); let minsLabel=''
      try{ const rr=c.result&&c.result.raw_response; const dur=rr&&rr.routes&&rr.routes[0]&&rr.routes[0].legs&&rr.routes[0].legs[0]&&rr.routes[0].legs[0].duration&&rr.routes[0].legs[0].duration.value; if(dur) minsLabel=`${Math.round(dur/60)} min`; else if(c.result&&c.result.summary) minsLabel=c.result.summary }catch(e){ minsLabel=c.result&&c.result.summary?c.result.summary:'' }
      const badge=document.createElement('a'); badge.className='commute-badge inline-block mr-2 px-2 py-1 rounded text-sm bg-gray-100 hover:bg-gray-200 text-gray-800'; badge.href=buildGoogleMapsLink(item.address||'', c.destination||'', mode); badge.target='_blank'
      let summaryText=''; if(c.result&&c.result.summary){ if(typeof c.result.summary==='string') summaryText=c.result.summary; else if(c.result.summary.duration_text) summaryText=c.result.summary.duration_text; else summaryText=JSON.stringify(c.result.summary) }
      let nearestStr=''; let nearestObj=c.result&&c.result.nearest_station; if(nearestObj){ if(typeof nearestObj==='string') nearestStr=nearestObj; else if(nearestObj.name){ const mins=nearestObj.walking_seconds?Math.round((nearestObj.walking_seconds||0)/60):null; nearestStr=nearestObj.name+(mins?` (${mins} min walk)`: '') } else { nearestStr=JSON.stringify(nearestObj) } }
      badge.innerHTML=`${icon} <strong class="mr-1">${minsLabel||''}</strong>`
      badge.addEventListener('mouseenter', (e)=>{ let stepsHtml=''; try{ const rr=c.result&&c.result.raw_response; const leg=rr&&rr.routes&&rr.routes[0]&&rr.routes[0].legs&&rr.routes[0].legs[0]; if(leg&&Array.isArray(leg.steps)){ for(const s of leg.steps){ const m=(s.travel_mode||(s.transit_details?'TRANSIT':'')) .toUpperCase(); const instr=stripHtml(s.html_instructions||s.instructions||s.summary||''); const dur=(s.duration&&s.duration.text)?s.duration.text:(s.duration&&typeof s.duration.value==='number'?Math.round(s.duration.value/60)+' mins':''); if(m==='WALKING'){ stepsHtml+=`<div class="text-xs text-gray-700">Walk ${escapeHtml(dur)} — ${escapeHtml(instr)}</div>` } else if(m==='TRANSIT'){ const td=s.transit_details||{}; const line=td.line||{}; const vehicle=(line.vehicle&&line.vehicle.type)?line.vehicle.type:(line.short_name||line.name||'Transit'); const nameLabel=line.short_name||line.name||''; const headsign=td.headsign?` → ${escapeHtml(stripHtml(td.headsign))}`:''; const stops=td.num_stops?` (${td.num_stops} stops)`:''; stepsHtml+=`<div class="text-xs text-gray-700">${escapeHtml(vehicle)} ${escapeHtml(nameLabel)} ${escapeHtml(dur)}${headsign}${stops}</div>` } else { stepsHtml+=`<div class="text-xs text-gray-700">${escapeHtml(m)} ${escapeHtml(dur)} — ${escapeHtml(instr)}</div>` } } } else { stepsHtml=`<div class="text-xs text-gray-700">${escapeHtml(summaryText||'')}</div>` } }catch(err){ stepsHtml=`<div class="text-xs text-gray-700">${escapeHtml(summaryText||'')}</div>` } showTooltip(e.pageX,e.pageY,`<div class="font-medium">${escapeHtml(name)}</div>${stepsHtml}`) })
      badge.addEventListener('mousemove',(e)=>moveTooltip(e.pageX,e.pageY)); badge.addEventListener('mouseleave',hideTooltip)
      containerEl.appendChild(badge)
      if(nearestStr){ const nbadge=document.createElement('a'); nbadge.className='nearest-badge inline-block mr-2 px-2 py-1 rounded text-sm bg-blue-50 hover:bg-blue-100 text-blue-700'; const stationTarget=(nearestObj&&nearestObj.name)?nearestObj.name:nearestStr; nbadge.href=buildGoogleMapsLink(item.address||'', stationTarget, 'walking'); nbadge.target='_blank'; nbadge.innerHTML=`🚉 <span class="text-xs">${escapeHtml(nearestStr)}</span>`; nbadge.addEventListener('mouseenter',(e)=>{ showTooltip(e.pageX,e.pageY,`<div class=\"font-medium\">Nearest station</div><div class=\"text-xs\">${escapeHtml(nearestStr)}</div>`) }); nbadge.addEventListener('mousemove',(e)=>moveTooltip(e.pageX,e.pageY)); nbadge.addEventListener('mouseleave',hideTooltip); containerEl.appendChild(nbadge) }
    }
    if(j&&j.nearest_station){ const ns=j.nearest_station; if(ns&&(ns.walking_seconds||ns.walking_seconds===0)){ const mins=(typeof ns.walking_seconds==='number')?Math.round(ns.walking_seconds/60)+' mins':''; const nsBadge=document.createElement('a'); nsBadge.className='inline-block px-2 py-1 mr-2 mb-1 text-sm bg-yellow-100 rounded nearest-station-badge'; const origin=j.address||(item&&item.address)||''; const destination=ns.name||''; nsBadge.href=buildGoogleMapsLink(origin, destination, 'walking'); nsBadge.target='_blank'; nsBadge.rel='noopener noreferrer'; nsBadge.title=destination+(mins?` — ${mins}`:''); nsBadge.innerHTML=`<span class=\"mr-1\">🚶 🚆</span> <span class=\"font-medium\">${escapeHtml(mins)}</span>`; containerEl.appendChild(nsBadge) } }
  }catch(e){ console.error('commute load failed', e) }
}

function buildScoreHtml(person, currentScore){ let html='<div class="inline-flex items-center gap-1">'; for(let s=1;s<=5;s++){ const sel=(currentScore&&Number(currentScore)===s)?'bg-yellow-500 text-white':'bg-white'; html+=`<div class=\"score-circle w-7 h-7 rounded-full border flex items-center justify-center text-xs cursor-pointer ${sel}\" data-score=\"${s}\" data-person=\"${person}\">${s}</div>` } html+='</div>'; return html }

async function loadDetail(){
  const content=document.getElementById('content'); content.innerHTML='<div class="text-gray-600">Loading…</div>'
  try{
    const res=await fetch(`/api/listing/${listingId}`)
    if(!res.ok){ content.innerHTML='<div class="text-red-600">Listing not found</div>'; return }
    const data=await res.json()
    const images=(data.image_urls||[]).filter(u=>u && !/contact|logo|\.svg/i.test(u))
    const hero = images.length? images[0] : (data.image || null)
    const carousel = images.length>1
      ? `<div class="relative group"><div class="carousel" data-id="${data.id}">${images.map((u,i)=>`<img src=\"${u}\" class=\"carousel-img w-full h-72 object-cover rounded ${i===0?'':'hidden'}\" data-index=\"${i}\">`).join('')}</div><button class="carousel-prev absolute left-2 top-1/2 -translate-y-1/2 bg-black bg-opacity-50 text-white px-2 py-1 rounded">←</button><button class="carousel-next absolute right-2 top-1/2 -translate-y-1/2 bg-black bg-opacity-50 text-white px-2 py-1 rounded">→</button><div class="absolute bottom-2 left-2 bg-black bg-opacity-50 text-white text-xs px-2 py-1 rounded">${images.length} photos</div></div>`
      : (hero? `<img src="${hero}" class="w-full h-72 object-cover rounded">` : '')

    const route = data.route_summary ? `<div class="text-xs text-gray-600">${escapeHtml(data.route_summary)}</div>` : ''
    const stats = `<div class="flex items-center gap-4 text-sm text-gray-700">${data.bedrooms?`<span>🛏 ${data.bedrooms}</span>`:''}${data.bathrooms?`<span>🛁 ${data.bathrooms}</span>`:''}${data.parking?`<span>🚗 ${data.parking}</span>`:''}</div>`
    const price = data.price? `<div class="text-sm text-gray-800">${escapeHtml(data.price)}</div>`:''
    const domain = data.url? `<a href="${data.url}" target="_blank" class="px-3 py-1 bg-gray-100 rounded text-sm">Domain</a>`:''
    const maps = data.google_maps_url? `<a href="${data.google_maps_url}" target="_blank" class="px-3 py-1 bg-gray-100 rounded text-sm">Directions</a>`:''

    content.innerHTML = `
      <div class="bg-white rounded shadow p-4">
        ${carousel}
        <div class="mt-3">
          <h2 class="text-lg font-semibold">${escapeHtml(data.address||data.headline||'')}</h2>
          ${price}
          ${stats}
          <div class="mt-2 flex items-center gap-2">${domain}${maps}</div>
          <div class="mt-2">${route}</div>
          <div class="commutes-container mt-2"></div>
        </div>
        <div class="mt-4">
          <div class="flex items-center gap-3 mb-2">
            <div class="w-16 text-sm">Tom</div>
            <button class="vote-btn tom-yes px-3 py-1 rounded text-sm bg-gray-200" data-id="${data.id}" data-person="tom" data-val="true">Yes</button>
            <button class="vote-btn tom-no px-3 py-1 rounded text-sm bg-gray-200" data-id="${data.id}" data-person="tom" data-val="false">No</button>
            <div class="tom-score ml-2"></div>
          </div>
          <div class="flex items-center gap-3">
            <div class="w-16 text-sm">MQ</div>
            <button class="vote-btn mq-yes px-3 py-1 rounded text-sm bg-gray-200" data-id="${data.id}" data-person="mq" data-val="true">Yes</button>
            <button class="vote-btn mq-no px-3 py-1 rounded text-sm bg-gray-200" data-id="${data.id}" data-person="mq" data-val="false">No</button>
            <div class="mq-score ml-2"></div>
          </div>
        </div>
        <div class="mt-6">
          <div class="font-medium">Comments</div>
          <div class="existing-comments mt-2"></div>
          <div class="new-comment mt-2">
            <button class="toggle-new-comment inline-flex items-center px-2 py-1 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded" aria-expanded="false">💬 Add comment</button>
            <div class="new-comment-area hidden mt-2">
              <textarea class="new-comment-input w-full p-2 border rounded" placeholder="Leave a comment..."></textarea>
              <div class="mt-2 flex justify-end gap-2">
                <button class="new-comment-save px-3 py-1 bg-blue-200 rounded" data-person="tom">Save Tom</button>
                <button class="new-comment-save px-3 py-1 bg-indigo-200 rounded" data-person="mq">Save MQ</button>
              </div>
            </div>
          </div>
        </div>
      </div>`

    // Carousel controls
    const prev=document.querySelector('.carousel-prev'); const next=document.querySelector('.carousel-next'); const imgs=[...document.querySelectorAll('.carousel-img')] 
    if(prev&&next&&imgs.length){ let idx=0; function show(i){ imgs.forEach((im,k)=>{ im.classList.toggle('hidden', k!==i) }) } prev.addEventListener('click',()=>{ idx=(idx-1+imgs.length)%imgs.length; show(idx) }); next.addEventListener('click',()=>{ idx=(idx+1)%imgs.length; show(idx) }) }

    // Commute badges
    const comm = document.querySelector('.commutes-container'); if (comm) loadAndRenderCommutes(listingId, comm, data)

    // Voting state and score selectors
    const tomYes=document.querySelector('.tom-yes'), tomNo=document.querySelector('.tom-no'), mqYes=document.querySelector('.mq-yes'), mqNo=document.querySelector('.mq-no')
    setToggleVisual(tomYes, data.tom===true, 'green'); setToggleVisual(tomNo, data.tom===false, 'red'); setToggleVisual(mqYes, data.mq===true, 'green'); setToggleVisual(mqNo, data.mq===false, 'red')
    const tomScore=document.querySelector('.tom-score'); const mqScore=document.querySelector('.mq-score')
    if (tomScore) { tomScore.innerHTML = (data.tom===true)? buildScoreHtml('tom', data.tom_score):''; tomScore.style.display=(data.tom===true)?'inline-block':'none' }
    if (mqScore) { mqScore.innerHTML = (data.mq===true)? buildScoreHtml('mq', data.mq_score):''; mqScore.style.display=(data.mq===true)?'inline-block':'none' }
    function attachScoreHandlers(parentEl, person, id){ if(!parentEl) return; parentEl.querySelectorAll('.score-circle').forEach(sc=>{ sc.addEventListener('click', async (ev)=>{ ev.preventDefault(); ev.stopPropagation(); const score=Number(sc.dataset.score); const payload={}; if(person==='tom'){ payload.tom=true; payload.tom_score=score } else { payload.mq=true; payload.mq_score=score } try { const resp=await fetch(`/api/listing/${id}/vote`, {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload)}) ; const j=await resp.json().catch(()=>null); if(j&&j.ok){ parentEl.querySelectorAll('.score-circle').forEach(c=>c.classList.remove('bg-yellow-500','text-white')); const sel=parentEl.querySelector(`.score-circle[data-score="${score}"]`); if(sel) sel.classList.add('bg-yellow-500','text-white') } } catch(e){ console.error('score save failed', e) } }) }) }
    attachScoreHandlers(tomScore, 'tom', data.id); attachScoreHandlers(mqScore, 'mq', data.id)

    document.querySelectorAll('.vote-btn').forEach(btn=>{ btn.addEventListener('click', async (ev)=>{ ev.preventDefault(); const id=btn.dataset.id; const person=btn.dataset.person; const val=btn.dataset.val==='true'; try{ const resp=await fetch(`/api/listing/${id}/vote`, {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({[person]: val})}); const j=await resp.json().catch(()=>({})); const tVal=(typeof j.tom!=='undefined')?j.tom:null; const mVal=(typeof j.mq!=='undefined')?j.mq:null; setToggleVisual(tomYes, tVal===true, 'green'); setToggleVisual(tomNo, tVal===false, 'red'); setToggleVisual(mqYes, mVal===true, 'green'); setToggleVisual(mqNo, mVal===false, 'red'); if(typeof tVal!=='undefined' && tomScore){ if(tVal===true && (!tomScore.innerHTML||tomScore.innerHTML.trim()==='')) tomScore.innerHTML = buildScoreHtml('tom', j.tom_score); tomScore.style.display=(tVal===true)?'inline-block':'none'; attachScoreHandlers(tomScore, 'tom', id) } if(typeof mVal!=='undefined' && mqScore){ if(mVal===true && (!mqScore.innerHTML||mqScore.innerHTML.trim()==='')) mqScore.innerHTML = buildScoreHtml('mq', j.mq_score); mqScore.style.display=(mVal===true)?'inline-block':'none'; attachScoreHandlers(mqScore, 'mq', id) } } catch(e){ console.error('vote failed', e) } }) })

    // Comments rendering (full list)
    const commentsContainer = document.querySelector('.existing-comments')
    function renderComments(list){ commentsContainer.innerHTML=''; if(!list||!list.length){ commentsContainer.innerHTML='<div class="text-sm text-gray-500">No comments</div>'; return } for(const c of list){ const who=c.person==='tom'?'Tom':'MQ'; const wrapper=document.createElement('div'); wrapper.className='comment-item text-sm border rounded p-2 mb-1 flex items-start justify-between'; wrapper.setAttribute('data-cid', c.id); wrapper.innerHTML=`<div class=\"comment-body flex-1 min-w-0\"><strong>${who}:</strong><div class=\"comment-main min-w-0\"><span class=\"comment-text ml-2 block break-words\">${escapeHtml(c.text).replace(/\n/g,'<br>')}</span></div><div class=\"comment-ts text-xs text-gray-400 mt-1\">${new Date(c.ts*1000).toLocaleString()}</div></div><div class=\"ml-3 flex items-center flex-shrink-0\"><button class=\"edit-comment text-xs ml-2 px-2 py-1\" title=\"Edit\">✏️</button><button class=\"del-comment text-xs ml-1 px-2 py-1 text-red-500\" title=\"Delete\">🗑️</button></div>`; commentsContainer.appendChild(wrapper) } attachCommentHandlers() }
    renderComments(data.comments||[])

    function attachCommentHandlers(){ document.querySelectorAll('.edit-comment').forEach(btn=>{ btn.addEventListener('click', async (ev)=>{ ev.preventDefault(); const wrapper=btn.closest('.comment-item'); const txtEl=wrapper.querySelector('.comment-text'); const cid=wrapper.getAttribute('data-cid'); if(btn.dataset.editing==='true'){ const newText = txtEl.innerText || ''; try{ const resp=await fetch(`/api/listing/${listingId}/comment/${cid}`, {method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({text:newText})}); const j=await resp.json().catch(()=>null); if(!(j&&j.ok)) loadDetail() } catch(e){ console.error('edit failed', e) } txtEl.contentEditable='false'; txtEl.classList.remove('inline-editing'); btn.dataset.editing='false'; btn.textContent='✏️' } else { btn.dataset.editing='true'; btn.textContent='✓'; txtEl.dataset.origText=txtEl.innerText||''; txtEl.contentEditable='true'; txtEl.classList.add('inline-editing'); txtEl.focus() } }) }); document.querySelectorAll('.del-comment').forEach(btn=>{ btn.addEventListener('click', async (ev)=>{ ev.preventDefault(); if(!confirm('Delete comment?')) return; const wrapper=btn.closest('.comment-item'); const cid=wrapper.getAttribute('data-cid'); try{ const resp=await fetch(`/api/listing/${listingId}/comment/${cid}`, {method:'DELETE'}); const j=await resp.json().catch(()=>null); if(j&&j.ok) wrapper.remove(); else loadDetail() }catch(e){ console.error('delete failed', e) } }) }) }

    // Add new comment
    const toggleNew = document.querySelector('.toggle-new-comment'); const newArea=document.querySelector('.new-comment-area'); const input=document.querySelector('.new-comment-input')
    if(toggleNew&&newArea){ toggleNew.addEventListener('click', ()=>{ const vis=newArea.classList.contains('hidden'); newArea.classList.toggle('hidden', !vis); toggleNew.setAttribute('aria-expanded', vis?'true':'false'); if(vis) input.focus() }) }
    document.querySelectorAll('.new-comment-save').forEach(btn=>{ btn.addEventListener('click', async ()=>{ const person=btn.dataset.person; const text=input.value||''; if(!text.trim()) return; try{ const resp=await fetch(`/api/listing/${listingId}/comment`, {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({person, text})}); const j=await resp.json().catch(()=>null); if(j&&j.ok){ input.value=''; newArea.classList.add('hidden'); // prepend
            const list = data.comments ? [j.comment, ...data.comments] : [j.comment]
            data.comments = list
            renderComments(list)
          } else { loadDetail() } } catch(e){ console.error('create failed', e) } }) })

  }catch(e){ content.innerHTML='<div class="text-red-600">Failed to load listing</div>'; console.error(e) }
}

loadDetail()
