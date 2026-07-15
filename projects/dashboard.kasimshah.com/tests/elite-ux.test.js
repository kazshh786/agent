/** @jest-environment jsdom */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'elite.css'), 'utf8');
const app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');

describe('elite dual-dashboard UX contract', () => {
  beforeEach(() => {
    document.documentElement.innerHTML = html;
  });

  test('loads the elite layer after the base stylesheet', () => {
    const stylesheets = [...document.querySelectorAll('link[rel="stylesheet"]')]
      .map(link => link.getAttribute('href'));
    expect(stylesheets.indexOf('elite.css')).toBeGreaterThan(stylesheets.indexOf('styles.css'));
  });

  test('keeps agency and customer navigation as separate landmarks', () => {
    expect(document.getElementById('agency-nav-group')).not.toBeNull();
    expect(document.getElementById('customer-nav-group')).not.toBeNull();
    expect(document.getElementById('mode-switcher')).not.toBeNull();
    expect(document.getElementById('workspace-selector')).not.toBeNull();
    expect(app).toContain("getElementById('agency-nav-group')");
    expect(app).toContain("getElementById('customer-nav-group')");
  });

  test('has no duplicate DOM identifiers', () => {
    const ids = [...document.querySelectorAll('[id]')].map(node => node.id);
    expect(ids).toHaveLength(new Set(ids).size);
  });

  test('supports keyboard-friendly reduced motion and responsive navigation', () => {
    expect(css).toMatch(/prefers-reduced-motion:\s*reduce/);
    expect(css).toMatch(/@media\s*\(max-width:\s*900px\)/);
    expect(css).toContain('.mobile-nav-toggle');
  });

  test('keeps booking states honest while surfacing shop and mobile operations', () => {
    expect(app).toContain('Shop appointments');
    expect(app).toContain('Mobile appointments');
    expect(app).toContain('awaiting the KS OS management connection');
    expect(app).not.toContain('KSSocialMockData');
  });
});
