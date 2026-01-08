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
    el.className = 'border rounded p-3 flex gap-3 items-start'
    const img = item.image ? `<img src="${item.image}" class="w-20 h-20 object-cover rounded" alt="">` : '<div class="w-20 h-20 bg-gray-200 rounded"></div>'
    const travel = item.travel_duration_text ? `<div class="text-xs text-gray-600">${item.travel_duration_text}</div>` : ''
    const status = item.status ? `<span class="text-xs px-2 py-1 rounded bg-gray-100">${item.status}</span>` : ''
    el.innerHTML = `${img}<div class="flex-1 min-w-0"><div class="font-medium text-sm truncate">${item.address || ''}</div><div class="text-sm text-gray-700">${item.price || ''}</div>${travel}<div class="mt-1 flex items-center gap-2 text-xs text-gray-600">${status}${item.route_summary ? `<span>${item.route_summary}</span>` : ''}</div><div class="mt-2 flex gap-2"><a href="/listing/${item.id}" class="px-2 py-1 bg-blue-600 text-white rounded text-xs">Open</a>${item.google_maps_url ? `<a href="${item.google_maps_url}" target="_blank" class="px-2 py-1 bg-gray-200 rounded text-xs">Directions</a>` : ''}</div></div>`
    container.appendChild(el)
  }
}

function markerContent(item) {
  const img = item.image ? `<img src="${item.image}" class="w-full h-32 object-cover rounded mb-2" alt="">` : ''
  const travel = item.travel_duration_text ? `<div class="text-sm text-gray-700">${item.travel_duration_text}</div>` : ''
  const route = item.route_summary ? `<div class="text-xs text-gray-600 mb-1">${item.route_summary}</div>` : ''
  return `<div class="max-w-xs"><div class="text-sm font-medium mb-1">${item.address || ''}</div>${img}<div class="text-sm text-gray-800 mb-1">${item.price || ''}</div>${travel}${route}<div class="flex gap-2 mt-2"><a href="/listing/${item.id}" class="px-2 py-1 bg-blue-600 text-white rounded text-xs">Details</a>${item.google_maps_url ? `<a href="${item.google_maps_url}" target="_blank" class="px-2 py-1 bg-gray-200 rounded text-xs">Maps</a>` : ''}</div></div>`
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
      infoWindow.setContent(markerContent(item))
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
