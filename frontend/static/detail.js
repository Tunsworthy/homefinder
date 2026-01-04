async function loadDetail() {
  const content = document.getElementById('content')
  content.innerHTML = 'Loading...'
  try {
    const res = await fetch(`/api/listing/${listingId}`)
    if (!res.ok) {
      content.innerHTML = '<div class="text-red-600">Listing not found</div>'
      return
    }
    const data = await res.json()
    const imgUrl = data.image || (data.image_urls && data.image_urls[0])
    const img = imgUrl ? `<img src="${imgUrl}" class="w-full h-64 object-cover rounded mb-4">` : ''
    const beds = data.bedrooms ? `<div>Bedrooms: ${data.bedrooms}</div>` : ''
    const baths = data.bathrooms ? `<div>Bathrooms: ${data.bathrooms}</div>` : ''
    const parking = data.parking ? `<div>Parking: ${data.parking}</div>` : ''
    // load commutes for this listing (backend writes commute/<id>.json)
    let commuteHtml = ''
    try {
      const cres = await fetch(`/commute/${listingId}.json`)
      if (cres.ok) {
        const cj = await cres.json()
        const commutes = cj && cj.commutes ? cj.commutes : []
        if (commutes.length > 0) {
          commuteHtml = '<div class="mb-2"><div class="font-medium">Commutes</div>'
          for (const c of commutes) {
            const name = c.name || 'Commute'
            const mins = c.result && c.result.summary && c.result.summary.duration_text ? c.result.summary.duration_text : (c.result && c.result.summary ? c.result.summary : '')
            const station = c.result && c.result.nearest_station ? c.result.nearest_station.name || c.result.nearest_station : ''
            const mapLink = `https://www.google.com/maps/dir/?origin=${encodeURIComponent(data.address||'')}&destination=${encodeURIComponent(c.destination||'')}&travelmode=${encodeURIComponent(c.mode||'transit')}`
            commuteHtml += `<div class="text-sm mt-1"><a href="${mapLink}" target="_blank" class="text-blue-600 mr-2">${escapeHtml(name)}</a> <span class="text-gray-700">${escapeHtml(mins || '')}</span> <span class="text-xs text-gray-500">${escapeHtml(station || '')}</span></div>`
          }
          commuteHtml += '</div>'
        }
      }
    } catch(e) { /* ignore, show nothing */ }
    const url = data.url ? `<a href="${data.url}" target="_blank" class="text-blue-600">View on domain.com.au</a>` : ''

    const tomState = (data.tom === true) ? 'yes' : (data.tom === false ? 'no' : 'unset')
    const mqState = (data.mq === true) ? 'yes' : (data.mq === false ? 'no' : 'unset')

    const tomControls = `
      <div class="mt-2">
        <div class="flex items-center space-x-2">
          <div class="font-medium">Tom:</div>
          <button id="tom-yes" class="px-3 py-1 rounded ${data.tom===true? 'bg-green-200' : 'bg-gray-100'}">Yes</button>
          <button id="tom-no" class="px-3 py-1 rounded ${data.tom===false? 'bg-red-200' : 'bg-gray-100'}">No</button>
          <div class="text-sm text-gray-600">Current: ${tomState}</div>
        </div>
        <div class="mt-2">
          <div class="mb-2">
            <label class="text-sm mr-2">Save comment as:</label>
            <select id="tom-comment-who" class="p-1 border rounded">
              <option value="tom" selected>Tom</option>
              <option value="mq">MQ</option>
            </select>
          </div>
          <textarea id="tom-comment" placeholder="Why Tom voted yes/no" class="w-full p-2 border rounded">${data.tom_comment||''}</textarea>
          <div class="mt-2"><button id="tom-save-comment" class="px-3 py-1 bg-blue-200 rounded">Save Tom comment</button></div>
        </div>
      </div>
    `

    const mqControls = `
      <div class="mt-2">
        <div class="flex items-center space-x-2">
          <div class="font-medium">MQ:</div>
          <button id="mq-yes" class="px-3 py-1 rounded ${data.mq===true? 'bg-green-200' : 'bg-gray-100'}">Yes</button>
          <button id="mq-no" class="px-3 py-1 rounded ${data.mq===false? 'bg-red-200' : 'bg-gray-100'}">No</button>
          <div class="text-sm text-gray-600">Current: ${mqState}</div>
        </div>
        <div class="mt-2">
          <div class="mb-2">
            <label class="text-sm mr-2">Save comment as:</label>
            <select id="mq-comment-who" class="p-1 border rounded">
              <option value="mq" selected>MQ</option>
              <option value="tom">Tom</option>
            </select>
          </div>
          <textarea id="mq-comment" placeholder="Why MQ voted yes/no" class="w-full p-2 border rounded">${data.mq_comment||''}</textarea>
          <div class="mt-2"><button id="mq-save-comment" class="px-3 py-1 bg-blue-200 rounded">Save MQ comment</button></div>
        </div>
      </div>
    `

    content.innerHTML = `
      ${img}
      <h2 class="text-xl font-semibold mb-2">${data.headline || data.address || ''}</h2>
      <div class="text-sm text-gray-700 mb-4">${data.description ? data.description.replace(/\n/g, '<br>') : ''}</div>
      <div class="bg-white p-4 rounded shadow mb-4">
        ${beds}
        ${baths}
        ${parking}
        ${commuteHtml}
        ${tomControls}
        ${mqControls}
        ${url}
      </div>
    `
    // wire up vote buttons
    document.getElementById('tom-yes').addEventListener('click', () => postVote({tom: true}))
    document.getElementById('tom-no').addEventListener('click', () => postVote({tom: false}))
    document.getElementById('mq-yes').addEventListener('click', () => postVote({mq: true}))
    document.getElementById('mq-no').addEventListener('click', () => postVote({mq: false}))

    document.getElementById('tom-save-comment').addEventListener('click', () => {
      const txt = document.getElementById('tom-comment').value
      const who = document.getElementById('tom-comment-who') ? document.getElementById('tom-comment-who').value : 'tom'
      const payload = who === 'tom' ? {tom_comment: txt} : {mq_comment: txt}
      postVote(payload)
    })
    document.getElementById('mq-save-comment').addEventListener('click', () => {
      const txt = document.getElementById('mq-comment').value
      const who = document.getElementById('mq-comment-who') ? document.getElementById('mq-comment-who').value : 'mq'
      const payload = who === 'mq' ? {mq_comment: txt} : {tom_comment: txt}
      postVote(payload)
    })

    async function postVote(payload) {
      try {
        const res = await fetch(`/api/listing/${listingId}/vote`, {method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload)})
        const j = await res.json()
        if (j.ok) {
          // reload detail to reflect state
          loadDetail()
        }
      } catch (e) {
        console.error('Vote failed', e)
      }
    }
  } catch (e) {
    content.innerHTML = '<div class="text-red-600">Failed to load listing</div>'
    console.error(e)
  }
}

loadDetail()
