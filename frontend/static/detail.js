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

    const domain = data.url? `<a href="${data.url}" target="_blank" class="px-2 py-1 rounded text-xs bg-gray-700 text-white hover:bg-gray-800">🏠 Domain</a>`:''
    
    // Build inspections section
    let inspectionsHtml = ''
    if (data.inspections && data.inspections.length > 0) {
      inspectionsHtml = `
        <div class="mb-3">
          <h3 class="text-sm font-semibold mb-2">🗓️ Inspection Times</h3>
          <div class="space-y-2">
            ${data.inspections.map((insp, idx) => `
              <div class="flex items-center justify-between p-2 bg-blue-50 rounded">
                <div>
                  <div class="text-sm font-medium">${escapeHtml(insp.day)}</div>
                  <div class="text-xs text-gray-600">${escapeHtml(insp.time)}</div>
                </div>
                <button class="add-inspection-to-plan px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700" 
                  data-day="${escapeHtml(insp.day)}" 
                  data-time="${escapeHtml(insp.time)}">
                  + Add to Plan
                </button>
              </div>
            `).join('')}
          </div>
        </div>
      `
    }

    content.innerHTML = `<div class="bg-white rounded shadow p-4 relative">${carousel}<div id="detail-card" class="mt-3"></div></div>`
    const cardHost = document.getElementById('detail-card')
    const card = window.HF.renderListingContent(null, data, {commentsMode:'all', compact:false, showLinks:false, showDomain:true, skipImages:true, includeCommentEditor:true})
    cardHost.appendChild(card)
    
    // Insert inspections after votes but before comments
    if (inspectionsHtml) {
      const commentsBlock = card.querySelector('.comments-block')
      if (commentsBlock) {
        const inspDiv = document.createElement('div')
        inspDiv.innerHTML = inspectionsHtml
        commentsBlock.parentNode.insertBefore(inspDiv.firstElementChild, commentsBlock)
      }
    }

    // Carousel controls
    const prev=document.querySelector('.carousel-prev'); const next=document.querySelector('.carousel-next'); const imgs=[...document.querySelectorAll('.carousel-img')] 
    if(prev&&next&&imgs.length){ let idx=0; function show(i){ imgs.forEach((im,k)=>{ im.classList.toggle('hidden', k!==i) }) } prev.addEventListener('click',()=>{ idx=(idx-1+imgs.length)%imgs.length; show(idx) }); next.addEventListener('click',()=>{ idx=(idx+1)%imgs.length; show(idx) }) }

    // Commutes + votes + comments
    const comm = card.querySelector('.commutes-container'); if (comm) window.HF.loadAndRenderCommutes(listingId, comm, data)
    window.HF.initVoteButtons(card, data)
    window.HF.initCommentEditor(card, listingId)
    window.HF.wireAddToPlanButtons()

    // Wire up status badge dropdown
    window.HF.initStatusDropdown(card, data)

    // Wire up inspection add-to-plan buttons
    document.querySelectorAll('.add-inspection-to-plan').forEach(btn => {
      btn.addEventListener('click', () => {
        const day = btn.dataset.day
        const time = btn.dataset.time
        HF.showAddToPlanModal(data.id, day, time)
      })
    })

  }catch(e){ content.innerHTML='<div class="text-red-600">Failed to load listing</div>'; console.error(e) }
}

// Parse time range like "12:15pm - 12:35pm" into separate start/end times
function parseTimeRange(timeStr) {
  if (!timeStr) return { open_time: null, close_time: null }
  
  const parts = timeStr.split('-').map(p => p.trim())
  if (parts.length === 2) {
    // Convert to 24-hour format
    const open_time = convertTo24Hour(parts[0])
    const close_time = convertTo24Hour(parts[1])
    return { open_time, close_time }
  } else if (parts.length === 1) {
    // Single time, use it as open time
    return { open_time: convertTo24Hour(parts[0]), close_time: null }
  }
  
  return { open_time: null, close_time: null }
}

function convertTo24Hour(timeStr) {
  if (!timeStr) return null
  
  const match = timeStr.match(/(\d+):(\d+)\s*(am|pm)/i)
  if (!match) return null
  
  let hours = parseInt(match[1])
  const minutes = match[2]
  const meridiem = match[3].toLowerCase()
  
  if (meridiem === 'pm' && hours !== 12) hours += 12
  if (meridiem === 'am' && hours === 12) hours = 0
  
  return `${hours.toString().padStart(2, '0')}:${minutes}`
}

// Add-to-plan modal functionality
let pendingInspection = null

async function loadPlansIntoDropdown() {
  const selectEl = document.getElementById('plan-select-detail')
  if (!selectEl) return
  
  try {
    const res = await fetch('/api/inspection-plans')
    const data = await res.json()
    const plans = data.plans || {}
    
    selectEl.innerHTML = '<option value="">-- Select Existing Plan --</option>'
    
    Object.values(plans).forEach(plan => {
      const opt = document.createElement('option')
      opt.value = plan.id
      opt.textContent = `${plan.name || 'Unnamed'} (${plan.date || 'No date'}) - ${(plan.stops || []).length} stops`
      selectEl.appendChild(opt)
    })
    
    document.getElementById('new-plan-date-detail').value = new Date().toISOString().split('T')[0]
  } catch (e) {
    console.error('Failed to load plans', e)
    selectEl.innerHTML = '<option value="">Error loading plans</option>'
  }
}

function showAddToPlanModal(listingId, day, time) {
  pendingInspection = { listingId, day, time }
  loadPlansIntoDropdown()
  
  // Parse times and pre-fill
  const { open_time, close_time } = parseTimeRange(time)
  if (open_time) document.getElementById('inspection-open-time').value = open_time
  if (close_time) document.getElementById('inspection-close-time').value = close_time
  
  document.getElementById('inspection-day-display').textContent = `${day} - ${time}`
  document.getElementById('add-inspection-modal').classList.remove('hidden')
  document.getElementById('new-plan-name-detail').value = ''
}

function hideAddToPlanModal() {
  document.getElementById('add-inspection-modal').classList.add('hidden')
  pendingInspection = null
}

document.getElementById('plan-modal-cancel-detail')?.addEventListener('click', () => HF.hideAddToPlanModal())

document.getElementById('add-inspection-modal')?.addEventListener('click', (e) => {
  if (e.target.id === 'add-inspection-modal') HF.hideAddToPlanModal()
})

document.getElementById('plan-modal-add-detail')?.addEventListener('click', async () => {
  if (!HF.pendingInspection) return

  const selectedPlanId = document.getElementById('plan-select-detail').value
  const newPlanName = document.getElementById('new-plan-name-detail').value.trim()
  const openTime = document.getElementById('inspection-open-time').value
  const closeTime = document.getElementById('inspection-close-time').value

  try {
    const res = await fetch('/api/inspection-plans')
    const data = await res.json()
    const plans = data.plans || {}

    let planToUpdate = null

    if (selectedPlanId && plans[selectedPlanId]) {
      // Add to existing plan
      planToUpdate = plans[selectedPlanId]
      if (planToUpdate.stops.find(s => s.listing_id === HF.pendingInspection.listingId)) {
        alert('This listing is already in the selected plan')
        return
      }
      planToUpdate.stops.push({ 
        listing_id: HF.pendingInspection.listingId,
        open_time: openTime || null,
        close_time: closeTime || null
      })
      planToUpdate.updated_at = new Date().toISOString()
    } else if (newPlanName) {
      // Create new plan
      const newPlanDate = document.getElementById('new-plan-date-detail').value
      const planId = 'plan_' + Date.now()
      planToUpdate = {
        id: planId,
        name: newPlanName,
        date: newPlanDate,
        mode: 'driving',
        stops: [{ 
          listing_id: HF.pendingInspection.listingId,
          open_time: openTime || null,
          close_time: closeTime || null
        }],
        updated_at: new Date().toISOString()
      }
    } else {
      alert('Please select an existing plan or enter a name for a new plan')
      return
    }

    await fetch('/api/inspection-plans', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(planToUpdate)
    })

    alert(`Added to plan: ${planToUpdate.name}`)
    HF.hideAddToPlanModal()
  } catch (e) {
    alert('Error adding to plan: ' + e.message)
  }
})

loadDetail()
