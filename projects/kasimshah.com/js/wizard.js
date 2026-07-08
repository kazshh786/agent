/**
 * KasimShah.com - Lead Qualification Wizard Script
 */

let currentStep = 1;
const totalSteps = 4;

const pricingTable = {
  Silver: { monthly: 97, setup: 197, stripe: 'https://buy.stripe.com/mock_silver_setup_deposit', gocardless: 'https://gocardless.com/mock_silver_dd_mandate' },
  Gold: { monthly: 297, setup: 397, stripe: 'https://buy.stripe.com/mock_gold_setup_deposit', gocardless: 'https://gocardless.com/mock_gold_dd_mandate' },
  Platinum: { monthly: 497, setup: 397, stripe: 'https://buy.stripe.com/mock_platinum_setup_deposit', gocardless: 'https://gocardless.com/mock_platinum_dd_mandate' }
};

document.addEventListener('DOMContentLoaded', () => {
  const wizardForm = document.getElementById('qualification-wizard-form');
  if (!wizardForm) return;

  // Pre-select plan tier if passed in URL query param
  const urlParams = new URLSearchParams(window.location.search);
  const tierParam = urlParams.get('tier');
  if (tierParam && pricingTable[tierParam]) {
    const selectEl = document.getElementById('selected-tier');
    if (selectEl) selectEl.value = tierParam;
  }

  showStep(currentStep);
  setupWizardNav();
});

// Update the Wizard Step UI
function showStep(stepNum) {
  const steps = document.querySelectorAll('.wizard-step');
  const nodes = document.querySelectorAll('.wizard-step-node');

  steps.forEach(step => step.classList.remove('active'));
  const currentStepEl = document.getElementById(`step-${stepNum}`);
  if (currentStepEl) currentStepEl.classList.add('active');

  // Update nodes
  nodes.forEach((node, idx) => {
    const nodeStep = idx + 1;
    node.classList.remove('active', 'completed');
    if (nodeStep === stepNum) {
      node.classList.add('active');
    } else if (nodeStep < stepNum) {
      node.classList.add('completed');
    }
  });

  // Progress Bar Fill
  const fill = document.getElementById('progress-fill');
  if (fill) {
    const progressPercent = ((stepNum - 1) / (totalSteps - 1)) * 100;
    fill.style.width = `${progressPercent}%`;
  }

  // Nav buttons visibility
  const prevBtn = document.getElementById('btn-prev');
  const nextBtn = document.getElementById('btn-next');

  if (prevBtn) {
    prevBtn.style.visibility = (stepNum === 1) ? 'hidden' : 'visible';
  }

  if (nextBtn) {
    if (stepNum === totalSteps) {
      nextBtn.style.display = 'none'; // Hide next button on checkout page to enforce Stripe/GoCardless clicks
    } else {
      nextBtn.style.display = 'inline-flex';
      nextBtn.innerHTML = (stepNum === totalSteps - 1) ? 'Compile Invoice & Checkout' : 'Continue';
    }
  }

  if (stepNum === 4) {
    compileInvoice();
  }
}

// Navigation button handlers
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
        if (currentStep < totalSteps) {
          currentStep++;
          showStep(currentStep);
        }
      }
    });
  }
}

// Basic field validation check
function validateStep(stepNum) {
  let valid = true;
  const currentStepEl = document.getElementById(`step-${stepNum}`);
  const inputs = currentStepEl.querySelectorAll('md-outlined-text-field');

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

  return valid;
}

// Dynamically compile invoices and set transaction links
function compileInvoice() {
  const tierSelect = document.getElementById('selected-tier');
  const selectedTierName = tierSelect ? tierSelect.value : 'Gold';
  const tierConfig = pricingTable[selectedTierName];

  // Set text labels
  const tierNameLabel = document.getElementById('compiler-tier-name');
  const tierMonthlyLabel = document.getElementById('compiler-tier-monthly');
  const tierSetupLabel = document.getElementById('compiler-tier-setup');
  const depositLabel = document.getElementById('compiler-deposit-due');
  const stripePriceLabel = document.getElementById('stripe-price-label');

  if (tierNameLabel) tierNameLabel.textContent = `${selectedTierName} Plan`;
  if (tierMonthlyLabel) tierMonthlyLabel.textContent = `£${tierConfig.monthly} / month`;
  if (tierSetupLabel) tierSetupLabel.textContent = `£${tierConfig.setup} (Flat Setup)`;
  if (depositLabel) depositLabel.textContent = `£${tierConfig.setup}`;
  if (stripePriceLabel) stripePriceLabel.textContent = `£${tierConfig.setup}`;

  // Set secure deposit mandate links
  const stripeBtn = document.getElementById('stripe-checkout-btn');
  const gocardlessBtn = document.getElementById('gocardless-checkout-btn');

  if (stripeBtn) {
    stripeBtn.setAttribute('href', tierConfig.stripe);
    stripeBtn.onclick = (e) => {
      console.log(`Redirecting to Stripe checkout for ${selectedTierName} setup: £${tierConfig.setup}`);
    };
  }

  if (gocardlessBtn) {
    gocardlessBtn.setAttribute('href', tierConfig.gocardless);
    gocardlessBtn.onclick = (e) => {
      console.log(`Redirecting to GoCardless mandate for ${selectedTierName} direct debit setup`);
    };
  }
}
