import { ProfileConfig } from './types';
import { stripAnsi } from './ring-buffer';

export class ProfileMatcher {
  private readonly profiles: ProfileConfig[];

  constructor(profiles: ProfileConfig[]) {
    this.profiles = profiles;
  }

  match(output: string): ProfileConfig | null {
    const stripped = stripAnsi(output);
    for (const profile of this.profiles) {
      if (stripped.includes(profile.fingerprint)) {
        return profile;
      }
    }
    return null;
  }
}
