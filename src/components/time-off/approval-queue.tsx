"use client";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { Check, X, Clock, Minus, Undo2 } from "lucide-react";

interface ApprovalQueueProps {
  onMutationSuccess?: () => void;
}

function SlotBadge({ status }: { status: string }) {
  if (status === "APPROVED") {
    return (
      <Badge variant="success" className="gap-1">
        <Check size={12} /> Approved
      </Badge>
    );
  }
  if (status === "REJECTED") {
    return (
      <Badge variant="destructive" className="gap-1">
        <X size={12} /> Rejected
      </Badge>
    );
  }
  if (status === "SKIPPED") {
    return (
      <Badge variant="default" className="gap-1 text-gray-500">
        <Minus size={12} /> N/A
      </Badge>
    );
  }
  return (
    <Badge variant="warning" className="gap-1">
      <Clock size={12} /> Pending
    </Badge>
  );
}

function ApprovalRow({
  label,
  status,
  approverName,
  approvedAt,
  pendingPlaceholder,
}: {
  label: string;
  status: string;
  approverName: string | null;
  approvedAt: Date | string | null;
  pendingPlaceholder?: string;
}) {
  const displayName =
    approverName ||
    (status === "PENDING" && pendingPlaceholder ? pendingPlaceholder : null);
  return (
    <div className="flex items-center justify-between py-1.5 text-sm">
      <div className="flex items-center gap-3 min-w-0">
        <span className="font-medium text-gray-700 dark:text-gray-300 w-28 shrink-0">{label}</span>
        {displayName && (
          <span className="text-xs text-gray-500 truncate">
            {displayName}
            {approvedAt && status !== "PENDING" && status !== "SKIPPED" && (
              <span className="ml-1 text-gray-400">· {format(new Date(approvedAt), "MMM d, HH:mm")}</span>
            )}
          </span>
        )}
      </div>
      <SlotBadge status={status} />
    </div>
  );
}

export default function ApprovalQueue({ onMutationSuccess }: ApprovalQueueProps) {
  const utils = trpc.useContext();
  const { data, isLoading } = trpc.timeoff.listMyApprovals.useQuery();

  const handleSuccess = () => {
    utils.timeoff.listMyApprovals.invalidate();
    utils.timeoff.listRequests.invalidate();
    utils.timeoff.getPolicyBalances.invalidate();
    utils.timeoff.teamCalendar.invalidate();
    if (onMutationSuccess) onMutationSuccess();
  };

  const approveMutation = trpc.timeoff.approve.useMutation({ onSuccess: handleSuccess });
  const rejectMutation = trpc.timeoff.reject.useMutation({ onSuccess: handleSuccess });
  const unapproveMutation = trpc.timeoff.unapprove.useMutation({ onSuccess: handleSuccess });
  const unrejectMutation = trpc.timeoff.unreject.useMutation({ onSuccess: handleSuccess });

  if (isLoading) return <p className="text-sm text-gray-400">Loading pending requests...</p>;
  if (!data?.length) {
    return <p className="text-sm text-gray-500 dark:text-gray-400">No pending requests require your approval.</p>;
  }

  return (
    <div className="space-y-3">
      {data.map((req: any) => {
        const canAct = req.canActAsHr || req.canActAsTeamLeader || req.canActAsGroupLeader;
        const myRoles: string[] = [];
        if (req.canActAsHr) myRoles.push("HR");
        if (req.canActAsTeamLeader) myRoles.push("Team Leader");
        if (req.canActAsGroupLeader) myRoles.push("Group Leader");

        return (
          <div
            key={req.id}
            className="p-4 border dark:border-charcoal-700 rounded-lg bg-white dark:bg-charcoal-900 shadow-sm"
          >
            <div className="flex items-start justify-between gap-4 mb-3">
              <div className="space-y-1 min-w-0">
                <p className="font-medium">
                  {req.employee.firstName} {req.employee.lastName}
                  <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">
                    ({req.employee.department?.name})
                  </span>
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {req.policy.name} · {format(new Date(req.startDate), "MMM d")} –{" "}
                  {format(new Date(req.endDate), "MMM d, yyyy")} · {req.days} day(s)
                </p>
                {req.reason && (
                  <p className="text-sm text-gray-400 italic font-medium">&quot;{req.reason}&quot;</p>
                )}
              </div>
              <div className="flex gap-2 shrink-0">
                {req.canUndo && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1 text-gray-600"
                    onClick={() => unapproveMutation.mutate({ requestId: req.id })}
                    disabled={unapproveMutation.isPending || approveMutation.isPending || rejectMutation.isPending || unrejectMutation.isPending}
                  >
                    <Undo2 size={14} /> Undo my approval
                  </Button>
                )}
                {req.canUndoRejection && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1 text-amber-600 border-amber-200 dark:border-charcoal-700 hover:bg-amber-50 dark:hover:bg-amber-900/20"
                    onClick={() => unrejectMutation.mutate({ requestId: req.id })}
                    disabled={unrejectMutation.isPending || approveMutation.isPending || rejectMutation.isPending || unapproveMutation.isPending}
                  >
                    <Undo2 size={14} /> Undo my rejection
                  </Button>
                )}
                {canAct && (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-red-600 border-red-200 dark:border-charcoal-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                      onClick={() => rejectMutation.mutate({ requestId: req.id })}
                      disabled={rejectMutation.isPending || approveMutation.isPending || unapproveMutation.isPending}
                    >
                      Reject
                    </Button>
                    <Button
                      size="sm"
                      className="bg-emerald-500 hover:bg-emerald-600 text-white"
                      onClick={() => approveMutation.mutate({ requestId: req.id })}
                      disabled={approveMutation.isPending || rejectMutation.isPending || unapproveMutation.isPending}
                    >
                      Approve as {myRoles.join(" + ")}
                    </Button>
                  </>
                )}
              </div>
            </div>

            <div className="border-t dark:border-charcoal-700 pt-2 divide-y divide-gray-100 dark:divide-charcoal-700">
              <ApprovalRow
                label="HR"
                status={req.hrStatus}
                approverName={req.hrApprovedByName}
                approvedAt={req.hrApprovedAt}
                pendingPlaceholder="Any HR team member"
              />
              <ApprovalRow
                label="Team Leader"
                status={req.teamLeaderStatus}
                approverName={req.teamLeaderApprovedByName ?? req.teamLeaderName}
                approvedAt={req.teamLeaderApprovedAt}
              />
              <ApprovalRow
                label="Group Leader"
                status={req.groupLeaderStatus}
                approverName={req.groupLeaderApprovedByName ?? req.groupLeaderName}
                approvedAt={req.groupLeaderApprovedAt}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
