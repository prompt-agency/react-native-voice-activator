# Third-Party Notices

`react-native-voice-activator` is distributed under the MIT License (see
[`LICENSE`](./LICENSE)). The published package additionally **redistributes**
the third-party components listed below, in compiled or model-weight form.
Their licenses are reproduced or referenced here as those licenses require.

Applications that ship this package are redistributing these components too,
and inherit the same attribution obligations.

## Redistributed in the npm package

| Component | Version | License | Ships as |
| --- | --- | --- | --- |
| [sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx) | static-link build 1.12.29 | Apache-2.0 | `android/libs/sherpa-onnx-static-link-onnxruntime-1.12.29.aar` (`libsherpa-onnx-jni.so`) |
| [ONNX Runtime](https://github.com/microsoft/onnxruntime) | bundled with the above | MIT | `libonnxruntime.so` inside the same AAR; statically linked into `libsherpa-onnx-jni.so` on arm ABIs |
| [Silero VAD](https://github.com/snakers4/silero-vad) | v5.1.2 | MIT | `ios/Assets/silero_vad.onnx`, `android/src/main/assets/silero_vad.onnx` |
| [sherpa-onnx-kws-zipformer-gigaspeech-3.3M-2024-01-01](https://www.modelscope.cn/pkufool/sherpa-onnx-kws-zipformer-gigaspeech-3.3M-2024-01-01) | 2024-01-01 | Apache-2.0 | Keyword-spotting model weights under `ios/Assets/SherpaOnnxKws/` and `android/src/main/assets/voice-activator-sherpa-onnx/` |

### Provenance of the keyword-spotting model weights

The Apache-2.0 entry for the KWS model above is the license that model
publishes: `license: Apache License 2.0` appears in the `README.md` bundled
inside its own release archive, and ModelScope shows the same field.

Two things a redistributor should know, because neither is settled upstream:

- **Training data.** The model was trained on the GigaSpeech XL subset
  (10,000 hours), per that same bundled README. GigaSpeech's Terms of Access
  state that SpeechColab "does not own the copyright of the audio files" and
  grant access for "non-commercial research and educational purposes". The
  dataset's HuggingFace card simultaneously carries a `license: apache-2.0`
  metadata tag. Both statements sit on the same page.
- **The question has been asked and not answered.**
  [k2-fsa/sherpa-onnx#3802](https://github.com/k2-fsa/sherpa-onnx/issues/3802),
  "License clarification requested for KWS pretrained models", has been open
  since 2026-07-24 with no maintainer response. The parallel question on the
  GigaSpeech dataset card (discussion #13) is likewise unanswered.

**Where this sits.** A redistributor can reproduce the license an upstream
artifact publishes, and can say where that artifact came from. It cannot decide,
on the publisher's behalf, what license the weights carry: only k2-fsa and
SpeechColab can state that, and as of this writing neither has.

So, precisely:

- We ship the model under the license it publishes, unmodified.
- We record its training-data provenance and the open upstream questions above,
  so anyone evaluating this package can see the same facts we can.
- We did not open the upstream questions above; other users did. We track and
  link them rather than restate them.
- We do not offer a legal opinion, and nothing here is one.
- `engineConfig.assetKeys.keywordAssetKey` takes your own model, if you would
  rather not rely on this one at all.

If the answer matters to your deployment, the threads above are where it will
appear, and your own counsel is who should read it.

## Downloaded at `pod install` time (iOS)

These are too large for the npm tarball and are fetched from this project's
GitHub release assets, pinned by SHA-256 in
[`ios/vendor-checksums.json`](./ios/vendor-checksums.json):

| Component | License | Asset |
| --- | --- | --- |
| [sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx) | Apache-2.0 | `sherpa-onnx.xcframework` |
| [ONNX Runtime](https://github.com/microsoft/onnxruntime) | MIT | `sherpa-onnxruntime.xcframework` |

## Not redistributed

These are optional peer dependencies or user-supplied assets. They are resolved
from the consuming application, not shipped here, and carry their own licenses:

- `whisper.rn`, `onnxruntime-react-native`, `@dr.pogodin/react-native-fs`,
  `react-native-audio-recorder-player`
- `react-native-nitro-modules` (MIT, Copyright (c) 2024 Marc Rousavy). No code
  here imports it. It is pinned to exactly `0.31.10` because
  `react-native-audio-recorder-player@4.5.0` is itself a Nitro module and ships
  pre-generated Nitrogen output built against an older Nitro core; see the pin
  rationale in [`CLAUDE.md`](./CLAUDE.md).
- Piper / VITS TTS voices and `espeak-ng-data`, which the application supplies
  itself (see [`docs/android-tts-setup.md`](./docs/android-tts-setup.md)).
  **Note:** eSpeak NG is GPL-3.0. It is deliberately not bundled here; an
  application that ships `espeak-ng-data` takes on that license itself.

---

## MIT License

Applies to ONNX Runtime (Copyright (c) Microsoft Corporation) and Silero VAD
(Copyright (c) 2020-present Silero Team).

```
Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## Apache License 2.0

Applies to sherpa-onnx (Copyright 2022-2024 Xiaomi Corporation) and the
sherpa-onnx GigaSpeech keyword-spotting model.

```
                                 Apache License
                           Version 2.0, January 2004
                        http://www.apache.org/licenses/

   TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION

   1. Definitions.

      "License" shall mean the terms and conditions for use, reproduction,
      and distribution as defined by Sections 1 through 9 of this document.

      "Licensor" shall mean the copyright owner or entity authorized by
      the copyright owner that is granting the License.

      "Legal Entity" shall mean the union of the acting entity and all
      other entities that control, are controlled by, or are under common
      control with that entity. For the purposes of this definition,
      "control" means (i) the power, direct or indirect, to cause the
      direction or management of such entity, whether by contract or
      otherwise, or (ii) ownership of fifty percent (50%) or more of the
      outstanding shares, or (iii) beneficial ownership of such entity.

      "You" (or "Your") shall mean an individual or Legal Entity
      exercising permissions granted by this License.

      "Source" form shall mean the preferred form for making modifications,
      including but not limited to software source code, documentation
      source, and configuration files.

      "Object" form shall mean any form resulting from mechanical
      transformation or translation of a Source form, including but
      not limited to compiled object code, generated documentation,
      and conversions to other media types.

      "Work" shall mean the work of authorship, whether in Source or
      Object form, made available under the License, as indicated by a
      copyright notice that is included in or attached to the work
      (an example is provided in the Appendix below).

      "Derivative Works" shall mean any work, whether in Source or Object
      form, that is based on (or derived from) the Work and for which the
      editorial revisions, annotations, elaborations, or other modifications
      represent, as a whole, an original work of authorship. For the purposes
      of this License, Derivative Works shall not include works that remain
      separable from, or merely link (or bind by name) to the interfaces of,
      the Work and Derivative Works thereof.

      "Contribution" shall mean any work of authorship, including
      the original version of the Work and any modifications or additions
      to that Work or Derivative Works thereof, that is intentionally
      submitted to Licensor for inclusion in the Work by the copyright owner
      or by an individual or Legal Entity authorized to submit on behalf of
      the copyright owner. For the purposes of this definition, "submitted"
      means any form of electronic, verbal, or written communication sent
      to the Licensor or its representatives, including but not limited to
      communication on electronic mailing lists, source code control systems,
      and issue tracking systems that are managed by, or on behalf of, the
      Licensor for the purpose of discussing and improving the Work, but
      excluding communication that is conspicuously marked or otherwise
      designated in writing by the copyright owner as "Not a Contribution."

      "Contributor" shall mean Licensor and any individual or Legal Entity
      on behalf of whom a Contribution has been received by Licensor and
      subsequently incorporated within the Work.

   2. Grant of Copyright License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      copyright license to reproduce, prepare Derivative Works of,
      publicly display, publicly perform, sublicense, and distribute the
      Work and such Derivative Works in Source or Object form.

   3. Grant of Patent License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      (except as stated in this section) patent license to make, have made,
      use, offer to sell, sell, import, and otherwise transfer the Work,
      where such license applies only to those patent claims licensable
      by such Contributor that are necessarily infringed by their
      Contribution(s) alone or by combination of their Contribution(s)
      with the Work to which such Contribution(s) was submitted. If You
      institute patent litigation against any entity (including a
      cross-claim or counterclaim in a lawsuit) alleging that the Work
      or a Contribution incorporated within the Work constitutes direct
      or contributory patent infringement, then any patent licenses
      granted to You under this License for that Work shall terminate
      as of the date such litigation is filed.

   4. Redistribution. You may reproduce and distribute copies of the
      Work or Derivative Works thereof in any medium, with or without
      modifications, and in Source or Object form, provided that You
      meet the following conditions:

      (a) You must give any other recipients of the Work or
          Derivative Works a copy of this License; and

      (b) You must cause any modified files to carry prominent notices
          stating that You changed the files; and

      (c) You must retain, in the Source form of any Derivative Works
          that You distribute, all copyright, patent, trademark, and
          attribution notices from the Source form of the Work,
          excluding those notices that do not pertain to any part of
          the Derivative Works; and

      (d) If the Work includes a "NOTICE" text file as part of its
          distribution, then any Derivative Works that You distribute must
          include a readable copy of the attribution notices contained
          within such NOTICE file, excluding those notices that do not
          pertain to any part of the Derivative Works, in at least one
          of the following places: within a NOTICE text file distributed
          as part of the Derivative Works; within the Source form or
          documentation, if provided along with the Derivative Works; or,
          within a display generated by the Derivative Works, if and
          wherever such third-party notices normally appear. The contents
          of the NOTICE file are for informational purposes only and
          do not modify the License. You may add Your own attribution
          notices within Derivative Works that You distribute, alongside
          or as an addendum to the NOTICE text from the Work, provided
          that such additional attribution notices cannot be construed
          as modifying the License.

      You may add Your own copyright statement to Your modifications and
      may provide additional or different license terms and conditions
      for use, reproduction, or distribution of Your modifications, or
      for any such Derivative Works as a whole, provided Your use,
      reproduction, and distribution of the Work otherwise complies with
      the conditions stated in this License.

   5. Submission of Contributions. Unless You explicitly state otherwise,
      any Contribution intentionally submitted for inclusion in the Work
      by You to the Licensor shall be under the terms and conditions of
      this License, without any additional terms or conditions.
      Notwithstanding the above, nothing herein shall supersede or modify
      the terms of any separate license agreement you may have executed
      with Licensor regarding such Contributions.

   6. Trademarks. This License does not grant permission to use the trade
      names, trademarks, service marks, or product names of the Licensor,
      except as required for reasonable and customary use in describing the
      origin of the Work and reproducing the content of the NOTICE file.

   7. Disclaimer of Warranty. Unless required by applicable law or
      agreed to in writing, Licensor provides the Work (and each
      Contributor provides its Contributions) on an "AS IS" BASIS,
      WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or
      implied, including, without limitation, any warranties or conditions
      of TITLE, NON-INFRINGEMENT, MERCHANTABILITY, or FITNESS FOR A
      PARTICULAR PURPOSE. You are solely responsible for determining the
      appropriateness of using or redistributing the Work and assume any
      risks associated with Your exercise of permissions under this License.

   8. Limitation of Liability. In no event and under no legal theory,
      whether in tort (including negligence), contract, or otherwise,
      unless required by applicable law (such as deliberate and grossly
      negligent acts) or agreed to in writing, shall any Contributor be
      liable to You for damages, including any direct, indirect, special,
      incidental, or consequential damages of any character arising as a
      result of this License or out of the use or inability to use the
      Work (including but not limited to damages for loss of goodwill,
      work stoppage, computer failure or malfunction, or any and all
      other commercial damages or losses), even if such Contributor
      has been advised of the possibility of such damages.

   9. Accepting Warranty or Additional Liability. While redistributing
      the Work or Derivative Works thereof, You may choose to offer,
      and charge a fee for, acceptance of support, warranty, indemnity,
      or other liability obligations and/or rights consistent with this
      License. However, in accepting such obligations, You may act only
      on Your own behalf and on Your sole responsibility, not on behalf
      of any other Contributor, and only if You agree to indemnify,
      defend, and hold each Contributor harmless for any liability
      incurred by, or claims asserted against, such Contributor by reason
      of your accepting any such warranty or additional liability.

   END OF TERMS AND CONDITIONS
```
