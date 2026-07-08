/**
 * KS Studio - General Navigation (Material Design 3 Integration)
 */

document.addEventListener('DOMContentLoaded', () => {
  setupNavigation();
});

// Setup responsive mobile navigation
function setupNavigation() {
  const toggle = document.querySelector('.nav-toggle');
  const menu = document.querySelector('.m3-nav-wrapper'); // Corrected class mismatch
  
  if (toggle && menu) {
    toggle.addEventListener('click', () => {
      menu.classList.toggle('active');
      const expanded = menu.classList.contains('active');
      toggle.setAttribute('aria-expanded', expanded);
    });
  }

  // Set active class on menu items based on URL
  const currentPath = window.location.pathname.split('/').pop() || 'index.html';
  const links = document.querySelectorAll('md-text-button[href]');
  
  links.forEach(link => {
    const href = link.getAttribute('href');
    if (href === currentPath) {
      link.setAttribute('aria-current', 'page');
      // Highlight the active text button visually
      link.setAttribute('style', '--md-text-button-label-text-color: var(--color-accent);');
    }
  });
}
