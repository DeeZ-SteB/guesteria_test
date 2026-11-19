import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** Home-screen icon (iOS): the same mark, without the rounded corners iOS adds itself. */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg, #0f766e, #14b8a6)" }}>
        <svg width="132" height="132" viewBox="0 0 64 64">
          <path d="M32 11c-9.6 0-17.4 7.6-17.4 17C14.6 41.2 32 54 32 54s17.4-12.8 17.4-26C49.4 18.6 41.6 11 32 11z" fill="#fff" />
          <path d="M32 19.5l2.7 5.8 5.8 2.7-5.8 2.7L32 36.5l-2.7-5.8-5.8-2.7 5.8-2.7z" fill="#0f766e" />
        </svg>
      </div>
    ),
    size,
  );
}
