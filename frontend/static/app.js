let offset = 0
const limit = 20
let loading = false
const container = document.getElementById('listings')
const loadingEl = document.getElementById('loading')

const totalCountEl = document.getElementById('total-count')
const availableCountEl = document.getElementById('available-count')
const soldCountEl = document.getElementById('sold-count')
const hideSoldBtn = document.getElementById('hide-sold-btn')
const sortTravelBtn = document.getElementById('sort-travel')
const filterTomYesBtn = document.getElementById('filter-tom-yes')
const filterMqYesBtn = document.getElementById('filter-mq-yes')
const filterExcludeSelect = document.getElementById('exclude-voted-select')
const filterTravelSelect = document.getElementById('filter-travel-max')
const hideDuplexBtn = document.getElementById('hide-duplex-btn')
const searchInput = document.getElementById('searchInput')

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
// search term state
let currentSearchTerm = stored.search || ''

// filters panel toggle
const filtersToggleBtn = document.getElementById('filters-toggle')
const filtersPanel = document.getElementById('filters-panel')
if (filtersToggleBtn && filtersPanel) {
  // hide panel by default on small screens; keep visible on large
  filtersToggleBtn.addEventListener('click', (e) => {
    const expanded = filtersToggleBtn.getAttribute('aria-expanded') === 'true'
    filtersToggleBtn.setAttribute('aria-expanded', (!expanded).toString())
    filtersPanel.classList.toggle('hidden')
  })
}

// simple html escaper for comment text
function escapeHtml(str){
  if(!str) return ''
  return String(str).replace(/[&<>"'`\/]/g, function(s){
    return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;","`":"&#96;","/":"\/"}[s]) || s
  })
}

// helper to apply consistent toggle visuals
function setToggleVisual(btn, on, color){
  if(!btn) return
  // remove known color classes
  const colors = ['green','blue','yellow','purple','red','indigo']
  const offClasses = ['bg-gray-100','text-gray-800']
  btn.classList.remove(...offClasses)
  btn.classList.remove('bg-green-600','bg-blue-600','bg-yellow-600','bg-purple-600','bg-red-600','bg-indigo-600','text-white')
  if(on){
    let className = 'bg-green-600'
    if(color === 'blue') className = 'bg-blue-600'
    else if(color === 'yellow') className = 'bg-yellow-600'
    else if(color === 'purple') className = 'bg-purple-600'
    else if(color === 'red') className = 'bg-red-600'
    else if(color === 'indigo') className = 'bg-indigo-600'
    btn.classList.add(className,'text-white')
  } else {
    btn.classList.add('bg-gray-100','text-gray-800')
  }
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
    const res = await fetch(`/api/listings?${qs.toString()}`)
    const data = await res.json()
    const items = data.listings || []
    // client-side hide duplex/semi-detached if enabled
    const filteredItems = items.filter(it => {
      if (!currentHideDuplex) return true
      const pt = (it.property_type || '').toString().toLowerCase()
      if (!pt) return true
      if (pt.includes('duplex')) return false
      if (pt.includes('semi') || pt.includes('semi-detached') || pt.includes('semi detached')) return false
      return true
    }).filter(it => {
      // client-side search filtering
      if (!currentSearchTerm) return true
      const searchTerm = currentSearchTerm.toLowerCase()
      return (
        (it.title && it.title.toLowerCase().includes(searchTerm)) ||
        (it.address && it.address.toLowerCase().includes(searchTerm)) ||
        (it.suburb && it.suburb.toLowerCase().includes(searchTerm)) ||
        (it.property_type && it.property_type.toLowerCase().includes(searchTerm)) ||
        (it.url && it.url.toLowerCase().includes(searchTerm)) ||
        (it.comments && it.comments.some(c => c.text && c.text.toLowerCase().includes(searchTerm))) ||
        (it.travel_duration_text && it.travel_duration_text.toLowerCase().includes(searchTerm))
      )
    })
    // update totals if provided
    if (typeof data.total !== 'undefined') {
      totalCountEl.textContent = data.total
      availableCountEl.textContent = data.available
      soldCountEl.textContent = data.sold
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
  const el = document.createElement('div')
  el.className = 'block bg-white rounded shadow p-4 hover:shadow-md relative'

  const img = item.image ? `<img src="${item.image}" class="w-full h-48 object-cover rounded mb-3">` : ''
  const beds = item.bedrooms ? `<span class="mr-2">🛏 ${item.bedrooms}</span>` : ''
  const baths = item.bathrooms ? `<span class="mr-2">🛁 ${item.bathrooms}</span>` : ''
  const travelText = item.travel_duration_text || ''
  // travel link (opens google maps if available) and holds route_summary for tooltip
  const travel = travelText ? `<a href="${item.google_maps_url || item.url || '#'}" target="_blank" class="mr-2 text-sm text-blue-600 hover:underline travel-link" data-route="${(item.route_summary||'').replace(/"/g,'&quot;')}">🚆 ${travelText}</a>` : ''
  const domainLink = item.url ? `<a href="${item.url}" target="_blank" class="inline-block px-3 py-1 bg-gray-700 text-white rounded">🏠 Domain</a>` : ''

  // Voting UI in card (compact): Tom and MQ yes/no buttons and a hidden comment area
  // build comments html: show newest 3 comments, then view more link if more exist
  const comments = item.comments || []
  let commentsHtml = ''
  if (comments.length === 0) {
    commentsHtml = '<div class="text-sm text-gray-500">No comments</div>'
  } else {
    for (let c of comments.slice(0,3)) {
      const who = c.person === 'tom' ? 'Tom' : 'MQ'
      const snippet = `<div class="comment-item text-sm border rounded p-2 mb-1 flex items-start justify-between" data-cid="${c.id}"><div><strong>${who}:</strong> <span class="comment-text">${escapeHtml(c.text)}</span> <div class="text-xs text-gray-400">${new Date(c.ts*1000).toLocaleString()}</div></div><div class="ml-3 flex items-center"><button class="edit-comment text-xs ml-2 px-2 py-1" title="Edit">✏️</button><button class="del-comment text-xs ml-1 px-2 py-1 text-red-500" title="Delete">🗑️</button></div></div>`
      commentsHtml += snippet
    }
  }
  const moreLink = (item.comments && item.comments.length > 3) ? `<div class="mt-1"><a href="/listing/${item.id}" class="text-sm text-blue-600">View More</a></div>` : ''

  const voteUi = `
    <div class="mt-2 flex items-center space-x-3">
      <div class="text-sm font-medium">Tom</div>
      <button data-id="${item.id}" data-person="tom" data-val="true" aria-pressed="${item.tom===true}" class="vote-btn tom-yes px-3 py-1 rounded-full ${item.tom===true? 'bg-green-600 text-white' : 'bg-gray-200 text-gray-800'}">Yes</button>
      <button data-id="${item.id}" data-person="tom" data-val="false" aria-pressed="${item.tom===false}" class="vote-btn tom-no px-3 py-1 rounded-full ${item.tom===false? 'bg-red-600 text-white' : 'bg-gray-200 text-gray-800'}">No</button>
      <div class="text-sm ml-3">MQ</div>
      <button data-id="${item.id}" data-person="mq" data-val="true" aria-pressed="${item.mq===true}" class="vote-btn mq-yes px-3 py-1 rounded-full ${item.mq===true? 'bg-green-600 text-white' : 'bg-gray-200 text-gray-800'}">Yes</button>
      <button data-id="${item.id}" data-person="mq" data-val="false" aria-pressed="${item.mq===false}" class="vote-btn mq-no px-3 py-1 rounded-full ${item.mq===false? 'bg-red-600 text-white' : 'bg-gray-200 text-gray-800'}">No</button>
    </div>
    <div class="comments-block mt-2" data-id="${item.id}">
      <div class="font-medium text-sm">Comments</div>
      <div class="existing-comments mt-2">${commentsHtml}</div>
      ${moreLink}
      <div class="new-comment mt-2">
        <button class="toggle-new-comment inline-flex items-center px-2 py-1 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded" aria-expanded="false" title="Add a comment to this listing">💬 Add comment</button>
        <div class="new-comment-area hidden mt-2">
            <textarea placeholder="Leave a comment..." class="new-comment-input w-full p-2 border rounded"></textarea>
          <div class="mt-2 flex justify-end space-x-2"><button class="new-comment-save px-3 py-1 bg-blue-200 rounded" data-person="tom">Save Tom</button><button class="new-comment-save px-3 py-1 bg-indigo-200 rounded" data-person="mq">Save MQ</button></div>
        </div>
      </div>
    </div>
  `

  el.innerHTML = `
    ${img}
    <div class="text-sm text-gray-600 mb-1">${item.address || ''}</div>
    <div class="flex items-center text-sm text-gray-700 mb-2">${beds}${baths}${travel}</div>
    <div class="text-sm text-gray-500">${item.price || ''}</div>
    ${voteUi}
    <div class="mt-3">
      <a href="/listing/${item.id}" class="inline-block mr-3 px-3 py-1 bg-blue-600 text-white rounded">More details</a>
      ${domainLink}
    </div>
  `

  container.appendChild(el)
  // Prevent the anchor from navigating when interacting with form controls inside the card.
  // If a click/key event originates inside a comments area, stop the anchor default.
  el.addEventListener('click', (e) => {
    if (e.target.closest('.comments-block') || e.target.closest('.new-comment-area') || e.target.closest('.new-comment-input') || e.target.closest('.new-comment-save') || e.target.closest('.toggle-new-comment') || e.target.closest('.existing-comments') || e.target.closest('.comment-item') || e.target.closest('.edit-comment') || e.target.closest('.del-comment')) {
      e.preventDefault()
      e.stopPropagation()
    }
  })
  el.addEventListener('keydown', (e) => {
    // only intercept Enter/Space when not typing in an input/textarea/select
    const tgt = e.target
    const isEditable = tgt && (tgt.tagName === 'TEXTAREA' || tgt.tagName === 'INPUT' || tgt.tagName === 'SELECT' || tgt.isContentEditable || (tgt.closest && tgt.closest('.new-comment-input')))
    if (!isEditable && (e.key === 'Enter' || e.key === ' ' ) && tgt && tgt.closest && tgt.closest('.comments-block')) {
      e.preventDefault(); e.stopPropagation()
    }
  })

  // Also attach defensive stopPropagation to interactive controls (older browsers / odd event flows)
  const interactiveNodes = el.querySelectorAll('textarea, select, .new-comment-save, .toggle-new-comment, .edit-comment, .del-comment, .existing-comments, .new-comment-area')
  interactiveNodes.forEach(node => {
    node.addEventListener('click', (e) => { e.stopPropagation() })
    node.addEventListener('mousedown', (e) => { /* allow default focus behavior but stop bubbling */ e.stopPropagation() })
    node.addEventListener('touchstart', (e) => { e.stopPropagation() })
    node.addEventListener('focus', (e) => { e.stopPropagation() }, true)
  })

  // attach vote handlers for this card
  const voteButtons = el.querySelectorAll('.vote-btn')
  voteButtons.forEach(btn => {
    btn.addEventListener('click', async (ev) => {
      ev.preventDefault()
      ev.stopPropagation()
      const id = btn.getAttribute('data-id')
      const person = btn.getAttribute('data-person')
      const val = btn.getAttribute('data-val') === 'true'
      // open new-comment area for this card so user can add a note after voting
      const card = el
      const newArea = card.querySelector('.new-comment-area')
      if (newArea) newArea.classList.remove('hidden')
      // POST vote
      try {
        const resp = await fetch(`/api/listing/${id}/vote`, {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({[person]: val})})
        const j = await resp.json().catch(()=>({}))
        // update buttons in-place instead of refreshing the whole view
        const tomVal = (typeof j.tom !== 'undefined') ? j.tom : null
        const mqVal = (typeof j.mq !== 'undefined') ? j.mq : null
        const tomYes = card.querySelector('.tom-yes')
        const tomNo = card.querySelector('.tom-no')
        const mqYes = card.querySelector('.mq-yes')
        const mqNo = card.querySelector('.mq-no')
        if (tomYes && tomNo) {
          if (tomVal === true) { tomYes.classList.add('bg-green-600','text-white'); tomNo.classList.remove('bg-red-600','text-white'); tomYes.setAttribute('aria-pressed','true'); tomNo.setAttribute('aria-pressed','false') }
          else if (tomVal === false) { tomNo.classList.add('bg-red-600','text-white'); tomYes.classList.remove('bg-green-600','text-white'); tomNo.setAttribute('aria-pressed','true'); tomYes.setAttribute('aria-pressed','false') }
          else { tomYes.classList.remove('bg-green-600','text-white'); tomNo.classList.remove('bg-red-600','text-white'); tomYes.setAttribute('aria-pressed','false'); tomNo.setAttribute('aria-pressed','false') }
        }
        if (mqYes && mqNo) {
          if (mqVal === true) { mqYes.classList.add('bg-green-600','text-white'); mqNo.classList.remove('bg-red-600','text-white'); mqYes.setAttribute('aria-pressed','true'); mqNo.setAttribute('aria-pressed','false') }
          else if (mqVal === false) { mqNo.classList.add('bg-red-600','text-white'); mqYes.classList.remove('bg-green-600','text-white'); mqNo.setAttribute('aria-pressed','true'); mqYes.setAttribute('aria-pressed','false') }
          else { mqYes.classList.remove('bg-green-600','text-white'); mqNo.classList.remove('bg-red-600','text-white'); mqYes.setAttribute('aria-pressed','false'); mqNo.setAttribute('aria-pressed','false') }
        }
      } catch (e) {
        console.error('vote failed', e)
      }
    })
  })

  // save comment button
  // new-comment toggle
  const toggleBtn = el.querySelector('.toggle-new-comment')
  if (toggleBtn) {
    toggleBtn.addEventListener('click', (ev) => {
      ev.preventDefault(); ev.stopPropagation();
      const area = el.querySelector('.new-comment-area')
      if (!area) return
      area.classList.toggle('hidden')
      const expanded = !area.classList.contains('hidden')
      try { toggleBtn.setAttribute('aria-expanded', expanded ? 'true' : 'false') } catch(e){}
      if (expanded) {
        const ta = el.querySelector('.new-comment-input')
        if (ta) { ta.focus(); }
      }
    })
  }

  // new-comment save buttons
  const newSaveBtns = el.querySelectorAll('.new-comment-save')
  newSaveBtns.forEach(btn => {
    btn.addEventListener('click', async (ev) => {
      ev.preventDefault(); ev.stopPropagation();
      const id = item.id
      const who = btn.getAttribute('data-person') || 'tom'
      const txt = el.querySelector('.new-comment-input') ? el.querySelector('.new-comment-input').value.trim() : ''
      if (!txt) return
      try {
        const resp = await fetch(`/api/listing/${id}/comment`, {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({person: who, text: txt})})
        const j = await resp.json().catch(()=>null)
        if (j && j.ok && j.comment) {
          // insert new comment at top of this card
          insertCommentIntoCard(el, j.comment)
          // clear textarea
          const ta = el.querySelector('.new-comment-input')
          if (ta) ta.value = ''
        } else {
          // fallback refresh
          resetAndLoad()
        }
      } catch (e) { console.error('new comment failed', e) }
    })
  })

  // edit comment (inline via prompt for simplicity)
  const editBtns = el.querySelectorAll('.edit-comment')
  editBtns.forEach(b => {
    b.addEventListener('click', async (ev) => {
      ev.preventDefault(); ev.stopPropagation();
      const itemDiv = b.closest('.comment-item')
      const cid = itemDiv.getAttribute('data-cid')
      const old = itemDiv.querySelector('.comment-text') ? itemDiv.querySelector('.comment-text').textContent : ''
      const newText = prompt('Edit comment', old)
      if (newText === null) return
      try {
        const resp = await fetch(`/api/listing/${item.id}/comment/${cid}`, {method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({text: newText})})
        const j = await resp.json().catch(()=>null)
        if (j && j.ok) {
          // update DOM inline
          const txtEl = itemDiv.querySelector('.comment-text')
          if (txtEl) txtEl.textContent = newText
          const tsEl = itemDiv.querySelector('.text-xs')
          if (tsEl) tsEl.textContent = new Date().toLocaleString()
        } else {
          resetAndLoad()
        }
      } catch (e) { console.error('edit failed', e) }
    })
  })

  // delete comment
  const delBtns = el.querySelectorAll('.del-comment')
  delBtns.forEach(b => {
    b.addEventListener('click', async (ev) => {
      ev.preventDefault(); ev.stopPropagation();
      if (!confirm('Delete comment?')) return
      const cid = b.closest('.comment-item').getAttribute('data-cid')
      try {
        const resp = await fetch(`/api/listing/${item.id}/comment/${cid}`, {method:'DELETE'})
        const j = await resp.json().catch(()=>null)
        if (j && j.ok) {
          // remove from DOM
          const node = b.closest('.comment-item')
          if (node && node.parentNode) node.parentNode.removeChild(node)
        } else {
          resetAndLoad()
        }
      } catch (e) { console.error('delete failed', e) }
    })
  })

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
  wrapper.innerHTML = `<div><strong>${who}:</strong> <span class="comment-text">${escapeHtml(comment.text)}</span> <div class="text-xs text-gray-400">${new Date(comment.ts*1000).toLocaleString()}</div></div><div class="ml-3 flex items-center"><button class="edit-comment text-xs ml-2 px-2 py-1" title="Edit">✏️</button><button class="del-comment text-xs ml-1 px-2 py-1 text-red-500" title="Delete">🗑️</button></div>`
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
      const old = wrapper.querySelector('.comment-text') ? wrapper.querySelector('.comment-text').textContent : ''
      const newText = prompt('Edit comment', old)
      if (newText === null) return
      try {
        const cid = wrapper.getAttribute('data-cid')
        const resp = await fetch(`/api/listing/${cardEl.querySelector('.vote-btn')?.getAttribute('data-id') || ''}/comment/${cid}`, {method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({text: newText})})
        const j = await resp.json().catch(()=>null)
        if (j && j.ok) {
          const txtEl = wrapper.querySelector('.comment-text')
          if (txtEl) txtEl.textContent = newText
          const tsEl = wrapper.querySelector('.text-xs')
          if (tsEl) tsEl.textContent = new Date().toLocaleString()
        } else {
          resetAndLoad()
        }
      } catch (e) { console.error('edit failed', e) }
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
}

function saveFilters(){
  const obj = {status: currentFilter, sort: currentSort, tom: currentTomFilter, mq: currentMqFilter, exclude_voted_mode: currentExcludeMode, travel_max: currentTravelMax, hide_duplex: currentHideDuplex, search: currentSearchTerm}
  try{ localStorage.setItem('hf_filters', JSON.stringify(obj)) }catch(e){}
}

// Search functionality
if (searchInput) {
  searchInput.value = currentSearchTerm
  searchInput.addEventListener('input', () => {
    currentSearchTerm = searchInput.value
    saveFilters()
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
    sortTravelBtn.textContent = on ? 'Sort: travel' : 'Sort by travel time'
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

applyStoredToUI()
populateTravelSelect()
applyHideDuplexUI()
resetAndLoad()
//update