# COLLABIZ in Material style (Google-like)

The signed-in apps (partner web, admin console, Unite Power Lab) use a Material-style layer that follows the look of Google's apps and keeps the COLLABIZ navy and green. The public product pages (`/businesses`) follow the Google products-site layout.

| Element | Style |
|---|---|
| Canvas | `#F8FAFD`. The top bar and side menu share the canvas colour, with no borders. |
| Side menu | Pill-shaped items (40 px high). The selected item has a navy tonal fill (`#D6E2F5` / `#011E48`). Group headings are in sentence case. |
| Cards and number tiles | White, 16 px radius, 1 px hairline border (`#E1E3E1`), no shadow at rest. Clickable cards lift on hover. |
| Buttons | Pill-shaped. Filled navy for primary, outlined for secondary, text-only for ghost. The accent button is green. |
| Fields | White and outlined (`#747775`), 8 px radius, 48 px high. Focus shows a 2 px navy ring; errors show in red. |
| Search | Filled pill (`#E9EEF6`) that turns white with a shadow on focus. |
| Chips | 8 px radius, outlined. Selected chips use the navy tonal fill. |
| Segmented buttons | An outlined pill group; the selected segment uses the tonal fill. |
| Tabs | Text tabs with a 3 px navy indicator. |
| Tables | Sentence-case headers in weight 500, hairline rows, hover tint. |
| Dialogs | 28 px radius on a soft surface. |
| Type | Roboto and system stacks, headings in weight 400–500. Google's own fonts and logos are not used (they are not licensed for third parties). |

The layer is appended at the end of `packages/ui/src/styles.css` ("Material layer"), so removing that block restores the previous look. The Power Lab (Tailwind) gets the same canvas, font stack and pill menu in `apps/power/components/Shell.tsx` and `app/globals.css`.
