# Account permission enforcement

Issue: #1974

## Acceptance
- Every publication explicitly names nonempty valid account IDs belonging to its current provider; unknown, malformed or disabled members reject the whole batch before publication.
- Read owner permission after account listing; changes since tool mounting apply immediately. Missing new-profile metadata preserves enabled defaults, unavailable or corrupt policy refuses publication and destructive metadata rewrites.
- Group tools cannot change invocation permission, including direct execution bypassing schema; ordinary grouping preserves denial. Owner account settings retain permission toggles.
- Synthetic clients and temporary files prove both providers, multi-account denial, cloud errors, malformed metadata, and allowed controls. No real publication or account action. No UI change; browser acceptance not applicable.
