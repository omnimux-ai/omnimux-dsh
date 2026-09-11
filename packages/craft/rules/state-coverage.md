# State coverage craft rules

Universal requirements for interactive surfaces. A frequent failure in AI-generated UI is designing only the populated state. Every production component must account for the five canonical states.

## The five required states

| State | Trigger Condition | Required Elements |
|---|---|---|
| **Loading** | Data fetch or processing in flight | Skeleton shimmer or spinner, disabled triggers, timeout indicator if >10s |
| **Empty** | No records found, clean workspace, initial install | Explanatory headline, concise guidance, prominent primary creation CTA |
| **Error** | Network failure, validation rejection, API quota error | 3-part message (What happened + Why + What user can do), retry button |
| **Populated** | Normal operation with valid records | Primary data presentation, sorting/filtering controls |
| **Edge** | Extreme volume, very long strings, zero-width spaces | Truncation (`text-overflow: ellipsis`), responsive wrapping, minimum container bounds |

## Error message three-part standard

Every error prompt must answer three concrete questions:
1. **What happened**: "Unable to export video storyboard." (Clear, direct statement).
2. **Why (if knowable)**: "Frame duration total exceeds timeline track limit."
3. **What user can do**: "Shorten clip sequence or retry export." (Direct actionable button).

## Form validation timing

- **Validate on blur**: Do not show validation errors on the very first keystroke while the user is actively typing.
- **Immediate recovery**: As soon as invalid input becomes valid, clear the error immediately.
- **Preserve input on failure**: Never wipe out previously entered form values upon a failed submission.
