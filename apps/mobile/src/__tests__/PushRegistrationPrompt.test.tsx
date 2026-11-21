import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Alert } from 'react-native';
import { PushRegistrationPrompt } from '../components/PushRegistrationPrompt';

describe('PushRegistrationPrompt', () => {
  it('calls onRegister when enable is pressed', async () => {
    const onRegister = jest.fn().mockResolvedValue({ success: true });
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<PushRegistrationPrompt onRegister={onRegister} />);
    });

    const button = tree!.root.findAll(
      (node) => typeof node.props?.onPress === 'function' && node.props.disabled !== undefined,
    )[0];

    await act(async () => {
      await button.props.onPress();
    });

    expect(onRegister).toHaveBeenCalledTimes(1);
    expect(onRegister.mock.calls[0][0]).toMatch(/^device_/);
  });

  it('shows feedback when registration fails without a message', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const onRegister = jest.fn().mockResolvedValue({ success: false });
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<PushRegistrationPrompt onRegister={onRegister} />);
    });

    const button = tree!.root.findAll(
      (node) => typeof node.props?.onPress === 'function' && node.props.disabled !== undefined,
    )[0];

    await act(async () => {
      await button.props.onPress();
    });

    expect(alertSpy).toHaveBeenCalledWith(
      'Registration Failed',
      'Push notification registration failed. Please try again.',
    );
    const alerts = tree!.root.findAll((node) => node.props?.accessibilityRole === 'alert');
    expect(alerts.length).toBeGreaterThan(0);
    alertSpy.mockRestore();
  });
});
