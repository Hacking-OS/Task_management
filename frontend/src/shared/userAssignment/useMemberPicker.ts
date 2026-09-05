import { useMemo, useState } from "react";
import { useMembers } from "../../context/MembersContext";
import type { WorkspaceMember } from "../../models/types";
import { memberMatchesSearch, sortMembersForPicker } from "./utils";

function fallbackMember(userId: string): WorkspaceMember {
  return {
    id: userId,
    user_id: userId,
    workspace_id: "",
    role_id: "",
    role_slug: "",
    joined_at: "",
    username: userId.slice(0, 8),
    email: "",
    role_name: "Member",
  };
}

export function useMemberPicker(selectedIds: string[]) {
  const { members, loading, getMemberByUserId } = useMembers();
  const [search, setSearch] = useState("");

  const selectedMembers = useMemo(
    () => selectedIds.map((id) => getMemberByUserId(id) ?? fallbackMember(id)),
    [selectedIds, getMemberByUserId]
  );

  const filteredMembers = useMemo(() => {
    const list = members.filter((m) => memberMatchesSearch(m, search));
    return sortMembersForPicker(list, selectedIds);
  }, [members, search, selectedIds]);

  const toggleUser = (userId: string, onChange: (ids: string[]) => void, disabled?: boolean) => {
    if (disabled) return;
    if (selectedIds.includes(userId)) onChange(selectedIds.filter((id) => id !== userId));
    else onChange([...selectedIds, userId]);
  };

  const clearAll = (onChange: (ids: string[]) => void, disabled?: boolean) => {
    if (!disabled) onChange([]);
  };

  return {
    members,
    loading,
    search,
    setSearch,
    selectedMembers,
    filteredMembers,
    toggleUser,
    clearAll,
    getMemberByUserId,
  };
}
