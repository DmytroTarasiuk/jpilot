import { UserButton } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import {
  BotIcon,
  BellIcon,
  BriefcaseBusinessIcon,
  CalendarClockIcon,
  FileTextIcon,
  LayoutDashboardIcon,
  Link2Icon,
  RadarIcon,
  Settings2Icon,
  ShieldCheckIcon,
  ShieldIcon,
  UserRoundIcon,
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

const navigation = [
  ["Dashboard", "/dashboard", LayoutDashboardIcon],
  ["Profile", "/profile", UserRoundIcon],
  ["Applications", "/applications", BriefcaseBusinessIcon],
  ["Search schedule", "/schedule", CalendarClockIcon],
  ["CV", "/cv", FileTextIcon],
  ["Integrations", "/integrations", Link2Icon],
  ["Notifications", "/notifications", BellIcon],
  ["Operations", "/operations", Settings2Icon],
  ["Privacy", "/privacy", ShieldIcon],
  ["Support access", "/support", ShieldCheckIcon],
  ["Assistant", "/agent", BotIcon],
] as const;

export default async function AppLayout({ children }: { readonly children: ReactNode }) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  return (
    <div className="min-h-screen bg-[#f4f6f2] text-[#152019]">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-[#dce4df] bg-[#123c2b] p-5 text-white lg:flex">
        <Link className="flex items-center gap-3 px-2 py-2 font-semibold" href="/dashboard">
          <span className="grid size-9 place-items-center rounded-xl bg-[#dfff79] text-[#123c2b]">
            <RadarIcon className="size-5" />
          </span>
          JobPilot
        </Link>
        <nav aria-label="Main navigation" className="mt-9 space-y-1">
          {navigation.map(([label, href, Icon]) => (
            <Link
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-white/70 transition hover:bg-white/10 hover:text-white"
              href={href}
              key={href}
            >
              <Icon className="size-4" />
              {label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto rounded-2xl border border-white/10 bg-white/5 p-4">
          <p className="text-xs uppercase tracking-[0.16em] text-white/45">Safety mode</p>
          <p className="mt-2 text-sm font-medium">Human approval on</p>
          <p className="mt-1 text-xs leading-5 text-white/55">No application is sent silently.</p>
        </div>
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-[#dce4df] bg-[#f4f6f2]/90 px-5 backdrop-blur md:px-8">
          <Link className="flex items-center gap-2 font-semibold lg:hidden" href="/dashboard">
            <RadarIcon className="size-5" /> JobPilot
          </Link>
          <p className="hidden text-sm text-[#6b7971] lg:block">Your search workspace</p>
          <UserButton />
        </header>
        <main className="mx-auto max-w-7xl px-5 py-7 md:px-8 md:py-10">{children}</main>
      </div>
    </div>
  );
}
