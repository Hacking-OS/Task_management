import { useState } from "react";
import { useMediaPreview } from "../context/MediaPreviewContext";
import { useMembers } from "../context/MembersContext";
import { userColor, userInitial, userTextColor } from "../utils/userColor";

export interface UserLike {
  user_id?: string;
  id?: string;
  username: string;
  avatar_url?: string | null;
}

interface UserAvatarProps {
  user?: UserLike | null;
  username?: string;
  userId?: string;
  avatarUrl?: string | null;
  size?: "xs" | "sm" | "md" | "lg";
  title?: string;
  className?: string;
  /** Click to open full-size image preview when an avatar is set. */
  previewable?: boolean;
}

const SIZES = { xs: 24, sm: 28, md: 32, lg: 40 };

export function UserAvatar({
  user,
  username,
  userId,
  avatarUrl,
  size = "sm",
  title,
  className = "",
  previewable = false,
}: UserAvatarProps) {
  const { openPreview } = useMediaPreview();
  const name = user?.username ?? username ?? "?";
  const id = user?.user_id ?? user?.id ?? userId ?? name;
  const src = user?.avatar_url ?? avatarUrl ?? null;
  const [imgFailed, setImgFailed] = useState(false);
  const px = SIZES[size];
  const bg = userColor(id);
  const showImg = src && !imgFailed;
  const canPreview = previewable && showImg && src;

  const inner = (
    <span
      className={`user-circle user-circle-${size}${className ? ` ${className}` : ""}${canPreview ? " user-circle-previewable" : ""}`}
      style={{ width: px, height: px, backgroundColor: showImg ? "transparent" : bg, color: userTextColor(bg) }}
      title={title ?? name}
    >
      {showImg ? (
        <img src={src} alt="" className="user-circle-img" onError={() => setImgFailed(true)} />
      ) : (
        userInitial(name)
      )}
    </span>
  );

  if (!canPreview) return inner;

  return (
    <button
      type="button"
      className="user-avatar-btn"
      title={`View ${name}'s avatar`}
      onClick={(e) => {
        e.stopPropagation();
        openPreview({
          title: `${name}'s avatar`,
          src,
          kind: "image",
          mimeType: "image/jpeg",
          downloadFilename: `${name}-avatar.jpg`,
        });
      }}
    >
      {inner}
    </button>
  );
}

export function AvatarStack({ userIds, max = 4 }: { userIds: string[]; max?: number }) {
  const { getMemberByUserId } = useMembers();
  const unique = [...new Set(userIds.filter(Boolean))];
  const shown = unique.slice(0, max);
  const extra = unique.length - shown.length;

  return (
    <span className="avatar-stack-row">
      {shown.map((id) => {
        const member = getMemberByUserId(id);
        return (
          <UserAvatar
            key={id}
            user={member ?? { user_id: id, username: id.slice(0, 8) }}
            size="xs"
            className="avatar-stack-item"
          />
        );
      })}
      {extra > 0 && <span className="avatar-stack-more">+{extra}</span>}
    </span>
  );
}
