import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { PushOptOutDialog } from '../components/PushOptOutDialog';

function flushPromises() {
  return new Promise<void>((resolve) => setTimeout(resolve, 0));
}

describe('PushOptOutDialog', () => {
  it('handles async confirm path for opt-in and waits for completion', async () => {
    let resolveConfirm!: () => void;
    const onConfirmOptIn = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveConfirm = resolve;
        }),
    );
    const onConfirmOptOut = jest.fn();

    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <PushOptOutDialog
          visible
          isCurrentlyOptedOut
          onConfirmOptOut={onConfirmOptOut}
          onConfirmOptIn={onConfirmOptIn}
          onCancel={jest.fn()}
        />,
      );
    });

    const confirmButton = tree!.root.findAll(
      (node) => typeof node.props?.onPress === 'function' && 'disabled' in (node.props ?? {}),
    )[0];

    await act(async () => {
      confirmButton!.props.onPress();
      await flushPromises();
    });

    expect(onConfirmOptIn).toHaveBeenCalledTimes(1);
    expect(onConfirmOptOut).not.toHaveBeenCalled();

    await act(async () => {
      resolveConfirm();
      await flushPromises();
    });
  });
});
