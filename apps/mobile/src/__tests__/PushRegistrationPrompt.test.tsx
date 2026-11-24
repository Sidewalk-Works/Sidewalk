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

    const buttons = tree!.root.findAll(
      (node) => node.props?.onPress && node.props?.disabled !== undefined,
    );
    const enableButton = buttons.find((node) =>
      String(node.props.children?.props?.children ?? node.props.children).includes('Enable'),
    ) ?? buttons[0];

    await act(async () => {
      await enableButton.props.onPress();
    });

    expect(onRegister).toHaveBeenCalledTimes(1);
    expect(onRegister.mock.calls[0][0]).toMatch(/^device_/);
  });

  it('shows an alert when registration fails', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const onRegister = jest.fn().mockResolvedValue({ success: false, error: 'Denied' });
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<PushRegistrationPrompt onRegister={onRegister} />);
    });

    const button = tree!.root.findAll((node) => node.props?.onPress)[0];
    await act(async () => {
      await button.props.onPress();
    });

    expect(alertSpy).toHaveBeenCalledWith('Registration Failed', 'Denied');
    alertSpy.mockRestore();
  });
});
