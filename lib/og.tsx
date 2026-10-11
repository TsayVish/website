import { ImageResponse } from "next/og";

export const OG_SIZE = { width: 1200, height: 630 };

/** The share card used for public listings and creators. */
export function ogCard({ eyebrow, title, subtitle, imageUrl, initial }: { eyebrow: string; title: string; subtitle: string; imageUrl?: string | null; initial: string }) {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#F7F7F8", padding: 64, fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", flex: 1, paddingRight: 48 }}>
          <div style={{ display: "flex", fontSize: 28, color: "#62626C", letterSpacing: 1 }}>{eyebrow.toUpperCase()}</div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: 68, fontWeight: 700, color: "#18181B", lineHeight: 1.05 }}>{title.slice(0, 60)}</div>
            <div style={{ display: "flex", fontSize: 32, color: "#62626C", marginTop: 20 }}>{subtitle.slice(0, 110)}</div>
          </div>
          <div style={{ display: "flex", fontSize: 30, fontWeight: 700, color: "#18181B" }}>tsayvish</div>
        </div>
        <div style={{ display: "flex", width: 420, height: 502, borderRadius: 32, overflow: "hidden", background: "#E9E7FF", alignItems: "center", justifyContent: "center" }}>
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrl} width={420} height={502} style={{ objectFit: "cover" }} alt="" />
          ) : (
            <div style={{ display: "flex", fontSize: 200, fontWeight: 700, color: "#3640E0" }}>{initial}</div>
          )}
        </div>
      </div>
    ),
    OG_SIZE,
  );
}
