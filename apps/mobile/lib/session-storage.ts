import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const isWeb = Platform.OS === 'web';

/** Keep refresh tokens in the platform's secure store. On web, keep auth in memory only. */
export function getStoredSession(): Promise<string | null> {
  return isWeb ? Promise.resolve(null) : SecureStore.getItemAsync('mahalla.session.v1');
}

export function storeSession(value: string): Promise<void> {
  return isWeb ? Promise.resolve() : SecureStore.setItemAsync('mahalla.session.v1', value);
}

export function clearStoredSession(): Promise<void> {
  return isWeb ? Promise.resolve() : SecureStore.deleteItemAsync('mahalla.session.v1');
}
