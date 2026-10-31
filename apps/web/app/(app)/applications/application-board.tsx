"use client";

import {
  ArrowDownUpIcon,
  ArrowUpRightIcon,
  CheckCircle2Icon,
  ChevronDownIcon,
  CircleAlertIcon,
  Clock3Icon,
  FilePenLineIcon,
  ListFilterIcon,
  LoaderCircleIcon,
  PlusIcon,
  RotateCcwIcon,
  SearchIcon,
  SendIcon,
  XCircleIcon,
} from "lucide-react";
import { useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { MATCH_PROPOSAL_THRESHOLD } from "@jobpilot/domain/matching";
import { ConfirmationDialog } from "./confirmation-dialog";
import {
  filterAndSortApplications,
  type ApplicationListFilters,
  type ApplicationSort,
} from "./application-list";

type ApplicationStatus =
  | "discovered" | "proposed" | "approval_required" | "approved" | "manual_required"
  | "applying" | "submitted" | "acknowledged" | "interview" | "rejected" | "offer"
  | "withdrawn" | "failed" | "outcome_unknown" | "dismissed" | "expired";

interface ScreeningAnswer {
  question: string;
  answer: string | null;
  sourceFactIds: string[];
  needsReview: boolean;
}

export interface ApplicationView {
  id: string;
  status: ApplicationStatus;
  submissionMode: string;
  platform: string;
  submittedAt: string | null;
  createdAt: string;
  updatedAt: string;
  externalApplicationId: string | null;
  jobPostingId: string;
  title: string;
  company: string;
  canonicalUrl: string;
  countryCode: string;
  remote: boolean;
  publishedAt: string | null;
  matchScore: number;
  reasons: string[];
  concerns: string[];
  approvalId: string | null;
  approvalStatus: string | null;
  coverLetter: string;
  screeningAnswers: ScreeningAnswer[];
  sourceFacts: Array<{ id: string; label: string; value: string; source: string }>;
  missingFacts: string[];
  sourceCvDocumentId: string | null;
  draftRevision: number;
  generationMode: string;
  canEditDraft: boolean;
  allowedStatusTargets: ApplicationStatus[];
  events: Array<{
    id: string;
    applicationId: string;
    fromStatus: ApplicationStatus | null;
    toStatus: ApplicationStatus;
    actorType: string;
    reason: string | null;
    metadata: Record<string, unknown>;
    createdAt: string;
  }>;
}

interface EditableDraft {
  coverLetter: string;
  screeningAnswers: ScreeningAnswer[];
}

type PendingConfirmation =
  | { kind: "decision"; applicationIds: string[]; decision: "approve" | "reject" }
  | { kind: "status"; applicationId: string; status: ApplicationStatus; title: string; company: string };

const statusLabels: Record<ApplicationStatus, string> = {
  discovered: "Discovered", proposed: "Proposed", approval_required: "Approval needed",
  approved: "Approved", manual_required: "Ready for manual application", applying: "Submitting",
  submitted: "Submitted", acknowledged: "Acknowledged", interview: "Interview",
  rejected: "Rejected", offer: "Offer", withdrawn: "Withdrawn", failed: "Failed",
  outcome_unknown: "Outcome unknown", dismissed: "Dismissed", expired: "Expired",
};

const defaultFilters: ApplicationListFilters = {
  query: "",
  status: "all",
  platform: "all",
  countryCode: "all",
  minimumScore: MATCH_PROPOSAL_THRESHOLD,
};

const fieldClassName = "mt-1.5 h-10 w-full rounded-xl border border-[#cbd8d0] bg-white px-3 text-sm text-[#263c31] outline-none transition focus:border-[#6c927b] focus:ring-2 focus:ring-[#dce9e0]";

export function ApplicationBoard({ initialApplications }: { initialApplications: ApplicationView[] }) {
  const [applications, setApplications] = useState(initialApplications);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<PendingConfirmation | null>(null);
  const [filters, setFilters] = useState<ApplicationListFilters>(defaultFilters);
  const [sort, setSort] = useState<ApplicationSort>("match_desc");
  const [drafts, setDrafts] = useState<Record<string, EditableDraft>>(() =>
    Object.fromEntries(initialApplications.map((application) => [application.id, {
      coverLetter: application.coverLetter,
      screeningAnswers: application.screeningAnswers,
    }])),
  );
  const visibleApplications = useMemo(
    () => filterAndSortApplications(applications, filters, sort),
    [applications, filters, sort],
  );
  const pendingIds = useMemo(
    () => visibleApplications.filter((application) => application.approvalStatus === "pending").map((application) => application.id),
    [visibleApplications],
  );
  const platforms = useMemo(
    () => [...new Set(applications.map((application) => application.platform))].sort(),
    [applications],
  );
  const countries = useMemo(
    () => [...new Set(applications.map((application) => application.countryCode))].sort(),
    [applications],
  );
  const statuses = useMemo(
    () => [...new Set(applications.map((application) => application.status))]
      .sort((left, right) => statusLabels[left].localeCompare(statusLabels[right])),
    [applications],
  );
  const hiddenBelowThreshold = useMemo(
    () => applications.filter((application) => application.matchScore < MATCH_PROPOSAL_THRESHOLD).length,
    [applications],
  );

  function toggleSelected(applicationId: string) {
    setSelected((current) => current.includes(applicationId)
      ? current.filter((value) => value !== applicationId)
      : [...current, applicationId]);
  }

  async function decide(applicationIds: string[], decision: "approve" | "reject") {
    if (applicationIds.length === 0) return;
    setBusy(`decision:${applicationIds.join(",")}`);
    setMessage(null);
    try {
      const requestId = crypto.randomUUID();
      const response = await fetch(applicationIds.length === 1
        ? `/api/applications/${applicationIds[0]}/decision`
        : "/api/applications/bulk-decision", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(applicationIds.length === 1
          ? { decision, requestId }
          : { applicationIds, decision, requestId }),
      });
      if (!response.ok) throw new Error(await responseMessage(response));
      const data = await response.json() as {
        applicationId?: string;
        finalStatus?: ApplicationStatus;
        results?: Array<{ applicationId: string; status: ApplicationStatus | "not_pending" }>;
      };
      const decisions = data.results ?? (data.applicationId && data.finalStatus
        ? [{ applicationId: data.applicationId, status: data.finalStatus }]
        : []);
      const updatedStatuses = new Map(
        decisions
          .filter((result): result is { applicationId: string; status: ApplicationStatus } => result.status !== "not_pending")
          .map((result) => [result.applicationId, result.status]),
      );
      setApplications((current) => current.map((application) => {
        const status = updatedStatuses.get(application.id);
        if (!status) return application;
        return applyLocalStatus(application, status, decision);
      }));
      setSelected((current) => current.filter((id) => !updatedStatuses.has(id)));
      setMessage(decision === "approve"
        ? "Approved. Unsupported external submissions are now ready as manual tasks."
        : "Application dismissed.");
      setConfirmation(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The review action failed.");
    } finally {
      setBusy(null);
    }
  }

  async function saveDraft(applicationId: string) {
    const draft = drafts[applicationId];
    if (!draft) return;
    setBusy(`draft:${applicationId}`);
    setMessage(null);
    try {
      const response = await fetch(`/api/applications/${applicationId}/draft`, {
        method: "PATCH",
        headers: { "content-type": "application/json", "x-request-id": crypto.randomUUID() },
        body: JSON.stringify(draft),
      });
      if (!response.ok) throw new Error(await responseMessage(response));
      const data = await response.json() as { draft?: { revision?: number } };
      setApplications((current) => current.map((application) => application.id === applicationId
        ? {
            ...application,
            coverLetter: draft.coverLetter,
            screeningAnswers: draft.screeningAnswers,
            draftRevision: data.draft?.revision ?? application.draftRevision,
            generationMode: "user_edited",
          }
        : application));
      setMessage("Draft saved. Your edits are recorded as user-confirmed content.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The draft could not be saved.");
    } finally {
      setBusy(null);
    }
  }

  async function updateStatus(applicationId: string, status: ApplicationStatus) {
    setBusy(`status:${applicationId}`);
    setMessage(null);
    try {
      const response = await fetch(`/api/applications/${applicationId}/status`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status, requestId: crypto.randomUUID() }),
      });
      if (!response.ok) throw new Error(await responseMessage(response));
      setApplications((current) => current.map((application) => application.id === applicationId
        ? applyLocalStatus(application, status, "status")
        : application));
      setMessage(`Application updated to ${statusLabels[status].toLowerCase()}.`);
      setConfirmation(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The status could not be updated.");
    } finally {
      setBusy(null);
    }
  }

  function updateFilters(patch: Partial<ApplicationListFilters>) {
    setFilters((current) => ({ ...current, ...patch }));
    setSelected([]);
  }

  function resetFilters() {
    setFilters(defaultFilters);
    setSort("match_desc");
    setSelected([]);
  }

  async function confirmPendingAction() {
    if (!confirmation) return;
    if (confirmation.kind === "decision") {
      await decide(confirmation.applicationIds, confirmation.decision);
      return;
    }
    await updateStatus(confirmation.applicationId, confirmation.status);
  }

  if (applications.length === 0) {
    return <div><PageHeading /><EmptyState /></div>;
  }

  return (
    <div>
      <PageHeading />
      <section aria-label="Filter and sort applications" className="mt-7 rounded-2xl border border-[#d9e2dc] bg-white p-4 sm:p-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-[#315b45]">
          <ListFilterIcon className="size-4" /> Filter and sort
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <label className="text-xs font-semibold uppercase tracking-[0.08em] text-[#617168] xl:col-span-2">
            Search
            <span className="relative block">
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#708078]" />
              <input
                className={`${fieldClassName} pl-9`}
                onChange={(event) => updateFilters({ query: event.target.value })}
                placeholder="Job title or company"
                type="search"
                value={filters.query}
              />
            </span>
          </label>
          <FilterSelect label="Status" onChange={(value) => updateFilters({ status: value })} value={filters.status}>
            <option value="all">All statuses</option>
            {statuses.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}
          </FilterSelect>
          <FilterSelect label="Platform" onChange={(value) => updateFilters({ platform: value })} value={filters.platform}>
            <option value="all">All platforms</option>
            {platforms.map((platform) => <option key={platform} value={platform}>{platformLabel(platform)}</option>)}
          </FilterSelect>
          <FilterSelect label="Country" onChange={(value) => updateFilters({ countryCode: value })} value={filters.countryCode}>
            <option value="all">All countries</option>
            {countries.map((country) => <option key={country} value={country}>{countryName(country)}</option>)}
          </FilterSelect>
          <FilterSelect label="Minimum match" onChange={(value) => updateFilters({ minimumScore: value === "all" ? null : Number(value) })} value={filters.minimumScore?.toString() ?? "all"}>
            <option value={MATCH_PROPOSAL_THRESHOLD}>{MATCH_PROPOSAL_THRESHOLD}%+ recommended</option>
            <option value="80">80%+</option>
            <option value="90">90%+</option>
            <option value="all">All scores (history)</option>
          </FilterSelect>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,16rem)_1fr_auto] md:items-end">
          <FilterSelect label="Sort by" onChange={(value) => setSort(value as ApplicationSort)} value={sort}>
            <option value="match_desc">Best match first</option>
            <option value="published_desc">Newest vacancy first</option>
            <option value="updated_desc">Recently updated</option>
            <option value="company_asc">Company A–Z</option>
            <option value="title_asc">Job title A–Z</option>
          </FilterSelect>
          <p aria-live="polite" className="text-sm text-[#68776f]">
            Showing <strong className="text-[#31483b]">{visibleApplications.length}</strong> of {applications.length} applications.
            {filters.minimumScore === MATCH_PROPOSAL_THRESHOLD && hiddenBelowThreshold > 0
              ? ` ${hiddenBelowThreshold} historical ${hiddenBelowThreshold === 1 ? "record is" : "records are"} below ${MATCH_PROPOSAL_THRESHOLD}% and hidden.`
              : ""}
          </p>
          <button className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-[#b8c8be] px-4 text-sm font-semibold text-[#315b45] transition hover:bg-[#edf4ef]" onClick={resetFilters} type="button">
            <RotateCcwIcon className="size-4" /> Reset
          </button>
        </div>
      </section>

      <section className="mt-4 flex flex-col gap-3 rounded-2xl border border-[#d9e2dc] bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            checked={pendingIds.length > 0 && pendingIds.every((id) => selected.includes(id))}
            className="size-4 accent-[#27563f]"
            onChange={() => setSelected((current) => pendingIds.every((id) => current.includes(id))
              ? current.filter((id) => !pendingIds.includes(id))
              : [...new Set([...current, ...pendingIds])])}
            type="checkbox"
          />
          Select visible pending ({pendingIds.length})
        </label>
        <div className="flex flex-wrap gap-2">
          <ActionButton disabled={selected.length === 0 || busy !== null} icon={CheckCircle2Icon} label={`Approve selected (${selected.length})`} onClick={() => setConfirmation({ kind: "decision", applicationIds: selected, decision: "approve" })} />
          <ActionButton disabled={selected.length === 0 || busy !== null} icon={XCircleIcon} label="Reject selected" onClick={() => setConfirmation({ kind: "decision", applicationIds: selected, decision: "reject" })} tone="danger" />
        </div>
      </section>

      {visibleApplications.length === 0 ? <FilteredEmptyState onReset={resetFilters} /> : <div className="mt-5 space-y-5">
        {visibleApplications.map((application) => {
          const draft = drafts[application.id];
          const isBusy = busy?.includes(application.id) ?? false;
          return (
            <article className="rounded-2xl border border-[#d9e2dc] bg-white p-5 [content-visibility:auto] [contain-intrinsic-size:0_36rem] sm:p-6" id={`application-${application.id}`} key={application.id}>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex min-w-0 gap-3">
                  {application.approvalStatus === "pending" ? <input aria-label={`Select ${application.title} at ${application.company}`} checked={selected.includes(application.id)} className="mt-1 size-4 shrink-0 accent-[#27563f]" onChange={() => toggleSelected(application.id)} type="checkbox" /> : null}
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#6d7b73]">{application.platform.replaceAll("_", " ")} · {application.countryCode}</p>
                    <h2 className="mt-1 text-xl font-semibold tracking-tight">{application.title}</h2>
                    <p className="mt-1 text-sm text-[#65736b]">{application.company} · <span className={application.matchScore >= MATCH_PROPOSAL_THRESHOLD ? "font-semibold text-[#315b45]" : "font-semibold text-amber-700"}>match {application.matchScore}%</span></p>
                  </div>
                </div>
                <span className="w-fit rounded-full bg-[#edf2ec] px-3 py-1 text-xs font-semibold text-[#40584b]">{statusLabels[application.status]}</span>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {application.approvalStatus === "pending" ? <>
                  <ActionButton disabled={busy !== null} icon={CheckCircle2Icon} label="Approve" onClick={() => setConfirmation({ kind: "decision", applicationIds: [application.id], decision: "approve" })} />
                  <ActionButton disabled={busy !== null} icon={XCircleIcon} label="Reject" onClick={() => setConfirmation({ kind: "decision", applicationIds: [application.id], decision: "reject" })} tone="danger" />
                </> : null}
                {application.status === "manual_required" ? <a className="inline-flex items-center gap-1.5 rounded-full bg-[#173f2d] px-4 py-2 text-sm font-semibold text-white" href={application.canonicalUrl} rel="noreferrer" target="_blank">Open application <ArrowUpRightIcon className="size-4" /></a> : null}
                {application.allowedStatusTargets.map((status) => <ActionButton disabled={busy !== null} icon={status === "submitted" ? SendIcon : Clock3Icon} key={status} label={statusActionLabel(status)} onClick={() => setConfirmation({ kind: "status", applicationId: application.id, status, title: application.title, company: application.company })} tone={["dismissed", "withdrawn", "rejected"].includes(status) ? "danger" : "default"} />)}
                {isBusy ? <LoaderCircleIcon className="m-2 size-4 animate-spin text-[#42634f]" /> : null}
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <InfoPanel title="Why it matched" values={application.reasons} />
                <InfoPanel title="Review notes" values={application.concerns.length ? application.concerns : ["No matching concerns were recorded."]} />
              </div>
              <DraftEditor application={application} busy={busy !== null} draft={draft} onSave={() => void saveDraft(application.id)} setDrafts={setDrafts} />
              <Timeline application={application} />
            </article>
          );
        })}
      </div>}
      {message ? <p aria-live="polite" className="fixed bottom-5 right-5 z-40 max-w-sm rounded-2xl border border-[#c8d8ce] bg-white px-4 py-3 text-sm text-[#345443] shadow-xl">{message}</p> : null}
      <ConfirmationDialog
        busy={busy !== null}
        confirmLabel={confirmationLabel(confirmation)}
        description={confirmationDescription(confirmation)}
        onConfirm={() => void confirmPendingAction()}
        onOpenChange={(open) => {
          if (!open) setConfirmation(null);
        }}
        open={confirmation !== null}
        title={confirmationTitle(confirmation)}
        tone={confirmationTone(confirmation)}
      />
    </div>
  );
}

function DraftEditor({ application, busy, draft, onSave, setDrafts }: { application: ApplicationView; busy: boolean; draft: EditableDraft | undefined; onSave: () => void; setDrafts: Dispatch<SetStateAction<Record<string, EditableDraft>>> }) {
  return (
    <details className="group mt-5 rounded-xl border border-[#e1e7e3] bg-[#fafbf9]">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold">Grounded application draft <ChevronDownIcon className="size-4 transition group-open:rotate-180" /></summary>
      <div className="border-t border-[#e1e7e3] p-4">
        <p className="text-xs leading-5 text-[#6b7971]">Revision {application.draftRevision} · {application.generationMode.replaceAll("_", " ")} · {application.sourceCvDocumentId ? "anchored to the active confirmed CV at discovery time" : "no CV anchor"}</p>
        <label className="mt-4 block text-sm font-medium">Cover letter
          <textarea className="mt-2 min-h-64 w-full rounded-xl border border-[#ccd8d0] bg-white p-3 text-sm leading-6 disabled:bg-[#f0f2ef]" disabled={!application.canEditDraft} onChange={(event) => setDrafts((current) => ({ ...current, [application.id]: { ...(current[application.id] ?? { screeningAnswers: [] }), coverLetter: event.target.value } }))} value={draft?.coverLetter ?? ""} />
        </label>
        <div className="mt-5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium">Screening answers</p>
            <button className="inline-flex items-center gap-1 text-xs font-semibold text-[#315b45] disabled:opacity-50" disabled={!application.canEditDraft} onClick={() => setDrafts((current) => ({ ...current, [application.id]: { coverLetter: current[application.id]?.coverLetter ?? "", screeningAnswers: [...(current[application.id]?.screeningAnswers ?? []), { question: "", answer: null, sourceFactIds: [], needsReview: true }] } }))} type="button"><PlusIcon className="size-3.5" /> Add question</button>
          </div>
          {(draft?.screeningAnswers ?? []).length === 0 ? <p className="mt-2 text-sm text-[#78857e]">No questions were supplied by the discovery feed.</p> : null}
          <div className="mt-3 space-y-3">
            {(draft?.screeningAnswers ?? []).map((answer, index) => <div className="rounded-xl border border-[#dde5df] bg-white p-3" key={`${application.id}:${index}`}>
              <input aria-label={`Screening question ${index + 1}`} className="w-full rounded-lg border px-3 py-2 text-sm font-medium disabled:bg-[#f0f2ef]" disabled={!application.canEditDraft} onChange={(event) => updateAnswer(application.id, index, { question: event.target.value }, setDrafts)} placeholder="Question" value={answer.question} />
              <textarea aria-label={`Screening answer ${index + 1}`} className="mt-2 min-h-24 w-full rounded-lg border px-3 py-2 text-sm disabled:bg-[#f0f2ef]" disabled={!application.canEditDraft} onChange={(event) => updateAnswer(application.id, index, { answer: event.target.value || null, needsReview: false }, setDrafts)} placeholder="Enter only a fact you can confirm" value={answer.answer ?? ""} />
            </div>)}
          </div>
        </div>
        {application.missingFacts.length ? <div className="mt-4 rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-900">{application.missingFacts.map((fact) => <p key={fact}>{fact}</p>)}</div> : null}
        <button className="mt-4 rounded-full bg-[#173f2d] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={busy || !draft || !application.canEditDraft} onClick={onSave} type="button">Save draft</button>
      </div>
    </details>
  );
}

function Timeline({ application }: { application: ApplicationView }) {
  return <details className="group mt-3 rounded-xl border border-[#e1e7e3]">
    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold">Timeline ({application.events.length}) <ChevronDownIcon className="size-4 transition group-open:rotate-180" /></summary>
    <ol className="border-t border-[#e1e7e3] px-4 py-3">{application.events.map((event) => <li className="relative border-l border-[#cdd9d1] pb-4 pl-4 text-sm last:pb-0" key={event.id}><span className="absolute -left-1 top-1 size-2 rounded-full bg-[#315b45]" /><p className="font-medium">{statusLabels[event.toStatus]}</p><p className="mt-1 text-xs text-[#748078]">{formatDate(event.createdAt)} · {event.reason ?? event.actorType}</p></li>)}</ol>
  </details>;
}

function PageHeading() {
  return <div><p className="text-sm font-medium text-[#5f7067]">Controlled pipeline</p><h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em]">Applications</h1><p className="mt-3 max-w-3xl text-sm leading-6 text-[#68776f]">Review grounded materials, approve each role, continue manual applications, and correct outcomes without losing the audit trail.</p></div>;
}

function EmptyState() {
  return <div className="mt-8 grid min-h-96 place-items-center rounded-2xl border border-[#d9e2dc] bg-white p-8 text-center"><div><span className="mx-auto grid size-14 place-items-center rounded-2xl bg-[#edf2ed] text-[#315b45]"><FilePenLineIcon className="size-6" /></span><h2 className="mt-5 text-lg font-semibold">No applications yet</h2><p className="mt-2 max-w-md text-sm leading-6 text-[#748078]">Eligible vacancies become approval requests with grounded drafts after a search run.</p></div></div>;
}

function FilteredEmptyState({ onReset }: { onReset: () => void }) {
  return <div className="mt-5 grid min-h-64 place-items-center rounded-2xl border border-dashed border-[#cbd8d0] bg-[#fafbf9] p-8 text-center"><div><span className="mx-auto grid size-12 place-items-center rounded-2xl bg-[#edf2ed] text-[#315b45]"><ListFilterIcon className="size-5" /></span><h2 className="mt-4 text-lg font-semibold">No applications match these filters</h2><p className="mt-2 text-sm text-[#748078]">Reset the view to return to the recommended {MATCH_PROPOSAL_THRESHOLD}% threshold.</p><button className="mt-4 inline-flex items-center gap-2 rounded-full border border-[#b8c8be] px-4 py-2 text-sm font-semibold text-[#315b45] hover:bg-[#edf4ef]" onClick={onReset} type="button"><RotateCcwIcon className="size-4" /> Reset filters</button></div></div>;
}

function FilterSelect({ children, label, onChange, value }: { children: ReactNode; label: string; onChange: (value: string) => void; value: string }) {
  return <label className="text-xs font-semibold uppercase tracking-[0.08em] text-[#617168]">{label}<select className={fieldClassName} onChange={(event) => onChange(event.target.value)} value={value}>{children}</select></label>;
}

function InfoPanel({ title, values }: { title: string; values: string[] }) {
  return <div className="rounded-xl bg-[#f5f7f4] p-4"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#68776f]">{title}</p><ul className="mt-2 space-y-1 text-sm leading-5 text-[#4e6056]">{values.map((value) => <li key={value}>· {value}</li>)}</ul></div>;
}

function ActionButton({ disabled, icon: Icon, label, onClick, tone = "default" }: { disabled: boolean; icon: typeof CircleAlertIcon; label: string; onClick: () => void; tone?: "default" | "danger" }) {
  return <button className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm font-semibold transition disabled:opacity-50 ${tone === "danger" ? "border-red-200 text-red-700 hover:bg-red-50" : "border-[#aabdb0] text-[#315b45] hover:bg-[#edf4ef]"}`} disabled={disabled} onClick={onClick} type="button"><Icon className="size-4" /> {label}</button>;
}

function applyLocalStatus(
  application: ApplicationView,
  status: ApplicationStatus,
  source: "approve" | "reject" | "status",
): ApplicationView {
  const now = new Date().toISOString();
  const events: ApplicationView["events"] = [];
  if (source === "approve") {
    events.push(localEvent(application.id, application.status, status === "manual_required" ? "approved" : status, "Approved by user.", "user", now));
    if (status === "manual_required") {
      events.push(localEvent(application.id, "approved", "manual_required", "This platform does not expose a permitted direct-submit path.", "system", now));
    }
  } else if (source === "reject") {
    events.push(localEvent(application.id, application.status, "dismissed", "Rejected by user.", "user", now));
  } else {
    events.push(localEvent(application.id, application.status, status, "Status confirmed by user.", "user", now));
  }
  return {
    ...application,
    status,
    approvalStatus: source === "status" ? application.approvalStatus : null,
    submittedAt: status === "submitted" ? application.submittedAt ?? now : application.submittedAt,
    canEditDraft: status === "approval_required" || status === "manual_required",
    allowedStatusTargets: allowedStatusTargets(status),
    events: [...application.events, ...events],
  };
}

function localEvent(
  applicationId: string,
  fromStatus: ApplicationStatus,
  toStatus: ApplicationStatus,
  reason: string,
  actorType: string,
  createdAt: string,
): ApplicationView["events"][number] {
  return {
    id: crypto.randomUUID(),
    applicationId,
    fromStatus,
    toStatus,
    actorType,
    reason,
    metadata: { optimistic: true },
    createdAt,
  };
}

function allowedStatusTargets(status: ApplicationStatus): ApplicationStatus[] {
  const targets: Partial<Record<ApplicationStatus, ApplicationStatus[]>> = {
    approved: ["dismissed"],
    manual_required: ["submitted", "dismissed", "outcome_unknown"],
    applying: ["submitted", "outcome_unknown"],
    submitted: ["acknowledged", "interview", "rejected", "offer", "withdrawn"],
    acknowledged: ["interview", "rejected", "offer", "withdrawn"],
    interview: ["rejected", "offer", "withdrawn"],
    failed: ["dismissed"],
    outcome_unknown: ["acknowledged", "interview", "rejected", "offer", "withdrawn"],
    offer: ["withdrawn"],
  };
  return targets[status] ?? [];
}

function confirmationTitle(confirmation: PendingConfirmation | null) {
  if (!confirmation) return "Confirm action";
  if (confirmation.kind === "decision") return confirmation.decision === "approve" ? "Approve application?" : "Reject application?";
  return `${statusActionLabel(confirmation.status)}?`;
}

function confirmationDescription(confirmation: PendingConfirmation | null) {
  if (!confirmation) return "Review this action before continuing.";
  if (confirmation.kind === "decision") {
    const count = confirmation.applicationIds.length;
    return confirmation.decision === "approve"
      ? `Approve ${count} ${count === 1 ? "application" : "applications"}? Manual-only platforms will be marked ready for you to complete.`
      : `Reject ${count} ${count === 1 ? "application" : "applications"}? The decision remains in the application timeline.`;
  }
  if (confirmation.status === "submitted") {
    return `Confirm that you completed the application for ${confirmation.title} at ${confirmation.company} on the external site.`;
  }
  return `Move ${confirmation.title} at ${confirmation.company} to “${statusLabels[confirmation.status]}”? This update will be recorded in the timeline.`;
}

function confirmationLabel(confirmation: PendingConfirmation | null) {
  if (!confirmation) return "Confirm";
  if (confirmation.kind === "decision") return confirmation.decision === "approve" ? "Approve" : "Reject";
  return statusActionLabel(confirmation.status);
}

function confirmationTone(confirmation: PendingConfirmation | null): "default" | "danger" {
  if (!confirmation) return "default";
  if (confirmation.kind === "decision") return confirmation.decision === "reject" ? "danger" : "default";
  return ["dismissed", "withdrawn", "rejected"].includes(confirmation.status) ? "danger" : "default";
}

function platformLabel(platform: string) {
  if (platform === "dou") return "DOU";
  if (platform === "djinni") return "Djinni";
  if (platform === "just_join_it") return "Just Join IT";
  if (platform === "no_fluff_jobs") return "No Fluff Jobs";
  if (platform === "linkedin") return "LinkedIn";
  return platform.replaceAll("_", " ");
}

function countryName(countryCode: string) {
  if (countryCode === "PL") return "Poland";
  if (countryCode === "UA") return "Ukraine";
  return countryCode;
}

function updateAnswer(applicationId: string, index: number, patch: Partial<ScreeningAnswer>, setDrafts: Dispatch<SetStateAction<Record<string, EditableDraft>>>) {
  setDrafts((current) => {
    const draft = current[applicationId] ?? { coverLetter: "", screeningAnswers: [] };
    return { ...current, [applicationId]: { ...draft, screeningAnswers: draft.screeningAnswers.map((answer, answerIndex) => answerIndex === index ? { ...answer, ...patch } : answer) } };
  });
}

function statusActionLabel(status: ApplicationStatus) {
  if (status === "submitted") return "Mark submitted";
  if (status === "outcome_unknown") return "Outcome unclear";
  if (status === "dismissed") return "Dismiss";
  if (status === "acknowledged") return "Mark acknowledged";
  if (status === "interview") return "Mark interview";
  if (status === "offer") return "Mark offer";
  if (status === "withdrawn") return "Withdraw";
  if (status === "rejected") return "Mark rejected";
  return statusLabels[status];
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value));
}

async function responseMessage(response: Response) {
  const data = (await response.json().catch(() => null)) as { error?: string } | null;
  return data?.error ?? `Request failed with status ${response.status}.`;
}
