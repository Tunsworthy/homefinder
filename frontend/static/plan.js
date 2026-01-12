(() => {
  let currentPlan = { id: null, name: '', date: null, start_time: '', end_time: '', mode: 'driving', stops: [] }
  let allListings = []
  let draggedIndex = null

  // Load all listings for the dropdown
  async function loadListings() {
    try {
      const res = await fetch('/api/listings?limit=10000')
      const data = await res.json()
      allListings = data.listings || []
      // Sort by suburb then address
      allListings.sort((a, b) => {
        const suburbA = (a.suburb || '').toLowerCase()
        const suburbB = (b.suburb || '').toLowerCase()
        if (suburbA !== suburbB) return suburbA.localeCompare(suburbB)
        return (a.address || '').localeCompare(b.address || '')
      })
    } catch (e) {
      console.error('Failed to load listings', e)
    }
  }

  function renderStops() {
    const box = document.getElementById('stops')
    box.innerHTML = ''
    currentPlan.stops.forEach((s, idx) => {
      const listing = allListings.find(l => l.id === s.listing_id)
      const addr = listing ? `${listing.suburb || 'Unknown'} - ${listing.address}` : s.listing_id || 'Unknown'
      const row = document.createElement('div')
      row.className = 'flex items-center gap-2 p-3 bg-gray-50 rounded border cursor-move hover:bg-gray-100'
      row.draggable = true
      row.dataset.idx = idx
      row.innerHTML = `
        <div class="text-gray-400"><i class="fa-solid fa-grip-vertical"></i></div>
        <div class="flex-1">
          <div class="text-sm font-medium">${addr}</div>
          <div class="flex gap-2 mt-1">
            <input class="border rounded px-2 py-1 text-xs stop-open-time" data-idx="${idx}" type="time" value="${s.open_time||''}" placeholder="Open" title="Property open time">
            <input class="border rounded px-2 py-1 text-xs stop-close-time" data-idx="${idx}" type="time" value="${s.close_time||''}" placeholder="Close" title="Property close time">
            <input class="border rounded px-2 py-1 w-20 text-xs stop-override" data-idx="${idx}" type="number" min="0" value="${s.override_minutes??''}" placeholder="Travel min">
          </div>
        </div>
        <button class="px-2 py-1 text-sm bg-red-100 text-red-700 rounded rm-stop" data-idx="${idx}">✕</button>
      `
      
      // Drag and drop handlers
      row.addEventListener('dragstart', (e) => {
        draggedIndex = idx
        row.classList.add('opacity-50')
      })
      
      row.addEventListener('dragend', (e) => {
        row.classList.remove('opacity-50')
        draggedIndex = null
      })
      
      row.addEventListener('dragover', (e) => {
        e.preventDefault()
      })
      
      row.addEventListener('drop', (e) => {
        e.preventDefault()
        const dropIdx = parseInt(row.dataset.idx)
        if (draggedIndex !== null && draggedIndex !== dropIdx) {
          const [removed] = currentPlan.stops.splice(draggedIndex, 1)
          currentPlan.stops.splice(dropIdx, 0, removed)
          renderStops()
        }
      })
      
      box.appendChild(row)
    })
    
    document.querySelectorAll('.stop-open-time').forEach(inp => {
      inp.onchange = () => {
        currentPlan.stops[Number(inp.dataset.idx)].open_time = inp.value || null
      }
    })
    document.querySelectorAll('.stop-close-time').forEach(inp => {
      inp.onchange = () => {
        currentPlan.stops[Number(inp.dataset.idx)].close_time = inp.value || null
      }
    })
    document.querySelectorAll('.stop-override').forEach(inp => {
      inp.onchange = () => {
        const v = inp.value.trim()
        currentPlan.stops[Number(inp.dataset.idx)].override_minutes = v === '' ? null : Number(v)
      }
    })
    document.querySelectorAll('.rm-stop').forEach(btn => {
      btn.onclick = () => { currentPlan.stops.splice(Number(btn.dataset.idx), 1); renderStops() }
    })
  }

  function populateAddressDropdown() {
    const select = document.getElementById('stop-address-select')
    select.innerHTML = ''
    allListings.forEach(listing => {
      const opt = document.createElement('option')
      opt.value = listing.id
      opt.textContent = `${listing.suburb || 'N/A'} - ${listing.address || 'Unknown'}`
      select.appendChild(opt)
    })
  }

  function showAddStopModal() {
    document.getElementById('add-stop-modal').classList.remove('hidden')
    populateAddressDropdown()
  }

  function hideAddStopModal() {
    document.getElementById('add-stop-modal').classList.add('hidden')
  }

  document.getElementById('add-stop').onclick = showAddStopModal

  document.getElementById('modal-cancel').onclick = hideAddStopModal

  document.getElementById('modal-add').onclick = () => {
    const listingId = document.getElementById('stop-address-select').value
    if (!listingId) {
      alert('Please select an address')
      return
    }
    const already = currentPlan.stops.find(s => s.listing_id === listingId)
    if (already) {
      alert('This listing is already in the plan')
      return
    }
    currentPlan.stops.push({ listing_id: listingId, override_minutes: null })
    renderStops()
    hideAddStopModal()
  }

  // Close modal on outside click
  document.getElementById('add-stop-modal').onclick = (e) => {
    if (e.target.id === 'add-stop-modal') hideAddStopModal()
  }

  async function renderPlansList() {
    try {
      const res = await fetch('/api/inspection-plans')
      const data = await res.json()
      const plans = data.plans || {}
      const plansList = document.getElementById('plans-list')
      
      if (Object.keys(plans).length === 0) {
        plansList.innerHTML = '<div class="text-sm text-gray-500">No plans yet. Create one to get started!</div>'
        return
      }

      plansList.innerHTML = ''
      Object.values(plans).forEach(plan => {
        const card = document.createElement('div')
        card.className = 'border rounded p-3 cursor-pointer hover:bg-gray-50'
        const stopCount = (plan.stops || []).length
        const timeRange = plan.start_time && plan.end_time ? `${plan.start_time}-${plan.end_time}` : ''
        card.innerHTML = `
          <div class="font-medium text-sm">${plan.name || 'Unnamed Plan'}</div>
          <div class="text-xs text-gray-600">${plan.date || 'No date'} ${timeRange}</div>
          <div class="text-xs text-gray-500">${plan.mode} • ${stopCount} stop${stopCount!==1?'s':''}</div>
          <div class="text-xs text-gray-500 mt-1">${plan.stops?.slice(0,2).map(s => {
            const l = allListings.find(x => x.id === s.listing_id)
            return l?.suburb || 'Unknown'
          }).join(', ')}${stopCount > 2 ? '...' : ''}</div>
        `
        card.onclick = () => loadPlan(plan)
        card.style.cursor = 'pointer'
        plansList.appendChild(card)
      })
    } catch (e) {
      console.error('Failed to load plans', e)
    }
  }

  function loadPlan(plan) {
    currentPlan = JSON.parse(JSON.stringify(plan))
    document.getElementById('plan-name').value = currentPlan.name || ''
    document.getElementById('plan-date').value = currentPlan.date || ''
    document.getElementById('plan-start-time').value = currentPlan.start_time || ''
    document.getElementById('plan-end-time').value = currentPlan.end_time || ''
    document.getElementById('plan-mode').value = currentPlan.mode || 'driving'
    renderStops()
  }

  document.getElementById('create-new-plan').onclick = () => {
    currentPlan = { 
      id: null, 
      name: '', 
      date: new Date().toISOString().split('T')[0], 
      start_time: '09:00',
      end_time: '17:00',
      mode: 'driving', 
      stops: [] 
    }
    document.getElementById('plan-name').value = ''
    document.getElementById('plan-date').value = currentPlan.date
    document.getElementById('plan-start-time').value = currentPlan.start_time
    document.getElementById('plan-end-time').value = currentPlan.end_time
    document.getElementById('plan-mode').value = 'driving'
    renderStops()
  }

  document.getElementById('save-plan').onclick = async () => {
    currentPlan.name = document.getElementById('plan-name').value || 'Unnamed Plan'
    currentPlan.date = document.getElementById('plan-date').value || null
    currentPlan.start_time = document.getElementById('plan-start-time').value || null
    currentPlan.end_time = document.getElementById('plan-end-time').value || null
    currentPlan.mode = document.getElementById('plan-mode').value || 'driving'
    
    if (!currentPlan.name.trim()) {
      alert('Please enter a plan name')
      return
    }
    
    try {
      const res = await fetch('/api/inspection-plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(currentPlan)
      })
      const j = await res.json()
      if (j.ok) {
        currentPlan = j.plan
        document.getElementById('save-status').textContent = 'Saved'
        setTimeout(() => document.getElementById('save-status').textContent = '', 1500)
        renderPlansList()
      } else {
        alert('Save failed')
      }
    } catch (e) {
      alert('Save failed')
    }
  }

  document.getElementById('calc-route').onclick = async () => {
    if (!currentPlan.id) {
      // save first to get an id
      await document.getElementById('save-plan').onclick()
      if (!currentPlan.id) return
    }
    const mode = document.getElementById('plan-mode').value || 'driving'
    try {
      const res = await fetch(`/api/inspection-plans/${currentPlan.id}/route?mode=${mode}`)
      const j = await res.json()
      const legsBox = document.getElementById('legs')
      if (!j.ok) { legsBox.textContent = 'Route failed'; return }
      legsBox.innerHTML = j.legs.map(l => {
        const m = l.minutes != null ? `${l.minutes} min` : 'n/a'
        return `<div>Leg ${l.from} → ${l.to}: ${m} (${l.source})</div>`
      }).join('')
    } catch (e) {
      document.getElementById('legs').textContent = 'Route failed'
    }
  }

  // Load existing plans on init
  async function initPlan() {
    await loadListings()
    await renderPlansList()
    try {
      const res = await fetch('/api/inspection-plans')
      const j = await res.json()
      if (j.ok) {
        const existing = Object.values(j.plans || {})
        if (existing.length) {
          currentPlan = existing[0]
          document.getElementById('plan-name').value = currentPlan.name || ''
          document.getElementById('plan-date').value = currentPlan.date || ''
          document.getElementById('plan-start-time').value = currentPlan.start_time || ''
          document.getElementById('plan-end-time').value = currentPlan.end_time || ''
          document.getElementById('plan-mode').value = currentPlan.mode || 'driving'
        }
      }
    } catch (e) { /* ignore */ }
    renderStops()
  }

  // Simple menu dismissal for hamburger
  document.addEventListener('click', (e) => {
    const menu = document.getElementById('nav-menu')
    const toggle = document.getElementById('nav-menu-toggle')
    if (menu && !menu.contains(e.target) && e.target !== toggle) menu.classList.add('hidden')
  })

  initPlan()
})()
