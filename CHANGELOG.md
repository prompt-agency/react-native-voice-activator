# Changelog

## [1.0.0](https://github.com/prompt-agency/react-native-voice-activator/compare/react-native-voice-activator-v0.2.1...react-native-voice-activator-v1.0.0) (2026-10-30)


### ⚠ BREAKING CHANGES

* WakeWordEngineConfiguration.keywordsAreRawText and WakeWordEvaluationCorpus.keywordsAreRawText are removed. Neither had a working non-default value.

### Features

* **01-02:** add SherpaOnnxSpeakerEmbedding and SherpaOnnxDenoiser iOS wrappers ([5c8b0cb](https://github.com/prompt-agency/react-native-voice-activator/commit/5c8b0cb97b87487afa09d4ffc3d8900ffb3e5732))
* **01-02:** add SherpaOnnxSpeakerEmbedding and SherpaOnnxDenoiser iOS wrappers ([27f03a2](https://github.com/prompt-agency/react-native-voice-activator/commit/27f03a25cc7c1ff80645839f896ebf37b1198f13))
* **01-02:** add SherpaOnnxSpeakerEmbedding and SherpaOnnxDenoiser iOS wrappers ([db46ae7](https://github.com/prompt-agency/react-native-voice-activator/commit/db46ae75a09692d1ca2b5807110caf1a1fd6ec84))
* **01-02:** wire 8 bridge methods into VoiceActivator.mm ([f3b910f](https://github.com/prompt-agency/react-native-voice-activator/commit/f3b910fc9e472916ca5c7e5dd79f24ac6b16532e))
* **01-02:** wire 8 bridge methods into VoiceActivator.mm ([01aa716](https://github.com/prompt-agency/react-native-voice-activator/commit/01aa71600f11af433d954b2224ab8bd6d80625a2))
* **01-02:** wire 8 bridge methods into VoiceActivator.mm ([bd582aa](https://github.com/prompt-agency/react-native-voice-activator/commit/bd582aaeb4fc0e3abd10d50e27f6496f99966e9c))
* **01-03:** add SherpaOnnxSpeakerEmbedding and SherpaOnnxDenoiser Kotlin wrappers ([3e5ce76](https://github.com/prompt-agency/react-native-voice-activator/commit/3e5ce76682bd86fa960c93ffcb5bbae12fb37c2f))
* **01-03:** wire 8 bridge methods into VoiceActivatorModule.kt ([fc324b2](https://github.com/prompt-agency/react-native-voice-activator/commit/fc324b2254c7c0d670041b2668f0fe6eb18a20ac))
* **01-native-bridge-01:** declare 7 Phase 1 bridge methods in NativeVoiceActivator.ts spec ([ea19e45](https://github.com/prompt-agency/react-native-voice-activator/commit/ea19e459fb762166f419c8de6e0c62d80c48fdbf))
* **02-01:** add provider interfaces and SherpaOnnxSpeakerVerificationAdapter ([33a175f](https://github.com/prompt-agency/react-native-voice-activator/commit/33a175fe3f12bed7d4063e36972c423d84fa39e0))
* **02-02:** implement SherpaOnnxNoiseSuppressionAdapter and SherpaOnnxAntiSpoofingAdapter ([95f55ae](https://github.com/prompt-agency/react-native-voice-activator/commit/95f55ae10c2245769d40a33498eab38e7d858184))
* **02-03:** export new adapters and types from public API surface ([3b9c5cf](https://github.com/prompt-agency/react-native-voice-activator/commit/3b9c5cfecf3d4041af68fd4c6cdcddf2b5d3667e))
* **02-03:** extend WakeWordInitializationOptions and wire provider module state ([97e09d8](https://github.com/prompt-agency/react-native-voice-activator/commit/97e09d8a48e8666d4b1f017dff5dd943fe5764e5))
* **03-01:** add abort() method and NOISE-03 preprocessing to VoiceSessionOrchestrator ([8b1902d](https://github.com/prompt-agency/react-native-voice-activator/commit/8b1902d85a92043782f73f019c4db72757fb2162))
* **03-01:** add abort() method and NOISE-03 preprocessing to VoiceSessionOrchestrator ([082ea8d](https://github.com/prompt-agency/react-native-voice-activator/commit/082ea8d0fa92ce67cd53b36ff7bbdf085054be34))
* **03-01:** add verification event types, new options fields, and enrollment API to types.ts + session-events.ts ([e114612](https://github.com/prompt-agency/react-native-voice-activator/commit/e114612f343f8a339c277f0d4119c1cb61c8df72))
* **03-01:** add verification event types, new options fields, and enrollment API to types.ts + session-events.ts ([cf49ccb](https://github.com/prompt-agency/react-native-voice-activator/commit/cf49ccbcf3000c1301971bdbdd4a07b6184e25d7))
* **03-02:** export enrollment methods and verification event types from public API ([95a4433](https://github.com/prompt-agency/react-native-voice-activator/commit/95a443370bd6c720fc76f4b03fd443aa434e4949))
* **03-02:** export enrollment methods and verification event types from public API ([dc47a04](https://github.com/prompt-agency/react-native-voice-activator/commit/dc47a048095cb0fe4c49162ee85c813dd1c8b987))
* **03-02:** wire speaker verification gate into queueProviderOrchestration ([4f780f0](https://github.com/prompt-agency/react-native-voice-activator/commit/4f780f0d67057b274512b225926ea39489fd91f2))
* **03-02:** wire speaker verification gate into queueProviderOrchestration ([3fb45d1](https://github.com/prompt-agency/react-native-voice-activator/commit/3fb45d12290e968f1879f9a39fc952b59fb94d8c))
* **03-03:** wire VAD pre-wake gate and PCM ring buffer in voice-activator.ts ([fa91ce6](https://github.com/prompt-agency/react-native-voice-activator/commit/fa91ce6e61e19f16c8e1a0144e9c5a243ff8a171))
* **03-03:** wire VAD pre-wake gate and PCM ring buffer in voice-activator.ts ([083be3b](https://github.com/prompt-agency/react-native-voice-activator/commit/083be3b616a1e86433a009c8820763ddc8a5f0fa))
* **04-01:** create withModelAssets Expo config plugin ([913d370](https://github.com/prompt-agency/react-native-voice-activator/commit/913d37002142c6b2b03b667c0a2b975f5bb23810))
* **04-01:** create withModelAssets Expo config plugin ([a9b3d30](https://github.com/prompt-agency/react-native-voice-activator/commit/a9b3d30226dfdb10942569e6875da09e35fc3a95))
* **04-01:** extend VoiceActivatorPluginProps and compose withModelAssets ([e18a1c2](https://github.com/prompt-agency/react-native-voice-activator/commit/e18a1c29f6315314ea1d9b20ad540b7e14f16b6a))
* **04-01:** extend VoiceActivatorPluginProps and compose withModelAssets ([eba3331](https://github.com/prompt-agency/react-native-voice-activator/commit/eba3331945699da5070dea4f2a4aa72f32dede38))
* **04-03:** add EnrollmentScreen with full enrollment round-trip ([1d82aec](https://github.com/prompt-agency/react-native-voice-activator/commit/1d82aecde01199d45d0d5cd5ddd70f54230ab39c))
* **04-03:** add EnrollmentScreen with full enrollment round-trip ([4c499ec](https://github.com/prompt-agency/react-native-voice-activator/commit/4c499ece734a98cea137089c72569af03967e035))
* add patches for onnxruntime-react-native and react-native-audio-recorder-player ([9fb9727](https://github.com/prompt-agency/react-native-voice-activator/commit/9fb9727a36db56c5985cc68e06da6bc9ac79ef05))
* add patches for onnxruntime-react-native and react-native-audio-recorder-player ([ffbb87a](https://github.com/prompt-agency/react-native-voice-activator/commit/ffbb87af2c7b245f6abb13e559fc36f929a70915))
* add runtime initialization warning and update sample recording logic in EnrollmentScreen ([5787078](https://github.com/prompt-agency/react-native-voice-activator/commit/578707836ee5db87432036bdc5a5463f7314feca))
* add runtime initialization warning and update sample recording logic in EnrollmentScreen ([a55d772](https://github.com/prompt-agency/react-native-voice-activator/commit/a55d7727b54d8ff8cd35dc293b581fc423088fb3))
* add support for Sherpa-ONNX speaker embedding model; update related configurations and scripts ([3be01a1](https://github.com/prompt-agency/react-native-voice-activator/commit/3be01a1ff7a94198eb45850b320f913265f3932a))
* add support for Sherpa-ONNX speaker embedding model; update related configurations and scripts ([0249d4f](https://github.com/prompt-agency/react-native-voice-activator/commit/0249d4fe8e64ef68089d0bcb8f8112809d0ffacc))
* enhance speaker model handling and PCM audio recording ([6bca0c9](https://github.com/prompt-agency/react-native-voice-activator/commit/6bca0c99e5b608019451067f6eba238c88b261b1))
* enhance TTS support with SherpaOnnxTTSAdapter for Android; update README and troubleshooting docs ([24fe802](https://github.com/prompt-agency/react-native-voice-activator/commit/24fe802a43406898931113af6f0625388934bb25))
* enhance TTS support with SherpaOnnxTTSAdapter for Android; update README and troubleshooting docs ([8b760c4](https://github.com/prompt-agency/react-native-voice-activator/commit/8b760c4dbd29d45b011295ae526e7dddfabcad29))
* **example:** add echo handler info card to Conversation screen ([0488048](https://github.com/prompt-agency/react-native-voice-activator/commit/04880480edde98e7e771920c95f2097d0edff1b1))
* **example:** add progress dots for sample tracking in Speaker ID ([fcbfa87](https://github.com/prompt-agency/react-native-voice-activator/commit/fcbfa876348e4fb88ba88eddadd4658ca8f998af))
* **example:** add waveform bars during mic recording in Speaker ID ([1601eaf](https://github.com/prompt-agency/react-native-voice-activator/commit/1601eaf3118e9542e89b0672fc11cebd195f66f8))
* **example:** enhance tab structure with numbering and style adjustments ([4399e00](https://github.com/prompt-agency/react-native-voice-activator/commit/4399e0057f21b9a158856a96e6ebec24b369a2b4))
* **example:** polish example app into self-explanatory developer showcase ([6c7c49a](https://github.com/prompt-agency/react-native-voice-activator/commit/6c7c49a4209db68d8bca5b5565fcb9c347109f4a))
* **example:** reorder tabs and rename with numbered labels ([5f11871](https://github.com/prompt-agency/react-native-voice-activator/commit/5f1187177bf4926731caa437a096bb1aee8e0e2e))
* **example:** replace dummy buffer with real mic recording in Speaker ID ([8ca0a6e](https://github.com/prompt-agency/react-native-voice-activator/commit/8ca0a6e3cb65fa00419bd5d4e5a4f0b0a3af8756))
* **example:** update enrollment hero and add user ID input ([aa6b69c](https://github.com/prompt-agency/react-native-voice-activator/commit/aa6b69c9034d1d70bb0817804a351fe76bab21c6))
* **example:** update hero copy on Wake Word, Conversation, Speech Engines screens ([4132eb5](https://github.com/prompt-agency/react-native-voice-activator/commit/4132eb5d5fb27d93b49a5066921f01b752a9db7c))
* generate the keyword vocabulary table from bpe.model ([9de3b58](https://github.com/prompt-agency/react-native-voice-activator/commit/9de3b58e25e22231ec132feadfa0cf20d5a1f167))
* **gradle:** add gradle-daemon-jvm.properties to pin JDK version to 17 ([01e6ab4](https://github.com/prompt-agency/react-native-voice-activator/commit/01e6ab4b31e63841c10a9d75c40b756f9cfd0fdf))
* implement Android asset copying for Sherpa TTS model and espeak-ng-data ([9fb9727](https://github.com/prompt-agency/react-native-voice-activator/commit/9fb9727a36db56c5985cc68e06da6bc9ac79ef05))
* implement Android asset copying for Sherpa TTS model and espeak-ng-data ([ffbb87a](https://github.com/prompt-agency/react-native-voice-activator/commit/ffbb87af2c7b245f6abb13e559fc36f929a70915))
* **ios:** download XCFrameworks at pod install instead of bundling in npm ([facaea5](https://github.com/prompt-agency/react-native-voice-activator/commit/facaea5ae0cf51ffbcd2a637fa249e317d0fa4c2))
* React Native 0.86 support and pre-publish hardening ([#9](https://github.com/prompt-agency/react-native-voice-activator/issues/9)) ([3eb3882](https://github.com/prompt-agency/react-native-voice-activator/commit/3eb3882d8475f68cd49862b7be6e940752412cfb))
* tokenize wake phrases with Viterbi segmentation ([9ee5f01](https://github.com/prompt-agency/react-native-voice-activator/commit/9ee5f01a0ae7e870edd12e6380e6be4fd28fcfb6))


### Bug Fixes

* **03-01:** correct TTS mock type signature in phase-03-orchestrator test ([8aa7b57](https://github.com/prompt-agency/react-native-voice-activator/commit/8aa7b5712e05e0a29f59e2d7b6945c904980dc06))
* **03-01:** correct TTS mock type signature in phase-03-orchestrator test ([ff7b1b2](https://github.com/prompt-agency/react-native-voice-activator/commit/ff7b1b26f57b213239c9c32910b5d646b8b9d406))
* **04:** revise plans based on checker feedback ([250488c](https://github.com/prompt-agency/react-native-voice-activator/commit/250488c13623c9b2366a2761c12493d6ef088849))
* **04:** revise plans based on checker feedback ([1201a6c](https://github.com/prompt-agency/react-native-voice-activator/commit/1201a6c985ccddcb80a5fab4ba98eca413fe39b2))
* **android:** delete the raw-text keywords path ([f3e6702](https://github.com/prompt-agency/react-native-voice-activator/commit/f3e67020f03d2b1a37e98e893c11fd26c6bd341e))
* **build:** keep emitted declarations out of the typecheck scope ([c194abb](https://github.com/prompt-agency/react-native-voice-activator/commit/c194abbca25cfaecd3f922946d149a2d60be6c70))
* **ci:** align the publish job with npm's documented OIDC example ([#25](https://github.com/prompt-agency/react-native-voice-activator/issues/25)) ([d30b671](https://github.com/prompt-agency/react-native-voice-activator/commit/d30b671bfc74dc92685f92e7897cbf10d78ff2b1))
* **ci:** generate the example's native projects before compiling them ([d6b992c](https://github.com/prompt-agency/react-native-voice-activator/commit/d6b992c38c24130ebf2781defe19f833e6dd5608))
* **ci:** pin npm to the 11.x line in the publish job ([#23](https://github.com/prompt-agency/react-native-voice-activator/issues/23)) ([3783b43](https://github.com/prompt-agency/react-native-voice-activator/commit/3783b4395194c7995df4eb7544122ffa815ce41a))
* **ci:** prepare native projects for release builds ([#35](https://github.com/prompt-agency/react-native-voice-activator/issues/35)) ([1883b08](https://github.com/prompt-agency/react-native-voice-activator/commit/1883b088d260404054adebfc44be6f0fc07d16ae))
* **ci:** update the lockfile for the tightened peer ranges ([a420496](https://github.com/prompt-agency/react-native-voice-activator/commit/a42049616d255008b62dc3866ed1a6e16426d0a7))
* **deps:** stop Dependabot grouping React Native upgrades as dev bumps ([5712d85](https://github.com/prompt-agency/react-native-voice-activator/commit/5712d858bc9c92a541a1c91458dcb2e685cec445))
* **docs:** float the Buy Me a Coffee button clear of the nav logo ([889e3cd](https://github.com/prompt-agency/react-native-voice-activator/commit/889e3cd1786768c6131247c95ea06ba5d552b610))
* **docs:** tell people to install the peer the quickstart needs ([#21](https://github.com/prompt-agency/react-native-voice-activator/issues/21)) ([a540f3f](https://github.com/prompt-agency/react-native-voice-activator/commit/a540f3fa28fdcac754b1f8bd1c999c7daf4bc427))
* escape the space marker and correct a misleading comment ([a588487](https://github.com/prompt-agency/react-native-voice-activator/commit/a588487d855c3190c191de749f10007dce05ebef))
* escape the space marker in keyword test fixtures ([3d3f21e](https://github.com/prompt-agency/react-native-voice-activator/commit/3d3f21e71c4f63e3d28d5495120b7d55d973428b))
* **example:** cleanup recorder on unmount, fix stale sampleCount closure ([4ed7acf](https://github.com/prompt-agency/react-native-voice-activator/commit/4ed7acfe4b0be6df5de1c9da398a15bd5071decf))
* **example:** make the conversation session complete a turn ([97011c8](https://github.com/prompt-agency/react-native-voice-activator/commit/97011c865a012bf32a90ad09e9ead822995fd367))
* **example:** point the EAS verify profile at the release that exists ([8e5dceb](https://github.com/prompt-agency/react-native-voice-activator/commit/8e5dceb25f184a3ab1a65249e585cc890d6edd7f))
* **example:** stop pinning Gradle to an absolute macOS JDK path ([307aaf9](https://github.com/prompt-agency/react-native-voice-activator/commit/307aaf9f6d5c534c659b9033d178a8a7ddb78162))
* **expo:** register onnxruntime package from the config plugin ([c118c43](https://github.com/prompt-agency/react-native-voice-activator/commit/c118c43cd9228fc9e9d03aef4eb24dba53aeb6dc))
* fail closed when tokens.txt exists but cannot be read ([7280029](https://github.com/prompt-agency/react-native-voice-activator/commit/72800298fd592f3044146e1f4af38bb477c206f6))
* harden model and wake phrase asset preparation ([b2c7f2a](https://github.com/prompt-agency/react-native-voice-activator/commit/b2c7f2a7da9a7437c63614053caed803be1c536d))
* **ios:** avoid AudioSessionManager symbol collision ([fd57ea9](https://github.com/prompt-agency/react-native-voice-activator/commit/fd57ea924d61cadeeffce3d7b96bc82c4b91c70a))
* **ios:** delete the raw-text keywords path ([050de2d](https://github.com/prompt-agency/react-native-voice-activator/commit/050de2d679a4fd1385754ca476534dad6e3593ca))
* **ios:** namespace audio session manager ([3e22d1e](https://github.com/prompt-agency/react-native-voice-activator/commit/3e22d1e7e29decae013ea99a4a8501720b1fa5e7))
* **ios:** unbreak the iOS build ([8dcbea3](https://github.com/prompt-agency/react-native-voice-activator/commit/8dcbea3402c3fed95675bacff44101f79dba47c7))
* **ios:** use curl -fL so HTTP errors fail loudly in prepare_command ([4d3a5b8](https://github.com/prompt-agency/react-native-voice-activator/commit/4d3a5b8000187eb08687f576af0a049baf7561fa))
* **ios:** verify downloaded xcframeworks against a pinned manifest ([88a7762](https://github.com/prompt-agency/react-native-voice-activator/commit/88a7762bc8ab8ae9d76583980dee395924431fa2))
* **lint:** fix all Prettier formatting and ESLint warnings ([a88e881](https://github.com/prompt-agency/react-native-voice-activator/commit/a88e8817f8a8cd19e434fb553daa054619116287))
* pin onnxruntime-android version to avoid Maven metadata fetch issues with Java 25 and Gradle 8.13 ([0b74963](https://github.com/prompt-agency/react-native-voice-activator/commit/0b74963f6e1ad3b079cd5c30d9a973ef5c10df02))
* pin onnxruntime-android version to avoid Maven metadata fetch issues with Java 25 and Gradle 8.13 ([3aaf7a8](https://github.com/prompt-agency/react-native-voice-activator/commit/3aaf7a808a5f97b170a89b7844b73d29802e6b8c))
* pin tokens.txt in the drift guard and correct the tie-break rationale ([fcc1f14](https://github.com/prompt-agency/react-native-voice-activator/commit/fcc1f149737a3b5d6a79507a3e61323107b0e771))
* point the on-demand model bundle at the directory holding the models ([d0f19ba](https://github.com/prompt-agency/react-native-voice-activator/commit/d0f19ba6b3981aee43c435012d7e44c180a7faef))
* remove the keywordsAreRawText flag ([7623d9d](https://github.com/prompt-agency/react-native-voice-activator/commit/7623d9dbcf7e010db331fe820dda52c63251a95c))
* resolve the on-demand model bundle root, and add a recorded demo ([8019d2a](https://github.com/prompt-agency/react-native-voice-activator/commit/8019d2a937e919e5a576b6f07b9ffde5cab57a10))
* tokenize custom wake phrases and harden asset preparation ([736cee3](https://github.com/prompt-agency/react-native-voice-activator/commit/736cee3d0f7f0c32a2116c700a6c4796f8780730))
* update ManualScreen title and text for Sherpa-ONNX ([9fb9727](https://github.com/prompt-agency/react-native-voice-activator/commit/9fb9727a36db56c5985cc68e06da6bc9ac79ef05))
* update ManualScreen title and text for Sherpa-ONNX ([ffbb87a](https://github.com/prompt-agency/react-native-voice-activator/commit/ffbb87af2c7b245f6abb13e559fc36f929a70915))
* **vad:** isolate concurrent VAD engines and serialise inference ([55400bb](https://github.com/prompt-agency/react-native-voice-activator/commit/55400bb40a1bf8f2543b532742571496a6e76a2d))
* **vad:** make Silero VAD actually run on Android ([c92cf13](https://github.com/prompt-agency/react-native-voice-activator/commit/c92cf13886398fa4b050fdd0c56efbefda53bca1))
* verify wakePhrase tokens against the bundle's own tokens.txt ([5a30c1a](https://github.com/prompt-agency/react-native-voice-activator/commit/5a30c1a697c138a4e520ddd9ae34dfa2ea3a0e7c))
* write pre-tokenized keywords files for a custom wakePhrase ([23c643f](https://github.com/prompt-agency/react-native-voice-activator/commit/23c643f435eb9403a2114df40e352c24dcb4c7c5))


### Performance Improvements

* **audio:** decode base64 once and off the per-frame path ([b9d3957](https://github.com/prompt-agency/react-native-voice-activator/commit/b9d3957e9064f639014de4052d7b77c7cfd286c2))

## [0.2.1](https://github.com/prompt-agency/react-native-voice-activator/compare/v0.2.0...v0.2.1) (2026-10-30)


### Bug Fixes

* **ios:** namespace audio session manager ([3e22d1e](https://github.com/prompt-agency/react-native-voice-activator/commit/3e22d1e7e29decae013ea99a4a8501720b1fa5e7))

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
