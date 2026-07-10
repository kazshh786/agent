/**
 * KS Studio - High-Conversion State & Interactive Script Engine
 */

// --- 1. YES-LADDER PERSISTENT STATE ENGINE ---
const YesLadder = {
  storageKey: 'ks_studio_ladder_state',
  
  state: {
    ladderNodes: {
      frictionChecked: false,   // Step 1: Acknowledges diary scheduling friction
      valueChecked: false,      // Step 2: Prefers Value Stacks over hourly rates
      qualifiedChecked: false,  // Step 3: Brief has been pre-qualified
      bookingChecked: false     // Step 4: Session locked in live calendar
    },
    clientInfo: {
      name: '',
      email: '',
      company: '',
      projectType: '',
      studioPreference: '',
      budget: '',
      timeline: '',
      productionBrief: '',
      selectedDate: '',
      selectedTime: ''
    },
    progressPercent: 0
  },

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

  save() {
    localStorage.setItem(this.storageKey, JSON.stringify(this.state));
  },

  setNode(nodeName, value) {
    if (nodeName in this.state.ladderNodes) {
      this.state.ladderNodes[nodeName] = !!value;
      this.calculateProgress();
      this.save();
      this.renderHUD();
      
      // Dispatch event for page reaction
      window.dispatchEvent(new CustomEvent('ladderStateChange', { detail: this.state }));
    }
  },

  updateClientInfo(info) {
    this.state.clientInfo = { ...this.state.clientInfo, ...info };
    this.save();
  },

  calculateProgress() {
    const nodes = Object.values(this.state.ladderNodes);
    const completedCount = nodes.filter(Boolean).length;
    this.state.progressPercent = Math.round((completedCount / nodes.length) * 100);
  },

  reset() {
    localStorage.removeItem(this.storageKey);
    window.location.reload();
  },

  showM3Alert(headline, message, actionText = 'Close', callback = null) {
    let dialog = document.getElementById('global-m3-dialog');
    if (!dialog) {
      dialog = document.createElement('md-dialog');
      dialog.id = 'global-m3-dialog';
      document.body.appendChild(dialog);
    }
    
    dialog.innerHTML = `
      <div slot="headline" style="font-family: var(--font-display);">${headline}</div>
      <form slot="content" method="dialog" style="color: var(--color-secondary); font-family: var(--font-sans); font-size: var(--font-size-base);">
        <p style="margin-bottom: 0; line-height: 1.6;">${message}</p>
      </form>
      <div slot="actions">
        <md-filled-button form="global-m3-dialog" value="close" id="btn-dialog-close">${actionText}</md-filled-button>
      </div>
    `;

    const closeBtn = dialog.querySelector('#btn-dialog-close');
    closeBtn.addEventListener('click', () => {
      dialog.close();
      if (callback) callback();
    });

    dialog.show();
  },

  renderHUD() {
    let hud = document.getElementById('ladder-hud-widget');
    if (!hud) {
      hud = document.createElement('div');
      hud.id = 'ladder-hud-widget';
      hud.className = 'ladder-hud';
      document.body.appendChild(hud);
    }

    let nextMilestone = "Acknowledge Friction";
    if (!this.state.ladderNodes.frictionChecked) {
      nextMilestone = "Confirm Studio Needs";
    } else if (!this.state.ladderNodes.valueChecked) {
      nextMilestone = "Agree Price Certainty";
    } else if (!this.state.ladderNodes.qualifiedChecked) {
      nextMilestone = "Qualify Campaign Brief";
    } else if (!this.state.ladderNodes.bookingChecked) {
      nextMilestone = "Lock Live Calendar Slot";
    } else {
      nextMilestone = "Booking Confirmed ✓";
    }

    hud.innerHTML = `
      <div class="hud-title">Yes-Ladder Progress: ${this.state.progressPercent}%</div>
      <div class="hud-bar-container">
        <div class="hud-bar" style="width: ${this.state.progressPercent}%"></div>
      </div>
      <div class="hud-desc">Next: <strong>${nextMilestone}</strong></div>
      <a href="#" style="font-size: 9px; color: var(--color-muted); text-align: right; text-decoration: underline;" onclick="event.preventDefault(); YesLadder.reset();">Reset Journey</a>
    `;
  }
};

// --- 2. NAVIGATION HANDLERS ---
function setupNavigation() {
  const toggle = document.querySelector('.nav-toggle');
  const menu = document.querySelector('.m3-nav-wrapper');
  
  if (toggle && menu) {
    toggle.addEventListener('click', () => {
      menu.classList.toggle('active');
      const expanded = menu.classList.contains('active');
      toggle.setAttribute('aria-expanded', expanded);
    });
  }

  // Smooth hash change handling
  const links = document.querySelectorAll('md-text-button[href]');
  links.forEach(link => {
    link.addEventListener('click', () => {
      if (menu && menu.classList.contains('active')) {
        menu.classList.remove('active');
        if (toggle) toggle.setAttribute('aria-expanded', 'false');
      }
    });
  });
}

// --- 3. SERVICES ACCORDION INTERACTION ---
function selectAccordion(index) {
  const items = document.querySelectorAll('.accordion-service-item');
  const images = document.querySelectorAll('.services-image');
  
  items.forEach((item, idx) => {
    if (idx + 1 === index) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });

  images.forEach((img, idx) => {
    if (idx + 1 === index) {
      img.classList.add('active');
    } else {
      img.classList.remove('active');
    }
  });
}

// --- 4. TESTIMONIALS SNAP SLIDER CONTROLLER ---
function scrollTestimonials(direction) {
  const track = document.getElementById('testimonial-slider-track');
  if (!track) return;
  
  const cardWidth = track.firstElementChild.getBoundingClientRect().width;
  const gap = 24; // matches style.css var(--space-3)
  const scrollAmount = (cardWidth + gap) * direction;
  
  track.scrollBy({ left: scrollAmount, behavior: 'smooth' });
}

function updateSliderDots() {
  const track = document.getElementById('testimonial-slider-track');
  const dots = document.querySelectorAll('#slider-dots-container .slider-dot');
  if (!track || dots.length === 0) return;
  
  const scrollLeft = track.scrollLeft;
  const cardWidth = track.firstElementChild.getBoundingClientRect().width + 24;
  const activeIndex = Math.round(scrollLeft / cardWidth);
  
  dots.forEach((dot, idx) => {
    if (idx === activeIndex) {
      dot.classList.add('active');
    } else {
      dot.classList.remove('active');
    }
  });
}

function scrollToSlide(index) {
  const track = document.getElementById('testimonial-slider-track');
  if (!track) return;
  
  const cardWidth = track.firstElementChild.getBoundingClientRect().width + 24;
  track.scrollTo({ left: cardWidth * index, behavior: 'smooth' });
}

// --- 5. LEAD QUALIFICATION WIZARD ---
let currentWizardStep = 1;
const totalWizardSteps = 3;

function setupWizard() {
  const form = document.getElementById('qualification-form');
  if (!form) return;

  showWizardStep(currentWizardStep);
  loadSavedWizardData();

  const prevBtn = document.getElementById('btn-prev');
  const nextBtn = document.getElementById('btn-next');

  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      if (currentWizardStep > 1) {
        currentWizardStep--;
        showWizardStep(currentWizardStep);
      }
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      if (validateWizardStep(currentWizardStep)) {
        saveWizardStepData(currentWizardStep);
        
        if (currentWizardStep < totalWizardSteps) {
          currentWizardStep++;
          showWizardStep(currentWizardStep);
        } else {
          submitWizardBrief();
        }
      }
    });
  }
}

function showWizardStep(stepNum) {
  const steps = document.querySelectorAll('.wizard-step');
  const nodes = document.querySelectorAll('.wizard-step-node');
  const progressFill = document.querySelector('.wizard-progress-fill');

  steps.forEach(step => step.classList.remove('active'));
  const currentStepEl = document.getElementById(`step-${stepNum}`);
  if (currentStepEl) currentStepEl.classList.add('active');

  nodes.forEach((node, idx) => {
    const nodeStep = idx + 1;
    node.classList.remove('active', 'completed');
    if (nodeStep === stepNum) {
      node.classList.add('active');
    } else if (nodeStep < stepNum) {
      node.classList.add('completed');
    }
  });

  if (progressFill) {
    const percent = ((stepNum - 1) / (totalWizardSteps - 1)) * 100;
    progressFill.style.width = `${percent}%`;
  }

  const prevBtn = document.getElementById('btn-prev');
  const nextBtn = document.getElementById('btn-next');

  if (prevBtn) {
    prevBtn.style.visibility = (stepNum === 1) ? 'hidden' : 'visible';
  }

  if (nextBtn) {
    nextBtn.innerHTML = (stepNum === totalWizardSteps) ? 'Submit Production Brief' : 'Continue';
  }
}

function validateWizardStep(stepNum) {
  const stepEl = document.getElementById(`step-${stepNum}`);
  if (!stepEl) return true;

  const inputs = stepEl.querySelectorAll('md-outlined-text-field, md-outlined-select');
  let valid = true;

  inputs.forEach(input => {
    if (input.hasAttribute('required') && !input.value.trim()) {
      valid = false;
      input.setAttribute('error', 'true');
      input.setAttribute('error-text', 'This field is required');
      
      setTimeout(() => {
        input.removeAttribute('error');
        input.removeAttribute('error-text');
      }, 4000);
    }
  });

  // Custom MD3 Constraint: Budget Warning (Loss Aversion)
  if (stepNum === 2) {
    const budgetSelect = document.getElementById('budget');
    if (budgetSelect && budgetSelect.value === 'under_3k') {
      YesLadder.showM3Alert(
        "⚠️ High-Production Standard Warning",
        "KS Studio specializes in premium commercial work. Our baseline stack rates start at £1,200/half-day. Booking lower-end sessions runs the risk of missing critical gear configurations or setups required for a professional campaign standard."
      );
    }
  }

  return valid;
}

function saveWizardStepData(stepNum) {
  const stepEl = document.getElementById(`step-${stepNum}`);
  if (!stepEl) return;

  const inputs = stepEl.querySelectorAll('md-outlined-text-field, md-outlined-select');
  const data = {};
  inputs.forEach(input => {
    data[input.id] = input.value;
  });
  YesLadder.updateClientInfo(data);
}

function loadSavedWizardData() {
  const info = YesLadder.state.clientInfo;
  Object.keys(info).forEach(key => {
    const el = document.getElementById(key);
    if (el && info[key]) {
      el.value = info[key];
    }
  });
}

function submitWizardBrief() {
  YesLadder.setNode('qualifiedChecked', true);
  
  // Update diary warning banner
  updateDiaryWarningState();

  YesLadder.showM3Alert(
    "Campaign Profile Pre-Qualified ✓",
    "Your production metrics match our creative layout criteria. You are now authorized to secure session slots in our live calendar grid.",
    "Go to Calendar",
    () => {
      document.getElementById('diary').scrollIntoView({ behavior: 'smooth' });
    }
  );
}

// --- 6. LIVE BOOKING CALENDAR ---
class StudioCalendar {
  constructor(daysGridId, detailsBoxId) {
    this.daysGrid = document.getElementById(daysGridId);
    this.detailsBox = document.getElementById(detailsBoxId);
    
    this.currentDate = new Date();
    this.selectedDate = null;
    this.selectedTime = null;

    // Hardcoded booked dates for calendar simulation (10th, 14th, 22nd of current month)
    this.bookedDays = [10, 14, 22];

    this.init();
  }

  init() {
    this.render();
    setupCalendarNav(this);
    setupTimeSlots(this);
  }

  render() {
    if (!this.daysGrid) return;
    
    // Clear previous calendar days
    const dayNames = this.daysGrid.querySelectorAll('.day-name');
    this.daysGrid.innerHTML = '';
    dayNames.forEach(dn => this.daysGrid.appendChild(dn));

    const year = this.currentDate.getFullYear();
    const month = this.currentDate.getMonth();

    // Set month heading
    const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const monthHeading = document.getElementById('calendar-month-year');
    if (monthHeading) {
      monthHeading.innerHTML = `${months[month]} ${year}`;
    }

    // Get calendar offsets
    const firstDayIndex = new Date(year, month, 1).getDay(); // Sun is 0
    const adjustedFirstDayIndex = (firstDayIndex === 0) ? 6 : firstDayIndex - 1; // Mon is 0
    const totalDays = new Date(year, month + 1, 0).getDate();

    // Empty nodes for offset days
    for (let i = 0; i < adjustedFirstDayIndex; i++) {
      const emptyDiv = document.createElement('div');
      emptyDiv.className = 'calendar-day day-disabled';
      this.daysGrid.appendChild(emptyDiv);
    }

    const today = new Date();

    // Render calendar days
    for (let day = 1; day <= totalDays; day++) {
      const dayEl = document.createElement('div');
      dayEl.className = 'calendar-day';
      dayEl.innerText = day;

      const cellDate = new Date(year, month, day);
      
      // Past days disabled
      if (cellDate < new Date(today.getFullYear(), today.getMonth(), today.getDate())) {
        dayEl.classList.add('day-disabled');
      } 
      // Booked slots simulation
      else if (this.bookedDays.includes(day) && month === today.getMonth()) {
        dayEl.classList.add('day-booked');
        dayEl.title = "Fully Booked";
      } 
      // Active selectable days
      else {
        dayEl.addEventListener('click', () => this.selectDay(day, dayEl));
        
        // Restore active selection highlight on render
        if (this.selectedDate && 
            this.selectedDate.getDate() === day && 
            this.selectedDate.getMonth() === month && 
            this.selectedDate.getFullYear() === year) {
          dayEl.classList.add('day-selected');
        }
      }

      this.daysGrid.appendChild(dayEl);
    }
  }

  selectDay(day, element) {
    const active = this.daysGrid.querySelector('.day-selected');
    if (active) active.classList.remove('day-selected');

    element.classList.add('day-selected');
    this.selectedDate = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth(), day);
    
    this.updateSummaryUI();
  }

  selectTime(timeStr, btnElement) {
    this.selectedTime = timeStr;
    
    // Toggle active state visual styling
    const btns = document.querySelectorAll('.time-slots md-outlined-button');
    btns.forEach(btn => {
      btn.removeAttribute('style');
    });
    btnElement.setAttribute('style', '--md-outlined-button-outline-color: var(--color-accent); --md-outlined-button-label-text-color: var(--color-accent); font-weight: 700;');

    this.updateSummaryUI();
  }

  updateSummaryUI() {
    const dateStrEl = document.getElementById('selected-date-str');
    const timeStrEl = document.getElementById('selected-time-str');
    const secureBtn = document.getElementById('btn-secure-booking');

    if (dateStrEl && this.selectedDate) {
      const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
      dateStrEl.innerHTML = this.selectedDate.toLocaleDateString('en-GB', options);
    }

    if (timeStrEl && this.selectedTime) {
      timeStrEl.innerHTML = this.selectedTime;
    }

    if (secureBtn) {
      if (this.selectedDate && this.selectedTime) {
        secureBtn.removeAttribute('disabled');
      } else {
        secureBtn.setAttribute('disabled', 'true');
      }
    }
  }

  getSelectedDateString() {
    if (!this.selectedDate) return '';
    return this.selectedDate.toLocaleDateString('en-GB', { year: 'numeric', month: '2-digit', day: '2-digit' });
  }

  changeMonth(direction) {
    this.currentDate.setMonth(this.currentDate.getMonth() + direction);
    this.render();
  }
}

function setupCalendarNav(calendarInstance) {
  const prevBtn = document.getElementById('btn-prev-month');
  const nextBtn = document.getElementById('btn-next-month');

  if (prevBtn) {
    prevBtn.addEventListener('click', () => calendarInstance.changeMonth(-1));
  }
  if (nextBtn) {
    nextBtn.addEventListener('click', () => calendarInstance.changeMonth(1));
  }
}

function setupTimeSlots(calendarInstance) {
  const slotAm = document.getElementById('slot-am');
  const slotPm = document.getElementById('slot-pm');
  const slotFull = document.getElementById('slot-full');

  if (slotAm) {
    slotAm.addEventListener('click', () => calendarInstance.selectTime('09:00 - 13:00 (AM Half-Day)', slotAm));
  }
  if (slotPm) {
    slotPm.addEventListener('click', () => calendarInstance.selectTime('13:00 - 17:00 (PM Half-Day)', slotPm));
  }
  if (slotFull) {
    slotFull.addEventListener('click', () => calendarInstance.selectTime('09:00 - 18:00 (Full-Day Buyout)', slotFull));
  }
}

function updateDiaryWarningState() {
  const warningEl = document.getElementById('diary-warning');
  if (!warningEl) return;

  const isQualified = YesLadder.state.ladderNodes.qualifiedChecked;

  if (isQualified) {
    warningEl.innerHTML = `
      <div class="loss-aversion-title" style="color: var(--color-success);">✓ Brief Pre-Qualified</div>
      <p class="loss-aversion-desc">Your briefing profile is stored. Selected dates will be permanently locked into our diary immediately upon checkout.</p>
    `;
    warningEl.style.borderLeftColor = 'var(--color-success)';
  } else {
    warningEl.innerHTML = `
      <div class="loss-aversion-title">⚠️ Campaign Brief Missing</div>
      <p class="loss-aversion-desc">You haven't completed our automated Lead Qualification wizard. Bookings without qualified profiles are automatically removed from our calendars within 12 hours. <a href="#qualification" style="color: #FFF; text-decoration: underline; font-weight: 600;">Qualify Your Campaign Now</a> to prevent session cancellation.</p>
    `;
    warningEl.style.borderLeftColor = 'var(--color-accent)';
  }
}

// Global hook for pricing value stacks selection
function selectPackage(packageName) {
  // Pre-fill the budget drop down or preference based on package
  const budgetSelect = document.getElementById('budget');
  if (budgetSelect) {
    if (packageName === 'editorial') {
      budgetSelect.value = '3k_5k';
    } else if (packageName === 'commercial') {
      budgetSelect.value = '3k_5k';
    } else if (packageName === 'residency') {
      budgetSelect.value = '5k_10k';
    }
  }
}

// --- 7. LIFE-CYCLE BOOTSTRAP ---
document.addEventListener('DOMContentLoaded', () => {
  // Init state engine
  YesLadder.init();

  // Navigation UI
  setupNavigation();

  // Testimonials Slider dots listener
  const sliderTrack = document.getElementById('testimonial-slider-track');
  if (sliderTrack) {
    sliderTrack.addEventListener('scroll', updateSliderDots);
  }

  // Setup Wizard Form
  setupWizard();

  // Setup Live Diary Calendar
  const calendarInstance = new StudioCalendar('calendar-days-grid', 'booking-details-box');
  
  // Diary warning
  updateDiaryWarningState();

  // Yes-Ladder Step 1 listeners
  const chks = [
    document.getElementById('chk-friction'),
    document.getElementById('chk-gear'),
    document.getElementById('chk-crew')
  ];
  const submitLadderBtn = document.getElementById('btn-submit-ladder');

  if (submitLadderBtn && chks.every(Boolean)) {
    const verifyCheckBoxes = () => {
      const anyChecked = chks.some(c => c.checked);
      if (anyChecked) {
        submitLadderBtn.removeAttribute('disabled');
      } else {
        submitLadderBtn.setAttribute('disabled', 'true');
      }
    };
    chks.forEach(c => c.addEventListener('change', verifyCheckBoxes));

    // Restore checkbox state if already checked
    if (YesLadder.state.ladderNodes.frictionChecked) {
      chks.forEach(c => c.checked = true);
      submitLadderBtn.removeAttribute('disabled');
      submitLadderBtn.innerHTML = 'Bottlenecks Confirmed ✓';
    }

    submitLadderBtn.addEventListener('click', () => {
      YesLadder.setNode('frictionChecked', true);
      
      YesLadder.showM3Alert(
        "Needs Registered ✓",
        "You have successfully initiated the Yes-Ladder. Next: Explore our premium pricing value stacks.",
        "View Value Stacks",
        () => {
          document.getElementById('rates').scrollIntoView({ behavior: 'smooth' });
        }
      );
    });
  }

  // Yes-Ladder Step 2 price agreement listener
  const agreeValueBtn = document.getElementById('btn-agree-value');
  if (agreeValueBtn) {
    if (YesLadder.state.ladderNodes.valueChecked) {
      agreeValueBtn.innerHTML = 'Preference Registered ✓';
      agreeValueBtn.setAttribute('disabled', 'true');
    }

    agreeValueBtn.addEventListener('click', () => {
      YesLadder.setNode('valueChecked', true);
      YesLadder.showM3Alert(
        "Value Preference Confirmed ✓",
        "You have agreed to standard Value Stacks. Next: Complete your qualification brief details.",
        "Qualify Brief",
        () => {
          document.getElementById('qualification').scrollIntoView({ behavior: 'smooth' });
        }
      );
      agreeValueBtn.innerHTML = 'Preference Registered ✓';
      agreeValueBtn.setAttribute('disabled', 'true');
    });
  }

  // Final booking submission action
  const secureBookingBtn = document.getElementById('btn-secure-booking');
  if (secureBookingBtn) {
    secureBookingBtn.addEventListener('click', () => {
      const dateVal = calendarInstance.getSelectedDateString();
      const timeVal = calendarInstance.selectedTime;
      
      YesLadder.updateClientInfo({
        selectedDate: dateVal,
        selectedTime: timeVal
      });
      YesLadder.setNode('bookingChecked', true);
      
      YesLadder.showM3Alert(
        "Studio Session Secured ✓",
        `Production slot registered for ${dateVal} during the ${timeVal} window. An executive producer will email your campaign contract details in under 60 minutes.`,
        "Return Home",
        () => {
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      );
    });
  }
});
