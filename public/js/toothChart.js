/**
 * Interactive FDI Dental Tooth Chart Component
 * Quadrants:
 * Q1: Upper Right (18 to 11)
 * Q2: Upper Left  (21 to 28)
 * Q4: Lower Right (48 to 41)
 * Q3: Lower Left  (31 to 38)
 */
class ToothChart {
  constructor(containerId, options = {}) {
    this.container = document.getElementById(containerId);
    this.selectedTeeth = new Set();
    this.onSelectionChange = options.onSelectionChange || (() => {});
    this.init();
  }

  init() {
    if (!this.container) return;
    this.render();
  }

  getTeeth() {
    return Array.from(this.selectedTeeth).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
  }

  setTeeth(teethArr) {
    this.selectedTeeth.clear();
    if (Array.isArray(teethArr)) {
      teethArr.forEach(t => this.selectedTeeth.add(String(t).trim()));
    }
    this.updateUI();
    this.onSelectionChange(this.getTeeth());
  }

  toggleTooth(toothNum) {
    const t = String(toothNum);
    if (this.selectedTeeth.has(t)) {
      this.selectedTeeth.delete(t);
    } else {
      this.selectedTeeth.add(t);
    }
    this.updateUI();
    this.onSelectionChange(this.getTeeth());
  }

  clear() {
    this.selectedTeeth.clear();
    this.updateUI();
    this.onSelectionChange(this.getTeeth());
  }

  selectArch(arch) {
    const upperTeeth = ['18','17','16','15','14','13','12','11','21','22','23','24','25','26','27','28'];
    const lowerTeeth = ['48','47','46','45','44','43','42','41','31','32','33','34','35','36','37','38'];

    const target = arch === 'upper' ? upperTeeth : lowerTeeth;
    const allSelected = target.every(t => this.selectedTeeth.has(t));

    target.forEach(t => {
      if (allSelected) this.selectedTeeth.delete(t);
      else this.selectedTeeth.add(t);
    });

    this.updateUI();
    this.onSelectionChange(this.getTeeth());
  }

  render() {
    const q1 = ['18','17','16','15','14','13','12','11'];
    const q2 = ['21','22','23','24','25','26','27','28'];
    const q4 = ['48','47','46','45','44','43','42','41'];
    const q3 = ['31','32','33','34','35','36','37','38'];

    const renderToothBtn = (num) => `
      <button type="button" class="tooth-btn" data-tooth="${num}" id="tooth-btn-${num}">
        <span class="tooth-icon">🦷</span>
        <span>${num}</span>
      </button>
    `;

    this.container.innerHTML = `
      <div class="tooth-chart-card">
        <div class="chart-header">
          <div class="chart-title">
            <span>🦷 Interactive Tooth Selector (FDI)</span>
            <span class="chart-badge" id="chart-units-count">0 Units</span>
          </div>
          <div class="chart-actions">
            <button type="button" class="btn-chart-util" id="btn-chart-upper">Upper Jaw</button>
            <button type="button" class="btn-chart-util" id="btn-chart-lower">Lower Jaw</button>
            <button type="button" class="btn-chart-util" id="btn-chart-clear">Clear</button>
          </div>
        </div>

        <!-- Upper Arch (Maxilla) -->
        <div class="dental-arch">
          <div class="arch-label">Upper Jaw (Maxilla)</div>
          <div class="quadrant-row">
            <div class="quadrant-group" id="quad-1">
              ${q1.map(renderToothBtn).join('')}
            </div>
            <div class="quadrant-group" id="quad-2">
              ${q2.map(renderToothBtn).join('')}
            </div>
          </div>
        </div>

        <!-- Lower Arch (Mandible) -->
        <div class="dental-arch">
          <div class="arch-label">Lower Jaw (Mandible)</div>
          <div class="quadrant-row">
            <div class="quadrant-group" id="quad-4">
              ${q4.map(renderToothBtn).join('')}
            </div>
            <div class="quadrant-group" id="quad-3">
              ${q3.map(renderToothBtn).join('')}
            </div>
          </div>
        </div>

        <!-- Summary bar of selected teeth -->
        <div class="selected-summary-bar">
          <span style="font-weight: 600; color: var(--text-muted);">Selected Teeth:</span>
          <div class="selected-teeth-tags" id="selected-teeth-tags">
            <span style="color: var(--text-subtle); font-style: italic;">Tap teeth on diagram above</span>
          </div>
        </div>
      </div>
    `;

    // Bind event listeners
    this.container.querySelectorAll('.tooth-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const tooth = btn.getAttribute('data-tooth');
        this.toggleTooth(tooth);
      });
    });

    document.getElementById('btn-chart-clear')?.addEventListener('click', () => this.clear());
    document.getElementById('btn-chart-upper')?.addEventListener('click', () => this.selectArch('upper'));
    document.getElementById('btn-chart-lower')?.addEventListener('click', () => this.selectArch('lower'));
  }

  updateUI() {
    const teeth = this.getTeeth();

    // Update buttons active class
    this.container.querySelectorAll('.tooth-btn').forEach(btn => {
      const t = btn.getAttribute('data-tooth');
      if (this.selectedTeeth.has(t)) {
        btn.classList.add('selected');
      } else {
        btn.classList.remove('selected');
      }
    });

    // Update units badge
    const badge = document.getElementById('chart-units-count');
    if (badge) {
      badge.textContent = `${teeth.length} Unit${teeth.length === 1 ? '' : 's'}`;
    }

    // Update summary tags
    const tagsContainer = document.getElementById('selected-teeth-tags');
    if (tagsContainer) {
      if (teeth.length === 0) {
        tagsContainer.innerHTML = `<span style="color: var(--text-subtle); font-style: italic;">Tap teeth on diagram above</span>`;
      } else {
        tagsContainer.innerHTML = teeth.map(t => `<span class="tooth-tag">#${t}</span>`).join('');
      }
    }
  }
}

window.ToothChart = ToothChart;
