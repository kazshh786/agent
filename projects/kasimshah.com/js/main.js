/**
 * kasimshah.com - Flagship Scroll Reveals & Navigation Setup
 */

document.addEventListener('DOMContentLoaded', () => {
  setupNavigation();
  setupScrollReveals();
});

// Mobile navigation handler
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

  // Active state matching
  const currentPath = window.location.pathname.split('/').pop() || 'index.html';
  const links = document.querySelectorAll('md-text-button[href]');
  
  links.forEach(link => {
    const href = link.getAttribute('href');
    if (href === currentPath) {
      link.setAttribute('aria-current', 'page');
      link.setAttribute('style', '--md-text-button-label-text-color: var(--color-accent);');
    }
  });
}

// Scroll reveal engine using IntersectionObserver
function setupScrollReveals() {
  const reveals = document.querySelectorAll('.reveal');
  
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('revealed');
          observer.unobserve(entry.target); // Trigger only once
        }
      });
    }, {
      threshold: 0.1,
      rootMargin: '0px 0px -50px 0px'
    });
    
    reveals.forEach(reveal => {
      observer.observe(reveal);
    });
  } else {
    // Fallback if IntersectionObserver is not supported
    reveals.forEach(reveal => {
      reveal.classList.add('revealed');
    });
  }
}
