// Line icons for areas (from the prototype). "people" and "house" are the names the
// step 1 seed uses; they map to the same drawings as "users" and "home".
const P: Record<string, string> = {
  cross: '<path d="M12 3v18M6.5 8.5h11"/>',
  book: '<path d="M4 5h5.5A2.5 2.5 0 0 1 12 7.5V20a2 2 0 0 0-2-2H4zM20 5h-5.5A2.5 2.5 0 0 0 12 7.5V20a2 2 0 0 1 2-2h6z"/>',
  flame: '<path d="M12 3c.5 3.5 5 5.5 5 10.5a5 5 0 0 1-10 0c0-2.5 1.5-3.8 2.2-5.5.9 1.2 1.6 2 2.3 3.2C12.2 9 11.6 6 12 3z"/>',
  mountain: '<path d="M3 19l6.5-11 4 6.5 2.5-3.5L21 19z"/>',
  heart: '<path d="M12 20s-7.5-4.6-7.5-10.2A4.2 4.2 0 0 1 12 7.3a4.2 4.2 0 0 1 7.5 2.5C19.5 15.4 12 20 12 20z"/>',
  dumbbell: '<path d="M6.5 7v10M17.5 7v10M3.5 9.5v5M20.5 9.5v5M6.5 12h11"/>',
  people:
    '<circle cx="9" cy="8.5" r="3"/><path d="M3.5 19.5c0-3 2.5-5.5 5.5-5.5s5.5 2.5 5.5 5.5"/><circle cx="17" cy="9.5" r="2.3"/><path d="M16 14.2c2.6.2 4.5 2.4 4.5 5"/>',
  briefcase: '<rect x="3.5" y="7.5" width="17" height="12" rx="2"/><path d="M9 7.5V5.5h6v2M3.5 12.5h17"/>',
  house: '<path d="M4 11l8-6.5 8 6.5v8.5H4zM10 19.5v-5h4v5"/>',
  leaf: '<path d="M5 19c0-8.5 5.5-14 15-14 0 9.5-5.5 15-14 15zM5 19l7.5-7.5"/>',
  compass: '<circle cx="12" cy="12" r="8.5"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>',
  sun: '<circle cx="12" cy="12" r="3.8"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7"/>',
  music: '<path d="M9 18V5.5l10-2V16"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>',
  shield: '<path d="M12 3.5l7.5 3v5.5c0 4.6-3.2 7.6-7.5 8.6-4.3-1-7.5-4-7.5-8.6V6.5z"/>',
  target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r=".8"/>',
  egg: '<path d="M12 3.5c3.4 0 6.2 6 6.2 9.8a6.2 6.2 0 0 1-12.4 0C5.8 9.5 8.6 3.5 12 3.5z"/>',
  tool: '<path d="M14.5 5.5a4 4 0 0 0 4.9 4.9L10 19.8a2.1 2.1 0 0 1-3-3l9.4-9.4a4 4 0 0 0-1.9-1.9z"/>',
  coffee:
    '<path d="M5 9h11v5.5a4.5 4.5 0 0 1-4.5 4.5h-2A4.5 4.5 0 0 1 5 14.5zM16 10.5h1.5a2.5 2.5 0 0 1 0 5H16M8 3.5v2.5M11 3.5v2.5"/>',
};
P.users = P.people;
P.home = P.house;

export const ICON_CHOICES = Object.keys(P).filter((k) => k !== "users" && k !== "home");

export function AreaIcon({ icon, color, className = "size-5" }: { icon: string; color?: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={color ? { color: `var(--area-${color})` } : undefined}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: P[icon] ?? P.house }}
    />
  );
}
