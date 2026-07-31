/* ==========================================================================
   ███  RESERVED — FIXED BOTTOM-RIGHT BADGE SLOT  ███
   ==========================================================================

   INTENTIONALLY EMPTY. The badge component gets dropped in here in a later
   step. Do not repurpose this corner.

   The footprint is reserved by tokens in globals.css:
     --badge-w      64px   slot width
     --badge-h      64px   slot height
     --badge-inset  20px   distance from the viewport edges
     --badge-safe   the keep-out gutter other fixed UI must respect

   Already respecting it:
     - SiteFooter  -> padding-bottom: var(--badge-safe)
     - CookieBar   -> margin-right:  var(--badge-safe) on small screens

   TO FILL: replace the empty <div> below with the badge. The wrapper already
   handles fixed positioning, z-index and sizing — the child only needs to
   fill 100% x 100%.
   ========================================================================== */

export function BadgeSlot() {
  return (
    <div
      id="cico-badge-slot"
      data-slot="badge"
      aria-hidden="true"
      className="pointer-events-none fixed z-40"
      style={{
        right: "var(--badge-inset)",
        bottom: "var(--badge-inset)",
        width: "var(--badge-w)",
        height: "var(--badge-h)",
      }}
    >
      {/* BADGE GOES HERE — leave empty until then. */}
    </div>
  );
}
