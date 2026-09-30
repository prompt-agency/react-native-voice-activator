# Changelog

All notable changes to this project will be documented in this file. See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## 0.1.1 (2026-09-30)

First release published from CI. No runtime changes: the package code is
identical to 0.1.0.

### Release process

* Published via npm trusted publishing from GitHub Actions. No token, no
  one-time password, and a provenance attestation attached automatically.
* The publish workflow re-verifies that every release asset resolves and matches
  its checksum manifest before publishing, so a partial or corrupt asset upload
  can no longer produce a published-but-unusable version.
* `release-it` no longer publishes to npm; it cuts the version, tag and GitHub
  release, and CI does the rest.

### Fixes

* `repository.url` is now `git+https://`, which npm was silently auto-correcting
  on every publish.
* The `v0.1.0` tag could not be built from source: it was cut before the
  lockfile caught up with the tightened `react` and `react-native` peer ranges,
  so `yarn install --immutable` failed on it. Fixed on `main`, and this tag
  carries the correct lockfile.

