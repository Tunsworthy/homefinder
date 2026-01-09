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
let hideDuplexBtn = null
let searchInput = null
let resetFiltersBtn = null

// persistent filters stored in localStorage (same key as list page)
let stored = {}
try { stored = JSON.parse(localStorage.getItem('hf_filters') || '{}') } catch (e) { stored = {} }
let currentTomFilter = stored.tom || 'any'
let currentMqFilter = stored.mq || 'any'
let currentFilter = (typeof stored.status === 'undefined') ? 'hide_sold' : stored.status || 'all'
let currentSort = stored.sort || 'travel'
let currentExcludeMode = stored.exclude_voted_mode || 'none'
let currentTravelMax = stored.travel_max || '55'
let currentHideDuplex = (typeof stored.hide_duplex === 'undefined') ? true : !!stored.hide_duplex
let currentSearchTerm = stored.search || ''
let currentRanking = !!stored.ranking

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

function setToggleVisual(btn, on, color) {
  if (!btn) return
  btn.classList.remove('bg-green-600','bg-red-600','bg-gray-200','bg-gray-100','bg-blue-600','bg-yellow-100','bg-purple-100','text-white','text-gray-800')
  if (on) {
    let className = 'bg-green-600'
    if (color === 'blue') className = 'bg-blue-600'
    if (color === 'red') className = 'bg-red-600'
    btn.classList.add(className,'text-white')
  } else {
    btn.classList.add('bg-gray-200','text-gray-800')
  }
}

function saveFilters() {
  const obj = {status: currentFilter, sort: currentSort, ranking: !!currentRanking, tom: currentTomFilter, mq: currentMqFilter, exclude_voted_mode: currentExcludeMode, travel_max: currentTravelMax, hide_duplex: currentHideDuplex, search: currentSearchTerm}
  try { localStorage.setItem('hf_filters', JSON.stringify(obj)) } catch (e) {}
}

function populateTravelSelect() {
  if (!filterTravelSelect) return
  filterTravelSelect.innerHTML = '<option value="any">Any</option>'
  for (let m = 5; m <= 120; m += 5) {
    const opt = document.createElement('option')
    opt.value = String(m)
    opt.textContent = `${m} min`
    filterTravelSelect.appendChild(opt)
  }
  filterTravelSelect.value = currentTravelMax || 'any'
  filterTravelSelect.addEventListener('change', () => {
    currentTravelMax = filterTravelSelect.value
    saveFilters(); reload()
  })
}

function applyHideDuplexUI() {
  if (!hideDuplexBtn) return
  setToggleVisual(hideDuplexBtn, currentHideDuplex, 'green')
  hideDuplexBtn.setAttribute('aria-pressed', currentHideDuplex ? 'true' : 'false')
  hideDuplexBtn.addEventListener('click', () => {
    currentHideDuplex = !currentHideDuplex
    hideDuplexBtn.setAttribute('aria-pressed', currentHideDuplex ? 'true' : 'false')
    setToggleVisual(hideDuplexBtn, currentHideDuplex, 'green')
    saveFilters(); reload()
  })
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

function clearMarkers() {
  for (const m of markers) {
    try { m.setMap(null) } catch (e) {}
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
    el.className = 'border rounded p-3'
    const card = window.HF.renderListingContent(null, item, {commentsMode:'top3', compact:true, showLinks:true})
    el.appendChild(card)
    container.appendChild(el)
    const cm = el.querySelector('.commutes-container'); if (cm) window.HF.loadAndRenderCommutes(item.id, cm, item)
    window.HF.initVoteButtons(el, item)
  }
  window.HF.setupCarousels()
}

function buildInfoNode(item) {
  const wrapper = document.createElement('div')
  wrapper.className = 'max-w-xs'
  const card = window.HF.renderListingContent(null, item, {commentsMode:'latest', compact:true, showLinks:true})
  wrapper.appendChild(card)
  const cm = wrapper.querySelector('.commutes-container'); if (cm) window.HF.loadAndRenderCommutes(item.id, cm, item)
  window.HF.initVoteButtons(wrapper, item)
  window.HF.setupCarousels()
  return wrapper
}

function renderMarkers(listings) {
  if (!map) return
  clearMarkers()
  const bounds = new google.maps.LatLngBounds()
  for (const item of listings) {
    if (typeof item.lat !== 'number' || typeof item.lng !== 'number') continue
    const marker = new google.maps.Marker({position: {lat: item.lat, lng: item.lng}, map, title: item.address || item.id})
    marker.addListener('click', () => {
      if (!infoWindow) infoWindow = new google.maps.InfoWindow()
      const node = buildInfoNode(item)
      infoWindow.setContent(node)
      infoWindow.open({anchor: marker, map})
    })
    markers.push(marker)
    bounds.extend(marker.getPosition())
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
  hideDuplexBtn = document.getElementById('hide-duplex-btn')
  searchInput = document.getElementById('searchInput')
  resetFiltersBtn = document.getElementById('reset-filters')
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
      update(); saveFilters(); reload()
    })
  }

  if (sortTravelBtn && sortRankingBtn) {
    const sync = () => {
      setToggleVisual(sortTravelBtn, currentSort === 'travel', 'blue')
      setToggleVisual(sortRankingBtn, currentRanking, 'blue')
    }
    sync()
    sortTravelBtn.addEventListener('click', () => {
      currentSort = 'travel'; sync(); saveFilters(); reload()
    })
    sortRankingBtn.addEventListener('click', () => {
      currentRanking = !currentRanking; sync(); saveFilters(); reload()
    })
  }

  if (filterTomYesBtn) {
    const sync = () => setToggleVisual(filterTomYesBtn, currentTomFilter === 'yes', 'yellow')
    sync()
    filterTomYesBtn.addEventListener('click', () => {
      currentTomFilter = (currentTomFilter === 'yes') ? 'any' : 'yes'
      sync(); saveFilters(); reload()
    })
  }
  if (filterMqYesBtn) {
    const sync = () => setToggleVisual(filterMqYesBtn, currentMqFilter === 'yes', 'purple')
    sync()
    filterMqYesBtn.addEventListener('click', () => {
      currentMqFilter = (currentMqFilter === 'yes') ? 'any' : 'yes'
      sync(); saveFilters(); reload()
    })
  }

  if (filterExcludeSelect) {
    filterExcludeSelect.value = currentExcludeMode
    filterExcludeSelect.addEventListener('change', () => {
      currentExcludeMode = filterExcludeSelect.value
      saveFilters(); reload()
    })
  }

  populateTravelSelect()
  applyHideDuplexUI()

  if (resetFiltersBtn) {
    resetFiltersBtn.addEventListener('click', () => {
      currentTomFilter = 'any'
      currentMqFilter = 'any'
      currentFilter = 'hide_sold'
      currentSort = 'travel'
      currentExcludeMode = 'none'
      currentTravelMax = '55'
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
      saveFilters(); reload()
    })
  }
}

function loadGoogleMaps() {
  return new Promise((resolve, reject) => {
    if (window.google && window.google.maps) return resolve()
    const loader = document.getElementById('gmaps-loader')
    const key = loader ? (loader.dataset.apiKey || '') : ''
    const script = document.createElement('script')
    const cbName = '__hfInitMap'
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&callback=${cbName}`
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
