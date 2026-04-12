# Android Battery Optimization

Android wake-word runtime behavior is still constrained by foreground-service
rules and OEM battery management.

This package does not claim that it can bypass those platform policies.

## What The Package Requires

Supported Android background continuation still depends on:

- starting detection from a visible activity context
- microphone permission
- foreground-service ownership
- an active foreground-service notification while detection is running

If those requirements are not met, the runtime surfaces explicit `permission`
or `platform` failures such as
`foreground_service_visible_context_required`.

## What Battery Optimization Can Still Break

Even when your app follows the supported package contract, OEM battery
management can still:

- stop your process aggressively after the app leaves the foreground
- constrain microphone or foreground-service behavior
- interrupt long-running validation in ways the package cannot normalize away

That is why this repository treats Android background and endurance validation
as device-level proof, not a promise inferred from host-side tests.

## Practical Guidance For Host Apps

- start detection only from a visible app context
- verify the foreground-service notification is visible during runtime
- test at least one real device from your target OEM/device matrix
- document any manufacturer-specific battery settings your app requires
- treat repeated background teardown under aggressive OEM policies as a device
  integration problem until proven otherwise

## What This Repo Proves Today

The repository currently proves:

- Android native packaging and compile evidence
- shared runtime error/state normalization
- documented visible-context and foreground-service requirements

The repository does not currently prove:

- immunity from OEM battery management
- full device-matrix endurance behavior
- production-ready Android background reliability on every vendor build

For the broader runtime boundary, see
[`./background-behavior.md`](./background-behavior.md) and
[`./reliability-validation.md`](./reliability-validation.md).
