"use client";

import { useState } from "react";

/** Plain-text paragraphs (supplier HTML already stripped), clamped with «Читати далі». */
export function Description({ paragraphs }: { paragraphs: string[] }) {
  const [expanded, setExpanded] = useState(false);
  if (paragraphs.length === 0) return <p className="text-sm text-muted">Готель не надав опису.</p>;
  const long = paragraphs.join(" ").length > 320 || paragraphs.length > 3;
  return (
    <div>
      <div id="hotel-description" className={`space-y-2 text-sm text-muted ${!expanded && long ? "line-clamp-4" : ""}`}>
        {paragraphs.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
      {long && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-controls="hotel-description"
          className="mt-1 min-h-11 text-sm font-medium text-primary"
        >
          {expanded ? "Згорнути" : "Читати далі"}
        </button>
      )}
    </div>
  );
}
