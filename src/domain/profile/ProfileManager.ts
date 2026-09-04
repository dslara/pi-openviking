import type { ProfileConfig, ProfileBehavior } from "../common/profile-config";

/**
 * Stateful manager for behavioral profiles.
 *
 * Created at init time from the validated config's `profile.profiles` registry
 * and the `profile.activeProfile` value. In F7a, only `init()` uses it — merges
 * the resolved behavior into `RecallConfig` before constructing services.
 *
 * In F7b, ProfileManager is injected into services that need runtime profile
 * switching via `/ov-profile apply`, and supports AutoDetect.
 */
export class ProfileManager {
  private activeProfile: string;
  private profiles: Record<string, ProfileConfig>;

  /**
   * @param profiles  Profile registry (name → ProfileConfig)
   * @param activeProfile  The initial active profile name
   * @throws if activeProfile is not found in profiles
   */
  constructor(
    profiles: Record<string, ProfileConfig>,
    activeProfile: string,
  ) {
    if (!profiles[activeProfile]) {
      throw new Error(
        `ProfileManager: activeProfile "${activeProfile}" not found in profiles registry`,
      );
    }
    this.profiles = profiles;
    this.activeProfile = activeProfile;
  }

  /** Returns the current active profile name. */
  getActive(): string {
    return this.activeProfile;
  }

  /**
   * Returns a shallow copy of the profile's behavior — only populated fields.
   * Undefined fields mean "no override" for the merge step.
   *
   * @throws if name is not found in profiles
   */
  resolve(name: string): ProfileBehavior {
    const profile = this.profiles[name];
    if (!profile) {
      throw new Error(
        `ProfileManager: profile "${name}" not found`,
      );
    }
    return { ...profile.behavior };
  }

  /**
   * Changes the active profile. Validates that the name exists.
   *
   * @throws if name is not found in profiles
   */
  apply(name: string): void {
    if (!this.profiles[name]) {
      throw new Error(
        `ProfileManager: cannot apply — profile "${name}" not found`,
      );
    }
    this.activeProfile = name;
  }

  /** Returns all registered profile names. */
  list(): string[] {
    return Object.keys(this.profiles);
  }
}
