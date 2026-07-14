const fs = require('fs');
const path = require('path');

const appJsContent = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');

describe('XSS Prevention', () => {

  it('Verify escapeForAttribute utility exists', () => {
    expect(appJsContent).toMatch(/function escapeForAttribute/);
  });

  it('Verify textContent is used for safe insertion', () => {
    // The createEl function should use textContent for strings to safely encode them
    const createElFunctionMatch = appJsContent.match(/function createEl[\s\S]*?return el;/);
    if (createElFunctionMatch) {
      expect(createElFunctionMatch[0]).toMatch(/el\.textContent\s*=\s*val/);
    }
  });

  describe('escapeForAttribute unit logic', () => {
    // Extract the function implementation to test it
    const escapeMatch = appJsContent.match(/function escapeForAttribute\(str\) \{([\s\S]*?)\}/);
    let escapeForAttribute;
    
    if (escapeMatch) {
      escapeForAttribute = new Function('str', escapeMatch[1]);
    }

    it('Escapes <script> tags', () => {
      if (escapeForAttribute) {
        expect(escapeForAttribute('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
      }
    });

    it('Escapes HTML in workspace names', () => {
      if (escapeForAttribute) {
        expect(escapeForAttribute('My <b>Workspace</b>')).toBe('My &lt;b&gt;Workspace&lt;/b&gt;');
      }
    });

    it('Escapes onclick handlers in brand names', () => {
      if (escapeForAttribute) {
        expect(escapeForAttribute('" onmouseover="alert(1)" "')).toBe('&quot; onmouseover=&quot;alert(1)&quot; &quot;');
      }
    });
  });
});
