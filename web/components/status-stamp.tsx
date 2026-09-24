const STAMPS: Record<
  string,
  { label: string; className: string } | undefined
> = {
  auto_approved: {
    label: "APPRV",
    className: "text-stamp-green border-stamp-green",
  },
  flagged_for_review: {
    label: "FLAG",
    className: "text-stamp-amber border-stamp-amber",
  },
  rejected: {
    label: "REJCT",
    className: "text-stamp-red border-stamp-red",
  },
};

export function StatusStamp({ decision }: { decision: string | null }) {
  const stamp = decision ? STAMPS[decision] : undefined;

  if (!stamp) {
    return <span className="text-ledger-line">—</span>;
  }

  return (
    <span
      className={`inline-block min-w-[3rem] border px-1.5 py-0.5 text-center font-mono text-[11px] font-medium leading-none tracking-[0.08em] ${stamp.className}`}
    >
      {stamp.label}
    </span>
  );
}

export function CheckResult({ passed }: { passed: number }) {
  const ok = passed === 1;
  return (
    <span
      className={`inline-block min-w-[2.25rem] border px-1 py-0.5 text-center font-mono text-[10px] font-medium leading-none tracking-[0.08em] ${
        ok ? "border-stamp-green text-stamp-green" : "border-stamp-red text-stamp-red"
      }`}
    >
      {ok ? "PASS" : "FAIL"}
    </span>
  );
}