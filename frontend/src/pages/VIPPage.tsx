import { useMemo, useState } from "react";

type VIPPageProps = {
  initialVipStatus?: boolean;
  onVipStatusChange?: (nextStatus: boolean) => void;
};

const benefits = ["Premium Courses", "Ad-free", "Exclusive Resources"];

const cardStyle: React.CSSProperties = {
  maxWidth: 860,
  margin: "48px auto",
  padding: "36px 32px",
  borderRadius: 20,
  border: "1px solid rgba(30, 41, 59, 0.12)",
  background: "linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)",
  boxShadow: "0 24px 60px rgba(15, 23, 42, 0.10)",
};

const badgeStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  padding: "10px 14px",
  borderRadius: 999,
  fontWeight: 700,
  color: "#14532d",
  background: "#dcfce7",
  border: "1px solid #86efac",
};

function mockUpgradeApiCall(): Promise<{ vip_status: boolean }> {
  return new Promise((resolve) => {
    setTimeout(() => resolve({ vip_status: true }), 1000);
  });
}

export default function VIPPage({
  initialVipStatus = false,
  onVipStatusChange,
}: VIPPageProps) {
  const [vipStatus, setVipStatus] = useState<boolean>(initialVipStatus);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const title = useMemo(
    () => (vipStatus ? "Membership Activated" : "Upgrade to VIP"),
    [vipStatus]
  );

  const handleUpgrade = async () => {
    if (vipStatus || isLoading) return;

    setIsLoading(true);
    try {
      const data = await mockUpgradeApiCall();
      const nextStatus = Boolean(data.vip_status);
      setVipStatus(nextStatus);
      onVipStatusChange?.(nextStatus);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "radial-gradient(circle at top, #f8fafc 0%, #eef2ff 48%, #ffffff 100%)",
        padding: "24px",
      }}
    >
      <section style={cardStyle}>
        <p style={{ margin: 0, color: "#475569", fontWeight: 600, letterSpacing: 0.4 }}>
          Premium Membership
        </p>
        <h1 style={{ margin: "8px 0 12px", fontSize: 34, lineHeight: 1.2, color: "#0f172a" }}>
          {title}
        </h1>
        <p style={{ margin: "0 0 24px", color: "#334155", fontSize: 16 }}>
          Unlock a cleaner and more powerful fitness experience with exclusive member benefits.
        </p>

        <ul style={{ margin: 0, paddingLeft: 22, color: "#1e293b", lineHeight: 1.9 }}>
          {benefits.map((benefit) => (
            <li key={benefit} style={{ fontSize: 16, fontWeight: 500 }}>
              {benefit}
            </li>
          ))}
        </ul>

        <div style={{ marginTop: 28 }}>
          {vipStatus ? (
            <span style={badgeStyle}>You are a Member</span>
          ) : (
            <button
              type="button"
              onClick={handleUpgrade}
              disabled={isLoading}
              style={{
                border: "none",
                borderRadius: 12,
                padding: "12px 20px",
                fontWeight: 700,
                color: "#ffffff",
                background: "linear-gradient(90deg, #4f46e5 0%, #7c3aed 100%)",
                cursor: isLoading ? "not-allowed" : "pointer",
                opacity: isLoading ? 0.7 : 1,
              }}
            >
              {isLoading ? "Upgrading..." : "Upgrade Now"}
            </button>
          )}
        </div>
      </section>
    </main>
  );
}
