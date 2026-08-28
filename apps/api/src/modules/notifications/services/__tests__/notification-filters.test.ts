import { NotificationFiltersService } from '../notification-filters.service.js';

describe('NotificationFiltersService', () => {
  let service: NotificationFiltersService;

  beforeEach(() => { service = new NotificationFiltersService(); });

  describe('createFilter / getFilter / listFilters / deleteFilter', () => {
    it('creates and retrieves a filter by id', () => {
      const filter = service.createFilter({
        userId: 'user-1',
        name: 'My Filter',
        urgency: ['high'],
        categories: [],
        proximity: null,
        timeRange: null,
        isActive: true,
      });
      expect(service.getFilter(filter.id)).toEqual(filter);
    });

    it('lists all created filters', () => {
      service.createFilter({ userId: 'u', name: 'A', urgency: [], categories: [], proximity: null, timeRange: null, isActive: true });
      service.createFilter({ userId: 'u', name: 'B', urgency: [], categories: [], proximity: null, timeRange: null, isActive: true });
      expect(service.listFilters()).toHaveLength(2);
    });

    it('deletes a filter and returns true', () => {
      const f = service.createFilter({ userId: 'u', name: 'X', urgency: [], categories: [], proximity: null, timeRange: null, isActive: true });
      expect(service.deleteFilter(f.id)).toBe(true);
      expect(service.getFilter(f.id)).toBeUndefined();
    });

    it('returns false when deleting a non-existent filter', () => {
      expect(service.deleteFilter('no-such-id')).toBe(false);
    });
  });

  describe('toggleFilter', () => {
    it('toggles isActive from true to false', () => {
      const f = service.createFilter({ userId: 'u', name: 'X', urgency: [], categories: [], proximity: null, timeRange: null, isActive: true });
      const toggled = service.toggleFilter(f.id);
      expect(toggled?.isActive).toBe(false);
    });

    it('returns null for a missing filter', () => {
      expect(service.toggleFilter('missing')).toBeNull();
    });
  });

  describe('applyFilters', () => {
    const items = [
      { urgency: 'low' as const, category: 'road', createdAt: new Date(Date.now() - 1000).toISOString() },
      { urgency: 'high' as const, category: 'water', createdAt: new Date().toISOString() },
    ];

    it('filters by urgency', () => {
      const result = service.applyFilters(items, { urgency: ['high'], categories: [], proximity: null, timeRange: null });
      expect(result).toHaveLength(1);
      expect(result[0].urgency).toBe('high');
    });

    it('filters by category', () => {
      const result = service.applyFilters(items, { urgency: [], categories: ['road'], proximity: null, timeRange: null });
      expect(result).toHaveLength(1);
      expect(result[0].category).toBe('road');
    });

    it('returns all items when no filters are applied', () => {
      const result = service.applyFilters(items, { urgency: [], categories: [], proximity: null, timeRange: null });
      expect(result).toHaveLength(2);
    });

    it('filters by time range — excludes items before start', () => {
      const result = service.applyFilters(items, {
        urgency: [],
        categories: [],
        proximity: null,
        timeRange: { startIso: new Date(Date.now() - 500).toISOString(), endIso: new Date(Date.now() + 1000).toISOString() },
      });
      // Only the item created within the last 500ms should be included
      expect(result.every((i) => new Date(i.createdAt!).getTime() >= Date.now() - 500 - 50)).toBe(true);
    });
  });

  describe('presets', () => {
    it('lists the seeded default presets', () => {
      expect(service.listPresets().length).toBeGreaterThanOrEqual(3);
    });

    it('retrieves a preset by id', () => {
      const preset = service.getPreset('preset_urgent_only');
      expect(preset?.name).toBe('Urgent Only');
    });
  });
});
