import { InboxIcon } from "lucide-react";

export default function ApplicationsPage() {
  return (
    <div>
      <p className="text-sm font-medium text-[#5f7067]">Pipeline</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em]">Applications</h1>
      <div className="mt-8 grid min-h-96 place-items-center rounded-2xl border border-[#d9e2dc] bg-white p-8 text-center">
        <div>
          <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-[#edf2ed] text-[#315b45]">
            <InboxIcon className="size-6" />
          </span>
          <h2 className="mt-5 text-lg font-semibold">No applications yet</h2>
          <p className="mt-2 max-w-md text-sm leading-6 text-[#748078]">
            Proposed roles, approval requests, manual tasks, and submission receipts will appear here after your first run.
          </p>
        </div>
      </div>
    </div>
  );
}
