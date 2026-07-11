/**
 * KS Studio - Lead Qualification Wizard Component (Material Design 3 Dialogue Integrated)
 */

let currentStep = 1;
const totalSteps = 3;

document.addEventListener('DOMContentLoaded', () => {
  const wizardForm = document.getElementById('qualification-form');
  if (!wizardForm) return;

  loadExistingData();
  showStep(currentStep);
  setupWizardNav();
});

// Display active step in the wizard UI
function showStep(stepNum) {
  const steps = document.querySelectorAll('.wizard-step');
  const nodes = document.querySelectorAll('.wizard-step-node');
  
  steps.forEach(step => step.classList.remove('active'));
  const currentStepEl = document.getElementById(`step-${stepNum}`);
  if (currentStepEl) currentStepEl.classList.add('active');
  
  // Update node statuses
  nodes.forEach((node, idx) => {
    const nodeStep = idx + 1;
    node.classList.remove('active', 'completed');
    if (nodeStep === stepNum) {
      node.classList.add('active');
    } else if (nodeStep < stepNum) {
      node.classList.add('completed');
    }
  });

  // Update progress bar width
  const fill = document.querySelector('.wizard-progress-fill');
  if (fill) {
    const progressVal = ((stepNum - 1) / (totalSteps - 1)) * 100;
    fill.style.width = `${progressVal}%`;
  }

  // Update buttons (Material Component attributes)
  const prevBtn = document.getElementById('btn-prev');
  const nextBtn = document.getElementById('btn-next');
  
  if (prevBtn) {
    if (stepNum === 1) {
      prevBtn.style.visibility = 'hidden';
    } else {
      prevBtn.style.visibility = 'visible';
    }
  }

  if (nextBtn) {
    if (stepNum === totalSteps) {
      nextBtn.innerHTML = 'Submit Production Brief';
    } else {
      nextBtn.innerHTML = 'Continue';
    }
  }
}

// Navigation actions
function setupWizardNav() {
  const prevBtn = document.getElementById('btn-prev');
  const nextBtn = document.getElementById('btn-next');

  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      if (currentStep > 1) {
        currentStep--;
        showStep(currentStep);
      }
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      if (validateStep(currentStep)) {
        saveStepData(currentStep);
        
        if (currentStep < totalSteps) {
          currentStep++;
          showStep(currentStep);
        } else {
          completeWizard();
        }
      }
    });
  }
}

// Validation before step transition (Reading from Material Design 3 Web Components)
function validateStep(stepNum) {
  let valid = true;
  const currentStepEl = document.getElementById(`step-${stepNum}`);
  const inputs = currentStepEl.querySelectorAll('md-outlined-text-field, md-outlined-select');
  
  inputs.forEach(input => {
    // Check custom required attribute or standard validity
    if (input.hasAttribute('required') && !input.value.trim()) {
      valid = false;
      input.setAttribute('error', 'true');
      input.setAttribute('error-text', 'This field is required');
      
      // Clear error state after a few seconds
      setTimeout(() => {
        input.removeAttribute('error');
        input.removeAttribute('error-text');
      }, 4000);
    } else {
      input.removeAttribute('error');
      input.removeAttribute('error-text');
    }
  });

  // Custom constraint for Loss Aversion/Qualification (Budget must be high-value)
  if (stepNum === 2) {
    const budgetSelect = document.getElementById('budget');
    if (budgetSelect && budgetSelect.value === 'under_3k') {
      YesLadder.showM3Alert(
        "⚠️ High-Production Standard Warning",
        "KS Studio specializes in high-production value commercials and premium shoots. Our entry-level booking is £3,000. Underfunded shoots run the risk of lacking professional lighting, crew, or spatial booking time needed for standard commercial viability."
      );
    }
  }

  return valid;
}

// Save inputs to state engine
function saveStepData(stepNum) {
  const currentStepEl = document.getElementById(`step-${stepNum}`);
  const inputs = currentStepEl.querySelectorAll('md-outlined-text-field, md-outlined-select');
  const data = {};
  
  inputs.forEach(input => {
    data[input.id] = input.value;
  });
  
  YesLadder.updateClientInfo(data);
}

// Load data into forms if already stored
function loadExistingData() {
  const info = YesLadder.state.clientInfo;
  Object.keys(info).forEach(key => {
    const el = document.getElementById(key);
    if (el && info[key]) {
      el.value = info[key];
    }
  });
}

// Submit and update the state engine node
function completeWizard() {
  YesLadder.setNode('qualifiedChecked', true);
  YesLadder.showM3Alert(
    "Campaign Brief Pre-Qualified ✓",
    "Your production details have been successfully qualified. You are now unlocked to reserve your target slots in the live booking calendar.",
    "Go to Calendar",
    () => {
      window.location.href = 'diary.html';
    }
  );
}
