import { createAudioPlayer, type AudioPlayer } from "expo-audio";

export type AppSoundName =
  | "like"
  | "comment"
  | "notification"
  | "message"
  | "error"
  | "send";

type SoundPreferences = {
  masterPush: boolean;
  messageAlert: boolean;
  postAlert: boolean;
};

const sources: Record<AppSoundName, number> = {
  like: require("../assets/sounds/like.mp3"),
  comment: require("../assets/sounds/send.mp3"),
  notification: require("../assets/sounds/notification.mp3"),
  message: require("../assets/sounds/message.mp3"),
  error: require("../assets/sounds/error.mp3"),
  send: require("../assets/sounds/send.mp3"),
};

const players: Partial<Record<AppSoundName, AudioPlayer>> = {};
let preferences: SoundPreferences = {
  masterPush: true,
  messageAlert: true,
  postAlert: true,
};
let activeChatPeerUid: string | null = null;

/** Sync the user's existing Firebase alert settings with local sound playback. */
export function syncAppSoundPreferences(value: unknown) {
  const settings =
    value && typeof value === "object"
      ? (value as Partial<SoundPreferences>)
      : {};
  preferences = {
    masterPush: settings.masterPush !== false,
    messageAlert: settings.messageAlert !== false,
    postAlert: settings.postAlert !== false,
  };
}

/** Used to match the Web App rule: mute a message from the open chat peer. */
export function setActiveChatPeerUid(uid: string | null) {
  activeChatPeerUid = uid;
}

function isSoundEnabled(name: AppSoundName, fromUid?: string | null) {
  if (name === "like" || name === "comment") {
    return preferences.masterPush && preferences.postAlert;
  }
  if (name === "notification") return preferences.masterPush;
  if (name === "message") {
    return (
      preferences.masterPush &&
      preferences.messageAlert &&
      !(fromUid && fromUid === activeChatPeerUid)
    );
  }
  return true;
}

/** Play one bundled Web-App sound effect; failures never interrupt user actions. */
export function playAppSound(name: AppSoundName, fromUid?: string | null) {
  if (!isSoundEnabled(name, fromUid)) return;

  try {
    let player = players[name];
    if (!player) {
      player = createAudioPlayer(sources[name]);
      player.volume = 0.55;
      player.loop = false;
      players[name] = player;
      player.play();
      return;
    }

    void player
      .seekTo(0)
      .then(() => player?.play())
      .catch(() => {
        try {
          player?.play();
        } catch {
          // An unavailable audio device or interrupted session is non-fatal.
        }
      });
  } catch {
    // Sound effects are best-effort and must not block posts, chats, or alerts.
  }
}
