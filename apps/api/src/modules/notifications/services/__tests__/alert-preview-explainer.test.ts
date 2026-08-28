import { AlertPreviewExplainerService } from '../alert-preview-explainer.service.js';

describe('AlertPreviewExplainerService', () => {
  let service: AlertPreviewExplainerService;
  beforeEach(() => { service = new AlertPreviewExplainerService(); });

  it('returns default explainer for unknown category', () => {
    const result = service.generateExplainerPreview({ category: 'other' as any, caseTitle: 'My Case' });
    expect(result.explainerCopy).toContain('account activity preferences');
  });

  it('returns author-specific explainer for report_author', () => {
    const result = service.generateExplainerPreview({ category: 'report_author', caseTitle: 'Pothole on Oak St' });
    expect(result.explainerCopy).toContain('Pothole on Oak St');
    expect(result.explainerCopy).toContain('created');
  });

  it('returns category explainer for subscribed_category', () => {
    const result = service.generateExplainerPreview({ category: 'subscribed_category', caseTitle: 'Road Issue' });
    expect(result.explainerCopy).toContain('subscribed');
  });

  it('returns proximity explainer with locationName', () => {
    const result = service.generateExplainerPreview({ category: 'neighborhood_proximity', caseTitle: 'Test', locationName: 'Downtown' });
    expect(result.explainerCopy).toContain('Downtown');
  });

  it('falls back to "your neighborhood" when locationName is absent', () => {
    const result = service.generateExplainerPreview({ category: 'neighborhood_proximity', caseTitle: 'Test' });
    expect(result.explainerCopy).toContain('your neighborhood');
  });

  it('sets headline using caseTitle', () => {
    const result = service.generateExplainerPreview({ category: 'report_author', caseTitle: 'Broken Bench' });
    expect(result.headline).toContain('Broken Bench');
  });

  it('returns a previewId prefixed with prev_', () => {
    const result = service.generateExplainerPreview({ category: 'report_author', caseTitle: 'X' });
    expect(result.previewId).toMatch(/^prev_/);
  });
});
