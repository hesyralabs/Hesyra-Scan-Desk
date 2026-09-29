/**
 * Hesyra Field Scanner - Order Enrollment Form Logic
 * Prosthesis Catalog & Plans matching Pic 1, 2, 3 & Aligners
 * No pricing / No discount / No rate / 48-Hour SLA Timer
 */

const PRODUCT_CATALOG = {
  "Prosthesis": [
    "Permanent Crown",
    "Bridge (Per Unit)",
    "Inlays & Onlays",
    "Veneers"
  ],
  "Implantology": [
    "Surgical Guides (Autoclavable)"
  ],
  "Pedodontics": [
    "Space Maintainers (Shape-Memory)"
  ],
  "Dentures & More": [
    "Digital Complete Dentures",
    "Retainers & Appliances"
  ],
  "Aligners & Guides": [
    "Smart Shape Memory Clear Aligners (smartalign)",
    "Clear Aligners (PG Residents Special Rates)"
  ],
  "Add-ons": [
    "Virtual Surgical Planning (CBCT)",
    "CAD Design Charge",
    "Chairside Intraoral Scanning Visit",
    "Rush Processing / Priority Dispatch"
  ]
};

const PRODUCT_PLANS = {
  "Permanent Crown": [
    "Ceramic Crown — 950",
    "Zirconia Crown — 1,500"
  ],
  "Bridge (Per Unit)": [
    "Ceramic Crown — 950",
    "Zirconia Crown — 1,500"
  ],
  "Inlays & Onlays": [
    "e.max CAD / Lithium Disilicate",
    "Zirconia Monolithic High-Translucent",
    "Composite Inlay / Onlay",
    "Standard Lab Tier"
  ],
  "Veneers": [
    "e.max Aesthetic Veneer (High Translucency)",
    "Layered Zirconia Aesthetic Veneer",
    "Feldspathic Veneer",
    "Standard Tier"
  ],
  "Surgical Guides (Autoclavable)": [
    "Fully Guided Surgical Guide (Autoclavable)",
    "Pilot Drill Guide (Autoclavable)",
    "Stackable / Multi-piece Guide",
    "Standard Autoclavable Guide"
  ],
  "Space Maintainers (Shape-Memory)": [
    "Unilateral Band & Loop (Shape-Memory)",
    "Bilateral Lingual Arch (Shape-Memory)",
    "Distal Shoe (Shape-Memory)",
    "Standard Space Maintainer"
  ],
  "Digital Complete Dentures": [
    "Digital Complete Denture (Printed Base + Teeth)",
    "Digital Complete Denture (Milled Premium)",
    "3D Printed Monolithic Try-in",
    "Standard Complete Denture"
  ],
  "Retainers & Appliances": [
    "Essix Clear Retainer (Single Arch)",
    "Essix Clear Retainer (Dual Arch)",
    "Hawley Retainer with Wire",
    "3D Printed Nightguard / Occlusal Splint"
  ],
  "Smart Shape Memory Clear Aligners (smartalign)": [
    "Flexi (Relapse) — Pay per Aligner — 3,200",
    "Standard (Mild Cases) — 10 Sets — 34,999",
    "Premium (Moderate Cases) — 15 Sets — 49,999",
    "Elite (Complicated Cases) — 20 Sets — 64,999",
    "Executive (Unlimited — Single Arch) — 70,000",
    "Executive (Unlimited — Both Arches) — 90,999",
    "Lite 10 (Legacy) — 34,999",
    "Full Case (Legacy) — 90,999"
  ],
  "Clear Aligners (PG Residents Special Rates)": [
    "PG Resident Special (Mild Cases) — 10 Sets — 24,999",
    "PG Resident Special (Moderate Cases) — 15 Sets — 34,999",
    "PG Resident Special (Comprehensive Cases) — 20 Sets — 44,999",
    "PG Resident (Single Arch) — 19,999",
    "PG Resident (Both Arches) — 29,999",
    "PG Resident Case Planning + Staging Only — 4,999"
  ],
  "Virtual Surgical Planning (CBCT)": [
    "Single Implant Site CBCT Plan",
    "Full Arch Guided Surgery CBCT Plan"
  ],
  "CAD Design Charge": [
    "Single Unit CAD Design (STL)",
    "Multiple Units / Bridge CAD Design"
  ],
  "Chairside Intraoral Scanning Visit": [
    "Standard Chairside Clinic Visit",
    "Rush / Same-Day Chairside Visit"
  ],
  "Rush Processing / Priority Dispatch": [
    "24-Hour Express Turnaround",
    "Same-Day Priority Dispatch"
  ]
};

function isArchProduct(prod) {
  return [
    'Smart Shape Memory Clear Aligners (smartalign)',
    'Clear Aligners (PG Residents Special Rates)',
    'Digital Complete Dentures'
  ].includes(prod);
}

let registeredClinics = [];
let selectedClinic = null;
let uploadedPhotos = [];
let itemCounter = 0;
let activeToothPickerRowId = null;
let toothPickerModalChart = null;

async function initFieldForm() {
  await loadClinics();
  setupClinicRegistrationModal();
  setupFabricationLineItems();
  setupToothPickerModal();
  setupCameraCapture();
  setupFormSubmit();
}

/**
 * 1. CLINIC SELECTION & REGISTRATION
 */
async function loadClinics() {
  try {
    const res = await fetch('/api/clinics');
    const data = await res.json();
    if (data.success && data.clinics) {
      registeredClinics = data.clinics;
      renderClinicDropdown(data.clinics);
    }
  } catch (err) {
    console.warn('Failed to load clinics:', err);
  }
}

function renderClinicDropdown(clinics) {
  const select = document.getElementById('select-clinic');
  if (!select) return;

  select.innerHTML = '<option value="">- Select Registered Clinic / Doctor -</option>' +
    clinics.map(c => `
      <option value="${c.id}">${escapeHtml(c.clinicName)} - ${escapeHtml(c.primaryDoctorName)} (${escapeHtml(c.city || 'Nagpur')})</option>
    `).join('');

  select.addEventListener('change', () => {
    const cid = parseInt(select.value, 10);
    selectedClinic = registeredClinics.find(c => c.id === cid) || null;
    updateSelectedClinicCard(selectedClinic);
  });

  if (clinics.length > 0 && !selectedClinic) {
    select.value = clinics[0].id;
    selectedClinic = clinics[0];
    updateSelectedClinicCard(selectedClinic);
  }
}

function updateSelectedClinicCard(clinic) {
  const card = document.getElementById('selected-clinic-preview');
  if (!card) return;

  if (!clinic) {
    card.style.display = 'none';
    return;
  }

  card.style.display = 'block';
  document.getElementById('preview-clinic-name').textContent = clinic.clinicName;
  document.getElementById('preview-doc-name').textContent = clinic.primaryDoctorName;
  document.getElementById('preview-phone').textContent = clinic.phone || 'No phone';
  document.getElementById('preview-address').textContent = clinic.fullAddress || `${clinic.city || 'Nagpur'}, ${clinic.state || 'Maharashtra'}`;
}

function setupClinicRegistrationModal() {
  const btnOpen = document.getElementById('btn-open-register-clinic');
  const modal = document.getElementById('register-clinic-modal');
  const form = document.getElementById('register-clinic-form');

  if (!btnOpen || !modal) return;

  btnOpen.addEventListener('click', () => {
    modal.classList.add('open');
  if (window.refreshIcons) window.refreshIcons();
  });

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btnSubmit = document.getElementById('btn-save-clinic');
    btnSubmit.disabled = true;
    btnSubmit.textContent = 'Saving...';

    const payload = {
      primaryDoctorName: document.getElementById('reg-primary-doctor').value.trim(),
      clinicName: document.getElementById('reg-clinic-name').value.trim(),
      partnerDoctors: document.getElementById('reg-partner-doctors').value.trim(),
      phone: document.getElementById('reg-phone').value.trim(),
      email: document.getElementById('reg-email').value.trim(),
      gstin: document.getElementById('reg-gstin').value.trim(),
      fullAddress: document.getElementById('reg-address').value.trim(),
      city: document.getElementById('reg-city').value.trim() || 'Nagpur',
      state: document.getElementById('reg-state').value,
      pinCode: document.getElementById('reg-pincode').value.trim(),
      creditDays: document.getElementById('reg-credit-days').value.trim() || '15',
      internalNotes: document.getElementById('reg-internal-notes').value.trim()
    };

    try {
      const res = await fetch('/api/clinics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (data.success && data.clinic) {
        showToast('Clinic registered successfully!', 'success');
        modal.classList.remove('open');
        form.reset();
        await loadClinics();
        const select = document.getElementById('select-clinic');
        if (select) {
          select.value = data.clinic.id;
          selectedClinic = data.clinic;
          updateSelectedClinicCard(selectedClinic);
        }
      } else {
        showToast(data.error || 'Failed to register clinic', 'error');
      }
    } catch (err) {
      showToast('Network error: ' + err.message, 'error');
    } finally {
      btnSubmit.disabled = false;
      btnSubmit.textContent = 'Save Clinic';
    }
  });
}

/**
 * 2. FABRICATION WORK & ALIGNERS
 */
function setupFabricationLineItems() {
  const btnAdd = document.getElementById('btn-add-line-item');
  addLineItem();

  btnAdd?.addEventListener('click', (e) => {
    e.preventDefault();
    addLineItem();
  });

  document.addEventListener('keydown', (e) => {
    if (e.altKey && e.key.toLowerCase() === 'n') {
      e.preventDefault();
      addLineItem();
    }
  });
}

function renderProductSelectOptions(selectedProd) {
  let html = '<option value="">Select...</option>';
  for (const [category, prods] of Object.entries(PRODUCT_CATALOG)) {
    html += `<optgroup label="${escapeHtml(category)}">`;
    prods.forEach(p => {
      const isSel = p === selectedProd ? 'selected' : '';
      html += `<option value="${escapeHtml(p)}" ${isSel}>${escapeHtml(p)}</option>`;
    });
    html += '</optgroup>';
  }
  return html;
}

function updatePlanDropdown(planSelectEl, product, preferredPlan) {
  if (!planSelectEl) return;
  const plans = PRODUCT_PLANS[product] || [
    'Standard Lab Tier',
    'Premium Tier',
    'Express Turnaround'
  ];

  planSelectEl.innerHTML = plans.map((pl, idx) => {
    const isSel = preferredPlan ? (pl === preferredPlan) : (idx === 0);
    return `<option value="${escapeHtml(pl)}" ${isSel ? 'selected' : ''}>${escapeHtml(pl)}</option>`;
  }).join('');
}


// ==========================================================================
// VITA CLASSICAL & BLEACH SHADE SELECTOR SYSTEM
// ==========================================================================
const VITA_SHADES = [
  {
    group: "Popular / VITA A (Reddish-Brownish)",
    shades: [
      { code: "A1", label: "A1 — Light Ivory" },
      { code: "A2", label: "A2 — Natural (Most Common)" },
      { code: "A3", label: "A3 — Warm Natural" },
      { code: "A3.5", label: "A3.5 — Dark Warm" },
      { code: "A4", label: "A4 — Intense Warm Brown" }
    ]
  },
  {
    group: "VITA B (Reddish-Yellowish)",
    shades: [
      { code: "B1", label: "B1 — Light Yellow / High Value" },
      { code: "B2", label: "B2 — Natural Yellowish" },
      { code: "B3", label: "B3 — Warm Yellowish" },
      { code: "B4", label: "B4 — Dark Yellowish" }
    ]
  },
  {
    group: "VITA C (Greyish)",
    shades: [
      { code: "C1", label: "C1 — Light Grey" },
      { code: "C2", label: "C2 — Natural Greyish" },
      { code: "C3", label: "C3 — Medium Greyish" },
      { code: "C4", label: "C4 — Dark Greyish" }
    ]
  },
  {
    group: "VITA D (Reddish-Grey)",
    shades: [
      { code: "D2", label: "D2 — Light Reddish-Grey" },
      { code: "D3", label: "D3 — Medium Reddish-Grey" },
      { code: "D4", label: "D4 — Dark Reddish-Grey" }
    ]
  },
  {
    group: "Bleach Shades (Aesthetic Ultra-White)",
    shades: [
      { code: "BL1", label: "BL1 — Ultra Bleach White" },
      { code: "BL2", label: "BL2 — Bleach White" },
      { code: "BL3", label: "BL3 — Soft Bleach" },
      { code: "BL4", label: "BL4 — Natural Light Bleach" }
    ]
  }
];

const ALL_STANDARD_SHADES = [
  'A1', 'A2', 'A3', 'A3.5', 'A4',
  'B1', 'B2', 'B3', 'B4',
  'C1', 'C2', 'C3', 'C4',
  'D2', 'D3', 'D4',
  'BL1', 'BL2', 'BL3', 'BL4'
];

function renderShadeSelectHtml(selectedShade = 'A2') {
  const isCustom = selectedShade && !ALL_STANDARD_SHADES.includes(selectedShade);
  
  let optionsHtml = '';
  VITA_SHADES.forEach(group => {
    optionsHtml += `<optgroup label="${group.group}">`;
    group.shades.forEach(s => {
      const isSel = (!isCustom && (selectedShade === s.code)) ? 'selected' : '';
      optionsHtml += `<option value="${s.code}" ${isSel}>${s.label}</option>`;
    });
    optionsHtml += `</optgroup>`;
  });
  
  optionsHtml += `
    <optgroup label="Custom / Special">
      <option value="CUSTOM" ${isCustom ? 'selected' : ''}>Custom / Not Listed...</option>
    </optgroup>
  `;

  return `
    <div class="shade-selector-wrap">
      <select class="form-select item-shade" onchange="handleShadeChange(this)" title="Choose tooth shade from VITA Classical & Bleach standards">
        ${optionsHtml}
      </select>
      <input type="text" class="form-input item-shade-custom" placeholder="Type custom shade (e.g. 2M2, ND2)..." 
        value="${isCustom ? escapeHtml(selectedShade) : ''}" 
        style="${isCustom ? 'display: block;' : 'display: none;'} margin-top: 4px; font-size: 0.8rem;">
    </div>
  `;
}

function handleShadeChange(selectEl) {
  const wrap = selectEl.closest('.shade-selector-wrap') || selectEl.parentElement;
  const customInput = wrap.querySelector('.item-shade-custom');
  if (selectEl.value === 'CUSTOM') {
    if (customInput) {
      customInput.style.display = 'block';
      customInput.focus();
    }
  } else {
    if (customInput) {
      customInput.style.display = 'none';
      customInput.value = '';
    }
  }
}
window.handleShadeChange = handleShadeChange;

function getRowShadeValue(rowEl) {
  const select = rowEl.querySelector('.item-shade');
  if (!select) return 'A2';
  if (select.value === 'CUSTOM') {
    const custom = rowEl.querySelector('.item-shade-custom');
    return (custom?.value.trim()) || 'Custom';
  }
  return select.value || 'A2';
}
window.getRowShadeValue = getRowShadeValue;

function getRowBottomHtml(itemId, product, values = {}) {
  if (isArchProduct(product)) {
    // Aligner / Arch Mode (Screenshot 4)
    return `
      <div class="line-item-row-bottom aligner-mode">
        <div class="item-col col-arch">
          <label class="item-field-label">Arch</label>
          <select class="form-select item-arch">
            <option value="">— Arch —</option>
            <option value="Both Arches" ${values.arch === 'Both Arches' ? 'selected' : ''}>Both Arches</option>
            <option value="Upper Arch" ${values.arch === 'Upper Arch' ? 'selected' : ''}>Upper Arch</option>
            <option value="Lower Arch" ${values.arch === 'Lower Arch' ? 'selected' : ''}>Lower Arch</option>
          </select>
        </div>

        <div class="item-col col-note">
          <label class="item-field-label">Line Note</label>
          <input type="text" class="form-input item-note" placeholder="Special line note or instructions..." value="${escapeHtml(values.note || '')}">
        </div>

        <div class="item-col col-delete">
          <button type="button" class="btn-delete-line-item" title="Remove line item" onclick="removeLineItem(${itemId})"><i data-lucide="trash-2"></i></button>
        </div>
      </div>
    `;
  } else {
    // Crown / Prosthesis Mode (Screenshot 2 & 3)
    return `
      <div class="line-item-row-bottom crown-mode">
        <div class="item-col col-tooth">
          <label class="item-field-label">Tooth</label>
          <div class="tooth-input-wrap">
            <input type="text" class="form-input item-teeth" placeholder="e.g. 16, 1" value="${escapeHtml(values.teeth || '')}">
            <button type="button" class="btn-tooth-picker-icon" title="Select teeth on interactive FDI chart" onclick="openToothPicker(${itemId})">
              <i data-lucide="grid-3x3"></i>
            </button>
          </div>
        </div>

        <div class="item-col col-shade">
          <label class="item-field-label">Shade</label>
          ${renderShadeSelectHtml(values.shade || 'A2')}
        </div>

        <div class="item-col col-note">
          <label class="item-field-label">Line Note</label>
          <input type="text" class="form-input item-note" placeholder="Special line note or instructions..." value="${escapeHtml(values.note || '')}">
        </div>

        <div class="item-col col-delete">
          <button type="button" class="btn-delete-line-item" title="Remove line item" onclick="removeLineItem(${itemId})"><i data-lucide="trash-2"></i></button>
        </div>
      </div>
    `;
  }
}

function updateRowBottomView(itemEl, itemId, product) {
  const currentBottom = itemEl.querySelector('.line-item-row-bottom');
  const values = {
    teeth: itemEl.querySelector('.item-teeth')?.value || '',
    shade: getRowShadeValue(itemEl),
    arch: itemEl.querySelector('.item-arch')?.value || '',
    note: itemEl.querySelector('.item-note')?.value || ''
  };

  const newBottomWrapper = document.createElement('div');
  newBottomWrapper.innerHTML = getRowBottomHtml(itemId, product, values);
  const newBottom = newBottomWrapper.firstElementChild;

  if (currentBottom) {
    currentBottom.replaceWith(newBottom);
  } else {
    itemEl.appendChild(newBottom);
  }
  if (window.refreshIcons) window.refreshIcons();
}

function addLineItem() {
  const container = document.getElementById('line-items-container');
  if (!container) return;

  itemCounter++;
  const itemId = itemCounter;
  const defaultProduct = 'Permanent Crown';
  const defaultPlan = 'Ceramic Crown — 950';

  const itemEl = document.createElement('div');
  itemEl.className = 'line-item-card';
  itemEl.id = `line-item-${itemId}`;

  itemEl.innerHTML = `
    <!-- ROW 1: Product *, Plan *, Qty * (Pic 2, 3 & 4) -->
    <div class="line-item-row-top">
      <div class="item-col col-product">
        <label class="item-field-label">Product <span class="required">*</span></label>
        <select class="form-select item-product" required>
          ${renderProductSelectOptions(defaultProduct)}
        </select>
      </div>

      <div class="item-col col-plan">
        <label class="item-field-label">Plan <span class="required">*</span></label>
        <select class="form-select item-plan" required>
          <!-- Populated dynamically -->
        </select>
      </div>

      <div class="item-col col-qty">
        <label class="item-field-label">Qty <span class="required">*</span></label>
        <input type="number" class="form-input item-qty" value="1" min="1" max="32" required>
      </div>
    </div>

    <!-- ROW 2 Container -->
    <div class="row-2-slot"></div>
  `;

  container.appendChild(itemEl);

  const prodSelect = itemEl.querySelector('.item-product');
  const planSelect = itemEl.querySelector('.item-plan');
  const row2Slot = itemEl.querySelector('.row-2-slot');

  // Insert initial row bottom
  row2Slot.innerHTML = getRowBottomHtml(itemId, defaultProduct, { shade: 'A2' });

  // Initialize plans
  updatePlanDropdown(planSelect, defaultProduct, defaultPlan);

  // Dynamic switch between Crown Mode and Aligner Mode
  prodSelect.addEventListener('change', () => {
    const selectedProd = prodSelect.value;
    updatePlanDropdown(planSelect, selectedProd);
    updateRowBottomView(itemEl, itemId, selectedProd);
  });
  if (window.refreshIcons) window.refreshIcons();
}

window.removeLineItem = function(id) {
  const el = document.getElementById(`line-item-${id}`);
  const container = document.getElementById('line-items-container');
  if (container.children.length <= 1) {
    showToast('At least 1 fabrication line item is mandatory.', 'warning');
    return;
  }
  el?.remove();
};

function setupToothPickerModal() {
  const modal = document.getElementById('tooth-picker-modal');
  const chartBox = document.getElementById('modal-tooth-chart-container');
  if (!modal || !chartBox) return;

  toothPickerModalChart = new ToothChart('modal-tooth-chart-container', {
    onSelectionChange: (teeth) => {
      const summaryText = document.getElementById('modal-selected-teeth-text');
      if (summaryText) {
        summaryText.textContent = teeth.length ? teeth.join(', ') : 'None';
      }
    }
  });

  document.getElementById('btn-close-tooth-modal')?.addEventListener('click', () => modal.classList.remove('open'));
  document.getElementById('btn-cancel-tooth-modal')?.addEventListener('click', () => modal.classList.remove('open'));

  document.getElementById('btn-apply-tooth-modal')?.addEventListener('click', () => {
    if (!activeToothPickerRowId) return;
    const rowEl = document.getElementById(`line-item-${activeToothPickerRowId}`);
    if (rowEl) {
      const teeth = toothPickerModalChart.getTeeth();
      const inputTeeth = rowEl.querySelector('.item-teeth');
      const inputQty = rowEl.querySelector('.item-qty');

      if (inputTeeth) inputTeeth.value = teeth.join(', ');
      if (inputQty && teeth.length > 0) inputQty.value = teeth.length;
    }
    modal.classList.remove('open');
  });
}

window.openToothPicker = function(itemId) {
  activeToothPickerRowId = itemId;
  const modal = document.getElementById('tooth-picker-modal');
  if (!modal || !toothPickerModalChart) return;

  const rowEl = document.getElementById(`line-item-${itemId}`);
  const inputTeeth = rowEl?.querySelector('.item-teeth');
  const existingVal = inputTeeth ? inputTeeth.value.trim() : '';

  if (existingVal) {
    const rawTokens = existingVal.split(/[,\s]+/).filter(Boolean);
    toothPickerModalChart.setTeeth(rawTokens);
  } else {
    toothPickerModalChart.clear();
  }

  modal.classList.add('open');
  if (window.refreshIcons) window.refreshIcons();
};

function setupCameraCapture() {
  const prepInput = document.getElementById('cam-prep-input');
  const shadeInput = document.getElementById('cam-shade-input');
  const rxInput = document.getElementById('cam-rx-input');

  const handle = (files) => {
    if (!files || !files.length) return;
    for (let f of files) uploadedPhotos.push(f);
    renderPhotoPreviews();
  };

  prepInput?.addEventListener('change', (e) => handle(e.target.files));
  shadeInput?.addEventListener('change', (e) => handle(e.target.files));
  rxInput?.addEventListener('change', (e) => handle(e.target.files));

  document.getElementById('btn-cam-prep')?.addEventListener('click', () => prepInput?.click());
  document.getElementById('btn-cam-shade')?.addEventListener('click', () => shadeInput?.click());
  document.getElementById('btn-cam-rx')?.addEventListener('click', () => rxInput?.click());
}

function renderPhotoPreviews() {
  const strip = document.getElementById('photos-preview-strip');
  if (!strip) return;

  if (uploadedPhotos.length === 0) {
    strip.innerHTML = '<span style="font-size: 0.8rem; color: var(--text-subtle);">No photos captured yet</span>';
    return;
  }

  strip.innerHTML = '';
  uploadedPhotos.forEach((file, idx) => {
    const item = document.createElement('div');
    item.className = 'photo-preview-item';
    const img = document.createElement('img');
    img.src = URL.createObjectURL(file);
    const del = document.createElement('button');
    del.className = 'photo-remove-btn';
    del.innerHTML = 'x';
    del.onclick = () => { uploadedPhotos.splice(idx, 1); renderPhotoPreviews(); };
    item.appendChild(img);
    item.appendChild(del);
    strip.appendChild(item);
  });
}

function setupFormSubmit() {
  const form = document.getElementById('field-order-form');
  const btnSubmit = document.getElementById('btn-submit-order');

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (!selectedClinic) {
      showToast('Please select or register a clinic first.', 'error');
      document.getElementById('select-clinic').focus();
      return;
    }

    const patientName = document.getElementById('input-patient-name').value.trim();
    const patientAge = document.getElementById('input-patient-age').value.trim();
    const patientSex = document.getElementById('input-patient-sex').value;

    if (!patientName) {
      showToast('Patient Name is mandatory.', 'error');
      document.getElementById('input-patient-name').focus();
      return;
    }
    if (!patientAge) {
      showToast('Patient Age is mandatory.', 'error');
      document.getElementById('input-patient-age').focus();
      return;
    }
    if (!patientSex) {
      showToast('Please select Patient Sex.', 'error');
      document.getElementById('input-patient-sex').focus();
      return;
    }

    const rows = document.querySelectorAll('.line-item-card');
    const items = [];
    rows.forEach(r => {
      const prod = r.querySelector('.item-product')?.value || '';
      const plan = r.querySelector('.item-plan')?.value || '';
      const qty = parseInt(r.querySelector('.item-qty')?.value, 10) || 1;
      const arch = r.querySelector('.item-arch')?.value || '';
      const teeth = r.querySelector('.item-teeth')?.value.trim() || '';
      const shade = getRowShadeValue(r);
      const note = r.querySelector('.item-note')?.value.trim() || '';

      if (prod) {
        items.push({
          product: prod,
          plan,
          qty,
          arch: arch || '',
          toothNumbers: teeth || (arch ? arch : ''),
          shade: shade || '',
          lineNote: note
        });
      }
    });

    if (!items.length) {
      showToast('At least 1 fabrication work item is required.', 'error');
      return;
    }

    btnSubmit.disabled = true;
    btnSubmit.innerHTML = '<i data-lucide="loader-2" class="lucide-spin"></i><span>Enrolling Case...</span>'; if (window.refreshIcons) window.refreshIcons();

    try {
      const fd = new FormData();
      fd.append('clinicId', selectedClinic.id);
      fd.append('clinicName', selectedClinic.clinicName);
      fd.append('primaryDoctorName', selectedClinic.primaryDoctorName);
      fd.append('clinicPhone', selectedClinic.phone || '');
      fd.append('clinicCity', selectedClinic.city || 'Nagpur');

      fd.append('patientName', patientName);
      fd.append('patientAge', patientAge);
      fd.append('patientSex', patientSex);
      fd.append('consultantDoctor', document.getElementById('input-consultant-doctor').value.trim());
      fd.append('consultantPhone', document.getElementById('input-consultant-phone').value.trim());

      fd.append('items', JSON.stringify(items));
      fd.append('clinicalNotes', document.getElementById('input-clinical-notes').value.trim());

      fd.append('techName', (window.currentUser && window.currentUser.role === 'tech') ? window.currentUser.fullName : (document.getElementById('input-tech-name')?.value || window.currentUser?.fullName || 'Field Scan Tech'));
      fd.append('scannerModel', document.getElementById('input-scanner-model')?.value || 'Intraoral Scanner');
      fd.append('scanLink', document.getElementById('input-scan-link')?.value?.trim() || '');

      uploadedPhotos.forEach(p => fd.append('photos', p));

      const res = await fetch('/api/orders', { method: 'POST', body: fd });
      const result = await res.json();

      if (result.success && result.order) {
        showToast('Case successfully enrolled with 48-Hour delivery deadline!', 'success');
        showSuccessModal(result.order);
      } else {
        showToast(result.error || 'Failed to enroll case', 'error');
      }
    } catch (err) {
      showToast('Network error: ' + err.message, 'error');
    } finally {
      btnSubmit.disabled = false;
      btnSubmit.innerHTML = '<i data-lucide="send"></i><span>Enroll Case (Start 48h Timer)</span>'; if (window.refreshIcons) window.refreshIcons();
    }
  });
}

function showSuccessModal(order) {
  const modal = document.getElementById('order-success-modal');
  if (!modal) return;

  document.getElementById('success-order-id').textContent = order.orderId;
  document.getElementById('success-patient-name').textContent = order.patientName;
  document.getElementById('success-clinic-doc').textContent = `${order.clinicName} • ${order.primaryDoctorName}`;

  const deadlineStr = new Date(order.deliveryDeadline).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
  });
  document.getElementById('success-deadline-text').textContent = `Promised 48h Delivery Deadline: ${deadlineStr}`;

  // Generate 1-click Billing System text
  try {
    let orderItems = [];
    try { orderItems = JSON.parse(order.items || '[]'); } catch (e) {}
    const billingText = generateBillingText({
      patientName: order.patientName,
      patientAge: order.patientAge,
      patientSex: order.patientSex,
      clinicName: order.clinicName,
      primaryDoctorName: order.primaryDoctorName,
      consultantDoctor: order.consultantDoctor,
      consultantPhone: order.consultantPhone,
      clinicPhone: order.clinicPhone,
      clinicCity: order.clinicCity,
      fullAddress: selectedClinic?.fullAddress || '',
      pinCode: selectedClinic?.pinCode || '',
      clinicalNotes: order.clinicalNotes,
      items: orderItems
    });

    const previewEl = document.getElementById('billing-text-preview');
    if (previewEl) previewEl.textContent = billingText;

    const btnCopy = document.getElementById('btn-copy-billing-success');
    if (btnCopy) {
      btnCopy.onclick = () => copyBillingTextToClipboard(billingText);
    }
  } catch (err) {
    console.warn('Billing text gen err:', err);
  }

  const cleanPhone = (order.clinicPhone || '').replace(/\D/g, '');
  const waMsg = encodeURIComponent(
`*HESYRA LABS - 48-HOUR CROWN & ALIGNER SCAN ENROLLMENT*
---------------------------------------
*Order ID:* ${order.orderId}
*Clinic:* ${order.clinicName}
*Doctor:* ${order.primaryDoctorName}
*Patient:* ${order.patientName} (${order.patientAge}y / ${order.patientSex})
*Case:* ${order.primaryProduct} (${order.totalUnits} Units)
*Plan:* ${order.primaryPlan || 'Standard'}
*Spec/Arch:* ${order.toothNumbers || 'As marked'} ${order.shade ? `| Shade: ${order.shade}` : ''}
*Scan Time:* ${new Date(order.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
*Promised Delivery Deadline:* ${deadlineStr} (Within 48 Hours)
*Field Tech:* ${order.techName}
---------------------------------------
Your case has entered the central CAD/Milling queue.`
  );

  const waBtn = document.getElementById('btn-whatsapp-share');
  if (waBtn) {
    waBtn.href = cleanPhone.length >= 10 ? `https://wa.me/91${cleanPhone.slice(-10)}?text=${waMsg}` : `https://wa.me/?text=${waMsg}`;
  }

  modal.classList.add('open');
  if (window.refreshIcons) window.refreshIcons();
}

window.resetFormForNextCase = function() {
  document.getElementById('input-patient-name').value = '';
  document.getElementById('input-patient-age').value = '';
  document.getElementById('input-consultant-doctor').value = '';
  document.getElementById('input-consultant-phone').value = '';
  document.getElementById('input-clinical-notes').value = '';
  document.getElementById('input-scan-link').value = '';

  uploadedPhotos = [];
  renderPhotoPreviews();

  const container = document.getElementById('line-items-container');
  if (container) {
    container.innerHTML = '';
    itemCounter = 0;
    addLineItem();
  }

  document.getElementById('order-success-modal')?.classList.remove('open');
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

window.initFieldForm = initFieldForm;


/**
 * 5. SMART BILLING INTAKE EXPORT & CLIPBOARD
 * Formats details into exact pattern expected by Hesyra Billing System's Smart WhatsApp & Order Intake
 */
function generateBillingText(data) {
  const lines = [];

  // 1. Patient: Name, AgeSex
  const pName = (data.patientName || '').trim();
  const pAge = (data.patientAge || '').toString().trim();
  const pSex = (data.patientSex || '').toString().trim().toUpperCase();
  const sexChar = pSex.startsWith('F') ? 'F' : (pSex.startsWith('M') ? 'M' : '');
  const ageSex = (pAge && sexChar) ? `${pAge}${sexChar}` : (pAge || sexChar || '');
  if (pName) {
    lines.push(`Patient: ${pName}${ageSex ? `, ${ageSex}` : ''}`);
  }

  // 2. Clinic
  const clinic = (data.clinicName || '').trim();
  if (clinic) {
    lines.push(`Clinic: ${clinic}`);
  }

  // 3. Doctor & Consultant
  const doctor = (data.primaryDoctorName || '').trim();
  const consultant = (data.consultantDoctor || '').trim();
  if (doctor) {
    lines.push(`Doctor: ${doctor.toLowerCase().startsWith('dr') ? doctor : `Dr. ${doctor}`}`);
  }
  if (consultant) {
    lines.push(`Consultant: ${consultant.toLowerCase().startsWith('dr') ? consultant : `Dr. ${consultant}`}`);
  }

  // 4. Line Items
  const items = Array.isArray(data.items) ? data.items : [];
  items.forEach(it => {
    const prod = (it.product || '').trim();
    let plan = (it.plan || '').trim();
    if (plan.includes('—')) {
      plan = plan.split('—')[0].trim();
    }
    const qty = parseInt(it.qty, 10) || 1;
    const arch = (it.arch || '').trim();
    const teeth = (it.toothNumbers || '').trim();
    const shade = (it.shade || '').trim();

    const isAligner = prod.toLowerCase().includes('aligner') || prod.toLowerCase().includes('smartalign');
    if (isAligner) {
      lines.push(`Aligners: ${qty} trays (${plan || 'Flexi Relapse'})`);
      if (arch) {
        lines.push(`Arch: ${arch}`);
      }
    } else {
      lines.push(`Crown: ${prod} (${plan || 'Zirconia'})`);
      lines.push(`Qty: ${qty}`);
      if (teeth && teeth !== arch) {
        lines.push(`Tooth: ${teeth}`);
      }
      if (shade) {
        lines.push(`Shade: ${shade}`);
      }
    }
  });

  // 5. Mobile
  const phone = (data.consultantPhone || data.clinicPhone || '').trim();
  if (phone) {
    lines.push(`Mobile: ${phone}`);
  }

  // 6. Address
  const addrParts = [];
  if (data.fullAddress) addrParts.push(data.fullAddress.trim());
  if (data.clinicCity) addrParts.push(data.clinicCity.trim());
  if (data.pinCode) addrParts.push(data.pinCode.trim());
  const cleanAddr = addrParts.join(', ');
  if (cleanAddr) {
    lines.push(`Address: ${cleanAddr}`);
  }

  // 7. Notes
  const notes = (data.clinicalNotes || '').trim();
  if (notes) {
    lines.push(`Notes: ${notes}`);
  }

  return lines.join('\n');
}

function getFormDataForBilling() {
  const rows = document.querySelectorAll('.line-item-card');
  const items = [];
  rows.forEach(r => {
    const prod = r.querySelector('.item-product')?.value || '';
    const plan = r.querySelector('.item-plan')?.value || '';
    const qty = parseInt(r.querySelector('.item-qty')?.value, 10) || 1;
    const arch = r.querySelector('.item-arch')?.value || '';
    const teeth = r.querySelector('.item-teeth')?.value.trim() || '';
    const shade = getRowShadeValue(r);
    const note = r.querySelector('.item-note')?.value.trim() || '';

    if (prod) {
      items.push({
        product: prod,
        plan,
        qty,
        arch,
        toothNumbers: teeth,
        shade,
        lineNote: note
      });
    }
  });

  return {
    patientName: document.getElementById('input-patient-name')?.value || '',
    patientAge: document.getElementById('input-patient-age')?.value || '',
    patientSex: document.getElementById('input-patient-sex')?.value || '',
    clinicName: selectedClinic?.clinicName || '',
    primaryDoctorName: selectedClinic?.primaryDoctorName || '',
    clinicPhone: selectedClinic?.phone || '',
    clinicCity: selectedClinic?.city || 'Nagpur',
    fullAddress: selectedClinic?.fullAddress || '',
    pinCode: selectedClinic?.pinCode || '',
    consultantDoctor: document.getElementById('input-consultant-doctor')?.value || '',
    consultantPhone: document.getElementById('input-consultant-phone')?.value || '',
    clinicalNotes: document.getElementById('input-clinical-notes')?.value || '',
    items
  };
}

window.copyBillingTextToClipboard = async function(customText) {
  let text = customText;
  if (!text) {
    const data = getFormDataForBilling();
    if (!data.patientName && !selectedClinic) {
      showToast('Please fill in patient details first', 'warning');
      return;
    }
    text = generateBillingText(data);
  }

  try {
    await navigator.clipboard.writeText(text);
  } catch (err) {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }

  showToast('Copied for Billing System! Ready to 1-click paste.', 'success');

  const modal = document.getElementById('billing-copy-modal');
  const preview = document.getElementById('modal-billing-text-content');
  if (modal && preview) {
    preview.textContent = text;
    modal.classList.add('open');
  if (window.refreshIcons) window.refreshIcons();
  }
};

window.generateBillingText = generateBillingText;
