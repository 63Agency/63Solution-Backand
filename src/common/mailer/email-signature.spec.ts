import {
  appendEmailSignatureHtml,
  appendEmailSignatureText,
  withEmailSignature,
} from './email-signature';

describe('email-signature', () => {
  it('appends signature once (idempotent)', () => {
    const once = appendEmailSignatureHtml('<p>Hello</p>');
    expect(once).toContain('63agency-email-signature');
    expect(once).toContain('Saad CHAHOUBI');
    const twice = appendEmailSignatureHtml(once);
    expect(twice).toBe(once);
  });

  it('withEmailSignature builds html from text-only', () => {
    const { text, html } = withEmailSignature({
      text: 'Bonjour Client,\nRDV demain.',
    });
    expect(text).toContain('Saad CHAHOUBI');
    expect(html).toContain('Bonjour Client');
    expect(html).toContain('<br/>');
    expect(html).toContain('63agency-email-signature');
  });

  it('appendEmailSignatureText is idempotent', () => {
    const once = appendEmailSignatureText('Hello');
    expect(appendEmailSignatureText(once)).toBe(once);
  });
});
