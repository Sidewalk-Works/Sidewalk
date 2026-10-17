# Civic Case Watchlist & Follow-up Guide

This document specifies the civic case watch list management, status indicators, and subscriber UI panels in Sidewalk.

## Architecture & Services

1. **Watchlist Service**:
   - `apps/api/src/modules/cases/services/civic-watchlist.service.ts`: `CivicWatchlistService` tracking user case watchlists and follow-up activities.

2. **Web Watchlist Component**:
   - `CivicCaseWatchlistPanel`: React UI component displaying active watched cases and unwatch actions.

3. **Validation Schemas & Interfaces**:
   - `civicWatchlistItemSchema` and `CivicWatchlistItem` defined in `@qyou/shared`.
