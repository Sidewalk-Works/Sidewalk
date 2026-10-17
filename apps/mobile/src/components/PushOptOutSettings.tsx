import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Switch,
  Alert,
} from 'react-native';
import type { PushRegistrationState } from '../services/pushRegistrationService';

interface PushOptOutSettingsProps {
  registrationState: PushRegistrationState | null;
  onToggleOptOut: (optedOut: boolean) => void;
  onRevokeAccess: () => void;
}

const STATUS_CONFIG = {
  registered: { color: '#22c55e', label: 'Registered', bg: '#f0fdf4' },
  optedOut: { color: '#f59e0b', label: 'Opted Out', bg: '#fffbeb' },
  unregistered: { color: '#94a3b8', label: 'Not Registered', bg: '#f8fafc' },
} as const;

function getStatus(registrationState: PushRegistrationState | null): keyof typeof STATUS_CONFIG {
  if (!registrationState?.isRegistered) return 'unregistered';
  if (registrationState.optOut) return 'optedOut';
  return 'registered';
}

export function PushOptOutSettings({
  registrationState,
  onToggleOptOut,
  onRevokeAccess,
}: PushOptOutSettingsProps) {
  const status = getStatus(registrationState);
  const statusInfo = STATUS_CONFIG[status];

  const handleToggle = useCallback(
    (value: boolean) => {
      if (value && registrationState?.isRegistered) {
        Alert.alert(
          'Re-enable Push Notifications',
          'You will start receiving push alerts again.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Re-enable', onPress: () => onToggleOptOut(false) },
          ],
        );
      } else if (!value && registrationState?.isRegistered) {
        onToggleOptOut(true);
      }
    },
    [registrationState, onToggleOptOut],
  );

  const handleRevoke = useCallback(() => {
    Alert.alert(
      'Revoke Push Access',
      'This will remove push notification access for this device. You can register again later.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Revoke', style: 'destructive', onPress: onRevokeAccess },
      ],
    );
  }, [onRevokeAccess]);

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Push Notification Settings</Text>

      <View style={[styles.statusBar, { backgroundColor: statusInfo.bg }]}>
        <View style={styles.statusRow}>
          <View style={[styles.statusDot, { backgroundColor: statusInfo.color }]} />
          <Text style={[styles.statusLabel, { color: statusInfo.color }]}>
            {statusInfo.label}
          </Text>
        </View>
        {registrationState?.registeredAtIso && (
          <Text style={styles.registeredAt}>
            Registered {new Date(registrationState.registeredAtIso).toLocaleDateString()}
          </Text>
        )}
      </View>

      {registrationState?.isRegistered && (
        <View style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>Push Notifications</Text>
            <Text style={styles.settingDescription}>
              Receive real-time alerts on this device
            </Text>
          </View>
          <Switch
            value={!registrationState.optOut}
            onValueChange={handleToggle}
            trackColor={{ false: '#cbd5e1', true: '#93c5fd' }}
            thumbColor={registrationState.optOut ? '#94a3b8' : '#3b82f6'}
          />
        </View>
      )}

      {registrationState?.isRegistered && (
        <View style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>Revoke Device Access</Text>
            <Text style={styles.settingDescription}>
              Remove push token from this device entirely
            </Text>
          </View>
          <TouchableOpacity
            style={styles.revokeButton}
            onPress={handleRevoke}
            activeOpacity={0.8}
          >
            <Text style={styles.revokeButtonText}>Revoke</Text>
          </TouchableOpacity>
        </View>
      )}

      {!registrationState?.isRegistered && (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>
            This device is not registered for push notifications.
          </Text>
        </View>
      )}

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          In-app notifications are always active. Opting out of push only affects
          push notifications.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  heading: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0f172a',
    marginBottom: 16,
  },
  statusBar: {
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  registeredAt: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 4,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  settingInfo: {
    flex: 1,
    marginRight: 16,
  },
  settingLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#0f172a',
  },
  settingDescription: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  revokeButton: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 6,
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  revokeButtonText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#b91c1c',
  },
  emptyState: {
    padding: 20,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 13,
    color: '#94a3b8',
  },
  footer: {
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  footerText: {
    fontSize: 12,
    color: '#94a3b8',
    lineHeight: 16,
  },
});
