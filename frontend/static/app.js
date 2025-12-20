let offset = 0
const limit = 20
let loading = false
const container = document.getElementById('listings')
const loadingEl = document.getElementById('loading')

const totalCountEl = document.getElementById('total-count')
const availableCountEl = document.getElementById('available-count')
const soldCountEl = document.getElementById('sold-count')
const filterAllBtn = document.getElementById('filter-all')
const filterAvailableBtn = document.getElementById('filter-available')
const filterSoldBtn = document.getElementById('filter-sold')
const sortTravelBtn = document.getElementById('sort-travel')
const filterTomYesBtn = document.getElementById('filter-tom-yes')
const filterMqYesBtn = document.getElementById('filter-mq-yes')

// currentFilter and currentSort will be loaded from localStorage below
// persistent filters stored in localStorage
let stored = {}
try { stored = JSON.parse(localStorage.getItem('hf_filters') || '{}') } catch(e) { stored = {} }
let currentTomFilter = stored.tom || 'any' // any, yes
let currentMqFilter = stored.mq || 'any'
let currentFilter = stored.status || 'all'
let currentSort = stored.sort || 'none'

async function loadMore() {
  if (loading) return
  loading = true
  loadingEl.style.display = 'block'
  try {
    const res = await fetch(`/api/listings?offset=${offset}&limit=${limit}&status=${currentFilter}&sort=${currentSort}&tom=${currentTomFilter}&mq=${currentMqFilter}`)
    const data = await res.json()
    const items = data.listings || []
    // update totals if provided
    if (typeof data.total !== 'undefined') {
      totalCountEl.textContent = data.total
      availableCountEl.textContent = data.available
      soldCountEl.textContent = data.sold
    }
    for (const item of items) renderItem(item)
    offset += items.length
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
  const el = document.createElement('a')
  el.href = `/listing/${item.id}`
  el.className = 'block bg-white rounded shadow p-4 hover:shadow-md'

  const img = item.image ? `<img src="${item.image}" class="w-full h-48 object-cover rounded mb-3">` : ''
  const beds = item.bedrooms ? `<span class="mr-2">🛏 ${item.bedrooms}</span>` : ''
  const baths = item.bathrooms ? `<span class="mr-2">🛁 ${item.bathrooms}</span>` : ''
  const travel = item.travel_duration_text ? `<span class="mr-2">🚆 ${item.travel_duration_text}</span>` : ''
  const tomBadge = (item.tom===true) ? `<span class="ml-2 text-sm bg-yellow-200 px-2 py-1 rounded">✓</span>` : (item.tom===false ? `<span class="ml-2 text-sm bg-red-200 px-2 py-1 rounded">✕</span>` : `<span class="ml-2 text-sm text-gray-400 px-2 py-1 rounded">—</span>`)
  const mqBadge = (item.mq===true) ? `<span class="ml-2 text-sm bg-purple-200 px-2 py-1 rounded">✓</span>` : (item.mq===false ? `<span class="ml-2 text-sm bg-red-200 px-2 py-1 rounded">✕</span>` : `<span class="ml-2 text-sm text-gray-400 px-2 py-1 rounded">—</span>`)

  el.innerHTML = `
    ${img}
    <div class="text-sm text-gray-600 mb-1">${item.address || ''} ${tomBadge} ${mqBadge}</div>
    <div class="flex items-center text-sm text-gray-700 mb-2">${beds}${baths}${travel}</div>
    <div class="text-sm text-gray-500">${item.price || ''}</div>
  `

  container.appendChild(el)
}

// infinite scroll
window.addEventListener('scroll', () => {
  if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight - 300) {
    loadMore()
  }
})

// initial load
function resetAndLoad() {
  offset = 0
  container.innerHTML = ''
  loadingEl.textContent = 'Loading...'
  loadMore()
}

function saveFilters(){
  const obj = {status: currentFilter, sort: currentSort, tom: currentTomFilter, mq: currentMqFilter}
  try{ localStorage.setItem('hf_filters', JSON.stringify(obj)) }catch(e){}
}

filterAllBtn.addEventListener('click', () => { currentFilter = 'all'; saveFilters(); resetAndLoad() })
filterAvailableBtn.addEventListener('click', () => { currentFilter = 'available'; saveFilters(); resetAndLoad() })
filterSoldBtn.addEventListener('click', () => { currentFilter = 'sold'; saveFilters(); resetAndLoad() })
sortTravelBtn.addEventListener('click', () => { currentSort = currentSort === 'travel' ? 'none' : 'travel'; saveFilters(); resetAndLoad(); sortTravelBtn.textContent = currentSort === 'travel' ? 'Sort: travel (on)' : 'Sort by travel time' })
filterTomYesBtn.addEventListener('click', () => { currentTomFilter = currentTomFilter === 'yes' ? 'any' : 'yes'; saveFilters(); resetAndLoad(); filterTomYesBtn.textContent = currentTomFilter === 'yes' ? 'Tom:Yes (on)' : 'Tom Yes' })
filterMqYesBtn.addEventListener('click', () => { currentMqFilter = currentMqFilter === 'yes' ? 'any' : 'yes'; saveFilters(); resetAndLoad(); filterMqYesBtn.textContent = currentMqFilter === 'yes' ? 'MQ:Yes (on)' : 'MQ Yes' })

// initialise UI from stored filters
function applyStoredToUI(){
  if(currentSort === 'travel') sortTravelBtn.textContent = 'Sort: travel (on)'
  else sortTravelBtn.textContent = 'Sort by travel time'
  filterTomYesBtn.textContent = currentTomFilter === 'yes' ? 'Tom:Yes (on)' : 'Tom Yes'
  filterMqYesBtn.textContent = currentMqFilter === 'yes' ? 'MQ:Yes (on)' : 'MQ Yes'
}

applyStoredToUI()
resetAndLoad()
