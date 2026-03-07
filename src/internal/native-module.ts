import NativeVoiceActivator from '../NativeVoiceActivator';
import { NativeEventEmitter, type TurboModule } from 'react-native';

import type {
  WakeWordAudioRouteChangedEvent,
  WakeWordDetectedEvent,
  WakeWordError,
  WakeWordInterruptionEvent,
  WakeWordStatus,
} from '../public/types';
import type { WakeWordRuntimeConfiguration } from '../domain/detection-config';
import { createLocalForegroundRuntime } from './local-foreground-runtime';
import type { VoiceActivatorRuntimeBridge } from './runtime-bridge';

export interface NativeVoiceActivatorSpec extends TurboModule {
  initialize?(options: WakeWordRuntimeConfiguration): Promise<void>;
  startDetection?(): Promise<void>;
  stopDetection?(): Promise<void>;
  getStatus?(): ReturnType<VoiceActivatorRuntimeBridge['getStatus']>;
  dispose?(): Promise<void>;
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

const localForegroundRuntime = createLocalForegroundRuntime();
let nativeWakeWordDetectedSubscription: { remove(): void } | null = null;
let nativeRuntimeStateSubscription: { remove(): void } | null = null;
let nativeRuntimeErrorSubscription: { remove(): void } | null = null;
let nativeRuntimeInterruptionSubscription: { remove(): void } | null = null;
let nativeRuntimeAudioRouteChangedSubscription: {
  remove(): void;
} | null = null;

type NativeEventEmitterModule = TurboModule & {
  addListener(eventName: string): void;
  removeListeners(count: number): void;
};

export function getVoiceActivatorRuntimeBridge(): VoiceActivatorRuntimeBridge {
  if (!nativeVoiceActivatorModule) {
    return localForegroundRuntime;
  }

  if (
    nativeVoiceActivatorModule.initialize &&
    nativeVoiceActivatorModule.startDetection &&
    nativeVoiceActivatorModule.stopDetection &&
    nativeVoiceActivatorModule.getStatus &&
    nativeVoiceActivatorModule.dispose
  ) {
    return {
      initialize: nativeVoiceActivatorModule.initialize,
      startDetection: nativeVoiceActivatorModule.startDetection,
      stopDetection: nativeVoiceActivatorModule.stopDetection,
      getStatus: () =>
        nativeVoiceActivatorModule.getStatus!() as WakeWordStatus,
      dispose: nativeVoiceActivatorModule.dispose,
    };
  }

  return {
    async initialize() {
      throw new Error(
        'VoiceActivator native runtime is partially implemented. Complete the native bridge methods before enabling the native path.'
      );
    },
    async startDetection() {
      throw new Error(
        'VoiceActivator native runtime is partially implemented. Complete the native bridge methods before enabling detection.'
      );
    },
    async stopDetection() {
      throw new Error(
        'VoiceActivator native runtime is partially implemented. Complete the native bridge methods before stopping detection through the native path.'
      );
    },
    getStatus() {
      return {
        state: 'unsupported',
        isAvailable: false,
        isListening: false,
        canStart: false,
        reason:
          'VoiceActivator native runtime is partially implemented. The package cannot use the native path until all bridge methods are available.',
        lastError: null,
      };
    },
    async dispose() {
      throw new Error(
        'VoiceActivator native runtime is partially implemented. Complete the native bridge methods before disposing the native path.'
      );
    },
  };
}

export function setWakeWordDetectedHandler(
  handler: ((payload: WakeWordDetectedEvent) => void) | null
) {
  localForegroundRuntime.setWakeWordDetectedHandler(handler);

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
