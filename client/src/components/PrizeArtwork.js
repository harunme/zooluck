import React, { useEffect, useState } from "react";

export default function PrizeArtwork({ source, size = 42, onClick }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [source]);
  const image = typeof source === "string" && (
    source.startsWith("data:image/") || /^\/api\/prizes\/\d+\/image\/[a-f0-9]{64}$/.test(source)
  );
  return (
    <span
      style={{ display: "block", width: size, height: size, margin: "0 auto", cursor: onClick ? "pointer" : undefined }}
      onClick={onClick}
      onKeyDown={onClick ? event => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onClick();
        }
      } : undefined}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-label={onClick ? "更换奖品图片" : undefined}
    >
      {image && !failed ? (
        <img
          src={source} alt="奖品" width={size} height={size}
          loading="lazy" decoding="async" onError={() => setFailed(true)}
          style={{ display: "block", objectFit: "contain", borderRadius: 4 }}
        />
      ) : (
        <span style={{ display: "block", lineHeight: `${size}px`, textAlign: "center", fontSize: source && !failed ? Math.min(size, 48) : 16, color: "#999" }}>
          {failed || !source ? "—" : source}
        </span>
      )}
    </span>
  );
}
