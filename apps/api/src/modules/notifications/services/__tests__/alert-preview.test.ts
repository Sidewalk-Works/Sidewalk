import { AlertPreviewService } from '../alert-preview.service.js';

describe('AlertPreviewService', () => {
  let service: AlertPreviewService;
  beforeEach(() => { service = new AlertPreviewService(); });

  const base = { notificationId: 'n-1', headline: 'Update', previewBody: 'Something happened' };

  it('sets explanationCopy for followed_case', () => {
    const result = service.generatePreview(base.notificationId, base.headline, base.previewBody,
      { reasonCode: 'followed_case', caseTitle: 'Pothole #42' });
    expect(result.explanationCopy).toContain('Pothole #42');
  });

  it('sets explanationCopy for subscribed_topic', () => {
    const result = service.generatePreview(base.notificationId, base.headline, base.previewBody,
      { reasonCode: 'subscribed_topic', topicName: 'Water Issues' });
    expect(result.explanationCopy).toContain('Water Issues');
  });

  it('sets explanationCopy for nearby_alert with distance', () => {
    const result = service.generatePreview(base.notificationId, base.headline, base.previewBody,
      { reasonCode: 'nearby_alert', distanceMiles: 2.5 });
    expect(result.explanationCopy).toContain('2.5');
  });

  it('sets explanationCopy for mentioned', () => {
    const result = service.generatePreview(base.notificationId, base.headline, base.previewBody,
      { reasonCode: 'mentioned' });
    expect(result.explanationCopy).toContain('mentioned');
  });

  it('sets explanationCopy for staff_assignment', () => {
    const result = service.generatePreview(base.notificationId, base.headline, base.previewBody,
      { reasonCode: 'staff_assignment' });
    expect(result.explanationCopy).toContain('assigned');
  });

  it('returns the correct notificationId and headline', () => {
    const result = service.generatePreview('n-99', 'My Headline', 'body',
      { reasonCode: 'mentioned' });
    expect(result.notificationId).toBe('n-99');
    expect(result.headline).toBe('My Headline');
  });
});
