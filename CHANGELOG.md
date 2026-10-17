# Changelog

# [0.2.0](https://github.com/prompt-agency/react-native-voice-activator/compare/v0.1.2...v0.2.0) (2026-10-17)


* fix!: remove the keywordsAreRawText flag ([7623d9d](https://github.com/prompt-agency/react-native-voice-activator/commit/7623d9dbcf7e010db331fe820dda52c63251a95c))


### Bug Fixes

* **android:** delete the raw-text keywords path ([f3e6702](https://github.com/prompt-agency/react-native-voice-activator/commit/f3e67020f03d2b1a37e98e893c11fd26c6bd341e))
* **ci:** prepare native projects for release builds ([#35](https://github.com/prompt-agency/react-native-voice-activator/issues/35)) ([1883b08](https://github.com/prompt-agency/react-native-voice-activator/commit/1883b088d260404054adebfc44be6f0fc07d16ae))
* **docs:** float the Buy Me a Coffee button clear of the nav logo ([889e3cd](https://github.com/prompt-agency/react-native-voice-activator/commit/889e3cd1786768c6131247c95ea06ba5d552b610))
* escape the space marker and correct a misleading comment ([a588487](https://github.com/prompt-agency/react-native-voice-activator/commit/a588487d855c3190c191de749f10007dce05ebef))
* escape the space marker in keyword test fixtures ([3d3f21e](https://github.com/prompt-agency/react-native-voice-activator/commit/3d3f21e71c4f63e3d28d5495120b7d55d973428b))
* fail closed when tokens.txt exists but cannot be read ([7280029](https://github.com/prompt-agency/react-native-voice-activator/commit/72800298fd592f3044146e1f4af38bb477c206f6))
* harden model and wake phrase asset preparation ([b2c7f2a](https://github.com/prompt-agency/react-native-voice-activator/commit/b2c7f2a7da9a7437c63614053caed803be1c536d))
* **ios:** delete the raw-text keywords path ([050de2d](https://github.com/prompt-agency/react-native-voice-activator/commit/050de2d679a4fd1385754ca476534dad6e3593ca))
* pin tokens.txt in the drift guard and correct the tie-break rationale ([fcc1f14](https://github.com/prompt-agency/react-native-voice-activator/commit/fcc1f149737a3b5d6a79507a3e61323107b0e771))
* verify wakePhrase tokens against the bundle's own tokens.txt ([5a30c1a](https://github.com/prompt-agency/react-native-voice-activator/commit/5a30c1a697c138a4e520ddd9ae34dfa2ea3a0e7c)), closes [#31](https://github.com/prompt-agency/react-native-voice-activator/issues/31)
* write pre-tokenized keywords files for a custom wakePhrase ([23c643f](https://github.com/prompt-agency/react-native-voice-activator/commit/23c643f435eb9403a2114df40e352c24dcb4c7c5))


### Features

* generate the keyword vocabulary table from bpe.model ([9de3b58](https://github.com/prompt-agency/react-native-voice-activator/commit/9de3b58e25e22231ec132feadfa0cf20d5a1f167))
* tokenize wake phrases with Viterbi segmentation ([9ee5f01](https://github.com/prompt-agency/react-native-voice-activator/commit/9ee5f01a0ae7e870edd12e6380e6be4fd28fcfb6))


### BREAKING CHANGES

* WakeWordEngineConfiguration.keywordsAreRawText and
WakeWordEvaluationCorpus.keywordsAreRawText are removed. Neither had a
working non-default value.

Refs #31.

## [0.1.2](https://github.com/prompt-agency/react-native-voice-activator/compare/v0.1.1...v0.1.2) (2026-10-05)


### Bug Fixes

* **ci:** align the publish job with npm's documented OIDC example ([#25](https://github.com/prompt-agency/react-native-voice-activator/issues/25)) ([d30b671](https://github.com/prompt-agency/react-native-voice-activator/commit/d30b671bfc74dc92685f92e7897cbf10d78ff2b1))
* point the on-demand model bundle at the directory holding the models ([d0f19ba](https://github.com/prompt-agency/react-native-voice-activator/commit/d0f19ba6b3981aee43c435012d7e44c180a7faef))

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
