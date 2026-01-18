// Shared filter utilities and UI setup
// This file provides reusable filter logic for both listing and map views

// ==================== FILTER STATE ====================
let currentTomFilter = 'any' // any, yes, no
let currentMqFilter = 'any'
let currentFilter = 'hide_sold' // all or hide_sold
let currentSort = 'travel'
let currentExcludeMode = 'none'
let currentTravelMax = '55'
let currentWorkflowStatuses = ['active']
let currentSuburbs = []
let currentHideDuplex = true
let currentSearchTerm = ''
let currentRanking = false

// Load from localStorage
function loadStoredFilters() {
  let stored = {}
  try { stored = JSON.parse(localStorage.getItem('hf_filters') || '{}') } catch (e) { stored = {} }
  currentTomFilter = stored.tom || 'any'
  currentMqFilter = stored.mq || 'any'
  currentFilter = (typeof stored.status === 'undefined') ? 'hide_sold' : stored.status || 'all'
  currentSort = stored.sort || 'travel'
  currentExcludeMode = stored.exclude_voted_mode || 'none'
  currentTravelMax = stored.travel_max || '55'
  currentWorkflowStatuses = stored.workflow_statuses || ['active']
  currentSuburbs = stored.suburbs || []
  currentHideDuplex = (typeof stored.hide_duplex === 'undefined') ? true : !!stored.hide_duplex
  currentSearchTerm = stored.search || ''
  currentRanking = !!stored.ranking
}

// Save to localStorage
function saveFilters() {
  const obj = {status: currentFilter, sort: currentSort, ranking: !!currentRanking, tom: currentTomFilter, mq: currentMqFilter, exclude_voted_mode: currentExcludeMode, travel_max: currentTravelMax, workflow_statuses: currentWorkflowStatuses, suburbs: currentSuburbs, hide_duplex: currentHideDuplex, search: currentSearchTerm}
  try { localStorage.setItem('hf_filters', JSON.stringify(obj)) } catch (e) {}
}

// ==================== UTILITY FUNCTIONS ====================
function setToggleVisual(btn, on, color) {
  if (!btn) return
  btn.classList.remove('bg-green-600','bg-red-600','bg-gray-200','bg-gray-100','bg-blue-600','bg-yellow-600','bg-yellow-100','bg-purple-600','bg-purple-100','bg-indigo-600','text-white','text-gray-800','text-yellow-800','text-purple-800','text-blue-800','text-green-800')
  if (on) {
    let className = 'bg-green-600'
    if (color === 'blue') className = 'bg-blue-600'
    else if (color === 'red') className = 'bg-red-600'
    else if (color === 'yellow') className = 'bg-yellow-600'
    else if (color === 'purple') className = 'bg-purple-600'
    else if (color === 'indigo') className = 'bg-indigo-600'
    btn.classList.add(className,'text-white')
  } else {
    // For color buttons, use light background when off
    if (color === 'yellow') {
      btn.classList.add('bg-yellow-100','text-yellow-800')
    } else if (color === 'purple') {
      btn.classList.add('bg-purple-100','text-purple-800')
    } else if (color === 'blue') {
      btn.classList.add('bg-blue-100','text-blue-800')
    } else {
      btn.classList.add('bg-gray-200','text-gray-800')
    }
  }
}

// ==================== FILTER UI SETUP ====================
// Helper to populate travel time select
function populateTravelSelect(filterTravelSelect, onChangeCallback) {
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
    saveFilters()
    if (onChangeCallback) onChangeCallback()
  })
}

// Helper to setup workflow status filter with TomSelect
function applyWorkflowStatusUI(selectEl, onChangeCallback) {
  if (!selectEl) return
  
  // Initialize TomSelect with pills UI
  const workflowStatusSelect = new TomSelect(selectEl, {
    plugins: ['remove_button'],
    maxItems: null,
    closeAfterSelect: true,
    onInitialize: function() {
      this.setValue(currentWorkflowStatuses)
    },
    onChange: function(values) {
      currentWorkflowStatuses = Array.isArray(values) ? values : (values ? [values] : [])
      // Ensure at least one status is selected; default to 'active' if empty
      if (currentWorkflowStatuses.length === 0) {
        currentWorkflowStatuses = ['active']
        this.setValue(['active'])
      }
      saveFilters()
      if (onChangeCallback) onChangeCallback()
    }
  })
  return workflowStatusSelect
}

// Helper to setup suburbs filter with TomSelect
async function applySuburbsUI(selectEl, onChangeCallback) {
  if (!selectEl) return
  
  try {
    // Fetch suburbs list from API
    const res = await fetch('/api/suburbs')
    const data = await res.json()
    
    if (data.ok && data.suburbs) {
      // Populate options
      data.suburbs.forEach(suburb => {
        const option = document.createElement('option')
        option.value = suburb
        option.textContent = suburb
        selectEl.appendChild(option)
      })
      
      // Initialize TomSelect with pills UI and search
      const suburbsSelect = new TomSelect(selectEl, {
        plugins: ['remove_button'],
        maxItems: null,
        closeAfterSelect: false,
        onChange: function(values) {
          currentSuburbs = Array.isArray(values) ? values : (values ? [values] : [])
          saveFilters()
          if (onChangeCallback) onChangeCallback()
        }
      })
      
      // Set initial values from stored filter
      if (currentSuburbs && currentSuburbs.length > 0) {
        suburbsSelect.setValue(currentSuburbs)
      }
      return suburbsSelect
    }
  } catch (err) {
    console.error('Failed to load suburbs:', err)
  }
}

// Helper to setup hide duplex filter
function applyHideDuplexUI(hideDuplexBtn, onChangeCallback) {
  if (!hideDuplexBtn) return
  setToggleVisual(hideDuplexBtn, currentHideDuplex, 'green')
  hideDuplexBtn.setAttribute('aria-pressed', currentHideDuplex ? 'true' : 'false')
  hideDuplexBtn.addEventListener('click', () => {
    currentHideDuplex = !currentHideDuplex
    hideDuplexBtn.setAttribute('aria-pressed', currentHideDuplex ? 'true' : 'false')
    setToggleVisual(hideDuplexBtn, currentHideDuplex, 'green')
    saveFilters()
    if (onChangeCallback) onChangeCallback()
  })
}
