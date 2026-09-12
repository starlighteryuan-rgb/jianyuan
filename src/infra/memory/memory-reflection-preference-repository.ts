/**
 * In-memory ReflectionPreferenceRepository (§33).
 *
 * One slot, overwritten in place. No history: §33 forbids inferring stable
 * identity from preferences, and a history would invite reading consistency over
 * time as evidence about the person.
 */

import type { ReflectionPreferenceRepository } from '../../domain/ports/repositories';
import type { ReflectionPreference } from '../../domain/reflection/reflection-preference';

export class MemoryReflectionPreferenceRepository
  implements ReflectionPreferenceRepository
{
  private preference: ReflectionPreference | null = null;

  async find(): Promise<ReflectionPreference | null> {
    // Null means unset, not default.
    return this.preference;
  }

  async save(preference: ReflectionPreference): Promise<void> {
    this.preference = preference;
  }

  clear(): void {
    this.preference = null;
  }
}
