import { BrandBadge } from "./brand-badge";

/**
 * Fixed bottom-right badge slot.
 *
 * The footprint is reserved by tokens in globals.css:
 *   --badge-size   88px mobile / 110px from md up
 *   --badge-inset  24px from the viewport edges
 *   --badge-safe   the keep-out gutter other fixed UI respects
 *
 * Respecting it today:
 *   - SiteFooter        padding-bottom: var(--badge-safe)
 *   - Feed panel controls  max(--badge-safe, --consent-h)
 *   - SizeSheet         padding-bottom: var(--badge-safe)
 */
export function BadgeSlot() {
  return <BrandBadge />;
}
