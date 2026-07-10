/**
 * kasimshah.com - Conversions State, Retainer Wizard & Navigation Setup
 */

// --- 1. RETAINER YES-LADDER STATE ENGINE ---
const YesLadder = {
  storageKey: 'ks_retainer_ladder_state',
  
  state: {
    ladderNodes: {
      leakChecked: false,       // Step 1: Acknowledges funnel leaks
      priceChecked: false,      // Step 2: Agrees to flat Retainer packaging
      wizardChecked: false,     // Step 3: Qualification wizard complete
      onboardedChecked: false   // Step 4: Final agreement submitted
    },
    clientInfo: {
      name: '',
      email: '',
      company: '',
      projectType: '',
      currentSpeed: '',
      budget: '',
      timeline: '',
      description: ''
    },
    progressPercent: 0
  },

  init() {
    const saved = localStorage.getItem(this.storageKey);
    if (saved) {
      try {
        this.state = JSON.parse(saved);
      } catch (e) {
        console.error('Error parsing retainer state, resetting', e);
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
      dialog.setAttribute('style', '--md-dialog-container-color: var(--color-dark-surface); border: 1px solid var(--color-dark-border);');
      document.body.appendChild(dialog);
    }
    
    dialog.innerHTML = `
      <div slot="headline" style="font-family: var(--font-serif); color: var(--color-accent);">${headline}</div>
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

    let nextMilestone = "Acknowledge Funnel Leaks";
    if (!this.state.ladderNodes.leakChecked) {
      nextMilestone = "Confirm Funnel Check";
    } else if (!this.state.ladderNodes.priceChecked) {
      nextMilestone = "Agree Flat Retainer";
    } else if (!this.state.ladderNodes.wizardChecked) {
      nextMilestone = "Complete Qualification Wizard";
    } else if (!this.state.ladderNodes.onboardedChecked) {
      nextMilestone = "Onboarding Complete";
    } else {
      nextMilestone = "Onboarding Secured ✓";
    }

    hud.innerHTML = `
      <div class="hud-title">Retainer Onboarding: ${this.state.progressPercent}%</div>
      <div class="hud-bar-container">
        <div class="hud-bar" style="width: ${this.state.progressPercent}%"></div>
      </div>
      <div class="hud-desc">Next: <strong>${nextMilestone}</strong></div>
      <a href="#" style="font-size: 9px; color: var(--color-muted); text-align: right; text-decoration: underline;" onclick="event.preventDefault(); YesLadder.reset();">Reset Journey</a>
    `;
  }
};

// --- 2. RESPONSIVE NAVIGATION ---
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

// --- 3. SERVICES ACCORDION DETAILED SWAPPING ---
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

// --- 4. TESTIMONIAL SNAP SLIDER ---
function scrollTestimonials(direction) {
  const track = document.getElementById('testimonial-slider-track');
  if (!track) return;
  
  const cardWidth = track.firstElementChild.getBoundingClientRect().width;
  const gap = 24;
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

// --- 5. RETAINER ONBOARDING WIZARD ---
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
    nextBtn.innerHTML = (stepNum === totalWizardSteps) ? 'Submit Retainer Request' : 'Continue';
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

  // Custom constraint warning (Silver plan minimum details)
  if (stepNum === 2) {
    const budgetSelect = document.getElementById('budget');
    if (budgetSelect && budgetSelect.value === 'under_silver') {
      YesLadder.showM3Alert(
        "⚠️ Minimum Operations Standard",
        "Our baseline retainer is the Silver Plan (£97/mo). Campaigns below this minimum standard typically lack SSL protection or have core mobile load bottlenecks that bleed traffic."
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
  YesLadder.setNode('wizardChecked', true);
  YesLadder.setNode('onboardedChecked', true);
  
  YesLadder.showM3Alert(
    "Retainer Profile Registered ✓",
    "Your conversion onboarding details are registered. Kasim Shah will review your metrics and email your retainer schedule within 2 hours.",
    "Return to Homepage",
    () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  );
}

function selectTier(planName) {
  const budgetSelect = document.getElementById('budget');
  if (budgetSelect) {
    if (planName === 'Silver') budgetSelect.value = 'silver_97';
    else if (planName === 'Gold') budgetSelect.value = 'gold_297';
    else if (planName === 'Platinum') budgetSelect.value = 'platinum_497';
  }
  
  YesLadder.showM3Alert(
    `${planName} Plan Selected`,
    `You have chosen the ${planName} Retainer stack. Next, complete the campaign onboarding fields to detail your speed constraints.`,
    "Go to Onboarding Form",
    () => {
      document.getElementById('qualification').scrollIntoView({ behavior: 'smooth' });
    }
  );
}

// --- 6. SCROLL REVEALS ENGINE ---
function setupScrollReveals() {
  const reveals = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('revealed');
          observer.unobserve(entry.target);
        }
      });
    }, {
      threshold: 0.1,
      rootMargin: '0px 0px -50px 0px'
    });
    
    reveals.forEach(reveal => observer.observe(reveal));
  } else {
    reveals.forEach(reveal => reveal.classList.add('revealed'));
  }
}

// --- 7. BOOTSTRAP SYSTEM ---
document.addEventListener('DOMContentLoaded', () => {
  YesLadder.init();
  setupNavigation();
  setupScrollReveals();
  setupWizard();

  const sliderTrack = document.getElementById('testimonial-slider-track');
  if (sliderTrack) {
    sliderTrack.addEventListener('scroll', updateSliderDots);
  }

  // Checkbox vetting locks
  const chks = [
    document.getElementById('chk-leak-1'),
    document.getElementById('chk-leak-2'),
    document.getElementById('chk-leak-3'),
    document.getElementById('chk-leak-4')
  ];
  const submitLadderBtn = document.getElementById('btn-home-submit-vetting');

  if (submitLadderBtn && chks.every(Boolean)) {
    const evaluateCheckboxes = () => {
      const anyChecked = chks.some(c => c.checked);
      if (anyChecked) {
        submitLadderBtn.removeAttribute('disabled');
      } else {
        submitLadderBtn.setAttribute('disabled', 'true');
      }
    };
    chks.forEach(c => c.addEventListener('change', evaluateCheckboxes));

    // Support checklist container clicks
    for (let i = 1; i <= 4; i++) {
      const wrapper = document.getElementById(`check-wrap-${i}`);
      if (wrapper) {
        wrapper.addEventListener('click', (e) => {
          if (e.target !== chks[i-1]) {
            chks[i-1].click();
          }
        });
      }
    }

    if (YesLadder.state.ladderNodes.leakChecked) {
      chks.forEach(c => c.checked = true);
      submitLadderBtn.removeAttribute('disabled');
      submitLadderBtn.innerHTML = 'Leaks Registered ✓';
    }

    submitLadderBtn.addEventListener('click', () => {
      YesLadder.setNode('leakChecked', true);
      YesLadder.showM3Alert(
        "Leaks Registered ✓",
        "Your site vetting data is recorded. Next: select a retainer value stack tier to match your operations.",
        "View Retainer Tiers",
        () => {
          document.getElementById('rates').scrollIntoView({ behavior: 'smooth' });
        }
      );
    });
  }

  // Price preference agreement button
  const agreeValueBtn = document.getElementById('btn-agree-value');
  if (agreeValueBtn) {
    if (YesLadder.state.ladderNodes.priceChecked) {
      agreeValueBtn.innerHTML = 'Agreement Registered ✓';
      agreeValueBtn.setAttribute('disabled', 'true');
    }

    agreeValueBtn.addEventListener('click', () => {
      YesLadder.setNode('priceChecked', true);
      YesLadder.showM3Alert(
        "Retainer Packaging Preferred ✓",
        "Next: complete our 3-step onboarding wizard to detail speed and technical constraints.",
        "Start Onboarding Wizard",
        () => {
          document.getElementById('qualification').scrollIntoView({ behavior: 'smooth' });
        }
      );
      agreeValueBtn.innerHTML = 'Agreement Registered ✓';
      agreeValueBtn.setAttribute('disabled', 'true');
    });
  }
});
