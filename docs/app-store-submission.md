# App Store Submission

This package ships a microphone-driven native wake-word runtime. If your iOS
app uses it, your App Store submission materials need to describe that behavior
truthfully.

## What Your App Should Explain

Be clear that your app:

- uses the microphone to detect a local wake phrase after explicit user-driven
  activation
- performs the baseline detection path on device
- may continue audio-session ownership in the background only within the
  documented iOS audio-background limits

Do not describe the package as:

- always-on after force-quit
- capable of cold-launch wake-word recovery
- a Siri-equivalent background assistant

## Required App Configuration Surface

Your app submission should be consistent with the runtime requirements already
documented in the setup guides:

- `NSMicrophoneUsageDescription`
- `UIBackgroundModes` including `audio` if you claim supported background
  continuation
- your app’s actual user-facing explanation for when microphone access is
  active

If your app does not declare the audio background mode, do not market
background continuation as supported.

## Privacy And Review Guidance

- keep your privacy copy aligned with on-device-first baseline detection
- avoid implying hidden cloud processing for the default wake-word path
- make sure any downstream STT/TTS provider behavior is described separately
  from the package’s built-in wake-word detection
- ensure your review notes match what your shipped app actually does on device

## Testing Before Submission

Before submission, validate on a real device:

- first-run permission flow
- foreground detection start/stop
- background continuation only in the supported audio-background case
- interruption and route-change behavior relevant to your app flow

This repository provides package-level setup and contract guidance. It does not
replace your app-level App Store review preparation or your own device-matrix
validation.
