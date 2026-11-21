import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';

interface PushRegistrationPromptProps {
  onRegister: (deviceToken: string) => Promise<{ success: boolean; error?: string }>;
  onDismiss?: () => void;
  title?: string;
  description?: string;
}

export function PushRegistrationPrompt({
  onRegister,
  onDismiss,
  title = 'Enable Push Notifications',
  description = 'Stay informed about civic activity in your neighborhood. We will only send you alerts you care about.',
}: PushRegistrationPromptProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleRegister = useCallback(async () => {
    setIsLoading(true);
    try {
      const mockToken = `device_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      const result = await onRegister(mockToken);
      if (!result.success && result.error) {
        Alert.alert('Registration Failed', result.error);
      }
    } catch {
      Alert.alert('Registration Failed', 'An unexpected error occurred.');
    } finally {
      setIsLoading(false);
    }
  }, [onRegister]);

  return (
    <View style={styles.container}>
      <View style={styles.iconContainer}>
        <Text style={styles.icon}>🔔</Text>
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>
      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.primaryButton, isLoading && styles.disabledButton]}
          onPress={handleRegister}
          disabled={isLoading}
          activeOpacity={0.8}
        >
          {isLoading ? (
            <ActivityIndicator color="#ffffff" size="small" />
          ) : (
            <Text style={styles.primaryButtonText}>Enable Notifications</Text>
          )}
        </TouchableOpacity>
        {onDismiss && (
          <TouchableOpacity style={styles.dismissButton} onPress={onDismiss} activeOpacity={0.8}>
            <Text style={styles.dismissButtonText}>Not now</Text>
          </TouchableOpacity>
        )}
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
    alignItems: 'center',
  },
  iconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#eff6ff',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  icon: {
    fontSize: 28,
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    color: '#0f172a',
    marginBottom: 6,
    textAlign: 'center',
  },
  description: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 16,
  },
  actions: {
    width: '100%',
    gap: 10,
  },
  primaryButton: {
    backgroundColor: '#3b82f6',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
  },
  disabledButton: {
    opacity: 0.6,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
  dismissButton: {
    paddingVertical: 10,
    alignItems: 'center',
  },
  dismissButtonText: {
    color: '#64748b',
    fontSize: 14,
  },
});
