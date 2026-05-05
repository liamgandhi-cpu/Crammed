import webpush from "web-push";

let initialized = false;

function init() {
  if (initialized) return;
  const subject = (process.env.VAPID_SUBJECT ?? "mailto:admin@myautoplanner.vercel.app").trim();
  const publicKey = (process.env.VAPID_PUBLIC_KEY ?? "").trim();
  const privateKey = (process.env.VAPID_PRIVATE_KEY ?? "").trim();
  if (!publicKey || !privateKey) throw new Error("VAPID keys not configured");
  webpush.setVapidDetails(subject, publicKey, privateKey);
  initialized = true;
}

export interface PushPayload {
  title: string;
  body: string;
  tag?: string;
  url?: string;
}

export async function sendPush(
  subscription: webpush.PushSubscription,
  payload: PushPayload
): Promise<void> {
  init();
  await webpush.sendNotification(subscription, JSON.stringify(payload));
}
