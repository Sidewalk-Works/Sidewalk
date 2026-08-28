import { EmailSummaryService } from '../email-summary.service.js';

const recipient = { userId: 'user-1', name: 'Alice', email: 'alice@example.com' };

const items = [
  { id: 'n1', title: 'Road crack on Main St', description: 'Status changed to In Review', type: 'status_change' },
  { id: 'n2', title: 'Water leak on Elm Ave', description: 'A new comment was added', type: 'new_comment' },
];

describe('EmailSummaryService', () => {
  let service: EmailSummaryService;

  beforeEach(() => { service = new EmailSummaryService(); });

  describe('generateDigest', () => {
    it('returns a valid template with correct metadata', () => {
      const template = service.generateDigest(recipient, 'daily', items);
      expect(template.recipient.userId).toBe('user-1');
      expect(template.frequency).toBe('daily');
      expect(template.items).toHaveLength(2);
    });

    it('sets generatedAtIso as a valid ISO string', () => {
      const template = service.generateDigest(recipient, 'weekly', items);
      expect(() => new Date(template.generatedAtIso)).not.toThrow();
    });

    it('generates a templateId that includes the frequency', () => {
      const template = service.generateDigest(recipient, 'daily', items);
      expect(template.templateId).toContain('daily');
    });

    it('handles an empty items array without throwing', () => {
      expect(() => service.generateDigest(recipient, 'daily', [])).not.toThrow();
    });

    it('works for weekly frequency', () => {
      const template = service.generateDigest(recipient, 'weekly', items);
      expect(template.frequency).toBe('weekly');
    });
  });

  describe('renderHtml', () => {
    it('includes the recipient name in the output', () => {
      const template = service.generateDigest(recipient, 'daily', items);
      const html = service.renderHtml(template);
      expect(html).toContain('Alice');
    });

    it('includes each item title in the output', () => {
      const template = service.generateDigest(recipient, 'daily', items);
      const html = service.renderHtml(template);
      expect(html).toContain('Road crack on Main St');
      expect(html).toContain('Water leak on Elm Ave');
    });

    it('includes the frequency label', () => {
      const template = service.generateDigest(recipient, 'weekly', items);
      const html = service.renderHtml(template);
      expect(html).toContain('weekly');
    });

    it('renders empty list markup without items', () => {
      const template = service.generateDigest(recipient, 'daily', []);
      const html = service.renderHtml(template);
      expect(html).toContain('<ul>');
    });
  });
});
