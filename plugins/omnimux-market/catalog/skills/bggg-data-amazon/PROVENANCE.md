# BGGG Amazon Data distribution provenance

- Upstream: https://github.com/binggandata/bggg-skills
- Fixed ref: `1034ee5805f3fd5b010a4f57affa4aa796ab75d5`
- Subdirectory: `bggg-data-amazon`
- Retrieved from public raw.githubusercontent.com URLs on 2026-09-09. Each original file was verified against its Git blob SHA from the fixed-ref public tree API.
- Distribution: the existing OmniMux Market bundled-directory installer copies this complete directory. No git-local fallback or floating branch is used.
- Root MIT copyright/permission notice: `LICENSE` (BGGG, 2026), original blob `f7f6f5e831eaae0afea9565f47c5eaa66545c7fc`.
- Scraper upstream MIT copyright/permission notice: `references/upstream_LICENSE`, original blob `14fac913ccf80234b1848540089a3bbcb6e5283d`.
- Original SKILL.md blob: `5dfdf3fa95f8874d5e0539826e2ff279ed3560f9`.
- Local adaptation: SKILL.md adds explicit Python/command prerequisites, project-versus-installed-resource path resolution and authorization/data-rights limits; command examples address scripts through absolute `SKILL_ROOT`. All upstream scripts, references, agent metadata and tests are unchanged.
- Python 3.10+ is the supported runtime requirement for this distribution; only the standard library is used. Python is not provisioned by this package. Woot/network availability has not been tested, and no collection was executed during admission.
- Other BGGG suite Skills are not bundled or automatically loaded. Software licensing does not grant rights to redistribute collected review content.
