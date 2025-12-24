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
const excludeVotedBtn = document.getElementById('exclude-voted')

// currentFilter and currentSort will be loaded from localStorage below
// persistent filters stored in localStorage
let stored = {}
try { stored = JSON.parse(localStorage.getItem('hf_filters') || '{}') } catch(e) { stored = {} }
let currentTomFilter = stored.tom || 'any' // any, yes, no
let currentMqFilter = stored.mq || 'any'
let currentFilter = stored.status || 'all'
let currentSort = stored.sort || 'none'
let currentExcludeVoted = stored.exclude_voted || false

async function loadMore() {
  if (loading) return
  loading = true
  loadingEl.style.display = 'block'
  try {
    const res = await fetch(`/api/listings?offset=${offset}&limit=${limit}&status=${currentFilter}&sort=${currentSort}&tom=${currentTomFilter}&mq=${currentMqFilter}&exclude_voted=${currentExcludeVoted}`)
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
  el.className = 'block bg-white rounded shadow p-4 hover:shadow-md relative'

  const img = item.image ? `<img src="${item.image}" class="w-full h-48 object-cover rounded mb-3">` : ''
  const beds = item.bedrooms ? `<span class="mr-2">🛏 ${item.bedrooms}</span>` : ''
  const baths = item.bathrooms ? `<span class="mr-2">🛁 ${item.bathrooms}</span>` : ''
  const travelText = item.travel_duration_text || ''
  // travel link (opens google maps if available) and holds route_summary for tooltip
  const travel = travelText ? `<a href="${item.google_maps_url || item.url || '#'}" target="_blank" class="mr-2 text-sm text-blue-600 hover:underline travel-link" data-route="${(item.route_summary||'').replace(/"/g,'&quot;')}">🚆 ${travelText}</a>` : ''
  const domainLink = item.url ? `<a href="${item.url}" target="_blank" class="ml-2 text-sm text-gray-500 hover:text-gray-700">(domain)</a>` : ''
  const tomBadge = (item.tom===true) ? `<span class="ml-2 text-sm bg-yellow-200 px-2 py-1 rounded">✓</span>` : (item.tom===false ? `<span class="ml-2 text-sm bg-red-200 px-2 py-1 rounded">✕</span>` : `<span class="ml-2 text-sm text-gray-400 px-2 py-1 rounded">—</span>`)
  const mqBadge = (item.mq===true) ? `<span class="ml-2 text-sm bg-purple-200 px-2 py-1 rounded">✓</span>` : (item.mq===false ? `<span class="ml-2 text-sm bg-red-200 px-2 py-1 rounded">✕</span>` : `<span class="ml-2 text-sm text-gray-400 px-2 py-1 rounded">—</span>`)

  // Voting UI in card (compact): Tom and MQ yes/no buttons and a hidden comment area
  const voteUi = `
    <div class="mt-2 flex items-center space-x-2">
      <div class="text-sm font-medium">Tom</div>
      <button data-id="${item.id}" data-person="tom" data-val="true" class="vote-btn tom-yes px-2 py-1 rounded ${item.tom===true? 'bg-green-200' : 'bg-gray-100'}">✓</button>
      <button data-id="${item.id}" data-person="tom" data-val="false" class="vote-btn tom-no px-2 py-1 rounded ${item.tom===false? 'bg-red-200' : 'bg-gray-100'}">✕</button>
      <div class="text-sm ml-2">MQ</div>
      <button data-id="${item.id}" data-person="mq" data-val="true" class="vote-btn mq-yes px-2 py-1 rounded ${item.mq===true? 'bg-green-200' : 'bg-gray-100'}">✓</button>
      <button data-id="${item.id}" data-person="mq" data-val="false" class="vote-btn mq-no px-2 py-1 rounded ${item.mq===false? 'bg-red-200' : 'bg-gray-100'}">✕</button>
    </div>
    <div class="comment-area mt-2 hidden" data-id="${item.id}">
      <div class="mb-2">
        <label class="text-sm mr-2">Comment for:</label>
        <select class="comment-who p-1 border rounded">
          <option value="tom">Tom</option>
          <option value="mq">MQ</option>
        </select>
      </div>
      <textarea placeholder="Leave a comment..." class="comment-input w-full p-2 border rounded">${(item.tom_comment||item.mq_comment||'')}</textarea>
      <div class="mt-2 flex justify-end"><button class="save-comment px-3 py-1 bg-blue-200 rounded" data-id="${item.id}">Save</button></div>
    </div>
  `

  el.innerHTML = `
    ${img}
    <div class="text-sm text-gray-600 mb-1">${item.address || ''} ${tomBadge} ${mqBadge} ${domainLink}</div>
    <div class="flex items-center text-sm text-gray-700 mb-2">${beds}${baths}${travel}</div>
    <div class="text-sm text-gray-500">${item.price || ''}</div>
    ${voteUi}
  `

  container.appendChild(el)

  // attach vote handlers for this card
  const voteButtons = el.querySelectorAll('.vote-btn')
  voteButtons.forEach(btn => {
    btn.addEventListener('click', async (ev) => {
      ev.preventDefault()
      ev.stopPropagation()
      const id = btn.getAttribute('data-id')
      const person = btn.getAttribute('data-person')
      const val = btn.getAttribute('data-val') === 'true'
      // show comment area for this id
      const card = el
      const commentArea = card.querySelector('.comment-area')
      if (commentArea) commentArea.classList.remove('hidden')
      // POST vote
      try {
        await fetch(`/api/listing/${id}/vote`, {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({[person]: val})})
        // update badge visuals quickly
        resetAndLoad() // refresh listing view
      } catch (e) {
        console.error('vote failed', e)
      }
    })
  })

  // save comment button
  const saveBtn = el.querySelector('.save-comment')
  if (saveBtn) {
    saveBtn.addEventListener('click', async (ev) => {
      ev.preventDefault(); ev.stopPropagation();
      const id = saveBtn.getAttribute('data-id')
      const card = el
      const txt = card.querySelector('.comment-input').value
      const who = card.querySelector('.comment-who') ? card.querySelector('.comment-who').value : 'tom'
      const payload = (who === 'tom') ? {tom_comment: txt} : {mq_comment: txt}
      try {
        await fetch(`/api/listing/${id}/vote`, {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload)})
        // optimistic refresh
        resetAndLoad()
      } catch (e) { console.error('save comment failed', e) }
    })
  }

  // travel tooltip
  const travelLink = el.querySelector('.travel-link')
  if (travelLink) {
    travelLink.addEventListener('mouseenter', (e) => {
      const route = travelLink.getAttribute('data-route')
      if (!route) return
      showTooltip(e.pageX, e.pageY, route)
    })
    travelLink.addEventListener('mousemove', (e) => { moveTooltip(e.pageX, e.pageY) })
    travelLink.addEventListener('mouseleave', hideTooltip)
  }
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
  const obj = {status: currentFilter, sort: currentSort, tom: currentTomFilter, mq: currentMqFilter, exclude_voted: currentExcludeVoted}
  try{ localStorage.setItem('hf_filters', JSON.stringify(obj)) }catch(e){}
}

filterAllBtn.addEventListener('click', () => { currentFilter = 'all'; saveFilters(); resetAndLoad() })
filterAvailableBtn.addEventListener('click', () => { currentFilter = 'available'; saveFilters(); resetAndLoad() })
filterSoldBtn.addEventListener('click', () => { currentFilter = 'sold'; saveFilters(); resetAndLoad() })
sortTravelBtn.addEventListener('click', () => { currentSort = currentSort === 'travel' ? 'none' : 'travel'; saveFilters(); resetAndLoad(); sortTravelBtn.textContent = currentSort === 'travel' ? 'Sort: travel (on)' : 'Sort by travel time' })
// cycle tri-state: any -> yes -> no -> any
filterTomYesBtn.addEventListener('click', () => {
  currentTomFilter = currentTomFilter === 'any' ? 'yes' : (currentTomFilter === 'yes' ? 'no' : 'any')
  saveFilters(); resetAndLoad();
  filterTomYesBtn.textContent = currentTomFilter === 'yes' ? 'Tom:Yes (on)' : (currentTomFilter === 'no' ? 'Tom:No (on)' : 'Tom')
})
filterMqYesBtn.addEventListener('click', () => {
  currentMqFilter = currentMqFilter === 'any' ? 'yes' : (currentMqFilter === 'yes' ? 'no' : 'any')
  saveFilters(); resetAndLoad();
  filterMqYesBtn.textContent = currentMqFilter === 'yes' ? 'MQ:Yes (on)' : (currentMqFilter === 'no' ? 'MQ:No (on)' : 'MQ')
})
excludeVotedBtn.addEventListener('click', () => {
  currentExcludeVoted = !currentExcludeVoted
  saveFilters(); resetAndLoad();
  excludeVotedBtn.textContent = currentExcludeVoted ? 'Exclude voted (on)' : 'Exclude voted'
})

// initialise UI from stored filters
function applyStoredToUI(){
  if(currentSort === 'travel') sortTravelBtn.textContent = 'Sort: travel (on)'
  else sortTravelBtn.textContent = 'Sort by travel time'
  filterTomYesBtn.textContent = currentTomFilter === 'yes' ? 'Tom:Yes (on)' : (currentTomFilter === 'no' ? 'Tom:No (on)' : 'Tom')
  filterMqYesBtn.textContent = currentMqFilter === 'yes' ? 'MQ:Yes (on)' : (currentMqFilter === 'no' ? 'MQ:No (on)' : 'MQ')
  excludeVotedBtn.textContent = currentExcludeVoted ? 'Exclude voted (on)' : 'Exclude voted'
}

applyStoredToUI()
resetAndLoad()
