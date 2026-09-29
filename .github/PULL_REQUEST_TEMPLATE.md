## What and why

<!-- What changes, and what problem it solves. Link the issue if there is one. -->

## How it was verified

<!--
Paste the commands you ran and their result. "Tests pass" on its own is not
evidence; the output is.

  yarn lint
  yarn typecheck
  yarn test

Changes to native code need more than a compile:

  cd example/android && ./gradlew :react-native-voice-activator:compileDebugKotlin
  yarn verify:native-checks        # host-side Objective-C++ checks, macOS only

If it touches the microphone path, the audio session, the foreground service or
model resolution, say which physical device you ran it on. Those paths have all
had bugs that unit tests and the example app could not surface.
-->

## Claims

<!--
If this adds or changes a performance, accuracy or reliability claim in the
README or docs, say what backs it. A number without a measurement behind it is
the one thing this project tries hardest not to ship; see
docs/reliability-validation.md.

Delete this section if the PR makes no such claim.
-->
