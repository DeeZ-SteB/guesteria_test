// Runs before any application code in the browser (Next.js instrumentation-client convention).
//
// Zod probes `new Function("")` when a schema is first DEFINED, to decide on JIT parsing. Our CSP has
// no 'unsafe-eval', so that probe is reported as a CSP violation even though Zod catches it. Turning
// JIT off here — before any module defines a schema — removes the probe; parsing stays fast enough.
import { z } from "zod";

z.config({ jitless: true });
