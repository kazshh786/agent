/**
 * KS Studio - Yes-Ladder Persistent JSON-State Engine (Material Design 3 Dialogue Integrated)
 */
const YesLadder = {
  storageKey: 'ks_studio_ladder_state',
  
  // Default state structure
  state: {
    ladderNodes: {
      frictionChecked: false,   // Home: Acknowledges diary friction
      valueChecked: false,      // Rates: Agrees to Value Stack pricing
      qualityChecked: false,    // Case Studies: Agrees that quality protects budget
      qualifiedChecked: false,  // Wizard: Qualifications complete
      bookingChecked: false     // Booking: Has selected slot/submitted RFP
    },
    clientInfo: {
      name: '',
      email: '',
      company: '',
      projectType: '',
      budget: '',
      timeline: '',
      selectedDate: '',
      selectedTime: ''
    },
    progressPercent: 0
  },

  // Initialize and load from local storage
  init() {
    const saved = localStorage.getItem(this.storageKey);
    if (saved) {
      try {
        this.state = JSON.parse(saved);
      } catch (e) {
        console.error('Error parsing ladder state, resetting', e);
        this.save();
      }
    }
    this.calculateProgress();
    this.renderHUD();
  },

  // Save current state to local storage
  save() {
    localStorage.setItem(this.storageKey, JSON.stringify(this.state));
  },

  // Update a specific node state
  setNode(nodeName, value) {
    if (nodeName in this.state.ladderNodes) {
      this.state.ladderNodes[nodeName] = !!value;
      this.calculateProgress();
      this.save();
      this.renderHUD();
      
      // Dispatch custom event so pages can react to state changes
      window.dispatchEvent(new CustomEvent('ladderStateChange', { detail: this.state }));
    }
  },

  // Update client info
  updateClientInfo(info) {
    this.state.clientInfo = { ...this.state.clientInfo, ...info };
    this.save();
  },

  // Calculate the completion percentage of the Yes-Ladder
  calculateProgress() {
    const nodes = Object.values(this.state.ladderNodes);
    const completedCount = nodes.filter(Boolean).length;
    this.state.progressPercent = Math.round((completedCount / nodes.length) * 100);
  },

  // Reset the state engine
  reset() {
    localStorage.removeItem(this.storageKey);
    window.location.reload();
  },

  // Spawns and shows a premium Material Design 3 Dialog alert
  showM3Alert(headline, message, actionText = 'Close', callback = null) {
    let dialog = document.getElementById('global-m3-dialog');
    if (!dialog) {
      dialog = document.createElement('md-dialog');
      dialog.id = 'global-m3-dialog';
      document.body.appendChild(dialog);
    }
    
    dialog.innerHTML = `
      <div slot="headline">${headline}</div>
      <form slot="content" method="dialog" style="color: var(--color-secondary); font-family: var(--font-sans); font-size: var(--font-size-base);">
        <p>${message}</p>
      </form>
      <div slot="actions">
        <md-filled-button form="global-m3-dialog" value="close" id="btn-dialog-close">${actionText}</md-filled-button>
      </div>
    `;

    // Ensure dialog close callback works
    const closeBtn = dialog.querySelector('#btn-dialog-close');
    closeBtn.addEventListener('click', () => {
      dialog.close();
      if (callback) callback();
    });

    dialog.show();
  },

  // Render the floating Progress HUD for conversion tracking
  renderHUD() {
    let hud = document.getElementById('ladder-hud-widget');
    if (!hud) {
      hud = document.createElement('div');
      hud.id = 'ladder-hud-widget';
      hud.className = 'ladder-hud';
      document.body.appendChild(hud);
    }

    const currentStepIndex = Object.values(this.state.ladderNodes).filter(Boolean).length;
    let nextMilestone = "Acknowledge Friction";
    if (!this.state.ladderNodes.frictionChecked) {
      nextMilestone = "Acknowledge Friction";
    } else if (!this.state.ladderNodes.valueChecked) {
      nextMilestone = "Confirm Value Stack";
    } else if (!this.state.ladderNodes.qualityChecked) {
      nextMilestone = "Verify Production Quality";
    } else if (!this.state.ladderNodes.qualifiedChecked) {
      nextMilestone = "Complete Qualification";
    } else if (!this.state.ladderNodes.bookingChecked) {
      nextMilestone = "Confirm Booking/RFP";
    } else {
      nextMilestone = "Pipeline Secured ✓";
    }

    hud.innerHTML = `
      <div class="hud-title">Yes-Ladder Pipeline: ${this.state.progressPercent}%</div>
      <div class="hud-bar-container">
        <div class="hud-bar" style="width: ${this.state.progressPercent}%"></div>
      </div>
      <div class="hud-desc">Next: <strong>${nextMilestone}</strong></div>
      <a href="#" style="font-size: 9px; color: var(--color-muted); text-align: right; text-decoration: underline;" onclick="event.preventDefault(); YesLadder.reset();">Reset Path</a>
    `;
  }
};

// Initialize on page load and export globally
document.addEventListener('DOMContentLoaded', () => {
  YesLadder.init();
});
window.YesLadder = YesLadder;
