import NativeVoiceActivator from '../NativeVoiceActivator';
import {
  NativeEventEmitter,
  NativeModules,
  type TurboModule,
} from 'react-native';

import type {
  WakeWordAudioRouteChangedEvent,
  WakeWordDetectedEvent,
  WakeWordError,
  WakeWordInterruptionEvent,
  WakeWordStatus,
} from '../public/types';
import type { NativeWakeWordRuntimeConfiguration } from '../domain/detection-config';
import type { VoiceActivatorRuntimeBridge } from './runtime-bridge';

export interface NativeVoiceActivatorSpec extends TurboModule {
  initialize?(options: NativeWakeWordRuntimeConfiguration): Promise<void>;
  startDetection?(): Promise<void>;
  stopDetection?(): Promise<void>;
  getStatus?(): ReturnType<VoiceActivatorRuntimeBridge['getStatus']>;
  dispose?(): Promise<void>;
  setAudioRoute?(route: string): Promise<void>;
}

const NATIVE_WAKE_WORD_DETECTED_EVENT = 'VoiceActivatorOnWakeWordDetected';
const NATIVE_RUNTIME_STATE_CHANGED_EVENT =
  'VoiceActivatorOnRuntimeStateChanged';
const NATIVE_RUNTIME_ERROR_EVENT = 'VoiceActivatorOnRuntimeError';
const NATIVE_RUNTIME_INTERRUPTION_EVENT = 'VoiceActivatorOnRuntimeInterruption';
const NATIVE_RUNTIME_AUDIO_ROUTE_CHANGED_EVENT =
  'VoiceActivatorOnAudioRouteChanged';

export const nativeVoiceActivatorModule =
  NativeVoiceActivator as NativeVoiceActivatorSpec | null;

let nativeWakeWordDetectedSubscription: { remove(): void } | null = null;
let nativeRuntimeStateSubscription: { remove(): void } | null = null;
let nativeRuntimeErrorSubscription: { remove(): void } | null = null;
let nativeRuntimeInterruptionSubscription: { remove(): void } | null = null;
let nativeRuntimeAudioRouteChangedSubscription: {
  remove(): void;
} | null = null;

function resolveSetAudioRoute():
  | VoiceActivatorRuntimeBridge['setAudioRoute']
  | undefined {
  const turbo = nativeVoiceActivatorModule as
    | { setAudioRoute?: (route: string) => Promise<void> }
    | null
    | undefined;
  if (typeof turbo?.setAudioRoute === 'function') {
    return turbo.setAudioRoute.bind(turbo);
  }
  const legacy = NativeModules?.VoiceActivator as
    | { setAudioRoute?: (route: string) => Promise<void> }
    | undefined;
  if (typeof legacy?.setAudioRoute === 'function') {
    return legacy.setAudioRoute.bind(legacy);
  }
  return undefined;
}

type NativeEventEmitterModule = TurboModule & {
  addListener(eventName: string): void;
  removeListeners(count: number): void;
};

function createUnsupportedRuntimeBridge(
  reason: string,
  initializeMessage: string,
  startMessage: string,
  stopMessage: string,
  disposeMessage: string
): VoiceActivatorRuntimeBridge {
  return {
    async initialize() {
      throw new Error(initializeMessage);
    },
    async startDetection() {
      throw new Error(startMessage);
    },
    async stopDetection() {
      throw new Error(stopMessage);
    },
    getStatus() {
      return {
        state: 'unsupported',
        isAvailable: false,
        isListening: false,
        canStart: false,
        reason,
        lastError: null,
      };
    },
    async dispose() {
      throw new Error(disposeMessage);
    },
  };
}

export function getVoiceActivatorRuntimeBridge(): VoiceActivatorRuntimeBridge {
  if (!nativeVoiceActivatorModule) {
    const setAudioRouteFallback = resolveSetAudioRoute();
    return {
      ...createUnsupportedRuntimeBridge(
        'VoiceActivator requires the native runtime module. Detection is unavailable until the package is installed and built in a supported native environment.',
        'VoiceActivator.initialize is unavailable until the native runtime module is installed and built in a supported native environment.',
        'VoiceActivator.startDetection is unavailable until the native runtime module is installed and built in a supported native environment.',
        'VoiceActivator.stopDetection is unavailable until the native runtime module is installed and built in a supported native environment.',
        'VoiceActivator.dispose is unavailable until the native runtime module is installed and built in a supported native environment.'
      ),
      ...(setAudioRouteFallback
        ? { setAudioRoute: setAudioRouteFallback }
        : {}),
    };
  }

  if (
    nativeVoiceActivatorModule.initialize &&
    nativeVoiceActivatorModule.startDetection &&
    nativeVoiceActivatorModule.stopDetection &&
    nativeVoiceActivatorModule.getStatus &&
    nativeVoiceActivatorModule.dispose
  ) {
    const setAudioRoute = resolveSetAudioRoute();
    return {
      initialize: nativeVoiceActivatorModule.initialize,
      startDetection: nativeVoiceActivatorModule.startDetection,
      stopDetection: nativeVoiceActivatorModule.stopDetection,
      getStatus: () =>
        nativeVoiceActivatorModule.getStatus!() as WakeWordStatus,
      dispose: nativeVoiceActivatorModule.dispose,
      ...(setAudioRoute ? { setAudioRoute } : {}),
    };
  }

  const setAudioRoutePartial = resolveSetAudioRoute();
  return {
    ...createUnsupportedRuntimeBridge(
      'VoiceActivator native runtime is partially implemented. The package cannot use the native path until all bridge methods are available.',
      'VoiceActivator native runtime is partially implemented. Complete the native bridge methods before enabling the native path.',
      'VoiceActivator native runtime is partially implemented. Complete the native bridge methods before enabling detection.',
      'VoiceActivator native runtime is partially implemented. Complete the native bridge methods before stopping detection through the native path.',
      'VoiceActivator native runtime is partially implemented. Complete the native bridge methods before disposing the native path.'
    ),
    ...(setAudioRoutePartial ? { setAudioRoute: setAudioRoutePartial } : {}),
  };
}

export function setWakeWordDetectedHandler(
  handler: ((payload: WakeWordDetectedEvent) => void) | null
) {
  nativeWakeWordDetectedSubscription?.remove();
  nativeWakeWordDetectedSubscription = null;

  if (!handler || !nativeVoiceActivatorModule) {
    return;
  }

  const eventEmitter = new NativeEventEmitter(
    nativeVoiceActivatorModule as unknown as NativeEventEmitterModule
  );

  nativeWakeWordDetectedSubscription = eventEmitter.addListener(
    NATIVE_WAKE_WORD_DETECTED_EVENT,
    (...args: readonly unknown[]) => {
      const [payload] = args as [WakeWordDetectedEvent];
      handler(payload);
    }
  );
}

export function setRuntimeStatusHandler(
  handler: ((payload: WakeWordStatus) => void) | null
) {
  nativeRuntimeStateSubscription?.remove();
  nativeRuntimeStateSubscription = null;

  if (!handler || !nativeVoiceActivatorModule) {
    return;
  }

  const eventEmitter = new NativeEventEmitter(
    nativeVoiceActivatorModule as unknown as NativeEventEmitterModule
  );

  nativeRuntimeStateSubscription = eventEmitter.addListener(
    NATIVE_RUNTIME_STATE_CHANGED_EVENT,
    (...args: readonly unknown[]) => {
      const [payload] = args as [WakeWordStatus];
      handler(payload);
    }
  );
}

export function setRuntimeErrorHandler(
  handler: ((payload: WakeWordError) => void) | null
) {
  nativeRuntimeErrorSubscription?.remove();
  nativeRuntimeErrorSubscription = null;

  if (!handler || !nativeVoiceActivatorModule) {
    return;
  }

  const eventEmitter = new NativeEventEmitter(
    nativeVoiceActivatorModule as unknown as NativeEventEmitterModule
  );

  nativeRuntimeErrorSubscription = eventEmitter.addListener(
    NATIVE_RUNTIME_ERROR_EVENT,
    (...args: readonly unknown[]) => {
      const [payload] = args as [WakeWordError];
      handler(payload);
    }
  );
}

export function setRuntimeInterruptionHandler(
  handler: ((payload: WakeWordInterruptionEvent) => void) | null
) {
  nativeRuntimeInterruptionSubscription?.remove();
  nativeRuntimeInterruptionSubscription = null;

  if (!handler || !nativeVoiceActivatorModule) {
    return;
  }

  const eventEmitter = new NativeEventEmitter(
    nativeVoiceActivatorModule as unknown as NativeEventEmitterModule
  );

  nativeRuntimeInterruptionSubscription = eventEmitter.addListener(
    NATIVE_RUNTIME_INTERRUPTION_EVENT,
    (...args: readonly unknown[]) => {
      const [payload] = args as [WakeWordInterruptionEvent];
      handler(payload);
    }
  );
}

export function setRuntimeAudioRouteChangedHandler(
  handler: ((payload: WakeWordAudioRouteChangedEvent) => void) | null
) {
  nativeRuntimeAudioRouteChangedSubscription?.remove();
  nativeRuntimeAudioRouteChangedSubscription = null;

  if (!handler || !nativeVoiceActivatorModule) {
    return;
  }

  const eventEmitter = new NativeEventEmitter(
    nativeVoiceActivatorModule as unknown as NativeEventEmitterModule
  );

  nativeRuntimeAudioRouteChangedSubscription = eventEmitter.addListener(
    NATIVE_RUNTIME_AUDIO_ROUTE_CHANGED_EVENT,
    (...args: readonly unknown[]) => {
      const [payload] = args as [WakeWordAudioRouteChangedEvent];
      handler(payload);
    }
  );
}
