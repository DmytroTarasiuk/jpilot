import { getAuthenticatedTenantIdentity } from "@jobpilot/auth/request-context";
import { getVerifiedPrimaryEmail } from "@jobpilot/auth/email";
import { getNotificationPreferences, listOwnedNotifications } from "@jobpilot/db/notifications";
import { BellIcon, CheckIcon, MailIcon } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { markNotificationRead, saveNotificationPreferences } from "./actions";

export default async function NotificationsPage() {
  const identity = await getAuthenticatedTenantIdentity();
  if (!identity) redirect("/sign-in");
  const [items, preferences, verifiedEmail] = await Promise.all([
    listOwnedNotifications({ ...identity, limit: 50 }),
    getNotificationPreferences(identity),
    getVerifiedPrimaryEmail(),
  ]);
  return (
    <div className="max-w-4xl">
      <p className="text-sm font-medium text-[#5f7067]">Operations</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em]">Notifications</h1>
      <p className="mt-3 max-w-2xl text-[#68776f]">Search summaries and actionable connector alerts are isolated to your workspace.</p>

      <form action={saveNotificationPreferences} className="mt-8 rounded-2xl border border-[#d9e2dc] bg-white p-5">
        <div className="flex items-center gap-3"><MailIcon className="size-5 text-[#315b45]" /><h2 className="font-semibold">Email summaries</h2></div>
        <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_auto] sm:items-center">
          <div><p className="text-sm font-medium">Verified account address</p><p className="mt-1 text-sm text-[#68776f]">{verifiedEmail ?? "No verified primary email"}</p></div>
          <label className="flex items-center gap-2 text-sm"><input defaultChecked={preferences.emailEnabled && preferences.emailAddress === verifiedEmail} disabled={!verifiedEmail} name="emailEnabled" type="checkbox" /> Enable email</label>
        </div>
        <p className="mt-3 text-xs text-[#748078]">{preferences.emailTransportConfigured ? "Email delivery is configured. In-app notifications are always retained." : "In-app notifications work now. Email delivery starts after the deployment configures RESEND_API_KEY and NOTIFICATION_EMAIL_FROM."}</p>
        <button className="mt-4 rounded-full bg-[#153f2e] px-4 py-2 text-sm font-semibold text-white" type="submit">Save preferences</button>
      </form>

      <section className="mt-6 space-y-3" aria-label="Notification history">
        {items.length === 0 ? <div className="rounded-2xl border border-[#d9e2dc] bg-white p-8 text-center text-sm text-[#748078]"><BellIcon className="mx-auto mb-3 size-6" />No notifications yet.</div> : items.map((item) => (
          <article className={`rounded-2xl border bg-white p-5 ${item.readAt ? "border-[#e2e7e3]" : "border-[#9eb3a6]"}`} key={item.id}>
            <div className="flex items-start justify-between gap-4"><div><p className="font-semibold">{item.title}</p><p className="mt-2 text-sm leading-6 text-[#66746c]">{item.body}</p><p className="mt-3 text-xs text-[#8a948e]">{item.createdAt.toLocaleString("en-GB")}</p></div><span className={`rounded-full px-2.5 py-1 text-xs ${item.severity === "error" ? "bg-red-50 text-red-700" : item.severity === "warning" ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>{item.severity}</span></div>
            <div className="mt-4 flex gap-3">{item.actionHref ? <Link className="text-sm font-semibold text-[#27563f]" href={item.actionHref}>Open details</Link> : null}{!item.readAt ? <form action={markNotificationRead}><input name="notificationId" type="hidden" value={item.id} /><button className="inline-flex items-center gap-1 text-sm text-[#68776f]" type="submit"><CheckIcon className="size-4" />Mark read</button></form> : null}</div>
          </article>
        ))}
      </section>
    </div>
  );
}
