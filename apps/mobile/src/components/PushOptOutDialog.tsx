import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ActivityIndicator,
} from 'react-native';

interface PushOptOutDialogProps {
  visible: boolean;
  isCurrentlyOptedOut: boolean;
  onConfirmOptOut: () => void;
  onConfirmOptIn: () => void;
  onCancel: () => void;
}

export function PushOptOutDialog({
  visible,
  isCurrentlyOptedOut,
  onConfirmOptOut,
  onConfirmOptIn,
  onCancel,
}: PushOptOutDialogProps) {
  const [isProcessing, setIsProcessing] = useState(false);

  const handleConfirm = useCallback(async () => {
    setIsProcessing(true);
    try {
      if (isCurrentlyOptedOut) {
        onConfirmOptIn();
      } else {
        onConfirmOptOut();
      }
    } finally {
      setIsProcessing(false);
    }
  }, [isCurrentlyOptedOut, onConfirmOptOut, onConfirmOptIn]);

  const title = isCurrentlyOptedOut
    ? 'Re-enable Push Notifications'
    : 'Opt Out of Push Notifications';

  const description = isCurrentlyOptedOut
    ? 'You will start receiving push alerts again. You can change this anytime in settings.'
    : 'You will no longer receive push notifications. You will still receive in-app notifications. You can re-enable this anytime in settings.';

  const confirmLabel = isCurrentlyOptedOut ? 'Re-enable' : 'Yes, Opt Out';
  const confirmColor = isCurrentlyOptedOut ? '#22c55e' : '#ef4444';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <View style={styles.dialog}>
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
          </View>
          <Text style={styles.description}>{description}</Text>
          <View style={styles.infoBox}>
            <Text style={styles.infoText}>
              {isCurrentlyOptedOut
                ? 'Your in-app notifications remain active.'
                : 'Your in-app notifications will remain active regardless of this setting.'}
            </Text>
          </View>
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.confirmButton, { backgroundColor: confirmColor }, isProcessing && styles.disabledButton]}
              onPress={handleConfirm}
              disabled={isProcessing}
              activeOpacity={0.8}
            >
              {isProcessing ? (
                <ActivityIndicator color="#ffffff" size="small" />
              ) : (
                <Text style={styles.confirmButtonText}>{confirmLabel}</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelButton} onPress={onCancel} activeOpacity={0.8}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  dialog: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  header: {
    marginBottom: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a',
  },
  description: {
    fontSize: 14,
    color: '#475569',
    lineHeight: 20,
    marginBottom: 16,
  },
  infoBox: {
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 20,
  },
  infoText: {
    fontSize: 13,
    color: '#64748b',
    lineHeight: 18,
  },
  actions: {
    gap: 10,
  },
  confirmButton: {
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  disabledButton: {
    opacity: 0.6,
  },
  confirmButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
  cancelButton: {
    paddingVertical: 10,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#64748b',
    fontSize: 14,
  },
});
