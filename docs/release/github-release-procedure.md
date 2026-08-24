# StoryForge GitHub Release Procedure

This procedure is for a private local release. It does not publish user stories, API keys, SQLite files, prompts, or provider responses.

## Preconditions

1. The pull request targets the protected `master` branch.
2. The pull request has passed `verify` and `e2e-authoring` in GitHub Actions.
3. The local release checklist and verification record contain fresh command results.
4. The live DeepSeek smoke has been approved by the author and its report is redacted.
5. `npm run release:evidence` has generated the SBOM, checksum list, and release evidence manifest for the exact package version.

## Release Steps

1. Merge the reviewed pull request into `master`.
2. Confirm the merged commit is the exact commit intended for release.
3. Run the full release checklist from a clean working tree.
4. Create an annotated version tag from the merged `master` commit, for example `v0.1.4`.
5. Push the tag. Wait for the tag-triggered Actions run and confirm the green Actions run is attached to the exact tag commit.
6. Create a GitHub Release from that tag. Use the matching section from `CHANGELOG.md` as the release description.
7. Attach only the public standalone artifact, generated SBOM, and checksum list. Never attach `.env*`, `data/`, SQLite files, raw logs, or test databases.
8. Record the tag, merge commit, Actions run URL, and GitHub Release URL in the verification document.

## Repository Settings

The repository owner must keep the repository visibility and licensing decision explicit, keep `master` protected with required status checks for `verify` and `e2e-authoring`, require review before merge, and disallow direct release tags from unmerged feature branches. These settings cannot be proven by local tests and must be checked in GitHub.

## Rollback

Do not delete or move a published tag. If a release is defective, publish a corrected patch version from a new green `master` commit and mark the previous GitHub Release as superseded. Author data rollback follows the local recovery procedure, not Git history.
