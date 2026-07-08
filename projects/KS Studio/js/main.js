/**
 * KS Studio - General UI Interactions & Navigation (Material Design 3 Integration)
 */

document.addEventListener('DOMContentLoaded', () => {
  setupNavigation();
  setupFAQAccordions();
  setupM3Tabs();
});

// Setup responsive mobile navigation
function setupNavigation() {
  const toggle = document.querySelector('.nav-toggle');
  const menu = document.querySelector('.nav-menu');
  
  if (toggle && menu) {
    toggle.addEventListener('click', () => {
      menu.classList.toggle('active');
      const expanded = menu.classList.contains('active');
      toggle.setAttribute('aria-expanded', expanded);
    });
  }

  // Set active class on menu items based on URL
  const currentPath = window.location.pathname.split('/').pop() || 'index.html';
  const links = document.querySelectorAll('.nav-link');
  
  links.forEach(link => {
    const href = link.getAttribute('href');
    if (href === currentPath) {
      link.classList.add('active');
      link.setAttribute('aria-current', 'page');
    } else {
      link.classList.remove('active');
    }
  });
}

// Setup FAQ Accordion widgets
function setupFAQAccordions() {
  const triggers = document.querySelectorAll('.faq-trigger');
  
  triggers.forEach(trigger => {
    trigger.addEventListener('click', () => {
      const parent = trigger.parentElement;
      const isActive = parent.classList.contains('active');
      
      // Close other accordions
      document.querySelectorAll('.faq-item').forEach(item => {
        item.classList.remove('active');
        item.querySelector('.faq-trigger').setAttribute('aria-expanded', 'false');
      });
      
      if (!isActive) {
        parent.classList.add('active');
        trigger.setAttribute('aria-expanded', 'true');
      }
    });
  });
}

// Setup Material Design 3 Tabs support
function setupM3Tabs() {
  const tabsContainer = document.querySelector('md-tabs');
  const contentItems = document.querySelectorAll('.specs-content-item');
  
  if (!tabsContainer || contentItems.length === 0) return;
  
  tabsContainer.addEventListener('change', (e) => {
    const selectedIndex = tabsContainer.activeTabIndex;
    
    contentItems.forEach((item, idx) => {
      if (idx === selectedIndex) {
        item.style.display = 'block';
      } else {
        item.style.display = 'none';
      }
    });
  });
  
  // Set initial visibility matching initial tab selection
  const initialIndex = tabsContainer.activeTabIndex || 0;
  contentItems.forEach((item, idx) => {
    if (idx === initialIndex) {
      item.style.display = 'block';
    } else {
      item.style.display = 'none';
    }
  });
}
