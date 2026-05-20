"use client";

interface HeaderProps {
  sessionBadge?: string;
  sessionNumber?: string | number;
  userName?: string;
  userRole?: string;
}

export default function Header({
  sessionBadge = "Chat con IA",
  sessionNumber,
  userName,
  userRole = "Admin",
}: HeaderProps) {
  return (
    <header className="chat-header">
      <div className="session-info">
        <span className="session-badge">{sessionBadge}</span>
        {sessionNumber && (
          <span className="session-number">{sessionNumber}</span>
        )}
      </div>
      <div className="user-info">
        <span className="user-role">{userRole}</span>
        <div className="user-avatar">
          {userName?.charAt(0).toUpperCase() || "A"}
        </div>
      </div>
    </header>
  );
}
