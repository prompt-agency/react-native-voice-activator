import NativeVoiceActivator from '../NativeVoiceActivator';
import { NativeEventEmitter, type TurboModule } from 'react-native';

import type { WakeWordDetectedEvent, WakeWordStatus } from '../public/types';
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

export const nativeVoiceActivatorModule =
  NativeVoiceActivator as NativeVoiceActivatorSpec | null;

const localForegroundRuntime = createLocalForegroundRuntime();
let nativeWakeWordDetectedSubscription: { remove(): void } | null = null;

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
