# Laws of UX craft rules

Universal cognitive, perceptual, and ergonomic heuristics mapped to concrete code and layout decisions.

## Perception & visual grouping

- **Law of Proximity**: Objects near each other form a perceived group.
  - Spacing within related items: `8px`–`12px`.
  - Spacing between unrelated groups: `24px`–`40px`.
  - Uniform gap everywhere destroys semantic grouping.
- **Law of Similarity**: Equivalent functions must look identical.
  - All secondary buttons share the same border and padding.
  - Unique styling is reserved exclusively for the primary call-to-action or featured choice.
- **Law of Common Region**: A bounded border or tinted background unites elements.
  - Cards should have `padding >= 16px` and a subtle border or background distinction.
  - Avoid framing every micro-element in its own card; reserve common regions for major logical units.
- **Von Restorff Effect (Isolation Effect)**: The item that stands out from a list is remembered.
  - Used in pricing tables or plan pickers: exactly one plan is highlighted with a "Recommended" badge and accentuated border.

## Cognitive load & decision making

- **Hick's Law**: Time to make a decision increases logarithmically with the number of choices.
  - In dropdowns and option lists: present at most 5–7 primary choices without sub-grouping.
  - In form flows: use multi-step progressive disclosure instead of an intimidating 20-field wall.
- **Miller's Law / Chunking**: Working memory holds roughly 4–7 chunks.
  - Group long numeric inputs (phone numbers, account IDs) into 3–4 character segments.
  - Structure long forms into clearly titled sections with helper descriptions.
- **Fitts's Law**: Time to acquire a target is a function of distance and size.
  - Interactive touch/click targets must be at least `44×44px` (or `32px` minimum on dense desktop tools).
  - Destructive actions ("Delete account") must be separated from frequent primary actions to prevent misclicks.
