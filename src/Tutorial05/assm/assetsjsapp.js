/* global L */
window.IAA = (() => {
  const state = {
    all: [],
    filtered: [],
    markers: [],
    map: null,
    layerGroups: new Map()
  };

  // Utility
  const byId = (id) => document.getElementById(id);
  const el = (sel, root=document) => root.querySelector(sel);
  const els = (sel, root=document) => [...root.querySelectorAll(sel)];

  // Basic fuzzy contains
  const includes = (hay, needle) =>
    (hay || '').toLowerCase().includes((needle || '').toLowerCase());

  // ------------- BROWSE -------------
  async function initBrowse({ dataUrl, detailHref }) {
    // Load data
    const res = await fetch(dataUrl);
    state.all = await res.json();
    state.filtered = state.all.slice();

    initMap();
    renderMarkers(state.filtered);
    bindLayerToggles();
    bindFilters(detailHref);
    renderCards(state.filtered, detailHref);
  }

  function initMap() {
    state.map = L.map('map', { zoomControl: true, scrollWheelZoom: false })
      .setView([-25.27, 133.77], 4); // AU centre

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap'
    }).addTo(state.map);
  }

  function markerFor(item) {
    const isSensitive = item.location_sensitive_level && item.location_sensitive_level !== 'Exact';
    const coords = isSensitive ? item.general_coords : item.coords;

    if (!coords || coords.length !== 2) return null;

    const m = L.marker(coords);
    m.bindPopup(
      `<strong>${item.title}</strong><br><a href="detail.html?id=${encodeURIComponent(item.id)}">Open details</a>`
    );

    // add to layer group by category/period
    const key = item.period || 'Other';
    if (!state.layerGroups.has(key)) state.layerGroups.set(key, L.layerGroup().addTo(state.map));
    state.layerGroups.get(key).addLayer(m);
    return m;
  }

  function renderMarkers(items) {
    // clear old
    state.layerGroups.forEach(g => g.clearLayers());
    state.markers = [];
    items.forEach(it => {
      const m = markerFor(it);
      if (m) state.markers.push(m);
    });
  }

  function bindLayerToggles() {
    const boxes = els('.map-legend input[type="checkbox"]');
    boxes.forEach(box => {
      box.addEventListener('change', () => {
        const key = box.dataset.layer;
        const group = state.layerGroups.get(key);
        if (!group) return;
        if (box.checked) group.addTo(state.map);
        else state.map.removeLayer(group);
      });
    });
  }

  function bindFilters(detailHref) {
    const form = byId('filterForm');
    form.addEventListener('input', () => {
      const q = byId('q').value.trim();
      const type = byId('type').value;
      const period = byId('period').value;
      const region = byId('region').value;
      const sort = byId('sort').value;

      state.filtered = state.all.filter(a =>
        (!q || includes(a.title, q) || includes(a.artist, q) || includes(a.description, q)) &&
        (!type || a.type === type) &&
        (!period || a.period === period) &&
        (!region || a.region === region)
      );

      if (sort === 'title_asc') state.filtered.sort((a, b) => a.title.localeCompare(b.title));
      else state.filtered.sort((a, b) => new Date(b.submitted_at) - new Date(a.submitted_at));

      renderCards(state.filtered, detailHref);
      renderMarkers(state.filtered);
    });
  }

  function renderCards(items, detailHref) {
    const ul = byId('results');
    ul.innerHTML = '';
    if (!items.length) {
      ul.innerHTML = `<li class="muted">No entries match your filters.</li>`;
      return;
    }
    const frag = document.createDocumentFragment();
    items.forEach(a => {
      const li = document.createElement('li');
      li.className = 'card';
      li.innerHTML = `
        <img src="${a.images[0]?.thumb || 'assets/img/placeholders/placeholder.jpg'}" alt="">
        <div class="card-body">
          <h3><a href="${detailHref(a.id)}">${a.title}</a></h3>
          <div class="meta">
            <span>${a.type}</span>
            <span>${a.period}</span>
            <span>${a.region}</span>
          </div>
          <p class="muted">${a.description.slice(0, 100)}…</p>
        </div>
      `;
      frag.appendChild(li);
    });
    ul.appendChild(frag);
  }

  // ------------- DETAIL -------------
  async function initDetail({ dataUrl }) {
    const id = new URLSearchParams(location.search).get('id');
    const res = await fetch(dataUrl);
    const items = await res.json();
    const art = items.find(a => String(a.id) === String(id)) || items[0];

    el('#artTitle').textContent = art.title;
    el('#artistLine').textContent = art.artist ? `By ${art.artist}` : 'Artist unknown';
    el('#desc').textContent = art.description;
    el('#type').textContent = art.type;
    el('#period').textContent = art.period;
    el('#condition').textContent = art.condition || '—';
    el('#submitted').textContent = new Date(art.submitted_at).toLocaleDateString();

    // gallery
    const hero = el('#heroImg');
    const thumbs = el('#thumbs');
    const first = art.images[0];
    hero.src = first?.full || first?.thumb || '';
    hero.alt = first?.alt || '';

    thumbs.innerHTML = '';
    art.images.forEach((img, i) => {
      const li = document.createElement('li');
      const im = document.createElement('img');
      im.src = img.thumb; im.alt = img.alt || '';
      if (i === 0) im.setAttribute('aria-current', 'true');
      im.addEventListener('click', () => {
        hero.src = img.full || img.thumb; hero.alt = img.alt || '';
        els('.thumbs img').forEach(t => t.removeAttribute('aria-current'));
        im.setAttribute('aria-current', 'true');
        el('#imgCaption').textContent = img.caption || '';
      });
      li.appendChild(im);
      thumbs.appendChild(li);
    });
    el('#imgCaption').textContent = first?.caption || '';

    // map snippet (respect sensitivity)
    const level = art.location_sensitive_level || 'Exact';
    const mapDiv = byId('detailMap');
    const notes = byId('locNotes');
    const sensNote = byId('sensitivityNote');

    notes.textContent = art.location_notes || '';
    sensNote.textContent =
      level === 'Exact' ? '' :
      level === 'General Locality' ? 'Location shown as a general locality to protect the site.' :
      level === 'Region Only' ? 'Only the broader region is shown for cultural sensitivity.' :
      'Location hidden for cultural sensitivity.';

    const coords = level === 'Exact' ? art.coords :
                   level === 'General Locality' ? art.general_coords :
                   null;

    if (coords) {
      const m = L.map('detailMap', { zoomControl:false, dragging:false, scrollWheelZoom:false }).setView(coords, level==='Exact'?14:10);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{ maxZoom:19, attribution:'&copy; OpenStreetMap' }).addTo(m);
      L.marker(coords).addTo(m).bindPopup(art.title);
      mapDiv.setAttribute('aria-hidden','false');
    } else {
      // hide map box visually if completely hidden
      mapDiv.style.display = 'none';
    }

    // report (prototype feedback)
    el('#reportBtn').addEventListener('click', () => {
      el('#reportFeedback').textContent = 'Thanks — your report was recorded (demo only).';
    });
  }

  return { initBrowse, initDetail };
})();
