import * as Api from "@/lib/_core/api";
import * as Auth from "@/lib/_core/auth";
import { pathargataAuth } from "@/lib/pathargata-firebase";
import { clearUserScopedLocalCache, setRtdbCacheUser } from "@/lib/rtdb-cache";
import { anonymousIdentifier, authDebug, authFailure } from "@/lib/safe-logger";
import { onIdTokenChanged, signOut as firebaseSignOut, type User as FirebaseUser } from "firebase/auth";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Platform } from "react-native";

type UseAuthOptions = {
  autoFetch?: boolean;
};

function toAuthUser(firebaseUser: FirebaseUser): Auth.User {
  return {
    id: firebaseUser.uid,
    openId: firebaseUser.uid,
    name: firebaseUser.displayName,
    email: firebaseUser.email,
    loginMethod: firebaseUser.providerData[0]?.providerId || "firebase",
    lastSignedIn: new Date(firebaseUser.metadata.lastSignInTime || Date.now()),
  };
}

function cachedUserMatchesFirebaseUser(
  cachedUser: Auth.User | null,
  firebaseUser: FirebaseUser,
): boolean {
  if (!cachedUser) return false;
  return (
    String(cachedUser.openId || "") === firebaseUser.uid ||
    String(cachedUser.id || "") === firebaseUser.uid
  );
}

export function useAuth(options?: UseAuthOptions) {
  const { autoFetch = true } = options ?? {};
  const [user, setUser] = useState<Auth.User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const activeUidRef = useRef<string | null>(null);
  const authGenerationRef = useRef(0);

  const clearLocalIdentity = useCallback(async () => {
    const previousUid = activeUidRef.current;
    activeUidRef.current = null;
    setRtdbCacheUser(null);
    if (previousUid) await clearUserScopedLocalCache(previousUid);
    await Promise.allSettled([Auth.removeSessionToken(), Auth.clearUserInfo()]);
    setUser(null);
  }, []);

  const validateFirebaseUser = useCallback(
    async (firebaseUser: FirebaseUser, generation: number) => {
      // Force a token refresh so revoked/expired refresh tokens are not treated
      // as a valid cached session. Firebase signs the user out on invalid tokens.
      await firebaseUser.getIdToken(true);
      if (generation !== authGenerationRef.current) return;

      const cachedUser = await Auth.getUserInfo();
      if (cachedUser && !cachedUserMatchesFirebaseUser(cachedUser, firebaseUser)) {
        await Auth.clearUserInfo();
      }

      if (activeUidRef.current && activeUidRef.current !== firebaseUser.uid) {
        await clearUserScopedLocalCache(activeUidRef.current);
      }
      activeUidRef.current = firebaseUser.uid;
      setRtdbCacheUser(firebaseUser.uid);
      const nextUser = toAuthUser(firebaseUser);
      setUser(nextUser);
      await Auth.setUserInfo(nextUser);
      authDebug("firebase_session_validated", {
        actor: anonymousIdentifier(firebaseUser.uid),
      });
    },
    [],
  );

  const fetchUser = useCallback(async () => {
    const generation = ++authGenerationRef.current;
    setLoading(true);
    setError(null);
    try {
      if (Platform.OS === "web") {
        const apiUser = await Api.getMe();
        if (generation !== authGenerationRef.current) return;
        if (!apiUser) {
          await clearLocalIdentity();
          return;
        }
        const userInfo: Auth.User = {
          id: apiUser.id,
          openId: apiUser.openId,
          name: apiUser.name,
          email: apiUser.email,
          loginMethod: apiUser.loginMethod,
          lastSignedIn: new Date(apiUser.lastSignedIn),
        };
        setUser(userInfo);
        await Auth.setUserInfo(userInfo);
        return;
      }

      const firebaseUser = pathargataAuth.currentUser;
      if (!firebaseUser) {
        await clearLocalIdentity();
        return;
      }
      await validateFirebaseUser(firebaseUser, generation);
    } catch (err) {
      if (generation !== authGenerationRef.current) return;
      authFailure("session_validation_failed", err);
      setError(new Error("সেশন যাচাই করা যায়নি"));
      if (Platform.OS !== "web") {
        await firebaseSignOut(pathargataAuth).catch(() => undefined);
      }
      await clearLocalIdentity();
    } finally {
      if (generation === authGenerationRef.current) setLoading(false);
    }
  }, [clearLocalIdentity, validateFirebaseUser]);

  const logout = useCallback(async () => {
    ++authGenerationRef.current;
    try {
      if (Platform.OS === "web") await Api.logout();
      else await firebaseSignOut(pathargataAuth);
    } catch {
      authFailure("logout_failed");
      setError(new Error("Logout সম্পন্ন করা যায়নি"));
    } finally {
      await clearLocalIdentity();
      setError(null);
      setLoading(false);
    }
  }, [clearLocalIdentity]);

  useEffect(() => {
    if (!autoFetch) {
      setLoading(false);
      return;
    }

    if (Platform.OS === "web") {
      void fetchUser();
      return;
    }

    let active = true;
    const unsubscribe = onIdTokenChanged(pathargataAuth, (firebaseUser) => {
      const generation = ++authGenerationRef.current;
      setLoading(true);
      setError(null);
      void (async () => {
        try {
          if (!firebaseUser) {
            if (generation !== authGenerationRef.current) return;
            await clearLocalIdentity();
            return;
          }
          await validateFirebaseUser(firebaseUser, generation);
        } catch (err) {
          if (!active || generation !== authGenerationRef.current) return;
          authFailure("auth_state_validation_failed", err);
          setError(new Error("সেশন যাচাই করা যায়নি"));
          await firebaseSignOut(pathargataAuth).catch(() => undefined);
          await clearLocalIdentity();
        } finally {
          if (active && generation === authGenerationRef.current) setLoading(false);
        }
      })();
    });

    return () => {
      active = false;
      ++authGenerationRef.current;
      unsubscribe();
    };
  }, [autoFetch, clearLocalIdentity, fetchUser, validateFirebaseUser]);

  const isAuthenticated = useMemo(() => Boolean(user), [user]);

  return {
    user,
    loading,
    error,
    isAuthenticated,
    refresh: fetchUser,
    logout,
  };
}
