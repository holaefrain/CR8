import { AppError, isAppError } from '../middleware/errors.js';
import { ErrorCodes } from '../../shared/errorCodes.js';

// Discogs usernames: letters, digits, dot, underscore, hyphen.
export const USERNAME_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;
// Personal access tokens are 40 alphanumeric characters; allow some slack.
const TOKEN_PATTERN = /^[A-Za-z0-9]{20,80}$/;

export function createAccountService({ discogs, secretStore, profileStore, now = () => new Date() }) {
  async function getMe() {
    const profile = await profileStore.get();
    const token = await secretStore.get();
    return {
      firstName: profile?.firstName || '',
      discogsUsername: profile?.discogsUsername || '',
      discogs: {
        connected: !!token,
        last4: token ? token.slice(-4) : '',
        verifiedAt: token ? profile?.tokenVerifiedAt || null : null,
      },
      onboarded: !!(profile?.discogsUsername && token),
    };
  }

  async function saveProfile({ firstName, discogsUsername }) {
    if (!USERNAME_PATTERN.test(discogsUsername)) {
      throw new AppError(ErrorCodes.VALIDATION, 400, 'That doesn\'t look like a Discogs username.');
    }
    if (!(await discogs.userExists(discogsUsername))) {
      throw new AppError(ErrorCodes.VALIDATION, 400, `No Discogs account named "${discogsUsername}".`);
    }

    const current = await profileStore.get();
    const usernameChanged = current?.discogsUsername
      && current.discogsUsername.toLowerCase() !== discogsUsername.toLowerCase();
    // A saved token belongs to the old account — it must be connected again.
    if (usernameChanged) await secretStore.clear();

    await profileStore.set({
      firstName,
      discogsUsername,
      onboardedAt: current?.onboardedAt || null,
      tokenVerifiedAt: usernameChanged ? null : current?.tokenVerifiedAt || null,
    });
    return getMe();
  }

  async function connectToken(candidate) {
    const token = String(candidate || '').trim();
    if (!TOKEN_PATTERN.test(token)) {
      throw new AppError(ErrorCodes.VALIDATION, 400, 'That doesn\'t look like a Discogs token. Copy the whole token from the Developers page.');
    }
    const profile = await profileStore.get();
    if (!profile?.discogsUsername) {
      throw new AppError(ErrorCodes.NOT_ONBOARDED, 412, 'Enter your Discogs username first.');
    }

    let identity;
    try {
      identity = await discogs.identity(token);
    } catch (e) {
      if (isAppError(e) && e.code === ErrorCodes.DISCOGS_TOKEN_INVALID) {
        throw new AppError(ErrorCodes.DISCOGS_TOKEN_INVALID, 400,
          'Discogs didn\'t accept this token. Check you copied all of it, or generate a new one.');
      }
      throw e;
    }

    if (identity.username.toLowerCase() !== profile.discogsUsername.toLowerCase()) {
      throw new AppError(ErrorCodes.DISCOGS_TOKEN_MISMATCH, 400,
        `This token belongs to @${identity.username}, not @${profile.discogsUsername}.`,
        { tokenUsername: identity.username });
    }

    await secretStore.set(token);
    const stamp = now().toISOString();
    await profileStore.set({
      ...profile,
      // Use Discogs' canonical capitalisation.
      discogsUsername: identity.username,
      onboardedAt: profile.onboardedAt || stamp,
      tokenVerifiedAt: stamp,
    });
    return getMe();
  }

  async function removeToken() {
    await secretStore.clear();
    const profile = await profileStore.get();
    if (profile) await profileStore.set({ ...profile, tokenVerifiedAt: null });
    return getMe();
  }

  return { getMe, saveProfile, connectToken, removeToken };
}

// The saved Discogs username, for services that act on the user's account.
export async function requireUsername(profileStore) {
  const profile = await profileStore.get();
  if (!profile?.discogsUsername) {
    throw new AppError(ErrorCodes.NOT_ONBOARDED, 412, 'Enter your Discogs username first.');
  }
  return profile.discogsUsername;
}
