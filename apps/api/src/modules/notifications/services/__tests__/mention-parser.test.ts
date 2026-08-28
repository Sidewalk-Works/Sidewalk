import { MentionParserService } from '../mention-parser.service.js';

const author = { userId: 'author-1', username: 'alice', displayName: 'Alice' };

describe('MentionParserService', () => {
  let service: MentionParserService;

  beforeEach(() => { service = new MentionParserService(); });

  describe('parseAndNotify', () => {
    it('returns null for a body with no mentions', () => {
      expect(service.parseAndNotify('No mentions here.', author, 'case-1', 'cmt-1')).toBeNull();
    });

    it('parses a single mention', () => {
      const result = service.parseAndNotify('Hello @bob!', author, 'case-1', 'cmt-1');
      expect(result).not.toBeNull();
      expect(result!.mentions).toHaveLength(1);
      expect(result!.mentions[0].mentionedUsername).toBe('bob');
    });

    it('parses multiple distinct mentions', () => {
      const result = service.parseAndNotify('@alice and @bob reviewed the report.', author, 'case-1', 'cmt-1');
      expect(result!.mentions).toHaveLength(2);
      const usernames = result!.mentions.map((m) => m.mentionedUsername);
      expect(usernames).toContain('alice');
      expect(usernames).toContain('bob');
    });

    it('records correct startIndex and endIndex for each mention', () => {
      const body = '@charlie check this out';
      const result = service.parseAndNotify(body, author, 'case-1', 'cmt-1');
      expect(result!.mentions[0].startIndex).toBe(0);
      expect(result!.mentions[0].endIndex).toBe('@charlie'.length);
    });

    it('truncates long snippets to 100 chars + ellipsis', () => {
      const longBody = 'a'.repeat(150) + ' @user mention';
      const result = service.parseAndNotify(longBody, author, 'case-1', 'cmt-1');
      expect(result!.snippet.length).toBeLessThanOrEqual(103); // 100 + '...'
    });

    it('does not append ellipsis for short bodies', () => {
      const result = service.parseAndNotify('Hi @bob', author, 'case-1', 'cmt-1');
      expect(result!.snippet).not.toContain('...');
    });

    it('sets notificationId, caseId, and commentId on the payload', () => {
      const result = service.parseAndNotify('@dave thanks', author, 'case-42', 'cmt-99');
      expect(result!.caseId).toBe('case-42');
      expect(result!.commentId).toBe('cmt-99');
      expect(result!.notificationId).toMatch(/^mn_/);
    });

    it('handles duplicate mentions in the body', () => {
      const result = service.parseAndNotify('@bob and @bob again', author, 'case-1', 'cmt-1');
      // Both occurrences should be parsed
      expect(result!.mentions).toHaveLength(2);
    });

    it('handles an empty body gracefully', () => {
      expect(service.parseAndNotify('', author, 'case-1', 'cmt-1')).toBeNull();
    });
  });
});
