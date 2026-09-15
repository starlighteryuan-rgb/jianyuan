/**
 * Mobile SecretStore — where a Provider API key may live, and nowhere else.
 *
 * THE INVARIANT THIS FILE EXISTS TO ENFORCE
 * An API key is a credential, not personal awareness data. It must never enter
 * the SQLite database: that file is user content, it is what a future export or
 * device backup carries, and a credential inside it would be recoverable by
 * anything that can read the file. `expo-secure-store` maps to the iOS
 * Keychain, which is the only place in this app allowed to hold one.
 *
 * M1 SCOPE
 * This is a skeleton. There is no Provider-key entry UI, no key validation, and
 * no real AI call in the Record path (see tests/record-does-not-call-ai). What
 * is delivered now is the seam itself: the interface, a Keychain-backed adapter,
 * and a defined degraded state. Later phases add UX on top without changing the
 * boundary.
 *
 * DEGRADED, NEVER FATAL
 * On an unsigned or re-signed build the Keychain can be unavailable: there may
 * be no valid signing identity, no keychain-access-groups entitlement, or an
 * app-identifier mismatch with the stored item. Every failure mode below is
 * therefore caught and reported as `unavailable`. A missing Keychain means
 * "no AI provider can be configured", never "the app will not start" and never
 * "Records cannot be saved". Record capture does not read from this store at
 * all, which is the structural reason a Keychain failure cannot break saving.
 */

export type MobileSecretStoreStatus = 'available' | 'unavailable';

export interface MobileSecretStoreSnapshot {
  readonly status: MobileSecretStoreStatus;
  /** Present only when `status` is unavailable, for diagnostics. Never a key. */
  readonly reason: string | null;
}

/** Namespaced so a future key cannot collide with unrelated app state. */
export const AI_API_KEY_SECRET_NAME = 'jianyuan.ai.api-key';

export interface MobileSecretStore {
  status(): MobileSecretStoreSnapshot;
  read(secretName: string): Promise<string | null>;
  write(secretName: string, value: string): Promise<boolean>;
  remove(secretName: string): Promise<boolean>;
}

/** Minimal surface of `expo-secure-store`, so the adapter stays testable. */
export interface SecureStoreBinding {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<boolean>;
  isAvailableAsync(): Promise<boolean>;
}

const describeError = (error: unknown): string => {
  if (error instanceof Error && error.message.length > 0) return error.message;
  return String(error);
};

/**
 * Keychain-backed store. All access is guarded: a throw from the native module
 * is converted into an unavailable status rather than propagating into the
 * composition root or the UI.
 */
export class ExpoSecureStoreSecretStore implements MobileSecretStore {
  private unavailableReason: string | null = null;

  constructor(private readonly binding: SecureStoreBinding) {}

  status(): MobileSecretStoreSnapshot {
    return this.unavailableReason === null
      ? { status: 'available', reason: null }
      : { status: 'unavailable', reason: this.unavailableReason };
  }

  async read(secretName: string): Promise<string | null> {
    try {
      const value = await this.binding.getItemAsync(secretName);
      this.unavailableReason = null;
      return value;
    } catch (error) {
      this.unavailableReason = describeError(error);
      return null;
    }
  }

  async write(secretName: string, value: string): Promise<boolean> {
    try {
      await this.binding.setItemAsync(secretName, value);
      this.unavailableReason = null;
      return true;
    } catch (error) {
      this.unavailableReason = describeError(error);
      return false;
    }
  }

  async remove(secretName: string): Promise<boolean> {
    try {
      const removed = await this.binding.deleteItemAsync(secretName);
      this.unavailableReason = null;
      return removed;
    } catch (error) {
      this.unavailableReason = describeError(error);
      return false;
    }
  }

  /**
   * Probe the Keychain once at startup so the UI can show an honest status
   * before the user tries to save a key.
   */
  async probe(): Promise<MobileSecretStoreSnapshot> {
    try {
      const available = await this.binding.isAvailableAsync();
      this.unavailableReason = available
        ? null
        : 'SecureStore reports the device keychain is unavailable.';
    } catch (error) {
      this.unavailableReason = describeError(error);
    }
    return this.status();
  }
}

/**
 * Store that holds nothing and fails closed.
 *
 * Used when `expo-secure-store` cannot be bound at all. It reports
 * unavailable instead of throwing, and `write` returns false so a caller can
 * tell the user their key was not saved rather than silently losing it.
 */
export class UnavailableSecretStore implements MobileSecretStore {
  constructor(private readonly reason: string) {}

  status(): MobileSecretStoreSnapshot {
    return { status: 'unavailable', reason: this.reason };
  }

  async read(_secretName: string): Promise<string | null> {
    return null;
  }

  async write(_secretName: string, _value: string): Promise<boolean> {
    return false;
  }

  async remove(_secretName: string): Promise<boolean> {
    return false;
  }
}

/**
 * Bind the real Keychain store, falling back to `UnavailableSecretStore`.
 *
 * The dynamic import keeps `expo-secure-store` out of the Node test graph, and
 * any resolution or availability failure degrades instead of crashing startup.
 */
export const createMobileSecretStore = async (): Promise<MobileSecretStore> => {
  try {
    const secureStore = (await import('expo-secure-store')) as unknown as {
      getItemAsync: (key: string) => Promise<string | null>;
      setItemAsync: (key: string, value: string) => Promise<void>;
      deleteItemAsync: (key: string) => Promise<boolean>;
      isAvailableAsync: () => Promise<boolean>;
    };

    const store = new ExpoSecureStoreSecretStore(secureStore);
    const snapshot = await store.probe();
    return snapshot.status === 'available'
      ? store
      : new UnavailableSecretStore(snapshot.reason ?? 'Keychain unavailable.');
  } catch (error) {
    return new UnavailableSecretStore(describeError(error));
  }
};
