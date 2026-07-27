import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";

export type PushState = "unsupported" | "denied" | "prompt" | "loading" | "subscribed" | "unsubscribed";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export function usePushNotifications(token: string | null) {
  const [state, setState] = useState<PushState>("loading");

  // Detect current state on mount
  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setState("unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setState("denied");
      return;
    }

    navigator.serviceWorker.ready.then(async (reg) => {
      const existing = await reg.pushManager.getSubscription();
      setState(existing ? "subscribed" : "unsubscribed");
    }).catch(() => setState("unsubscribed"));
  }, []);

  const subscribe = useCallback(async () => {
    if (!token) return;
    setState("loading");
    try {
      // Get VAPID public key
      const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY as string;
      if (!vapidKey) throw new Error("VAPID public key not configured");

      const reg = await navigator.serviceWorker.ready;

      // Request permission if not granted
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "unsubscribed");
        return;
      }

      // Subscribe
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey).buffer as ArrayBuffer,
      });

      // Send to backend
      const subJson = sub.toJSON();
      await api.pushSubscribe(token, {
        endpoint: sub.endpoint,
        keys: {
          p256dh: subJson.keys?.p256dh ?? "",
          auth: subJson.keys?.auth ?? "",
        },
      });

      setState("subscribed");
    } catch (err) {
      console.error("Push subscribe error:", err);
      setState("unsubscribed");
    }
  }, [token]);

  const unsubscribe = useCallback(async () => {
    if (!token) return;
    setState("loading");
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await api.pushUnsubscribe(token, sub.endpoint);
        await sub.unsubscribe();
      }
      setState("unsubscribed");
    } catch (err) {
      console.error("Push unsubscribe error:", err);
      setState("subscribed");
    }
  }, [token]);

  return { state, subscribe, unsubscribe };
}
