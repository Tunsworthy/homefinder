// Map view logic: reuse stored filters and plot pins
let map
let infoWindow
let markers = []
let container = null
let totalCountEl = null
let availableCountEl = null
let soldCountEl = null
let hideSoldBtn = null
let sortTravelBtn = null
let sortRankingBtn = null
let filterTomYesBtn = null
let filterMqYesBtn = null
let filterExcludeSelect = null
let filterTravelSelect = null
let workflowStatusSelect = null
let suburbsSelect = null
let hideDuplexBtn = null
let searchInput = null
let resetFiltersBtn = null
let applyFiltersBtn = null

// Load shared filters from filters.js
loadStoredFilters()

// Utilities from list view
function escapeHtml(s) {
  if (s === null || typeof s === 'undefined') return ''
  const str = String(s)
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}
function stripHtml(s) {
  if (s === null || typeof s === 'undefined') return ''
  return String(s).replace(/<[^>]*>/g, '')
}

// Tooltip helpers (for commute breakdown)
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

// Image Popup handling (same as list page)
let popupImages = []
let popupIndex = 0
let popupScale = 1
let popupTranslateX = 0
let popupTranslateY = 0
const popup = document.getElementById('popup')
const popupImage = document.getElementById('popup-image')
const popupCaption = document.getElementById('popup-caption')
const popupPrev = document.getElementById('popup-prev')
const popupNext = document.getElementById('popup-next')
const closePopupBtn = document.getElementById('close-popup')
const popupZoomIn = document.getElementById('popup-zoom-in')
const popupZoomOut = document.getElementById('popup-zoom-out')

function openImagePopup(url, images, index) {
  popupImages = Array.isArray(images) ? images.slice() : (url ? [url] : [])
  popupIndex = (typeof index === 'number') ? index : (popupImages.indexOf(url) >= 0 ? popupImages.indexOf(url) : 0)
  if (!popup) return
  if (popupImage) {
    popupImage.src = popupImages[popupIndex] || url || ''
    popupTranslateX = 0; popupTranslateY = 0
    popupImage.style.transform = `translate(0px, 0px) scale(1)`
    popupScale = 1
  }
  popup.classList.remove('hidden')
  updatePopupControls()
  try { popup.focus() } catch(e) {}
}

function closePopup() {
  if (!popup) return
  popup.classList.add('hidden')
  if (popupImage) { popupImage.src = ''; popupImage.style.transform = '' }
  popupImages = []; popupIndex = 0; popupScale = 1; popupTranslateX = 0; popupTranslateY = 0
}

function updatePopupControls() {
  if (popupCaption) popupCaption.textContent = (popupImages.length > 0) ? `${popupIndex + 1} / ${popupImages.length}` : ''
  if (popupPrev) popupPrev.style.display = (popupImages.length > 1) ? 'block' : 'none'
  if (popupNext) popupNext.style.display = (popupImages.length > 1) ? 'block' : 'none'
}

function showPrev() {
  if (!popupImages || popupImages.length === 0) return
  popupIndex = (popupIndex - 1 + popupImages.length) % popupImages.length
  if (popupImage) { popupImage.src = popupImages[popupIndex]; popupTranslateX = 0; popupTranslateY = 0; popupImage.style.transform = `translate(0px, 0px) scale(1)`; popupScale = 1 }
  updatePopupControls()
}

function showNext() {
  if (!popupImages || popupImages.length === 0) return
  popupIndex = (popupIndex + 1) % popupImages.length
  if (popupImage) { popupImage.src = popupImages[popupIndex]; popupTranslateX = 0; popupTranslateY = 0; popupImage.style.transform = `translate(0px, 0px) scale(1)`; popupScale = 1 }
  updatePopupControls()
}

if (closePopupBtn) closePopupBtn.addEventListener('click', (e) => { e.stopPropagation(); closePopup() })
if (popup) popup.addEventListener('click', (e) => { if (e.target === popup) closePopup() })
if (popupPrev) popupPrev.addEventListener('click', (e) => { e.stopPropagation(); showPrev() })
if (popupNext) popupNext.addEventListener('click', (e) => { e.stopPropagation(); showNext() })
if (popupZoomIn) popupZoomIn.addEventListener('click', (e) => { e.stopPropagation(); popupScale = Math.min(3, popupScale + 0.25); if (popupImage) popupImage.style.transform = `scale(${popupScale})` })
if (popupZoomOut) popupZoomOut.addEventListener('click', (e) => { e.stopPropagation(); popupScale = Math.max(1, popupScale - 0.25); if (popupImage) popupImage.style.transform = `scale(${popupScale})` })

// Build a Google Maps directions URL for a commute
function buildGoogleMapsLink(origin, destination, mode) {
  try {
    const qs = new URLSearchParams()
    qs.set('api', '1')
    if (origin) qs.set('origin', origin)
    if (destination) qs.set('destination', destination)
    if (mode) qs.set('travelmode', mode === 'transit' ? 'transit' : mode)
    return `https://www.google.com/maps/dir/?${qs.toString()}`
  } catch (e) { return '#' }
}

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
    if (!res.ok) return
    const j = await res.json()
    const commutes = j && j.commutes ? j.commutes : []
    if (!commutes || commutes.length === 0) return
    containerEl.innerHTML = ''

    for (const c of commutes) {
      const name = c.name || (c.destination || '')
      const mode = (c.mode || (c.result && c.result.raw_response && c.result.raw_response.request && c.result.raw_response.request.travelMode) || 'transit').toLowerCase()
      let icon = commuteNameToIcon(name)
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

      let summaryText = ''
      if (c.result && c.result.summary) {
        if (typeof c.result.summary === 'string') summaryText = c.result.summary
        else if (c.result.summary.duration_text) summaryText = c.result.summary.duration_text
        else summaryText = JSON.stringify(c.result.summary)
      }
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

      badge.addEventListener('mouseenter', (e) => {
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
      if (nearestStr) {
        const nbadge = document.createElement('a')
        nbadge.className = 'nearest-badge inline-block mr-2 px-2 py-1 rounded text-sm bg-blue-50 hover:bg-blue-100 text-blue-700'
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
  } catch (e) { console.error('commute load failed', e) }
}

function buildQueryParams() {
  const statusParam = (currentFilter === 'hide_sold') ? 'available' : 'all'
  const qs = new URLSearchParams({offset: '0', limit: '500', status: statusParam, sort: currentSort, tom: currentTomFilter, mq: currentMqFilter, exclude_voted_mode: currentExcludeMode})
  if (currentTravelMax && currentTravelMax !== 'any') qs.set('travel_max', String(currentTravelMax))
  if (currentSearchTerm) qs.set('search', currentSearchTerm)
  return qs
}

async function fetchListings() {
  const res = await fetch(`/api/listings?${buildQueryParams().toString()}`)
  const data = await res.json()
  const items = data.listings || []
  // client-side duplex filter
  const filteredItems = items.filter(it => {
    if (!currentHideDuplex) return true
    const pt = (it.property_type || '').toString().toLowerCase()
    if (!pt) return true
    if (pt.includes('duplex')) return false
    if (pt.includes('semi') || pt.includes('semi-detached') || pt.includes('semi detached')) return false
    return true
  })
  // ranking sort fallback
  if (currentRanking) {
    filteredItems.sort((a, b) => {
      if (currentSort === 'travel') {
        const aT = (typeof a.travel_duration_seconds === 'number') ? a.travel_duration_seconds : Infinity
        const bT = (typeof b.travel_duration_seconds === 'number') ? b.travel_duration_seconds : Infinity
        if (aT !== bT) return aT - bT
      }
      const aScore = (Number(a.tom_score) || 0) + (Number(a.mq_score) || 0)
      const bScore = (Number(b.tom_score) || 0) + (Number(b.mq_score) || 0)
      return bScore - aScore
    })
  }
  // update counters
  if (totalCountEl) totalCountEl.textContent = data.total ?? filteredItems.length
  if (availableCountEl) availableCountEl.textContent = data.available ?? ''
  if (soldCountEl) soldCountEl.textContent = data.sold ?? ''
  return filteredItems
}

// Helper to add listing to inspection plan - using modal window
let pendingListingId = null

async function loadPlansIntoDropdown() {
  const selectEl = document.getElementById('plan-select')
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
    
    // Set today's date as default for new plan
    document.getElementById('new-plan-date').value = new Date().toISOString().split('T')[0]
  } catch (e) {
    console.error('Failed to load plans', e)
    selectEl.innerHTML = '<option value="">Error loading plans</option>'
  }
}

async function addListingToPlan(listingId) {
  // Now handled via HF.showAddToPlanModal
}

// Modal handlers - Update to use HF namespace
document.getElementById('plan-modal-cancel')?.addEventListener('click', () => {
  document.getElementById('add-to-plan-modal').classList.add('hidden')
  pendingListingId = null
})

document.getElementById('add-to-plan-modal')?.addEventListener('click', (e) => {
  if (e.target.id === 'add-to-plan-modal') {
    document.getElementById('add-to-plan-modal').classList.add('hidden')
    pendingListingId = null
  }
})

document.getElementById('plan-modal-add')?.addEventListener('click', async () => {
  if (!HF.pendingInspection) return
  
  const selectedPlanId = document.getElementById('plan-select').value
  const newPlanName = document.getElementById('new-plan-name').value.trim()
  const openTime = document.getElementById('inspection-open-time').value
  const closeTime = document.getElementById('inspection-close-time').value
  
  try {
    let targetPlanId = selectedPlanId
    
    if (!selectedPlanId && newPlanName) {
      // Create new plan
      const newPlanDate = document.getElementById('new-plan-date').value
      const createRes = await fetch('/api/inspection-plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newPlanName,
          date: newPlanDate,
          mode: 'driving',
          stops: []
        })
      })
      const createData = await createRes.json()
      targetPlanId = createData.plan.id
    }
    
    if (!targetPlanId) {
      alert('Please select a plan or create a new one')
      return
    }
    
    const res = await fetch('/api/inspection-plans')
    const data = await res.json()
    const planToUpdate = data.plans[targetPlanId]
    
    if (!planToUpdate) {
      alert('Plan not found')
      return
    }
    
    planToUpdate.stops = planToUpdate.stops || []
    planToUpdate.stops.push({
      listing_id: HF.pendingInspection.listingId,
      open_time: openTime,
      close_time: closeTime,
      override_minutes: null
    })
    
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

function clearMarkers() {
  for (const m of markers) {
    try {
      if (typeof m.setMap === 'function') {
        m.setMap(null)
      } else if (Object.prototype.hasOwnProperty.call(m, 'map')) {
        m.map = null
      }
    } catch (e) {}
  }
  markers = []
}

function renderList(listings) {
  if (!container) return
  container.innerHTML = ''
  if (!listings.length) {
    container.innerHTML = '<div class="text-sm text-gray-600">No listings match the filters.</div>'
    return
  }
  for (const item of listings) {
    const el = document.createElement('div')
    el.className = 'border rounded p-3 relative'
    const card = window.HF.renderListingContent(null, item, {commentsMode:'top3', compact:true, showLinks:true})
    el.appendChild(card)
    
    container.appendChild(el)
    window.HF.setupCarousels()
    window.HF.wireAddToPlanButtons()
    const cm = el.querySelector('.commutes-container'); if (cm) window.HF.loadAndRenderCommutes(item.id, cm, item)
    window.HF.initVoteButtons(el, item)
    window.HF.initStatusDropdown(el, item)
    // Attach image click handlers for popup zoom
    const imgs = el.querySelectorAll('img')
    imgs.forEach((img, idx) => {
      img.addEventListener('click', (e) => {
        e.preventDefault(); e.stopPropagation()
        const images = (item.images && item.images.length) ? item.images : (item.image ? [item.image] : [])
        const clickedImageSrc = img.src
        const clickedIndex = images.indexOf(clickedImageSrc) >= 0 ? images.indexOf(clickedImageSrc) : 0
        openImagePopup(clickedImageSrc, images, clickedIndex)
      })
    })
  }
  window.HF.setupCarousels()
}

function buildInfoNode(item) {
  const wrapper = document.createElement('div')
  wrapper.className = 'max-w-xs relative'
  const card = window.HF.renderListingContent(null, item, {commentsMode:'latest', compact:true, showLinks:true})
  wrapper.appendChild(card)
  
  window.HF.setupCarousels()
  window.HF.wireAddToPlanButtons()
  
  const cm = wrapper.querySelector('.commutes-container'); if (cm) window.HF.loadAndRenderCommutes(item.id, cm, item)
  window.HF.initVoteButtons(wrapper, item)
  window.HF.initStatusDropdown(wrapper, item)
  // Attach image click handlers for popup zoom
  const imgs = wrapper.querySelectorAll('img')
  imgs.forEach((img, idx) => {
    img.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation()
      const images = (item.images && item.images.length) ? item.images : (item.image ? [item.image] : [])
      const clickedImageSrc = img.src
      const clickedIndex = images.indexOf(clickedImageSrc) >= 0 ? images.indexOf(clickedImageSrc) : 0
      openImagePopup(clickedImageSrc, images, clickedIndex)
    })
  })
  return wrapper
}

function renderMarkers(listings) {
  if (!map) return
  clearMarkers()
  const bounds = new google.maps.LatLngBounds()
  for (const item of listings) {
    if (typeof item.lat !== 'number' || typeof item.lng !== 'number') continue
    const position = {lat: item.lat, lng: item.lng}
    const marker = new google.maps.marker.AdvancedMarkerElement({position, map, title: item.address || item.id})
    marker.addListener('click', () => {
      if (!infoWindow) infoWindow = new google.maps.InfoWindow()
      const node = buildInfoNode(item)
      infoWindow.setContent(node)
      infoWindow.open({anchor: marker, map})
      // Setup carousels after InfoWindow is opened and content is in DOM
      setTimeout(() => { window.HF.setupCarousels() }, 100)
    })
    markers.push(marker)
    bounds.extend(position)
  }
  if (!markers.length) return
  try { map.fitBounds(bounds) } catch (e) {}
  const listener = google.maps.event.addListenerOnce(map, 'bounds_changed', () => {
    if (map.getZoom() > 16) map.setZoom(16)
  })
  if (listener) setTimeout(() => { try { google.maps.event.removeListener(listener) } catch (e) {} }, 3000)
}

async function reload() {
  saveFilters()
  const listings = await fetchListings()
  renderList(listings)
  renderMarkers(listings)
}

function initFilterControls() {
  hideSoldBtn = document.getElementById('hide-sold-btn')
  sortTravelBtn = document.getElementById('sort-travel')
  sortRankingBtn = document.getElementById('sort-ranking')
  filterTomYesBtn = document.getElementById('filter-tom-yes')
  filterMqYesBtn = document.getElementById('filter-mq-yes')
  filterExcludeSelect = document.getElementById('exclude-voted-select')
  filterTravelSelect = document.getElementById('filter-travel-max')
  const filterWorkflowStatusSelect = document.getElementById('filter-workflow-status')
  const filterSuburbsSelect = document.getElementById('filter-suburbs')
  hideDuplexBtn = document.getElementById('hide-duplex-btn')
  searchInput = document.getElementById('searchInput')
  resetFiltersBtn = document.getElementById('reset-filters')
  applyFiltersBtn = document.getElementById('apply-filters-btn')
  container = document.getElementById('listings')
  totalCountEl = document.getElementById('total-count')
  availableCountEl = document.getElementById('available-count')
  soldCountEl = document.getElementById('sold-count')

  if (searchInput) {
    searchInput.value = currentSearchTerm
    searchInput.addEventListener('input', () => {
      currentSearchTerm = searchInput.value
      saveFilters(); reload()
    })
  }

  if (hideSoldBtn) {
    const update = () => {
      const on = currentFilter === 'hide_sold'
      hideSoldBtn.setAttribute('aria-pressed', on ? 'true' : 'false')
      setToggleVisual(hideSoldBtn, on, 'green')
    }
    update()
    hideSoldBtn.addEventListener('click', () => {
      currentFilter = (currentFilter === 'hide_sold') ? 'all' : 'hide_sold'
      update(); saveFilters()
    })
  }

  if (sortTravelBtn && sortRankingBtn) {
    const sync = () => {
      setToggleVisual(sortTravelBtn, currentSort === 'travel', 'blue')
      setToggleVisual(sortRankingBtn, currentRanking, 'blue')
    }
    sync()
    sortTravelBtn.addEventListener('click', () => {
      currentSort = 'travel'; sync(); saveFilters()
    })
    sortRankingBtn.addEventListener('click', () => {
      currentRanking = !currentRanking; sync(); saveFilters()
    })
  }

  if (filterTomYesBtn) {
    const sync = () => setToggleVisual(filterTomYesBtn, currentTomFilter === 'yes', 'yellow')
    sync()
    filterTomYesBtn.addEventListener('click', () => {
      currentTomFilter = (currentTomFilter === 'yes') ? 'any' : 'yes'
      sync(); saveFilters()
    })
  }
  if (filterMqYesBtn) {
    const sync = () => setToggleVisual(filterMqYesBtn, currentMqFilter === 'yes', 'purple')
    sync()
    filterMqYesBtn.addEventListener('click', () => {
      currentMqFilter = (currentMqFilter === 'yes') ? 'any' : 'yes'
      sync(); saveFilters()
    })
  }

  if (filterExcludeSelect) {
    filterExcludeSelect.value = currentExcludeMode
    filterExcludeSelect.addEventListener('change', () => {
      currentExcludeMode = filterExcludeSelect.value
      saveFilters()
    })
  }

  // Use shared filter UI functions with reload callback
  initTravelSelect()
  initHideDuplexUI()
  initWorkflowStatusUI()
  initSuburbsUI()

  // Apply Filters button
  if (applyFiltersBtn) {
    applyFiltersBtn.addEventListener('click', () => {
      reload()
    })
  }

  if (resetFiltersBtn) {
    resetFiltersBtn.addEventListener('click', () => {
      currentTomFilter = 'any'
      currentMqFilter = 'any'
      currentFilter = 'hide_sold'
      currentSort = 'travel'
      currentExcludeMode = 'none'
      currentTravelMax = '55'
      currentWorkflowStatuses = ['active']
      currentSuburbs = []
      currentHideDuplex = true
      currentSearchTerm = ''
      currentRanking = false
      if (filterExcludeSelect) filterExcludeSelect.value = currentExcludeMode
      if (filterTravelSelect) filterTravelSelect.value = currentTravelMax
      if (searchInput) searchInput.value = ''
      if (hideSoldBtn) { hideSoldBtn.setAttribute('aria-pressed', 'true'); setToggleVisual(hideSoldBtn, true, 'green') }
      if (sortTravelBtn && sortRankingBtn) { setToggleVisual(sortTravelBtn, true, 'blue'); setToggleVisual(sortRankingBtn, false, 'blue') }
      if (filterTomYesBtn) setToggleVisual(filterTomYesBtn, false, 'yellow')
      if (filterMqYesBtn) setToggleVisual(filterMqYesBtn, false, 'purple')
      if (hideDuplexBtn) { hideDuplexBtn.setAttribute('aria-pressed', 'true'); setToggleVisual(hideDuplexBtn, true, 'green') }
      if (filterWorkflowStatusSelect && window.workflowStatusSelect) workflowStatusSelect.setValue(['active'])
      if (filterSuburbsSelect && window.suburbsSelect) suburbsSelect.setValue([])
      saveFilters(); reload()
    })
  }
}

// Wrapper functions to use shared filter helpers with map's reload callback
function initTravelSelect() {
  populateTravelSelect(filterTravelSelect, () => {})  // Don't reload immediately
}

function initWorkflowStatusUI() {
  const selectEl = document.getElementById('filter-workflow-status')
  if (!selectEl) return
  workflowStatusSelect = applyWorkflowStatusUI(selectEl, () => {})  // Don't reload immediately
}

async function initSuburbsUI() {
  const selectEl = document.getElementById('filter-suburbs')
  if (!selectEl) return
  suburbsSelect = await applySuburbsUI(selectEl, () => {})  // Don't reload immediately
}

function initHideDuplexUI() {
  applyHideDuplexUI(hideDuplexBtn, () => {})  // Don't reload immediately
}

function loadGoogleMaps() {
  return new Promise((resolve, reject) => {
    if (window.google && window.google.maps) return resolve()
    const loader = document.getElementById('gmaps-loader')
    const key = loader ? (loader.dataset.apiKey || '') : ''
    const script = document.createElement('script')
    const cbName = '__hfInitMap'
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&callback=${cbName}&libraries=marker`
    script.async = true
    script.onerror = () => reject(new Error('Google Maps failed to load'))
    window[cbName] = () => resolve()
    document.head.appendChild(script)
  })
}

async function boot() {
  initFilterControls()
  try {
    await loadGoogleMaps()
  } catch (e) {
    const mapEl = document.getElementById('map')
    if (mapEl) mapEl.innerHTML = '<div class="p-4 text-sm text-red-600">Google Maps failed to load. Set MAPS_API_KEY env var and reload.</div>'
    console.error(e)
    return
  }
  map = new google.maps.Map(document.getElementById('map'), {
    center: {lat: -33.8688, lng: 151.2093},
    zoom: 11,
    mapTypeControl: false,
    streetViewControl: false,
  })
  infoWindow = new google.maps.InfoWindow()
  reload()
}

document.addEventListener('DOMContentLoaded', boot)
