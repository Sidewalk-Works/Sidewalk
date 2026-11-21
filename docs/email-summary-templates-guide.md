# Email Summary Templates Guide

This document details the template generation for daily and weekly scheduled update digests in Sidewalk.

## Architecture

1. **Email Summary Service**:
   - Planned backend service (not implemented; current module: `apps/api/src/modules/notifications/`): Populates HTML payload structures based on scheduled intervals.

2. **Web Preview UI**:
   - `EmailDigestPreview`: React component used in the admin panel to preview how generated email templates look.

3. **Validation Schemas & Interfaces**:
   - `emailDigestTemplateSchema` and `EmailDigestTemplate` defined in `@sidewalk/shared`.
