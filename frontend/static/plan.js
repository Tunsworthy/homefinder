(() => {
  let currentPlan = { id: null, date: null, mode: 'driving', stops: [] }

  function renderStops() {
    const box = document.getElementById('stops')
    box.innerHTML = ''
    currentPlan.stops.forEach((s, idx) => {
      const row = document.createElement('div')
      row.className = 'flex items-center gap-2'
      row.innerHTML = `
        <input class="border rounded px-2 py-1 w-32 stop-id" data-idx="${idx}" value="${s.listing_id||''}" placeholder="Listing ID">
        <input class="border rounded px-2 py-1 w-32 stop-override" data-idx="${idx}" type="number" min="0" value="${s.override_minutes??''}" placeholder="Override min">
        <button class="px-2 py-1 text-sm bg-red-100 text-red-700 rounded rm-stop" data-idx="${idx}">✕</button>
      `
      box.appendChild(row)
    })
    document.querySelectorAll('.stop-id').forEach(inp => {
      inp.onchange = () => {
        currentPlan.stops[Number(inp.dataset.idx)].listing_id = inp.value.trim()
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

  document.getElementById('add-stop').onclick = () => {
    currentPlan.stops.push({ listing_id: '', override_minutes: null })
    renderStops()
  }

  document.getElementById('save-plan').onclick = async () => {
    currentPlan.date = document.getElementById('plan-date').value || null
    currentPlan.mode = document.getElementById('plan-mode').value || 'driving'
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

  // Load existing plans (optional first one)
  async function initPlan() {
    try {
      const res = await fetch('/api/inspection-plans')
      const j = await res.json()
      if (j.ok) {
        const existing = Object.values(j.plans || {})
        if (existing.length) {
          currentPlan = existing[0]
          document.getElementById('plan-date').value = currentPlan.date || ''
          document.getElementById('plan-mode').value = currentPlan.mode || 'driving'
        }
      }
    } catch (e) { /* ignore */ }
    renderStops()
  }

  // Simple menu dismissal for hamburger (menu wiring already in template)
  document.addEventListener('click', (e) => {
    const menu = document.getElementById('nav-menu')
    const toggle = document.getElementById('nav-menu-toggle')
    if (menu && !menu.contains(e.target) && e.target !== toggle) menu.classList.add('hidden')
  })

  initPlan()
})()
