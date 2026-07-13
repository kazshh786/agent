const { validateBody } = require('../api/_utils');

describe('Validation Utility', () => {
  it('Returns valid for complete body', () => {
    const result = validateBody({ name: 'Acme', slug: 'acme' }, ['name', 'slug']);
    expect(result.valid).toBe(true);
  });

  it('Returns missing fields list for incomplete body', () => {
    const result = validateBody({ name: 'Acme' }, ['name', 'slug', 'type']);
    expect(result.valid).toBe(false);
    expect(result.missing).toEqual(['slug', 'type']);
  });

  it('Returns invalid for null body', () => {
    const result = validateBody(null, ['name']);
    expect(result.valid).toBe(false);
    expect(result.missing).toEqual(['name']);
  });

  it('Returns invalid for non-object body', () => {
    const result = validateBody('string', ['name']);
    expect(result.valid).toBe(false);
  });
});

describe('Project Name Validation', () => {
  const isValidProjectName = (name) => {
    if (name.length < 2 || name.length > 200) return false;
    if (/[/\\;$|&`<>]/.test(name)) return false;
    if (name.includes('..')) return false;
    return true;
  };

  it('Rejects names with path traversal (../, ..\\, /etc)', () => {
    expect(isValidProjectName('../secret')).toBe(false);
    expect(isValidProjectName('..\\windows')).toBe(false);
    expect(isValidProjectName('/etc/passwd')).toBe(false);
  });

  it('Rejects names with shell characters', () => {
    expect(isValidProjectName('name; rm -rf /')).toBe(false);
    expect(isValidProjectName('name | cat')).toBe(false);
    expect(isValidProjectName('name & sleep')).toBe(false);
  });

  it('Accepts valid alphanumeric names with hyphens and dots', () => {
    expect(isValidProjectName('My-Project.v1')).toBe(true);
    expect(isValidProjectName('Landing Page 2026')).toBe(true);
  });

  it('Rejects names over 200 characters', () => {
    expect(isValidProjectName('a'.repeat(201))).toBe(false);
  });
});

describe('Slug Validation', () => {
  const isValidSlug = (slug) => /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(slug);

  it('Accepts valid slugs', () => {
    expect(isValidSlug('acme-agency')).toBe(true);
    expect(isValidSlug('a12')).toBe(true);
  });

  it('Rejects slugs with uppercase', () => {
    expect(isValidSlug('Acme-Agency')).toBe(false);
  });

  it('Rejects slugs starting/ending with hyphens', () => {
    expect(isValidSlug('-acme')).toBe(false);
    expect(isValidSlug('acme-')).toBe(false);
  });

  it('Rejects slugs under 3 characters', () => {
    expect(isValidSlug('ac')).toBe(false);
  });
});
