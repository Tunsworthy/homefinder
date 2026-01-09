let offset = 0
const limit = 20
let loading = false
let container = null
let loadingEl = null

let totalCountEl = null
let availableCountEl = null
let soldCountEl = null
let hideSoldBtn = null
let sortTravelBtn = null
let filterTomYesBtn = null
let filterMqYesBtn = null
let filterExcludeSelect = null
let filterTravelSelect = null
let hideDuplexBtn = null
let searchInput = null
let filtersToggle = null
let filtersPanel = null
let sortMenuToggle = null
let sortPanel = null
let sortRankingBtn = null

// currentFilter and currentSort will be loaded from localStorage below
// persistent filters stored in localStorage
let stored = {}
try { stored = JSON.parse(localStorage.getItem('hf_filters') || '{}') } catch(e) { stored = {} }
let currentTomFilter = stored.tom || 'any' // any, yes, no
let currentMqFilter = stored.mq || 'any'
// defaults: hide sold by default, sort by travel on, hide duplex on, travel max 55
let currentFilter = (typeof stored.status === 'undefined') ? 'hide_sold' : stored.status || 'all'
let currentSort = stored.sort || 'travel'
let currentExcludeMode = stored.exclude_voted_mode || 'none'
let currentTravelMax = stored.travel_max || '55' // minutes or 'any'
let currentHideDuplex = (typeof stored.hide_duplex === 'undefined') ? true : !!stored.hide_duplex
let currentSearchTerm = stored.search || ''
// allow ranking toggle alongside travel sort
let currentRanking = !!stored.ranking
function setToggleVisual(btn, on, color) {
  if (!btn) return
  // remove common on/off classes
  btn.classList.remove('bg-green-600','bg-red-600','bg-gray-200','bg-gray-100','text-white','text-gray-800')
  if (on) {
    let className = 'bg-green-600'
    if (color === 'blue') className = 'bg-blue-600'
    else if (color === 'yellow') className = 'bg-yellow-600'
    else if (color === 'purple') className = 'bg-purple-600'
    else if (color === 'red') className = 'bg-red-600'
    else if (color === 'indigo') className = 'bg-indigo-600'
    btn.classList.add(className,'text-white')
  } else {
    btn.classList.add('bg-gray-200','text-gray-800')
  }
}

// escape HTML for safe insertion into innerHTML
function escapeHtml(s) {
  if (s === null || typeof s === 'undefined') return ''
  const str = String(s)
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

// remove HTML tags from a string
function stripHtml(s) {
  if (s === null || typeof s === 'undefined') return ''
  return String(s).replace(/<[^>]*>/g, '')
}

// helper: try to extract travel minutes from a listing item
function getTravelMinutes(item) {
  try {
    if (!item) return null
    if (typeof item.travel_seconds === 'number') return Math.round(item.travel_seconds/60)
    if (typeof item.travel_minutes === 'number') return item.travel_minutes
    if (typeof item.travel_mins === 'number') return item.travel_mins
    if (typeof item.travel_time === 'string') {
      const m = parseInt(item.travel_time.replace(/[^0-9]/g,''))
      if (!isNaN(m)) return m
    }
    if (item.travel && item.travel.duration && typeof item.travel.duration.value === 'number') return Math.round(item.travel.duration.value/60)
  } catch(e){}
  return null
}

async function loadMore() {
  if (loading) return
  loading = true
  loadingEl.style.display = 'block'
  try {
    // map internal filter to API status: 'hide_sold' -> request available only, otherwise all
    const statusParam = (currentFilter === 'hide_sold') ? 'available' : 'all'
    const qs = new URLSearchParams({offset, limit, status: statusParam, sort: currentSort, tom: currentTomFilter, mq: currentMqFilter, exclude_voted_mode: currentExcludeMode})
    if (currentTravelMax && currentTravelMax !== 'any') qs.set('travel_max', String(currentTravelMax))
    // Add search term to the query string so server can filter
    if (currentSearchTerm) qs.set('search', currentSearchTerm)
    const res = await fetch(`/api/listings?${qs.toString()}`)
    const data = await res.json()
    const items = data.listings || []
    // Client-side hide duplex/semi-detached if enabled
    const filteredItems = items.filter(it => {
      if (!currentHideDuplex) return true
      const pt = (it.property_type || '').toString().toLowerCase()
      if (!pt) return true
      if (pt.includes('duplex')) return false
      if (pt.includes('semi') || pt.includes('semi-detached') || pt.includes('semi detached')) return false
      return true
    })
    // if ranking toggle enabled, apply client-side ranking sort
    if (currentRanking) {
      filteredItems.sort((a,b) => {
        // if travel sort is also requested, preserve travel ordering as primary
        if (currentSort === 'travel') {
          const aT = getTravelMinutes(a) ?? Infinity
          const bT = getTravelMinutes(b) ?? Infinity
          if (aT !== bT) return aT - bT
        }
        const aScore = (Number(a.tom_score)||0) + (Number(a.mq_score)||0)
        const bScore = (Number(b.tom_score)||0) + (Number(b.mq_score)||0)
        return bScore - aScore
      })
    }
    // Remove client-side search filtering since server now handles it
    // const filteredItems = items.filter(it => { ... search logic ... })
    // update totals if provided
    if (typeof data.total !== 'undefined') {
      if (totalCountEl) totalCountEl.textContent = data.total
      if (availableCountEl) availableCountEl.textContent = data.available
      if (soldCountEl) soldCountEl.textContent = data.sold
    }
    for (const item of filteredItems) renderItem(item)
    offset += filteredItems.length
    if (items.length < limit) {
      loadingEl.textContent = 'No more listings.'
    }
  } catch (e) {
    loadingEl.textContent = 'Error loading listings.'
    console.error(e)
  } finally {
    loading = false
  }
}

function renderItem(item) {
  const wrapper = document.createElement('div')
  wrapper.className = 'block bg-white rounded shadow p-4 hover:shadow-md relative'
  const card = window.HF.renderListingContent(null, item, {commentsMode:'top3', compact:false, showLinks:true, includeCommentEditor:true})
  wrapper.appendChild(card)
  container.appendChild(wrapper)
  setupCarousels()
  const commutesContainer = wrapper.querySelector('.commutes-container')
  if (commutesContainer) window.HF.loadAndRenderCommutes(item.id, commutesContainer, item)
  window.HF.initVoteButtons(wrapper, item)
  if (wrapper.querySelector('.comments-block')) window.HF.initCommentEditor(wrapper, item.id)
  const imgs = wrapper.querySelectorAll('img:not(.carousel-image)')
  imgs.forEach((img, idx) => {
    img.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      const images = (item.images && item.images.length) ? item.images : (item.image ? [item.image] : [])
      openImagePopup(img.src, images, idx)
    })
  })
}

// Tooltip helpers
let tooltipEl = null
function ensureTooltip() {
  if (!tooltipEl) {
    tooltipEl = document.createElement('div')
    tooltipEl.className = 'z-50 p-2 bg-white border rounded shadow text-sm max-w-xs'
    tooltipEl.style.position = 'absolute'
    tooltipEl.style.display = 'none'
    document.body.appendChild(tooltipEl)
  }
}
function showTooltip(x, y, html) {
  ensureTooltip()
  tooltipEl.innerHTML = html
  tooltipEl.style.left = (x + 12) + 'px'
  tooltipEl.style.top = (y + 12) + 'px'
  tooltipEl.style.display = 'block'
}
function moveTooltip(x, y) { if (tooltipEl) { tooltipEl.style.left = (x + 12) + 'px'; tooltipEl.style.top = (y + 12) + 'px' } }
function hideTooltip() { if (tooltipEl) tooltipEl.style.display = 'none' }

// Build a Google Maps directions URL for a commute
function buildGoogleMapsLink(origin, destination, mode) {
  try {
    const qs = new URLSearchParams()
    // use Google Maps URL parameters for Directions API web intent
    qs.set('api', '1')
    if (origin) qs.set('origin', origin)
    if (destination) qs.set('destination', destination)
    if (mode) qs.set('travelmode', mode === 'transit' ? 'transit' : mode)
    return `https://www.google.com/maps/dir/?${qs.toString()}`
  } catch (e) { return '#'
  }
}

// Map commute name to a representative emoji icon
function commuteNameToIcon(name) {
  if (!name) return '🚆'
  const n = name.toString().toLowerCase()
  if (n.includes('work') || n.includes('office') || n.includes('job')) return '💼'
  if (n.includes('church') || n.includes('chapel') || n.includes('temple')) return '⛪'
  if (n.includes('school') || n.includes('uni') || n.includes('college')) return '🎓'
  if (n.includes('gym') || n.includes('fitness')) return '🏋️'
  if (n.includes('shop') || n.includes('grocery') || n.includes('supermarket')) return '🛒'
  if (n.includes('park') || n.includes('walk')) return '🚶'
  if (n.includes('drive') || n.includes('car') || n.includes('driving')) return '🚗'
  return '🚆'
}

// Load per-listing commute JSON and render compact commute badges
async function loadAndRenderCommutes(listingId, containerEl, item) {
  if (!listingId || !containerEl) return
  try {
    const res = await fetch(`/commute/${listingId}.json`)
    if (!res.ok) return // leave legacy travel link if available
    const j = await res.json()
    const commutes = j && j.commutes ? j.commutes : []
    if (!commutes || commutes.length === 0) return
    containerEl.innerHTML = ''
    
    // render each commute
    for (const c of commutes) {
      const name = c.name || (c.destination || '')
      const mode = (c.mode || (c.result && c.result.raw_response && c.result.raw_response.request && c.result.raw_response.request.travelMode) || 'transit').toLowerCase()
      // determine icon based on commute name
      let icon = commuteNameToIcon(name)

      // derive minutes from raw_response when possible
      let minsLabel = ''
      try {
        const rr = c.result && c.result.raw_response
        const dur = rr && rr.routes && rr.routes[0] && rr.routes[0].legs && rr.routes[0].legs[0] && rr.routes[0].legs[0].duration && rr.routes[0].legs[0].duration.value
        if (dur) minsLabel = `${Math.round(dur/60)} min`
        else if (c.result && c.result.summary) minsLabel = c.result.summary
      } catch(e) { minsLabel = c.result && c.result.summary ? c.result.summary : '' }

      const badge = document.createElement('a')
      badge.className = 'commute-badge inline-block mr-2 px-2 py-1 rounded text-sm bg-gray-100 hover:bg-gray-200 text-gray-800'
      badge.href = buildGoogleMapsLink(item.address || '', c.destination || '', mode)
      badge.target = '_blank'
      // prepare summary text (avoid storing objects in attributes)
      let summaryText = ''
      if (c.result && c.result.summary) {
        if (typeof c.result.summary === 'string') summaryText = c.result.summary
        else if (c.result.summary.duration_text) summaryText = c.result.summary.duration_text
        else summaryText = JSON.stringify(c.result.summary)
      }
      // prepare nearest station string/object
      let nearestStr = ''
      let nearestObj = c.result && c.result.nearest_station
      if (nearestObj) {
        if (typeof nearestObj === 'string') nearestStr = nearestObj
        else if (nearestObj.name) {
          const mins = nearestObj.walking_seconds ? Math.round((nearestObj.walking_seconds||0)/60) : null
          nearestStr = nearestObj.name + (mins ? ` (${mins} min walk)` : '')
        } else {
          nearestStr = JSON.stringify(nearestObj)
        }
      }

      badge.setAttribute('data-commute-name', name)
      badge.setAttribute('data-commute-mode', mode)
      badge.setAttribute('data-commute-summary', summaryText)
      badge.setAttribute('data-commute-nearest', nearestStr)
      badge.innerHTML = `${icon} <strong class="mr-1">${minsLabel || ''}</strong>`

      // tooltip on hover: show detailed summary
      badge.addEventListener('mouseenter', (e) => {
        // try to render per-step breakdown from raw Google response
        let stepsHtml = ''
        try {
          const rr = c.result && c.result.raw_response
          const leg = rr && rr.routes && rr.routes[0] && rr.routes[0].legs && rr.routes[0].legs[0]
          if (leg && Array.isArray(leg.steps)) {
            for (const s of leg.steps) {
              const mode = (s.travel_mode || (s.transit_details ? 'TRANSIT' : '')).toUpperCase()
              const instr = stripHtml(s.html_instructions || s.instructions || s.summary || '')
              const dur = (s.duration && s.duration.text) ? s.duration.text : (s.duration && typeof s.duration.value === 'number' ? Math.round(s.duration.value/60) + ' mins' : '')
              if (mode === 'WALKING') {
                stepsHtml += `<div class="text-xs text-gray-700">Walk ${escapeHtml(dur)} — ${escapeHtml(instr)}</div>`
              } else if (mode === 'TRANSIT') {
                const td = s.transit_details || {}
                const line = td.line || {}
                const vehicle = (line.vehicle && line.vehicle.type) ? line.vehicle.type : (line.short_name || line.name || 'Transit')
                const nameLabel = line.short_name || line.name || ''
                const headsign = td.headsign ? ` → ${escapeHtml(stripHtml(td.headsign))}` : ''
                const stops = td.num_stops ? ` (${td.num_stops} stops)` : ''
                stepsHtml += `<div class="text-xs text-gray-700">${escapeHtml(vehicle)} ${escapeHtml(nameLabel)} ${escapeHtml(dur)}${headsign}${stops}</div>`
              } else {
                stepsHtml += `<div class="text-xs text-gray-700">${escapeHtml(mode)} ${escapeHtml(dur)} — ${escapeHtml(instr)}</div>`
              }
            }
          } else {
            stepsHtml = `<div class="text-xs text-gray-700">${escapeHtml(summaryText || '')}</div>`
          }
        } catch(err) {
          stepsHtml = `<div class="text-xs text-gray-700">${escapeHtml(summaryText || '')}</div>`
        }

        const html = `<div class="font-medium">${escapeHtml(name)}</div>${stepsHtml}`
        showTooltip(e.pageX, e.pageY, html)
      })
      badge.addEventListener('mousemove', (e) => moveTooltip(e.pageX, e.pageY))
      badge.addEventListener('mouseleave', hideTooltip)

      containerEl.appendChild(badge)
      // render nearest-station as its own badge (if present)
      if (nearestStr) {
        const nbadge = document.createElement('a')
        nbadge.className = 'nearest-badge inline-block mr-2 px-2 py-1 rounded text-sm bg-blue-50 hover:bg-blue-100 text-blue-700'
        // link to walking directions from origin to station (use station name if available)
        const stationTarget = (nearestObj && nearestObj.name) ? nearestObj.name : nearestStr
        nbadge.href = buildGoogleMapsLink(item.address || '', stationTarget, 'walking')
        nbadge.target = '_blank'
        nbadge.innerHTML = `🚉 <span class="text-xs">${escapeHtml(nearestStr)}</span>`
        nbadge.addEventListener('mouseenter', (e) => { showTooltip(e.pageX, e.pageY, `<div class="font-medium">Nearest station</div><div class="text-xs">${escapeHtml(nearestStr)}</div>`) })
        nbadge.addEventListener('mousemove', (e) => moveTooltip(e.pageX, e.pageY))
        nbadge.addEventListener('mouseleave', hideTooltip)
        containerEl.appendChild(nbadge)
      }
    }
    // Top-level nearest_station badge (per-listing) — render after all commute badges
    if (j && j.nearest_station) {
      const ns = j.nearest_station
      if (ns && (ns.walking_seconds || ns.walking_seconds === 0)) {
        const mins = (ns.walking_seconds !== null && typeof ns.walking_seconds === 'number') ? Math.round(ns.walking_seconds / 60) + ' mins' : ''
        const nsBadge = document.createElement('a')
        nsBadge.className = 'inline-block px-2 py-1 mr-2 mb-1 text-sm bg-yellow-100 rounded nearest-station-badge'
        const origin = j.address || (item && item.address) || ''
        const destination = ns.name || ''
        nsBadge.href = buildGoogleMapsLink(origin, destination, 'walking')
        nsBadge.target = '_blank'
        nsBadge.rel = 'noopener noreferrer'
        nsBadge.title = destination + (mins ? ` — ${mins}` : '')
        nsBadge.innerHTML = `<span class="mr-1">🚶 🚆</span> <span class="font-medium">${escapeHtml(mins)}</span>`
        containerEl.appendChild(nsBadge)
      }
    }
  } catch (e) {
    // silent fallback: keep whatever is in container (legacy travel link)
    console.error('commute load failed', e)
  }
}

// infinite scroll
window.addEventListener('scroll', () => {
  if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight - 300) {
    loadMore()
  }
},{passive: true})

// initial load
function resetAndLoad() {
  offset = 0
  container.innerHTML = ''
  loadingEl.textContent = 'Loading...'
  loadMore()
}

// populate travel select with 5-minute increments up to 120
function populateTravelSelect(){
  if (!filterTravelSelect) return
  filterTravelSelect.innerHTML = '<option value="any">Any</option>'
  for (let m = 5; m <= 120; m += 5){
    const opt = document.createElement('option')
    opt.value = String(m)
    opt.textContent = `${m} min`
    filterTravelSelect.appendChild(opt)
  }
  filterTravelSelect.value = currentTravelMax || 'any'
  filterTravelSelect.addEventListener('change', () => {
    currentTravelMax = filterTravelSelect.value
    saveFilters(); resetAndLoad()
  })
}

// hide-duplex button handling (dropdown-styled toggle)
function applyHideDuplexUI(){
  if (!hideDuplexBtn) return
  setToggleVisual(hideDuplexBtn, currentHideDuplex, 'green')
  hideDuplexBtn.setAttribute('aria-pressed', currentHideDuplex ? 'true' : 'false')
  hideDuplexBtn.addEventListener('click', () => {
    currentHideDuplex = !currentHideDuplex
    hideDuplexBtn.setAttribute('aria-pressed', currentHideDuplex ? 'true' : 'false')
    setToggleVisual(hideDuplexBtn, currentHideDuplex, 'green')
    saveFilters(); resetAndLoad()
  })
}

// Insert comment DOM element into a card's existing-comments container
function insertCommentIntoCard(cardEl, comment) {
  if (!cardEl || !comment) return
  const list = cardEl.querySelector('.existing-comments')
  if (!list) return
  const who = comment.person === 'tom' ? 'Tom' : 'MQ'
  const wrapper = document.createElement('div')
  wrapper.className = 'comment-item text-sm border rounded p-2 mb-1 flex items-start justify-between'
  wrapper.setAttribute('data-cid', comment.id)
  wrapper.innerHTML = `<div class="comment-body flex-1 min-w-0"><strong>${who}:</strong><div class="comment-main min-w-0"><span class="comment-text ml-2 block break-words">${escapeHtml(comment.text).replace(/\n/g,'<br>')}</span></div><div class="comment-ts text-xs text-gray-400 mt-1">${new Date(comment.ts*1000).toLocaleString()}</div></div><div class="ml-3 flex items-center flex-shrink-0"><button class="edit-comment text-xs ml-2 px-2 py-1" title="Edit">✏️</button><button class="del-comment text-xs ml-1 px-2 py-1 text-red-500" title="Delete">🗑️</button></div>`
  // insert at top
  if (list.firstChild) list.insertBefore(wrapper, list.firstChild)
  else list.appendChild(wrapper)
  // trim to 3 items
  const items = list.querySelectorAll('.comment-item')
  if (items.length > 3) {
    for (let i = 3; i < items.length; i++) items[i].remove()
  }
  // attach handlers to new buttons
  const editBtn = wrapper.querySelector('.edit-comment')
  const delBtn = wrapper.querySelector('.del-comment')
  if (editBtn) {
    editBtn.addEventListener('click', async (ev) => {
      ev.preventDefault(); ev.stopPropagation();
      const txtEl = wrapper.querySelector('.comment-text')
      if (!txtEl) return
      const cid = wrapper.getAttribute('data-cid')
      const listingId = cardEl.querySelector('.vote-btn')?.getAttribute('data-id') || ''
      // toggle edit/save
      if (editBtn.dataset.editing === 'true') {
        // save
        const newText = txtEl.innerText || ''
        try {
          const resp = await fetch(`/api/listing/${listingId}/comment/${cid}`, {method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({text: newText})})
          const j = await resp.json().catch(()=>null)
          if (j && j.ok) {
            txtEl.innerHTML = escapeHtml(newText).replace(/\n/g, '<br>')
            const tsEl = wrapper.querySelector('.text-xs')
            if (tsEl) tsEl.textContent = new Date().toLocaleString()
          } else {
            resetAndLoad()
          }
        } catch (e) { console.error('edit failed', e) }
        txtEl.contentEditable = 'false'
        txtEl.classList.remove('inline-editing')
        txtEl.style.display = ''
        txtEl.style.maxWidth = ''
        txtEl.style.whiteSpace = ''
        editBtn.dataset.editing = 'false'
        editBtn.textContent = '✏️'
      } else {
        // enter edit mode: inline contentEditable (single-line visual)
        if (wrapper.querySelector('.inline-editing')) return
        editBtn.dataset.editing = 'true'
        editBtn.textContent = '✓'
        txtEl.dataset.origText = txtEl.innerText || ''
        txtEl.contentEditable = 'true'
        txtEl.classList.add('inline-editing')
        const leftDiv = txtEl.parentNode
        if (leftDiv) {
          leftDiv._prevDisplay = leftDiv.style.display
          leftDiv._prevOverflow = leftDiv.style.overflow
          leftDiv.style.display = 'flex'
          leftDiv.style.alignItems = 'center'
          leftDiv.style.gap = '8px'
          leftDiv.style.overflow = 'hidden'
        }
        txtEl.style.display = 'inline-block'
        // allow wrapping during edit so long comments don't force a single-line overflow
        txtEl.style.whiteSpace = 'normal'
        txtEl.style.wordBreak = 'break-word'
        txtEl.style.overflowWrap = 'break-word'
        txtEl.style.overflowX = 'auto'
        // don't apply ellipsis while editing
        txtEl.style.textOverflow = ''
        txtEl.style.flex = '1 1 auto'
        txtEl.style.minWidth = '0'
        txtEl.style.borderBottom = '1px dashed rgba(148,163,184,0.8)'
        txtEl.style.padding = '0 4px'
        txtEl.style.verticalAlign = 'middle'
        const tsEl = leftDiv ? leftDiv.querySelector('.text-xs') : null
        if (tsEl) { tsEl.style.flex = '0 0 auto'; tsEl.style.marginLeft = '8px' }
        const keyHandler = (ke) => {
          if (ke.key === 'Enter' && !ke.shiftKey) { ke.preventDefault(); ke.stopPropagation(); editBtn.click(); }
          else if (ke.key === 'Escape') {
            ke.preventDefault(); ke.stopPropagation();
            txtEl.innerHTML = escapeHtml(txtEl.dataset.origText || '').replace(/\n/g,'<br>')
            txtEl.contentEditable = 'false'
            txtEl.classList.remove('inline-editing')
            txtEl.style.display = ''
            txtEl.style.whiteSpace = ''
            txtEl.style.wordBreak = ''
            txtEl.style.overflowWrap = ''
            txtEl.style.overflowX = ''
            txtEl.style.textOverflow = ''
            txtEl.style.flex = ''
            txtEl.style.minWidth = ''
            txtEl.style.borderBottom = ''
            txtEl.style.padding = ''
            try { const left = txtEl.parentNode; if (left && left._prevDisplay !== undefined) { left.style.display = left._prevDisplay || ''; left.style.alignItems = ''; left.style.gap = ''; if (left._prevOverflow !== undefined) { left.style.overflow = left._prevOverflow || '' } const ts = left.querySelector('.text-xs'); if (ts) { ts.style.flex = ''; ts.style.marginLeft = '' } delete left._prevDisplay; delete left._prevOverflow } } catch(e) {}
            try { txtEl.removeEventListener('keydown', txtEl._inlineKeyHandler) } catch(e){}
            delete txtEl._inlineKeyHandler
            editBtn.dataset.editing = 'false'
            editBtn.textContent = '✏️'
          }
        }
        txtEl._inlineKeyHandler = keyHandler
        txtEl.addEventListener('keydown', keyHandler)
        txtEl.focus()
        try { const range = document.createRange(); range.selectNodeContents(txtEl); range.collapse(false); const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range) } catch(e){}
      }
    })
  }
  if (delBtn) {
    delBtn.addEventListener('click', async (ev) => {
      ev.preventDefault(); ev.stopPropagation();
      if (!confirm('Delete comment?')) return
      try {
        const cid = wrapper.getAttribute('data-cid')
        const resp = await fetch(`/api/listing/${cardEl.querySelector('.vote-btn')?.getAttribute('data-id') || ''}/comment/${cid}`, {method:'DELETE'})
        const j = await resp.json().catch(()=>null)
        if (j && j.ok) wrapper.remove()
        else resetAndLoad()
      } catch (e) { console.error('delete failed', e) }
    })
  }
  // don't attach a global image handler here — image click handlers are set in renderItem
}

function saveFilters(){
  const obj = {status: currentFilter, sort: currentSort, ranking: !!currentRanking, tom: currentTomFilter, mq: currentMqFilter, exclude_voted_mode: currentExcludeMode, travel_max: currentTravelMax, hide_duplex: currentHideDuplex, search: currentSearchTerm}
  try{ localStorage.setItem('hf_filters', JSON.stringify(obj)) }catch(e){}
}

// Search functionality
function initFilterHandlers() {
  // Search input
  if (searchInput) {
    searchInput.value = currentSearchTerm
    searchInput.addEventListener('input', () => {
      currentSearchTerm = searchInput.value
      saveFilters()
      // Reset and reload with the new search term
      resetAndLoad()
    })
  }

  // Hide-sold toggle: default shows only available when on
  if (hideSoldBtn) {
    const updateHideSoldUI = () => {
      const on = currentFilter === 'hide_sold'
      hideSoldBtn.setAttribute('aria-pressed', on ? 'true' : 'false')
      setToggleVisual(hideSoldBtn, on, 'green')
    }
    updateHideSoldUI()
    hideSoldBtn.addEventListener('click', () => {
      currentFilter = (currentFilter === 'hide_sold') ? 'all' : 'hide_sold'
      updateHideSoldUI()
      saveFilters(); resetAndLoad()
    })
  }

  // sort by travel toggle (default ON)
  if (sortTravelBtn) {
    const updateSortUI = () => {
      const on = currentSort === 'travel'
      setToggleVisual(sortTravelBtn, on, 'green')
      sortTravelBtn.textContent = on ? 'Travel Time (On)' : 'Travel Time (Off)'
    }
    updateSortUI()
    sortTravelBtn.addEventListener('click', () => { currentSort = currentSort === 'travel' ? 'none' : 'travel'; saveFilters(); resetAndLoad(); updateSortUI() })
  }

  // cycle tri-state: any -> yes -> no -> any
  if (filterTomYesBtn) {
    const updateTomUI = () => {
      if (currentTomFilter === 'yes') { setToggleVisual(filterTomYesBtn, true, 'green'); filterTomYesBtn.textContent = 'Tom:Yes' }
      else if (currentTomFilter === 'no') { setToggleVisual(filterTomYesBtn, true, 'red'); filterTomYesBtn.textContent = 'Tom:No' }
      else { setToggleVisual(filterTomYesBtn, false); filterTomYesBtn.textContent = 'Tom' }
    }
    updateTomUI()
    filterTomYesBtn.addEventListener('click', () => { currentTomFilter = currentTomFilter === 'any' ? 'yes' : (currentTomFilter === 'yes' ? 'no' : 'any'); saveFilters(); resetAndLoad(); updateTomUI() })
  }
  if (filterMqYesBtn) {
    const updateMqUI = () => {
      if (currentMqFilter === 'yes') { setToggleVisual(filterMqYesBtn, true, 'green'); filterMqYesBtn.textContent = 'MQ:Yes' }
      else if (currentMqFilter === 'no') { setToggleVisual(filterMqYesBtn, true, 'red'); filterMqYesBtn.textContent = 'MQ:No' }
      else { setToggleVisual(filterMqYesBtn, false); filterMqYesBtn.textContent = 'MQ' }
    }
    updateMqUI()
    filterMqYesBtn.addEventListener('click', () => { currentMqFilter = currentMqFilter === 'any' ? 'yes' : (currentMqFilter === 'yes' ? 'no' : 'any'); saveFilters(); resetAndLoad(); updateMqUI() })
  }

  if (filterExcludeSelect) {
    filterExcludeSelect.value = currentExcludeMode || 'none'
    filterExcludeSelect.addEventListener('change', () => {
      currentExcludeMode = filterExcludeSelect.value
      saveFilters(); resetAndLoad()
    })
  }
}

// Hide-sold toggle: default shows only available when on
if (hideSoldBtn) {
  const updateHideSoldUI = () => {
    const on = currentFilter === 'hide_sold'
    hideSoldBtn.setAttribute('aria-pressed', on ? 'true' : 'false')
    setToggleVisual(hideSoldBtn, on, 'green')
  }
  updateHideSoldUI()
  hideSoldBtn.addEventListener('click', () => {
    currentFilter = (currentFilter === 'hide_sold') ? 'all' : 'hide_sold'
    updateHideSoldUI()
    saveFilters(); resetAndLoad()
  })
}

// sort by travel toggle (default ON)
if (sortTravelBtn) {
  const updateSortUI = () => {
    const on = currentSort === 'travel'
    setToggleVisual(sortTravelBtn, on, 'green')
    sortTravelBtn.textContent = on ? 'Travel Time (On)' : 'Travel Time (Off)'
  }
  updateSortUI()
  sortTravelBtn.addEventListener('click', () => { currentSort = currentSort === 'travel' ? 'none' : 'travel'; saveFilters(); resetAndLoad(); updateSortUI() })
}

// cycle tri-state: any -> yes -> no -> any
if (filterTomYesBtn) {
  const updateTomUI = () => {
    if (currentTomFilter === 'yes') { setToggleVisual(filterTomYesBtn, true, 'green'); filterTomYesBtn.textContent = 'Tom:Yes' }
    else if (currentTomFilter === 'no') { setToggleVisual(filterTomYesBtn, true, 'red'); filterTomYesBtn.textContent = 'Tom:No' }
    else { setToggleVisual(filterTomYesBtn, false); filterTomYesBtn.textContent = 'Tom' }
  }
  updateTomUI()
  filterTomYesBtn.addEventListener('click', () => { currentTomFilter = currentTomFilter === 'any' ? 'yes' : (currentTomFilter === 'yes' ? 'no' : 'any'); saveFilters(); resetAndLoad(); updateTomUI() })
}
if (filterMqYesBtn) {
  const updateMqUI = () => {
    if (currentMqFilter === 'yes') { setToggleVisual(filterMqYesBtn, true, 'green'); filterMqYesBtn.textContent = 'MQ:Yes' }
    else if (currentMqFilter === 'no') { setToggleVisual(filterMqYesBtn, true, 'red'); filterMqYesBtn.textContent = 'MQ:No' }
    else { setToggleVisual(filterMqYesBtn, false); filterMqYesBtn.textContent = 'MQ' }
  }
  updateMqUI()
  filterMqYesBtn.addEventListener('click', () => { currentMqFilter = currentMqFilter === 'any' ? 'yes' : (currentMqFilter === 'yes' ? 'no' : 'any'); saveFilters(); resetAndLoad(); updateMqUI() })
}

if (filterExcludeSelect) {
  filterExcludeSelect.value = currentExcludeMode || 'none'
  filterExcludeSelect.addEventListener('change', () => {
    currentExcludeMode = filterExcludeSelect.value
    saveFilters(); resetAndLoad()
  })
}

// initialise UI from stored filters
function applyStoredToUI(){
  try {
    if (sortTravelBtn) { setToggleVisual(sortTravelBtn, currentSort === 'travel', 'green'); sortTravelBtn.textContent = currentSort === 'travel' ? 'Sort: travel' : 'Sort by travel time' }
    if (sortRankingBtn) { setToggleVisual(sortRankingBtn, !!currentRanking, 'green'); sortRankingBtn.textContent = currentRanking ? 'Ranking (On)' : 'Ranking (Off)' }
    if (filterTomYesBtn) {
      if (currentTomFilter === 'yes') setToggleVisual(filterTomYesBtn, true, 'green')
      else if (currentTomFilter === 'no') setToggleVisual(filterTomYesBtn, true, 'red')
      else setToggleVisual(filterTomYesBtn, false)
      filterTomYesBtn.textContent = currentTomFilter === 'yes' ? 'Tom:Yes' : (currentTomFilter === 'no' ? 'Tom:No' : 'Tom')
    }
    if (filterMqYesBtn) {
      if (currentMqFilter === 'yes') setToggleVisual(filterMqYesBtn, true, 'green')
      else if (currentMqFilter === 'no') setToggleVisual(filterMqYesBtn, true, 'red')
      else setToggleVisual(filterMqYesBtn, false)
      filterMqYesBtn.textContent = currentMqFilter === 'yes' ? 'MQ:Yes' : (currentMqFilter === 'no' ? 'MQ:No' : 'MQ')
    }
  } catch(e){}
  if (filterExcludeSelect) filterExcludeSelect.value = currentExcludeMode || 'none'
  try { if (hideDuplexBtn) { hideDuplexBtn.setAttribute('aria-pressed', currentHideDuplex ? 'true' : 'false'); setToggleVisual(hideDuplexBtn, currentHideDuplex, 'green') } } catch(e){}
  try { if (hideSoldBtn) { const on = currentFilter === 'hide_sold'; hideSoldBtn.setAttribute('aria-pressed', on ? 'true' : 'false'); setToggleVisual(hideSoldBtn, on, 'green') } } catch(e){}
}

document.addEventListener('DOMContentLoaded', () => {
  // now that DOM is ready, bind element references
  container = document.getElementById('listings')
  loadingEl = document.getElementById('loading')
  totalCountEl = document.getElementById('total-count')
  availableCountEl = document.getElementById('available-count')
  soldCountEl = document.getElementById('sold-count')
  hideSoldBtn = document.getElementById('hide-sold-btn')
  sortTravelBtn = document.getElementById('sort-travel')
  filterTomYesBtn = document.getElementById('filter-tom-yes')
  filterMqYesBtn = document.getElementById('filter-mq-yes')
  filterExcludeSelect = document.getElementById('exclude-voted-select')
  filterTravelSelect = document.getElementById('filter-travel-max')
  hideDuplexBtn = document.getElementById('hide-duplex-btn')
  searchInput = document.getElementById('searchInput')
  filtersToggle = document.getElementById('filters-toggle')
  filtersPanel = document.getElementById('filters-panel')
  sortMenuToggle = document.getElementById('sort-menu-toggle')
  sortPanel = document.getElementById('sort-panel')
  sortRankingBtn = document.getElementById('sort-ranking')

  try { applyStoredToUI() } catch(e) { console.error('applyStoredToUI failed', e) }
  try { populateTravelSelect() } catch(e) { console.error('populateTravelSelect failed', e) }
  try { applyHideDuplexUI() } catch(e) { console.error('applyHideDuplexUI failed', e) }
  try { initFilterHandlers() } catch(e) { console.error('initFilterHandlers failed', e) }
  // filters panel toggle
  if (filtersToggle && filtersPanel) {
    filtersToggle.addEventListener('click', (ev) => {
      ev.stopPropagation();
      // close sort panel if open
      try { if (sortPanel && !sortPanel.classList.contains('hidden')) { sortPanel.classList.add('hidden'); if (sortMenuToggle) sortMenuToggle.setAttribute('aria-expanded','false') } } catch(e){}
      const expanded = filtersToggle.getAttribute('aria-expanded') === 'true'
      filtersToggle.setAttribute('aria-expanded', expanded ? 'false' : 'true')
      filtersPanel.classList.toggle('hidden')
    })
    // clicking outside closes the panel
    document.addEventListener('click', (e) => {
      if (!filtersPanel.contains(e.target) && !filtersToggle.contains(e.target)) {
        filtersPanel.classList.add('hidden')
        try { filtersToggle.setAttribute('aria-expanded','false') } catch(e){}
      }
    })
  }
  // sort menu toggle (header)
  if (sortMenuToggle && sortPanel) {
    sortMenuToggle.addEventListener('click', (ev) => {
      ev.stopPropagation();
      // close filters panel if open
      try { if (filtersPanel && !filtersPanel.classList.contains('hidden')) { filtersPanel.classList.add('hidden'); if (filtersToggle) filtersToggle.setAttribute('aria-expanded','false') } } catch(e){}
      const expanded = sortMenuToggle.getAttribute('aria-expanded') === 'true'
      sortMenuToggle.setAttribute('aria-expanded', expanded ? 'false' : 'true')
      sortPanel.classList.toggle('hidden')
    })
    document.addEventListener('click', (e) => {
      if (!sortPanel.contains(e.target) && !sortMenuToggle.contains(e.target)) {
        sortPanel.classList.add('hidden')
        try { sortMenuToggle.setAttribute('aria-expanded','false') } catch(e){}
      }
    })
  }
  // sort panel buttons
  function updateSortPanelUI(){
    try {
      if (sortTravelBtn) setToggleVisual(sortTravelBtn, currentSort === 'travel', 'green')
      if (sortTravelBtn) sortTravelBtn.textContent = currentSort === 'travel' ? 'Travel Time (On)' : 'Travel Time (Off)'
      if (sortRankingBtn) setToggleVisual(sortRankingBtn, !!currentRanking, 'green')
      if (sortRankingBtn) sortRankingBtn.textContent = currentRanking ? 'Ranking (On)' : 'Ranking (Off)'
    } catch(e){}
  }
  if (sortRankingBtn) {
    sortRankingBtn.addEventListener('click', (ev) => {
      ev.preventDefault(); ev.stopPropagation();
      currentRanking = !currentRanking
      saveFilters(); resetAndLoad(); updateSortPanelUI()
    })
  }
  // ensure initial visual state
  updateSortPanelUI()
  // ensure travel button updates the sort panel visuals when toggled elsewhere
  if (sortTravelBtn) {
    sortTravelBtn.addEventListener('click', (ev) => { try{ updateSortPanelUI() }catch(e){} })
  }
  try { resetAndLoad() } catch(e) { console.error('resetAndLoad failed', e) }
})

// Carousel functionality
function setupCarousels() {
  document.querySelectorAll('.carousel-prev, .carousel-next').forEach(button => {
    if (button.dataset.bound === 'true') return;
    button.dataset.bound = 'true';

    button.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();

      const carouselId = button.dataset.carouselId;
      const container = document.querySelector(
        `.carousel-container[data-carousel-id="${carouselId}"]`
      );
      if (!container) return;

      const allImgs = container.querySelectorAll('.carousel-image');
      const currentImg = container.querySelector('.carousel-image.active');
      if (!currentImg || allImgs.length === 0) return;

      const currentIndex = Number(currentImg.dataset.imageIndex);
      const isNext = button.classList.contains('carousel-next');

      const newIndex = isNext
        ? (currentIndex + 1) % allImgs.length
        : (currentIndex - 1 + allImgs.length) % allImgs.length;

      // hide current
      currentImg.classList.remove('active');
      currentImg.style.display = 'none';

      // show next
      allImgs[newIndex].classList.add('active');
      allImgs[newIndex].style.display = 'block';
    });
  });
}

// Minimal popup implementation (clean restart)
const popup = document.getElementById('popup');
const popupContent = document.getElementById('popup-content');
const popupImage = document.getElementById('popup-image');
const popupPrev = document.getElementById('popup-prev');
const popupNext = document.getElementById('popup-next');
const popupCaption = document.getElementById('popup-caption');
const popupZoomIn = document.getElementById('popup-zoom-in');
const popupZoomOut = document.getElementById('popup-zoom-out');
const closePopupBtn = document.getElementById('close-popup');

let popupImages = [];
let popupIndex = 0;
let popupScale = 1;
let popupTranslateX = 0;
let popupTranslateY = 0;
let isPanning = false;
let panStartX = 0;
let panStartY = 0;

function openImagePopup(url, images, index) {
  popupImages = Array.isArray(images) ? images.slice() : (url ? [url] : []);
  popupIndex = (typeof index === 'number') ? index : (popupImages.indexOf(url) >= 0 ? popupImages.indexOf(url) : 0);
  if (!popup) return;
  if (popupImage) {
    popupImage.src = popupImages[popupIndex] || url || '';
    popupTranslateX = 0; popupTranslateY = 0;
    popupImage.style.transform = `translate(0px, 0px) scale(1)`;
    popupScale = 1;
  }
  popup.classList.remove('hidden');
  updatePopupControls();
  try { popup.focus(); } catch(e) {}
}

function closePopup() {
  if (!popup) return;
  popup.classList.add('hidden');
  if (popupImage) { popupImage.src = ''; popupImage.style.transform = ''; }
  popupImages = []; popupIndex = 0; popupScale = 1; popupTranslateX = 0; popupTranslateY = 0;
}

function updatePopupControls() {
  if (popupCaption) popupCaption.textContent = (popupImages.length > 0) ? `${popupIndex + 1} / ${popupImages.length}` : '';
  if (popupPrev) popupPrev.style.display = (popupImages.length > 1) ? 'block' : 'none';
  if (popupNext) popupNext.style.display = (popupImages.length > 1) ? 'block' : 'none';
}

function showPrev() {
  if (!popupImages || popupImages.length === 0) return;
  popupIndex = (popupIndex - 1 + popupImages.length) % popupImages.length;
  if (popupImage) { popupImage.src = popupImages[popupIndex]; popupTranslateX = 0; popupTranslateY = 0; popupImage.style.transform = `translate(0px, 0px) scale(1)`; popupScale = 1 }
  updatePopupControls();
}

function showNext() {
  if (!popupImages || popupImages.length === 0) return;
  popupIndex = (popupIndex + 1) % popupImages.length;
  if (popupImage) { popupImage.src = popupImages[popupIndex]; popupTranslateX = 0; popupTranslateY = 0; popupImage.style.transform = `translate(0px, 0px) scale(1)`; popupScale = 1 }
  updatePopupControls();
}

if (closePopupBtn) closePopupBtn.addEventListener('click', (e) => { e.stopPropagation(); closePopup(); });
if (popup) popup.addEventListener('click', (e) => { if (e.target === popup) closePopup(); });
document.addEventListener('keydown', (e) => {
  if (!popup || popup.classList.contains('hidden')) return;
  if (e.key === 'Escape') closePopup();
  else if (e.key === 'ArrowLeft') showPrev();
  else if (e.key === 'ArrowRight') showNext();
});

if (popupPrev) popupPrev.addEventListener('click', (e) => { e.stopPropagation(); showPrev(); });
if (popupNext) popupNext.addEventListener('click', (e) => { e.stopPropagation(); showNext(); });

if (popupImage) {
  // helper to apply combined translate + scale transform
  function applyPopupTransform() {
    if (!popupImage) return;
    popupImage.style.transform = `translate(${popupTranslateX}px, ${popupTranslateY}px) scale(${popupScale})`;
  }

  popupImage.addEventListener('load', () => { updatePopupControls(); applyPopupTransform(); });

  // wheel to zoom
  popupImage.addEventListener('wheel', (e) => {
    e.preventDefault();
    const delta = -e.deltaY || e.wheelDelta || -e.detail;
    const change = delta > 0 ? 0.1 : -0.1;
    const prevScale = popupScale;
    popupScale = Math.min(3, Math.max(1, popupScale + change));
    // if scaling down to 1, reset translate
    if (popupScale === 1) { popupTranslateX = 0; popupTranslateY = 0 }
    // adjust translate to keep pointer as zoom center (optional simple approach)
    applyPopupTransform();
  }, {passive:false});

  // double click to toggle zoom
  popupImage.addEventListener('dblclick', (e) => {
    const prev = popupScale;
    popupScale = (popupScale === 1) ? 2 : 1;
    if (popupScale === 1) { popupTranslateX = 0; popupTranslateY = 0 }
    applyPopupTransform();
  });

  // mouse pan handlers
  popupImage.addEventListener('mousedown', (e) => {
    if (popupScale <= 1) return;
    isPanning = true;
    panStartX = e.clientX - popupTranslateX;
    panStartY = e.clientY - popupTranslateY;
    popupImage.style.cursor = 'grabbing';
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!isPanning) return;
    popupTranslateX = e.clientX - panStartX;
    popupTranslateY = e.clientY - panStartY;
    applyPopupTransform();
  });

  document.addEventListener('mouseup', (e) => {
    if (!isPanning) return;
    isPanning = false;
    popupImage.style.cursor = 'grab';
  });

  // touch pan
  popupImage.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1 && popupScale > 1) {
      const t = e.touches[0];
      isPanning = true;
      panStartX = t.clientX - popupTranslateX;
      panStartY = t.clientY - popupTranslateY;
    }
  }, {passive:false});
  popupImage.addEventListener('touchmove', (e) => {
    if (!isPanning) return;
    const t = e.touches[0];
    popupTranslateX = t.clientX - panStartX;
    popupTranslateY = t.clientY - panStartY;
    applyPopupTransform();
    e.preventDefault();
  }, {passive:false});
  popupImage.addEventListener('touchend', (e) => { isPanning = false; });
}

if (popupZoomIn) popupZoomIn.addEventListener('click', (e) => { e.stopPropagation(); popupScale = Math.min(3, popupScale + 0.25); if (popupImage) popupImage.style.transform = `scale(${popupScale})`; });
if (popupZoomOut) popupZoomOut.addEventListener('click', (e) => { e.stopPropagation(); popupScale = Math.max(1, popupScale - 0.25); if (popupImage) popupImage.style.transform = `scale(${popupScale})`; });
