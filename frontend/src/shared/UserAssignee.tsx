import { useMembers } from "../context/MembersContext";
import { UserAvatar, AvatarStack } from "./UserAvatar";

interface UserAssigneeProps {
  userId?: string | null;
  userIds?: string[];
  showName?: boolean;
  size?: "xs" | "sm" | "md" | "lg";
  unassignedLabel?: string;
}

export function UserAssignee({
  userId,
  userIds,
  showName = true,
  size = "sm",
  unassignedLabel = "Unassigned",
}: UserAssigneeProps) {
  const { getMemberByUserId } = useMembers();
  const ids = userIds ?? (userId ? [userId] : []);

  if (ids.length === 0) {
    return showName ? <span className="muted">{unassignedLabel}</span> : null;
  }

  if (ids.length > 1 || !showName) {
    return (
      <span className="user-assignee">
        <AvatarStack userIds={ids} max={showName ? 4 : 3} />
        {showName && ids.length === 1 && (
          <span className="user-assignee-name">{getMemberByUserId(ids[0])?.username ?? ids[0].slice(0, 8)}</span>
        )}
        {showName && ids.length > 1 && (
          <span className="user-assignee-name muted">{ids.length} assignees</span>
        )}
      </span>
    );
  }

  const member = getMemberByUserId(ids[0]);
  if (!member) {
    return (
      <span className="user-assignee">
        <UserAvatar username={ids[0].slice(0, 8)} userId={ids[0]} size={size} />
        {showName && <span className="user-assignee-name mono">{ids[0].slice(0, 8)}</span>}
      </span>
    );
  }

  return (
    <span className="user-assignee">
      <UserAvatar user={member} size={size} previewable />
      {showName && <span className="user-assignee-name">{member.username}</span>}
    </span>
  );
}

export function UserAssignees({ userIds, size = "sm" }: { userIds: string[]; size?: "xs" | "sm" | "md" | "lg" }) {
  return <UserAssignee userIds={userIds} size={size} showName={false} />;
}
