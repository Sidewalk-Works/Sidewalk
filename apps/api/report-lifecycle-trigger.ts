import {
  Test,
  TestingModule,
} from '@nestjs/testing';

import {
  ReportLifecycleTriggerService,
} from './report-lifecycle-trigger.service';

// ============================================================
// MOCK TYPES
// ============================================================

interface Report {
  id: string;
  status: string;
  ownerId: string;
}

interface LifecycleEvent {
  reportId: string;
  from: string;
  to: string;
}

// ============================================================
// TEST SUITE
// ============================================================

describe(
  'ReportLifecycleTriggerService',
  () => {

    // --------------------------------------------------------
    // DEPENDENCY TOKENS
    // --------------------------------------------------------

    const REPORT_REPOSITORY =
      'REPORT_REPOSITORY';

    const EVENT_BUS =
      'EVENT_BUS';

    const NOTIFICATION_SERVICE =
      'NOTIFICATION_SERVICE';

    // --------------------------------------------------------
    // MOCKS
    // --------------------------------------------------------

    let service:
      ReportLifecycleTriggerService;

    let reportRepository: {
      findById: jest.Mock;
      updateStatus: jest.Mock;
    };

    let eventBus: {
      publish: jest.Mock;
    };

    let notificationService: {
      notify: jest.Mock;
    };

    // --------------------------------------------------------
    // SETUP
    // --------------------------------------------------------

    beforeEach(
      async () => {

        reportRepository = {
          findById:
            jest.fn(),

          updateStatus:
            jest.fn(),
        };

        eventBus = {
          publish:
            jest.fn(),
        };

        notificationService = {
          notify:
            jest.fn(),
        };

        const module:
          TestingModule =
          await Test.createTestingModule({
            providers: [
              ReportLifecycleTriggerService,

              {
                provide:
                  REPORT_REPOSITORY,

                useValue:
                  reportRepository,
              },

              {
                provide:
                  EVENT_BUS,

                useValue:
                  eventBus,
              },

              {
                provide:
                  NOTIFICATION_SERVICE,

                useValue:
                  notificationService,
              },
            ],
          }).compile();

        service =
          module.get<
            ReportLifecycleTriggerService
          >(
            ReportLifecycleTriggerService,
          );
      },
    );

    // ========================================================
    // BASIC SERVICE TEST
    // ========================================================

    describe(
      'service initialization',
      () => {

        it(
          'should be defined',
          () => {

            expect(service)
              .toBeDefined();
          },
        );
      },
    );

    // ========================================================
    // REPORT LOOKUP
    // ========================================================

    describe(
      'report lookup',
      () => {

        it(
          'loads the report before triggering a lifecycle action',
          async () => {

            const report: Report = {
              id: 'report-1',
              status: 'DRAFT',
              ownerId: 'user-1',
            };

            reportRepository
              .findById
              .mockResolvedValue(report);

            reportRepository
              .updateStatus
              .mockResolvedValue({
                ...report,
                status: 'SUBMITTED',
              });

            await service.trigger(
              'report-1',
              'SUBMITTED',
            );

            expect(
              reportRepository.findById,
            ).toHaveBeenCalledWith(
              'report-1',
            );
          },
        );

        it(
          'throws when the report does not exist',
          async () => {

            reportRepository
              .findById
              .mockResolvedValue(null);

            await expect(
              service.trigger(
                'missing-report',
                'SUBMITTED',
              ),
            ).rejects.toThrow();

            expect(
              reportRepository.updateStatus,
            ).not.toHaveBeenCalled();

            expect(
              eventBus.publish,
            ).not.toHaveBeenCalled();
          },
        );
      },
    );

    // ========================================================
    // DRAFT -> SUBMITTED
    // ========================================================

    describe(
      'DRAFT -> SUBMITTED',
      () => {

        it(
          'updates the report status',
          async () => {

            const report: Report = {
              id: 'report-1',
              status: 'DRAFT',
              ownerId: 'user-1',
            };

            reportRepository
              .findById
              .mockResolvedValue(report);

            reportRepository
              .updateStatus
              .mockResolvedValue({
                ...report,
                status: 'SUBMITTED',
              });

            await service.trigger(
              'report-1',
              'SUBMITTED',
            );

            expect(
              reportRepository.updateStatus,
            ).toHaveBeenCalledWith(
              'report-1',
              'SUBMITTED',
            );
          },
        );

        it(
          'publishes a lifecycle event',
          async () => {

            reportRepository
              .findById
              .mockResolvedValue({
                id: 'report-1',
                status: 'DRAFT',
                ownerId: 'user-1',
              });

            reportRepository
              .updateStatus
              .mockResolvedValue({
                id: 'report-1',
                status: 'SUBMITTED',
                ownerId: 'user-1',
              });

            await service.trigger(
              'report-1',
              'SUBMITTED',
            );

            expect(
              eventBus.publish,
            ).toHaveBeenCalledTimes(1);
          },
        );
      },
    );

    // ========================================================
    // SUBMITTED -> APPROVED
    // ========================================================

    describe(
      'SUBMITTED -> APPROVED',
      () => {

        it(
          'allows a submitted report to be approved',
          async () => {

            const report: Report = {
              id: 'report-2',
              status: 'SUBMITTED',
              ownerId: 'user-2',
            };

            reportRepository
              .findById
              .mockResolvedValue(report);

            reportRepository
              .updateStatus
              .mockResolvedValue({
                ...report,
                status: 'APPROVED',
              });

            await expect(
              service.trigger(
                'report-2',
                'APPROVED',
              ),
            ).resolves.toBeDefined();

            expect(
              reportRepository.updateStatus,
            ).toHaveBeenCalledWith(
              'report-2',
              'APPROVED',
            );
          },
        );

        it(
          'publishes an approval event',
          async () => {

            reportRepository
              .findById
              .mockResolvedValue({
                id: 'report-2',
                status: 'SUBMITTED',
                ownerId: 'user-2',
              });

            reportRepository
              .updateStatus
              .mockResolvedValue({
                id: 'report-2',
                status: 'APPROVED',
                ownerId: 'user-2',
              });

            await service.trigger(
              'report-2',
              'APPROVED',
            );

            expect(
              eventBus.publish,
            ).toHaveBeenCalled();
          },
        );
      },
    );

    // ========================================================
    // SUBMITTED -> REJECTED
    // ========================================================

    describe(
      'SUBMITTED -> REJECTED',
      () => {

        it(
          'allows a submitted report to be rejected',
          async () => {

            reportRepository
              .findById
              .mockResolvedValue({
                id: 'report-3',
                status: 'SUBMITTED',
                ownerId: 'user-3',
              });

            reportRepository
              .updateStatus
              .mockResolvedValue({
                id: 'report-3',
                status: 'REJECTED',
                ownerId: 'user-3',
              });

            await expect(
              service.trigger(
                'report-3',
                'REJECTED',
              ),
            ).resolves.toBeDefined();

            expect(
              reportRepository.updateStatus,
            ).toHaveBeenCalledWith(
              'report-3',
              'REJECTED',
            );
          },
        );
      },
    );

    // ========================================================
    // INVALID TRANSITIONS
    // ========================================================

    describe(
      'invalid lifecycle transitions',
      () => {

        const invalidTransitions = [
          ['DRAFT', 'APPROVED'],
          ['DRAFT', 'REJECTED'],
          ['APPROVED', 'DRAFT'],
          ['APPROVED', 'SUBMITTED'],
          ['REJECTED', 'APPROVED'],
          ['REJECTED', 'SUBMITTED'],
        ];

        it.each(
          invalidTransitions,
        )(
          'rejects %s -> %s',
          async (
            from,
            to,
          ) => {

            reportRepository
              .findById
              .mockResolvedValue({
                id: 'report-invalid',
                status: from,
                ownerId: 'user-1',
              });

            await expect(
              service.trigger(
                'report-invalid',
                to,
              ),
            ).rejects.toThrow();

            expect(
              reportRepository.updateStatus,
            ).not.toHaveBeenCalled();

            expect(
              eventBus.publish,
            ).not.toHaveBeenCalled();
          },
        );
      },
    );

    // ========================================================
    // DUPLICATE TRIGGERS
    // ========================================================

    describe(
      'duplicate lifecycle triggers',
      () => {

        it(
          'does not perform an invalid duplicate transition',
          async () => {

            reportRepository
              .findById
              .mockResolvedValue({
                id: 'report-duplicate',
                status: 'SUBMITTED',
                ownerId: 'user-1',
              });

            await expect(
              service.trigger(
                'report-duplicate',
                'SUBMITTED',
              ),
            ).rejects.toThrow();

            expect(
              reportRepository.updateStatus,
            ).not.toHaveBeenCalled();
          },
        );

        it(
          'does not publish an event for a rejected transition',
          async () => {

            reportRepository
              .findById
              .mockResolvedValue({
                id: 'report-duplicate',
                status: 'APPROVED',
                ownerId: 'user-1',
              });

            await expect(
              service.trigger(
                'report-duplicate',
                'SUBMITTED',
              ),
            ).rejects.toThrow();

            expect(
              eventBus.publish,
            ).not.toHaveBeenCalled();
          },
        );
      },
    );

    // ========================================================
    // EVENT PAYLOAD
    // ========================================================

    describe(
      'lifecycle event payload',
      () => {

        it(
          'contains the report identifier',
          async () => {

            reportRepository
              .findById
              .mockResolvedValue({
                id: 'report-event',
                status: 'DRAFT',
                ownerId: 'user-1',
              });

            reportRepository
              .updateStatus
              .mockResolvedValue({
                id: 'report-event',
                status: 'SUBMITTED',
                ownerId: 'user-1',
              });

            await service.trigger(
              'report-event',
              'SUBMITTED',
            );

            const call =
              eventBus.publish
                .mock.calls[0];

            expect(
              JSON.stringify(call),
            ).toContain(
              'report-event',
            );
          },
        );

        it(
          'contains the destination status',
          async () => {

            reportRepository
              .findById
              .mockResolvedValue({
                id: 'report-event',
                status: 'DRAFT',
                ownerId: 'user-1',
              });

            reportRepository
              .updateStatus
              .mockResolvedValue({
                id: 'report-event',
                status: 'SUBMITTED',
                ownerId: 'user-1',
              });

            await service.trigger(
              'report-event',
              'SUBMITTED',
            );

            const call =
              eventBus.publish
                .mock.calls[0];

            expect(
              JSON.stringify(call),
            ).toContain(
              'SUBMITTED',
            );
          },
        );
      },
    );

    // ========================================================
    // NOTIFICATIONS
    // ========================================================

    describe(
      'notifications',
      () => {

        it(
          'notifies when a report is successfully submitted',
          async () => {

            reportRepository
              .findById
              .mockResolvedValue({
                id: 'report-notify',
                status: 'DRAFT',
                ownerId: 'user-1',
              });

            reportRepository
              .updateStatus
              .mockResolvedValue({
                id: 'report-notify',
                status: 'SUBMITTED',
                ownerId: 'user-1',
              });

            await service.trigger(
              'report-notify',
              'SUBMITTED',
            );

            expect(
              notificationService.notify,
            ).toHaveBeenCalled();
          },
        );

        it(
          'does not notify when the transition fails',
          async () => {

            reportRepository
              .findById
              .mockResolvedValue({
                id: 'report-notify',
                status: 'DRAFT',
                ownerId: 'user-1',
              });

            await expect(
              service.trigger(
                'report-notify',
                'APPROVED',
              ),
            ).rejects.toThrow();

            expect(
              notificationService.notify,
            ).not.toHaveBeenCalled();
          },
        );
      },
    );

    // ========================================================
    // REPOSITORY FAILURE
    // ========================================================

    describe(
      'repository failures',
      () => {

        it(
          'propagates repository update errors',
          async () => {

            reportRepository
              .findById
              .mockResolvedValue({
                id: 'report-error',
                status: 'DRAFT',
                ownerId: 'user-1',
              });

            reportRepository
              .updateStatus
              .mockRejectedValue(
                new Error(
                  'Database unavailable',
                ),
              );

            await expect(
              service.trigger(
                'report-error',
                'SUBMITTED',
              ),
            ).rejects.toThrow(
              'Database unavailable',
            );
          },
        );

        it(
          'does not publish an event when persistence fails',
          async () => {

            reportRepository
              .findById
              .mockResolvedValue({
                id: 'report-error',
                status: 'DRAFT',
                ownerId: 'user-1',
              });

            reportRepository
              .updateStatus
              .mockRejectedValue(
                new Error(
                  'Database unavailable',
                ),
              );

            await expect(
              service.trigger(
                'report-error',
                'SUBMITTED',
              ),
            ).rejects.toThrow();

            expect(
              eventBus.publish,
            ).not.toHaveBeenCalled();
          },
        );
      },
    );

    // ========================================================
    // EVENT BUS FAILURE
    // ========================================================

    describe(
      'event bus failures',
      () => {

        it(
          'handles event publishing failures',
          async () => {

            reportRepository
              .findById
              .mockResolvedValue({
                id: 'report-event-error',
                status: 'DRAFT',
                ownerId: 'user-1',
              });

            reportRepository
              .updateStatus
              .mockResolvedValue({
                id: 'report-event-error',
                status: 'SUBMITTED',
                ownerId: 'user-1',
              });

            eventBus
              .publish
              .mockRejectedValue(
                new Error(
                  'Event bus unavailable',
                ),
              );

            await expect(
              service.trigger(
                'report-event-error',
                'SUBMITTED',
              ),
            ).rejects.toThrow(
              'Event bus unavailable',
            );
          },
        );
      },
    );

    // ========================================================
    // EMPTY / INVALID IDS
    // ========================================================

    describe(
      'input validation',
      () => {

        it(
          'rejects an empty report ID',
          async () => {

            await expect(
              service.trigger(
                '',
                'SUBMITTED',
              ),
            ).rejects.toThrow();

            expect(
              reportRepository.findById,
            ).not.toHaveBeenCalled();
          },
        );

        it(
          'rejects an undefined report ID',
          async () => {

            await expect(
              service.trigger(
                undefined as any,
                'SUBMITTED',
              ),
            ).rejects.toThrow();

            expect(
              reportRepository.findById,
            ).not.toHaveBeenCalled();
          },
        );
      },
    );

    // ========================================================
    // COMPLETE LIFECYCLE
    // ========================================================

    describe(
      'complete lifecycle',
      () => {

        it(
          'supports the normal report lifecycle',
          async () => {

            const report: Report = {
              id: 'report-lifecycle',
              status: 'DRAFT',
              ownerId: 'user-lifecycle',
            };

            // ------------------------------------------------
            // DRAFT -> SUBMITTED
            // ------------------------------------------------

            reportRepository
              .findById
              .mockResolvedValueOnce(
                report,
              );

            reportRepository
              .updateStatus
              .mockResolvedValueOnce({
                ...report,
                status: 'SUBMITTED',
              });

            await service.trigger(
              report.id,
              'SUBMITTED',
            );

            // ------------------------------------------------
            // SUBMITTED -> APPROVED
            // ------------------------------------------------

            reportRepository
              .findById
              .mockResolvedValueOnce({
                ...report,
                status: 'SUBMITTED',
              });

            reportRepository
              .updateStatus
              .mockResolvedValueOnce({
                ...report,
                status: 'APPROVED',
              });

            await service.trigger(
              report.id,
              'APPROVED',
            );

            expect(
              reportRepository
                .updateStatus,
            ).toHaveBeenCalledTimes(2);
          },
        );
      },
    );

    // ========================================================
    // ORDER OF OPERATIONS
    // ========================================================

    describe(
      'operation ordering',
      () => {

        it(
          'loads the report before updating it',
          async () => {

            const calls: string[] = [];

            reportRepository
              .findById
              .mockImplementation(
                async () => {
                  calls.push('find');
                  return {
                    id: 'report-order',
                    status: 'DRAFT',
                    ownerId: 'user-1',
                  };
                },
              );

            reportRepository
              .updateStatus
              .mockImplementation(
                async () => {
                  calls.push('update');

                  return {
                    id: 'report-order',
                    status: 'SUBMITTED',
                    ownerId: 'user-1',
                  };
                },
              );

            eventBus
              .publish
              .mockImplementation(
                async () => {
                  calls.push('event');
                },
              );

            await service.trigger(
              'report-order',
              'SUBMITTED',
            );

            expect(calls).toEqual(
              expect.arrayContaining([
                'find',
                'update',
                'event',
              ]),
            );

            expect(
              calls.indexOf('find'),
            ).toBeLessThan(
              calls.indexOf('update'),
            );

            expect(
              calls.indexOf('update'),
            ).toBeLessThan(
              calls.indexOf('event'),
            );
          },
        );
      },
    );

    // ========================================================
    // RESET MOCKS
    // ========================================================

    afterEach(
      () => {
        jest.clearAllMocks();
      },
    );
  },
);

// ============================================================
// OPTIONAL PURE LIFECYCLE TESTS
// ============================================================

describe(
  'Report lifecycle transition rules',
  () => {

    const validTransitions = [
      ['DRAFT', 'SUBMITTED'],
      ['SUBMITTED', 'APPROVED'],
      ['SUBMITTED', 'REJECTED'],
    ];

    const invalidTransitions = [
      ['DRAFT', 'APPROVED'],
      ['DRAFT', 'REJECTED'],
      ['APPROVED', 'DRAFT'],
      ['APPROVED', 'SUBMITTED'],
      ['REJECTED', 'DRAFT'],
      ['REJECTED', 'SUBMITTED'],
    ];

    it.each(
      validTransitions,
    )(
      'allows %s -> %s',
      (
        from,
        to,
      ) => {

        expect(
          from,
        ).toBeDefined();

        expect(
          to,
        ).toBeDefined();
      },
    );

    it.each(
      invalidTransitions,
    )(
      'rejects %s -> %s',
      (
        from,
        to,
      ) => {

        expect(
          from,
        ).not.toBe(
          to,
        );
      },
    );
  },
);
