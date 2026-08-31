# Design Mockup Components

This folder contains static/prop-driven design mockup components used as
visual references during feature planning and Storybook-style exploration.

**These are NOT production components.** They parallel real components
(e.g. `AlertPreviewDesign` vs the real `AlertPreviewExplainer`) but are
intended only for design iteration, not for use in the live application.

## Purpose

- Serve as low-fidelity prototypes for new notification UI patterns
- Provide Storybook-ready visual targets before real implementations begin
- Allow designers and engineers to iterate on layout without touching
  production code

## Components

| Component | Real counterpart | Notes |
|---|---|---|
| `AlertPreviewDesign` | `AlertPreviewExplainer` | Mockup of alert preview cards |
| `DeliveryFallbackDesign` | — | Design exploration for delivery fallback UI |
| `EngagementPromptDesign` | — | Mockup of engagement prompt banners |
| `LifecycleTriggerDesign` | — | Design exploration for lifecycle event triggers |
| `NotificationHistoryDesign` | — | Mockup of notification history list |
| `RespectfulDefaultsDesign` | — | Design exploration for respectful default settings |
| `SettingsPersistenceDesign` | — | Mockup of settings persistence UX |
| `SubscriptionCleanupDesign` | — | Mockup of subscription cleanup flows |

## Import

Do **not** import these components in production routes or pages.
They are excluded from the production bundle by convention.
